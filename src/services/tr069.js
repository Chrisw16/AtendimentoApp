/**
 * tr069.js — Integração com o Gerenciador CPE do SGP (CITmax)
 *
 * Autenticação: Basic Auth (TR069_SGP_USER / TR069_SGP_PASS)
 * Base URL:     https://citrn.sgp.net.br
 *
 * Endpoints disponíveis (Gerenciador CPE):
 *   GET  /api/cpemanager/servico/{id_servico}/infodetail   → Detalhes completos
 *   POST /api/cpemanager/servico/{id_servico}/syncwan      → Sincronizar WAN
 *   POST /api/cpemanager/servico/{id_servico}/importwifi   → Importar Wifi
 *   POST /api/cpemanager/servico/{id_servico}/setwifi      → Definir Wifi
 *   POST /api/cpemanager/servico/{id_servico}/configwan    → Configurar WAN
 *   POST /api/cpemanager/servico/{id_servico}/ping         → Ping do CPE
 *   POST /api/cpemanager/servico/{id_servico}/speedtest    → SpeedTest
 *   POST /api/cpemanager/servico/{id_servico}/reboot       → Reboot
 *   GET  /api/cpemanager/servico/{id_servico}/wifilist     → Lista Wifi
 *   POST /api/cpemanager/servico/{id_servico}/updatewifi   → Atualizar dados Wifi
 */

import { logger } from "./logger.js";

const SGP_URL  = "https://citrn.sgp.net.br";
const SGP_USER = process.env.TR069_SGP_USER || "";
const SGP_PASS = process.env.TR069_SGP_PASS || "";

// ── Auth ──────────────────────────────────────────────────────────────────────
function basicAuth() {
  if (!SGP_USER) throw new Error("TR069_SGP_USER não configurado no .env");
  return "Basic " + Buffer.from(`${SGP_USER}:${SGP_PASS}`).toString("base64");
}

