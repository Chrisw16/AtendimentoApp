/**
 * knowledge.js — Knowledge Hub (FASE 7).
 *
 * GET    /api/knowledge                 — lista/filtra (autenticado)
 * GET    /api/knowledge/buscar?q=       — busca (a mesma que a IA usa)
 * GET    /api/knowledge/gaps            — lacunas recorrentes (admin)
 * GET    /api/knowledge/categorias      — categorias
 * POST   /api/knowledge/categorias      — cria categoria (admin)
 * GET    /api/knowledge/:id             — artigo + versões + uso
 * POST   /api/knowledge                 — cria (admin)
 * PUT    /api/knowledge/:id             — edita (admin)
 * POST   /api/knowledge/:id/status      — move no workflow (admin)
 * POST   /api/knowledge/:id/feedback    — útil/incorreto/desatualizado
 * DELETE /api/knowledge/:id             — remove (admin)
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { getDb }         from '../config/db.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { buscar, mudarStatus, registrarUso } from '../services/knowledge.js';
import { STATUS, estaVencido } from '../services/knowledgeHelpers.js';

export const knowledgeRouter = Router();
knowledgeRouter.use(authMiddleware);

const TIPOS = ['artigo', 'faq', 'manual', 'politica', 'argumentacao', 'documento', 'procedimento'];
const CAMPOS = ['titulo', 'slug', 'tipo', 'categoria_id', 'resumo', 'conteudo', 'metadados', 'valido_ate'];

function somenteCampos(body = {}) {
  const out = {};
  for (const c of CAMPOS) if (body[c] !== undefined) out[c] = body[c];
  if (out.slug) out.slug = slugify(out.slug);
  if (out.tipo && !TIPOS.includes(out.tipo)) throw new HttpError(400, `Tipo inválido: ${out.tipo}`);
  // `status` fica FORA da allowlist de propósito: publicar é uma transição do
  // workflow (§52), não um campo de formulário. Quem edita não publica sem
  // passar por revisão só porque mandou `status` no PUT.
  return out;
}

function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

// ── BUSCA ─────────────────────────────────────────────────────────
knowledgeRouter.get('/buscar', asyncHandler(async (req, res) => {
  const { q, categoria, tipo, limite } = req.query;
  if (!q) return res.json([]);

  // O agente busca no MESMO índice da IA, mas pode ver rascunho: é ele quem
  // escreve a base, e esconder o próprio rascunho atrapalha a curadoria.
  const artigos = await buscar(q, {
    categoria: categoria || null, tipo: tipo || null, limite: Number(limite) || 8,
    incluirNaoPublicados: req.agente.role === 'admin',
  });

  // §55 também vale para humano: saber que o artigo salvou um atendimento é o
  // que separa conteúdo vivo de conteúdo que ninguém lê.
  registrarUso(artigos.filter(a => a.status === 'publicado').slice(0, 1),
    { conversaId: req.query.conversa_id || null, origem: 'agente', consulta: String(q).slice(0, 500) });

  res.json(artigos.map(({ conteudo, ...a }) => ({ ...a, conteudo: conteudo?.slice(0, 2000) })));
}));

// ── CATEGORIAS ────────────────────────────────────────────────────
knowledgeRouter.get('/categorias', asyncHandler(async (_req, res) => {
  res.json(await getDb()('knowledge_categorias').orderBy([{ column: 'ordem' }, { column: 'nome' }]));
}));

knowledgeRouter.post('/categorias', adminMiddleware, asyncHandler(async (req, res) => {
  const { nome, descricao, ordem = 0 } = req.body || {};
  if (!nome) throw new HttpError(400, 'nome é obrigatório');
  const db = getDb();
  const slug = slugify(nome);
  if (await db('knowledge_categorias').where({ slug }).first()) throw new HttpError(409, 'Categoria já existe');
  const [cat] = await db('knowledge_categorias').insert({ nome, slug, descricao, ordem }).returning('*');
  res.status(201).json(cat);
}));

// ── LACUNAS (§56) ─────────────────────────────────────────────────
knowledgeRouter.get('/gaps', adminMiddleware, asyncHandler(async (req, res) => {
  const rows = await getDb()('knowledge_gaps')
    .where({ status: req.query.status || 'aberto' })
    .orderBy([{ column: 'ocorrencias', order: 'desc' }, { column: 'ultima_em', order: 'desc' }])
    .limit(Number(req.query.limite) || 50);
  res.json(rows);
}));

knowledgeRouter.put('/gaps/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const { status, artigo_id } = req.body || {};
  if (status && !['aberto', 'resolvido', 'ignorado'].includes(status)) throw new HttpError(400, 'Status inválido');
  const patch = {};
  if (status)    patch.status = status;
  if (artigo_id !== undefined) patch.artigo_id = artigo_id;
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nada para atualizar');

  const [gap] = await getDb()('knowledge_gaps').where({ id: req.params.id }).update(patch).returning('*');
  if (!gap) throw new HttpError(404, 'Lacuna não encontrada');
  res.json(gap);
}));

// ── LISTA E LEITURA ───────────────────────────────────────────────
knowledgeRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  let q = db('knowledge_artigos as a')
    .leftJoin('knowledge_categorias as c', 'c.id', 'a.categoria_id')
    .select('a.id', 'a.titulo', 'a.slug', 'a.tipo', 'a.status', 'a.versao', 'a.resumo',
      'a.valido_ate', 'a.atualizado', 'a.categoria_id', 'c.nome as categoria_nome')
    .orderBy('a.atualizado', 'desc')
    .limit(Number(req.query.limite) || 100);

  // Agente comum não enxerga rascunho: base de conhecimento não publicada é
  // trabalho em andamento, e citar rascunho para o cliente é pior que não ter.
  if (req.agente.role !== 'admin') q = q.where('a.status', 'publicado');
  else if (req.query.status)       q = q.where('a.status', req.query.status);
  if (req.query.tipo)      q = q.where('a.tipo', req.query.tipo);
  if (req.query.categoria) q = q.where('a.categoria_id', req.query.categoria);

  const rows = await q;
  res.json(rows.map(r => ({ ...r, desatualizado: estaVencido(r.valido_ate) })));
}));

knowledgeRouter.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const artigo = await db('knowledge_artigos').where({ id: req.params.id }).first();
  if (!artigo) throw new HttpError(404, 'Artigo não encontrado');
  if (artigo.status !== 'publicado' && req.agente.role !== 'admin') {
    throw new HttpError(403, 'Artigo ainda não publicado');
  }

  const [versoes, usos, feedback] = await Promise.all([
    db('knowledge_versoes').where({ artigo_id: artigo.id }).orderBy('versao', 'desc').select('versao', 'criado_em'),
    db('knowledge_uso').where({ artigo_id: artigo.id }).count('id as n').first(),
    db('knowledge_feedback').where({ artigo_id: artigo.id }).groupBy('tipo').select('tipo').count('id as n'),
  ]);

  res.json({
    ...artigo,
    desatualizado: estaVencido(artigo.valido_ate),
    versoes,
    usos: Number(usos?.n) || 0,
    feedback: Object.fromEntries(feedback.map(f => [f.tipo, Number(f.n)])),
  });
}));

// ── ESCRITA ───────────────────────────────────────────────────────
knowledgeRouter.post('/', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!dados.titulo || !dados.conteudo) throw new HttpError(400, 'titulo e conteudo são obrigatórios');
  if (!dados.slug) dados.slug = slugify(dados.titulo);

  const db = getDb();
  if (await db('knowledge_artigos').where({ slug: dados.slug }).first()) throw new HttpError(409, 'Slug já existe');

  const [artigo] = await db('knowledge_artigos')
    .insert({ ...dados, criado_por: req.agente.id })   // nasce sempre em rascunho
    .returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'knowledge_criado', resource: artigo.id, ip: ipDe(req) });
  res.status(201).json(artigo);
}));

knowledgeRouter.put('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!Object.keys(dados).length) throw new HttpError(400, 'Nada para atualizar');
  const db = getDb();

  const antes = await db('knowledge_artigos').where({ id: req.params.id }).first();
  if (!antes) throw new HttpError(404, 'Artigo não encontrado');

  // §53: editar o que está NO AR sem passar pelo workflow sobrescreveria
  // conhecimento oficial em silêncio — exatamente o que o plano proíbe.
  if (antes.status === 'publicado') {
    throw new HttpError(409, 'Artigo publicado: mova para "revisão" antes de editar (§53).');
  }

  const [artigo] = await db('knowledge_artigos')
    .where({ id: req.params.id })
    .update({ ...dados, atualizado: db.fn.now() })
    .returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'knowledge_editado', resource: artigo.id, ip: ipDe(req) });
  res.json(artigo);
}));

knowledgeRouter.post('/:id/status', adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUS.includes(status)) throw new HttpError(400, `Status inválido: ${status}`);

  const r = await mudarStatus(req.params.id, status, { agenteId: req.agente.id });
  if (r.erro === 'nao_encontrado')     throw new HttpError(404, 'Artigo não encontrado');
  if (r.erro === 'transicao_invalida') throw new HttpError(409, r.mensagem);

  auditar({ actorType: 'human', actorId: req.agente.id, action: `knowledge_${status}`, resource: r.artigo.id, ip: ipDe(req) });
  res.json(r.artigo);
}));

knowledgeRouter.post('/:id/feedback', asyncHandler(async (req, res) => {
  const { tipo, comentario } = req.body || {};
  if (!['util', 'incorreto', 'desatualizado'].includes(tipo)) throw new HttpError(400, 'Tipo de feedback inválido');

  const db = getDb();
  if (!await db('knowledge_artigos').where({ id: req.params.id }).first()) throw new HttpError(404, 'Artigo não encontrado');

  const [fb] = await db('knowledge_feedback')
    .insert({ artigo_id: req.params.id, agente_id: req.agente.id, tipo, comentario })
    .returning('*');
  res.status(201).json(fb);
}));

knowledgeRouter.delete('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const n = await getDb()('knowledge_artigos').where({ id: req.params.id }).del();
  if (!n) throw new HttpError(404, 'Artigo não encontrado');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'knowledge_removido', resource: req.params.id, ip: ipDe(req) });
  res.status(204).end();
}));
