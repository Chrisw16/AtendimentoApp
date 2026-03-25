/**
 * whatsapp.js — WhatsApp Cloud API (Meta) — PostgreSQL para janela 24h
 */
import { getCanal } from "./canais.js";
import { logger } from "./logger.js";
import { query } from "./db.js";

const WA_API = "https://graph.facebook.com/v19.0";

async function getCfg() {
  const canal = await getCanal("whatsapp");
  return canal?.config || {};
}
async function getHeaders() {
  const cfg = await getCfg();
  return { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.accessToken}` };
}
async function getPhoneId() {
  return (await getCfg()).phoneNumberId;
}

async function waPost(payload) {
  const phoneId = await getPhoneId();
  if (!phoneId) throw new Error("WhatsApp não configurado");
  const body = JSON.stringify({ messaging_product: "whatsapp", ...payload });
  if (payload.type === "template") {
    logger.info(`📤 WA Template request to=${payload.to} template=${payload.template?.name} body=${body.slice(0,300)}`);
  }
  const r = await fetch(`${WA_API}/${phoneId}/messages`, {
    method: "POST",
    headers: await getHeaders(),
    body,
  });
  const data = await r.json();
  if (payload.type === "template") {
    logger.info(`📥 WA Template response: ${JSON.stringify(data).slice(0,300)}`);
  }
  if (data.error) { logger.error(`❌ WA: ${data.error.message}`); throw new Error(data.error.message); }
  return data;
}

export async function waSendText(to, text, previewUrl = false) {
  return waPost({ to, type: "text", text: { body: text, preview_url: previewUrl } });
}

// Envia reação a uma mensagem (emoji como 👍❤️✅)
export async function waSendReaction(to, messageId, emoji) {
  return waPost({ to, type: "reaction", reaction: { message_id: messageId, emoji } });
}

// Envia sticker (URL pública de imagem WebP estático)
export async function waSendSticker(to, stickerUrl) {
  return waPost({ to, type: "sticker", sticker: { link: stickerUrl } });
}

// Envia documento (PDF, DOCX, etc) via URL pública ou media_id do Meta
export async function waSendDocument(to, urlOrMediaId, filename, caption = "") {
  const isMediaId = !urlOrMediaId.startsWith("http");
  const docObj = isMediaId
    ? { id: urlOrMediaId, filename, caption }
    : { link: urlOrMediaId, filename, caption };
  return waPost({ to, type: "document", document: docObj });
}

// Envia imagem via URL pública ou media_id do Meta
export async function waSendImage(to, urlOrMediaId, caption = "") {
  const isMediaId = !urlOrMediaId.startsWith("http");
  const imgObj = isMediaId
    ? { id: urlOrMediaId, caption }
    : { link: urlOrMediaId, caption };
  return waPost({ to, type: "image", image: imgObj });
}

// Faz upload de arquivo para a Meta e retorna media_id
export async function waUploadMedia(fileBuffer, mimeType, filename) {
  const phoneId = await getPhoneId();
  if (!phoneId) throw new Error("WhatsApp não configurado");
  const cfg = await getCfg();
  const token = cfg.accessToken;

  const form = new FormData();
  const blob = new Blob([fileBuffer], { type: mimeType });
  form.append("file", blob, filename);
  form.append("type", mimeType);
  form.append("messaging_product", "whatsapp");

  const r = await fetch(`${WA_API}/${phoneId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error.message);
  return data.id; // media_id
}

// Encaminha uma mensagem para outro número (reencaminha o conteúdo como texto)
export async function waSendForward(to, originalContent, fromName) {
  const forwarded = `📨 *Encaminhado de ${fromName || "cliente"}*\n\n${originalContent}`;
  return waSendText(to, forwarded);
}

export async function waSendButtons(to, body, buttons, footer = "", header = "") {
  if (buttons.length > 3) buttons = buttons.slice(0, 3);
  const payload = { to, type: "interactive", interactive: { type: "button", body: { text: body },
    action: { buttons: buttons.map(b => ({ type:"reply", reply:{ id:String(b.id).slice(0,256), title:String(b.title).slice(0,20) } })) } } };
  if (footer) payload.interactive.footer = { text: footer.slice(0,60) };
  if (header) payload.interactive.header = { type:"text", text:header.slice(0,60) };
  return waPost(payload);
}

export async function waSendList(to, body, buttonLabel, sections, header = "", footer = "") {
  const payload = { to, type:"interactive", interactive: { type:"list", body:{ text:body },
    action: { button:buttonLabel.slice(0,20), sections: sections.map(s => ({
      title:(s.title||"").slice(0,24),
      rows:(s.rows||[]).slice(0,10).map(r => ({ id:String(r.id).slice(0,256), title:String(r.title).slice(0,24), ...(r.description?{description:String(r.description).slice(0,72)}:{}) }))
    })).slice(0,10) } } };
  if (footer) payload.interactive.footer = { text:footer.slice(0,60) };
  if (header) payload.interactive.header = { type:"text", text:header.slice(0,60) };
  return waPost(payload);
}

