import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const monitorRouter = Router();
monitorRouter.use(authMiddleware, adminMiddleware);

// GET /api/monitor/status
monitorRouter.get('/status', asyncHandler(async (req, res) => {
  const db = getDb();

  // Equipamentos cadastrados
  const equipamentos = await db('equipamentos_rede')
    .select('*')
    .orderBy('nome')
    .catch(() => []);  // tabela pode não existir ainda

  // Alertas recentes (últimas 24h)
  const alertas = await db('alertas_rede')
    .where('criado_em', '>=', db.raw("NOW() - INTERVAL '24 hours'"))
    .orderBy('criado_em', 'desc')
    .limit(20)
    .catch(() => []);

  res.json({ equipamentos, alertas });
}));

// POST /api/monitor/ping  (recebe pings do agente de monitoramento)
monitorRouter.post('/ping', asyncHandler(async (req, res) => {
  const { equipamentos: equips = [] } = req.body;
  const db = getDb();

  // Cria tabela se não existir
  await db.schema.createTableIfNotExists('equipamentos_rede', t => {
    t.uuid('id').primary().defaultTo(db.raw('gen_random_uuid()'));
    t.string('nome');
    t.string('ip').notNullable().unique();
    t.string('tipo');
    t.string('localizacao');
    t.string('status').defaultTo('unknown');
    t.integer('latencia_ms');
    t.timestamp('ultima_verificacao');
    t.jsonb('meta').defaultTo('{}');
  });

  for (const e of equips) {
    await db('equipamentos_rede')
      .insert({
        ip:                   e.ip,
        nome:                 e.nome || e.ip,
        tipo:                 e.tipo || 'generico',
        localizacao:          e.localizacao,
        status:               e.status || 'unknown',
        latencia_ms:          e.latencia_ms,
        ultima_verificacao:   new Date().toISOString(),
        meta:                 e.meta || {},
      })
      .onConflict('ip')
      .merge(['nome','status','latencia_ms','ultima_verificacao','meta']);
  }

  res.json({ ok: true, atualizados: equips.length });
}));

// ── FASE 13: erros e saúde ────────────────────────────────────────
/**
 * §139 — os erros agrupados por assinatura. Um defeito que dispara mil vezes é
 * UMA linha com contador; sem isso, a lista vira log e ninguém lê.
 */
monitorRouter.get('/erros', adminMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  let q = db('erros_app').orderBy('ultimo_em', 'desc').limit(Math.min(Number(req.query.limite) || 50, 200));
  if (req.query.status) q = q.where('status', req.query.status);
  else q = q.whereNot('status', 'ignorado');
  res.json(await q);
}));

monitorRouter.put('/erros/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['novo', 'visto', 'ignorado'].includes(status)) throw new HttpError(400, 'status inválido');
  const [linha] = await getDb()('erros_app').where({ id: req.params.id }).update({ status }).returning('*');
  if (!linha) throw new HttpError(404, 'Erro não encontrado');
  res.json(linha);
}));

/** §140 — o que a tela de Saúde do Sistema consome. */
monitorRouter.get('/saude', adminMiddleware, asyncHandler(async (_req, res) => {
  const { dependencias, veredito } = await import('../services/saude.js');
  const [d, erros] = await Promise.all([
    dependencias(),
    getDb()('erros_app').where('status', 'novo')
      .whereRaw(`ultimo_em > now() - interval '24 hours'`)
      .orderBy('ocorrencias', 'desc').limit(5)
      .select('id', 'mensagem', 'origem', 'ocorrencias', 'ultimo_em'),
  ]);
  res.json({ ...d, veredito: veredito(d), erros_recentes: erros });
}));
