import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { broadcast } from '../services/sseManager.js';

export const satisfacaoRouter = Router();
satisfacaoRouter.use(authMiddleware);

// ── HELPERS ───────────────────────────────────────────────────────
function aplicarFiltros(q, { data_inicio, data_fim, agente_id }) {
  if (data_inicio) q = q.where('avaliacoes.criado_em', '>=', new Date(data_inicio));
  if (data_fim) {
    const fim = new Date(data_fim);
    fim.setHours(23, 59, 59, 999);
    q = q.where('avaliacoes.criado_em', '<=', fim);
  }
  if (agente_id) q = q.where('avaliacoes.agente_id', agente_id);
  return q;
}

// GET /api/satisfacao/resumo
satisfacaoRouter.get('/resumo', asyncHandler(async (req, res) => {
  const { data_inicio, data_fim, agente_id } = req.query;
  const db = getDb();

  let qResumo = db('avaliacoes').select([
    db.raw('COUNT(*) as total'),
    db.raw('AVG(nota) as media'),
    db.raw("COUNT(*) FILTER (WHERE comentario IS NOT NULL AND comentario != '') as com_comentario"),
    db.raw("COUNT(*) FILTER (WHERE nota >= 4) as promotores"),
    db.raw("COUNT(*) FILTER (WHERE nota <= 2) as detratores"),
  ]);
  qResumo = aplicarFiltros(qResumo, { data_inicio, data_fim, agente_id });
  const [resumo] = await qResumo;

  const total = Number(resumo.total || 0);
  const nps   = total > 0
    ? Math.round(((resumo.promotores - resumo.detratores) / total) * 100)
    : 0;

  // Distribuição por nota (1–5) respeitando os mesmos filtros
  let qDist = db('avaliacoes').select(db.raw('nota, COUNT(*) as count')).groupBy('nota');
  qDist = aplicarFiltros(qDist, { data_inicio, data_fim, agente_id });
  const dist = {};
  const rows = await qDist;
  rows.forEach(r => { dist[r.nota] = Number(r.count); });

  res.json({
    resumo: {
      total,
      media:          Number(resumo.media || 0),
      com_comentario: Number(resumo.com_comentario || 0),
      promotores:     Number(resumo.promotores || 0),
      detratores:     Number(resumo.detratores || 0),
      nps,
    },
    distribuicao: dist,
  });
}));

// GET /api/satisfacao/avaliacoes
satisfacaoRouter.get('/avaliacoes', asyncHandler(async (req, res) => {
  const { limit = 20, offset = 0, nota, data_inicio, data_fim, agente_id } = req.query;
  const db = getDb();

  let q = db('avaliacoes')
    .leftJoin('agentes',   'avaliacoes.agente_id',   'agentes.id')
    .leftJoin('conversas', 'avaliacoes.conversa_id', 'conversas.id')
    .select([
      'avaliacoes.*',
      'agentes.nome as agente_nome',
      'conversas.protocolo',
    ])
    .orderBy('avaliacoes.criado_em', 'desc');

  if (nota) q = q.where('avaliacoes.nota', Number(nota));
  q = aplicarFiltros(q, { data_inicio, data_fim, agente_id });

  // Total para paginação (sem limit/offset)
  const [{ count }] = await q.clone().clearSelect().clearOrder().count('avaliacoes.id as count');

  q = q.limit(Number(limit)).offset(Number(offset));

  res.json({ avaliacoes: await q, total: Number(count) });
}));

// POST /api/satisfacao/avaliacoes  (chamado ao encerrar conversa ou via webhook)
satisfacaoRouter.post('/avaliacoes', asyncHandler(async (req, res) => {
  const { conversa_id, agente_id, nota, comentario } = req.body;
  if (!nota || nota < 1 || nota > 5) throw new HttpError(400, 'nota deve ser de 1 a 5');

  const db  = getDb();
  const [av] = await db('avaliacoes')
    .insert({ conversa_id, agente_id, nota, comentario })
    .returning('*');

  broadcast('nova_avaliacao', av);

  res.status(201).json(av);
}));