export async function waSendPix(to, { codigoPix, linhaDigitavel, valor, vencimento, descricao, linkCobranca, statusContrato }) {
  // statusContrato: "ativo" | "suspenso" | "reduzido" | null
  // Mensagem de rodapé correta por status e tipo de pagamento
  function rodape(temPix) {
    const s = (statusContrato || "").toLowerCase();
    const precisaLiberacao = s === "suspenso" || s === "reduzido";
    if (!precisaLiberacao) {
      // Cliente ativo — não precisa de liberação
      return temPix
        ? "PIX: liberação instantânea do banco. Boleto: até 3 dias úteis."
        : "Compensação do boleto: até 3 dias úteis.";
    }
    // Cliente suspenso/reduzido — sim, precisa de liberação
    return temPix
      ? "PIX: liberação em até 10 minutos ✅ | Boleto: até 3 dias úteis."
      : "Após compensação do boleto (até 3 dias úteis), o acesso é liberado automaticamente.";
  }

  // Se tiver link_cobranca do SGP, usa ele direto com botão CTA
  if (linkCobranca) {
    const temPix = !!codigoPix;
    const corpo = "💰 *Boleto/PIX CITmax*\n\n" + (descricao ? "📋 " + descricao + "\n" : "") + (valor ? "💵 Valor: *R$ " + valor + "*\n" : "") + (vencimento ? "📅 Vencimento: " + vencimento + "\n" : "") + "\nToque no botão abaixo para ver e copiar o *PIX ou Boleto*.";
    await waPost({
      to, type: "interactive",
      interactive: {
        type: "cta_url",
        body:   { text: corpo },
        footer: { text: rodape(true).slice(0, 60) },
        action: {
          name: "cta_url",
          parameters: {
            display_text: "Ver PIX / Boleto",
            url: linkCobranca,
          },
        },
      },
    });
    return;
  }

  // Fallback texto (outros canais ou sem link_cobranca)
  if (codigoPix) await waSendText(to, "💰 *PIX CITmax*\n" + (descricao ? descricao + "\n" : "") + (valor ? "Valor: R$ " + valor + "\n" : "") + (vencimento ? "Venc: " + vencimento + "\n" : "") + "\n📲 *PIX Copia e Cola:*\n" + codigoPix);
  if (linhaDigitavel) await waSendText(to, "🔢 *Linha Digitável:*\n" + linhaDigitavel);
  await waSendText(to, "ℹ️ " + rodape(!!codigoPix));
}

export async function waSendTemplate(to, templateName, languageCode = "pt_BR", components = []) {
  const payload = {
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
    }
  };
  // components é array de objetos {type, parameters} já formatados
  if (components.length) {
    // Se receber parâmetros diretos (strings ou {type,text}), envolve em body component
    const firstItem = components[0];
    if (firstItem?.type === "body" || firstItem?.type === "header" || firstItem?.type === "button") {
      // Já está formatado como componentes completos
      payload.template.components = components;
    } else {
      // Trata como lista de parâmetros do body
      payload.template.components = [{
        type: "body",
        parameters: components.map(c => typeof c === "string" ? { type: "text", text: c } : c)
      }];
    }
  }
  return waPost(payload);
}

export async function waMarkRead(messageId) {
  const phoneId = await getPhoneId(); if (!phoneId) return;
  return fetch(`${WA_API}/${phoneId}/messages`, { method:"POST", headers:await getHeaders(),
    body:JSON.stringify({ messaging_product:"whatsapp", status:"read", message_id:messageId }) }).then(r=>r.json());
}

// ── JANELA 24H via PostgreSQL ─────────────────────────────────────────────────
export async function registrarMensagemCliente(telefone) {
  await query(
    `INSERT INTO wa_janela(telefone,ts) VALUES($1,$2) ON CONFLICT(telefone) DO UPDATE SET ts=$2`,
    [telefone, Date.now()]
  );
}
export async function dentroJanela24h(telefone) {
  const limite = Date.now() - 24 * 3600 * 1000;
  // Verifica tabela wa_janela (atualizada pela Cloud API)
  try {
    const r = await query(`SELECT ts FROM wa_janela WHERE telefone=$1`, [telefone]);
    if (r.rows[0] && parseInt(r.rows[0].ts) > limite) {
      logger.info(`✅ Janela 24h: ${telefone} — wa_janela ts=${r.rows[0].ts}`);
      return true;
    }
  } catch {}
  // Fallback: verifica ultima mensagem DO CLIENTE na tabela conversas (só canal whatsapp/Cloud API)
  try {
    const tel = telefone.replace(/\D/g, "");
    const r = await query(
      `SELECT ultima_msg, id FROM conversas WHERE telefone LIKE $1 AND ultima_msg > $2 AND canal IN ('whatsapp','meta','whatsapp_cloud') ORDER BY ultima_msg DESC LIMIT 1`,
      [`%${tel}%`, limite]
    );
    if (r.rows.length > 0) {
      logger.info(`✅ Janela 24h: ${telefone} — conversas ultima_msg=${r.rows[0].ultima_msg} conv=${r.rows[0].id}`);
      return true;
    }
  } catch {}
  logger.info(`❌ Janela 24h: ${telefone} — fora da janela`);
  return false;
}

