import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const ordensRouter = Router();
ordensRouter.use(authMiddleware);

ordensRouter.get('/', asyncHandler(async (req, res) => {
  const { status, tipo, agente_id, limit = 80, page = 1 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const db = getDb();

  let q = db('ordens_servico')
    .leftJoin('agentes', 'ordens_servico.agente_id', 'agentes.id')
    .select(['ordens_servico.*', 'agentes.nome as agente_nome'])
    .orderBy([
      { column: 'ordens_servico.agendado_para', order: 'asc', nulls: 'last' },
      { column: 'ordens_servico.criado_em',     order: 'desc' },
    ])
    .limit(Number(limit)).offset(offset);

  if (status)    q = q.where('ordens_servico.status', status);
  if (tipo)      q = q.where('ordens_servico.tipo', tipo);
  if (agente_id) q = q.where('ordens_servico.agente_id', agente_id);

  const [ordens, [{ total }]] = await Promise.all([
    q,
    db('ordens_servico').count('id as total'),
  ]);

  res.json({ ordens, total: Number(total) });
}));

ordensRouter.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const os = await db('ordens_servico')
    .leftJoin('agentes', 'ordens_servico.agente_id', 'agentes.id')
    .select(['ordens_servico.*', 'agentes.nome as agente_nome'])
    .where('ordens_servico.id', req.params.id).first();
  if (!os) throw new HttpError(404, 'OS não encontrada');
  res.json(os);
}));

ordensRouter.post('/', asyncHandler(async (req, res) => {
  const { titulo, descricao, tipo, prioridade = 'normal',
          agente_id, endereco, contrato_id, agendado_para } = req.body;
  if (!titulo) throw new HttpError(400, 'titulo obrigatório');

  const db = getDb();

  // Gera número sequencial
  const [{ n }] = await db('ordens_servico').count('id as n');
  const numero  = String(Number(n) + 1).padStart(5, '0');

  const [os] = await db('ordens_servico')
    .insert({ numero, titulo, descricao, tipo, prioridade,
              agente_id: agente_id || null, endereco, contrato_id,
              agendado_para: agendado_para || null })
    .returning('*');

  res.status(201).json(os);
}));

ordensRouter.put('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const patch = { ...req.body, atualizado: db.fn.now() };

  // Timestamps automáticos por status
  if (req.body.status === 'em_campo'  && !req.body.iniciado_em)
    patch.iniciado_em  = new Date().toISOString();
  if (req.body.status === 'concluida' && !req.body.concluido_em)
    patch.concluido_em = new Date().toISOString();

  const [os] = await db('ordens_servico')
    .where({ id: req.params.id }).update(patch).returning('*');
  if (!os) throw new HttpError(404, 'OS não encontrada');
  res.json(os);
}));

ordensRouter.delete('/:id', asyncHandler(async (req, res) => {
  await getDb()('ordens_servico').where({ id: req.params.id }).delete();
  res.json({ ok: true });
}));
