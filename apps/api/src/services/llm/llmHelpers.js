/**
 * llmHelpers.js — as decisões puras da camada de provedores de IA.
 *
 * Por que existe: o produto tinha SEIS pontos falando com o modelo, todos em
 * Anthropic. O operador quer trocar qualidade por preço em Configurações. A
 * decisão central: **a língua franca interna continua sendo o formato de
 * blocos da Anthropic** (`stop_reason`, `content[]` com `text`/`tool_use`,
 * `tool_result`), porque o laço agêntico do motor já o lê bloco a bloco e é o
 * coração do produto. Os adapters traduzem nas duas pontas; o motor não muda.
 *
 * Tudo aqui é puro e testado: tradução ida e volta, precedência e catálogo.
 * `motorFluxo.js` não é importável em teste, e um erro de tradução aqui não
 * estoura — vira uma tool chamada com argumentos errados, em silêncio.
 */

// ── PROVEDORES ────────────────────────────────────────────────────
//
// UM adapter OpenAI-compatible cobre cinco provedores: o que muda é a baseURL
// e a chave. DeepSeek, Gemini (`/v1beta/openai/`), Groq e OpenRouter expõem o
// mesmo contrato `chat.completions`. Cinco adapters seriam cinco cópias da
// mesma tradução — e o repositório já pagou caro por cópias que divergem.
//
// Ordem importa para a tela: os dois primeiros são os de tool calling maduro.
export const PROVEDORES = {
  anthropic:  { nome: 'Anthropic — Claude', adapter: 'anthropic',     chave: 'anthropic_api_key' },
  // `maxTokensParam`: a OpenAI deprecou `max_tokens` e os GPT-5.x devolvem 400
  // com ele — exigem `max_completion_tokens`. O DeepSeek só documenta
  // `max_tokens`. Groq e OpenRouter aceitam os dois. Verificado nas docs em
  // 2026-09-06; é por isso que é um campo por provedor e não uma constante.
  openai:     { nome: 'OpenAI — GPT',        adapter: 'openai_compat', chave: 'openai_api_key',     baseURL: null, maxTokensParam: 'max_completion_tokens' },
  // DeepSeek V4 nasce com thinking LIGADO (effort high): custa latência e output
  // num atendimento de WhatsApp. Desligado por padrão aqui; quem quiser liga no
  // modelo `-pro` com outro corpo.
  deepseek:   { nome: 'DeepSeek',            adapter: 'openai_compat', chave: 'deepseek_api_key',   baseURL: 'https://api.deepseek.com', maxTokensParam: 'max_tokens', extraBody: { thinking: { type: 'disabled' } } },
  gemini:     { nome: 'Google — Gemini',     adapter: 'openai_compat', chave: 'gemini_api_key',     baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', maxTokensParam: 'max_tokens' },
  groq:       { nome: 'Groq',                adapter: 'openai_compat', chave: 'groq_api_key',       baseURL: 'https://api.groq.com/openai/v1', maxTokensParam: 'max_completion_tokens' },
  openrouter: { nome: 'OpenRouter',          adapter: 'openai_compat', chave: 'openrouter_api_key', baseURL: 'https://openrouter.ai/api/v1', maxTokensParam: 'max_tokens' },
};

// ── CATÁLOGO DE MODELOS ───────────────────────────────────────────
//
// Sugestões, não lista fechada: o campo da tela é texto livre, porque provedor
// lança modelo toda semana e o operador não pode depender de deploy. O que
// está aqui foi VERIFICADO nas docs oficiais em 2026-09-06 — id, preço (USD por
// milhão de tokens, entrada/saída) e as restrições que quebram em produção:
//
// - `semTemperatura`: o modelo devolve 400 para `temperature` ≠ padrão
//   (Anthropic 4.7+/5, GPT-5.x com raciocínio). O adapter OMITE o campo.
// - `reasoningNone`: GPT-5.4+ só aceita `tools` em Chat Completions com
//   `reasoning_effort: 'none'` — e o 5.6 nasce em `medium`, então mandar
//   `tools` já basta para o 400. O adapter manda `none`.
//
// ⚠️ Preços têm data. Gemini 3.x dobra em 01/01/2027; DeepSeek varia 2x entre
// pico e fora de pico (o expediente do Brasil cai fora); OpenRouter varia pelo
// provedor roteado. `PRECOS_REFERENCIA` vai junto para a tela dizer "de quando".
// ⚠️ Retirados (NÃO estão aqui de propósito): `deepseek-chat`/`deepseek-reasoner`
// (24/07/2026), os Llama e Qwen do Groq (16/08/2026), Opus 4.1, Sonnet 4.
// ⚠️ `claude-haiku-4-5-20251001` pode ser aposentado a partir de 15/10/2026
// (política: 60 dias de aviso). Plano B: `claude-sonnet-5` — que NÃO aceita
// `temperature`.
export const PRECOS_REFERENCIA = '2026-09-06';

export const CATALOGO = {
  anthropic: [
    { id: 'claude-haiku-4-5-20251001', nome: 'Claude Haiku 4.5',  preco: { in: 1.00, out: 5.00 },  nota: 'O padrão do produto. Único da linha atual que aceita temperatura. 200K de contexto.' },
    { id: 'claude-sonnet-5',           nome: 'Claude Sonnet 5',   preco: { in: 2.00, out: 10.00 }, nota: 'Equilíbrio. Não aceita temperatura.', semTemperatura: true },
    // Fable 5.1 NÃO está aqui de propósito: thinking sempre ligado (consome o
    // orçamento de tokens antes do texto), US$ 10/50 por milhão, e recusa
    // `tool_choice` — é modelo de pesquisa, não de WhatsApp de ISP.
    { id: 'claude-opus-5',             nome: 'Claude Opus 5',     preco: { in: 5.00, out: 25.00 }, nota: 'Mais forte. Thinking ligado por padrão: o adapter dá 4x mais orçamento de tokens, senão o raciocínio consome tudo e o cliente fica sem resposta. Não aceita temperatura.', semTemperatura: true, thinking: true },
  ],
  openai: [
    { id: 'gpt-5.4-mini',  nome: 'GPT-5.4 mini',  preco: { in: 0.75, out: 4.50 },  nota: 'Bom em tool calling; já nasce sem raciocínio.', reasoningNone: true, semTemperatura: true },
    { id: 'gpt-4.1-mini',  nome: 'GPT-4.1 mini',  preco: { in: 0.40, out: 1.60 },  nota: 'Sem raciocínio: aceita temperatura e max_tokens. 1M de contexto.' },
    { id: 'gpt-5.6-terra', nome: 'GPT-5.6 Terra', preco: { in: 2.00, out: 12.00 }, nota: 'Só funciona com tools desligando o raciocínio (o adapter faz). Paga preço de raciocínio sem usá-lo.', reasoningNone: true, semTemperatura: true },
    { id: 'gpt-4.1',       nome: 'GPT-4.1',       preco: { in: 2.00, out: 8.00 },  nota: 'Sem raciocínio, maduro em function calling.' },
  ],
  deepseek: [
    { id: 'deepseek-v4-flash', nome: 'DeepSeek V4 Flash', preco: { in: 0.22, out: 0.66 }, nota: 'Muito barato (fora de pico; pico = 2x). Tool calling forte para o preço. Thinking desligado pelo adapter.' },
    { id: 'deepseek-v4-pro',   nome: 'DeepSeek V4 Pro',   preco: { in: 0.66, out: 1.98 }, nota: 'Mais forte da casa. Mesmas ressalvas de pico.' },
  ],
  gemini: [
    { id: 'gemini-3.5-flash-lite', nome: 'Gemini 3.5 Flash-Lite', preco: { in: 0.30, out: 2.50 }, nota: 'Endpoint compatível está em BETA declarada pelo Google. tool_choice só automático.' },
    { id: 'gemini-2.5-flash-lite', nome: 'Gemini 2.5 Flash-Lite', preco: { in: 0.10, out: 0.40 }, nota: 'O mais barato. Conhecimento de jan/2025.' },
    { id: 'gemini-3.8-flash',      nome: 'Gemini 3.8 Flash',      preco: { in: 0.75, out: 3.75 }, nota: 'Melhor da série. Preço DOBRA em 01/01/2027.' },
  ],
  groq: [
    { id: 'openai/gpt-oss-120b', nome: 'GPT-OSS 120B (Groq)', preco: { in: 0.15, out: 0.60 }, nota: 'Rápido e barato. NÃO faz tool calls paralelas. Os Llama e Qwen do Groq foram retirados em 08/2026.' },
    { id: 'openai/gpt-oss-20b',  nome: 'GPT-OSS 20B (Groq)',  preco: { in: 0.075, out: 0.30 }, nota: 'Menor; mesma ressalva de paralelismo. 131K de contexto.' },
  ],
  openrouter: [
    { id: 'z-ai/glm-5.2:free',                nome: 'GLM 5.2 (grátis)',     preco: { in: 0, out: 0 },       nota: 'GRÁTIS: 50 requisições/dia sem créditos (1.000 com US$10). Não sustenta atendimento; serve para testar. Seus dados podem ser usados para treino.' },
    { id: 'minimax/minimax-m3:free',          nome: 'MiniMax M3 (grátis)',  preco: { in: 0, out: 0 },       nota: 'GRÁTIS, mesmas ressalvas. 1M de contexto.' },
    { id: 'qwen/qwen3.7-flash',               nome: 'Qwen 3.7 Flash',       preco: { in: 0.03, out: 0.13 }, nota: 'Quase grátis, pago. Preço varia pelo provedor roteado.' },
    { id: 'meta-llama/llama-3.3-70b-instruct', nome: 'Llama 3.3 70B',       preco: { in: 0.10, out: 0.32 }, nota: 'O Llama que sobrou com tool calling. Preço varia pelo provedor roteado.' },
  ],
};

/**
 * As restrições do modelo. Para a Anthropic a regra é por FAMÍLIA, não por
 * catálogo: a doc oficial diz que modelos lançados depois do Opus 4.6 recusam
 * `temperature` com 400 — então um `claude-opus-4-8` digitado à mão, fora do
 * catálogo, quebraria 100% dos turnos. Só Haiku 4.5, Sonnet 4.6, Opus 4.6 e
 * anteriores aceitam. Modelo desconhecido de OUTRO provedor não ganha
 * restrição (o 400 do provedor é honesto e a mensagem dele entra no erro).
 */
const ANTHROPIC_ACEITA_TEMPERATURA = /claude-(haiku-4-5|sonnet-4-6|opus-4-6|sonnet-4-5|opus-4-5|opus-4-1|sonnet-4-|opus-4-2|3-)/;

export function flagsDoModelo(provedor, modelo) {
  const m = (CATALOGO[provedor] || []).find(x => x.id === modelo);
  const semTemperatura = provedor === 'anthropic'
    ? !ANTHROPIC_ACEITA_TEMPERATURA.test(String(modelo || ''))
    : !!m?.semTemperatura;
  return { semTemperatura, reasoningNone: !!m?.reasoningNone, thinking: !!m?.thinking };
}

export function provedorDe(id) {
  return (id && Object.prototype.hasOwnProperty.call(PROVEDORES, id)) ? PROVEDORES[id] : null;
}

/** O que vale quando ninguém configurou nada — é o que roda em produção hoje. */
export const PADRAO = Object.freeze({ provedor: 'anthropic', modelo: 'claude-haiku-4-5-20251001' });

// ── PRECEDÊNCIA ───────────────────────────────────────────────────

/** Um par (provedor, modelo) só vale se vier COMPLETO e o provedor existir. */
function parValido(p) {
  const provedor = String(p?.provedor || '').trim();
  const modelo   = String(p?.modelo   || '').trim();
  return provedor && modelo && provedorDe(provedor) ? { provedor, modelo } : null;
}

/**
 * prompt (tela Prompts IA) → global (Configurações) → padrão do código.
 *
 * `||` para string: vazio é ausência, herda. Duas regras não-óbvias:
 *
 * - **Par INCOERENTE herda os dois.** Só provedor, ou só modelo, não é meio
 *   override: provedor de um lugar com modelo de outro é chamar a OpenAI com
 *   `claude-haiku`.
 * - **Valor gravado É escolha, sem caso especial.** A primeira versão tinha a
 *   regra "par igual ao padrão não conta", para contornar o fato de a 005 ter
 *   gravado `anthropic`/`claude-haiku-4-5` em todas as linhas. A revisão
 *   mostrou o preço: operador com o global em DeepSeek que crava Haiku só no
 *   `suporte` (que chama SGP) veria a tela dizer "🟣 Haiku" e o motor usar
 *   DeepSeek — a família do `agentes.permissoes`. Quem resolve o legado é a
 *   **migration 031**, que anula o par do seed e tira o default das colunas;
 *   e a 005 sempre precede a 031 no mesmo boot, então instalação nova também
 *   nasce com NULL. NULL = herança; valor = escolha.
 */
export function resolverModelo(prompt, global, padrao = PADRAO) {
  const doPrompt = parValido(prompt);
  if (doPrompt) return { ...doPrompt, origem: 'prompt' };
  const doGlobal = parValido(global);
  if (doGlobal) return { ...doGlobal, origem: 'global' };
  return { provedor: padrao.provedor, modelo: padrao.modelo, origem: 'padrao' };
}

// ── TRADUÇÃO: Anthropic (interno) → OpenAI-compat ─────────────────

/** `tool_result.content` pode ser string ou array de blocos de texto. */
function textoDe(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map(b => (typeof b === 'string' ? b : b?.text ?? '')).filter(Boolean).join('\n');
  }
  return JSON.stringify(content);
}

