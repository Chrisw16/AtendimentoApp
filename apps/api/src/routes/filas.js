/**
 * filas.js — inspeção e reprocessamento das filas da FASE 4 (§132).
 *
 * O §132 pede "inspeção/reprocessamento" da DLQ. Inspeção sozinha vira
 * `UPDATE` manual em produção — que é o que esta rota existe para evitar.
 *
 * GET  /api/filas                         — contagem por tabela/status
 * GET  /api/filas/:tabela?status=falha    — lista SEM o payload
 * GET  /api/filas/:tabela/:id             — a linha inteira, payload incluso
 * POST /api/filas/:tabela/:id/reprocessar — devolve a linha a `pendente`
 *
 * Admin, e auditado: reprocessar uma entrada RE-EXECUTA o turno do motor, que
 * pode chamar tool de escrita (§23). É decisão humana, com nome e IP no log.
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { auditar, ipDe } from '../services/auditoria.js';

export const filasRouter = Router();
filasRouter.use(authMiddleware, adminMiddleware);

// Allowlist: `:tabela` entra em nome de tabela, não em bind.
const TABELAS = {
  inbox:  { data: 'recebido_em', zeraTentativas: false },
  outbox: { data: 'criado_em',   zeraTentativas: true  },
  jobs:   { data: 'criado_em',   zeraTentativas: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checar(tabela, id) {
  const def = TABELAS[tabela];
  if (!def) throw new HttpError(404, `fila desconhecida: ${tabela}`);
  // Sem isto o Postgres devolve 22P02 e a rota vira 500 em vez de 400.
  if (id !== undefined && !UUID.test(String(id))) throw new HttpError(400, 'id inválido');
  return def;
}

filasRouter.get('/', asyncHandler(async (_req, res) => {
  const db = getDb();
  const resumo = {};
  for (const tabela of Object.keys(TABELAS)) {
    const linhas = await db(tabela).select('status').count('id as n').groupBy('status');
    resumo[tabela] = Object.fromEntries(linhas.map(l => [l.status, Number(l.n)]));
  }
  res.json(resumo);
}));

filasRouter.get('/:tabela', asyncHandler(async (req, res) => {
  const def = checar(req.params.tabela);
  const db  = getDb();
  const limite = Math.min(Number(req.query.limite) || 50, 200);

  // `payload` fica de fora: no inbox ele é o webhook CRU, com telefone e o texto
  // do cliente (§124). Quem precisa dele pede a linha específica, abaixo.
  const colunas = Object.keys(await db(req.params.tabela).columnInfo())
    .filter(c => c !== 'payload');

  const q = db(req.params.tabela).select(colunas).orderBy(def.data, 'desc').limit(limite);
  if (req.query.status) q.where({ status: String(req.query.status) });
  res.json(await q);
}));

filasRouter.get('/:tabela/:id', asyncHandler(async (req, res) => {
  checar(req.params.tabela, req.params.id);
  const linha = await getDb()(req.params.tabela).where({ id: req.params.id }).first();
  if (!linha) throw new HttpError(404, 'linha não encontrada');
  res.json(linha);
}));

filasRouter.post('/:tabela/:id/reprocessar', asyncHandler(async (req, res) => {
  const def = checar(req.params.tabela, req.params.id);
  const db  = getDb();

  const linha = await db(req.params.tabela).where({ id: req.params.id }).first();
  if (!linha) throw new HttpError(404, 'linha não encontrada');
  if (linha.status === 'processando') throw new HttpError(409, 'linha em processamento — espere o lease vencer');

  // `tentativas` só zera no outbox. No inbox/jobs é ele que diz ao handler que
  // esta é uma REPETIÇÃO — sem isso o replay vira no-op (a mensagem já está
  // gravada e todo caminho de dedup aborta antes do motor).
  await db(req.params.tabela).where({ id: req.params.id }).update({
    status: 'pendente',
    reivindicado_em: null,
    ultimo_erro: `reprocessado por ${req.agente?.nome || req.agente?.id || 'admin'}`,
    ...(def.zeraTentativas ? { tentativas: 0, proxima_tentativa_em: db.fn.now() } : {}),
  });

  auditar({
    actorType: 'human', actorId: req.agente?.id, action: 'fila_reprocessar',
    resource: `${req.params.tabela}:${req.params.id}`,
    before: { status: linha.status, tentativas: linha.tentativas, erro: linha.ultimo_erro },
    conversaId: linha.conversa_id || null, ip: ipDe(req),
  });

  // Não espera o worker: o efeito tem de ser visível para quem clicou.
  const { tick } = await import('../services/workerFilas.js');
  tick().catch(err => console.error('[Filas] tick pós-reprocessar:', err.message));

  res.json({ ok: true, status: 'pendente' });
}));
