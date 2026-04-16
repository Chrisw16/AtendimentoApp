import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
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
