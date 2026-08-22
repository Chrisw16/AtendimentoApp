/**
 * llmGateway.js — o único lugar do sistema que fala com um LLM (§76).
 *
 * O valor não é multi-provedor — o plano é explícito que V1.0 segue na
 * Anthropic. O valor é haver **um** ponto onde a chamada acontece: hoje ela
 * está espalhada entre `motorFluxo` (duas vezes) e `supervisoraIA` (duas), cada
 * uma com seu próprio tratamento de erro, seu próprio `max_tokens` e seu
 * próprio silêncio quando falha. Um ponto único é onde cabem retry, contagem de
 * tokens e normalização de erro sem tocar em quatro arquivos.
 *
 * `embed` NÃO existe aqui de propósito. A interface conceitual do §76 lista
 * quatro métodos, mas a Anthropic não oferece embeddings e a FASE 7 decidiu
 * fazer busca com full-text nativo — um método que ninguém implementa e ninguém
 * chama é pior que a ausência dele: parece capacidade e não é.
 */
import { getAnthropicClient } from './integrations.js';

const MODELO_PADRAO = 'claude-haiku-4-5-20251001';

/** Erro normalizado: quem chama não precisa saber a forma do erro do SDK. */
export class LLMError extends Error {
  constructor(mensagem, { status = null, causa = null } = {}) {
    super(mensagem);
    this.name = 'LLMError';
    this.status = status;
    this.causa = causa;
  }
}

function normalizar(err) {
  const status = err?.status || err?.response?.status || null;
  if (status === 429)  return new LLMError('Limite de requisições do provedor atingido.', { status, causa: err });
  if (status === 401)  return new LLMError('Credencial da IA inválida ou ausente.', { status, causa: err });
  if (status >= 500)   return new LLMError('Provedor de IA indisponível.', { status, causa: err });
  return new LLMError(err?.message || 'Falha ao chamar a IA.', { status, causa: err });
}

/**
 * Uma passada no modelo. Devolve a resposta CRUA do provedor porque o laço
 * agêntico do motor lê `content[]` bloco a bloco — embrulhar aqui obrigaria a
 * reescrever o laço, e a regra desta fase é evoluir, não reescrever.
 */
export async function generate({
  system, messages, tools = null, modelo = MODELO_PADRAO,
  temperatura = 0.3, maxTokens = 1024,
} = {}) {
  if (!messages?.length) throw new LLMError('Nenhuma mensagem para enviar ao modelo.');
  const ai = await getAnthropicClient();
  try {
    return await ai.messages.create({
      model: modelo,
      max_tokens: maxTokens,
      temperature: temperatura,
      ...(system ? { system } : {}),
      ...(tools?.length ? { tools } : {}),
      messages,
    });
  } catch (err) {
    throw normalizar(err);
  }
}

/** Só o texto — para quem não quer saber de blocos. */
export async function generateTexto(opts) {
  const res = await generate(opts);
  return (res.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
}

/**
 * Classificação em uma das opções dadas.
 *
 * Força a resposta a ser uma das opções e valida no retorno: modelo pedido para
 * "responda só X ou Y" às vezes responde "acho que X", e um classificador que
 * devolve texto livre contamina tudo que depende dele.
 */
export async function classify({ texto, opcoes, instrucao = '', modelo = MODELO_PADRAO } = {}) {
  if (!opcoes?.length) throw new LLMError('classify sem opções.');
  const system = [
    instrucao || 'Classifique a mensagem em UMA das categorias.',
    `Responda APENAS com uma destas palavras, sem pontuação nem explicação: ${opcoes.join(', ')}.`,
  ].join('\n');

  const bruto = await generateTexto({
    system, messages: [{ role: 'user', content: String(texto || '') }],
    modelo, temperatura: 0, maxTokens: 12,
  });

  const limpo = bruto.toLowerCase().replace(/[^a-z_0-9]/g, '');
  return opcoes.find(o => o.toLowerCase() === limpo)
      || opcoes.find(o => limpo.includes(o.toLowerCase()))
      || null;   // null é honesto: o chamador decide o fallback, não este módulo
}
