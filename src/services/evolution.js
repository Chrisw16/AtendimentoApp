/**
 * evolution.js — Integração com Evolution API
 * Gerencia instâncias WhatsApp para uso interno (Maxxi Equipe)
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

const EVO_KEY  = process.env.EVOLUTION_KEY  || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";

// Tenta URL interna Docker primeiro (containers no mesmo stack Coolify)
// Fallback para URL pública se não configurado
function getEvoUrl() {
  return process.env.EVOLUTION_URL || "http://evolution.citmax.com.br";
}

async function evoFetch(path, opts = {}) {
  const baseUrl = getEvoUrl();
  const url = baseUrl + path;
  logger.info(`📱 Evolution → ${url}`);

  const headers = {
    "Content-Type": "application/json",
    "apikey": EVO_KEY,
    ...(opts.headers || {}),
  };

  let res;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch(e) {
    // Se http falhou, tenta https (e vice-versa)
    const altUrl = baseUrl.startsWith("https://")
      ? baseUrl.replace("https://", "http://") + path
      : baseUrl.replace("http://", "https://") + path;
    logger.warn(`⚠️ Evolution ${url} falhou (${e.message}), tentando ${altUrl}`);
    res = await fetch(altUrl, { ...opts, headers });
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Evolution ${res.status}: ${txt.slice(0, 200)}`);
  }
  return res.json();
}

// ─── INSTÂNCIAS ──────────────────────────────────────────────────────────────

export async function listarInstancias() {
  try {
    const r = await evoFetch("/instance/fetchInstances");
    // Evolution API pode retornar em vários formatos
    let lista = [];
    if (Array.isArray(r))            lista = r;
    else if (r?.instances)           lista = r.instances;
    else if (r?.data)                lista = Array.isArray(r.data) ? r.data : [r.data];
    else if (r?.instanceName || r?.name) lista = [r];
    // Normaliza cada item para ter sempre { instanceName, state }
    return lista.map(item => ({
      instanceName: item?.instance?.instanceName || item?.instanceName || item?.name || item?.id || "?",
      state:        item?.instance?.state || item?.state || item?.connectionStatus || "unknown",
      raw: item,
    }));
  } catch(e) {
    logger.warn("⚠️ listarInstancias: " + e.message);
    return [];
  }
}

export async function criarInstancia(nome) {
  // Evolution API v2.x
  const r = await evoFetch("/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: nome,
      integration: "WHATSAPP-BAILEYS",
      qrcode: true,
    }),
  });
  logger.info("✅ Instância criada: " + JSON.stringify(r).slice(0, 200));
  return r;
}

export async function deletarInstancia(nome) {
  return evoFetch(`/instance/delete/${nome}`, { method: "DELETE" });
}

export async function conectarInstancia(nome) {
  return evoFetch(`/instance/connect/${nome}`);
}

export async function statusInstancia(nome) {
  try {
    const r = await evoFetch(`/instance/connectionState/${nome}`);
    // Normaliza estado
    const state = r?.instance?.state || r?.state || r?.connectionStatus || r?.status || "unknown";
    return { state, raw: r };
  } catch { return { state: "unknown" }; }
}

export async function desconectarInstancia(nome) {
  return evoFetch(`/instance/logout/${nome}`, { method: "DELETE" });
}

// ─── QR CODE ─────────────────────────────────────────────────────────────────

export async function getQRCode(nome) {
  try {
    const r = await evoFetch(`/instance/connect/${nome}`);
    return r; // { base64, code, count }
  } catch(e) {
    throw new Error(`QR Code: ${e.message}`);
  }
}

// ─── BUSCAR NÚMERO DA INSTÂNCIA ──────────────────────────────────────────────

let _numeroInstanciaCache = {}; // instancia → numero@s.whatsapp.net

export async function getNumeroInstancia(instancia) {
  if (_numeroInstanciaCache[instancia]) return _numeroInstanciaCache[instancia];
  try {
    const r = await evoFetch(`/instance/connectionState/${instancia}`);
    // Evolution v2 retorna o número em diferentes campos
    const num = r?.instance?.ownerJid
      || r?.ownerJid
      || r?.instance?.profilePicUrl  // às vezes tem o jid aqui
      || null;
    if (num) {
      _numeroInstanciaCache[instancia] = num;
      logger.info(`📱 Número da instância ${instancia}: ${num}`);
      return num;
    }
    // Tenta endpoint de profile
    const p = await evoFetch(`/chat/getBase64FromMediaMessage/${instancia}`).catch(() => null);
    return null;
  } catch(e) {
    logger.warn(`⚠️ getNumeroInstancia: ${e.message}`);
    return null;
  }
}

// Limpa cache a cada hora
setInterval(() => { Object.keys(_numeroInstanciaCache).forEach(k => delete _numeroInstanciaCache[k]); }, 3600000);

// ─── ENVIO DE MENSAGENS ───────────────────────────────────────────────────────

export async function enviarTexto(instancia, numero, texto) {
  // numero pode ser "5584999999999" ou "120363XXX@g.us" (grupo)
  return evoFetch(`/message/sendText/${instancia}`, {
    method: "POST",
    body: JSON.stringify({
      number: numero,
      text: texto,
    }),
  });
}

export async function enviarTextoGrupo(instancia, grupoId, texto) {
  return enviarTexto(instancia, grupoId, texto);
}

// ─── GRUPOS ───────────────────────────────────────────────────────────────────

export async function listarGrupos(instancia) {
  try {
    const r = await evoFetch(`/group/fetchAllGroups/${instancia}?getParticipants=false`);
    return Array.isArray(r) ? r : [];
  } catch(e) { return []; }
}

// ─── WEBHOOK ─────────────────────────────────────────────────────────────────

export async function configurarWebhook(instancia, url) {
  return evoFetch(`/webhook/set/${instancia}`, {
    method: "POST",
    body: JSON.stringify({
      url,
      webhook_by_events: false,
      webhook_base64: false,
      events: [
        "MESSAGES_UPSERT",
        "CONNECTION_UPDATE",
        "QRCODE_UPDATED",
        "GROUPS_UPSERT",
        "GROUP_UPDATE",
      ],
    }),
  });
}

// ─── CONFIG BANCO ─────────────────────────────────────────────────────────────

export async function getConfig() {
  try {
    const v = await kvGet("equipe_config");
    if (v) return JSON.parse(v);
  } catch {}
  return {
    instancia: "",
    grupos: [],       // [{ id, nome, alertas: true, ia: true }]
    numeros: [],      // números individuais dos agentes
    ativo: false,
    // Thresholds de alerta (minutos)
    alerta_amarelo:  2,
    alerta_vermelho: 5,
    alerta_admin:    10,
    msg_cliente_espera: "⏳ Aguarde! Em breve um de nossos atendentes irá te ajudar.",
    enviar_msg_cliente: true,
    // Resumo diário
    resumo_diario: false,
    resumo_horario: "08:00",
  };
}

export async function salvarConfig(cfg) {
  await kvSet("equipe_config", JSON.stringify(cfg));
}

// ─── DETECTAR GRUPOS AUTOMATICAMENTE ──────────────────────────────────────────
// Quando o número recebe mensagem de grupo, salva o grupo automaticamente

export async function detectarERegistrarGrupo(instancia, remoteJid, nomeGrupo) {
  if (!remoteJid.endsWith("@g.us")) return;
  const cfg = await getConfig();
  const jaExiste = cfg.grupos.find(g => g.id === remoteJid);
  if (jaExiste) return;
  cfg.grupos.push({ id: remoteJid, nome: nomeGrupo || remoteJid, alertas: false, ia: false, detectado_em: new Date().toISOString() });
  await salvarConfig(cfg);
  logger.info(`📱 Novo grupo detectado: ${nomeGrupo} (${remoteJid})`);
}
