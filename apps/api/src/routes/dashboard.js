import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const dashboardRouter = Router();
dashboardRouter.use(authMiddleware, adminMiddleware);

// Helper: conta linhas sem quebrar se tabela não existir
async function safeCount(db, table, where = '') {
  try {
    const r = await db.raw(`SELECT COUNT(*) as n FROM ${table} ${where}`);
    return parseInt(r.rows?.[0]?.n || 0);
  } catch { return 0; }
}

// Helper: busca NPS de qualquer tabela disponível
async function getNPS(db, days) {
  const since = `NOW() - INTERVAL '${days} days'`;
  // Tenta satisfacao primeiro, depois avaliacoes
  for (const table of ['satisfacao', 'avaliacoes']) {
    try {
      const r = await db.raw(`
        SELECT
          ROUND(AVG(nota)::numeric, 1) as media,
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE nota >= 9) as promotores,
          COUNT(*) FILTER (WHERE nota BETWEEN 7 AND 8) as neutros,
          COUNT(*) FILTER (WHERE nota <= 6) as detratores
        FROM ${table}
        WHERE criado_em >= ${since}
      `);
      return r.rows?.[0] || {};
    } catch { continue; }
  }
  return {};
}

// GET /api/dashboard/kpis?range=30d
dashboardRouter.get('/kpis', asyncHandler(async (req, res) => {
  const db   = getDb();
  const days = req.query.range === '7d' ? 7 : req.query.range === '90d' ? 90 : 30;
  const since = `NOW() - INTERVAL '${days} days'`;

  const [total, porStatus, nps, canais] = await Promise.all([
    db('conversas').whereRaw(`criado_em >= ${since}`)
      .select(db.raw(`
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'encerrada') as encerradas,
        COUNT(*) FILTER (WHERE status IN ('ia','aguardando','ativa')) as ativas,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
        COUNT(*) FILTER (WHERE status = 'aguardando') as aguardando,
        COUNT(*) FILTER (WHERE status = 'encerrada' AND agente_id IS NULL) as so_ia
      `)).first(),

    db('conversas').whereRaw(`criado_em >= ${since}`)
      .where('status', 'encerrada').whereNull('agente_id')
      .count('id as n').first(),

    getNPS(db, days),

    db('conversas').whereRaw(`criado_em >= ${since}`)
      .select('canal').count('id as n').groupBy('canal'),
  ]);

  const totalN     = Number(total?.total || 0);
  const soIA       = Number(total?.so_ia  || 0);
  const comHumano  = Number(total?.com_humano || 0);
  const pctIA      = totalN > 0 ? Math.round((soIA / totalN) * 100) : 0;

  const npsTotal   = Number(nps?.total      || 0);
  const promotores = Number(nps?.promotores  || 0);
  const detratores = Number(nps?.detratores  || 0);
  const npsScore   = npsTotal > 0 ? Math.round(((promotores - detratores) / npsTotal) * 100) : null;
  const npsLabel   = npsScore === null ? null
    : npsScore >= 75 ? 'Excelente' : npsScore >= 50 ? 'Ótimo'
    : npsScore >= 25 ? 'Bom' : npsScore >= 0 ? 'Regular' : 'Crítico';

  res.json({
    periodo_dias:        days,
    total:               totalN,
    encerradas:          Number(total?.encerradas   || 0),
    ativas:              Number(total?.ativas        || 0),
    aguardando:          Number(total?.aguardando    || 0),
    com_humano:          comHumano,
    so_ia:               soIA,
    pct_ia:              pctIA,
    nps_score:           npsScore,
    nps_label:           npsLabel,
    nps_total_respostas: npsTotal,
    nps_promotores:      promotores,
    nps_neutros:         Number(nps?.neutros    || 0),
    nps_detratores:      detratores,
    canais: canais.map(r => ({ canal: r.canal || 'desconhecido', total: Number(r.n) })),
  });
}));

// GET /api/dashboard/serie?range=30d
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
