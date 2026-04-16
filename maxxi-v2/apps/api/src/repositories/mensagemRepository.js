import { getDb } from '../config/db.js';

export const mensagemRepo = {
  // ── LISTAR MENSAGENS DA CONVERSA ──────────────────────────────
  async listar(conversaId, { limit = 50, before } = {}) {
    const db = getDb();
    let q = db('mensagens')
      .leftJoin('agentes', 'mensagens.agente_id', 'agentes.id')
      .select([
        'mensagens.*',
        'agentes.nome as agente_nome',
        'agentes.avatar as agente_avatar',
      ])
      .where('mensagens.conversa_id', conversaId)
      .where('mensagens.apagada', false)
      .orderBy('mensagens.criado_em', 'asc')
      .limit(limit);

    if (before) q = q.where('mensagens.criado_em', '<', before);

    return q;
  },

  // ── CRIAR ─────────────────────────────────────────────────────
  async criar(dados) {
    const db = getDb();
    const [msg] = await db('mensagens').insert(dados).returning('*');

    // Atualiza preview da conversa
    await db('conversas')
      .where({ id: dados.conversa_id })
      .update({
        ultima_mensagem: dados.texto?.slice(0, 120) || '[mídia]',
        atualizado: db.fn.now(),
      });

    return msg;
  },

  // ── ATUALIZAR REAÇÃO ──────────────────────────────────────────
  async reagir(msgId, emoji, agenteId) {
    const db  = getDb();
    const msg = await db('mensagens').where({ id: msgId }).first();
    if (!msg) return null;

    const reacoes = msg.reacoes || {};
    if (!reacoes[emoji]) reacoes[emoji] = [];

    const idx = reacoes[emoji].indexOf(agenteId);
    if (idx >= 0) reacoes[emoji].splice(idx, 1);  // toggle off
    else reacoes[emoji].push(agenteId);            // toggle on

    if (reacoes[emoji].length === 0) delete reacoes[emoji];

    const [updated] = await db('mensagens')
      .where({ id: msgId })
      .update({ reacoes: JSON.stringify(reacoes) })
      .returning('*');
    return updated;
  },

  // ── APAGAR ───────────────────────────────────────────────────
  async apagar(msgId) {
    const [msg] = await getDb()('mensagens')
      .where({ id: msgId })
      .update({ apagada: true, texto: null, url: null })
      .returning('*');
    return msg;
  },

  // ── MARCAR LIDAS ─────────────────────────────────────────────
  async marcarLidas(conversaId) {
    await getDb()('mensagens')
      .where({ conversa_id: conversaId, origem: 'cliente', lida: false })
      .update({ lida: true });
  },

  // ── BUSCAR POR EXTERNAL ID ────────────────────────────────────
  async porExternalId(externalId) {
    return getDb()('mensagens').where({ external_id: externalId }).first();
  },
};
