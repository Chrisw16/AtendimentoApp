/**
 * telegram.js — Handler do webhook do Telegram Bot
 */
import { registrarMensagem, registrarRespostaIA, resolverConvId } from "../services/chatInterno.js";
import { iniciarReativacao, cancelarReativacao } from "../services/reativacao.js";
import { verificarAlerta } from "../services/alertas.js";
import { runMaxxi }                         from "../agent.js";
import { dentroDoHorario, getHorarios }     from "../services/crm.js";
import { getCanal }                         from "../services/canais.js";
import { buscarMemoria, buscarSessao }      from "../services/memoria.js";
import { logger }                           from "../services/logger.js";

// Envia mensagem pelo Telegram
// Quebra mensagens longas em partes (Telegram tem limite de 4096 chars)
export async function sendTelegram(chatId, text, token) {
  const MAX = 4000;
  const partes = [];
  let txt = text || "";

  // Divide por \n---\n ou por tamanho
  const blocos = txt.split("\n---\n").filter(Boolean);
  for (const bloco of blocos) {
    if (bloco.length <= MAX) {
      partes.push(bloco.trim());
    } else {
      // Divide em chunks
      for (let i = 0; i < bloco.length; i += MAX) {
        partes.push(bloco.slice(i, i + MAX).trim());
      }
    }
  }

  for (const parte of partes) {
    if (!parte) continue;
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: parte,
        parse_mode: "Markdown",
      }),
    });
    const d = await r.json();
    if (!d.ok) {
      // Tenta sem markdown se falhou (pode ter caracteres inválidos)
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text: parte }),
      });
    }
    // Pequena pausa entre mensagens para não ser spam
    if (partes.length > 1) await new Promise(r => setTimeout(r, 300));
  }
}

export async function handleTelegramWebhook(req, res) {
  res.sendStatus(200); // Responde imediatamente — Telegram exige < 2s

  try {
    const canal = await getCanal("telegram");
    if (!canal?.ativo || !canal?.config?.botToken) {
      logger.warn("⚠️ Telegram: canal inativo ou sem token");
      return;
    }

    const { message, callback_query } = req.body;

    // Callback de botões inline (caso futuro)
    if (callback_query) {
      logger.info(`📲 Telegram callback: ${callback_query.data}`);
      return;
    }

    if (!message) return;

    const chatId   = String(message.chat.id);
    const nome     = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || "Usuário";
    const token    = canal.config.botToken;

    // Determina conteúdo da mensagem
    let conteudo = "";
    if (message.text)     conteudo = message.text;
    else if (message.voice) conteudo = "[mensagem de voz]";
    else if (message.photo) conteudo = "[imagem]";
    else if (message.document) conteudo = "[documento: " + (message.document.file_name || "arquivo") + "]";
    else if (message.sticker) conteudo = "[sticker]";
    else return; // Tipo não suportado

    cancelarReativacao(`telegram_${chatId}`);
    logger.info(`📩 Telegram | ${nome} (${chatId}): ${conteudo.slice(0, 60)}`);

    // Fora do horário
    if (!(await dentroDoHorario())) {
      const h = await getHorarios();
      await sendTelegram(chatId, h.mensagemForaHorario || "Estamos fora do horário de atendimento.", token);
      return;
    }

    const baseConvId = `tg_${chatId}`;
    // Se cliente retorna após conversa encerrada, novo protocolo = novo convId
    const convId = await resolverConvId(baseConvId, chatId, "telegram");

    // Sempre registra no chat interno (agentes podem monitorar)
    await registrarMensagem({
      convId, telefone: chatId, nome, conteudo,
      canal: "telegram", accountId: null, statusInicial: "ia",
    });

    // Verifica se agente já assumiu esta conversa específica
    const { estaComHumano } = await import("../services/handoff.js");
    if (estaComHumano(convId)) {
      logger.info(`👨 Conv Telegram ${chatId} está com agente humano - IA silenciada`);
      // Garante status correto no banco
      const { getHandoffInfo } = await import("../services/handoff.js");
      const hi = getHandoffInfo(convId);
      if (hi && !hi.agenteId) {
        const { atualizarStatus } = await import("../services/chatInterno.js");
        await atualizarStatus(convId, "aguardando").catch(() => {});
      }
      return;
    }

    // Indicador de digitando
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, action: "typing" }),
    }).catch(() => {});

    // Roda a IA
    const memoria   = await buscarMemoria(chatId);
    const sessao    = await buscarSessao(chatId);
    const protocolo = `TG-${Date.now().toString(36).toUpperCase()}`;

    const result = await runMaxxi({
      accountId: null,
      conversationId: convId,
      messageId: message.message_id,
      content: conteudo,
      sender: { name: nome, phone_number: chatId },
      channel: "telegram",
      protocolo, memoria, telefone: chatId, sessao,
    });

    if (result?.reply) {
      await registrarRespostaIA(convId, result.reply);
      await sendTelegram(chatId, result.reply, token);
      // Inicia reativação
      if (!result?.handoff && !result?.resolve) {
        iniciarReativacao({
          convId, canal: "telegram", telefone: chatId, accountId: null,
          enviarFn: async (_cId, _canal, tel, _accId, msg) => {
            await sendTelegram(tel, msg, token);
          },
        }).catch(() => {});
      }
    }

    // Handoff → envia aviso ao cliente e coloca na fila aguardando
    if (result?.handoff) {
      const { transferirParaHumano } = await import("../services/handoff.js");
      // Envia mensagem de confirmação se IA não enviou ainda
      if (!result?.reply) {
        const msgAviso = "⏳ Transferindo para um atendente humano... Aguarde um momento, em breve você será atendido!";
        await registrarRespostaIA(convId, msgAviso).catch(() => {});
        await sendTelegram(chatId, msgAviso, token).catch(() => {});
      }
      await transferirParaHumano(convId, null, "Transferido pela IA");
    }

    // Salva sessão
    if (result?.sessaoAtualizada) {
      const { salvarSessao } = await import("../services/memoria.js");
      await salvarSessao(chatId, result.sessaoAtualizada);
    }

  } catch (e) {
    logger.error(`❌ Telegram erro: ${e.message}\n${e.stack}`);
  }
}

export async function registrarWebhookTelegram(token, webhookUrl) {
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl.replace("http://", "https://"), allowed_updates: ["message", "callback_query"] }),
  });
  return r.json();
}

// Verifica se o webhook está configurado
export async function verificarWebhookTelegram(token) {
  const r = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  return r.json();
}
