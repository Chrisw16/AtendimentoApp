/**
 * filaService.js — Sistema de fila com SLA, urgência e notificações
 * Fiel ao fila.js do sistema de inspiração
 */
import { getDb }   from '../config/db.js';
import { broadcast } from './sseManager.js';

const SLA_DEFAULT = {
  critico_min: 15,
  atencao_min: 5,
  notif_cliente: true,
  palavras_criticas: [
    'cancelar', 'cancelamento', 'procon', 'advogado', 'absurdo',
    'inaceitável', 'processo', 'reclamação', 'reclame aqui', 'anatel',
    'horrível', 'vergonha', 'fraude',
  ],
};

export function calcularUrgencia(aguardandoDesde, prioridade = 0) {
  if (!aguardandoDesde) return { nivel: 'ia', minutos: 0, segundos: 0 };
  const segs = Math.floor((Date.now() - new Date(aguardandoDesde).getTime()) / 1000);
  const mins = Math.floor(segs / 60);
  if (prioridade >= 2 || mins >= SLA_DEFAULT.critico_min) return { nivel: 'critico', minutos: mins, segundos: segs };
  if (prioridade >= 1 || mins >= SLA_DEFAULT.atencao_min) return { nivel: 'atencao', minutos: mins, segundos: segs };
  return { nivel: 'ok', minutos: mins, segundos: segs };
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
      const fila = await db('conversas')
        .where({ status: 'aguardando' }).whereNotNull('aguardando_desde')
        .select(['id', 'nome', 'telefone', 'canal', 'aguardando_desde', 'prioridade']);

      for (const conv of fila) {
        const { nivel, minutos } = calcularUrgencia(conv.aguardando_desde, conv.prioridade);
        if (nivel === 'critico') {
          dedup(`sla_${conv.id}_${Math.floor(minutos / 5)}`, 5 * 60 * 1000, () => {
            broadcast('sla_critico', {
              convId: conv.id, nome: conv.nome || conv.telefone,
              minutos, canal: conv.canal, som: 'urgente',
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
