/**
 * copiloto.js — o assistente do atendente (FASE 10).
 *
 * GET  /api/copiloto/:conversaId            — painel: próxima ação, sinais, resumo, procedimento
 * POST /api/copiloto/:conversaId/sugestao   — gera a sugestão de resposta (§78)
 * POST /api/copiloto/:conversaId/evento     — o que o atendente fez com ela (§87)
 * POST /api/copiloto/:conversaId/feedback   — útil/inútil + motivo (§86)
 * GET  /api/copiloto/metricas               — agregado (admin)
 *
 * A execução de tool recomendada (§80) NÃO ganhou rota nova: ela já existe em
 * `/api/cliente360/:id/acao`, com allowlist, permissão e auditoria. Duplicar
 * aqui abriria um segundo caminho para o mesmo poder — e um deles ficaria sem
 * a checagem que o outro tem.
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }         from '../middlewares/errorHandler.js';
import { conversaRepo } from '../repositories/conversaRepository.js';
import { pode }         from '../services/permissoes.js';
import { analisar, sugerir, registrarEvento, metricas } from '../services/copiloto.js';

export const copilotoRouter = Router();
copilotoRouter.use(authMiddleware);

const EVENTOS = ['inserida', 'editada', 'enviada', 'ignorada', 'acao_recomendada', 'acao_executada'];

copilotoRouter.get('/metricas', adminMiddleware, asyncHandler(async (req, res) => {
  res.json(await metricas({ dias: Number(req.query.dias) || 7 }));
}));

async function conversaDa(req) {
  const conversa = await conversaRepo.porId(req.params.conversaId);
  if (!conversa) throw new HttpError(404, 'Conversa não encontrada');
  return conversa;
}

copilotoRouter.get('/:conversaId', asyncHandler(async (req, res) => {
  // O painel usa a ficha do Cliente 360 — quem não pode ver a ficha não pode
  // ver o copiloto, senão o resumo vira a porta dos fundos da permissão.
  if (!pode(req.agente, 'cliente360')) throw new HttpError(403, 'Sem permissão para o painel do cliente');
  const { _mensagens, ...painel } = await analisar(await conversaDa(req), req.agente);
  res.json(painel);   // `_mensagens` é reuso interno, não payload de tela
}));

copilotoRouter.post('/:conversaId/sugestao', asyncHandler(async (req, res) => {
  if (!pode(req.agente, 'cliente360')) throw new HttpError(403, 'Sem permissão');
  const conversa = await conversaDa(req);
  try {
    res.json(await sugerir(conversa, req.agente, { instrucao: req.body?.instrucao || null }));
  } catch (err) {
    // Falha de IA aqui não é erro de sistema: o atendente segue digitando. A
    // mensagem precisa dizer isso, senão ele acha que o chat quebrou.
    throw new HttpError(503, `Copiloto indisponível agora (${err.message}). Você pode responder normalmente.`);
  }
}));

copilotoRouter.post('/:conversaId/evento', asyncHandler(async (req, res) => {
  const { evento, acao = null, texto = null } = req.body || {};
  if (!EVENTOS.includes(evento)) throw new HttpError(400, `Evento inválido: ${evento}`);

  await registrarEvento({
    conversaId: req.params.conversaId, agenteId: req.agente.id, evento, acao,
    // Só guarda o texto quando ele diz alguma coisa: a sugestão que o atendente
    // EDITOU é a que ensina o que o copiloto errou. As outras são ruído com PII.
    texto: evento === 'editada' ? texto : null,
  });
  res.status(204).end();
}));

copilotoRouter.post('/:conversaId/feedback', asyncHandler(async (req, res) => {
  const { feedback, motivo = null } = req.body || {};
  if (!['positivo', 'negativo'].includes(feedback)) throw new HttpError(400, 'feedback deve ser positivo ou negativo');
  await registrarEvento({
    conversaId: req.params.conversaId, agenteId: req.agente.id,
    evento: 'feedback', feedback, motivo,
  });
  res.status(204).end();
}));
