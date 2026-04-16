import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware, adminMiddleware);

// GET /api/dashboard/kpis?range=30d
dashboardRouter.get('/kpis', asyncHandler(async (req, res) => {
  const db   = getDb();
  const days = req.query.range === '7d' ? 7 : req.query.range === '90d' ? 90 : 30;

  const since = `NOW() - INTERVAL '${days} days'`;

  const [total, porStatus, nps, satisfacao, canais] = await Promise.all([
    // Total e breakdown de status
    db('conversas').whereRaw(`criado_em >= ${since}`)
      .select(db.raw(`
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'encerrada') as encerradas,
        COUNT(*) FILTER (WHERE status IN ('ia','aguardando','ativa')) as ativas,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
        COUNT(*) FILTER (WHERE status = 'aguardando') as aguardando
      `)).first(),

    // Resolvidas só pela IA (encerradas sem agente humano)
    db('conversas').whereRaw(`criado_em >= ${since}`)
      .where('status', 'encerrada')
      .whereNull('agente_id')
      .count('id as n').first(),

    // NPS
    db('satisfacao').whereRaw(`criado_em >= ${since}`)
      .select(db.raw(`
        ROUND(AVG(nota), 1) as media,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE nota >= 9) as promotores,
        COUNT(*) FILTER (WHERE nota BETWEEN 7 AND 8) as neutros,
        COUNT(*) FILTER (WHERE nota <= 6) as detratores
      `)).first(),

    // Avaliações (tabela alternativa)
    db('avaliacoes').whereRaw(`criado_em >= ${since}`)
      .avg('nota as media').count('id as total').first(),

    // Por canal
    db('conversas').whereRaw(`criado_em >= ${since}`)
      .select('canal').count('id as n').groupBy('canal'),
  ]);

  const totalN      = Number(total?.total || 0);
  const encerradas  = Number(total?.encerradas || 0);
  const comHumano   = Number(total?.com_humano || 0);
  const soIA        = Number(porStatus?.n || 0);
  const pctIA       = totalN > 0 ? Math.round((soIA / totalN) * 100) : 0;

  // NPS Score (promotores - detratores) / total * 100
  const npsTotal = Number(nps?.total || 0);
  const promotores  = Number(nps?.promotores || 0);
  const detratores  = Number(nps?.detratores || 0);
  const npsScore    = npsTotal > 0 ? Math.round(((promotores - detratores) / npsTotal) * 100) : null;
  const npsLabel    = npsScore === null ? null : npsScore >= 75 ? 'Excelente' : npsScore >= 50 ? 'Ótimo' : npsScore >= 25 ? 'Bom' : npsScore >= 0 ? 'Regular' : 'Crítico';

  res.json({
    periodo_dias:     days,
    total:            totalN,
    encerradas,
    ativas:           Number(total?.ativas || 0),
    aguardando:       Number(total?.aguardando || 0),
    com_humano:       comHumano,
    so_ia:            soIA,
    pct_ia:           pctIA,
    nps_score:        npsScore,
    nps_label:        npsLabel,
    nps_total_respostas: npsTotal,
    nps_promotores:   promotores,
    nps_neutros:      Number(nps?.neutros || 0),
    nps_detratores:   detratores,
    canais: canais.map(r => ({ canal: r.canal || 'desconhecido', total: Number(r.n) })),
  });
}));

// GET /api/dashboard/serie?range=30d — série temporal
dashboardRouter.get('/serie', asyncHandler(async (req, res) => {
  const db   = getDb();
  const days = req.query.range === '7d' ? 7 : req.query.range === '90d' ? 90 : 30;

  const rows = await db('conversas')
    .whereRaw(`criado_em >= NOW() - INTERVAL '${days} days'`)
    .select(db.raw(`
      DATE(criado_em) as data,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
      COUNT(*) FILTER (WHERE status = 'encerrada' AND agente_id IS NULL) as so_ia
    `))
    .groupByRaw('DATE(criado_em)')
    .orderBy('data');

  res.json(rows);
}));

// GET /api/dashboard/agentes
dashboardRouter.get('/agentes', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = await db('agentes')
    .leftJoin('conversas', q =>
      q.on('conversas.agente_id', 'agentes.id').andOnVal('conversas.status', 'ativa')
    )
    .select([
      'agentes.id', 'agentes.nome', 'agentes.avatar',
      'agentes.online', 'agentes.ativo',
      db.raw('COUNT(conversas.id) as conversas_ativas'),
    ])
    .where('agentes.ativo', true)
    .groupBy('agentes.id')
    .orderByRaw('agentes.online DESC, conversas_ativas DESC');

  res.json(rows);
}));
