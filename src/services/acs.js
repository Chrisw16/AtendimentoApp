/**
 * acs.js — Servidor TR-069 / CWMP (ACS - Auto Configuration Server)
 *
 * Protocolo: CWMP 1.0/1.1 (TR-069 Amendment 5)
 * Porta: 7547 (padrão TR-069) ou ACS_PORT do .env
 * Auth: Basic Auth via ACS_USER / ACS_PASS
 *
 * Fluxo CWMP:
 *   1. CPE → POST Inform (bootstrap/boot/periodic)
 *   2. ACS → InformResponse + (opcional) GetParameterValues ou Reboot
 *   3. CPE → GetParameterValuesResponse
 *   4. ACS → Empty response (encerra sessão) OU próximo comando
 *
 * Suporte Intelbras (WIN 240, WIN 1200, WIN 1500, GF 1200):
 *   - DeviceInfo (modelo, serial, firmware, uptime)
 *   - WAN PPPoE (IP, status, usuário)
 *   - Wi-Fi 2.4GHz e 5GHz (SSID, senha, canal)
 *   - GPON signal Rx/Tx (via X_INTELBRAS ou X_CT-COM)
 */

import { logger } from "./logger.js";
import {
  upsertDevice, saveParameters, getNextCommand, markCommandDone,
  saveInformEvent, saveAuditoria,
} from "./acs-db.js";

// ── Parâmetros para coletar no Inform / GetParameterValues ─────────────────────
// Mapeados para chaves normalizadas usadas no painel
export const PARAMS_INTELBRAS = [
  // DeviceInfo
  "InternetGatewayDevice.DeviceInfo.Manufacturer",
  "InternetGatewayDevice.DeviceInfo.ModelName",
  "InternetGatewayDevice.DeviceInfo.HardwareVersion",
  "InternetGatewayDevice.DeviceInfo.SoftwareVersion",
  "InternetGatewayDevice.DeviceInfo.SerialNumber",
  "InternetGatewayDevice.DeviceInfo.UpTime",
  // WAN PPPoE
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username",
  "InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime",
  // Wi-Fi 2.4GHz
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDeviceNumberOfEntries",
  // Wi-Fi 5GHz (WLANConfiguration.5 = 5GHz em Intelbras)
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel",
  "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status",
  // GPON — Intelbras usa X_INTELBRAS_GponInterfaceConfig ou X_CT-COM
  "InternetGatewayDevice.X_INTELBRAS_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.X_INTELBRAS_GponInterfaceConfig.TXPower",
  "InternetGatewayDevice.X_CT-COM_GponInterfaceConfig.RXPower",
  "InternetGatewayDevice.X_CT-COM_GponInterfaceConfig.TXPower",
  // Diagnóstico
  "InternetGatewayDevice.IPPingDiagnostics.AverageResponseTime",
  "InternetGatewayDevice.IPPingDiagnostics.SuccessCount",
  "InternetGatewayDevice.IPPingDiagnostics.FailureCount",
];

// ── XML / SOAP helpers ─────────────────────────────────────────────────────────

function extractTag(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "i");
  return xml.match(re)?.[1]?.trim() ?? null;
}

function extractAll(xml, tag) {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, "gi");
  return [...xml.matchAll(re)].map(m => m[1].trim());
}

function detectMethod(xml) {
  const methods = [
    "Inform", "GetParameterValuesResponse", "SetParameterValuesResponse",
    "RebootResponse", "GetRPCMethodsResponse", "TransferCompleteResponse",
    "DownloadResponse", "FactoryResetResponse", "Empty",
  ];
  for (const m of methods) {
    if (xml.includes(`:${m}`) || xml.includes(`<${m}`)) return m;
  }
  // Empty body = CPE aguardando próximo comando
  if (!xml || xml.trim().length < 50) return "Empty";
  return "Unknown";
}

