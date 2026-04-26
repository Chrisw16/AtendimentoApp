/**
 * telegram.js — Envio de mensagens via Telegram Bot API
 * Lê o token do banco (sistema_kv → telegram_bot_token)
 */
import { getDb } from '../config/db.js';

async function getBotToken() {
  const db = getDb();

  // Tenta 1: tabela canais (salvo pela página Canais → Telegram → Bot Token)
  const canal = await db('canais').where({ tipo: 'telegram' }).first();
  const tokenCanal = canal?.config?.bot_token || (
    typeof canal?.config === 'string'
      ? JSON.parse(canal.config || '{}')?.bot_token
      : null
  );
  if (tokenCanal) return tokenCanal;

  // Tenta 2: sistema_kv (salvo pela página Configurações → Integrações)
  const kv = await db('sistema_kv').where({ chave: 'telegram_bot_token' }).first();
  if (kv?.valor) {
    try { return JSON.parse(kv.valor); } catch { return kv.valor; }
  }

  throw new Error('Token do bot Telegram não configurado. Acesse Canais → Telegram → Bot Token.');
}

async function tgPost(method, body) {
  const token = await getBotToken();
  const res   = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
    signal:  AbortSignal.timeout(8000),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${data.description}`);
  return data.result;
}

export async function tgEnviarTexto(chatId, texto) {
  return tgPost('sendMessage', {
    chat_id:    chatId,
    text:       texto,
    parse_mode: 'Markdown',
  });
}

export async function tgEnviarBotoes(chatId, texto, botoes) {
  // Divide botões em linhas de 2 para melhor visualização
  const rows = [];
  const btnList = botoes.map(b => ({
    text:          b.label || b,
    callback_data: String(b.id || b.label || b).slice(0, 64),
  }));
  for (let i = 0; i < btnList.length; i += 2) {
    rows.push(btnList.slice(i, i + 2));
  }
  return tgPost('sendMessage', {
    chat_id:      chatId,
    text:         texto,
    parse_mode:   'Markdown',
    reply_markup: { inline_keyboard: rows },
  });
}

export async function tgEnviarImagem(chatId, url, legenda) {
  return tgPost('sendPhoto', { chat_id: chatId, photo: url, caption: legenda || '', parse_mode: 'Markdown' });
}

export async function tgSetWebhook(url) {
  return tgPost('setWebhook', { url });
}

export async function tgGetMe() {
  const token = await getBotToken();
  const res   = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  return res.json();
}
