import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { addClient, removeClient, broadcast, sendToAgente } from '../services/sseManager.js';
import { getDb } from '../config/db.js';
import { calcularUrgencia, detectarPalavrasCriticas, marcarAguardando, limparAguardando, getPosicaoNaFila, getTotalNaFila } from '../services/filaService.js';
import { processarMensagemCliente, analisarConversaEncerrada } from '../services/supervisoraIA.js';
import { evolutionEnviarTexto } from '../services/integrations.js';

export const chatRouter = Router();
chatRouter.use(authMiddleware);

// ── SSE ───────────────────────────────────────────────────────────
chatRouter.get('/sse', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const agenteId = req.agente.id;
  addClient(agenteId, res);

  const ping = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { clearInterval(ping); }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    removeClient(agenteId, res);
  });
});

// ── CONVERSAS ─────────────────────────────────────────────────────
chatRouter.get('/conversas', asyncHandler(async (req, res) => {
  const { status, canal, limit, offset } = req.query;
  const agenteId = req.agente.role !== 'admin' ? req.agente.id : undefined;

  const conversas = await conversaRepo.listar({ status, canal, agenteId, limit: Number(limit) || 100, offset: Number(offset) || 0 });
  const db = getDb();
  const modo = await db('sistema_kv').where({ chave: 'modo' }).first();

  // Enriquece com urgência da fila em tempo real
  const agora = Date.now();
  const enriched = conversas.map(c => ({
    ...c,
    urgencia: calcularUrgencia(c.aguardando_desde, c.prioridade),
  }));

  res.json({ conversas: enriched, modo: modo?.valor || 'bot' });
}));

chatRouter.get('/conversas/:id', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.porId(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  res.json({ ...conv, urgencia: calcularUrgencia(conv.aguardando_desde, conv.prioridade) });
}));

// ── MENSAGENS ─────────────────────────────────────────────────────
chatRouter.get('/conversas/:id/mensagens', asyncHandler(async (req, res) => {
  const { limit, before } = req.query;
  const msgs = await mensagemRepo.listar(req.params.id, { limit: Number(limit) || 50, before });
  await conversaRepo.zerarNaoLidas(req.params.id);
  await mensagemRepo.marcarLidas(req.params.id);
  res.json({ mensagens: msgs });
}));

chatRouter.post('/conversas/:id/mensagens', asyncHandler(async (req, res) => {
  const { texto, tipo = 'texto', url, mime } = req.body;
  if (!texto && !url) throw new HttpError(400, 'texto ou url obrigatório');

  const conv = await conversaRepo.porId(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  if (conv.status === 'encerrada') throw new HttpError(400, 'Conversa encerrada');

  const msg = await mensagemRepo.criar({
    conversa_id: req.params.id,
    agente_id:   req.agente.id,
    origem:      'agente',
    tipo, texto, url, mime,
  });

  // Atualiza timestamps de SLA do agente
  const db = getDb();
  const patch = { ultima_msg_agente_em: db.fn.now(), atualizado: db.fn.now() };
  const updConv = await db('conversas').where({ id: req.params.id }).select('primeira_msg_agente_em').first();
  if (!updConv?.primeira_msg_agente_em) patch.primeira_msg_agente_em = db.fn.now();
  await db('conversas').where({ id: req.params.id }).update(patch);

  // Broadcast SSE
  broadcast('mensagem', { ...msg, agente_nome: req.agente.nome });

  // Supervisora IA — analisa sentimento se mensagem do cliente em conversa com agente
  if (conv.agente_id && req.agente.role !== 'admin') {
    // mensagem do agente — não precisa analisar
  }

  // Envia para canal externo (WhatsApp via Evolution API)
  if (conv.canal === 'whatsapp' && conv.telefone && texto) {
    const instancia = conv.canal_instancia || conv.canal || 'default';
    evolutionEnviarTexto(instancia, conv.telefone, texto)
      .catch(err => console.error('[Chat] Evolution send failed:', err.message));
  }

  res.status(201).json(msg);
}));

// ── AÇÕES NA CONVERSA ─────────────────────────────────────────────
chatRouter.post('/conversas/:id/assumir', asyncHandler(async (req, res) => {
  const db = getDb();
  const [conv] = await db('conversas').where({ id: req.params.id })
    .update({ status: 'ativa', agente_id: req.agente.id, aguardando_desde: null, assumido_em: db.fn.now(), atualizado: db.fn.now() })
    .returning('*');
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');

  await limparAguardando(req.params.id);
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: `✅ Conversa assumida por ${req.agente.nome}` });

  broadcast('conversa_atualizada', { ...conv, urgencia: { nivel: 'ok', minutos: 0 } });
  res.json(conv);
}));

chatRouter.post('/conversas/:id/devolver-ia', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.devolverIA(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: '🤖 Devolvido para atendimento da IA' });
  broadcast('conversa_atualizada', conv);
  res.json(conv);
}));

