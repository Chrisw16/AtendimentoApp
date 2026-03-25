/**
 * telegram.js — Handler do webhook do Telegram Bot
 * Rota: POST /channels/telegram
 */
import { Router } from "express";
import { getCanal } from "../services/canais.js";
import { getModo, receberMensagemCliente } from "../services/chatInterno.js";
import { verificarHorario, getSaudacao } from "../services/horario.js";
import { runMaxxi } from "../agent.js";
import { buscarMemoria, buscarSessao } from "../services/memoria.js";
import { logger } from "../services/logger.js";

export const telegramRouter = Router();

// Envia mensagem via Telegram API
async function sendTelegram(botToken, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  });
  return r.json();
}

// Configura webhook do bot
export async function configurarTelegramWebhook(botToken, webhookUrl) {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });
  return r.json();
}

telegramRouter.post("/", async (req, res) => {
  res.sendStatus(200); // Telegram precisa de resposta imediata

  try {
    const canal = getCanal("telegram");
    if (!canal?.ativo) return;

    const update = req.body;
    const msg    = update.message || update.edited_message;
    if (!msg) return;

    const chatId   = String(msg.chat.id);
    const texto    = msg.text || "";
    const nomeFull = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Usuário Telegram";
    const telefone = `tg_${chatId}`; // identificador único para Telegram

    logger.info(`✈️ Telegram | ${nomeFull}: ${texto.slice(0, 80)}`);

    const { aberto, mensagem } = verificarHorario();
    if (!aberto) {
      await sendTelegram(canal.config.bot_token, chatId, mensagem);
      return;
    }

    if (getModo() === "humano") {
      receberMensagemCliente({ convId: `tg_${chatId}`, telefone, nome: nomeFull, conteudo: texto, canal: "telegram", accountId: null });
      return;
    }

    // Modo bot — passa para Claude
    const protocolo = `TG-${Date.now()}`;
    const memoria   = buscarMemoria(telefone);
    const sessao    = buscarSessao(telefone);

    const result = await runMaxxi({
      accountId: null, conversationId: `tg_${chatId}`, messageId: msg.message_id,
      content: texto, sender: { name: nomeFull, phone_number: telefone },
      channel: "telegram", protocolo, memoria, telefone, sessao,
    });

    if (result?.reply) {
      await sendTelegram(canal.config.bot_token, chatId, result.reply);
    }
  } catch (e) {
    logger.error(`❌ Telegram handler: ${e.message}`);
  }
});
