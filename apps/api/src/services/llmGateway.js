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
import { gerar, LLMError } from './llm/index.js';
export { LLMError };

/**
 * Uma passada no modelo. Devolve a resposta no formato de blocos da Anthropic
 * (o adapter traduz quando o provedor é outro) porque o laço agêntico do motor
 * lê `content[]` bloco a bloco. Provedor e modelo vêm de `llm/index.js`:
 * prompt → global (Configurações) → padrão.
 */
export async function generate({
  system, messages, tools = null, provedor = null, modelo = null,
  temperatura = 0.3, maxTokens = 1024,
  // FASE 12: quem chama diz de onde veio, para o custo ter dono.
  conversaId = null, origem = 'gateway', sandbox = false,
} = {}) {
  return gerar({ system, messages, tools, provedor, modelo, temperatura, maxTokens }, { conversaId, origem, sandbox });
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
export async function classify({ texto, opcoes, instrucao = '', provedor = null, modelo = null } = {}) {
  if (!opcoes?.length) throw new LLMError('classify sem opções.');
  const system = [
    instrucao || 'Classifique a mensagem em UMA das categorias.',
    `Responda APENAS com uma destas palavras, sem pontuação nem explicação: ${opcoes.join(', ')}.`,
  ].join('\n');

  const bruto = await generateTexto({
    system, messages: [{ role: 'user', content: String(texto || '') }],
    provedor, modelo, temperatura: 0, maxTokens: 12,
  });

  const limpo = bruto.toLowerCase().replace(/[^a-z_0-9]/g, '');
  return opcoes.find(o => o.toLowerCase() === limpo)
      || opcoes.find(o => limpo.includes(o.toLowerCase()))
      || null;   // null é honesto: o chamador decide o fallback, não este módulo
}
