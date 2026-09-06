/**
 * llm/index.js — o funil por onde TODO provedor de IA passa.
 *
 * Espelha `services/canais/`: um registry, um adapter por família, e a decisão
 * de qual usar fica fora dos chamadores. `gerar()` é chamado pelo
 * `llmGateway`, pelo motor e pela supervisora; é aqui que moram a precedência
 * (prompt → global → padrão), a credencial, a telemetria e a normalização de
 * erro — num lugar só, para todos os provedores contarem custo do mesmo jeito.
 *
 * **Falha honesta, sem fallback de provedor.** Decidido com o operador: cair
 * para o Claude em silêncio quando o DeepSeek falhar faria a fatura e a
 * qualidade mudarem sem ninguém saber. O erro sobe normalizado e aparece na
 * tela Saúde do Sistema.
 */
import { getKV } from '../integrations.js';
import { PROVEDORES, PADRAO, provedorDe, resolverModelo } from './llmHelpers.js';
export { PROVEDORES, CATALOGO, PRECOS_REFERENCIA } from './llmHelpers.js';
import * as anthropic from './anthropic.js';
import * as openaiCompat from './openaiCompat.js';

const ADAPTERS = { anthropic, openai_compat: openaiCompat };

/** Erro normalizado: quem chama não precisa saber a forma do erro do SDK. */
export class LLMError extends Error {
  constructor(mensagem, { status = null, causa = null, provedor = null, modelo = null } = {}) {
    super(mensagem);
    this.name = 'LLMError';
    this.status = status; this.causa = causa; this.provedor = provedor; this.modelo = modelo;
  }
}

function normalizarErro(err, { provedor, modelo }) {
  const status = err?.status || err?.response?.status || null;
  const ctx = { status, causa: err, provedor, modelo };
  const nome = PROVEDORES[provedor]?.nome || provedor;
  if (status === 429)  return new LLMError(`Limite de requisições atingido em ${nome}.`, ctx);
  if (status === 401 || status === 403) return new LLMError(`Credencial de ${nome} inválida ou ausente.`, ctx);
  // 404 não é só "modelo não existe": o OpenRouter devolve 404 quando o modelo
  // existe mas NÃO suporta tool calling ("No endpoints found that support tool
  // use"). Sem a mensagem do provedor, "não encontrado" mentiria.
  if (status === 404)  return new LLMError(`${nome} não atende "${modelo}"${err?.message ? `: ${err.message}` : ''}`, ctx);
  if (status === 400)  return new LLMError(`${nome} recusou o pedido para "${modelo}": ${err?.message || 'parâmetro inválido'}`, ctx);
  if (status >= 500)   return new LLMError(`${nome} indisponível.`, ctx);
  return new LLMError(err?.message || `Falha ao chamar ${nome}.`, ctx);
}

/** O par global de Configurações. `getKV` já tem cache de 5 min e decifra. */
export async function configuracaoGlobal() {
  const [provedor, modelo] = await Promise.all([getKV('ia_provedor'), getKV('ia_modelo')]);
  return { provedor: provedor || '', modelo: modelo || '' };
}

/**
 * Decide provedor+modelo para uma chamada. `prompt` é o par que veio de
 * `resolverPrompt` (pode ser vazio); o global vem do banco.
 */
export async function resolver(prompt = {}) {
  return resolverModelo(prompt, await configuracaoGlobal(), PADRAO);
}

/**
 * Uma passada no modelo, em qualquer provedor. Devolve SEMPRE o formato de
 * blocos da Anthropic — é o que o laço agêntico do motor lê.
 *
 * @param params  { system, messages, tools, temperatura, maxTokens, provedor?, modelo? }
 *                `provedor`/`modelo` são o par do PROMPT (override); vazios herdam o global.
 * @param meta    { conversaId, origem, sandbox } — FASE 12: o custo tem dono.
 */
export async function gerar(params = {}, { conversaId = null, origem = 'gateway', sandbox = false } = {}) {
  if (!params.messages?.length) throw new LLMError('Nenhuma mensagem para enviar ao modelo.');

  const { provedor, modelo } = await resolver({ provedor: params.provedor, modelo: params.modelo });
  const def = provedorDe(provedor);
  const adapter = ADAPTERS[def.adapter];

  const inicio = Date.now();
  const anotar = (ok, erro, res) => {
    if (sandbox) return;   // teste de fluxo não é custo real
    import('../telemetria.js').then(({ registrar }) => registrar({
      tipo: 'llm', nome: modelo, origem, conversaId, ok, erro, ms: Date.now() - inicio,
      tokensIn:  res?.usage?.input_tokens  ?? null,
      tokensOut: res?.usage?.output_tokens ?? null,
    })).catch(() => {});
  };

  const apiKey = await getKV(def.chave);
  if (!apiKey) {
    // Registra ANTES de lançar: sem esta linha nenhuma telemetria era gravada e
    // a tela Saúde do Sistema dizia "IA ok" enquanto todo turno caía para humano.
    anotar(false, 'config', null);
    const e = new LLMError(`Chave de ${def.nome} não configurada. Acesse Configurações → Integrações de IA.`, { provedor, modelo, status: 401 });
    // Não em sandbox: o botão "Testar" de Configurações roda em sandbox, e um
    // admin testando uma chave errada não é incidente de operação.
    if (!sandbox) import('../erros.js').then(({ registrar }) => registrar(e, { origem: 'llm' })).catch(() => {});
    throw e;
  }

  try {
    const res = await adapter.chamar(
      { apiKey, baseURL: def.baseURL || null, provedor },
      {
        system: params.system, messages: params.messages, tools: params.tools,
        modelo, temperatura: params.temperatura,
        maxTokens: Number.isFinite(params.maxTokens) ? params.maxTokens : 1024,
      },
    );
    anotar(true, null, res);
    return res;
  } catch (err) {
    const { classificarErro } = await import('../telemetria.js');
    anotar(false, classificarErro(err), null);
    const e = normalizarErro(err, { provedor, modelo });
    // Uma linha, sem prompt nem chave: o suficiente para o operador saber QUAL
    // provedor e QUAL modelo falharam, e de onde a escolha veio.
    // Sem a origem da escolha aqui: o motor passa o par JÁ resolvido, então este
    // ponto sempre veria "prompt" e mentiria. A origem certa está no `[IA]` do motor.
    console.error(`[LLM] ${provedor}/${modelo} falhou: ${e.message}`);
    // E na tela Saúde do Sistema, com dedup por assinatura: a telemetria diz QUE
    // a IA falha; sem isto ninguém saberia POR QUÊ — a mensagem morria no log.
    if (!sandbox) import('../erros.js').then(({ registrar }) => registrar(e, { origem: 'llm' })).catch(() => {});
    throw e;
  }
}
