/**
 * filasAtendimento.js — filas de atendimento HUMANO (FASE 5).
 *
 * Montado em `/api/atendimento` e não em `/api/filas` porque aquela rota já é
 * das filas de mensageria da FASE 4 (inbox/outbox/jobs). Nomes iguais, domínios
 * opostos — trocar seria mais confuso que conviver.
 *
 * GET    /api/atendimento/filas             — lista + contadores (autenticado)
 * POST   /api/atendimento/filas             — cria (admin)
 * PUT    /api/atendimento/filas/:id         — atualiza (admin)
 * DELETE /api/atendimento/filas/:id         — remove (admin)
 * GET    /api/atendimento/filas/:id/agentes — membros (admin)
 * PUT    /api/atendimento/filas/:id/agentes — define membros (admin)
 * GET    /api/atendimento/minhas-filas      — as filas do agente logado
 * POST   /api/atendimento/assumir-proximo   — pega a próxima da fila
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { getDb }        from '../config/db.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { broadcast }     from '../services/sseManager.js';
import { mensagemRepo } from '../repositories/mensagemRepository.js';
import { filasDoAgente, assumirProxima, contarAtivas, calcularUrgencia } from '../services/filaService.js';
import { podeAssumir, dentroDoHorario } from '../services/filasHelpers.js';

export const filasAtendimentoRouter = Router();
filasAtendimentoRouter.use(authMiddleware);

const CAMPOS = ['nome', 'slug', 'descricao', 'cor', 'ativa', 'ordem',
  'sla_atencao_min', 'sla_critico_min', 'horario'];

/** Allowlist explícita: `req.body` inteiro no update é o mass-assignment da FASE 3. */
function somenteCampos(body = {}) {
  const out = {};
  for (const c of CAMPOS) if (body[c] !== undefined) out[c] = body[c];
  if (out.slug) out.slug = slugify(out.slug);
  return out;
}

function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
}

// ── LISTA ─────────────────────────────────────────────────────────
filasAtendimentoRouter.get('/filas', asyncHandler(async (_req, res) => {
  const db = getDb();
  const filas = await db('filas').orderBy([{ column: 'ordem' }, { column: 'nome' }]);

  // Contadores num só round-trip: o painel mostra 5 filas e não vale 15 queries.
  const [espera, ativas, membros] = await Promise.all([
    db('conversas').whereNotNull('fila_id').where({ status: 'aguardando' }).groupBy('fila_id').select('fila_id').count('id as n'),
    db('conversas').whereNotNull('fila_id').where({ status: 'ativa' }).groupBy('fila_id').select('fila_id').count('id as n'),
    db('agentes_filas as af').join('agentes as a', 'a.id', 'af.agente_id')
      .where({ 'a.ativo': true }).groupBy('af.fila_id').select('af.fila_id')
      .count('af.agente_id as n')
      .sum(db.raw('CASE WHEN a.online THEN 1 ELSE 0 END')),
  ]);
  const mapa = (rows, campo = 'n') => Object.fromEntries(rows.map(r => [r.fila_id, Number(r[campo]) || 0]));
  const nEspera = mapa(espera), nAtivas = mapa(ativas), nMembros = mapa(membros), nOnline = mapa(membros, 'sum');

  res.json(filas.map(f => ({
    ...f,
    aguardando: nEspera[f.id] || 0,
    em_atendimento: nAtivas[f.id] || 0,
    agentes: nMembros[f.id] || 0,
    agentes_online: nOnline[f.id] || 0,
    aberta: dentroDoHorario(f.horario),
  })));
}));

filasAtendimentoRouter.get('/minhas-filas', asyncHandler(async (req, res) => {
  const db  = getDb();
  const ids = await filasDoAgente(req.agente.id);
  const filas = ids.length ? await db('filas').whereIn('id', ids).orderBy('nome') : [];
  const agente = await db('agentes').select('capacidade').where({ id: req.agente.id }).first();
  res.json({
    filas,
    // Vazio significa "vê tudo" — a tela precisa saber disso para não mentir
    // dizendo que o agente não tem fila nenhuma para atender.
    todas: ids.length === 0,
    capacidade: agente?.capacidade || 0,
    em_atendimento: await contarAtivas(req.agente.id),
  });
}));

// ── CRUD (admin) ──────────────────────────────────────────────────
filasAtendimentoRouter.post('/filas', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!dados.nome) throw new HttpError(400, 'nome é obrigatório');
  if (!dados.slug) dados.slug = slugify(dados.nome);

  const db = getDb();
  if (await db('filas').where({ slug: dados.slug }).first()) throw new HttpError(409, 'slug já existe');

  const [fila] = await db('filas').insert(dados).returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'fila_criada', resource: fila.id, after: dados, ip: ipDe(req) });
  res.status(201).json(fila);
}));

