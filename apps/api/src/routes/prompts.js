/**
 * prompts.js — CRUD de prompts IA
 * GET    /api/prompts              — lista todos
 * PUT    /api/prompts/:slug        — salva conteúdo + modelo
 * POST   /api/prompts/:slug/restaurar — restaura para o padrão
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb }   from '../config/db.js';
import { invalidateConfigCache } from '../services/integrations.js';

export const promptsRouter = Router();
promptsRouter.use(authMiddleware, adminMiddleware);

promptsRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = await db('prompts_ia').orderBy('id');
  res.json(rows);
}));

promptsRouter.put('/:slug', asyncHandler(async (req, res) => {
  const { conteudo, provedor, modelo, temperatura } = req.body;
  const db = getDb();
  const exists = await db('prompts_ia').where({ slug: req.params.slug }).first();
  if (!exists) throw new HttpError(404, 'Prompt não encontrado');

  await db('prompts_ia').where({ slug: req.params.slug }).update({
    conteudo:    conteudo    ?? exists.conteudo,
    provedor:    provedor    ?? exists.provedor,
    modelo:      modelo      ?? exists.modelo,
    temperatura: temperatura ?? exists.temperatura,
    atualizado:  db.fn.now(),
  });

  // Invalida cache para o motorFluxo pegar a versão nova
  invalidateConfigCache();

  const updated = await db('prompts_ia').where({ slug: req.params.slug }).first();
  res.json({ ok: true, prompt: updated });
}));

promptsRouter.post('/:slug/restaurar', asyncHandler(async (req, res) => {
  const db = getDb();
  const exists = await db('prompts_ia').where({ slug: req.params.slug }).first();
  if (!exists) throw new HttpError(404, 'Prompt não encontrado');

  await db('prompts_ia').where({ slug: req.params.slug }).update({
    conteudo:  exists.padrao,
    atualizado: db.fn.now(),
  });

  invalidateConfigCache();
  res.json({ ok: true });
}));