function parseInform(xml) {
  const deviceId = {
    manufacturer: extractTag(xml, "Manufacturer") || "",
    oui:          extractTag(xml, "OUI") || "",
    productClass: extractTag(xml, "ProductClass") || "",
    serialNumber: extractTag(xml, "SerialNumber") || "",
  };

  const events = extractAll(xml, "EventCode").map(e => e.trim());

  // Extrair parâmetros enviados no Inform
  const params = {};
  const nameMatches  = [...xml.matchAll(/<(?:[^:>]+:)?Name[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Name>/gi)];
  const valueMatches = [...xml.matchAll(/<(?:[^:>]+:)?Value[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Value>/gi)];
  nameMatches.forEach((m, i) => {
    if (valueMatches[i]) params[m[1].trim()] = valueMatches[i][1].trim();
  });

  return { deviceId, events, params };
}

function parseGetParameterValuesResponse(xml) {
  const params = {};
  const nameMatches  = [...xml.matchAll(/<(?:[^:>]+:)?Name[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Name>/gi)];
  const valueMatches = [...xml.matchAll(/<(?:[^:>]+:)?Value[^>]*>([\s\S]*?)<\/(?:[^:>]+:)?Value>/gi)];
  nameMatches.forEach((m, i) => {
    if (valueMatches[i]) params[m[1].trim()] = valueMatches[i][1].trim();
  });
  return params;
}

// ── Construtores de SOAP response ─────────────────────────────────────────────

function soapEnvelope(body, id = "1") {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope
  xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:SOAP-ENC="http://schemas.xmlsoap.org/soap/encoding/"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:cwmp="urn:dslforum-org:cwmp-1-0">
  <SOAP-ENV:Header>
    <cwmp:ID SOAP-ENV:mustUnderstand="1">${id}</cwmp:ID>
  </SOAP-ENV:Header>
  <SOAP-ENV:Body>
    ${body}
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
}

function buildInformResponse(id) {
  return soapEnvelope(`<cwmp:InformResponse><MaxEnvelopes>1</MaxEnvelopes></cwmp:InformResponse>`, id);
}

function buildGetParameterValues(params, id = "2") {
  const list = params.map(p => `<string>${p}</string>`).join("\n        ");
  return soapEnvelope(`
    <cwmp:GetParameterValues>
      <ParameterNames SOAP-ENC:arrayType="xsd:string[${params.length}]">
        ${list}
      </ParameterNames>
    </cwmp:GetParameterValues>`, id);
}

function buildSetParameterValues(params, id = "3") {
  // params = [{ name, value, type }]
  const list = params.map(p =>
    `<ParameterValueStruct>
      <Name>${p.name}</Name>
      <Value xsi:type="xsd:string">${escapeXml(String(p.value))}</Value>
    </ParameterValueStruct>`
  ).join("\n");
  return soapEnvelope(`
    <cwmp:SetParameterValues>
      <ParameterList SOAP-ENC:arrayType="cwmp:ParameterValueStruct[${params.length}]">
        ${list}
      </ParameterList>
      <ParameterKey>maxxi-${Date.now()}</ParameterKey>
    </cwmp:SetParameterValues>`, id);
}

function buildReboot(id = "4") {
  return soapEnvelope(`<cwmp:Reboot><CommandKey>maxxi-reboot-${Date.now()}</CommandKey></cwmp:Reboot>`, id);
}

function buildDownload(url, fileType = "1 Firmware Upgrade Image", fileSize = 0, id = "5") {
  return soapEnvelope(`
    <cwmp:Download>
      <CommandKey>maxxi-fw-${Date.now()}</CommandKey>
      <FileType>${fileType}</FileType>
      <URL>${escapeXml(url)}</URL>
      <Username></Username>
      <Password></Password>
      <FileSize>${fileSize}</FileSize>
      <TargetFileName></TargetFileName>
      <DelaySeconds>0</DelaySeconds>
      <SuccessURL></SuccessURL>
      <FailureURL></FailureURL>
    </cwmp:Download>`, id);
}

function buildEmpty() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/">
  <SOAP-ENV:Header/>
  <SOAP-ENV:Body/>
</SOAP-ENV:Envelope>`;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Normalização de parâmetros para o banco ────────────────────────────────────

function normalizarParams(raw) {
  const p = raw;
  return {
    // Identificação
    manufacturer:  p["InternetGatewayDevice.DeviceInfo.Manufacturer"] || null,
    model:         p["InternetGatewayDevice.DeviceInfo.ModelName"] || null,
    hardware_ver:  p["InternetGatewayDevice.DeviceInfo.HardwareVersion"] || null,
    firmware:      p["InternetGatewayDevice.DeviceInfo.SoftwareVersion"] || null,
    uptime_seg:    parseInt(p["InternetGatewayDevice.DeviceInfo.UpTime"]) || null,
    // WAN
    wan_status:    p["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ConnectionStatus"] || null,
    ip_wan:        p["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress"] || null,
    pppoe_user:    p["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Username"] || null,
    wan_uptime:    parseInt(p["InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.Uptime"]) || null,
    // Wi-Fi 2.4GHz
    ssid_24:       p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID"] || null,
    wifi_pass_24:  p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase"] || null,
    channel_24:    p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Channel"] || null,
    wifi_status_24:p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.Status"] || null,
    clients_24:    parseInt(p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.AssociatedDeviceNumberOfEntries"]) || null,
    // Wi-Fi 5GHz
    ssid_5:        p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.SSID"] || null,
    wifi_pass_5:   p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.PreSharedKey.1.KeyPassphrase"] || null,
    channel_5:     p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Channel"] || null,
    wifi_status_5: p["InternetGatewayDevice.LANDevice.1.WLANConfiguration.5.Status"] || null,
    // GPON Rx/Tx (tenta Intelbras, depois CT-COM)
    sinal_rx: parseFloat(
      p["InternetGatewayDevice.X_INTELBRAS_GponInterfaceConfig.RXPower"] ||
      p["InternetGatewayDevice.X_CT-COM_GponInterfaceConfig.RXPower"] || "0"
    ) || null,
    sinal_tx: parseFloat(
      p["InternetGatewayDevice.X_INTELBRAS_GponInterfaceConfig.TXPower"] ||
      p["InternetGatewayDevice.X_CT-COM_GponInterfaceConfig.TXPower"] || "0"
    ) || null,
  };
}

function classificarSinal(rx) {
  if (!rx) return "desconhecido";
  const v = parseFloat(rx);
  if (v > -20) return "otimo";
  if (v > -24) return "bom";
  if (v > -28) return "fraco";
  return "critico";
}

// ── Sessões ativas (memória) ───────────────────────────────────────────────────
// { [sessionKey]: { deviceId, commandsSent: [], step: 'inform'|'params'|'cmd'|'done' } }
const _sessions = new Map();

function sessionKey(req) {
  return req.ip + "_" + (req.headers["cookie"] || "");
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function handleCWMP(req, res) {
  // Log imediato — qualquer request que chegar aqui aparece
  console.log(`📡 ACS handleCWMP: method=${req.method} rawBodyLen=${(req.rawBody||"").length} hasAuth=${!!req.headers.authorization}`);
  logger.info(`📡 ACS ← ${req.method} ${req.path} ip=${req.ip}`);
  const acsUser = process.env.ACS_USER || "";
  const acsPass = process.env.ACS_PASS || "";
  if (acsUser) {
    const auth = req.headers.authorization || "";
    const expected = "Basic " + Buffer.from(`${acsUser}:${acsPass}`).toString("base64");
    if (auth !== expected) {
      console.log(`🔐 ACS: 401 Unauthorized (auth="${auth.slice(0,20)}")`);
      res.setHeader("WWW-Authenticate", 'Basic realm="ACS"');
      return res.status(401).send("Unauthorized");
    }
  }

  res.setHeader("Content-Type", "text/xml; charset=utf-8");

  const body = req.rawBody || "";
  const skey = sessionKey(req);

  // Body vazio = CPE aguardando (CPE mandou resposta e espera próximo cmd)
  if (!body || body.trim().length < 20) {
    const sess = _sessions.get(skey);
    if (sess) {
      const nextCmd = await getNextCommand(sess.deviceId);
      if (nextCmd) {
        const soap = buildCommandSOAP(nextCmd);
        if (soap) {
          await markCommandDone(nextCmd.id, "enviado");
          sess.lastCmd = nextCmd;
          logger.info(`🔧 ACS → ${sess.deviceId}: ${nextCmd.tipo}`);
          return res.send(soap);
        }
      }
      _sessions.delete(skey);
    }
    return res.send(buildEmpty());
  }

  const method = detectMethod(body);
  logger.info(`📡 ACS ← ${req.ip}: ${method}`);

  try {
    if (method === "Inform") {
      const { deviceId, events, params } = parseInform(body);
      const sn = deviceId.serialNumber || req.ip;
      const cwmpId = extractTag(body, "ID") || "1";

      // Upsert no banco
      const norm = normalizarParams(params);
      const qualidade = classificarSinal(norm.sinal_rx);
      const deviceDbId = await upsertDevice({
        serial: sn,
        manufacturer: deviceId.manufacturer,
        oui: deviceId.oui,
        product_class: deviceId.productClass,
        model: norm.model || deviceId.productClass,
        firmware: norm.firmware,
        ip: req.ip,
        ultimo_inform: new Date(),
        params_json: params,
        ...norm,
        qualidade_sinal: qualidade,
      });

      await saveInformEvent(deviceDbId, events, req.ip);
      await saveParameters(deviceDbId, params);

      // Inicia sessão
      _sessions.set(skey, { deviceId: deviceDbId, serialNumber: sn, step: "inform", cwmpId });

      // Responde Inform e imediatamente pede todos os parâmetros
      const informResp = buildInformResponse(cwmpId);
      res.send(informResp);

      // Na próxima requisição (body vazio), enviará GetParameterValues
      // Enfileira GetParameterValues como primeiro comando se não há nenhum na fila
      const existeCmd = await getNextCommand(deviceDbId);
      if (!existeCmd) {
        const { query } = await import("./db.js");
        await query(
          `INSERT INTO acs_comandos(device_id, tipo, parametros, status) VALUES($1,$2,$3,'pendente')`,
          [deviceDbId, "GetParameterValues", JSON.stringify({ params: PARAMS_INTELBRAS })]
        );
      }
      return;
    }

    if (method === "GetParameterValuesResponse") {
      const params = parseGetParameterValuesResponse(body);
      const sess = _sessions.get(skey);
      if (sess) {
        const norm = normalizarParams(params);
        const qualidade = classificarSinal(norm.sinal_rx);
        await upsertDevice({
          id: sess.deviceId,
          ...norm,
          qualidade_sinal: qualidade,
          params_json: params,
        });
        await saveParameters(sess.deviceId, params);
        logger.info(`✅ ACS: params salvos para device ${sess.deviceId} (${Object.keys(params).length} params)`);
      }
      // Verifica se há próximo comando
      if (sess) {
        const nextCmd = await getNextCommand(sess.deviceId);
        if (nextCmd) {
          const soap = buildCommandSOAP(nextCmd);
          if (soap) {
            await markCommandDone(nextCmd.id, "enviado");
            return res.send(soap);
          }
        }
      }
      return res.send(buildEmpty());
    }

    if (method === "SetParameterValuesResponse") {
      const sess = _sessions.get(skey);
      if (sess?.lastCmd) {
        await markCommandDone(sess.lastCmd.id, "concluido");
        await saveAuditoria(sess.deviceId, sess.lastCmd.tipo, "concluido", sess.lastCmd.parametros);
      }
      const nextCmd = sess ? await getNextCommand(sess.deviceId) : null;
      if (nextCmd) {
        const soap = buildCommandSOAP(nextCmd);
        if (soap) { await markCommandDone(nextCmd.id, "enviado"); return res.send(soap); }
      }
      return res.send(buildEmpty());
    }

    if (method === "RebootResponse") {
      const sess = _sessions.get(skey);
      if (sess?.lastCmd) {
        await markCommandDone(sess.lastCmd.id, "concluido");
        await saveAuditoria(sess.deviceId, "reboot", "concluido", {});
        logger.info(`🔄 ACS: reboot confirmado para device ${sess.deviceId}`);
      }
      _sessions.delete(skey);
      return res.send(buildEmpty());
    }

    if (method === "DownloadResponse") {
      const sess = _sessions.get(skey);
      if (sess?.lastCmd) await markCommandDone(sess.lastCmd.id, "concluido");
      return res.send(buildEmpty());
    }

    // Qualquer outro método: resposta vazia
    return res.send(buildEmpty());

  } catch (e) {
    logger.error(`❌ ACS handler error: ${e.message}`);
    return res.send(buildEmpty());
  }
}

// ── Constrói SOAP a partir do comando da fila ─────────────────────────────────
function buildCommandSOAP(cmd) {
  const p = cmd.parametros || {};
  switch (cmd.tipo) {
    case "GetParameterValues":
      return buildGetParameterValues(p.params || PARAMS_INTELBRAS, "2");
    case "SetParameterValues":
      return buildSetParameterValues(p.params || [], "3");
    case "Reboot":
      return buildReboot("4");
    case "Download":
      return buildDownload(p.url, p.fileType, p.fileSize, "5");
    default:
      return null;
  }
}

// ── API para enfileirar comandos de fora (admin, agente IA) ───────────────────

export async function enfileirarComando(deviceId, tipo, parametros = {}, solicitante = "admin") {
  const { query } = await import("./db.js");
  const r = await query(
    `INSERT INTO acs_comandos(device_id, tipo, parametros, status, solicitante)
     VALUES($1,$2,$3,'pendente',$4) RETURNING id`,
    [deviceId, tipo, JSON.stringify(parametros), solicitante]
  );
  logger.info(`📋 ACS: comando ${tipo} enfileirado para device ${deviceId} (por ${solicitante})`);
  return r.rows[0]?.id;
}

export async function enfileirarReboot(deviceId, solicitante = "admin") {
  return enfileirarComando(deviceId, "Reboot", {}, solicitante);
}

export async function enfileirarSetWifi(deviceId, { ssid, senha, banda = "2.4" }, solicitante = "admin") {
  const paramPath = banda === "5" || banda === "5GHz"
    ? "InternetGatewayDevice.LANDevice.1.WLANConfiguration.5"
    : "InternetGatewayDevice.LANDevice.1.WLANConfiguration.1";

  const params = [
    { name: `${paramPath}.SSID`, value: ssid },
    { name: `${paramPath}.PreSharedKey.1.KeyPassphrase`, value: senha },
    { name: `${paramPath}.BeaconType`, value: "WPAand11i" },
    { name: `${paramPath}.WPAEncryptionModes`, value: "AESEncryption" },
  ];
  return enfileirarComando(deviceId, "SetParameterValues", { params }, solicitante);
}

export async function enfileirarGetParams(deviceId, params = PARAMS_INTELBRAS) {
  return enfileirarComando(deviceId, "GetParameterValues", { params }, "auto");
}
