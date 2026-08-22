import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const agentesRouter = Router();
agentesRouter.use(authMiddleware);

// `permissoes` e `capacidade` entram aqui na FASE 6: sem lê-los, a tela de
// Agentes abre o formulário com as caixas desmarcadas e o primeiro save apaga
// a configuração de todo mundo — o mesmo estrago que a tela de Canais fazia.
const CAMPOS_PUBLICOS = ['id','nome','login','avatar','role','ativo','online','criado_em','permissoes','capacidade'];

// GET /api/agentes
agentesRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const agentes = await db('agentes')
    .select(CAMPOS_PUBLICOS)
    .orderBy('nome');
  res.json(agentes);
}));

// GET /api/agentes/online
agentesRouter.get('/online', asyncHandler(async (req, res) => {
  const db = getDb();
  const agentes = await db('agentes')
    .select(CAMPOS_PUBLICOS)
    .where({ ativo: true, online: true })
    .orderBy('nome');
  res.json(agentes);
}));

// GET /api/agentes/:id
agentesRouter.get('/:id', asyncHandler(async (req, res) => {
  const db     = getDb();
  const agente = await db('agentes').select(CAMPOS_PUBLICOS).where({ id: req.params.id }).first();
  if (!agente) throw new HttpError(404, 'Agente não encontrado');
  res.json(agente);
}));

// POST /api/agentes — admin only
agentesRouter.post('/', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, login, senha, role = 'agente', avatar = '🧑', permissoes = {}, capacidade = 0 } = req.body;
  if (!nome || !login || !senha) throw new HttpError(400, 'nome, login e senha são obrigatórios');

  const db = getDb();
  const existe = await db('agentes').where({ login }).first();
  if (existe) throw new HttpError(409, 'Login já cadastrado');

  const senha_hash = await bcrypt.hash(senha, 10);
  const [agente]   = await db('agentes')
    .insert({ nome, login, senha_hash, role, avatar, permissoes, capacidade: Math.max(0, Number(capacidade) || 0) })
    .returning(CAMPOS_PUBLICOS);

  res.status(201).json(agente);
}));

// PUT /api/agentes/:id — admin only
agentesRouter.put('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, login, senha, role, avatar, ativo, permissoes, capacidade } = req.body;
  const db = getDb();

  const patch = {};
  if (nome       !== undefined) patch.nome       = nome;
  if (login      !== undefined) patch.login      = login;
  if (role       !== undefined) patch.role       = role;
  if (avatar     !== undefined) patch.avatar     = avatar;
  if (ativo      !== undefined) patch.ativo      = ativo;
  if (permissoes !== undefined) patch.permissoes = permissoes;
  // Capacidade simultânea (FASE 5) só ganhou tela agora. Negativo vira 0 =
  // ilimitado, que é o default da coluna.
  if (capacidade !== undefined) patch.capacidade = Math.max(0, Number(capacidade) || 0);
  if (senha) patch.senha_hash = await bcrypt.hash(senha, 10);

  if (Object.keys(patch).length === 0) throw new HttpError(400, 'Nenhum campo para atualizar');

  const [agente] = await db('agentes')
    .where({ id: req.params.id })
    .update({ ...patch, atualizado: db.fn.now() })
    .returning(CAMPOS_PUBLICOS);

  if (!agente) throw new HttpError(404, 'Agente não encontrado');
  res.json(agente);
}));

// DELETE /api/agentes/:id — admin only (desativa, não exclui)
agentesRouter.delete('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  if (req.params.id === req.agente.id) throw new HttpError(400, 'Não é possível desativar a si mesmo');
  const db = getDb();
  await db('agentes').where({ id: req.params.id }).update({ ativo: false });
  res.json({ ok: true });
}));
