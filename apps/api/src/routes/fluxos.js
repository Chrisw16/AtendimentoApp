import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const fluxosRouter = Router();
fluxosRouter.use(authMiddleware, adminMiddleware);

fluxosRouter.get('/', asyncHandler(async (req, res) => {
  const fluxos = await getDb()('fluxos').orderBy('criado_em', 'desc');
  res.json(fluxos);
}));

fluxosRouter.get('/:id', asyncHandler(async (req, res) => {
  const f = await getDb()('fluxos').where({ id: req.params.id }).first();
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.post('/', asyncHandler(async (req, res) => {
  const { nome, gatilho = 'nova_conversa', dados, nos = [], conexoes = [] } = req.body;
  if (!nome) throw new HttpError(400, 'nome obrigatório');

  const dadosStr = dados ? (typeof dados === 'string' ? dados : JSON.stringify(dados)) : JSON.stringify({ nodes: [], edges: [] });

  const [f] = await getDb()('fluxos')
    .insert({ nome, gatilho, dados: dadosStr, nos: JSON.stringify(nos), conexoes: JSON.stringify(conexoes) })
    .returning('*');
  res.status(201).json(f);
}));

fluxosRouter.put('/:id', asyncHandler(async (req, res) => {
  const { nome, gatilho, dados, nos, conexoes, ativo } = req.body;
  const db = getDb();

  const patch = { atualizado: db.fn.now() };
  if (nome    !== undefined) patch.nome     = nome;
  if (gatilho !== undefined) patch.gatilho  = gatilho;
  if (ativo   !== undefined) patch.ativo    = ativo;
  if (dados   !== undefined) patch.dados    = typeof dados === 'string' ? dados : JSON.stringify(dados);
  if (nos     !== undefined) patch.nos      = typeof nos === 'string' ? nos : JSON.stringify(nos);
  if (conexoes!== undefined) patch.conexoes = typeof conexoes === 'string' ? conexoes : JSON.stringify(conexoes);

  const [f] = await db('fluxos').where({ id: req.params.id }).update(patch).returning('*');
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.post('/:id/ativar', asyncHandler(async (req, res) => {
  const db = getDb();
  await db('fluxos').update({ ativo: false });
  const [f] = await db('fluxos').where({ id: req.params.id }).update({ ativo: true }).returning('*');
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.post('/:id/despublicar', asyncHandler(async (req, res) => {
  const [f] = await getDb()('fluxos').where({ id: req.params.id }).update({ ativo: false }).returning('*');
  if (!f) throw new HttpError(404, 'Fluxo não encontrado');
  res.json(f);
}));

fluxosRouter.delete('/:id', asyncHandler(async (req, res) => {
  await getDb()('fluxos').where({ id: req.params.id }).delete();
  res.json({ ok: true });
}));
