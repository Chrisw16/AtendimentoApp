/**
 * acs-db.js — Camada de dados para o ACS TR-069
 * Todas as queries do servidor CWMP ficam aqui para separar responsabilidades.
 */

import { query } from "./db.js";

/**
 * Cria ou atualiza um dispositivo.
 * Chave única: serial number (ou IP se serial vazio).
 */
export async function upsertDevice(data) {
  const {
    id, serial, manufacturer, oui, product_class, model, firmware,
    ip, hardware_ver, uptime_seg, wan_status, ip_wan, pppoe_user, wan_uptime,
    ssid_24, wifi_pass_24, channel_24, wifi_status_24, clients_24,
    ssid_5, wifi_pass_5, channel_5, wifi_status_5,
    sinal_rx, sinal_tx, qualidade_sinal, params_json, ultimo_inform,
  } = data;

  if (id) {
    // Atualização parcial (sem mudar serial/oui)
    const r = await query(`
      UPDATE acs_devices SET
        model = COALESCE($1, model),
        firmware = COALESCE($2, firmware),
        ip = COALESCE($3, ip),
        hardware_ver = COALESCE($4, hardware_ver),
        uptime_seg = COALESCE($5, uptime_seg),
        wan_status = COALESCE($6, wan_status),
        ip_wan = COALESCE($7, ip_wan),
        pppoe_user = COALESCE($8, pppoe_user),
        wan_uptime = COALESCE($9, wan_uptime),
        ssid_24 = COALESCE($10, ssid_24),
        wifi_pass_24 = COALESCE($11, wifi_pass_24),
        channel_24 = COALESCE($12, channel_24),
        wifi_status_24 = COALESCE($13, wifi_status_24),
        clients_24 = COALESCE($14, clients_24),
        ssid_5 = COALESCE($15, ssid_5),
        wifi_pass_5 = COALESCE($16, wifi_pass_5),
        channel_5 = COALESCE($17, channel_5),
        wifi_status_5 = COALESCE($18, wifi_status_5),
        sinal_rx = COALESCE($19, sinal_rx),
        sinal_tx = COALESCE($20, sinal_tx),
        qualidade_sinal = COALESCE($21, qualidade_sinal),
        params_json = COALESCE($22, params_json),
        ultimo_inform = COALESCE($23, ultimo_inform),
        atualizado = NOW()
      WHERE id = $24
      RETURNING id`,
      [model, firmware, ip, hardware_ver, uptime_seg,
       wan_status, ip_wan, pppoe_user, wan_uptime,
       ssid_24, wifi_pass_24, channel_24, wifi_status_24, clients_24,
       ssid_5, wifi_pass_5, channel_5, wifi_status_5,
       sinal_rx, sinal_tx, qualidade_sinal,
       params_json ? JSON.stringify(params_json) : null,
       ultimo_inform || new Date(),
       id]
    );
    return r.rows[0]?.id ?? id;
  }

  // INSERT ou UPDATE por serial
  const r = await query(`
    INSERT INTO acs_devices(
      serial, manufacturer, oui, product_class, model, firmware, ip,
      hardware_ver, uptime_seg, wan_status, ip_wan, pppoe_user, wan_uptime,
      ssid_24, wifi_pass_24, channel_24, wifi_status_24, clients_24,
      ssid_5, wifi_pass_5, channel_5, wifi_status_5,
      sinal_rx, sinal_tx, qualidade_sinal, params_json, ultimo_inform
    ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
    ON CONFLICT(serial) DO UPDATE SET
      manufacturer = EXCLUDED.manufacturer,
      model = COALESCE(EXCLUDED.model, acs_devices.model),
      firmware = COALESCE(EXCLUDED.firmware, acs_devices.firmware),
      ip = EXCLUDED.ip,
      hardware_ver = COALESCE(EXCLUDED.hardware_ver, acs_devices.hardware_ver),
      uptime_seg = COALESCE(EXCLUDED.uptime_seg, acs_devices.uptime_seg),
      wan_status = COALESCE(EXCLUDED.wan_status, acs_devices.wan_status),
      ip_wan = COALESCE(EXCLUDED.ip_wan, acs_devices.ip_wan),
      pppoe_user = COALESCE(EXCLUDED.pppoe_user, acs_devices.pppoe_user),
      wan_uptime = COALESCE(EXCLUDED.wan_uptime, acs_devices.wan_uptime),
      ssid_24 = COALESCE(EXCLUDED.ssid_24, acs_devices.ssid_24),
      wifi_pass_24 = COALESCE(EXCLUDED.wifi_pass_24, acs_devices.wifi_pass_24),
      channel_24 = COALESCE(EXCLUDED.channel_24, acs_devices.channel_24),
      wifi_status_24 = COALESCE(EXCLUDED.wifi_status_24, acs_devices.wifi_status_24),
      clients_24 = COALESCE(EXCLUDED.clients_24, acs_devices.clients_24),
      ssid_5 = COALESCE(EXCLUDED.ssid_5, acs_devices.ssid_5),
      wifi_pass_5 = COALESCE(EXCLUDED.wifi_pass_5, acs_devices.wifi_pass_5),
      channel_5 = COALESCE(EXCLUDED.channel_5, acs_devices.channel_5),
      wifi_status_5 = COALESCE(EXCLUDED.wifi_status_5, acs_devices.wifi_status_5),
      sinal_rx = COALESCE(EXCLUDED.sinal_rx, acs_devices.sinal_rx),
      sinal_tx = COALESCE(EXCLUDED.sinal_tx, acs_devices.sinal_tx),
      qualidade_sinal = COALESCE(EXCLUDED.qualidade_sinal, acs_devices.qualidade_sinal),
      params_json = COALESCE(EXCLUDED.params_json, acs_devices.params_json),
      ultimo_inform = EXCLUDED.ultimo_inform,
      atualizado = NOW()
    RETURNING id`,
    [serial, manufacturer, oui, product_class, model, firmware, ip,
     hardware_ver, uptime_seg, wan_status, ip_wan, pppoe_user, wan_uptime,
     ssid_24, wifi_pass_24, channel_24, wifi_status_24, clients_24,
     ssid_5, wifi_pass_5, channel_5, wifi_status_5,
     sinal_rx, sinal_tx, qualidade_sinal,
     params_json ? JSON.stringify(params_json) : null,
     ultimo_inform || new Date()]
  );
  return r.rows[0]?.id;
}