/**
 * ⚠️ Nunca RECONSTRUA a mensagem do assistant quando o provedor a devolveu.
 * O Gemini 3 põe `thought_signature` dentro de `tool_calls` e o DeepSeek põe
 * `reasoning_content` na mensagem — campos que o SDK não tipa e que PRECISAM
 * voltar no turno seguinte, senão 400 ("Function call is missing a thought
 * signature"). `deOpenAI` guarda a mensagem crua no array de blocos, num campo
 * não-enumerável que sobrevive ao `{role:'assistant', content: res.content}`
 * do motor. Se ela está lá, é ela que vai — byte a byte.
 */
export const RAW = Symbol('compatRaw');

function traduzirMensagem(m) {
  const saida = [];
  if (!Array.isArray(m.content)) {
    saida.push({ role: m.role, content: textoDe(m.content) });
    return saida;
  }

  if (m.role === 'assistant') {
    if (m.content[RAW]) { saida.push(m.content[RAW]); return saida; }
    const texto = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const toolCalls = m.content.filter(b => b.type === 'tool_use').map(b => ({
      id: b.id, type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
    // `content: null` quando só há tool_calls — string vazia é recusada por
    // alguns provedores compat quando acompanha tool_calls.
    const msg = { role: 'assistant', content: texto || null };
    if (toolCalls.length) msg.tool_calls = toolCalls;
    saida.push(msg);
    return saida;
  }

  // user: os tool_result viram UM `role:'tool'` cada, e a OpenAI exige que
  // venham IMEDIATAMENTE depois do assistant que os pediu — por isso primeiro.
  for (const b of m.content) {
    if (b.type === 'tool_result') {
      saida.push({ role: 'tool', tool_call_id: b.tool_use_id, content: textoDe(b.content) });
    }
  }
  const textos = m.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (textos) saida.push({ role: 'user', content: textos });
  return saida;
}

/**
 * O pedido que o motor monta (formato Anthropic) → corpo de `chat.completions`.
 * `provedor` decide o nome do parâmetro de max tokens e o corpo extra; o
 * catálogo decide se `temperature` e `reasoning_effort` entram.
 */
export function paraOpenAI({ system, messages = [], tools = [], modelo, temperatura, maxTokens, provedor = 'openai' } = {}) {
  const def   = PROVEDORES[provedor] || {};
  const flags = flagsDoModelo(provedor, modelo);

  const out = [];
  if (system) out.push({ role: 'system', content: String(system) });
  for (const m of messages) out.push(...traduzirMensagem(m));

  const corpo = { model: modelo, messages: out, ...(def.extraBody || {}) };
  if (Number.isFinite(maxTokens)) corpo[def.maxTokensParam || 'max_tokens'] = maxTokens;
  // `temperature` só quando há valor E o modelo aceita: modelos de raciocínio
  // devolvem 400 para qualquer valor ≠ 1, e `null` no corpo é campo presente.
  if (Number.isFinite(temperatura) && !flags.semTemperatura) corpo.temperature = temperatura;
  if (tools?.length) {
    corpo.tools = tools.map(t => {
      const fn = { name: t.name, description: t.description };
      // Sem `parameters` quando o schema não tem propriedades: a OpenAI aceita
      // function sem parameters, e o Gemini recusa `type:'object'` com
      // `properties:{}` — três tools do produto são assim (`status_rede`,
      // `consultar_manutencao`, `listar_vencimentos`).
      const props = t.input_schema?.properties;
      if (props && Object.keys(props).length) fn.parameters = t.input_schema;
      return { type: 'function', function: fn };
    });
    // GPT-5.4+ só aceita tools em Chat Completions com raciocínio desligado — e
    // o 5.6 nasce em `medium`, então mandar `tools` já basta para o 400.
    if (flags.reasoningNone) corpo.reasoning_effort = 'none';
  }
  return corpo;
}

// ── TRADUÇÃO: OpenAI-compat → Anthropic (interno) ─────────────────

const STOP = { stop: 'end_turn', tool_calls: 'tool_use', length: 'max_tokens' };

/**
 * ⚠️ `arguments` chega como STRING JSON, e modelo pequeno manda quebrado.
 * Um throw aqui derruba o turno; `{}` faz o `executarTool` responder o que
 * responderia a uma chamada sem argumentos, e o modelo tenta de novo.
 */
function parseArgs(s) {
  if (s == null || s === '') return {};
  if (typeof s === 'object') return s;
  try { const v = JSON.parse(s); return v && typeof v === 'object' ? v : {}; }
  catch { return {}; }
}

/**
 * A resposta de `chat.completions` → o que o laço do motor lê:
 * `{ stop_reason, content: [{type:'text'}|{type:'tool_use'}], usage }`.
 */
export function deOpenAI(res) {
  const escolha = res?.choices?.[0];
  if (!escolha) throw new Error('Resposta do provedor sem choices.');
  // O OpenRouter devolve HTTP 200 com o erro DENTRO do corpo. Checar só o
  // status deixaria a conversa muda.
  if (escolha.error) {
    const e = new Error(escolha.error.message || 'Erro devolvido pelo provedor.');
    e.status = escolha.error.code || 502;
    throw e;
  }
  const msg = escolha.message || {};

  const content = [];
  const texto = typeof msg.content === 'string' ? msg.content : textoDe(msg.content);
  if (texto) content.push({ type: 'text', text: texto });
  for (const tc of msg.tool_calls || []) {
    content.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input: parseArgs(tc.function?.arguments) });
  }

  const temTool = content.some(b => b.type === 'tool_use');
  // `finish_reason: 'tool_calls'` sem tool_calls no corpo acontece — e o motor
  // entraria no ramo de tool sem tool nenhuma para executar.
  let stop = STOP[escolha.finish_reason] || 'end_turn';
  if (stop === 'tool_use' && !temTool) stop = 'end_turn';
  if (stop !== 'tool_use' && temTool) stop = 'tool_use';

  // A mensagem CRUA viaja com os blocos, não-enumerável: é o que `paraOpenAI`
  // ecoa no turno seguinte (Gemini `thought_signature`, DeepSeek
  // `reasoning_content`). Não-enumerável para não vazar em JSON nem em logs.
  Object.defineProperty(content, RAW, { value: msg, enumerable: false });

  const u = res.usage || {};
  return {
    stop_reason: stop,
    content,
    // null e não 0: zero diria "custou nada", null diz "não sei".
    usage: {
      input_tokens:  Number.isFinite(u.prompt_tokens)     ? u.prompt_tokens     : null,
      output_tokens: Number.isFinite(u.completion_tokens) ? u.completion_tokens : null,
    },
  };
}
