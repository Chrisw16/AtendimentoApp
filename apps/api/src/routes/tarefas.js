import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

// ── TAREFAS ───────────────────────────────────────────────────────
export const tarefasRouter = Router();
tarefasRouter.use(authMiddleware);

tarefasRouter.get('/', asyncHandler(async (req, res) => {
  const { status, agente_id } = req.query;
  const db = getDb();
  let q = db('tarefas')
    .leftJoin('agentes', 'tarefas.agente_id', 'agentes.id')
    .select(['tarefas.*', 'agentes.nome as agente_nome'])
    .orderBy([
      { column: db.raw(`CASE status WHEN 'urgente' THEN 0 WHEN 'alta' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`) },
      { column: 'tarefas.criado_em', order: 'desc' },
    ]);

  // Agentes só veem suas tarefas
  if (req.agente.role !== 'admin') q = q.where('tarefas.agente_id', req.agente.id);
  else if (agente_id) q = q.where('tarefas.agente_id', agente_id);

  if (status) q = q.where('tarefas.status', status);

  res.json(await q);
}));

tarefasRouter.post('/', asyncHandler(async (req, res) => {
  const { titulo, descricao, prioridade = 'normal', agente_id, conversa_id, prazo } = req.body;
  if (!titulo) throw new HttpError(400, 'titulo obrigatório');
  const db = getDb();
  const [t] = await db('tarefas')
    .insert({ titulo, descricao, prioridade, agente_id, conversa_id, prazo })
    .returning('*');
  res.status(201).json(t);
}));

// Só o dono da tarefa (agente_id) ou admin pode alterá-la/apagá-la.
async function tarefaDoAgente(db, id, agente) {
  const t = await db('tarefas').where({ id }).first();
  if (!t) throw new HttpError(404, 'Tarefa não encontrada');
  if (agente.role !== 'admin' && t.agente_id && t.agente_id !== agente.id) {
    throw new HttpError(403, 'Tarefa de outro agente');
  }
  return t;
}

// Allowlist: `{ ...req.body }` deixava o cliente gravar QUALQUER coluna,
// inclusive `agente_id` de outra pessoa e `criado_em`.
const CAMPOS_TAREFA = ['titulo', 'descricao', 'status', 'prioridade', 'prazo', 'conversa_id'];

tarefasRouter.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  await tarefaDoAgente(db, req.params.id, req.agente);
  const patch = Object.fromEntries(Object.entries(req.body).filter(([k]) => CAMPOS_TAREFA.includes(k)));
  const [t] = await db('tarefas')
    .where({ id: req.params.id })
    .update({ ...patch, atualizado: db.fn.now() })
    .returning('*');
  res.json(t);
}));

tarefasRouter.delete('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  await tarefaDoAgente(db, req.params.id, req.agente);
  await db('tarefas').where({ id: req.params.id }).delete();
  res.json({ ok: true });
}));
