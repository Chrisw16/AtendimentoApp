/**
 * iaRuntime.js — perfis de IA e desfechos estruturados (FASE 9).
 *
 * GET    /api/ia/perfis              — lista
 * POST   /api/ia/perfis              — cria (admin)
 * PUT    /api/ia/perfis/:id          — edita (admin)
 * DELETE /api/ia/perfis/:id          — remove (admin)
 * GET    /api/ia/motivos             — o enum de motivos (§73), para a tela
 * GET    /api/ia/handoff/:conversaId — o pacote que o humano recebe (§74)
 * GET    /api/ia/execucoes           — desfechos agregados (admin)
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { getDb }         from '../config/db.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { MOTIVOS }       from '../services/iaRuntime.js';

export const iaRuntimeRouter = Router();
iaRuntimeRouter.use(authMiddleware);

const CAMPOS = ['slug', 'nome', 'descricao', 'prompt_slug', 'playbook_slug', 'tools',
  'max_turnos', 'knowledge_categoria_id', 'goal', 'regras_transferencia', 'ativo'];

function somenteCampos(body = {}) {
  const out = {};
  for (const c of CAMPOS) if (body[c] !== undefined) out[c] = body[c];
  if (out.slug) out.slug = String(out.slug).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  if (out.tools !== undefined) out.tools = JSON.stringify(Array.isArray(out.tools) ? out.tools : []);
  if (out.max_turnos !== undefined) out.max_turnos = Math.max(1, Number(out.max_turnos) || 6);
  return out;
}

iaRuntimeRouter.get('/motivos', asyncHandler(async (_req, res) => {
  res.json(Object.entries(MOTIVOS).map(([id, d]) => ({ id, ...d })));
}));

// ── HANDOFF ───────────────────────────────────────────────────────
iaRuntimeRouter.get('/handoff/:conversaId', asyncHandler(async (req, res) => {
  // A execução MAIS RECENTE que terminou em transferência: é a que explica por
  // que esta conversa está na mão de um humano agora.
  const exec = await getDb()('ia_execucoes')
    .where({ conversa_id: req.params.conversaId, desfecho: 'transferido' })
    .orderBy('criado_em', 'desc')
    .first();
  res.json(exec?.handoff ? { ...exec.handoff, em: exec.criado_em, turnos: exec.turnos } : null);
}));

// ── DESFECHOS ─────────────────────────────────────────────────────
iaRuntimeRouter.get('/execucoes', adminMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const dias = Math.min(Number(req.query.dias) || 7, 90);

  const [porDesfecho, porMotivo] = await Promise.all([
    db('ia_execucoes').whereRaw(`criado_em > now() - interval '${dias} days'`)
      .groupBy('desfecho').select('desfecho').count('id as n'),
    db('ia_execucoes').whereRaw(`criado_em > now() - interval '${dias} days'`)
      .whereNotNull('motivo').groupBy('motivo').select('motivo').count('id as n')
      .orderBy('n', 'desc'),
  ]);

  res.json({
    dias,
    desfechos: Object.fromEntries(porDesfecho.map(r => [r.desfecho, Number(r.n)])),
    motivos: porMotivo.map(r => ({ motivo: r.motivo, label: MOTIVOS[r.motivo]?.label || r.motivo, total: Number(r.n) })),
  });
}));

// ── PERFIS ────────────────────────────────────────────────────────
iaRuntimeRouter.get('/perfis', asyncHandler(async (_req, res) => {
  res.json(await getDb()('ia_perfis').orderBy('nome'));
}));

iaRuntimeRouter.post('/perfis', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!dados.nome) throw new HttpError(400, 'nome é obrigatório');
  if (!dados.slug) dados.slug = String(dados.nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);

  const db = getDb();
  if (await db('ia_perfis').where({ slug: dados.slug }).first()) throw new HttpError(409, 'Slug já existe');

  const [perfil] = await db('ia_perfis').insert(dados).returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'ia_perfil_criado', resource: perfil.id, ip: ipDe(req) });
  res.status(201).json(perfil);
}));

iaRuntimeRouter.put('/perfis/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!Object.keys(dados).length) throw new HttpError(400, 'Nada para atualizar');
  const db = getDb();
  const [perfil] = await db('ia_perfis').where({ id: req.params.id })
    .update({ ...dados, atualizado: db.fn.now() }).returning('*');
  if (!perfil) throw new HttpError(404, 'Perfil não encontrado');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'ia_perfil_editado', resource: perfil.id, ip: ipDe(req) });
  res.json(perfil);
}));

iaRuntimeRouter.delete('/perfis/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const n = await getDb()('ia_perfis').where({ id: req.params.id }).del();
  if (!n) throw new HttpError(404, 'Perfil não encontrado');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'ia_perfil_removido', resource: req.params.id, ip: ipDe(req) });
  res.status(204).end();
}));
