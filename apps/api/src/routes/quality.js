/**
 * quality.js — Quality AI (FASE 11).
 *
 * GET    /api/quality/scorecards          — lista
 * POST   /api/quality/scorecards          — cria (admin)
 * PUT    /api/quality/scorecards/:id      — edita (admin)
 * DELETE /api/quality/scorecards/:id      — remove (admin)
 * GET    /api/quality/auditorias          — lista/filtra (admin)
 * GET    /api/quality/auditorias/:id      — uma auditoria
 * POST   /api/quality/auditar/:conversaId — audita agora (admin)
 * POST   /api/quality/auditorias/:id/revisao — revisão humana (§98)
 * GET    /api/quality/coaching/:agenteId  — padrões recorrentes (§99)
 * GET    /api/quality/painel              — visão gerencial (§89)
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { getDb }         from '../config/db.js';
import { conversaRepo }  from '../repositories/conversaRepository.js';
import { auditar as auditarLog, ipDe } from '../services/auditoria.js';
import { auditar, revisar, coaching } from '../services/quality.js';

export const qualityRouter = Router();
qualityRouter.use(authMiddleware);

const CAMPOS = ['slug', 'nome', 'perfil', 'descricao', 'criterios', 'ativo'];

function somenteCampos(body = {}) {
  const out = {};
  for (const c of CAMPOS) if (body[c] !== undefined) out[c] = body[c];
  if (out.slug) out.slug = String(out.slug).toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40);
  if (out.criterios !== undefined) {
    const lista = Array.isArray(out.criterios) ? out.criterios : [];
    // `id` estável por critério: a auditoria guarda a avaliação POR id, e um id
    // que muda a cada save quebraria o histórico e o coaching.
    out.criterios = JSON.stringify(lista.map((c, i) => ({
      id: c.id || `c${i + 1}_${String(c.nome || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12) || i + 1}`,
      nome: c.nome || `Critério ${i + 1}`,
      descricao: c.descricao || '',
      peso: Math.max(0, Number(c.peso) || 1),
      instrucao: c.instrucao || '',
      evidencias: c.evidencias || '',
      critico: !!c.critico,
    })));
  }
  return out;
}

// ── PAINEL GERENCIAL (§89) ────────────────────────────────────────
qualityRouter.get('/painel', adminMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  const dias = Math.min(Number(req.query.dias) || 30, 365);
  const janela = `criado_em > now() - interval '${dias} days'`;

  const [geral, porAgente, violacoes] = await Promise.all([
    db('quality_auditorias').whereRaw(janela)
      .select(db.raw('count(*)::int as total'),
              db.raw('round(avg(final_score))::int as media'),
              db.raw('count(revisado_por)::int as revisadas'),
              db.raw('round(avg(human_score - ai_score))::int as divergencia_media')).first(),
    db('quality_auditorias as q').leftJoin('agentes as a', 'a.id', 'q.agente_id')
      .whereRaw(`q.${janela}`).whereNotNull('q.agente_id')
      .groupBy('q.agente_id', 'a.nome')
      .select('q.agente_id', 'a.nome')
      .count('q.id as auditorias')
      .select(db.raw('round(avg(q.final_score))::int as media'))
      .orderBy('media', 'desc'),
    db('quality_auditorias').whereRaw(janela)
      .whereRaw(`jsonb_array_length(coalesce(violacoes, '[]'::jsonb)) > 0`)
      .count('id as n').first(),
  ]);

  res.json({
    dias,
    ...geral,
    // O plano pede para EVITAR ranking simplista (§99). A lista por agente vem
    // com a contagem junto de propósito: média de 2 auditorias não é média.
    agentes: porAgente.map(a => ({ ...a, auditorias: Number(a.auditorias) })),
    com_violacao: Number(violacoes?.n) || 0,
  });
}));

// ── SCORECARDS ────────────────────────────────────────────────────
qualityRouter.get('/scorecards', asyncHandler(async (_req, res) => {
  res.json(await getDb()('quality_scorecards').orderBy('perfil').orderBy('nome'));
}));

qualityRouter.post('/scorecards', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!dados.nome) throw new HttpError(400, 'nome é obrigatório');
  if (!dados.slug) dados.slug = String(dados.nome).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);

  const db = getDb();
  if (await db('quality_scorecards').where({ slug: dados.slug }).first()) throw new HttpError(409, 'Slug já existe');
  const [sc] = await db('quality_scorecards').insert(dados).returning('*');
  auditarLog({ actorType: 'human', actorId: req.agente.id, action: 'quality_scorecard_criado', resource: sc.id, ip: ipDe(req) });
  res.status(201).json(sc);
}));

qualityRouter.put('/scorecards/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const dados = somenteCampos(req.body);
  if (!Object.keys(dados).length) throw new HttpError(400, 'Nada para atualizar');
  const db = getDb();

  // Mudar critério muda o significado da nota. A versão sobe para que uma
  // auditoria antiga continue dizendo contra QUAL régua foi medida.
  if (dados.criterios !== undefined) dados.versao = db.raw('versao + 1');

  const [sc] = await db('quality_scorecards').where({ id: req.params.id })
    .update({ ...dados, atualizado: db.fn.now() }).returning('*');
  if (!sc) throw new HttpError(404, 'Scorecard não encontrado');
  res.json(sc);
}));

qualityRouter.delete('/scorecards/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const n = await getDb()('quality_scorecards').where({ id: req.params.id }).del();
  if (!n) throw new HttpError(404, 'Scorecard não encontrado');
  res.status(204).end();
}));

// ── AUDITORIAS ────────────────────────────────────────────────────
qualityRouter.get('/auditorias', adminMiddleware, asyncHandler(async (req, res) => {
  const db = getDb();
  let q = db('quality_auditorias as q')
    .leftJoin('agentes as a', 'a.id', 'q.agente_id')
    .leftJoin('conversas as c', 'c.id', 'q.conversa_id')
    .select('q.id', 'q.conversa_id', 'q.agente_id', 'a.nome as agente_nome',
      'q.perfil', 'q.ai_score', 'q.human_score', 'q.final_score', 'q.resumo',
      'q.revisado_em', 'q.criado_em', 'c.protocolo',
      db.raw(`jsonb_array_length(coalesce(q.violacoes, '[]'::jsonb)) as violacoes`))
    .orderBy('q.criado_em', 'desc')
    .limit(Math.min(Number(req.query.limite) || 50, 200));

  if (req.query.agente)   q = q.where('q.agente_id', req.query.agente);
  if (req.query.perfil)   q = q.where('q.perfil', req.query.perfil);
  if (req.query.revisadas === '0') q = q.whereNull('q.revisado_em');
  if (req.query.criticas === '1')  q = q.whereRaw(`jsonb_array_length(coalesce(q.violacoes, '[]'::jsonb)) > 0`);

  res.json(await q);
}));

qualityRouter.get('/auditorias/:id', adminMiddleware, asyncHandler(async (req, res) => {
  const a = await getDb()('quality_auditorias').where({ id: req.params.id }).first();
  if (!a) throw new HttpError(404, 'Auditoria não encontrada');
  res.json(a);
}));

qualityRouter.post('/auditar/:conversaId', adminMiddleware, asyncHandler(async (req, res) => {
  const conversa = await conversaRepo.porId(req.params.conversaId);
  if (!conversa) throw new HttpError(404, 'Conversa não encontrada');

  const r = await auditar(conversa, { origem: 'manual' }).catch(err => ({ erro: 'ia', mensagem: err.message }));
  if (r.erro === 'sem_scorecard')   throw new HttpError(409, 'Nenhum scorecard ativo — crie e ative um antes de auditar.');
  if (r.erro === 'scorecard_vazio') throw new HttpError(409, 'O scorecard ativo não tem critérios.');
  if (r.erro === 'conversa_vazia')  throw new HttpError(409, 'Conversa sem mensagens.');
  if (r.erro === 'ia')              throw new HttpError(503, `Auditoria indisponível agora (${r.mensagem}).`);

  auditarLog({ actorType: 'human', actorId: req.agente.id, action: 'quality_auditoria_manual', conversaId: conversa.id, ip: ipDe(req) });
  res.json(r.auditoria);
}));

qualityRouter.post('/auditorias/:id/revisao', adminMiddleware, asyncHandler(async (req, res) => {
  const { score, observacao } = req.body || {};
  const nota = Number(score);
  if (!Number.isFinite(nota) || nota < 0 || nota > 100) throw new HttpError(400, 'score deve ser 0 a 100');
  // §97 vale para o humano também: mudar a nota sem dizer por quê deixa o
  // atendente sem argumento e o scorecard sem calibração.
  if (!String(observacao || '').trim()) throw new HttpError(400, 'Justifique a revisão — nota sem justificativa não sustenta feedback.');

  const r = await revisar(req.params.id, { humanScore: nota, observacao, agenteId: req.agente.id });
  if (r.erro) throw new HttpError(404, 'Auditoria não encontrada');

  auditarLog({ actorType: 'human', actorId: req.agente.id, action: 'quality_revisao', resource: req.params.id, after: { divergencia: r.divergencia }, ip: ipDe(req) });
  res.json(r.auditoria);
}));

qualityRouter.get('/coaching/:agenteId', asyncHandler(async (req, res) => {
  // O agente vê o próprio coaching; admin vê o de qualquer um.
  if (req.agente.role !== 'admin' && req.agente.id !== req.params.agenteId) {
    throw new HttpError(403, 'Você só pode ver o seu próprio desenvolvimento');
  }
  res.json(await coaching(req.params.agenteId, { dias: Number(req.query.dias) || 30 }));
}));
