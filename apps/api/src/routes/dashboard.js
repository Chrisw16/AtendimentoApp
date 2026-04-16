import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb }        from '../config/db.js';

// ── DASHBOARD ────────────────────────────────────────────────────
export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware, adminMiddleware);

// GET /api/dashboard/kpis
dashboardRouter.get('/kpis', asyncHandler(async (req, res) => {
  const db = getDb();

  const [total, abertas, emAtendimento, encerradas, mediaNps] = await Promise.all([
    db('conversas').count('id as n').first(),
    db('conversas').whereIn('status', ['ia','aguardando']).count('id as n').first(),
    db('conversas').where('status', 'ativa').count('id as n').first(),
    db('conversas').where('status', 'encerrada')
      .whereRaw(`DATE(atualizado) = CURRENT_DATE`).count('id as n').first(),
    db('avaliacoes').avg('nota as media').first(),
  ]);

  // Tempo médio de primeira resposta (em minutos)
  const tmo = await db('conversas')
    .whereNotNull('aguardando_desde')
    .whereRaw(`DATE(criado_em) = CURRENT_DATE`)
    .avg(db.raw(`EXTRACT(EPOCH FROM (atualizado - aguardando_desde))/60 as tmo`))
    .first();

  res.json({
    total_conversas:  Number(total?.n  || 0),
    abertas:          Number(abertas?.n || 0),
    em_atendimento:   Number(emAtendimento?.n || 0),
    encerradas_hoje:  Number(encerradas?.n || 0),
    nps_medio:        Number(mediaNps?.media || 0).toFixed(1),
    tmo_minutos:      Number(tmo?.tmo || 0).toFixed(1),
  });
}));

// GET /api/dashboard/atendimentos
dashboardRouter.get('/atendimentos', asyncHandler(async (req, res) => {
  const { range = '7d' } = req.query;
  const db    = getDb();
  const days  = range === '30d' ? 30 : range === '90d' ? 90 : 7;

  const rows = await db('conversas')
    .whereRaw(`criado_em >= NOW() - INTERVAL '${days} days'`)
    .select(db.raw(`DATE(criado_em) as data`))
    .count('id as total')
    .where('status', 'encerrada')
    .groupByRaw('DATE(criado_em)')
    .orderBy('data');

  res.json(rows);
}));

// GET /api/dashboard/agentes
dashboardRouter.get('/agentes', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = await db('agentes')
    .leftJoin('conversas', q =>
      q.on('conversas.agente_id', 'agentes.id')
       .andOnVal('conversas.status', 'ativa')
    )
    .select([
      'agentes.id', 'agentes.nome', 'agentes.avatar',
      'agentes.online', 'agentes.ativo',
      db.raw('COUNT(conversas.id) as conversas_ativas'),
    ])
    .where('agentes.ativo', true)
    .groupBy('agentes.id')
    .orderBy('agentes.online', 'desc');

  res.json(rows);
}));

// ── WEBHOOKS ─────────────────────────────────────────────────────
export const webhookRouter = Router();

// Webhook genérico — cada canal tem seu handler
webhookRouter.post('/meta', asyncHandler(async (req, res) => {
  const { handleMeta } = await import('../services/webhooks/meta.js');
  await handleMeta(req.body);
  res.json({ ok: true });
}));

webhookRouter.get('/meta', (req, res) => {
  // Verificação do webhook Meta
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.status(403).send('Forbidden');
});

webhookRouter.post('/evolution', asyncHandler(async (req, res) => {
  const { handleEvolution } = await import('../services/webhooks/evolution.js');
  await handleEvolution(req.body);
  res.json({ ok: true });
}));

webhookRouter.post('/telegram', asyncHandler(async (req, res) => {
  const { handleTelegram } = await import('../services/webhooks/telegram.js');
  await handleTelegram(req.body);
  res.json({ ok: true });
}));
