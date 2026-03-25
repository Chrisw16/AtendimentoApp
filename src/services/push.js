/**
 * push.js — Web Push Notifications para agentes
 * 
 * ⚠️  Arquivo NOVO — não altera nada existente
 * ⚠️  VAPID keys auto-geradas no primeiro uso e salvas no banco
 * ⚠️  Assinaturas salvas por agente no banco
 */
import webpush from "web-push";

let vapidReady = false;

// ─── INIT VAPID ────────────────────────────────────────────────────────────────
async function initVapid() {
  if (vapidReady) return;
  try {
    const { kvGet, kvSet } = await import("./db.js");
    let publicKey = await kvGet("vapid_public_key");
    let privateKey = await kvGet("vapid_private_key");

    if (!publicKey || !privateKey) {
      // Gera par de chaves VAPID na primeira execução
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;
      await kvSet("vapid_public_key", publicKey);
      await kvSet("vapid_private_key", privateKey);
      console.log("🔑 VAPID keys geradas e salvas no banco");
    }

    webpush.setVapidDetails(
      "mailto:contato@citmax.com.br",
      publicKey,
      privateKey
    );
    vapidReady = true;
    console.log("✅ Push notifications configuradas");
  } catch (e) {
    console.error("❌ Erro ao inicializar VAPID:", e.message);
  }
}

// ─── GET PUBLIC KEY ────────────────────────────────────────────────────────────
export async function getVapidPublicKey() {
  await initVapid();
  const { kvGet } = await import("./db.js");
  return await kvGet("vapid_public_key");
}

// ─── SALVAR ASSINATURA ─────────────────────────────────────────────────────────
export async function salvarAssinatura(agenteId, subscription) {
  await initVapid();
  const { query } = await import("./db.js");
  
  // Cria tabela se não existir
  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      agente_id TEXT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      subscription JSONB NOT NULL,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Upsert — se o endpoint já existe, atualiza
  await query(`
    INSERT INTO push_subscriptions (agente_id, endpoint, subscription)
    VALUES ($1, $2, $3)
    ON CONFLICT (endpoint) DO UPDATE SET
      agente_id = $1,
      subscription = $3,
      criado_em = NOW()
  `, [agenteId, subscription.endpoint, JSON.stringify(subscription)]);

  return { ok: true };
}

// ─── REMOVER ASSINATURA ────────────────────────────────────────────────────────
export async function removerAssinatura(endpoint) {
  const { query } = await import("./db.js");
  await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  return { ok: true };
}

// ─── ENVIAR PARA UM AGENTE ─────────────────────────────────────────────────────
export async function notificarAgente(agenteId, payload) {
  await initVapid();
  const { query } = await import("./db.js");

  const r = await query(
    `SELECT subscription FROM push_subscriptions WHERE agente_id = $1`,
    [agenteId]
  );

  const resultados = [];
  for (const row of r.rows) {
    try {
      const sub = typeof row.subscription === "string"
        ? JSON.parse(row.subscription)
        : row.subscription;
      await webpush.sendNotification(sub, JSON.stringify(payload));
      resultados.push({ ok: true });
    } catch (e) {
      // Se subscription expirou (410 Gone), remove
      if (e.statusCode === 410 || e.statusCode === 404) {
        const ep = (typeof row.subscription === "string" ? JSON.parse(row.subscription) : row.subscription).endpoint;
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep]).catch(() => {});
      }
      resultados.push({ ok: false, erro: e.message });
    }
  }
  return resultados;
}

// ─── ENVIAR PARA TODOS OS AGENTES (broadcast) ──────────────────────────────────
export async function notificarTodos(payload) {
  await initVapid();
  const { query } = await import("./db.js");

  const r = await query(`SELECT DISTINCT agente_id, subscription FROM push_subscriptions`);

  const resultados = [];
  for (const row of r.rows) {
    try {
      const sub = typeof row.subscription === "string"
        ? JSON.parse(row.subscription)
        : row.subscription;
      await webpush.sendNotification(sub, JSON.stringify(payload));
      resultados.push({ agente: row.agente_id, ok: true });
    } catch (e) {
      if (e.statusCode === 410 || e.statusCode === 404) {
        const ep = (typeof row.subscription === "string" ? JSON.parse(row.subscription) : row.subscription).endpoint;
        await query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [ep]).catch(() => {});
      }
      resultados.push({ agente: row.agente_id, ok: false, erro: e.message });
    }
  }
  return resultados;
}

// ─── HELPERS DE NOTIFICAÇÃO RÁPIDA ──────────────────────────────────────────────

export async function notificarNovaConversa(nome, telefone, canal) {
  return notificarTodos({
    title: "💬 Nova conversa",
    body: `${nome || telefone || "Cliente"} iniciou via ${canal || "WhatsApp"}`,
    icon: "⚡",
    tag: "nova-conversa",
    data: { tipo: "nova_conversa", telefone },
  });
}

export async function notificarClienteFrustrado(nome, telefone, canal) {
  return notificarTodos({
    title: "🚨 Cliente frustrado!",
    body: `${nome || telefone} está insatisfeito (${canal})`,
    icon: "⚡",
    tag: "frustrado-" + telefone,
    urgente: true,
    data: { tipo: "frustrado", telefone },
  });
}

export async function notificarAguardandoHumano(nome, telefone) {
  return notificarTodos({
    title: "⏳ Aguardando atendente",
    body: `${nome || telefone} precisa de atendimento humano`,
    icon: "⚡",
    tag: "aguardando-" + telefone,
    data: { tipo: "aguardando", telefone },
  });
}