filasAtendimentoRouter.put('/filas/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const db    = getDb();
  const dados = somenteCampos(req.body);
  if (!Object.keys(dados).length) throw new HttpError(400, 'nada para atualizar');
  dados.atualizado = db.fn.now();

  const [fila] = await db('filas').where({ id: req.params.id }).update(dados).returning('*');
  if (!fila) throw new HttpError(404, 'Fila não encontrada');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'fila_atualizada', resource: fila.id, after: dados, ip: ipDe(req) });
  res.json(fila);
}));

filasAtendimentoRouter.delete('/filas/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  // `conversas.fila_id` é ON DELETE SET NULL: a conversa não some junto, volta
  // a ser "sem fila" (visível para todos). É o degradar certo — sumir da tela
  // de todo mundo por causa de um clique no admin, não.
  const n = await db('filas').where({ id: req.params.id }).del();
  if (!n) throw new HttpError(404, 'Fila não encontrada');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'fila_removida', resource: req.params.id, ip: ipDe(req) });
  res.status(204).end();
}));

// ── MEMBROS ───────────────────────────────────────────────────────
filasAtendimentoRouter.get('/filas/:id/agentes', adminMiddleware, asyncHandler(async (req, res) => {
  const rows = await getDb()('agentes_filas as af')
    .join('agentes as a', 'a.id', 'af.agente_id')
    .where({ 'af.fila_id': req.params.id })
    .select('a.id', 'a.nome', 'a.login', 'a.avatar', 'a.online', 'a.capacidade', 'af.supervisor')
    .orderBy('a.nome');
  res.json(rows);
}));

filasAtendimentoRouter.put('/filas/:id/agentes', adminMiddleware, asyncHandler(async (req, res) => {
  const { agentes } = req.body || {};
  if (!Array.isArray(agentes)) throw new HttpError(400, 'agentes deve ser um array');

  const db   = getDb();
  const fila = await db('filas').where({ id: req.params.id }).first();
  if (!fila) throw new HttpError(404, 'Fila não encontrada');

  // Substituição inteira dentro de UMA transação: apagar fora dela deixaria a
  // fila sem ninguém se o insert falhasse, e ninguém atenderia até alguém notar.
  await db.transaction(async trx => {
    await trx('agentes_filas').where({ fila_id: fila.id }).del();
    if (agentes.length) {
      await trx('agentes_filas').insert(agentes.map(a => ({
        fila_id: fila.id,
        agente_id: typeof a === 'string' ? a : a.agente_id,
        supervisor: typeof a === 'object' && !!a.supervisor,
      })));
    }
  });
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'fila_membros', resource: fila.id, after: { n: agentes.length }, ip: ipDe(req) });
  res.json({ ok: true, total: agentes.length });
}));

// ── ASSUMIR PRÓXIMO ───────────────────────────────────────────────
filasAtendimentoRouter.post('/assumir-proximo', asyncHandler(async (req, res) => {
  const db     = getDb();
  const agente = await db('agentes').where({ id: req.agente.id }).first();

  // ponytail: capacidade é checada ANTES do claim. Dois cliques simultâneos do
  // mesmo agente podem estourar o teto em 1. O claim atômico protege contra
  // dois agentes na MESMA conversa, que é o estrago de verdade; um a mais na
  // mesa de quem clicou duas vezes, não. Vira `SELECT ... FOR UPDATE` no agente
  // se um dia doer.
  if (!podeAssumir(agente?.capacidade, await contarAtivas(agente.id))) {
    throw new HttpError(409, `Capacidade cheia (${agente.capacidade} conversas simultâneas)`);
  }

  const filaId  = req.body?.fila_id || null;
  const filaIds = filaId ? [] : await filasDoAgente(agente.id);
  const conv    = await assumirProxima(agente.id, { filaId, filaIds });
  if (!conv) return res.status(204).end();   // fila vazia não é erro

  await mensagemRepo.criar({
    conversa_id: conv.id, origem: 'sistema', tipo: 'texto',
    texto: `✅ Conversa assumida por ${agente.nome}`,
  }).catch(() => {});
  auditar({ actorType: 'human', actorId: agente.id, action: 'conversa_assumida', conversaId: conv.id, after: { via: 'assumir_proximo' }, ip: ipDe(req) });
  broadcast('conversa_atualizada', { ...conv, urgencia: calcularUrgencia(null) });
  res.json(conv);
}));
