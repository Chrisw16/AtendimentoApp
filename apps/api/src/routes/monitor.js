import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const monitorRouter = Router();
monitorRouter.use(authMiddleware, adminMiddleware);

// O Monitor de Rede saiu do produto (2026-08-26): GoCHAT é atendimento, não
// NMS — o inventário de equipamento é do SGP. Com ele foram `GET /status` e
// `POST /ping`; esta rota agora serve SÓ a tela Saúde do Sistema, que é outro
// domínio que por acidente histórico morava no mesmo arquivo.
//
// O `POST /ping` levava junto o último `createTableIfNotExists` do código —
// DDL em runtime, numa rota de admin, recriando `equipamentos_rede` a cada
// chamada. Enquanto ele existisse, a migration 027 dropava a tabela e o
// primeiro POST a ressuscitaria vazia.

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
