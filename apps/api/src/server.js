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
import { planosRouter }      from './routes/planos.js';
import { chatTesteRouter }   from './routes/chatTeste.js';
import { filasAtendimentoRouter } from './routes/filasAtendimento.js';
import { cliente360Router } from './routes/cliente360.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { playbooksRouter } from './routes/playbooks.js';
import { iaRuntimeRouter } from './routes/iaRuntime.js';
import { filasRouter }       from './routes/filas.js';
import { errorHandler }      from './middlewares/errorHandler.js';

const app  = express();
const PORT = process.env.PORT || 4000;

app.set('trust proxy', 1); // 1 = trust first proxy (Coolify/Traefik)
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || true, credentials: true }));
app.use(rateLimit({ windowMs: 60000, max: 200, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } }));
// `verify` guarda o corpo CRU: a assinatura X-Hub-Signature-256 da Meta é o
// HMAC dos bytes originais — recalcular sobre o objeto re-serializado falha
// (ordem de chave, unicode). Só webhook usa; o custo é uma referência a buffer.
app.use(express.json({ limit: '10mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true }));

// Health check — SEMPRE responde, independente do banco (liveness)
app.get('/health', (_req, res) => res.json({ status: 'ok', version: '2.0.0', ts: new Date().toISOString() }));

// Readiness — 503 até as migrations terminarem, 503 PERMANENTE se falharem.
// Antes, uma migration quebrada só imprimia no console e o app seguia
// "saudável" servindo tráfego sobre schema pela metade.
//
// Precisa ficar aqui, ANTES do bloco de frontend estático: o catch-all
// `app.get('*')` casa `/health/ready`, a condição `!path.startsWith('/health')`
// é falsa e nenhuma resposta seria enviada — o healthcheck estouraria em
// timeout em vez de receber 503.
let prontidao = { pronto: false, motivo: 'migrations em andamento' };
app.get('/health/ready', (_req, res) => {
  if (prontidao.pronto) return res.json({ status: 'ready' });
  res.status(503).json({ status: 'not_ready', motivo: prontidao.motivo });
});

// O readiness gate o healthcheck do container, mas o Express começa a aceitar
// `/api/*` no segundo zero — e as migrations rodam em background. Na estreia da
// 014, `flow_executions` e `protocolo_seq` ainda não existem: um webhook nessa
// janela pega `42P01` e a mensagem do cliente se perde num 500. 503 é a resposta
// certa — o provedor reentrega.
app.use('/api', (_req, res, next) => {
  if (prontidao.pronto) return next();
  res.status(503).json({ error: 'Serviço iniciando', motivo: prontidao.motivo });
});

// Rotas públicas
app.use('/api/auth',       authRouter);
app.use('/api/webhooks',   webhookRouter);
app.use('/api/chat-teste', chatTesteRouter); // link público de teste de fluxo (sem login)

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
app.use('/api/planos',      planosRouter);
app.use('/api/filas',       filasRouter);   // FASE 4: inbox/outbox/jobs — inspeção e DLQ (§132)
app.use('/api/atendimento', filasAtendimentoRouter); // FASE 5: filas de GENTE (não confundir com a de cima)
app.use('/api/cliente360',  cliente360Router);  // FASE 6: painel do assinante
app.use('/api/knowledge',   knowledgeRouter);   // FASE 7: base de conhecimento
app.use('/api/playbooks',   playbooksRouter);   // FASE 8: procedimentos oficiais
app.use('/api/ia',          iaRuntimeRouter);   // FASE 9: perfis, motivos e handoff

// Frontend estático
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    // O `else` importa: sem ele, `/api/rota-inexistente` e `/health/qualquer`
    // não recebiam resposta NENHUMA e a requisição pendurava até o timeout do
    // cliente. Foi assim que `/health/ready` pendurou na produção antiga.
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
      res.status(404).json({ error: 'Rota não encontrada' });
    } else {
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
  const iniciarMonitores = async () => {
    try {
      const { iniciarMonitorSLA } = await import('./services/filaService.js');
      iniciarMonitorSLA();
      console.log('✅ Monitor SLA iniciado');
      const { iniciarMonitorSupervisora } = await import('./services/supervisoraIA.js');
      iniciarMonitorSupervisora();
      console.log('✅ Monitor supervisora iniciado');
    } catch (err) {
      console.error('⚠️  Falha ao iniciar monitores:', err.message);
    }
  };

  import('./migrations/run.js')
    .then(({ runMigrations }) => runMigrations())
    .then(async () => {
      console.log('✅ Migrations OK');
      prontidao = { pronto: true, motivo: null };
      // O worker de filas sobe SÓ aqui, e não no `finally` como os monitores:
      // com migration falha ele martelaria tabela inexistente a cada 5 s.
      const { iniciarWorker } = await import('./services/workerFilas.js');
      iniciarWorker();
    })
    .catch(err => {
      console.error('❌ Migration FALHOU:', err.message);
      prontidao = { pronto: false, motivo: `migration falhou: ${err.message}` };
    })
    // `finally`: os monitores sobem mesmo se a migration falhar. Antes eles
    // viviam no `.then` da migration — uma migration quebrada desligava SLA e
    // supervisora em silêncio, com o app parecendo saudável.
    .finally(iniciarMonitores);
} else {
  // NÃO marca pronto: sem banco toda rota que chama `getDb()` estoura. Um
  // container "saudável" servindo 500 em tudo é exatamente o que o readiness
  // existe para evitar.
  console.warn('⚠️  DATABASE_URL não definida');
  prontidao = { pronto: false, motivo: 'DATABASE_URL não definida' };
}

// ── SHUTDOWN GRACIOSO ───────────────────────────────────────────
// Sem isto o deploy corta a conversa no meio de um `await` de SGP/IA: o turno
// morre depois do efeito colateral (chamado aberto no SGP) e antes de gravar
// o estado ou responder ao cliente.
const LIMITE_DRENO_MS = 8000;   // `docker stop` manda SIGKILL aos 10 s
let encerrando = false;

async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  prontidao = { pronto: false, motivo: 'encerrando' };   // tira do balanceador primeiro
  console.log(`\n⏹  ${sinal} recebido — encerrando com calma`);

  try {
    const { fecharClientes } = await import('./services/sseManager.js');
    // SSE é keep-alive com ping de 25 s: sem derrubar os clientes,
    // `server.close()` nunca resolve e o dreno abaixo nem começa.
    console.log(`   ${fecharClientes()} conexão(ões) SSE fechada(s)`);
  } catch {}

  server.close();

  try {
    const { filaConversa } = await import('./services/motorFluxo.js');
    const ate = Date.now() + LIMITE_DRENO_MS;
    while (filaConversa.tamanho() > 0 && Date.now() < ate) {
      await new Promise(r => setTimeout(r, 100));
    }
    const restantes = filaConversa.tamanho();
    console.log(restantes === 0
      ? '   ✓ Nenhum turno de fluxo em voo'
      : `   ⚠️  ${restantes} turno(s) ainda em voo ao estourar o limite de ${LIMITE_DRENO_MS} ms`);
  } catch {}

  try {
    // Para de reivindicar e devolve o lote em voo. Sem isto, todo deploy deixa
    // linhas `processando` que só o reclaim de 2 min resolve — e nesses 2 min a
    // mensagem do cliente fica parada na fila.
    const { pararWorker } = await import('./services/workerFilas.js');
    await pararWorker();
  } catch (err) {
    console.error('   ⚠️  dreno do worker de filas:', err.message);
  }

  try {
    const { getDb } = await import('./config/db.js');
    await getDb().destroy();
  } catch {}

  // ponytail: os dois monitores (SLA e supervisora) e o ping do SSE seguram o
  // event loop com setInterval, então sair sozinho não acontece. Encerrar aqui
  // é o corte limpo — o estado do fluxo já está no banco a esta altura.
  console.log('   ✓ Encerrado');
  process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT',  () => encerrar('SIGINT'));

export default app;
