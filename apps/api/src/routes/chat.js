import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { addClient, removeClient, broadcast, sendToAgente } from '../services/sseManager.js';
import { getDb }          from '../config/db.js';

export const chatRouter = Router();
chatRouter.use(authMiddleware);

// ── SSE — /api/chat/sse ───────────────────────────────────────────
chatRouter.get('/sse', (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const agenteId = req.agente.id;
  addClient(agenteId, res);

  // Ping a cada 25s para manter conexão viva
  const ping = setInterval(() => {
    try { res.write(':ping\n\n'); } catch { clearInterval(ping); }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    removeClient(agenteId, res);
  });
});

// ── CONVERSAS ─────────────────────────────────────────────────────
// GET /api/chat/conversas
chatRouter.get('/conversas', asyncHandler(async (req, res) => {
  const { status, canal, limit, offset } = req.query;

  // Agentes só veem suas próprias conversas ativas; admins veem tudo
  const agenteId = req.agente.role !== 'admin' ? req.agente.id : undefined;

  const conversas = await conversaRepo.listar({
    status,
    canal,
    agenteId,
    limit:  Number(limit)  || 100,
    offset: Number(offset) || 0,
  });

  const db   = getDb();
  const modo = await db('sistema_kv').where({ chave: 'modo' }).first();

  res.json({ conversas, modo: modo?.valor || 'bot' });
}));

// GET /api/chat/conversas/:id
chatRouter.get('/conversas/:id', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.porId(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  res.json(conv);
}));

// ── MENSAGENS ─────────────────────────────────────────────────────
// GET /api/chat/conversas/:id/mensagens
chatRouter.get('/conversas/:id/mensagens', asyncHandler(async (req, res) => {
  const { limit, before } = req.query;
  const msgs = await mensagemRepo.listar(req.params.id, {
    limit:  Number(limit) || 50,
    before,
  });

  // Zera não lidas ao abrir
  await conversaRepo.zerarNaoLidas(req.params.id);
  await mensagemRepo.marcarLidas(req.params.id);

  res.json({ mensagens: msgs });
}));

// POST /api/chat/conversas/:id/mensagens
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
    tipo,
    texto,
    url,
    mime,
  });

  // Broadcast SSE para todos os agentes
  broadcast('mensagem', { ...msg, agente_nome: req.agente.nome });

  // TODO: enviar para canal externo (WhatsApp, Telegram, etc)
  // await canalService.enviar(conv, msg);

  res.status(201).json(msg);
}));

// ── AÇÕES NA CONVERSA ─────────────────────────────────────────────
// POST /api/chat/conversas/:id/assumir
chatRouter.post('/conversas/:id/assumir', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.assumir(req.params.id, req.agente.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');

  // Mensagem de sistema
  await mensagemRepo.criar({
    conversa_id: conv.id,
    origem:      'sistema',
    tipo:        'texto',
    texto:       `Conversa assumida por ${req.agente.nome}`,
  });

  broadcast('conversa_atualizada', conv);
  res.json(conv);
}));

// POST /api/chat/conversas/:id/devolver-ia
chatRouter.post('/conversas/:id/devolver-ia', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.devolverIA(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');

  broadcast('conversa_atualizada', conv);
  res.json(conv);
}));

// POST /api/chat/conversas/:id/encerrar
chatRouter.post('/conversas/:id/encerrar', asyncHandler(async (req, res) => {
  const { motivo } = req.body;
  const conv = await conversaRepo.encerrar(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');

  if (motivo) {
    await mensagemRepo.criar({
      conversa_id: conv.id,
      origem:      'sistema',
      tipo:        'texto',
      texto:       `Conversa encerrada: ${motivo}`,
    });
  }

  broadcast('conversa_atualizada', conv);
  res.json(conv);
}));

// POST /api/chat/conversas/:id/transferir
chatRouter.post('/conversas/:id/transferir', asyncHandler(async (req, res) => {
  const { agente_id } = req.body;
  if (!agente_id) throw new HttpError(400, 'agente_id obrigatório');

  const db = getDb();
  const destino = await db('agentes').where({ id: agente_id, ativo: true }).first();
  if (!destino) throw new HttpError(404, 'Agente destino não encontrado');

  const conv = await conversaRepo.atualizar(req.params.id, {
    agente_id,
    status: 'ativa',
  });

  await mensagemRepo.criar({
    conversa_id: conv.id,
    origem:      'sistema',
    tipo:        'texto',
    texto:       `Conversa transferida para ${destino.nome}`,
  });

  broadcast('conversa_atualizada', conv);
  sendToAgente(agente_id, 'nova_conversa', conv);
  res.json(conv);
}));

// POST /api/chat/conversas/:id/notas
chatRouter.post('/conversas/:id/notas', asyncHandler(async (req, res) => {
  const { texto } = req.body;
  if (!texto) throw new HttpError(400, 'texto obrigatório');

  const db = getDb();
  const [nota] = await db('notas').insert({
    conversa_id: req.params.id,
    agente_id:   req.agente.id,
    texto,
  }).returning('*');

  // Nota é uma mensagem interna — não vai para SSE público
  sendToAgente(req.agente.id, 'nota_criada', nota);
  res.status(201).json(nota);
}));

// ── REAÇÕES ───────────────────────────────────────────────────────
// POST /api/chat/mensagens/:msgId/reacao
chatRouter.post('/mensagens/:msgId/reacao', asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) throw new HttpError(400, 'emoji obrigatório');

  const msg = await mensagemRepo.reagir(req.params.msgId, emoji, req.agente.id);
  if (!msg) throw new HttpError(404, 'Mensagem não encontrada');

  broadcast('mensagem_atualizada', msg);
  res.json(msg);
}));

// DELETE /api/chat/mensagens/:msgId
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
  await db('sistema_kv')
    .insert({ chave: 'modo', valor: JSON.stringify(modo) })
    .onConflict('chave').merge();

  broadcast('modo_alterado', { modo });
  res.json({ modo });
}));
