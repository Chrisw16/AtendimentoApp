/**
 * chatTeste.js — link PÚBLICO de teste de um fluxo (sem login).
 *
 * Montado fora do authMiddleware. O acesso é por `share_token` (gerado pela tela
 * Testar fluxo). Roda o motor em modo SANDBOX: SGP e IA reais (leitura), mas tudo
 * que GRAVA é simulado (chamado, promessa, pré-cadastro, transferência).
 *
 * GET  /api/chat-teste/:token  → valida o link e devolve o nome do fluxo
 * POST /api/chat-teste/:token  → { mensagem, sessao } → roda um turno e devolve
 *                                { respostas, sessao, status }
 *
 * ⚠️ O estado NÃO volta mais para o navegador. Era stateless (o cliente
 * devolvia o `estado` do turno anterior) até 2026-08-27, quando a bateria em
 * produção mostrou o que isso significa: o blob carrega
 * `contexto._contratos_sgp`, a ficha crua do assinante — nome, endereço com
 * lat/lng, senha do PPPoE, e login e senha da Central do Assinante. Como o link
 * não pede login, qualquer pessoa com a URL digitava um CPF e recebia tudo.
 * Agora o navegador só carrega um id opaco; a ficha fica no servidor
 * (`sessaoTeste.js`, TTL de 2 h). Vários testadores ao mesmo tempo continuam
 * funcionando, cada um com a sua sessão.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { processarConversa } from '../services/motorFluxo.js';
import { novoId, guardar, ler } from '../services/sessaoTeste.js';

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

  const { mensagem = '', sessao = null } = req.body || {};
  // Sessão desconhecida ou vencida recomeça do zero — nunca herda a de outro.
  const estado = ler(sessao);
  const SID = `share:${f.id}`;
  const estados = new Map();
  if (estado) estados.set(SID, estado);
  const h = new Date();
  const protocolo = `${h.getFullYear()}${String(h.getMonth() + 1).padStart(2, '0')}${String(h.getDate()).padStart(2, '0')}-TESTE`;
  const conversa = { id: SID, canal: 'sandbox', canal_instancia: 'sandbox', telefone: '0', nome: 'Visitante', protocolo };
  const respostas = [];

  await processarConversa(conversa, { texto: mensagem, tipo: 'texto' }, {
    fluxo: f, estados, sandbox: true,
    enviar: (_c, resp) => respostas.push(resp),
  });

  const novo = estados.get(SID) || null;
  const id = guardar(sessao || novoId(), novo);
  res.json({ respostas, sessao: id, status: novo ? 'aguardando' : 'encerrado' });
}));
