/**
 * conversaRepository.js
 * Toda query de conversa passa aqui — zero SQL espalhado nas rotas
 */
import { getDb } from '../config/db.js';

const CONVERSA_FIELDS = [
  'conversas.*',
  'agentes.nome as agente_nome',
];

export const conversaRepo = {
  // ── LISTAGEM ─────────────────────────────────────────────────
  async listar({ status, canal, agenteId, limit = 100, offset = 0 } = {}) {
    const db = getDb();
    let q = db('conversas')
      .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
      .select(CONVERSA_FIELDS)
      .orderBy('conversas.atualizado', 'desc')
      .limit(limit)
      .offset(offset);

    if (status)   q = q.where('conversas.status', status);
    if (canal)    q = q.where('conversas.canal', canal);
    if (agenteId) q = q.where('conversas.agente_id', agenteId);

    return q;
  },

  // ── BUSCAR POR ID ─────────────────────────────────────────────
  async porId(id) {
    return getDb()('conversas')
      .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
      .select(CONVERSA_FIELDS)
      .where('conversas.id', id)
      .first();
  },

  // ── BUSCAR POR TELEFONE/CANAL ─────────────────────────────────
  async porTelefoneCanal(telefone, canal) {
    return getDb()('conversas')
      .where({ telefone, canal })
      .whereNot({ status: 'encerrada' })
      .orderBy('criado_em', 'desc')
      .first();
  },

  // ── CRIAR ─────────────────────────────────────────────────────
  async criar(dados) {
    const db = getDb();
    const protocolo = await _gerarProtocolo(db);
    const [conv] = await db('conversas')
      .insert({ ...dados, protocolo })
      .returning('*');
    return conv;
  },

  // ── ATUALIZAR ─────────────────────────────────────────────────
  async atualizar(id, dados) {
    const [conv] = await getDb()('conversas')
      .where({ id })
      .update({ ...dados, atualizado: getDb().fn.now() })
      .returning('*');
    return conv;
  },

  // ── ASSUMIR ───────────────────────────────────────────────────
  async assumir(id, agenteId) {
    return conversaRepo.atualizar(id, {
      status:           'ativa',
      agente_id:        agenteId,
      aguardando_desde: null,
    });
  },

  // ── DEVOLVER IA ───────────────────────────────────────────────
  async devolverIA(id) {
    return conversaRepo.atualizar(id, {
      status:    'ia',
      agente_id: null,
    });
  },

  // ── ENCERRAR ──────────────────────────────────────────────────
  async encerrar(id) {
    return conversaRepo.atualizar(id, {
      status:    'encerrada',
      agente_id: null,
    });
  },

  // ── ZERAR NÃO LIDAS ───────────────────────────────────────────
  async zerarNaoLidas(id) {
    await getDb()('conversas').where({ id }).update({ nao_lidas: 0 });
  },

  // ── INCREMENTAR NÃO LIDAS ────────────────────────────────────
  async incrementarNaoLidas(id) {
    await getDb()('conversas')
      .where({ id })
      .increment('nao_lidas', 1)
      .update({ atualizado: getDb().fn.now() });
  },
};

// ── HELPERS ──────────────────────────────────────────────────────
async function _gerarProtocolo(db) {
  const hoje = new Date();
  const prefix = [
    hoje.getFullYear(),
    String(hoje.getMonth() + 1).padStart(2, '0'),
    String(hoje.getDate()).padStart(2, '0'),
  ].join('');

  const count = await db('conversas')
    .whereRaw(`DATE(criado_em) = CURRENT_DATE`)
    .count('id as n')
    .first();

  const seq = String(Number(count?.n || 0) + 1).padStart(4, '0');
  return `${prefix}-${seq}`;
}