chatRouter.post('/conversas/:id/encerrar', asyncHandler(async (req, res) => {
  const { motivo } = req.body;
  const conv = await conversaRepo.encerrar(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  if (motivo) await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: `🔴 Conversa encerrada: ${motivo}` });
  broadcast('conversa_atualizada', conv);
  res.json(conv);
}));

chatRouter.post('/conversas/:id/transferir', asyncHandler(async (req, res) => {
  const { agente_id } = req.body;
  if (!agente_id) throw new HttpError(400, 'agente_id obrigatório');

  const db = getDb();
  const destino = await db('agentes').where({ id: agente_id, ativo: true }).first();
  if (!destino) throw new HttpError(404, 'Agente destino não encontrado');

  const conv = await conversaRepo.atualizar(req.params.id, { agente_id, status: 'ativa' });
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: `🔄 Transferido para ${destino.nome}` });

  broadcast('conversa_atualizada', conv);
  sendToAgente(agente_id, 'nova_conversa', conv);
  res.json(conv);
}));

// ── FILA ──────────────────────────────────────────────────────────
chatRouter.get('/fila', asyncHandler(async (req, res) => {
  const db = getDb();
  const fila = await db('conversas')
    .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
    .where({ 'conversas.status': 'aguardando' })
    .whereNotNull('conversas.aguardando_desde')
    .orderByRaw('conversas.prioridade DESC, conversas.aguardando_desde ASC')
    .select(['conversas.*', 'agentes.nome as agente_nome']);

  const total = fila.length;
  const enriched = fila.map((c, i) => ({
    ...c,
    pos_na_fila: i + 1,
    urgencia: calcularUrgencia(c.aguardando_desde, c.prioridade),
  }));

  res.json({ fila: enriched, total });
}));

// ── NOTAS INTERNAS ────────────────────────────────────────────────
chatRouter.post('/conversas/:id/notas', asyncHandler(async (req, res) => {
  const { texto } = req.body;
  if (!texto) throw new HttpError(400, 'texto obrigatório');
  const db = getDb();
  const [nota] = await db('notas').insert({ conversa_id: req.params.id, agente_id: req.agente.id, texto }).returning('*');
  sendToAgente(req.agente.id, 'nota_criada', nota);
  res.status(201).json(nota);
}));

chatRouter.get('/conversas/:id/notas', asyncHandler(async (req, res) => {
  const db = getDb();
  const notas = await db('notas')
    .leftJoin('agentes', 'notas.agente_id', 'agentes.id')
    .where({ 'notas.conversa_id': req.params.id })
    .select(['notas.*', 'agentes.nome as agente_nome'])
    .orderBy('notas.criado_em');
  res.json(notas);
}));

// ── REAÇÕES E EXCLUSÃO ────────────────────────────────────────────
chatRouter.post('/mensagens/:msgId/reacao', asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) throw new HttpError(400, 'emoji obrigatório');
  const msg = await mensagemRepo.reagir(req.params.msgId, emoji, req.agente.id);
  if (!msg) throw new HttpError(404, 'Mensagem não encontrada');
  broadcast('mensagem_atualizada', msg);
  res.json(msg);
}));

chatRouter.delete('/mensagens/:msgId', asyncHandler(async (req, res) => {
  const msg = await mensagemRepo.apagar(req.params.msgId);
  if (!msg) throw new HttpError(404, 'Mensagem não encontrada');
  broadcast('mensagem_removida', { id: msg.id, conversa_id: msg.conversa_id });
  res.json({ ok: true });
}));

// ── RESPOSTAS RÁPIDAS ─────────────────────────────────────────────
chatRouter.get('/respostas-rapidas', asyncHandler(async (req, res) => {
  const db = getDb();
  const rr = await db('respostas_rapidas')
    .where(q => q.whereNull('agente_id').orWhere('agente_id', req.agente.id))
    .orderBy('titulo');
  res.json(rr);
}));

// ── MODO BOT/HUMANO ───────────────────────────────────────────────
chatRouter.put('/modo', adminMiddleware, asyncHandler(async (req, res) => {
  const { modo } = req.body;
  if (!['bot', 'humano'].includes(modo)) throw new HttpError(400, 'modo inválido');
  const db = getDb();
  await db('sistema_kv').insert({ chave: 'modo', valor: JSON.stringify(modo) }).onConflict('chave').merge();
  broadcast('modo_alterado', { modo });
  res.json({ modo });
}));

// ── STATS DA FILA (para o dashboard) ────────────────────────────
chatRouter.get('/stats', asyncHandler(async (req, res) => {
  const db = getDb();
  const [total, aguardando, ativos, ia] = await Promise.all([
    db('conversas').whereNot({ status: 'encerrada' }).count('id as n').first(),
    db('conversas').where({ status: 'aguardando' }).count('id as n').first(),
    db('conversas').where({ status: 'ativa' }).count('id as n').first(),
    db('conversas').where({ status: 'ia' }).count('id as n').first(),
  ]);
  res.json({
    total:      Number(total?.n || 0),
    aguardando: Number(aguardando?.n || 0),
    ativas:     Number(ativos?.n || 0),
    ia:         Number(ia?.n || 0),
  });
}));
