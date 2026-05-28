import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const canaisRouter = Router();
canaisRouter.use(authMiddleware);

// GET /api/canais
canaisRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  res.json(await db('canais').orderBy('nome'));
}));

// PUT /api/canais/:tipo — admin only
canaisRouter.put('/:tipo', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, icone, ativo, config } = req.body;
  const db = getDb();
  await db('canais')
    .insert({ tipo: req.params.tipo, nome: nome || req.params.tipo, icone, ativo, config })
    .onConflict('tipo')
    .merge(['nome','icone','ativo','config','atualizado']);

  // Propaga credenciais Evolution para sistema_kv (onde o backend as lê)
  if (req.params.tipo === 'whatsapp' && config) {
    const updates = [];
    if (config.evolution_url != null)
      updates.push(db('sistema_kv')
        .insert({ chave: 'evolution_url', valor: JSON.stringify(config.evolution_url) })
        .onConflict('chave').merge(['valor']));
    if (config.evolution_key != null)
      updates.push(db('sistema_kv')
        .insert({ chave: 'evolution_key', valor: JSON.stringify(config.evolution_key) })
        .onConflict('chave').merge(['valor']));
    if (updates.length) await Promise.all(updates);
  }

  const canal = await db('canais').where({ tipo: req.params.tipo }).first();
  res.json(canal);
}));
