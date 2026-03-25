import net from "net";
import { exec } from "child_process";
import { query } from "./db.js";
import { logger } from "./logger.js";

const _cache = {};
const _ultimaMudanca = {}; // { [id]: { status, ts } }
let _intervalo = null;
let _alertFn = null;

export function setAlertCallback(fn) { _alertFn = fn; }

function checkTCP(host, porta, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const sock = net.createConnection({ host, port: porta, timeout: timeoutMs });
    sock.once("connect", () => { const ms = Date.now()-t0; sock.destroy(); resolve({ ok:true, ms }); });
    sock.once("error",   (e) => resolve({ ok:false, erro: e.message }));
    sock.once("timeout", ()  => { sock.destroy(); resolve({ ok:false, erro:"timeout" }); });
  });
}

async function checkHTTP(host, timeoutMs = 5000) {
  const t0 = Date.now();
  const url = host.startsWith("http") ? host : `http://${host}`;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const r = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(timer);
    return { ok: r.status < 500, ms: Date.now()-t0, status: r.status };
  } catch(e) { return { ok:false, erro: e.message?.slice(0,100) }; }
}

function checkPing(host, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    exec(`ping -c 1 -W ${Math.ceil(timeoutMs/1000)} ${host}`, { timeout: timeoutMs+500 }, (err, stdout) => {
      if (err) return resolve({ ok:false, erro:"unreachable" });
      const match = stdout.match(/time[<=]([\d.]+)\s*ms/);
      resolve({ ok:true, ms: match ? parseFloat(match[1]) : (Date.now()-t0) });
    });
  });
}

function classificar(ms) {
  if (!ms) return "offline";
  if (ms < 100) return "online";
  if (ms < 500) return "lento";
  return "instavel";
}

export async function checarHost(hostRow) {
  const { id, host, tipo, porta } = hostRow;
  let resultado;
  try {
    if (tipo === "http" || tipo === "https")
      resultado = await checkHTTP(host.startsWith("http") ? host : `${tipo}://${host}`);
    else if (tipo === "tcp" && porta)
      resultado = await checkTCP(host, porta);
    else
      resultado = await checkPing(host);
  } catch(e) { resultado = { ok:false, erro: e.message }; }

  const status   = resultado.ok ? classificar(resultado.ms) : "offline";
  const latencia = resultado.ok ? (resultado.ms || null) : null;
  const erro     = resultado.erro || null;

  // Detectar mudança de status
  const anterior = _cache[id]?.status;
  _cache[id] = { status, latencia_ms: latencia, erro, ts: Date.now() };

  if (anterior !== undefined && anterior !== status) {
    _ultimaMudanca[id] = { de: anterior, para: status, ts: Date.now() };
    if (_alertFn) try { _alertFn({ host: hostRow, status, anterior }); } catch {}
  } else if (!_ultimaMudanca[id]) {
    _ultimaMudanca[id] = { de: null, para: status, ts: Date.now() };
  }

  // Salva no banco (throttle: só se mudou ou a cada 5min)
  const prev = _cache[`prev_${id}`];
  const agora = Date.now();
  if (!prev || prev.status !== status || (agora - prev.salvoEm) > 300000) {
    try {
      await query(`INSERT INTO network_checks(host_id,status,latencia_ms,erro) VALUES($1,$2,$3,$4)`,
        [id, status, latencia, erro]);
      await query(`DELETE FROM network_checks WHERE host_id=$1 AND id NOT IN (SELECT id FROM network_checks WHERE host_id=$1 ORDER BY checado_em DESC LIMIT 2880)`, [id]);
      _cache[`prev_${id}`] = { status, salvoEm: agora };
    } catch {}
  }

  return { id, status, latencia_ms: latencia, erro };
}

export async function checarTodos() {
  try {
    const { rows } = await query(`SELECT * FROM network_hosts WHERE ativo = true ORDER BY grupo, nome`);
    if (!rows.length) return [];
    const res = await Promise.allSettled(rows.map(h => checarHost(h)));
    return res.map((r,i) => r.status === "fulfilled"
      ? r.value
      : { id: rows[i].id, status:"offline", erro: r.reason?.message }
    );
  } catch(e) { logger.warn("⚠️ monitor checarTodos: "+e.message); return []; }
}

export async function getStatusRede() {
  try {
    const { rows } = await query(`SELECT * FROM network_hosts WHERE ativo=true ORDER BY grupo, nome`);
    return rows.map(h => ({
      id: h.id, nome: h.nome, grupo: h.grupo, host: h.host, tipo: h.tipo, porta: h.porta,
      ...( _cache[h.id] || { status:"desconhecido", latencia_ms:null }),
      ultima_mudanca: _ultimaMudanca[h.id] || null,
    }));
  } catch { return []; }
}

export async function getHistorico(hostId, limite = 60) {
  const { rows } = await query(
    `SELECT status,latencia_ms,checado_em FROM network_checks WHERE host_id=$1 ORDER BY checado_em DESC LIMIT $2`,
    [hostId, limite]
  );
  return rows.reverse();
}

export async function getHistoricoHorario(hostId) {
  const { rows } = await query(`
    SELECT
      date_trunc('hour', checado_em) AS hora,
      COUNT(*) FILTER (WHERE status='online') AS online,
      COUNT(*) AS total,
      ROUND(AVG(latencia_ms)::numeric,0) AS avg_ms,
      MIN(latencia_ms) AS min_ms,
      MAX(latencia_ms) AS max_ms
    FROM network_checks
    WHERE host_id=$1 AND checado_em > NOW() - INTERVAL '48 hours'
    GROUP BY hora ORDER BY hora ASC`, [hostId]);
  return rows.map(r => ({
    hora: r.hora,
    uptime: r.total > 0 ? Math.round((parseInt(r.online)/parseInt(r.total))*100) : null,
    avg_ms: r.avg_ms ? parseInt(r.avg_ms) : null,
    min_ms: r.min_ms, max_ms: r.max_ms,
    total: parseInt(r.total),
  }));
}

export async function calcularUptimeBulk(hostIds, horas = 24) {
  if (!hostIds.length) return {};
  const { rows } = await query(`
    SELECT host_id,
      COUNT(*) FILTER (WHERE status='online') AS online,
      COUNT(*) AS total
    FROM network_checks
    WHERE host_id = ANY($1::int[]) AND checado_em > NOW() - INTERVAL '${horas} hours'
    GROUP BY host_id`, [hostIds]);
  const result = {};
  rows.forEach(r => {
    result[r.host_id] = r.total > 0 ? Math.round((parseInt(r.online)/parseInt(r.total))*100) : null;
  });
  return result;
}

export function tracerouteHost(host) {
  return new Promise((resolve) => {
    exec(`traceroute -m 15 -w 1 -n ${host}`, { timeout: 25000 }, (err, stdout, stderr) => {
      resolve({ resultado: stdout || stderr || err?.message || "Sem resultado" });
    });
  });
}

export function iniciarMonitor(intervaloSeg = 30) {
  if (_intervalo) clearInterval(_intervalo);
  logger.info(`🌐 Monitor de rede iniciado — intervalo ${intervaloSeg}s`);
  checarTodos().catch(() => {});
  _intervalo = setInterval(() => checarTodos().catch(() => {}), intervaloSeg * 1000);
}

export { _cache, _ultimaMudanca };
