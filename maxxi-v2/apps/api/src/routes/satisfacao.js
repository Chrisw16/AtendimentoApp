import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const satisfacaoRouter = Router();
satisfacaoRouter.use(authMiddleware);

// GET /api/satisfacao/resumo
satisfacaoRouter.get('/resumo', asyncHandler(async (req, res) => {
  const db = getDb();

  const [resumo] = await db('avaliacoes')
    .select([
      db.raw('COUNT(*) as total'),
      db.raw('AVG(nota) as media'),
      db.raw("COUNT(*) FILTER (WHERE comentario IS NOT NULL AND comentario != '') as com_comentario"),
      db.raw("COUNT(*) FILTER (WHERE nota >= 4) as promotores"),
      db.raw("COUNT(*) FILTER (WHERE nota <= 2) as detratores"),
    ]);

  const total     = Number(resumo.total || 0);
  const nps       = total > 0
    ? Math.round(((resumo.promotores - resumo.detratores) / total) * 100)
    : 0;

  // Distribuição por nota (1–5)
  const dist = {};
  const rows = await db('avaliacoes').select(db.raw('nota, COUNT(*) as count')).groupBy('nota');
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
  const { limit = 20, offset = 0, nota } = req.query;
  const db = getDb();

  let q = db('avaliacoes')
    .leftJoin('agentes',    'avaliacoes.agente_id',    'agentes.id')
    .leftJoin('conversas',  'avaliacoes.conversa_id',  'conversas.id')
    .select([
      'avaliacoes.*',
      'agentes.nome as agente_nome',
      'conversas.protocolo',
    ])
    .orderBy('avaliacoes.criado_em', 'desc')
    .limit(Number(limit)).offset(Number(offset));

  if (nota) q = q.where('avaliacoes.nota', Number(nota));

  res.json({ avaliacoes: await q });
}));

// POST /api/satisfacao/avaliacoes  (chamado ao encerrar conversa)
satisfacaoRouter.post('/avaliacoes', asyncHandler(async (req, res) => {
  const { conversa_id, agente_id, nota, comentario } = req.body;
  if (!nota || nota < 1 || nota > 5) throw new HttpError(400, 'nota deve ser de 1 a 5');

  const db  = getDb();
  const [av] = await db('avaliacoes')
    .insert({ conversa_id, agente_id, nota, comentario })
    .returning('*');
  res.status(201).json(av);
}));