/** Salva todos os parâmetros brutos do CPE */
export async function saveParameters(deviceId, params) {
  if (!params || !Object.keys(params).length) return;
  // Bulk upsert na tabela acs_params
  const values = Object.entries(params).map(([nome, valor]) => [deviceId, nome, String(valor)]);
  for (const [did, nome, valor] of values) {
    await query(
      `INSERT INTO acs_params(device_id, nome, valor, atualizado)
       VALUES($1,$2,$3,NOW())
       ON CONFLICT(device_id, nome) DO UPDATE SET valor=$3, atualizado=NOW()`,
      [did, nome, valor]
    ).catch(() => {}); // ignora erros individuais
  }
}

/** Salva evento de Inform (bootstrap, boot, periodic...) */
export async function saveInformEvent(deviceId, events, ip) {
  for (const ev of events) {
    await query(
      `INSERT INTO acs_events(device_id, evento, ip) VALUES($1,$2,$3)`,
      [deviceId, ev, ip]
    ).catch(() => {});
  }
}

/** Próximo comando pendente para um device */
export async function getNextCommand(deviceId) {
  const r = await query(
    `SELECT * FROM acs_comandos
     WHERE device_id=$1 AND status='pendente'
     ORDER BY criado_em ASC LIMIT 1`,
    [deviceId]
  );
  if (!r.rows.length) return null;
  const row = r.rows[0];
  try { row.parametros = typeof row.parametros === 'string' ? JSON.parse(row.parametros) : row.parametros; } catch {}
  return row;
}

/** Marca comando como enviado/concluído/erro */
export async function markCommandDone(id, status = "concluido") {
  await query(
    `UPDATE acs_comandos SET status=$1, executado_em=NOW() WHERE id=$2`,
    [status, id]
  );
}

/** Salva auditoria de ação remota */
export async function saveAuditoria(deviceId, acao, resultado, detalhes = {}) {
  await query(
    `INSERT INTO acs_auditoria(device_id, acao, resultado, detalhes) VALUES($1,$2,$3,$4)`,
    [deviceId, acao, resultado, JSON.stringify(detalhes)]
  ).catch(() => {});
}

/** Lista dispositivos com filtros */
export async function listarDevices(filtros = {}) {
  let sql = `SELECT * FROM acs_devices WHERE 1=1`;
  const params = [];
  if (filtros.serial) { params.push(`%${filtros.serial}%`); sql += ` AND serial ILIKE $${params.length}`; }
  if (filtros.modelo) { params.push(`%${filtros.modelo}%`); sql += ` AND model ILIKE $${params.length}`; }
  if (filtros.ip) { params.push(`%${filtros.ip}%`); sql += ` AND ip ILIKE $${params.length}`; }
  if (filtros.qualidade) { params.push(filtros.qualidade); sql += ` AND qualidade_sinal = $${params.length}`; }
  sql += ` ORDER BY atualizado DESC LIMIT ${filtros.limite || 200}`;
  const r = await query(sql, params);
  return r.rows;
}

/** Dispositivo por ID */
export async function getDevice(id) {
  const r = await query(`SELECT * FROM acs_devices WHERE id=$1`, [id]);
  return r.rows[0] || null;
}

/** Parâmetros brutos de um device */
export async function getParams(deviceId) {
  const r = await query(`SELECT nome, valor, atualizado FROM acs_params WHERE device_id=$1 ORDER BY nome`, [deviceId]);
  return r.rows;
}

/** Histórico de eventos */
export async function getEvents(deviceId, limite = 50) {
  const r = await query(
    `SELECT evento, ip, criado_em FROM acs_events WHERE device_id=$1 ORDER BY criado_em DESC LIMIT $2`,
    [deviceId, limite]
  );
  return r.rows;
}

/** Histórico de auditoria */
export async function getAuditoria(deviceId, limite = 30) {
  const r = await query(
    `SELECT acao, resultado, detalhes, criado_em FROM acs_auditoria WHERE device_id=$1 ORDER BY criado_em DESC LIMIT $2`,
    [deviceId, limite]
  );
  return r.rows;
}

/** Histórico de comandos */
export async function getComandos(deviceId, limite = 30) {
  const r = await query(
    `SELECT tipo, status, parametros, solicitante, criado_em, executado_em
     FROM acs_comandos WHERE device_id=$1 ORDER BY criado_em DESC LIMIT $2`,
    [deviceId, limite]
  );
  return r.rows;
}

/** Stats resumidas para o dashboard */
export async function getAcsStats() {
  const r = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ultimo_inform > NOW() - INTERVAL '5 minutes') as online_5min,
      COUNT(*) FILTER (WHERE ultimo_inform > NOW() - INTERVAL '1 hour') as online_1h,
      COUNT(*) FILTER (WHERE qualidade_sinal = 'critico') as sinal_critico,
      COUNT(*) FILTER (WHERE qualidade_sinal = 'fraco') as sinal_fraco,
      COUNT(*) FILTER (WHERE wan_status != 'Connected' AND wan_status IS NOT NULL) as wan_off
    FROM acs_devices`);
  return r.rows[0];
}
