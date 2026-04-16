import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const sysconfigRouter = Router();
sysconfigRouter.use(authMiddleware, adminMiddleware);

const CHAVES_PUBLICAS = [
  'prompt_ia', 'saudacao', 'horario', 'mensagem_fora_hora',
  'modo', 'horario_ativo', 'notificacoes',
  'anthropic_api_key', 'openai_api_key', 'sgp_url', 'sgp_token',
  'evolution_url', 'evolution_key', 'nome_empresa',
];

sysconfigRouter.get('/', asyncHandler(async (req, res) => {
  const db   = getDb();
  const rows = await db('sistema_kv').whereIn('chave', CHAVES_PUBLICAS);
  const config = {};
  rows.forEach(r => {
    try { config[r.chave] = typeof r.valor === 'string' ? JSON.parse(r.valor) : r.valor; }
    catch { config[r.chave] = r.valor; }
  });
  res.json({ config });
}));

sysconfigRouter.put('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const updates = Object.entries(req.body).filter(([k]) => CHAVES_PUBLICAS.includes(k));
  for (const [chave, valor] of updates) {
    await db('sistema_kv')
      .insert({ chave, valor: JSON.stringify(valor) })
      .onConflict('chave').merge(['valor', 'atualizado']);
  }
  res.json({ ok: true });
}));

sysconfigRouter.get('/:chave', asyncHandler(async (req, res) => {
  const db  = getDb();
  const row = await db('sistema_kv').where({ chave: req.params.chave }).first();
  if (!row) return res.json({ valor: null });
  try { res.json({ valor: typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor }); }
  catch { res.json({ valor: row.valor }); }
}));
