/**
 * fluxoHelpers.js — funções puras usadas pelo motorFluxo.
 * Extraídas para serem testáveis sem banco/IA. Resolvem mismatches
 * entre o que o editor (PropsPanel) salva e o que o motor lê.
 */

// abrir_chamado: o editor salva cfg.tipo (string), o motor precisa do código SGP.
const TIPO_CHAMADO_SGP = { tecnico: 200, financeiro: 22, comercial: 5 };

export function resolverTipoChamado(cfg = {}) {
  const id = Number(cfg.tipo_id);
  if (Number.isFinite(id) && id > 0) return id;
  return TIPO_CHAMADO_SGP[cfg.tipo] ?? 5;
}

// nps_inline: o editor oferece escala "5" ou "10"; o motor hardcodava 1-10.
// Retorna { valida, porta } respeitando a escala escolhida.
export function avaliarNps(notaRaw, escala) {
  const nota = parseInt(notaRaw, 10);
  if (!Number.isFinite(nota)) return { valida: false };

  if (String(escala) === '5') {
    if (nota < 1 || nota > 5) return { valida: false };
    const porta = nota >= 4 ? 'promotor' : nota === 3 ? 'neutro' : 'detrator';
    return { valida: true, porta };
  }

  // Default: escala 0-10 (NPS clássico)
  if (nota < 0 || nota > 10) return { valida: false };
  const porta = nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator';
  return { valida: true, porta };
}

// ia_responde: o editor salva a instrução extra em cfg.instrucao (o motor lia cfg.prompt).
// Compõe o system prompt na ordem: base + instrução específica + dados do cliente + regras de tool.
export function montarSystemPrompt({ systemBase, instrucao, ctxCliente, regrasTools } = {}) {
  return [
    systemBase || instrucao,
    instrucao && systemBase ? `\nInstrução específica: ${instrucao}` : '',
    ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : '',
    regrasTools || '',
  ].filter(Boolean).join('\n');
}

// enviar_lista: o editor salva cfg.botao / cfg.secao; o motor lia cfg.label_botao / cfg.titulo_secao.
// Lê os nomes do editor com fallback para os antigos (fluxos já salvos).
export function camposLista(cfg = {}) {
  return {
    label_botao:  cfg.botao ?? cfg.label_botao ?? '',
    titulo_secao: cfg.secao ?? cfg.titulo_secao ?? '',
  };
}

/**
 * Agrega respostas de NPS em promotores/neutros/detratores + score.
 *
 * Fonte ÚNICA das faixas: delega a classificação a `avaliarNps`, que conhece a
 * escala de cada resposta. O dashboard antes reimplementava as faixas em SQL
 * com 0-10 fixo, então uma nota 5 numa escala de 5 (nota máxima) era promotora
 * no fluxo e detratora no relatório — todo respondente virava detrator.
 *
 * @param {Array<{nota: number|string, escala?: string|number}>} respostas
 */
export function agregarNps(respostas = []) {
  let promotores = 0, neutros = 0, detratores = 0, total = 0;

  for (const r of respostas) {
    const { valida, porta } = avaliarNps(r?.nota, r?.escala);
    if (!valida) continue;               // nota fora da escala não vira detrator
    total++;
    if      (porta === 'promotor') promotores++;
    else if (porta === 'neutro')   neutros++;
    else                           detratores++;
  }

  // Sem respostas o score é indefinido, não zero — zero significaria
  // "promotores e detratores se anulam", que é uma afirmação diferente.
  const score = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : null;

  return { total, promotores, neutros, detratores, score };
}
