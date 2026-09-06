/**
 * prompts.js — CRUD de prompts IA
 * GET    /api/prompts              — lista todos
 * PUT    /api/prompts/:slug        — salva conteúdo + modelo
 * POST   /api/prompts/:slug/restaurar — restaura para o padrão
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { getDb }   from '../config/db.js';
import { invalidateConfigCache } from '../services/integrations.js';
// O cache que importa aqui é o de PROMPTS (TTL 3 min em promptService). Só o
// de integrations era invalidado, e `invalidarCachePrompts` não tinha chamador
// nenhum no repo: trocar provedor/modelo de um prompt demorava até 3 minutos
// para valer, e o operador que testasse logo após salvar veria o modelo antigo
// responder e concluiria "não pegou" — a família do perfil/playbook de 27/08.
import { invalidarCachePrompts } from '../services/promptService.js';

export const promptsRouter = Router();
promptsRouter.use(authMiddleware, adminMiddleware);

promptsRouter.get('/', asyncHandler(async (req, res) => {
  const db = getDb();
  const rows = await db('prompts_ia').orderBy('id');
  res.json(rows);
}));

promptsRouter.put('/:slug', asyncHandler(async (req, res) => {
  const { conteudo, provedor, modelo, temperatura } = req.body;
  const db = getDb();
  const exists = await db('prompts_ia').where({ slug: req.params.slug }).first();
  if (!exists) throw new HttpError(404, 'Prompt não encontrado');

  // `provedor`/`modelo`: NULL é uma ESCOLHA ("herdar de Configurações"), não
  // ausência. `??` tratava os dois igual, então a opção "↩ Herdar" da tela
  // gravava… o valor antigo, em silêncio. Campo presente no corpo vence, mesmo
  // nulo; campo ausente mantém.
  const enviado = (k) => Object.prototype.hasOwnProperty.call(req.body, k);
  let provedorFinal = enviado('provedor') ? (provedor || null) : exists.provedor;
  let modeloFinal   = enviado('modelo')   ? (modelo   || null) : exists.modelo;
  // Par incoerente (só um dos dois) não é meio override — vira herança dos dois,
  // aqui na escrita, para a lista não exibir "🟢 " vazio como se fosse escolha.
  if (!provedorFinal || !modeloFinal) { provedorFinal = null; modeloFinal = null; }
  if (provedorFinal) {
    const { PROVEDORES } = await import('../services/llm/index.js');
    const def = PROVEDORES[provedorFinal];
    if (!def) throw new HttpError(400, `Provedor de IA desconhecido: "${provedorFinal}".`);
    const chave = await db('sistema_kv').where({ chave: def.chave }).first();
    if (!chave?.valor) throw new HttpError(400, `Salve a chave de ${def.nome} em Configurações antes de apontar um prompt para ele.`);
  }
  await db('prompts_ia').where({ slug: req.params.slug }).update({
    conteudo:    conteudo    ?? exists.conteudo,
    provedor:    provedorFinal,
    modelo:      modeloFinal,
    temperatura: temperatura ?? exists.temperatura,
    atualizado:  db.fn.now(),
  });

  // Invalida cache para o motorFluxo pegar a versão nova
  invalidateConfigCache();
  invalidarCachePrompts();

  const updated = await db('prompts_ia').where({ slug: req.params.slug }).first();
  res.json({ ok: true, prompt: updated });
}));

promptsRouter.post('/:slug/restaurar', asyncHandler(async (req, res) => {
  const db = getDb();
  const exists = await db('prompts_ia').where({ slug: req.params.slug }).first();
  if (!exists) throw new HttpError(404, 'Prompt não encontrado');

  await db('prompts_ia').where({ slug: req.params.slug }).update({
    conteudo:  exists.padrao,
    atualizado: db.fn.now(),
  });

  invalidateConfigCache();
  invalidarCachePrompts();
  res.json({ ok: true });
}));
