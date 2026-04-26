/**
 * webhooks/telegram.js
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

export async function handleTelegram(body) {
  // Callback de botão inline — transforma em mensagem de texto
  if (body?.callback_query) {
    const cb     = body.callback_query;
    const chatId = String(cb.message?.chat?.id);
    const texto  = cb.data; // valor do botão clicado
    const nome   = [cb.from?.first_name, cb.from?.last_name].filter(Boolean).join(' ') || null;

    // Responde ao Telegram para remover o "loading" do botão
    const { tgEnviarTexto } = await import('../telegram.js');
    try {
      const token = await _getBotToken();
      await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cb.id }),
      });
    } catch {}

    // Processa como se fosse uma mensagem de texto normal
    await processarMensagemTelegram(chatId, nome, texto, `cb-${cb.id}`);
    return;
  }

  const msg = body?.message || body?.edited_message;
  if (!msg) return;

  const chatId = String(msg.chat?.id);
  const nome   = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null;
  const external = String(msg.message_id);
  const { texto, tipo } = extrairConteudoTelegram(msg);
  await processarMensagemTelegram(chatId, nome, texto, `tg-${external}`, tipo);
}

async function _getBotToken() {
  const { getDb } = await import('../../config/db.js');
  const db = getDb();
  const canal = await db('canais').where({ tipo: 'telegram' }).first();
  const t = canal?.config?.bot_token || (typeof canal?.config === 'string' ? JSON.parse(canal.config || '{}')?.bot_token : null);
  if (t) return t;
  const kv = await db('sistema_kv').where({ chave: 'telegram_bot_token' }).first();
  if (kv?.valor) { try { return JSON.parse(kv.valor); } catch { return kv.valor; } }
  throw new Error('Token Telegram não configurado');
}

async function processarMensagemTelegram(chatId, nome, texto, externalId, tipo = 'texto') {
  const existe = await mensagemRepo.porExternalId(externalId);
  if (existe) return;

  let conversa = await conversaRepo.porTelefoneCanal(chatId, 'telegram');
  if (!conversa) {
    conversa = await conversaRepo.criar({ canal: 'telegram', telefone: chatId, nome, status: 'ia' });
    broadcast('nova_conversa', conversa);
  }

  const mensagem = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'cliente',
    tipo,
    texto,
    external_id: externalId,
  });

  await conversaRepo.incrementarNaoLidas(conversa.id);
  broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
  broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));

  if (conversa.status === 'ia') {
    const { processarConversa } = await import('../motorFluxo.js');
    processarConversa(conversa, mensagem).catch(err =>
      console.error('[Webhook Telegram] Motor fluxo erro:', err.message)
    );
  }

  if (conversa.status === 'ativa' && conversa.agente_id && texto) {
    const { processarMensagemCliente } = await import('../supervisoraIA.js');
    processarMensagemCliente(conversa, mensagem).catch(() => {});
  }
}



function extrairConteudoTelegram(msg) {
  if (msg.text)     return { tipo: 'texto', texto: msg.text };
  if (msg.photo)    return { tipo: 'imagem', texto: msg.caption || null };
  if (msg.voice)    return { tipo: 'audio',  texto: null };
  if (msg.video)    return { tipo: 'video',  texto: msg.caption || null };
  if (msg.document) return { tipo: 'doc',    texto: msg.document.file_name || null };
  if (msg.location) return { tipo: 'texto',  texto: `📍 ${msg.location.latitude}, ${msg.location.longitude}` };
  if (msg.sticker)  return { tipo: 'texto',  texto: '🎭 [sticker]' };
  return { tipo: 'texto', texto: '[mensagem não suportada]' };
}
