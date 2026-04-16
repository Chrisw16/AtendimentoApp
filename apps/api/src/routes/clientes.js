import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { sgpRequest } from '../services/integrations.js';

export const clientesRouter = Router();
clientesRouter.use(authMiddleware);

// GET /api/clientes
clientesRouter.get('/', asyncHandler(async (req, res) => {
  const { q, limit = 30, offset = 0 } = req.query;

  try {
    const path = q
      ? `/clientes?busca=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`
      : `/clientes?limit=${limit}&offset=${offset}`;
    const data = await sgpRequest(path);
    return res.json(Array.isArray(data) ? data : (data.data || data.clientes || []));
  } catch { /* SGP indisponível, usa fallback local */ }

  const db = getDb();
  let query = db('conversas')
    .whereNotNull('nome')
    .select(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .groupBy(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .orderBy('nome').limit(Number(limit)).offset(Number(offset));
  if (q) query = query.where(b => b.whereLike('nome', `%${q}%`).orWhereLike('telefone', `%${q}%`));
  res.json(await query);
}));

// GET /api/clientes/buscar?q=
clientesRouter.get('/buscar', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const data = await sgpRequest(`/clientes?busca=${encodeURIComponent(q)}&limit=10`);
    return res.json(Array.isArray(data) ? data : (data.data || []));
  } catch { /* fallback */ }
  const db = getDb();
  const r  = await db('conversas').whereNotNull('nome')
    .where(b => b.whereLike('nome', `%${q}%`).orWhereLike('telefone', `%${q}%`))
    .select(['id','nome','telefone','email','contrato_id']).limit(10);
  res.json(r);
}));

// GET /api/clientes/:id
clientesRouter.get('/:id', asyncHandler(async (req, res) => {
  try {
    const data = await sgpRequest(`/clientes/${req.params.id}`);
    return res.json(data);
  } catch (err) {
    throw new HttpError(503, `SGP indisponível: ${err.message}`);
  }
}));
