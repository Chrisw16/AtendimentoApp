import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../config/db.js';
import { signToken, authMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', asyncHandler(async (req, res) => {
  const { login, senha } = req.body;
  if (!login || !senha) throw new HttpError(400, 'Login e senha são obrigatórios');

  const db     = getDb();
  const agente = await db('agentes').where({ login, ativo: true }).first();
  if (!agente) throw new HttpError(401, 'Credenciais inválidas');

  const ok = await bcrypt.compare(senha, agente.senha_hash);
  if (!ok) throw new HttpError(401, 'Credenciais inválidas');

  const token = signToken({
    id:    agente.id,
    login: agente.login,
    nome:  agente.nome,
    role:  agente.role,
  });

  // Atualiza online
  await db('agentes').where({ id: agente.id }).update({ online: true });

  res.json({
    token,
    user: {
      id:    agente.id,
      nome:  agente.nome,
      login: agente.login,
      avatar:agente.avatar,
      role:  agente.role,
    },
    role:      agente.role,
    permissoes: agente.permissoes || {},
  });
}));

// GET /api/auth/me
authRouter.get('/me', authMiddleware, asyncHandler(async (req, res) => {
  const db     = getDb();
  const agente = await db('agentes').where({ id: req.agente.id }).first();
  if (!agente) throw new HttpError(404, 'Agente não encontrado');

  res.json({
    id:    agente.id,
    nome:  agente.nome,
    login: agente.login,
    avatar:agente.avatar,
    role:  agente.role,
    permissoes: agente.permissoes || {},
  });
}));

// POST /api/auth/logout
authRouter.post('/logout', authMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  await db('agentes').where({ id: req.agente.id }).update({ online: false });
  res.json({ ok: true });
}));

// GET /api/auth/refresh — renova o token sem precisar fazer login novamente
authRouter.get('/refresh', authMiddleware, asyncHandler(async (req, res) => {
  const db    = getDb();
  const agente = await db('agentes').where({ id: req.agente.id, ativo: true }).first();
  if (!agente) throw new HttpError(401, 'Agente inativo');
  const token = signToken({ id: agente.id, login: agente.login, nome: agente.nome, role: agente.role });
  res.json({ token, user: { id: agente.id, nome: agente.nome, login: agente.login, role: agente.role } });
}));
