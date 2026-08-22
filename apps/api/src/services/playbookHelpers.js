/**
 * playbookHelpers.js — as decisões PURAS do Playbook Engine (FASE 8).
 *
 * O que este arquivo protege: um playbook é a fonte oficial de COMO se executa
 * um procedimento, e vai virar prompt de IA, painel de copiloto e nota de
 * qualidade. Se a montagem do bloco ou a contagem de etapas estiver errada, o
 * defeito não aparece como exceção — aparece como atendimento ruim, meses
 * depois. Daí tudo aqui ser puro e testado.
 */

/** §64 — rascunho → teste → publicado → arquivado. */
export const STATUS = ['rascunho', 'teste', 'publicado', 'arquivado'];

/**
 * Repare que o estado do meio é `teste`, não `revisão` como no Knowledge:
 * procedimento se valida RODANDO, texto se valida LENDO. Manter as duas
 * máquinas separadas é de propósito — unificá-las obrigaria uma das duas a
 * mentir sobre o que aquele estado significa.
 */
const TRANSICOES = {
  rascunho:  ['teste', 'arquivado'],
  teste:     ['publicado', 'rascunho', 'arquivado'],
  publicado: ['teste', 'arquivado'],
  arquivado: ['rascunho'],
};

export function podeTransicionar(de, para) {
  if (!STATUS.includes(de) || !STATUS.includes(para)) return false;
  return (TRANSICOES[de] || []).includes(para);
}

export function erroTransicao(de, para) {
  if (!STATUS.includes(para)) return `Status inválido: ${para}`;
  if (de === 'rascunho' && para === 'publicado') {
    return 'Rascunho não vai direto para publicado — rode em "teste" primeiro (§64).';
  }
  const opcoes = (TRANSICOES[de] || []).join(', ') || 'nenhum';
  return `Não dá para ir de "${de}" para "${para}". Deste status: ${opcoes}.`;
}

export const OBRIGATORIEDADES = ['obrigatoria', 'opcional', 'condicional'];

/** Ids das etapas já cumpridas, em Set, tolerando formato antigo/sujo. */
function feitasSet(feitas) {
  return new Set((Array.isArray(feitas) ? feitas : [])
    .map(f => (typeof f === 'string' ? f : f?.etapa_id))
    .filter(Boolean));
}

/**
 * Quais etapas uma chamada de tool cumpre.
 *
 * É o coração do rastreamento: em vez de pedir para a IA declarar o que fez —
 * que ela esquece, e que a Quality AI não poderia auditar — a etapa é dada por
 * cumprida quando a tool que a evidencia roda de verdade.
 *
 * Só vale para etapa com `tools`. As conversacionais ("entender necessidade",
 * "tratar objeções") não têm tool que as prove e são marcadas explicitamente.
 */
export function etapasDaTool(etapas, nomeTool) {
  if (!nomeTool) return [];
  return (etapas || []).filter(e => (e.tools || []).includes(nomeTool));
}

/**
 * A próxima etapa a executar: a de menor ordem ainda não cumprida que NÃO é
 * opcional. Opcional não bloqueia o fluxo — se bloqueasse, não seria opcional.
 */
export function proximaEtapa(etapas, feitas) {
  const done = feitasSet(feitas);
  return [...(etapas || [])]
    .sort((a, b) => a.ordem - b.ordem)
    .find(e => !done.has(e.id) && e.obrigatoriedade !== 'opcional') || null;
}

/** Obrigatórias ainda pendentes — é o que impede considerar o procedimento cumprido. */
export function pendentesObrigatorias(etapas, feitas) {
  const done = feitasSet(feitas);
  return (etapas || []).filter(e => e.obrigatoriedade === 'obrigatoria' && !done.has(e.id));
}

/**
 * O procedimento foi cumprido?
 *
 * `condicional` NÃO conta como pendente: ela só existe se a condição ocorrer, e
 * exigi-la sempre transformaria toda exceção em pendência eterna — o "checklist
 * burro" que o §61 proíbe.
 */
export function concluido(etapas, feitas) {
  return pendentesObrigatorias(etapas, feitas).length === 0;
}

const MARCA = { feita: '[x]', pendente: '[ ]' };

/**
 * O bloco que entra no system prompt.
 *
 * Três decisões de redação, todas custosas de descobrir depois:
 *  - as etapas já cumpridas ficam VISÍVEIS e marcadas, em vez de removidas:
 *    sumir com elas faz a IA repetir a pergunta que já fez;
 *  - a próxima etapa é apontada explicitamente — uma lista sem foco vira
 *    "faça tudo de novo";
 *  - as exceções (§61) entram junto, senão o playbook vira checklist burro e a
 *    IA insiste em testar a conexão de um cabo que o cliente já disse estar
 *    rompido.
 */
export function formatarParaPrompt(playbook, etapas, feitas = []) {
  if (!playbook || !etapas?.length) return '';
  const done = feitasSet(feitas);
  const prox = proximaEtapa(etapas, feitas);

  const linhas = [...etapas].sort((a, b) => a.ordem - b.ordem).map(e => {
    const marca = done.has(e.id) ? MARCA.feita : MARCA.pendente;
    const tipo  = e.obrigatoriedade === 'obrigatoria' ? '' : ` (${e.obrigatoriedade})`;
    const cond  = e.obrigatoriedade === 'condicional' && e.condicao ? ` — só se ${e.condicao}` : '';
    const aqui  = prox && e.id === prox.id ? '  ← VOCÊ ESTÁ AQUI' : '';
    return `${marca} ${e.ordem}. ${e.titulo}${tipo}${cond}${aqui}`;
  });

  return [
    `## PROCEDIMENTO OFICIAL: ${playbook.nome}`,
    playbook.objetivo ? `Objetivo: ${playbook.objetivo}` : '',
    '',
    ...linhas,
    '',
    prox ? `Próximo passo: ${prox.titulo}.${prox.descricao ? ` ${prox.descricao}` : ''}` : 'Todas as etapas obrigatórias foram cumpridas.',
    playbook.criterios_transferencia ? `\nTransfira para um humano se: ${playbook.criterios_transferencia}` : '',
    playbook.excecoes ? `\nExceções (pule etapas quando fizer sentido): ${playbook.excecoes}` : '',
    '\nSiga a ordem, mas NÃO anuncie as etapas ao cliente nem numere a conversa — o procedimento é interno.',
  ].filter(l => l !== '').join('\n');
}
