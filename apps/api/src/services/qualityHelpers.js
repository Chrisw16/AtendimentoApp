/**
 * qualityHelpers.js — as decisões PURAS da Quality AI (FASE 11).
 *
 * Aqui mora a aritmética que decide a nota de um atendimento humano. Errar isso
 * não estoura: vira injustiça silenciosa numa avaliação de gente, e a pessoa
 * avaliada não tem como conferir a conta. Daí tudo ser puro e testado.
 *
 * A fronteira do §77 continua valendo do outro lado: **o Copiloto ajuda, a
 * Quality AI audita** — e auditoria olha o que foi FEITO, não o que a IA disse
 * ter feito (é por isso que a FASE 8 rastreia etapa por tool executada).
 */

/** Nota máxima quando há violação crítica (§96). Não é subtração — é teto. */
export const TETO_VIOLACAO_CRITICA = 40;

const num = (v, padrao = 0) => (Number.isFinite(Number(v)) ? Number(v) : padrao);

/**
 * §97 — penalização sem justificativa não vale.
 *
 * Uma nota baixa sem evidência é opinião, e opinião não sustenta conversa de
 * feedback com o atendente. Avaliação inválida é DESCARTADA do cálculo em vez
 * de contar como zero: contar como zero puniria o atendente por um defeito do
 * avaliador.
 */
export function avaliacaoValida(av, { notaMaxima = 10 } = {}) {
  if (!av || typeof av !== 'object') return false;
  const nota = Number(av.nota);
  if (!Number.isFinite(nota) || nota < 0 || nota > notaMaxima) return false;
  // Só exige justificativa quando penaliza — elogio sem texto é aceitável.
  if (nota < notaMaxima && !String(av.justificativa || '').trim()) return false;
  return true;
}

/**
 * Média PONDERADA dos critérios, normalizada em 0-100.
 *
 * Critério sem avaliação válida sai da conta (numerador **e** denominador). Se
 * o avaliador não conseguiu julgar "tratamento de objeções" numa conversa que
 * não teve objeção nenhuma, esse critério não pode arrastar a nota para baixo.
 */
export function calcularScore(criterios = [], avaliacoes = [], { notaMaxima = 10 } = {}) {
  const porId = new Map(avaliacoes.filter(a => avaliacaoValida(a, { notaMaxima })).map(a => [a.criterio_id, a]));

  let soma = 0, pesos = 0;
  for (const c of criterios) {
    const av = porId.get(c.id);
    if (!av) continue;
    const peso = Math.max(0, num(c.peso, 1));
    soma  += (num(av.nota) / notaMaxima) * peso;
    pesos += peso;
  }
  if (!pesos) return null;   // null = "não avaliado", que é diferente de zero
  return Math.round((soma / pesos) * 100);
}

/**
 * §96 — violação crítica é MECANISMO SEPARADO, não desconto de pontos.
 *
 * Prometer visita que não existe ou informar preço divergente da fonte oficial
 * não é "perder alguns pontos de tom": é um atendimento que não pode ser
 * classificado como bom, por melhor que tenha sido o resto. Por isso teto, e
 * não subtração — subtrair deixaria um atendimento excelente com violação
 * grave ainda passando com nota alta.
 */
export function aplicarViolacoes(score, violacoes = []) {
  const criticas = (violacoes || []).filter(v => v?.critico !== false);
  if (!criticas.length || score === null) return score;
  return Math.min(score, TETO_VIOLACAO_CRITICA);
}

/**
 * §95 — playbook esperado × executado, com exceção justificada (§61).
 *
 * A etapa pulada só conta contra quando NÃO houver justificativa aceita: o
 * playbook não é checklist burro, e punir quem pulou o teste remoto de um cabo
 * comprovadamente rompido ensinaria o atendente a seguir o roteiro contra o
 * bom senso.
 */
export function aderenciaPlaybook(etapas = [], feitas = [], excecoes = []) {
  const done = new Set((Array.isArray(feitas) ? feitas : [])
    .map(f => (typeof f === 'string' ? f : f?.etapa_id)).filter(Boolean));
  const justificadas = new Set((excecoes || []).map(e => e?.etapa_id || e).filter(Boolean));

  const obrigatorias = etapas.filter(e => e.obrigatoriedade === 'obrigatoria');
  if (!obrigatorias.length) return null;

  const cumpridas = obrigatorias.filter(e => done.has(e.id));
  const puladas   = obrigatorias.filter(e => !done.has(e.id) && !justificadas.has(e.id));
  const perdoadas = obrigatorias.filter(e => !done.has(e.id) && justificadas.has(e.id));

  const base = obrigatorias.length - perdoadas.length;
  return {
    total: obrigatorias.length,
    cumpridas: cumpridas.length,
    puladas: puladas.map(e => ({ id: e.id, titulo: e.titulo })),
    justificadas: perdoadas.map(e => ({ id: e.id, titulo: e.titulo })),
    percentual: base ? Math.round((cumpridas.length / base) * 100) : 100,
  };
}

/**
 * §98 — o humano manda, mas o que a IA achou não some.
 *
 * A divergência entre `ai_score` e `human_score` é o dado mais valioso da
 * fase: é ele que diz se o scorecard está mal escrito.
 */
export function scoreFinal({ ai = null, humano = null } = {}) {
  const h = humano === null || humano === undefined ? null : num(humano, null);
  return {
    ai_score: ai === null || ai === undefined ? null : num(ai, null),
    human_score: h,
    final_score: h !== null ? h : (ai ?? null),
    divergencia: h !== null && ai !== null && ai !== undefined ? h - num(ai) : null,
  };
}

/**
 * §99 — coaching por PADRÃO, não por ranking.
 *
 * O plano é explícito: "evitar ranking simplista como única forma de gestão".
 * O que sai daqui é o critério que mais aparece penalizado nas auditorias do
 * agente — isso vira conversa de desenvolvimento; uma posição numa lista, não.
 */
export function padroesRecorrentes(auditorias = [], { minimo = 2, notaMaxima = 10 } = {}) {
  const contagem = new Map();
  const notas = [];

  for (const a of auditorias) {
    if (Number.isFinite(Number(a?.final_score))) notas.push(Number(a.final_score));
    for (const av of a?.avaliacoes || []) {
      if (!avaliacaoValida(av, { notaMaxima })) continue;
      if (Number(av.nota) >= notaMaxima * 0.7) continue;    // só o que ficou abaixo
      const atual = contagem.get(av.criterio_id) || { criterio_id: av.criterio_id, nome: av.nome || av.criterio_id, ocorrencias: 0, exemplos: [] };
      atual.ocorrencias++;
      if (atual.exemplos.length < 3 && av.justificativa) atual.exemplos.push(av.justificativa);
      contagem.set(av.criterio_id, atual);
    }
  }

  const fracos = [...contagem.values()].filter(c => c.ocorrencias >= minimo)
    .sort((a, b) => b.ocorrencias - a.ocorrencias);

  return {
    auditorias: auditorias.length,
    media: notas.length ? Math.round(notas.reduce((s, n) => s + n, 0) / notas.length) : null,
    pontos_de_melhoria: fracos,
    // Sem padrão recorrente não se inventa "ponto de melhoria": um tropeço
    // isolado é um tropeço, não um padrão.
    tem_padrao: fracos.length > 0,
  };
}