export function extrairTextoMensagem(msg) {
  if (!msg) return "";
  if (msg.type==="text") return msg.text?.body||"";
  if (msg.type==="interactive") {
    if (msg.interactive?.type==="button_reply") return msg.interactive.button_reply?.title||msg.interactive.button_reply?.id||"";
    if (msg.interactive?.type==="list_reply")   return msg.interactive.list_reply?.title||msg.interactive.list_reply?.id||"";
  }
  if (msg.type==="button")   return msg.button?.text||"";
  if (msg.type==="audio")    return "[áudio]";
  if (msg.type==="image")    return "[imagem]";
  if (msg.type==="document") return "[documento]";
  if (msg.type==="sticker")  return "[sticker]";
  if (msg.type==="reaction") return null; // reações não são processadas como mensagem
  if (msg.type==="edited")   return msg.edited?.text || null; // mensagem editada
  if (msg.type==="location") {
    const loc = msg.location;
    return `[localizacao:${loc?.latitude},${loc?.longitude}]${loc?.name ? ' ' + loc.name : ''}`;
  }
  return `[${msg.type||"desconhecido"}]`;
}

export function extrairLocalizacao(msg) {
  if (msg?.type !== "location") return null;
  return {
    lat: parseFloat(msg.location?.latitude),
    lng: parseFloat(msg.location?.longitude),
    nome: msg.location?.name || null,
    endereco: msg.location?.address || null,
  };
}
export function extrairIdInterativo(msg) {
  if (!msg) return null;
  if (msg.interactive?.type==="button_reply") return msg.interactive.button_reply?.id;
  if (msg.interactive?.type==="list_reply")   return msg.interactive.list_reply?.id;
  return null;
}

// ── FOTO DE PERFIL DO CLIENTE ────────────────────────────────────────────────
// Busca a foto de perfil do cliente via Graph API
// WhatsApp Business API: GET /{phone_number_id}/contacts/{wa_id}/profile_picture
const _fotoCache = new Map();
export async function buscarFotoPerfil(waId) {
  // Cache de 24h para não hammerar a API
  const cached = _fotoCache.get(waId);
  if (cached && Date.now() - cached.ts < 86400000) return cached.url;

  try {
    const cfg = await getCfg();
    const token = cfg.accessToken;
    const phoneId = cfg.phoneId || cfg.phone_number_id;
    if (!token || !phoneId) return null;

    // Endpoint correto para foto de perfil no WhatsApp Cloud API
    const res = await fetch(`${WA_API}/${phoneId}/contacts/${waId}/profile_picture`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const url = data?.url || null;
    if (url) _fotoCache.set(waId, { url, ts: Date.now() });
    return url;
  } catch { return null; }
}

// ── DOWNLOAD DE MÍDIA ─────────────────────────────────────────────────────────
// O WhatsApp envia um media_id. Primeiro buscamos a URL, depois baixamos.
export async function downloadMedia(mediaId) {
  const cfg = await getCfg();
  const token = cfg.accessToken;
  if (!token) throw new Error("WhatsApp access token não configurado");

  // 1. Busca a URL do arquivo
  const metaRes = await fetch(`${WA_API}/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const meta = await metaRes.json();
  if (!meta.url) throw new Error(`Mídia não encontrada: ${JSON.stringify(meta)}`);

  // 2. Baixa o arquivo (precisa do header de auth)
  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!fileRes.ok) throw new Error(`Erro ao baixar mídia: ${fileRes.status}`);

  const buffer = await fileRes.arrayBuffer();
  return {
    buffer,
    mimeType: meta.mime_type || "application/octet-stream",
    sha256: meta.sha256,
    fileSize: meta.file_size,
  };
}

// Extrai media_id de qualquer tipo de mensagem
export function extrairMediaId(msg) {
  if (!msg) return null;
  const tipos = ["audio", "voice", "image", "document", "video", "sticker"];
  for (const t of tipos) {
    if (msg.type === t && msg[t]?.id) return { id: msg[t].id, tipo: t, mime: msg[t]?.mime_type };
  }
  return null;
}
