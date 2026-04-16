import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

// ── OCORRÊNCIAS ──────────────────────────────────────────────────
export const ocorrenciasRouter = Router();
ocorrenciasRouter.use(authMiddleware);

ocorrenciasRouter.get('/', asyncHandler(async (req, res) => {
  const { status, tipo, limit = 50, offset = 0 } = req.query;
  const db = getDb();
  let q = db('ocorrencias')
    .leftJoin('agentes', 'ocorrencias.agente_id', 'agentes.id')
    .select(['ocorrencias.*', 'agentes.nome as agente_nome'])
    .orderBy('ocorrencias.criado_em', 'desc')
    .limit(Number(limit)).offset(Number(offset));

  if (status) q = q.where('ocorrencias.status', status);
  if (tipo)   q = q.where('ocorrencias.tipo', tipo);

  res.json(await q);
}));

ocorrenciasRouter.get('/tipos', asyncHandler(async (req, res) => {
  const db     = getDb();
  const tipos  = await db('ocorrencias').distinct('tipo').whereNotNull('tipo');
  res.json(tipos.map(t => t.tipo));
}));

ocorrenciasRouter.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const oc = await db('ocorrencias').where({ id: req.params.id }).first();
  if (!oc) throw new HttpError(404, 'Ocorrência não encontrada');
  res.json(oc);
}));

ocorrenciasRouter.post('/', asyncHandler(async (req, res) => {
  const { titulo, descricao, tipo, prioridade = 'normal', conversa_id, contrato_id } = req.body;
  if (!titulo) throw new HttpError(400, 'titulo obrigatório');
  const db   = getDb();
  const [oc] = await db('ocorrencias')
    .insert({ titulo, descricao, tipo, prioridade, agente_id: req.agente.id, conversa_id, contrato_id })
    .returning('*');
  res.status(201).json(oc);
}));

ocorrenciasRouter.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const [oc] = await db('ocorrencias')
    .where({ id: req.params.id })
    .update({ ...req.body, atualizado: db.fn.now() })
    .returning('*');
  if (!oc) throw new HttpError(404, 'Ocorrência não encontrada');
  res.json(oc);
}));

ocorrenciasRouter.post('/:id/fechar', asyncHandler(async (req, res) => {
  const db = getDb();
  const [oc] = await db('ocorrencias')
    .where({ id: req.params.id })
    .update({ status: 'fechada', atualizado: db.fn.now() })
    .returning('*');
  if (!oc) throw new HttpError(404, 'Ocorrência não encontrada');
  res.json(oc);
}));

ocorrenciasRouter.post('/:id/notas', asyncHandler(async (req, res) => {
  const { texto } = req.body;
  if (!texto) throw new HttpError(400, 'texto obrigatório');
  const db   = getDb();
  const [nota] = await db('notas')
    .insert({ conversa_id: null, agente_id: req.agente.id, texto,
              // Associa a ocorrência via meta
    })
    .returning('*');
  res.status(201).json(nota);
}));
