import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { agregarNps } from '../services/fluxoHelpers.js';

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
//
// A classificação NÃO é feita aqui. Antes este SQL reimplementava as faixas com
// 0-10 fixo, enquanto o motor classificava com `avaliarNps` ciente da escala —
// as duas discordavam e uma nota 5 numa escala de 5 (máxima) era contada como
// detratora. Agora só busca as linhas e delega a `agregarNps`.
async function getNPS(db, days) {
  // `avaliacoes` é a tabela legada, documentada como escala 1-5; `satisfacao`
  // carrega a escala por linha (migration 009; linhas antigas = 10).
  const fontes = [
    { tabela: 'satisfacao', escalaFixa: null },
    { tabela: 'avaliacoes', escalaFixa: 5    },
  ];

  let primeiro = null;
  for (const { tabela, escalaFixa } of fontes) {
    try {
      // SELECT * de propósito: funciona mesmo se a coluna `escala` ainda não
      // existir (migration pendente) — aí `escala` vem undefined e agregarNps
      // trata como 0-10, que é o comportamento histórico.
      const r = await db.raw(
        `SELECT * FROM ${tabela} WHERE criado_em >= NOW() - INTERVAL '${days} days'`
      );
      const linhas   = (r.rows || []).map(l => ({ nota: l.nota, escala: escalaFixa ?? l.escala }));
      const agregado = agregarNps(linhas);
      if (agregado.total > 0) return agregado;      // tabela com dados vence
      primeiro ??= agregado;                        // guarda o vazio como fallback
    } catch { continue; }
  }
  return primeiro ?? agregarNps([]);
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
        COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM mensagens m WHERE m.conversa_id = conversas.id AND m.origem = 'agente')) as com_humano,
        COUNT(*) FILTER (WHERE status = 'aguardando') as aguardando,
        -- FASE 12: era "status='encerrada' AND agente_id IS NULL" — e o
        -- encerrar() ZERA o agente_id, então TODA conversa encerrada entrava
        -- aqui e a "resolução IA" dava ~100% por construção. O sinal honesto
        -- é: existiu mensagem de agente nesta conversa?
        COUNT(*) FILTER (WHERE status = 'encerrada' AND NOT EXISTS (
          SELECT 1 FROM mensagens m WHERE m.conversa_id = conversas.id AND m.origem = 'agente')) as so_ia
      `)).first(),

    db('conversas').whereRaw(`criado_em >= ${since}`)
      .where('status', 'encerrada')
      .whereNotExists(q => q.select(1).from('mensagens')
        .whereRaw('mensagens.conversa_id = conversas.id').where('mensagens.origem', 'agente'))
      .count('id as n').first(),

    getNPS(db, days),

    db('conversas').whereRaw(`criado_em >= ${since}`)
      .select('canal').count('id as n').groupBy('canal'),
  ]);

  const totalN     = Number(total?.total || 0);
  const soIA       = Number(total?.so_ia  || 0);
  const comHumano  = Number(total?.com_humano || 0);
  const pctIA      = totalN > 0 ? Math.round((soIA / totalN) * 100) : 0;

  const npsTotal   = nps?.total      ?? 0;
  const promotores = nps?.promotores ?? 0;
  const detratores = nps?.detratores ?? 0;
  const npsScore   = nps?.score ?? null;   // já calculado por agregarNps
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
    nps_neutros:         nps?.neutros ?? 0,
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
