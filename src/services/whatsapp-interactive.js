/**
 * whatsapp-interactive.js — Mensagens interativas do WhatsApp via Chatwoot
 * Botões, listas, CTA URLs
 */

const CHATWOOT_URL = process.env.CHATWOOT_URL || "https://chatwoot.citmax.com.br";
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;

/**
 * Envia mensagem interativa via Chatwoot API
 * Chatwoot encaminha pro WhatsApp Business API
 */
async function sendChatwootMessage(conversationId, content, contentType = "text", contentAttributes = {}) {
  const accountId = process.env.CHATWOOT_ACCOUNT_ID || "1";
  const res = await fetch(`${CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", api_access_token: CHATWOOT_TOKEN },
    body: JSON.stringify({
      content,
      message_type: "outgoing",
      content_type: contentType,
      content_attributes: contentAttributes,
    }),
  });
  return res.json();
}

/**
 * Envia botões de resposta rápida (Reply Buttons)
 * Máx: 3 botões
 */
export async function sendReplyButtons(conversationId, body, buttons) {
  // Chatwoot suporta input_select para botões
  const items = buttons.slice(0, 3).map(b => ({
    title: b.title,
    value: b.id || b.title,
  }));

  return sendChatwootMessage(conversationId, body, "input_select", {
    items,
  });
}

/**
 * Envia lista interativa (List Message)
 * Máx: 10 itens
 */
export async function sendListMessage(conversationId, body, buttonText, sections) {
  // Monta como input_select com items agrupados
  const items = [];
  for (const section of sections) {
    for (const row of (section.rows || [])) {
      items.push({
        title: row.title,
        value: row.id || row.title,
        description: row.description || "",
      });
    }
  }

  return sendChatwootMessage(conversationId, body, "input_select", {
    items: items.slice(0, 10),
  });
}

/**
 * Envia botão CTA com URL (abre link externo)
 * Ideal para boletos, PIX, documentos
 */
export async function sendCTAButton(conversationId, body, buttonText, url) {
  // Chatwoot: envia como artigo/card com link
  const content = `${body}\n\n🔗 ${buttonText}: ${url}`;

  // Tenta enviar como cards (Chatwoot v3.x+)
  try {
    return await sendChatwootMessage(conversationId, body, "cards", {
      items: [{
        title: buttonText,
        description: body,
        actions: [{
          type: "link",
          text: buttonText,
          uri: url,
        }],
      }],
    });
  } catch {
    // Fallback: texto simples com link
    return sendChatwootMessage(conversationId, content);
  }
}

/**
 * Envia NPS (lista com notas de 0-10)
 */
export async function sendNPSList(conversationId, pergunta) {
  const items = [];
  for (let i = 10; i >= 0; i--) {
    const emoji = i >= 9 ? '😍' : i >= 7 ? '😊' : i >= 5 ? '😐' : i >= 3 ? '😕' : '😞';
    items.push({
      title: `${emoji} Nota ${i}`,
      value: String(i),
    });
  }

  return sendChatwootMessage(conversationId, pergunta || "De 0 a 10, como avalia nosso atendimento?", "input_select", {
    items,
  });
}

/**
 * Processa resposta interativa da IA
 * A IA retorna { interactive: { type, body, ... } }
 * Esta função envia no formato correto
 */
export async function processInteractive(conversationId, interactive) {
  if (!interactive || !interactive.type) return null;

  switch (interactive.type) {
    case "reply_buttons":
      return sendReplyButtons(conversationId, interactive.body, interactive.buttons || []);

    case "list":
      return sendListMessage(conversationId, interactive.body, interactive.button_text, interactive.sections || []);

    case "cta_url":
      return sendCTAButton(conversationId, interactive.body, interactive.button_text || "Abrir", interactive.url);

    case "nps":
      return sendNPSList(conversationId, interactive.body);

    default:
      return null;
  }
}