// ── HTTP helpers ───────────────────────────────────────────────────────────────
async function cpeGet(idServico, endpoint = "infodetail") {
  const url = `${SGP_URL}/api/cpemanager/servico/${idServico}/${endpoint}`;
  const res = await fetch(url, {
    headers: { Authorization: basicAuth(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SGP CPE ${res.status} em /${endpoint}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

async function cpePost(idServico, endpoint, body = {}) {
  const url = `${SGP_URL}/api/cpemanager/servico/${idServico}/${endpoint}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: basicAuth(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`SGP CPE ${res.status} em /${endpoint}`);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { ok: res.ok }; }
}

// ── Cache em memória (TTL 30s) ────────────────────────────────────────────────
const _cache = new Map();
const TTL = 30_000;
function cacheGet(k) {
  const e = _cache.get(k);
  if (!e || Date.now() - e.ts > TTL) { _cache.delete(k); return null; }
  return e.v;
}
function cacheSet(k, v) { _cache.set(k, { v, ts: Date.now() }); }
function cacheInvalidar(idServico) {
  _cache.delete(`info_${idServico}`);
  _cache.delete(`wifi_${idServico}`);
}

// ── Normalização ───────────────────────────────────────────────────────────────

function formatarUptime(seg) {
  if (!seg) return null;
  const s = parseInt(seg);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}min`;
  if (h > 0) return `${h}h ${m}min`;
  return `${m}min`;
}

function classificarSinal(rxDbm) {
  if (rxDbm === null || rxDbm === undefined) return null;
  const v = parseFloat(rxDbm);
  if (v > -20)  return "otimo";
  if (v > -24)  return "bom";
  if (v > -28)  return "fraco";
  return "critico";
}

function normalizarInfo(raw, idServico) {
  if (!raw || raw.erro) {
    return { idServico, erro: true, mensagem: raw?.mensagem || "Sem resposta do CPE" };
  }

  const rx = raw.rx_power  ?? raw.rxPower  ?? raw.sinal_rx ?? raw.optical_rx ?? null;
  const tx = raw.tx_power  ?? raw.txPower  ?? raw.sinal_tx ?? raw.optical_tx ?? null;
  const qualidade_sinal = rx !== null ? classificarSinal(rx) : null;

  return {
    idServico,
    // Identificação do dispositivo
    modelo:     raw.modelo   ?? raw.model          ?? raw.product_class    ?? null,
    serial:     raw.serial   ?? raw.serialNumber   ?? raw.serial_number    ?? null,
    mac:        raw.mac      ?? raw.macAddress     ?? raw.mac_address      ?? null,
    firmware:   raw.firmware ?? raw.software_version ?? raw.firmwareVersion ?? null,
    // Rede WAN
    ip_wan:     raw.ip_wan   ?? raw.ipWan          ?? raw.wan_ip           ?? raw.ip ?? null,
    pppoe:      raw.pppoe_user ?? raw.pppoeUser    ?? raw.wan_user         ?? null,
    // Status
    online:     raw.online   ?? (raw.status === "online") ?? null,
    uptime_seg: raw.uptime   ?? raw.uptimeSeconds  ?? raw.uptime_seconds   ?? null,
    uptime_fmt: formatarUptime(raw.uptime ?? raw.uptimeSeconds ?? null),
    // Sinal óptico GPON/EPON (dBm)
    sinal_rx:       rx !== null ? parseFloat(rx) : null,
    sinal_tx:       tx !== null ? parseFloat(tx) : null,
    qualidade_sinal,
    alerta_sinal:   qualidade_sinal === "critico" || qualidade_sinal === "fraco",
    _raw: raw,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FUNÇÕES PÚBLICAS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Consultar detalhes completos do CPE/ONU.
 * id_servico = número do contrato/serviço no SGP.
 */
export async function consultarDispositivoCPE(idServico) {
  const k = `info_${idServico}`;
  const cached = cacheGet(k);
  if (cached) return cached;

  try {
    const raw = await cpeGet(idServico, "infodetail");
    const resultado = normalizarInfo(raw, idServico);
    if (!resultado.erro) cacheSet(k, resultado);
    return resultado;
  } catch (e) {
    logger.warn(`⚠️ TR069 consultarDispositivoCPE(${idServico}): ${e.message}`);
    return {
      idServico,
      erro: true,
      mensagem: `Dispositivo indisponível: ${e.message}`,
    };
  }
}

/**
 * Reiniciar ONU/CPE remotamente.
 * Registra auditoria em cpe_acoes.
 */
export async function reiniciarDispositivoCPE(idServico, agenteId = "maxxi") {
  let resultado;
  try {
    const raw = await cpePost(idServico, "reboot");
    resultado = {
      idServico,
      ok: true,
      mensagem: raw?.mensagem || raw?.msg || "Reboot enviado. A ONU reiniciará em alguns segundos.",
      raw,
    };
  } catch (e) {
    resultado = { idServico, ok: false, mensagem: `Falha ao reiniciar: ${e.message}` };
  }

  try {
    const { query } = await import("./db.js");
    await query(
      `INSERT INTO cpe_acoes(id_servico, acao, agente_id, resultado) VALUES($1,$2,$3,$4)`,
      [String(idServico), "reboot", agenteId, JSON.stringify(resultado)]
    );
    cacheInvalidar(idServico);
  } catch {}

  return resultado;
}

/**
 * Consultar sinal óptico Rx/Tx (subset de infodetail).
 */
export async function consultarSinalOptico(idServico) {
  const info = await consultarDispositivoCPE(idServico);
  if (info.erro) return info;

  return {
    idServico,
    sinal_rx:       info.sinal_rx,
    sinal_tx:       info.sinal_tx,
    qualidade_sinal: info.qualidade_sinal,
    alerta_sinal:   info.alerta_sinal,
    modelo:         info.modelo,
    serial:         info.serial,
    mensagem:       info.sinal_rx !== null
      ? `Sinal Rx: ${info.sinal_rx} dBm (${info.qualidade_sinal})`
      : "Sinal óptico não disponível para este dispositivo.",
  };
}

/**
 * Executar Ping a partir da ONU do cliente.
 * Diagnostica se o problema está na rede do cliente ou além.
 */
export async function diagnosticoPing(idServico, host = "8.8.8.8") {
  try {
    const raw = await cpePost(idServico, "ping", { host });
    return {
      idServico, host, ok: true,
      resultado:  raw?.resultado ?? raw?.result ?? raw,
      mensagem:   raw?.mensagem  || `Ping para ${host} executado.`,
    };
  } catch (e) {
    return { idServico, host, ok: false, mensagem: e.message };
  }
}

/**
 * Executar SpeedTest no CPE do cliente.
 */
export async function speedTestCPE(idServico) {
  try {
    const raw = await cpePost(idServico, "speedtest");
    return {
      idServico, ok: true,
      download_mbps: raw?.download   ?? raw?.downloadMbps ?? null,
      upload_mbps:   raw?.upload     ?? raw?.uploadMbps   ?? null,
      latencia_ms:   raw?.latencia   ?? raw?.latency      ?? null,
      raw,
    };
  } catch (e) {
    return { idServico, ok: false, mensagem: e.message };
  }
}

/**
 * Listar redes Wi-Fi configuradas no CPE.
 */
export async function listarWifi(idServico) {
  const k = `wifi_${idServico}`;
  const cached = cacheGet(k);
  if (cached) return cached;

  try {
    const raw = await cpeGet(idServico, "wifilist");
    const lista = Array.isArray(raw) ? raw : (raw?.redes ?? raw?.wifis ?? [raw]);
    const resultado = {
      idServico, ok: true,
      redes: lista.map(r => ({
        ssid:      r.ssid      ?? r.SSID      ?? null,
        banda:     r.banda     ?? r.band      ?? r.frequencia ?? null,
        canal:     r.canal     ?? r.channel   ?? null,
        seguranca: r.seguranca ?? r.security  ?? r.encryption ?? null,
        clientes:  r.clientes  ?? r.clients   ?? r.connected  ?? null,
        ativo:     r.ativo     ?? r.enabled   ?? true,
      })),
    };
    cacheSet(k, resultado);
    return resultado;
  } catch (e) {
    return { idServico, ok: false, mensagem: e.message };
  }
}

/**
 * Configurar Wi-Fi do CPE (SSID + senha).
 * Registra auditoria (sem logar a senha).
 */
export async function configurarWifi(idServico, { ssid, senha, banda = "2.4GHz", agenteId = "maxxi" } = {}) {
  if (!ssid || !senha) return { idServico, ok: false, mensagem: "SSID e senha são obrigatórios." };

  let resultado;
  try {
    const raw = await cpePost(idServico, "setwifi", { ssid, password: senha, banda });
    resultado = { idServico, ok: true, ssid, banda, mensagem: raw?.mensagem || "Wi-Fi configurado com sucesso." };
  } catch (e) {
    resultado = { idServico, ok: false, mensagem: e.message };
  }

  try {
    const { query } = await import("./db.js");
    await query(
      `INSERT INTO cpe_acoes(id_servico, acao, agente_id, resultado) VALUES($1,$2,$3,$4)`,
      [String(idServico), "setwifi", agenteId, JSON.stringify({ ...resultado, senha: "***" })]
    );
    cacheInvalidar(idServico);
  } catch {}

  return resultado;
}

/**
 * Sincronizar WAN do CPE com o SGP.
 */
export async function sincronizarWAN(idServico) {
  try {
    const raw = await cpePost(idServico, "syncwan");
    cacheInvalidar(idServico);
    return { idServico, ok: true, mensagem: raw?.mensagem || "WAN sincronizada com sucesso.", raw };
  } catch (e) {
    return { idServico, ok: false, mensagem: e.message };
  }
}

/**
 * Importar configuração Wi-Fi do CPE para o SGP.
 */
export async function importarWifi(idServico) {
  try {
    const raw = await cpePost(idServico, "importwifi");
    cacheInvalidar(idServico);
    return { idServico, ok: true, mensagem: raw?.mensagem || "Wi-Fi importado para o SGP.", raw };
  } catch (e) {
    return { idServico, ok: false, mensagem: e.message };
  }
}

/**
 * Buscar contratos com sinal óptico crítico/fraco.
 * Usado pelo monitor de rede para alertas preventivos.
 */
export async function checarSinalCritico(idServicos = []) {
  if (!idServicos.length) return [];
  const res = await Promise.allSettled(idServicos.map(id => consultarSinalOptico(id)));
  return res
    .map((r, i) => r.status === "fulfilled" ? r.value : { idServico: idServicos[i], erro: true })
    .filter(r => r.alerta_sinal);
}

/**
 * Histórico de ações remotas de um serviço (reboot, setwifi...).
 */
export async function historicoAcoesCPE(idServico, limite = 20) {
  try {
    const { query } = await import("./db.js");
    const { rows } = await query(
      `SELECT id, acao, agente_id, resultado, criado_em
       FROM cpe_acoes WHERE id_servico=$1 ORDER BY criado_em DESC LIMIT $2`,
      [String(idServico), limite]
    );
    return rows;
  } catch {
    return [];
  }
}
