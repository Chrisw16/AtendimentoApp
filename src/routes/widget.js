/**
 * widget.js — Backend do widget web embutível
 * GET  /channels/widget/embed     → script JS para incluir no site
 * GET  /channels/widget/config    → config pública do widget
 * GET  /channels/widget/stream    → SSE para receber respostas em tempo real
 * POST /channels/widget/msg       → recebe mensagem do visitante
 */
import { Router } from "express";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { getCanal } from "../services/canais.js";
import { getModo, receberMensagemCliente, enviarMensagemAgente } from "../services/chatInterno.js";
import { verificarHorario } from "../services/horario.js";
import { runMaxxi } from "../agent.js";
import { buscarMemoria, buscarSessao } from "../services/memoria.js";
import { logger } from "../services/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const widgetRouter = Router();

// SSE por convId do widget
const widgetSseClients = new Map(); // convId → res

function sendToWidget(convId, content) {
  const res = widgetSseClients.get(convId);
  if (res) {
    try { res.write(`event: msg\ndata: ${JSON.stringify({ content })}\n\n`); } catch {}
  }
}

// Exporta para o admin poder usar ao responder via chat interno
export { sendToWidget };

// Config pública (sem tokens)
widgetRouter.get("/config", (req, res) => {
  const canal = getCanal("widget");
  const cfg   = canal?.config || {};
  res.json({ titulo: cfg.titulo || "Fale conosco", subtitulo: cfg.subtitulo || "Respondemos em minutos", cor: cfg.cor || "#00d4ff" });
});

// Serve o HTML do widget
widgetRouter.get("/", (req, res) => {
  const html = readFileSync(join(__dirname, "../public/widget.html"), "utf8");
  res.setHeader("Content-Type", "text/html");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.send(html);
});

// Snippet JS para embed no site: <script src="https://dominio/channels/widget/embed"></script>
widgetRouter.get("/embed", (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;
  const js   = `
(function(){
  if(window.__maxxiWidget) return;
  window.__maxxiWidget = true;
  var iframe = document.createElement("iframe");
  iframe.src = "${host}/channels/widget/";
  iframe.id  = "maxxi-widget-frame";
  iframe.setAttribute("frameborder","0");
  iframe.setAttribute("allow","microphone");
  iframe.style.cssText = "position:fixed;bottom:0;right:0;width:400px;height:600px;border:none;z-index:999999;background:transparent;";
  // Script interno seta BASE
  iframe.onload = function(){ try { iframe.contentWindow.MAXXI_BASE = "${host}"; } catch{} };
  document.body.appendChild(iframe);
})();
`.trim();
  res.setHeader("Content-Type", "application/javascript");
  res.send(js);
});

// SSE por conversa
widgetRouter.get("/stream", (req, res) => {
  const { convId } = req.query;
  if (!convId) return res.status(400).end();
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders();
  widgetSseClients.set(convId, res);
  req.on("close", () => widgetSseClients.delete(convId));
});

// Recebe mensagem do visitante
widgetRouter.post("/msg", async (req, res) => {
  res.json({ ok: true }); // resposta imediata
  const { convId, nome, telefone, msg } = req.body;
  if (!convId || !msg) return;

  const telefoneId = telefone || `widget_${convId}`;
  logger.info(`🌐 Widget | ${nome || "Visitante"}: ${msg.slice(0, 80)}`);

  const { aberto, mensagem } = verificarHorario();
  if (!aberto) { sendToWidget(convId, mensagem); return; }

  if (getModo() === "humano") {
    receberMensagemCliente({ convId, telefone: telefoneId, nome: nome || "Visitante", conteudo: msg, canal: "widget", accountId: null });
    return;
  }

  try {
    const protocolo = `WG-${Date.now()}`;
    const memoria   = buscarMemoria(telefoneId);
    const sessao    = buscarSessao(telefoneId);
    const result    = await runMaxxi({
      accountId: null, conversationId: convId, messageId: Date.now(),
      content: msg, sender: { name: nome || "Visitante", phone_number: telefoneId },
      channel: "widget", protocolo, memoria, telefone: telefoneId, sessao,
    });
    if (result?.reply) {
      const { registrarRespostaIA } = await import("../services/chatInterno.js");
      await registrarRespostaIA(convId, result.reply).catch(() => {});
      sendToWidget(convId, result.reply);
    }
    if (result?.handoff) {
      const { transferirParaHumano } = await import("../services/handoff.js");
      const { registrarRespostaIA } = await import("../services/chatInterno.js");
      if (!result?.reply) {
        const msg2 = "⏳ Transferindo para um atendente humano... Aguarde, em breve você será atendido!";
        await registrarRespostaIA(convId, msg2).catch(() => {});
        sendToWidget(convId, msg2);
      }
      await transferirParaHumano(convId, null, "Transferido pela IA");
    }
    if (result?.sessaoAtualizada) {
      const { salvarSessao } = await import("../services/memoria.js");
      await salvarSessao(telefoneId, result.sessaoAtualizada).catch(() => {});
    }
  } catch (e) {
    logger.error(`❌ Widget bot: ${e.message}`);
    sendToWidget(convId, "Tive um problema. Pode tentar novamente?");
  }
});
