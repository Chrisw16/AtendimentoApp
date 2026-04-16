import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const fluxosRouter = Router();
fluxosRouter.use(authMiddleware, adminMiddleware);

fluxosRouter.get('/', asyncHandler(async (req, res) => {
  res.json(await getDb()('fluxos').orderBy('nome'));
}));

fluxosRouter.get('/:id', asyncHandler(async (req, res) => {
  const f = await getDb()('fluxos').where({ id: req.params.id }).first();
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.post('/', asyncHandler(async (req, res) => {
  const { nome, nos = [], conexoes = [], gatilho } = req.body;
  if (!nome) throw new HttpError(400, 'nome obrigatório');
  const [f] = await getDb()('fluxos').insert({ nome, nos, conexoes, gatilho }).returning('*');
  res.status(201).json(f);
}));

fluxosRouter.put('/:id', asyncHandler(async (req, res) => {
  const { nome, nos, conexoes, gatilho } = req.body;
  const db = getDb();
  const [f] = await db('fluxos')
    .where({ id: req.params.id })
    .update({ nome, nos, conexoes, gatilho, atualizado: db.fn.now() })
    .returning('*');
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.post('/:id/ativar', asyncHandler(async (req, res) => {
  const db = getDb();
  // Desativa todos os outros primeiro
  await db('fluxos').update({ ativo: false });
  const [f] = await db('fluxos').where({ id: req.params.id }).update({ ativo: true }).returning('*');
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.delete('/:id', asyncHandler(async (req, res) => {
  await getDb()('fluxos').where({ id: req.params.id }).delete();
  res.json({ ok: true });
}));
