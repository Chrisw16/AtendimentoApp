import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const frontendDist = join(__dirname, '..', 'apps', 'web', 'dist');

import { authRouter }        from './routes/auth.js';
import { chatRouter }        from './routes/chat.js';
import { agentesRouter }     from './routes/agentes.js';
import { canaisRouter }      from './routes/canais.js';
import { fluxosRouter }      from './routes/fluxos.js';
import { clientesRouter }    from './routes/clientes.js';
import { ocorrenciasRouter } from './routes/ocorrencias.js';
import { promptsRouter }   from './routes/prompts.js';
import { dashboardRouter }   from './routes/dashboard.js';
import { webhookRouter }     from './routes/webhooks.js';
import { tarefasRouter }     from './routes/tarefas.js';
import { satisfacaoRouter }  from './routes/satisfacao.js';
import { monitorRouter }     from './routes/monitor.js';
import { coberturaRouter }   from './routes/cobertura.js';
import { ordensRouter }      from './routes/ordens.js';
import { financeiroRouter }  from './routes/financeiro.js';
import { sysconfigRouter }   from './routes/sysconfig.js';
import { errorHandler }      from './middlewares/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1); // 1 = trust first proxy (Coolify/Traefik)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check — SEMPRE responde, independente do banco
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() }));

// Rotas públicas
app.use('/api/auth',     authRouter);
app.use('/api/webhooks', webhookRouter);

// Rotas autenticadas
app.use('/api/chat',        chatRouter);
app.use('/api/agentes',     agentesRouter);
app.use('/api/canais',      canaisRouter);
app.use('/api/fluxos',      fluxosRouter);
app.use('/api/clientes',    clientesRouter);
app.use('/api/ocorrencias', ocorrenciasRouter);
app.use('/api/prompts',     promptsRouter);
app.use('/api/dashboard',   dashboardRouter);
app.use('/api/tarefas',     tarefasRouter);
app.use('/api/satisfacao',  satisfacaoRouter);
app.use('/api/monitor',     monitorRouter);
app.use('/api/cobertura',   coberturaRouter);
app.use('/api/ordens',      ordensRouter);
app.use('/api/financeiro',  financeiroRouter);
app.use('/api/sysconfig',   sysconfigRouter);

// Frontend estático
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

// ── STARTUP ─────────────────────────────────────────────────────
// Sobe o servidor PRIMEIRO — healthcheck precisa responder imediatamente
const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

// Migrations em background — não bloqueia o servidor
if (process.env.DATABASE_URL) {
  import('./migrations/run.js')
    .then(({ runMigrations }) => runMigrations())
    .then(async () => {
      console.log('✅ Migrations OK');
      // Inicia monitor de SLA/fila
      const { iniciarMonitorSLA } = await import('./services/filaService.js');
      iniciarMonitorSLA();
      console.log('✅ Monitor SLA iniciado');
    })
    .catch(err => console.error('⚠️  Migration warning:', err.message));
} else {
  console.warn('⚠️  DATABASE_URL não definida');
}

export default app;
