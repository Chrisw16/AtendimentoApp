import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler, HttpError }        from '../middlewares/errorHandler.js';
import { conversaRepo }   from '../repositories/conversaRepository.js';
import { mensagemRepo }   from '../repositories/mensagemRepository.js';
import { addClient, removeClient, broadcast, sendToAgente } from '../services/sseManager.js';
import { getDb } from '../config/db.js';
import { calcularUrgencia, detectarPalavrasCriticas, marcarAguardando, limparAguardando, getPosicaoNaFila, getTotalNaFila, filasDoAgente, contarAtivas, transferirParaFila, assumirConversa } from '../services/filaService.js';
import { conversaVisivel, podeAssumir } from '../services/filasHelpers.js';
import { processarMensagemCliente, analisarConversaEncerrada } from '../services/supervisoraIA.js';
import { evolutionEnviarTexto } from '../services/integrations.js';
import { tgEnviarTexto } from '../services/telegram.js';
import { auditar, ipDe } from '../services/auditoria.js';

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
    // O 3º argumento é a FILA: sem ele a listagem usava o SLA padrão 5/15 para
    // todo mundo, enquanto `/chat/fila` e `transferir-fila` usavam o SLA da
    // fila. A mesma conversa aparecia "crítica" numa tela e "ok" na outra.
    urgencia: calcularUrgencia(c.aguardando_desde, c.prioridade, c),
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

  // Envia para canal externo
  if (conv.telefone && texto) {
    if (conv.canal === 'whatsapp') {
      const instancia = conv.canal_instancia || conv.canal || 'default';
      evolutionEnviarTexto(instancia, conv.telefone, texto)
        .catch(err => console.error('[Chat] Evolution send failed:', err.message));
    } else if (conv.canal === 'telegram') {
      tgEnviarTexto(conv.telefone, texto)
        .catch(err => console.error('[Chat] Telegram send failed:', err.message));
    }
  }

  res.status(201).json(msg);
}));

// ── AÇÕES NA CONVERSA ─────────────────────────────────────────────
chatRouter.post('/conversas/:id/assumir', asyncHandler(async (req, res) => {
  const db  = getDb();
  const ehAdmin = req.agente.role === 'admin';

  const agente = await db('agentes').select('capacidade', 'nome').where({ id: req.agente.id }).first();
  if (!podeAssumir(agente?.capacidade, await contarAtivas(req.agente.id))) {
    throw new HttpError(409, `Capacidade cheia (${agente.capacidade} conversas simultâneas)`);
  }

  // A corrida entre dois cliques e a regra de quem pode tomar conversa alheia
  // moram em `filaService.assumirConversa` — testadas contra Postgres.
  const { conv, erro, donoId } = await assumirConversa(req.params.id, { agenteId: req.agente.id, ehAdmin });
  if (erro === 'nao_encontrada') throw new HttpError(404, 'Conversa não encontrada');
  if (erro === 'ocupada') {
    const dono = await db('agentes').select('nome').where({ id: donoId }).first();
    throw new HttpError(409, `Conversa já está com ${dono?.nome || 'outro agente'}`);
  }

  await limparAguardando(req.params.id);
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'conversa_assumida', conversaId: conv.id, ip: ipDe(req) });
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: `✅ Conversa assumida por ${req.agente.nome}` });

  broadcast('conversa_atualizada', { ...conv, urgencia: { nivel: 'ok', minutos: 0 } });
  res.json(conv);
}));

chatRouter.post('/conversas/:id/devolver-ia', asyncHandler(async (req, res) => {
  const conv = await conversaRepo.devolverIA(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'conversa_devolvida_ia', conversaId: conv.id, ip: ipDe(req) });
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: '🤖 Devolvido para atendimento da IA' });
  broadcast('conversa_atualizada', conv);

  // §13 — a automação retoma de onde parou. A lógica mora no motor
  // (`retomarAutomacao`) e não aqui, para ser testável sem subir HTTP+auth.
  const { retomarAutomacao } = await import('../services/motorFluxo.js');
  retomarAutomacao(conv).catch(err =>
    console.error('[Chat] Retomada do fluxo falhou:', err.message));

  res.json(conv);
}));

chatRouter.post('/conversas/:id/encerrar', asyncHandler(async (req, res) => {
  const { motivo } = req.body;
  const conv = await conversaRepo.encerrar(req.params.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');
  auditar({ actorType: 'human', actorId: req.agente.id, action: 'conversa_encerrada', conversaId: conv.id, after: motivo ? { motivo } : null, ip: ipDe(req) });
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

chatRouter.post('/conversas/:id/transferir-fila', asyncHandler(async (req, res) => {
  const { fila_id } = req.body || {};
  if (!fila_id) throw new HttpError(400, 'fila_id obrigatório');

  const db   = getDb();
  const fila = await db('filas').where({ id: fila_id }).first();
  if (!fila) throw new HttpError(404, 'Fila não encontrada');
  if (!fila.ativa) throw new HttpError(409, 'Fila inativa');

  const conv = await transferirParaFila(req.params.id, fila.id);
  if (!conv) throw new HttpError(404, 'Conversa não encontrada');

  auditar({ actorType: 'human', actorId: req.agente.id, action: 'conversa_transferida_fila', conversaId: conv.id, after: { fila: fila.slug }, ip: ipDe(req) });
  await mensagemRepo.criar({ conversa_id: conv.id, origem: 'sistema', tipo: 'texto', texto: `🔄 Transferida para a fila ${fila.nome}` });

  // Volta para a fila de espera: quem estava atendendo perde a conversa, e o
  // broadcast é para TODO mundo justamente porque agora ela é da fila, não de
  // um agente. `sendToAgente` aqui deixaria a conversa invisível até o F5.
  broadcast('conversa_atualizada', { ...conv, fila_nome: fila.nome, urgencia: calcularUrgencia(conv.aguardando_desde, conv.prioridade, fila && { atencao_min: fila.sla_atencao_min, critico_min: fila.sla_critico_min }) });
  res.json(conv);
}));

// ── FILA ──────────────────────────────────────────────────────────
chatRouter.get('/fila', asyncHandler(async (req, res) => {
  const db = getDb();
  const fila = await db('conversas')
    .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
    .leftJoin('filas', 'filas.id', 'conversas.fila_id')
    .where({ 'conversas.status': 'aguardando' })
    .whereNotNull('conversas.aguardando_desde')
    .orderByRaw('conversas.prioridade DESC, conversas.aguardando_desde ASC')
    .select(['conversas.*', 'agentes.nome as agente_nome', 'filas.nome as fila_nome',
      'filas.cor as fila_cor', 'filas.sla_atencao_min as atencao_min', 'filas.sla_critico_min as critico_min']);

  // FASE 5: a posição na fila é calculada ANTES do filtro de visibilidade. O
  // cliente é o 7º da fila real, não o 3º da fatia que este agente enxerga —
  // dizer "3º" para quem vai esperar 7 é pior que não dizer nada.
  const comPos = fila.map((c, i) => ({
    ...c,
    pos_na_fila: i + 1,
    urgencia: calcularUrgencia(c.aguardando_desde, c.prioridade, c),
  }));

  const agente   = { role: req.agente.role, filaIds: await filasDoAgente(req.agente.id) };
  const visiveis = comPos.filter(c => conversaVisivel(c, agente));

  res.json({ fila: visiveis, total: visiveis.length, total_geral: comPos.length });
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
