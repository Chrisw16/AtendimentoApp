/**
 * openai.js — GPT-5 mini fallback
 * Chamado pelo agent.js quando Claude falha (timeout/overload)
 * Loop agentico completo com as mesmas tools do Claude
 */
import { logger } from "./logger.js";

const GPT_MODEL = "gpt-4o-mini";
const GPT_URL   = "https://api.openai.com/v1/chat/completions";

async function getKey() {
  try {
    const { kvGet } = await import("./db.js");
    return (await kvGet("openai_key")) || process.env.OPENAI_API_KEY || "";
  } catch { return process.env.OPENAI_API_KEY || ""; }
}

/** Converte tools Anthropic → OpenAI function_calling */
function toOAITools(anthropicTools = []) {
  return anthropicTools.map(t => ({
    type: "function",
    function: {
      name:        t.name,
      description: t.description || "",
      parameters:  t.input_schema || { type: "object", properties: {} },
    },
  }));
}

/**
 * Executa GPT-5 mini com loop agentico
 * @param {object} opts
 * @param {string} opts.system   - prompt do sistema
 * @param {Array}  opts.messages - histórico Anthropic format
 * @param {Array}  opts.tools    - tools Anthropic format
 * @param {Function} opts.runTool - async (name, input) => result
 * @returns {string|null} resposta final de texto
 */
export async function runOpenAI({ system, messages, tools, runTool }) {
  const apiKey = await getKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

  const oaiTools = toOAITools(tools);

  // Constrói histórico no formato OpenAI
  const oaiMsgs = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      oaiMsgs.push({ role: m.role, content: m.content });
    } else if (Array.isArray(m.content)) {
      // Extrai texto e tool_results
      const texts = m.content.filter(b => b.type === "text").map(b => b.text).join("");
      const toolCalls = m.content.filter(b => b.type === "tool_use").map(b => ({
        id: b.id, type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input || {}) },
      }));
      const toolResults = m.content.filter(b => b.type === "tool_result");
      if (toolCalls.length) {
        oaiMsgs.push({ role: "assistant", content: texts || null, tool_calls: toolCalls });
      }
      for (const tr of toolResults) {
        oaiMsgs.push({ role: "tool", tool_call_id: tr.tool_use_id,
          content: typeof tr.content === "string" ? tr.content : JSON.stringify(tr.content) });
      }
      if (!toolCalls.length && !toolResults.length && texts) {
        oaiMsgs.push({ role: m.role, content: texts });
      }
    }
  }

  let loopCount = 0;
  while (loopCount < 8) {
    loopCount++;

    const res = await fetch(GPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GPT_MODEL, max_tokens: 1024,
        messages: oaiMsgs,
        ...(oaiTools.length ? { tools: oaiTools, tool_choice: "auto" } : {}),
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`OpenAI ${res.status}: ${err.slice(0, 150)}`);
    }

    const data   = await res.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error("OpenAI: resposta vazia");

    const msg = choice.message;
    logger.info(`💰 [GPT-5mini] loop${loopCount} in:${data.usage?.prompt_tokens||0} out:${data.usage?.completion_tokens||0}`);

    // Sem tool_calls → resposta final
    if (!msg.tool_calls || !msg.tool_calls.length) {
      return msg.content || null;
    }

    // Adiciona resposta do assistant ao histórico
    oaiMsgs.push({ role: "assistant", content: msg.content || null, tool_calls: msg.tool_calls });

    // Executa cada tool_call
    for (const tc of msg.tool_calls) {
      let input = {};
      try { input = JSON.parse(tc.function.arguments || "{}"); } catch {}
      logger.info(`🔧 [GPT] ${tc.function.name} | ${JSON.stringify(input).slice(0,120)}`);
      let result = {};
      try { result = await runTool(tc.function.name, input); } catch(e) { result = { erro: e.message }; }
      const resultStr = typeof result === "string" ? result : JSON.stringify(result);
      logger.info(`✅ [GPT] ${tc.function.name}: ${resultStr.slice(0,150)}`);
      oaiMsgs.push({ role: "tool", tool_call_id: tc.id, content: resultStr.slice(0, 8000) });
    }
  }
  return null;
}
