/**
 * planos.js — CRUD de planos comerciais (catálogo local).
 *
 * O `plano_id_sgp` é o que vai no campo `plano_id` da tool precadastrar_cliente.
 * Quando a IA está vendendo, ela consulta esta lista (tool listar_planos_ativos)
 * e usa o ID correto baseado na escolha do cliente.
 *
 * GET    /api/planos        — lista todos (admin)
 * POST   /api/planos        — cria plano
 * PUT    /api/planos/:id    — atualiza
 * DELETE /api/planos/:id    — remove
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const planosRouter = Router();
planosRouter.use(authMiddleware, adminMiddleware);

// Lista todos — ordenados por (ativo desc, ordem asc, valor asc)
planosRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = await db('planos')
    .orderBy([
      { column: 'ativo', order: 'desc' },
      { column: 'ordem', order: 'asc' },
      { column: 'valor', order: 'asc' },
    ]);
  res.json(rows);
}));

// Cria
planosRouter.post('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const {
    plano_id_sgp, nome, valor, velocidade, cidade,
    fidelidade_meses, ativo, ordem, descricao,
  } = req.body || {};

  if (!plano_id_sgp || !nome) {
    throw new HttpError(400, 'plano_id_sgp e nome são obrigatórios');
  }

  const [row] = await db('planos').insert({
    plano_id_sgp:     parseInt(plano_id_sgp, 10),
    nome:             String(nome).trim(),
    valor:            valor != null ? parseFloat(valor) : null,
    velocidade:       velocidade || null,
    cidade:           cidade || null,
    fidelidade_meses: parseInt(fidelidade_meses ?? 0, 10) || 0,
    ativo:            ativo !== false,
    ordem:            parseInt(ordem ?? 0, 10) || 0,
    descricao:        descricao || null,
  }).returning('*');

  res.status(201).json({ ok: true, plano: row });
}));

// Atualiza
planosRouter.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const exists = await db('planos').where({ id }).first();
  if (!exists) throw new HttpError(404, 'Plano não encontrado');

  const {
    plano_id_sgp, nome, valor, velocidade, cidade,
    fidelidade_meses, ativo, ordem, descricao,
  } = req.body || {};

  await db('planos').where({ id }).update({
    plano_id_sgp:     plano_id_sgp != null ? parseInt(plano_id_sgp, 10) : exists.plano_id_sgp,
    nome:             nome != null ? String(nome).trim() : exists.nome,
    valor:            valor != null ? parseFloat(valor) : exists.valor,
    velocidade:       velocidade !== undefined ? velocidade : exists.velocidade,
    cidade:           cidade !== undefined ? cidade : exists.cidade,
    fidelidade_meses: fidelidade_meses != null ? parseInt(fidelidade_meses, 10) || 0 : exists.fidelidade_meses,
    ativo:            ativo !== undefined ? !!ativo : exists.ativo,
    ordem:            ordem != null ? parseInt(ordem, 10) || 0 : exists.ordem,
    descricao:        descricao !== undefined ? descricao : exists.descricao,
    atualizado:       db.fn.now(),
  });

  const row = await db('planos').where({ id }).first();
  res.json({ ok: true, plano: row });
}));

// Remove
planosRouter.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const id = parseInt(req.params.id, 10);
  const n = await db('planos').where({ id }).del();
  if (!n) throw new HttpError(404, 'Plano não encontrado');
  res.json({ ok: true });
}));
