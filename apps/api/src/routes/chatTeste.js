/**
 * chatTeste.js — link PÚBLICO de teste de um fluxo (sem login).
 *
 * Montado fora do authMiddleware. O acesso é por `share_token` (gerado pela tela
 * Testar fluxo). Roda o motor em modo SANDBOX: SGP e IA reais (leitura), mas tudo
 * que GRAVA é simulado (chamado, promessa, pré-cadastro, transferência).
 *
 * GET  /api/chat-teste/:token  → valida o link e devolve o nome do fluxo
 * POST /api/chat-teste/:token  → { mensagem, estado } → roda um turno e devolve
 *                                { respostas, estado, status }  (resumível: o
 *                                cliente devolve o `estado` do turno anterior)
 *
 * Stateless: o estado da conversa vive no cliente (cada visitante tem o seu),
 * então o link aguenta vários testadores ao mesmo tempo.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { processarConversa } from '../services/motorFluxo.js';

export const chatTesteRouter = Router();

// Anti-abuso/custo: o link é público e a IA roda de verdade (gasta tokens).
const limite = rateLimit({ windowMs: 5 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false, validate: { trustProxy: false } });
chatTesteRouter.use(limite);

async function fluxoPorToken(token) {
  if (!token) return null;
  return getDb()('fluxos').where({ share_token: token }).first();
}

chatTesteRouter.get('/:token', asyncHandler(async (req, res) => {
  const f = await fluxoPorToken(req.params.token);
  if (!f) throw new HttpError(404, 'Link de teste inválido ou revogado');
  res.json({ ok: true, nome: f.nome });
}));

chatTesteRouter.post('/:token', asyncHandler(async (req, res) => {
  const f = await fluxoPorToken(req.params.token);
  if (!f) throw new HttpError(404, 'Link de teste inválido ou revogado');

  const { mensagem = '', estado = null } = req.body || {};
  const SID = `share:${f.id}`;
  const estados = new Map();
  if (estado) estados.set(SID, estado);
  const conversa = { id: SID, canal: 'sandbox', canal_instancia: 'sandbox', telefone: '0', nome: 'Visitante' };
  const respostas = [];

  await processarConversa(conversa, { texto: mensagem, tipo: 'texto' }, {
    fluxo: f, estados, sandbox: true,
    enviar: (_c, resp) => respostas.push(resp),
  });

  const novo = estados.get(SID) || null;
  res.json({ respostas, estado: novo, status: novo ? 'aguardando' : 'encerrado' });
}));
