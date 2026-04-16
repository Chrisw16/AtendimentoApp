import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const clientesRouter = Router();
clientesRouter.use(authMiddleware);

// Clientes vêm do ERP (SGP) via API — cacheamos localmente na conversa
// Esta rota serve como proxy inteligente: tenta ERP, fallback no local

async function fetchERP(path) {
  const base = process.env.ERP_URL;
  const key  = process.env.ERP_API_KEY;
  if (!base) return null;

  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);

  if (!res?.ok) return null;
  return res.json().catch(() => null);
}

// GET /api/clientes
clientesRouter.get('/', asyncHandler(async (req, res) => {
  const { q, limit = 30, offset = 0 } = req.query;

  // Tenta ERP primeiro
  if (q) {
    const erpData = await fetchERP(`/clientes?busca=${encodeURIComponent(q)}&limite=${limit}`);
    if (erpData) return res.json(erpData);
  }

  // Fallback: clientes mencionados nas conversas
  const db      = getDb();
  let query = db('conversas')
    .whereNotNull('nome')
    .select(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .groupBy(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .orderBy('nome')
    .limit(Number(limit))
    .offset(Number(offset));

  if (q) {
    query = query.where(b =>
      b.whereLike('nome', `%${q}%`)
       .orWhereLike('telefone', `%${q}%`)
       .orWhereLike('email', `%${q}%`)
    );
  }

  res.json(await query);
}));

// GET /api/clientes/buscar
clientesRouter.get('/buscar', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const erpData = await fetchERP(`/clientes?busca=${encodeURIComponent(q)}&limite=10`);
  if (erpData) return res.json(erpData);

  // Fallback local
  const db = getDb();
  const results = await db('conversas')
    .whereNotNull('nome')
    .where(b => b.whereLike('nome', `%${q}%`).orWhereLike('telefone', `%${q}%`))
    .select(['id','nome','telefone','email','contrato_id'])
    .limit(10);

  res.json(results);
}));

// GET /api/clientes/:id
clientesRouter.get('/:id', asyncHandler(async (req, res) => {
  const erpData = await fetchERP(`/clientes/${req.params.id}`);
  if (erpData) return res.json(erpData);

  throw new HttpError(503, 'ERP não disponível e cliente não encontrado localmente');
}));
