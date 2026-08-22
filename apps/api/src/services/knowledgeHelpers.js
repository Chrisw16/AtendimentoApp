/**
 * knowledgeHelpers.js — as decisões PURAS do Knowledge Hub (FASE 7).
 *
 * O que mora aqui: o workflow editorial (uma máquina de estados), a validade
 * do artigo, a regra de o que a IA pode enxergar e o corte do trecho enviado
 * a ela. Nada disso toca banco e nada disso pode estar errado em silêncio —
 * daí o teste primeiro.
 *
 * O que NÃO mora aqui, de propósito: a normalização de texto. Ela é feita pelo
 * Postgres (`knowledge_norm()` + dicionário português), porque precisa ser
 * **idêntica** à do índice de busca e porque o stemmer dele acerta o que uma
 * versão em JS erraria — "troco" e "trocar" viram o mesmo radical.
 */

/** §52 — Rascunho → Revisão → Publicado → Arquivado. */
export const STATUS = ['rascunho', 'revisao', 'publicado', 'arquivado'];

/**
 * Transições permitidas. Não é um ciclo livre:
 *  - de `publicado` só se sai para `arquivado` ou de volta para `revisao`
 *    (corrigir algo no ar é um ato editorial, não uma edição solta);
 *  - `arquivado` pode voltar para `rascunho` — desarquivar é recomeçar o
 *    fluxo, e não republicar direto o que foi tirado do ar por algum motivo;
 *  - pular de `rascunho` direto para `publicado` é proibido de propósito: é a
 *    revisão que o §52 existe para impor.
 */
const TRANSICOES = {
  rascunho:  ['revisao', 'arquivado'],
  revisao:   ['publicado', 'rascunho', 'arquivado'],
  publicado: ['revisao', 'arquivado'],
  arquivado: ['rascunho'],
};

export function podeTransicionar(de, para) {
  if (!STATUS.includes(de) || !STATUS.includes(para)) return false;
  return (TRANSICOES[de] || []).includes(para);
}

/** Mensagem de erro que explica o caminho, em vez de só dizer "não". */
export function erroTransicao(de, para) {
  if (!STATUS.includes(para)) return `Status inválido: ${para}`;
  const opcoes = (TRANSICOES[de] || []).join(', ') || 'nenhum';
  if (de === 'rascunho' && para === 'publicado') {
    return 'Rascunho não vai direto para publicado — passe por revisão (§52).';
  }
  return `Não dá para ir de "${de}" para "${para}". Deste status: ${opcoes}.`;
}

/** Publicar cria versão nova; as demais transições, não. */
export function versionaAoEntrar(status) {
  return status === 'publicado';
}

/**
 * Um artigo publicado ainda vale hoje?
 *
 * `valido_ate` vencido NÃO tira o artigo do ar — tirar automaticamente deixaria
 * a IA sem resposta da noite para o dia por causa de uma data que alguém
 * esqueceu de atualizar. Ele é marcado como desatualizado, aparece assim para
 * quem consome, e vira trabalho editorial visível.
 */
export function estaVencido(validoAte, agora = Date.now()) {
  if (!validoAte) return false;
  const t = new Date(validoAte).getTime();
  return Number.isFinite(t) && t < agora;
}

/** §52: só publicado entra na recuperação da IA. */
export function visivelParaIA(artigo) {
  return artigo?.status === 'publicado';
}

/**
 * Corta o trecho do artigo que vai para a IA.
 *
 * Um manual inteiro no prompt gasta a janela e afoga a pergunta; o corte é por
 * PARÁGRAFO para não entregar frase pela metade, e o resumo (quando existe)
 * tem prioridade porque foi escrito para ser lido rápido.
 */
export function trechoParaIA(artigo, limite = 800) {
  const base = [artigo?.resumo, artigo?.conteudo].filter(Boolean).join('\n\n');
  if (base.length <= limite) return base;

  let saida = '';
  for (const par of base.split(/\n{2,}/)) {
    if ((saida + par).length > limite) break;
    saida += (saida ? '\n\n' : '') + par;
  }
  // Parágrafo único gigante: corta na palavra, não no meio dela.
  if (!saida) saida = base.slice(0, limite).replace(/\s+\S*$/, '');
  return saida + ' […]';
}
