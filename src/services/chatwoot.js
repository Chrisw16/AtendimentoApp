const CHATWOOT_URL = process.env.CHATWOOT_URL;
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN;
const HUMAN_TEAM_ID = process.env.CHATWOOT_HUMAN_TEAM_ID;

async function chatwootRequest(path, options = {}) {
  const res = await fetch(`${CHATWOOT_URL}${path}`, {
    headers: {
      "api_access_token": CHATWOOT_TOKEN,
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) throw new Error(`Chatwoot ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendMessage(accountId, conversationId, content) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({ content, message_type: "outgoing", private: false }),
    }
  );
}

export async function assignToHuman(accountId, conversationId) {
  if (!HUMAN_TEAM_ID) return;
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/assignments`,
    {
      method: "POST",
      body: JSON.stringify({ team_id: parseInt(HUMAN_TEAM_ID) }),
    }
  );
}

export async function addLabel(accountId, conversationId, label) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/labels`,
    { method: "POST", body: JSON.stringify({ labels: [label] }) }
  );
}



// Reage a uma mensagem com emoji
export async function reagirMensagem(accountId, conversationId, messageId, emoji) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content: emoji,
        content_attributes: {
          in_reply_to: messageId,
          is_reaction: true
        }
      })
    }
  );
}

// Simula "digitando..." no Chatwoot
export async function setTyping(accountId, conversationId, typing = true) {
  try {
    await chatwootRequest(
      `/api/v1/accounts/${accountId}/conversations/${conversationId}/typing_status`,
      { method: "POST", body: JSON.stringify({ typing_status: typing ? "on" : "off" }) }
    );
  } catch (e) { /* ignora erro de typing */ }
}

// Encerra a conversa no Chatwoot (status = resolved)
export async function resolveConversation(accountId, conversationId) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/toggle_status`,
    { method: "POST", body: JSON.stringify({ status: "resolved" }) }
  );
}


// Envia áudio na conversa (Meta WhatsApp API via Chatwoot)
export async function sendAudio(accountId, conversationId, audioBuffer) {
  const formData = new FormData();
  const blob = new Blob([audioBuffer], { type: "audio/mpeg" });
  formData.append("attachments[]", blob, "maxxi.mp3");
  formData.append("message_type", "outgoing");
  formData.append("private", "false");
  formData.append("content", "");

  const res = await fetch(`${CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "api_access_token": CHATWOOT_TOKEN },
    body: formData,
  });
  if (!res.ok) throw new Error(`Chatwoot audio ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── NOTA PRIVADA (visível só para agentes) ───────────────────────────────────
export async function sendPrivateNote(accountId, conversationId, content) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    { method: "POST", body: JSON.stringify({ content, message_type: "outgoing", private: true }) }
  );
}

// ─── ATUALIZAR CONTATO COM DADOS DO SGP ──────────────────────────────────────
export async function updateContact(accountId, contactId, data = {}) {
  if (!contactId) return;
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/contacts/${contactId}`,
    { method: "PATCH", body: JSON.stringify(data) }
  );
}

// ─── ATRIBUTOS PERSONALIZADOS NA CONVERSA ─────────────────────────────────────
// Aparecem na sidebar do agente quando assume o atendimento
export async function updateConversationAttributes(accountId, conversationId, attrs = {}) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { method: "PATCH", body: JSON.stringify({ additional_attributes: attrs }) }
  );
}

// ─── MENSAGEM INTERATIVA (input_select / cards) ───────────────────────────────
// Funciona no Web Widget — no WhatsApp nativo envia como texto simples
export async function sendInteractiveMessage(accountId, conversationId, content, items = []) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
    {
      method: "POST",
      body: JSON.stringify({
        content,
        content_type: "input_select",
        content_attributes: { items },
        message_type: "outgoing",
        private: false,
      }),
    }
  );
}

// ─── MENSAGEM PROATIVA (Outbound WhatsApp) ────────────────────────────────────
// Requer WhatsApp Business API configurado no Chatwoot
export async function sendOutbound(accountId, inboxId, phoneNumber, message, contactName = "") {
  // 1. Cria ou busca o contato
  let contactId;
  try {
    const search = await chatwootRequest(
      `/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneNumber)}&page=1`
    );
    contactId = search?.payload?.[0]?.id;
  } catch {}

  if (!contactId) {
    const created = await chatwootRequest(
      `/api/v1/accounts/${accountId}/contacts`,
      { method: "POST", body: JSON.stringify({ phone_number: phoneNumber, name: contactName || phoneNumber }) }
    );
    contactId = created?.id;
  }

  if (!contactId) throw new Error("Não foi possível criar/encontrar contato para outbound");

  // 2. Cria conversa outbound
  const conv = await chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations`,
    {
      method: "POST",
      body: JSON.stringify({
        inbox_id: inboxId,
        contact_id: contactId,
        additional_attributes: { mail_subject: "Mensagem CITmax" },
      }),
    }
  );

  // 3. Envia mensagem na conversa
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conv.id}/messages`,
    { method: "POST", body: JSON.stringify({ content: message, message_type: "outgoing", private: false }) }
  );
}

// ─── ATRIBUTOS PERSONALIZADOS (custom_attributes) ────────────────────────────
// Preenche atributos criados em Configurações → Atributos Personalizados → Conversa
// A key é o identificador gerado ao criar o atributo (ex: "protocolo")
export async function setCustomAttributes(accountId, conversationId, attrs = {}) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { method: "PATCH", body: JSON.stringify({ custom_attributes: attrs }) }
  );
}

// ─── RENOMEAR CONVERSA COM PROTOCOLO ─────────────────────────────────────────
export async function setConversationName(accountId, conversationId, name) {
  return chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}`,
    { method: "PATCH", body: JSON.stringify({ additional_attributes: { mail_subject: name } }) }
  );
}

// ─── BUSCAR DETALHES DA CONVERSA ──────────────────────────────────────────────
export async function getConversation(accountId, conversationId) {
  return chatwootRequest(`/api/v1/accounts/${accountId}/conversations/${conversationId}`);
}

export async function getConversationHistory(accountId, conversationId) {
  const data = await chatwootRequest(
    `/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`
  );

  // 30 mensagens — necessário para fluxos longos como cadastro (coletamos ~10 campos, 1 por vez)
  // Inclui mensagens do agente E do cliente para o Claude saber quais dados já foram coletados
  // Dados de API são SEMPRE dinâmicos — nunca reutilizar do histórico
  const messages = (data.payload || [])
    .filter(m => m.content && m.content.trim() && !m.private) // exclui notas privadas
    .slice(-30)
    .map(m => ({
      role: m.message_type === 0 ? "user" : "assistant",
      content: m.content,
    }));

  // Remove última mensagem se for do usuário (vai ser adicionada pelo agent.js)
  if (messages.length > 0 && messages[messages.length - 1].role === "user") {
    messages.pop();
  }

  return messages;
}
