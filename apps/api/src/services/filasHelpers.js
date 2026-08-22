/**
 * filasHelpers.js — as decisões PURAS das filas de atendimento (FASE 5).
 *
 * Mesma razão de ser do `politicaRetry.js`: `motorFluxo.js` e as rotas não são
 * importáveis em teste (puxam knex no topo), então a regra mora aqui e os dois
 * lados chamam. Três regras não-óbvias vivem neste arquivo:
 *
 *  - `dentroDoHorario` é a MESMA função que o motor usava embutida em
 *    `verificarHorario` (KV global). A fila pode ter horário próprio; quando
 *    não tem (`null`), herda o global — por isso a função aceita os dois e
 *    `null` significa "sem restrição", nunca "fechado".
 *  - `conversaVisivel` preserva o comportamento de HOJE por construção: quem
 *    não está em fila nenhuma continua vendo tudo. Sem isso, a migration
 *    esvaziaria a tela de todo agente até alguém montar as filas.
 *  - `podeAssumir` trata capacidade <= 0 como ILIMITADA. É o default de quem
 *    nunca configurou nada.
 */

export const SLA_PADRAO = { atencao_min: 5, critico_min: 15 };

function num(v, padrao) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : padrao;
}

function objeto(v) {
  if (!v) return null;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return null; } }
  return typeof v === 'object' ? v : null;
}

/**
 * @param {object|string|null} horario  {ativo, dias:[0-6], inicio:'HH:MM', fim:'HH:MM'}
 * @param {number} agora  epoch ms (injetável para teste)
 *
 * ponytail: usa o fuso do servidor e não cruza a meia-noite (fim < inicio nunca
 * casa) — é exatamente o que o motor já fazia. Fuso por fila entra quando
 * houver revenda fora do horário de Brasília.
 */
export function dentroDoHorario(horario, agora = Date.now()) {
  const h = objeto(horario);
  if (!h?.ativo) return true;
  const d    = new Date(agora);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const dias = Array.isArray(h.dias) ? h.dias : [];
  return dias.includes(d.getDay()) && hhmm >= (h.inicio || '08:00') && hhmm <= (h.fim || '18:00');
}

/**
 * Nível de urgência de quem está esperando. Generaliza o `calcularUrgencia`
 * antigo, que trazia 5/15 min cravados no código — agora vêm da fila.
 */
export function nivelUrgencia(aguardandoDesde, prioridade = 0, sla = null, agora = Date.now()) {
  if (!aguardandoDesde) return { nivel: 'ia', minutos: 0, segundos: 0 };
  const t = new Date(aguardandoDesde).getTime();
  if (!Number.isFinite(t)) return { nivel: 'ia', minutos: 0, segundos: 0 };

  const segundos = Math.max(0, Math.floor((agora - t) / 1000));
  const minutos  = Math.floor(segundos / 60);
  const critico  = num(sla?.critico_min, SLA_PADRAO.critico_min);
  const atencao  = num(sla?.atencao_min, SLA_PADRAO.atencao_min);

  if (prioridade >= 2 || minutos >= critico) return { nivel: 'critico', minutos, segundos };
  if (prioridade >= 1 || minutos >= atencao) return { nivel: 'atencao', minutos, segundos };
  return { nivel: 'ok', minutos, segundos };
}

/** Capacidade simultânea. <= 0, nulo ou lixo = ilimitado. */
export function podeAssumir(capacidade, ativas = 0) {
  const cap = Number(capacidade);
  if (!Number.isFinite(cap) || cap <= 0) return true;
  return Number(ativas) < cap;
}

/**
 * O agente enxerga esta conversa?
 *
 * admin vê tudo · conversa sem fila é de todo mundo (é o que existe hoje) ·
 * agente sem fila nenhuma segue vendo tudo (compatibilidade) · com filas, só
 * as suas.
 */
export function conversaVisivel(conversa, agente) {
  if (!agente) return false;
  if (agente.role === 'admin') return true;
  const filas = Array.isArray(agente.filaIds) ? agente.filaIds : [];
  if (!filas.length) return true;
  if (!conversa?.fila_id) return true;
  return filas.includes(conversa.fila_id);
}
