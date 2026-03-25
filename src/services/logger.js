/**
 * logger.js — Ring buffer + SSE broadcast
 * SEM dependência do db.js para evitar circular import
 * Stats são salvos no banco via db.js diretamente no agent.js
 */

const MAX_BUF = 500;
const logBuffer = [];
const sseClients = new Set();

function push(level, message) {
  const entry = { ts: Date.now(), level, message };
  logBuffer.push(entry);
  if (logBuffer.length > MAX_BUF) logBuffer.shift();
  const data = JSON.stringify(entry);
  sseClients.forEach(res => {
    try { res.write(`data: ${data}\n\n`); }
    catch { sseClients.delete(res); }
  });
}

export const logger = {
  info:  (m) => { console.log("[INFO]",  m); push("info",  m); },
  error: (m) => { console.error("[ERR]",  m); push("error", m); },
  warn:  (m) => { console.warn("[WARN]",  m); push("warn",  m); },
};

export function getLogBuffer() { return [...logBuffer]; }
export function addSseClient(res)    { sseClients.add(res); }
export function removeSseClient(res) { sseClients.delete(res); }

// ── Stats em memória ──────────────────────────────────────────────────────────
export const stats = {
  totalAtendimentos: 0,
  totalTokensInput:  0,
  totalTokensOutput: 0,
  totalCacheHits:    0,
  erros:             0,
  iniciadoEm:        new Date().toISOString(),
  historico:         [],
};

export async function loadStats() {
  try {
    // Import dinâmico para evitar circular
    const { query } = await import("./db.js");
    const r = await query("SELECT * FROM stats WHERE id=1");
    if (r.rows[0]) {
      const row = r.rows[0];
      stats.totalAtendimentos = row.total_atendimentos || 0;
      stats.totalTokensInput  = parseInt(row.total_tokens_input)  || 0;
      stats.totalTokensOutput = parseInt(row.total_tokens_output) || 0;
      stats.totalCacheHits    = parseInt(row.total_cache_hits)    || 0;
      stats.erros             = row.erros || 0;
      stats.iniciadoEm        = row.iniciado_em || stats.iniciadoEm;
      stats.historico         = row.historico   || [];
    }
    logger.info("✅ Stats carregadas do banco");
  } catch (e) {
    logger.warn("⚠️ Stats iniciando do zero: " + e.message);
  }
}

export async function incrementStats(tokens_input, tokens_output, cache_hits, erro) {
  stats.totalAtendimentos++;
  stats.totalTokensInput  += tokens_input  || 0;
  stats.totalTokensOutput += tokens_output || 0;
  stats.totalCacheHits    += cache_hits    || 0;
  if (erro) stats.erros++;
  try {
    const { query } = await import("./db.js");
    await query(
      `UPDATE stats SET
         total_atendimentos  = total_atendimentos  + 1,
         total_tokens_input  = total_tokens_input  + $1,
         total_tokens_output = total_tokens_output + $2,
         total_cache_hits    = total_cache_hits    + $3,
         erros               = erros + $4
       WHERE id=1`,
      [tokens_input||0, tokens_output||0, cache_hits||0, erro?1:0]
    );
  } catch {}
}

export async function appendHistorico(entry) {
  stats.historico.push(entry);
  if (stats.historico.length > 50) stats.historico.splice(0, stats.historico.length - 50);
  try {
    const { query } = await import("./db.js");
    await query(
      `UPDATE stats SET historico = historico || $1::jsonb WHERE id=1`,
      [JSON.stringify([entry])]
    );
  } catch {}
}

export function getStats() {
  const c = (stats.totalTokensInput/1e6)*0.80
          + (stats.totalTokensOutput/1e6)*4.00
          + (stats.totalCacheHits/1e6)*0.08;
  return {
    ...stats,
    custoUSD: c.toFixed(4),
    custoBRL: (c * 5.85).toFixed(2),
    uptime: Math.floor((Date.now() - new Date(stats.iniciadoEm).getTime()) / 1000),
    errosPorcentagem: stats.totalAtendimentos > 0
      ? ((stats.erros / stats.totalAtendimentos) * 100).toFixed(1)
      : "0.0",
  };
}
