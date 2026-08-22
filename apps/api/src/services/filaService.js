/**
 * filaService.js — fila de atendimento HUMANO: SLA, urgência, assunção.
 *
 * ⚠️ Nada a ver com `/api/filas` (inbox/outbox/jobs, FASE 4). Aqui é gente.
 *
 * FASE 5: as faixas de SLA deixaram de ser cravadas aqui — vêm da fila
 * (`filas.sla_*`), com estes valores como fallback de quem não tem fila. A
 * decisão em si mora em `filasHelpers.js`, que é puro e testável.
 */
import { getDb }   from '../config/db.js';
import { broadcast } from './sseManager.js';
import { nivelUrgencia, podeAssumir, SLA_PADRAO } from './filasHelpers.js';

const SLA_DEFAULT = {
  ...SLA_PADRAO,
  notif_cliente: true,
  palavras_criticas: [
    'cancelar', 'cancelamento', 'procon', 'advogado', 'absurdo',
    'inaceitável', 'processo', 'reclamação', 'reclame aqui', 'anatel',
    'horrível', 'vergonha', 'fraude',
  ],
};

/** @param {object} [sla] {atencao_min, critico_min} da fila; ausente = padrão. */
export function calcularUrgencia(aguardandoDesde, prioridade = 0, sla = null) {
  return nivelUrgencia(aguardandoDesde, prioridade, sla);
}

export function detectarPalavrasCriticas(texto) {
  const lower = (texto || '').toLowerCase();
  return SLA_DEFAULT.palavras_criticas.filter(p => lower.includes(p));
}

export async function marcarAguardando(convId, prioridade = 0) {
  const db = getDb();
  await db('conversas')
    .where({ id: convId })
    .update({ aguardando_desde: db.fn.now(), prioridade, status: 'aguardando', atualizado: db.fn.now() });
}

export async function limparAguardando(convId) {
  await getDb()('conversas').where({ id: convId }).update({ aguardando_desde: null });
}

export async function getPosicaoNaFila(convId) {
  const db = getDb();
  const rows = await db('conversas')
    .where({ status: 'aguardando' }).whereNotNull('aguardando_desde')
    .orderBy([{ column: 'prioridade', order: 'desc' }, { column: 'aguardando_desde', order: 'asc' }])
    .select('id');
  const idx = rows.findIndex(r => r.id === convId);
  return idx === -1 ? null : idx + 1;
}

export async function getTotalNaFila() {
  const db = getDb();
  const r = await db('conversas').where({ status: 'aguardando' }).count('id as n').first();
  return parseInt(r?.n) || 0;
}

export async function getTempoMedioEspera() {
  const db = getDb();
  const r = await db('conversas')
    .where({ status: 'ativa' }).whereNotNull('aguardando_desde')
    .whereRaw(`atualizado > NOW() - INTERVAL '2 hours'`)
    .avg(db.raw(`EXTRACT(EPOCH FROM (atualizado - aguardando_desde)) as media_segs`))
    .first().catch(() => null);
  return Math.round(r?.media_segs || 0);
}


// ── FILAS (FASE 5) ────────────────────────────────────────────────

/** Ids das filas de que o agente participa. Vazio = vê tudo (ver filasHelpers). */
export async function filasDoAgente(agenteId) {
  const rows = await getDb()('agentes_filas').where({ agente_id: agenteId }).select('fila_id');
  return rows.map(r => r.fila_id);
}

/** Conversas humanas em curso do agente — o que a capacidade limita. */
export async function contarAtivas(agenteId) {
  const r = await getDb()('conversas').where({ agente_id: agenteId, status: 'ativa' }).count('id as n').first();
  return Number(r?.n) || 0;
}

/**
 * "Assumir próximo": pega a conversa mais urgente que o agente PODE ver e a
 * marca como dele, atomicamente.
 *
 * `FOR UPDATE SKIP LOCKED` dentro do `UPDATE` é o mesmo padrão do `filaDb.js`:
 * dois agentes clicando junto pegam conversas DIFERENTES em vez de brigarem
 * pela mesma. Um `SELECT` seguido de `UPDATE` daria a mesma conversa para os
 * dois — o check-then-act que a FASE 1 já pagou uma vez.
 *
 * @returns {Promise<object|null>} a conversa assumida, ou null se a fila secou.
 */
