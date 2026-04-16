/**
 * server.js — Maxxi API v2
 */
import 'dotenv/config';
import express from 'express';
import helmet  from 'helmet';
import cors    from 'cors';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const frontendDist = join(__dirname, '..', 'apps', 'web', 'dist');

import { runMigrations }    from './migrations/run.js';
import { authRouter }       from './routes/auth.js';
import { chatRouter }       from './routes/chat.js';
import { agentesRouter }    from './routes/agentes.js';
import { canaisRouter }     from './routes/canais.js';
import { fluxosRouter }     from './routes/fluxos.js';
import { clientesRouter }   from './routes/clientes.js';
import { ocorrenciasRouter } from './routes/ocorrencias.js';
import { dashboardRouter }  from './routes/dashboard.js';
import { webhookRouter }    from './routes/webhooks.js';
import { tarefasRouter }    from './routes/tarefas.js';
import { satisfacaoRouter } from './routes/satisfacao.js';
import { monitorRouter }    from './routes/monitor.js';
import { coberturaRouter }  from './routes/cobertura.js';
import { ordensRouter }     from './routes/ordens.js';
import { financeiroRouter } from './routes/financeiro.js';
import { sysconfigRouter }  from './routes/sysconfig.js';
import { errorHandler }     from './middlewares/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', true);

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HEALTH CHECK ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() });
});

// ── ROTAS PÚBLICAS ────────────────────────────────────────────────
app.use('/api/auth',     authRouter);
app.use('/api/webhooks', webhookRouter);

// ── ROTAS AUTENTICADAS ────────────────────────────────────────────
app.use('/api/chat',        chatRouter);
app.use('/api/agentes',     agentesRouter);
app.use('/api/canais',      canaisRouter);
app.use('/api/fluxos',      fluxosRouter);
app.use('/api/clientes',    clientesRouter);
app.use('/api/ocorrencias', ocorrenciasRouter);
app.use('/api/dashboard',   dashboardRouter);
app.use('/api/tarefas',     tarefasRouter);
app.use('/api/satisfacao',  satisfacaoRouter);
app.use('/api/monitor',     monitorRouter);
app.use('/api/cobertura',   coberturaRouter);
app.use('/api/ordens',      ordensRouter);
app.use('/api/financeiro',  financeiroRouter);
app.use('/api/sysconfig',   sysconfigRouter);

// ── SERVE FRONTEND ────────────────────────────────────────────────
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/health')) {
      res.sendFile(join(frontendDist, 'index.html'));
    }
  });
  console.log('✅ Frontend servido de:', frontendDist);
}

app.use(errorHandler);

// ── STARTUP ───────────────────────────────────────────────────────
async function start() {
  // Inicia o servidor PRIMEIRO — healthcheck precisa responder
  app.listen(PORT, () => {
    console.log(`🚀 API rodando em http://localhost:${PORT}`);
  });

  // Migrations em background — não bloqueia o startup
  if (process.env.DATABASE_URL) {
    runMigrations()
      .then(() => console.log('✅ Migrations concluídas'))
      .catch(err => console.error('⚠️  Migrations falharam:', err.message));
  } else {
    console.warn('⚠️  DATABASE_URL não definida — banco desativado');
  }
}

start();
