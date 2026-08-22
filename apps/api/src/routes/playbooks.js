/**
 * playbooks.js — Playbook Engine (FASE 8).
 *
 * GET    /api/playbooks              — lista
 * GET    /api/playbooks/:id          — playbook + etapas + versões
 * POST   /api/playbooks              — cria (admin)
 * PUT    /api/playbooks/:id          — edita cabeçalho (admin)
 * PUT    /api/playbooks/:id/etapas   — substitui as etapas (admin)
 * POST   /api/playbooks/:id/status   — move no workflow (admin)
 * DELETE /api/playbooks/:id          — remove (admin)
 * GET    /api/playbooks/execucao/:conversaId — progresso na conversa (copiloto)
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { getDb }         from '../config/db.js';
import { auditar, ipDe } from '../services/auditoria.js';
import { mudarStatus, focoAtual } from '../services/playbook.js';
import { STATUS, OBRIGATORIEDADES, pendentesObrigatorias } from '../services/playbookHelpers.js';

export const playbooksRouter = Router();
playbooksRouter.use(authMiddleware);

const DOMINIOS = ['suporte', 'comercial', 'financeiro', 'retencao'];
const CAMPOS = ['nome', 'slug', 'dominio', 'objetivo', 'gatilhos', 'criterios_sucesso',
  'criterios_transferencia', 'excecoes'];

function somenteCampos(body = {}) {
  const out = {};
  for (const c of CAMPOS) if (body[c] !== undefined) out[c] = body[c];
  if (out.slug) out.slug = slugify(out.slug);
  if (out.dominio && !DOMINIOS.includes(out.dominio)) throw new HttpError(400, `Domínio inválido: ${out.dominio}`);
  if (out.gatilhos !== undefined) out.gatilhos = JSON.stringify(Array.isArray(out.gatilhos) ? out.gatilhos : []);
  // `status` e `versao` ficam de fora: são do workflow, não do formulário.
  return out;
}

function slugify(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60);
}

// ── PROGRESSO NA CONVERSA (o que o copiloto da FASE 10 vai consumir) ──
playbooksRouter.get('/execucao/:conversaId', asyncHandler(async (req, res) => {
  const db = getDb();
  const exec = await db('playbook_execucoes')
    .where({ conversa_id: req.params.conversaId })
    .orderBy('iniciado_em', 'desc')
    .first();
  if (!exec) return res.json(null);

  const [playbook, etapas] = await Promise.all([
    db('playbooks').where({ id: exec.playbook_id }).first(),
    db('playbook_etapas').where({ playbook_id: exec.playbook_id }).orderBy('ordem'),
  ]);

  const feitas = Array.isArray(exec.etapas_feitas) ? exec.etapas_feitas : [];
  const ids = new Set(feitas.map(f => f.etapa_id));
  res.json({
    playbook, execucao: exec,
    etapas: etapas.map(e => ({ ...e, feita: ids.has(e.id) })),
    foco: focoAtual(etapas, exec),
    pendentes: pendentesObrigatorias(etapas, feitas).length,
  });
}));

// ── LISTA E LEITURA ───────────────────────────────────────────────
playbooksRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  let q = db('playbooks as p')
    .leftJoin('playbook_etapas as e', 'e.playbook_id', 'p.id')
    .groupBy('p.id')
    .select('p.*')
    .count('e.id as etapas')
    .orderBy('p.dominio')
    .orderBy('p.nome');

  // Agente comum só vê o que está no ar: procedimento em rascunho é trabalho
  // em andamento, e seguir um rascunho é pior que não ter procedimento.
  if (req.agente.role !== 'admin') q = q.where('p.status', 'publicado');
  else if (req.query.status)       q = q.where('p.status', req.query.status);
  if (req.query.dominio)           q = q.where('p.dominio', req.query.dominio);

  res.json((await q).map(p => ({ ...p, etapas: Number(p.etapas) })));
}));

playbooksRouter.get('/:id', asyncHandler(async (req, res) => {
  const db = getDb();
  const playbook = await db('playbooks').where({ id: req.params.id }).first();
  if (!playbook) throw new HttpError(404, 'Playbook não encontrado');
  if (playbook.status !== 'publicado' && req.agente.role !== 'admin') {
    throw new HttpError(403, 'Playbook ainda não publicado');
  }

  const [etapas, versoes, execucoes] = await Promise.all([
    db('playbook_etapas').where({ playbook_id: playbook.id }).orderBy('ordem'),
    db('playbook_versoes').where({ playbook_id: playbook.id }).orderBy('versao', 'desc').select('versao', 'criado_em'),
    db('playbook_execucoes').where({ playbook_id: playbook.id }).groupBy('resultado').select('resultado').count('id as n'),
  ]);

  res.json({
    ...playbook, etapas, versoes,
    execucoes: Object.fromEntries(execucoes.map(e => [e.resultado, Number(e.n)])),
  });
}));

// ── ESCRITA ───────────────────────────────────────────────────────
playbooksRouter.post('/', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!dados.nome) throw new HttpError(400, 'nome é obrigatório');
  if (!dados.slug) dados.slug = slugify(dados.nome);

  const db = getDb();
  if (await db('playbooks').where({ slug: dados.slug }).first()) throw new HttpError(409, 'Slug já existe');

  const [pb] = await db('playbooks').insert({ ...dados, criado_por: req.agente.id }).returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'playbook_criado', resource: pb.id, ip: ipDe(req) });
  res.status(201).json(pb);
}));

playbooksRouter.put('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!Object.keys(dados).length) throw new HttpError(400, 'Nada para atualizar');

  const db = getDb();
  const antes = await db('playbooks').where({ id: req.params.id }).first();
  if (!antes) throw new HttpError(404, 'Playbook não encontrado');
  // §64: o que está no ar já orientou atendimentos reais. Editar direto
  // reescreveria o procedimento por baixo de execuções em andamento.
  if (antes.status === 'publicado') {
    throw new HttpError(409, 'Playbook publicado: mova para "teste" antes de editar (§64).');
  }

  const [pb] = await db('playbooks').where({ id: req.params.id })
    .update({ ...dados, atualizado: db.fn.now() }).returning('*');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'playbook_editado', resource: pb.id, ip: ipDe(req) });
  res.json(pb);
}));

playbooksRouter.put('/:id/etapas', adminMiddleware, asyncHandler(async (req, res) => {
  const { etapas } = req.body || {};
  if (!Array.isArray(etapas)) throw new HttpError(400, 'etapas deve ser um array');

  const db = getDb();
  const pb = await db('playbooks').where({ id: req.params.id }).first();
  if (!pb) throw new HttpError(404, 'Playbook não encontrado');
  if (pb.status === 'publicado') throw new HttpError(409, 'Playbook publicado: mova para "teste" antes de editar (§64).');

  for (const e of etapas) {
    if (!e.titulo) throw new HttpError(400, 'Toda etapa precisa de título');
    if (e.obrigatoriedade && !OBRIGATORIEDADES.includes(e.obrigatoriedade)) {
      throw new HttpError(400, `Obrigatoriedade inválida: ${e.obrigatoriedade}`);
    }
  }

  // Substituição inteira numa transação: apagar fora dela deixaria o playbook
  // sem etapa nenhuma se o insert falhasse — e playbook sem etapa não publica.
  await db.transaction(async trx => {
    await trx('playbook_etapas').where({ playbook_id: pb.id }).del();
    if (etapas.length) {
      await trx('playbook_etapas').insert(etapas.map((e, i) => ({
        playbook_id: pb.id,
        ordem: Number(e.ordem) || i + 1,
        titulo: e.titulo,
        descricao: e.descricao || null,
        obrigatoriedade: e.obrigatoriedade || 'obrigatoria',
        condicao: e.condicao || null,
        tools: JSON.stringify(Array.isArray(e.tools) ? e.tools : []),
        subplaybook_id: e.subplaybook_id || null,
      })));
    }
  });

  auditar({ actorType: 'human', actorId: req.agente.id, action: 'playbook_etapas', resource: pb.id, after: { n: etapas.length }, ip: ipDe(req) });
  res.json(await db('playbook_etapas').where({ playbook_id: pb.id }).orderBy('ordem'));
}));

playbooksRouter.post('/:id/status', adminMiddleware, asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!STATUS.includes(status)) throw new HttpError(400, `Status inválido: ${status}`);

  const r = await mudarStatus(req.params.id, status, { agenteId: req.agente.id });
  if (r.erro === 'nao_encontrado')     throw new HttpError(404, 'Playbook não encontrado');
  if (r.erro === 'transicao_invalida') throw new HttpError(409, r.mensagem);
  if (r.erro === 'sem_etapas')         throw new HttpError(409, r.mensagem);

  auditar({ actorType: 'human', actorId: req.agente.id, action: `playbook_${status}`, resource: r.playbook.id, ip: ipDe(req) });
  res.json(r.playbook);
}));

playbooksRouter.delete('/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const n = await getDb()('playbooks').where({ id: req.params.id }).del();
  if (!n) throw new HttpError(404, 'Playbook não encontrado');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'playbook_removido', resource: req.params.id, ip: ipDe(req) });
  res.status(204).end();
}));
