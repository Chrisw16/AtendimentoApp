/**
 * meta.js — Handler unificado para WhatsApp Oficial, Instagram DM, Facebook Messenger
 * Rotas:
 *   GET  /channels/meta/:tipo  → verificação do webhook (Meta exige)
 *   POST /channels/meta/:tipo  → recebe mensagens
 */
import { Router } from "express";
import { getCanal } from "../services/canais.js";
import { getModo, receberMensagemCliente } from "../services/chatInterno.js";
import { verificarHorario } from "../services/horario.js";
import { runMaxxi } from "../agent.js";
import { buscarMemoria, buscarSessao } from "../services/memoria.js";
import { logger } from "../services/logger.js";

export const metaRouter = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
async function sendWhatsApp(config, to, text) {
  const r = await fetch(`https://graph.facebook.com/v18.0/${config.phone_number_id}/messages`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body: text } }),
  });
  return r.json();
}

async function sendFBMessenger(pageId, accessToken, recipientId, text) {
  const r = await fetch(`https://graph.facebook.com/v18.0/${pageId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, recipient: { id: recipientId }, message: { text } }),
  });
  return r.json();
}

async function sendInstagram(accessToken, recipientId, text) {
  const r = await fetch("https://graph.facebook.com/v18.0/me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken, recipient: { id: recipientId }, message: { text } }),
  });
  return r.json();
}

// ── Verificação webhook (GET) ─────────────────────────────────────────────────
metaRouter.get("/:tipo", (req, res) => {
  const { tipo } = req.params;
  const canal    = getCanal(tipo);
  if (!canal) return res.sendStatus(404);

  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === canal.config.verify_token) {
    logger.info(`✅ Meta webhook verificado: ${tipo}`);
    return res.send(challenge);
  }
  res.sendStatus(403);
});

// ── Recebe mensagens (POST) ───────────────────────────────────────────────────
metaRouter.post("/:tipo", async (req, res) => {
  res.sendStatus(200);
  const { tipo } = req.params;

  try {
    const canal = getCanal(tipo);
    if (!canal?.ativo) return;

    const body = req.body;

    // ─── WhatsApp Oficial ──────────────────────────────────────────────────
    if (tipo === "whatsapp_oficial") {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0]?.value;
      const msgs  = changes?.messages;
      if (!msgs?.length) return;

      for (const msg of msgs) {
        if (msg.type !== "text" && msg.type !== "audio" && msg.type !== "image") continue;
        const from  = msg.from; // número do usuário
        const texto = msg.text?.body || `[${msg.type}]`;
        const nome  = changes.contacts?.[0]?.profile?.name || from;

        logger.info(`📱 WA Oficial | ${nome}: ${texto.slice(0, 80)}`);
        await processarMsg({ convId: `wa_${from}`, telefone: from, nome, texto, canal: "whatsapp_oficial", tipo, config: canal.config, remetente: from });
      }
    }

    // ─── Facebook Messenger ────────────────────────────────────────────────
    if (tipo === "facebook") {
      for (const entry of (body.entry || [])) {
        for (const ev of (entry.messaging || [])) {
          if (!ev.message?.text) continue;
          const senderId = ev.sender.id;
          const texto    = ev.message.text;
          logger.info(`📘 FB Messenger | ${senderId}: ${texto.slice(0, 80)}`);
          await processarMsg({ convId: `fb_${senderId}`, telefone: `fb_${senderId}`, nome: `FB ${senderId}`, texto, canal: "facebook", tipo, config: canal.config, remetente: senderId });
        }
      }
    }

    // ─── Instagram DM ─────────────────────────────────────────────────────
    if (tipo === "instagram") {
      for (const entry of (body.entry || [])) {
        for (const ev of (entry.messaging || [])) {
          if (!ev.message?.text) continue;
          const senderId = ev.sender.id;
          const texto    = ev.message.text;
          logger.info(`📸 Instagram | ${senderId}: ${texto.slice(0, 80)}`);
          await processarMsg({ convId: `ig_${senderId}`, telefone: `ig_${senderId}`, nome: `IG ${senderId}`, texto, canal: "instagram", tipo, config: canal.config, remetente: senderId });
        }
      }
    }
  } catch (e) {
    logger.error(`❌ Meta handler (${req.params.tipo}): ${e.message}`);
  }
});

async function processarMsg({ convId, telefone, nome, texto, canal, tipo, config, remetente }) {
  const { aberto, mensagem } = verificarHorario();
  if (!aberto) {
    await responder(tipo, config, remetente, mensagem);
    return;
  }

  if (getModo() === "humano") {
    receberMensagemCliente({ convId, telefone, nome, conteudo: texto, canal, accountId: null });
    return;
  }

  const protocolo = `${tipo.toUpperCase().slice(0,2)}-${Date.now()}`;
  const memoria   = buscarMemoria(telefone);
  const sessao    = buscarSessao(telefone);

  const result = await runMaxxi({
    accountId: null, conversationId: convId, messageId: Date.now(),
    content: texto, sender: { name: nome, phone_number: telefone },
    channel: canal, protocolo, memoria, telefone, sessao,
  });

  if (result?.reply) {
    await responder(tipo, config, remetente, result.reply);
  }
}

async function responder(tipo, config, remetente, texto) {
  try {
    if (tipo === "whatsapp_oficial") await sendWhatsApp(config, remetente, texto);
    if (tipo === "facebook")         await sendFBMessenger(config.page_id, config.access_token, remetente, texto);
    if (tipo === "instagram")        await sendInstagram(config.access_token, remetente, texto);
  } catch (e) {
    logger.error(`❌ Erro ao responder (${tipo}): ${e.message}`);
  }
}