export async function assumirProxima(agenteId, { filaId = null, filaIds = [] } = {}) {
  const db = getDb();
  let filtro = 'TRUE';
  const binds = [agenteId];
  if (filaId) {
    filtro = 'fila_id = ?';
    binds.push(filaId);
  } else if (filaIds.length) {
    // Sem fila escolhida, o agente puxa das SUAS filas e das conversas sem
    // fila (legado / fluxo que não configurou destino) — mesma regra do
    // `conversaVisivel`, senão a lista mostra o que o botão não entrega.
    filtro = '(fila_id IS NULL OR fila_id = ANY(?))';
    binds.push(filaIds);
  }

  const { rows } = await db.raw(
    `UPDATE conversas SET status = 'ativa', agente_id = ?, assumido_em = now(),
            aguardando_desde = NULL, atualizado = now()
      WHERE id = (
        SELECT id FROM conversas
         WHERE status = 'aguardando' AND aguardando_desde IS NOT NULL AND (${filtro})
         ORDER BY prioridade DESC, aguardando_desde ASC
         LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    binds,
  );
  return rows[0] || null;
}

/**
 * Assunção manual de UMA conversa (o botão "assumir" da tela).
 *
 * Mora aqui, e não na rota, pelo mesmo motivo de `retomarAutomacao`: a corrida
 * entre dois cliques é resolvida pela CONDIÇÃO do UPDATE, e isso precisa de
 * teste contra Postgres de verdade — não de um mock de `req`/`res`.
 *
 * Quem pode tomar conversa alheia: admin e supervisor da fila dela.
 *
 * @returns {Promise<{conv?: object, erro?: 'nao_encontrada'|'ocupada', donoId?: string}>}
 */
export async function assumirConversa(conversaId, { agenteId, ehAdmin = false } = {}) {
  const db   = getDb();
  const alvo = await db('conversas').select('agente_id', 'fila_id').where({ id: conversaId }).first();
  if (!alvo) return { erro: 'nao_encontrada' };

  const ehSupervisor = !!alvo.fila_id && !!await db('agentes_filas')
    .where({ agente_id: agenteId, fila_id: alvo.fila_id, supervisor: true }).first();

  const q = db('conversas').where({ id: conversaId });
  if (!ehAdmin && !ehSupervisor) q.andWhere(w => w.whereNull('agente_id').orWhere({ agente_id: agenteId }));

  const [conv] = await q
    .update({ status: 'ativa', agente_id: agenteId, aguardando_desde: null, assumido_em: db.fn.now(), atualizado: db.fn.now() })
    .returning('*');

  return conv ? { conv } : { erro: 'ocupada', donoId: alvo.agente_id };
}

/** Capacidade simultânea do agente. Lança 409 é papel da rota; aqui só decide. */
export async function temVaga(agente) {
  if (!agente?.capacidade) return true;      // 0/null = ilimitado
  return podeAssumir(agente.capacidade, await contarAtivas(agente.id));
}

/**
 * Manda a conversa para outra fila e a devolve à espera.
 *
 * Zera `agente_id`: transferir para uma fila é abrir mão da conversa, não
 * levá-la junto. `aguardando_desde` é REINICIADO de propósito — o SLA da fila
 * nova começa agora; herdar o relógio antigo nasceria estourado.
 */
export async function transferirParaFila(conversaId, filaId) {
  const db = getDb();
  const [conv] = await db('conversas').where({ id: conversaId })
    .update({
      fila_id: filaId, status: 'aguardando', agente_id: null,
      aguardando_desde: db.fn.now(), assumido_em: null,
      primeira_msg_agente_em: null, atualizado: db.fn.now(),
    })
    .returning('*');
  return conv || null;
}

// ── MONITOR SLA (roda a cada 60s) ────────────────────────────────
const alertasEmitidos = new Set();
function dedup(chave, ttlMs, fn) {
  if (alertasEmitidos.has(chave)) return;
  alertasEmitidos.add(chave);
  setTimeout(() => alertasEmitidos.delete(chave), ttlMs);
  fn();
}

let slaInterval = null;
export function iniciarMonitorSLA() {
  if (slaInterval) clearInterval(slaInterval);
  slaInterval = setInterval(async () => {
    try {
      const db = getDb();

      // 1 — SLA fila crítico
      // leftJoin: conversa sem fila continua existindo e cai no SLA padrão.
      const fila = await db('conversas as c')
        .leftJoin('filas as f', 'f.id', 'c.fila_id')
        .where({ 'c.status': 'aguardando' }).whereNotNull('c.aguardando_desde')
        .select(['c.id', 'c.nome', 'c.telefone', 'c.canal', 'c.aguardando_desde', 'c.prioridade',
          'f.nome as fila_nome', 'f.sla_atencao_min as atencao_min', 'f.sla_critico_min as critico_min']);

      for (const conv of fila) {
        const { nivel, minutos } = calcularUrgencia(conv.aguardando_desde, conv.prioridade, conv);
        if (nivel === 'critico') {
          dedup(`sla_${conv.id}_${Math.floor(minutos / 5)}`, 5 * 60 * 1000, () => {
            broadcast('sla_critico', {
              convId: conv.id, nome: conv.nome || conv.telefone,
              minutos, canal: conv.canal, fila: conv.fila_nome || null, som: 'urgente',
            });
          });
        }
      }

      // 2 — Agente fantasma (assumiu mas não respondeu em 5min)
      const fantasmas = await db('conversas as c')
        .join('agentes as a', 'a.id', 'c.agente_id')
        .where({ 'c.status': 'ativa' })
        .whereNotNull('c.assumido_em')
        .whereNull('c.primeira_msg_agente_em')
        .whereRaw(`c.assumido_em < NOW() - INTERVAL '5 minutes'`)
        .select(['c.id', 'c.nome', 'c.canal', 'c.agente_id', 'a.nome as agente_nome',
          db.raw(`ROUND(EXTRACT(EPOCH FROM (NOW()-c.assumido_em))/60) as mins`)]);

      for (const f of fantasmas) {
        dedup(`fantasma_${f.id}_${Math.floor(f.mins / 10)}`, 10 * 60 * 1000, () => {
          broadcast('agente_fantasma', {
            convId: f.id, clienteNome: f.nome, canal: f.canal,
            agenteId: f.agente_id, agenteNome: f.agente_nome,
            minutos: parseInt(f.mins),
          });
        });
      }
    } catch (err) {
      console.error('[SLA Monitor]', err.message);
    }
  }, 60 * 1000);
}

export function pararMonitorSLA() {
  if (slaInterval) { clearInterval(slaInterval); slaInterval = null; }
}
