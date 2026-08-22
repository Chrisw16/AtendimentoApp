/**
 * sgpDb.js — leitura SOMENTE-LEITURA do banco do SGP (Postgres 11) para o
 * diagnóstico técnico que a API não entrega: sinal óptico + status da ONU.
 * Pool pg dedicado; credenciais no sistema_kv. Fail-safe: nunca lança pra cima.
 */
import pg from 'pg';
import { getDb } from '../config/db.js';
import { lerValorKV } from './kvSeguro.js';

let pool = null;
let poolPromise = null;

async function getCreds() {
  const db = getDb();
  const rows = await db('sistema_kv').whereIn('chave',
    ['sgpdb_host', 'sgpdb_port', 'sgpdb_name', 'sgpdb_user', 'sgpdb_password']);
  const kv = {};
  rows.forEach(r => { kv[r.chave] = lerValorKV(r.valor, r.chave); });
  return kv;
}

async function getPool() {
  if (pool) return pool;
  if (poolPromise) return poolPromise;
  poolPromise = (async () => {
    const kv = await getCreds();
    if (!kv.sgpdb_host || !kv.sgpdb_user) {
      throw new Error('Banco do SGP não configurado (Configurações → SGP/Banco).');
    }
    const p = new pg.Pool({
      host: kv.sgpdb_host,
      port: Number(kv.sgpdb_port) || 5432,
      database: kv.sgpdb_name || 'dbconect',
      user: kv.sgpdb_user,
      password: kv.sgpdb_password || '',
      ssl: false,
      max: 8,
      options: '-c timezone=America/Sao_Paulo',
      statement_timeout: 5000,
      connectionTimeoutMillis: 5000,
    });
    p.on('error', (e) => console.error('[SGP-DB] pool error:', e.message));
    pool = p;
    return pool;
  })();
  try {
    return await poolPromise;
  } finally {
    poolPromise = null;
  }
}

export function invalidateSgpDbPool() {
  if (pool) { pool.end().catch(() => {}); pool = null; }
  poolPromise = null;
}

// contrato → sinal óptico (netcore_onu.info->optical) + status (radacct).
const QUERY_DIAG_ONU = `
SELECT
  o.onutype AS modelo,
  o.phy_addr AS serial,
  (o.info->'optical'->>'rx')::float8 AS rx_dbm,
  (o.info->'optical'->>'tx')::float8 AS tx_dbm,
  (o.info->'optical'->>'olt_rx')::float8 AS olt_rx_dbm,
  (o.info->'optical'->>'date') AS sinal_lido_em,
  EXISTS(SELECT 1 FROM radacct ra
         WHERE lower(trim(ra.username))=lower(trim(si.login)) AND ra.acctstoptime IS NULL) AS online,
  (SELECT EXTRACT(EPOCH FROM (now()-ra.acctstarttime))::int FROM radacct ra
     WHERE lower(trim(ra.username))=lower(trim(si.login)) AND ra.acctstoptime IS NULL
     ORDER BY ra.acctstarttime DESC LIMIT 1) AS uptime_segundos,
  (SELECT ra.acctterminatecause FROM radacct ra
     WHERE lower(trim(ra.username))=lower(trim(si.login)) AND ra.acctstoptime IS NOT NULL
     ORDER BY ra.acctstoptime DESC LIMIT 1) AS ultima_queda_motivo
FROM admcore_servicointernet si
JOIN netcore_onu o ON o.service_id = si.id AND o.date_removed_from_olt IS NULL AND o.info ? 'optical'
WHERE si.clientecontrato_id = $1
ORDER BY o.id DESC
LIMIT 1;`;

export async function diagnosticoOnu(contrato) {
  const id = Number(contrato);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const p = await getPool();
    const { rows } = await p.query(QUERY_DIAG_ONU, [id]);
    return rows[0] || null;
  } catch (e) {
    console.error('[SGP-DB] diagnosticoOnu:', e.message);
    return null;
  }
}
