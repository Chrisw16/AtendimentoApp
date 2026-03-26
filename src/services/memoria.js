/**
 * memoria.js — PostgreSQL — multi-tenant
 * Memória de clientes + sessões com TTL de 24h
 */
import { query, withTransaction } from "./db.js";
import { CITMAX_TENANT_ID } from "./db.js";

const TTL_MS = 24 * 3600 * 1000;

// ── MEMÓRIA DE CLIENTES ───────────────────────────────────────────────────────
export async function buscarMemoria(telefone, tenantId = CITMAX_TENANT_ID) {
  const r = await query(
    `SELECT * FROM memoria_clientes WHERE tenant_id=$1 AND telefone=$2`,
    [tenantId, telefone]
  );
  return r.rows[0] || null;
}

export async function salvarMemoria(telefone, dados, tenantId = CITMAX_TENANT_ID) {
  const existing = await buscarMemoria(telefone, tenantId);
  const merged = { ...(existing?.dados || {}), ...dados };
  await query(
    `INSERT INTO memoria_clientes(tenant_id,telefone,nome,cpfcnpj,dados,ultima_visita)
     VALUES($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT(tenant_id,telefone) DO UPDATE SET
       nome         = COALESCE($3, memoria_clientes.nome),
       cpfcnpj      = COALESCE($4, memoria_clientes.cpfcnpj),
       dados        = $5::jsonb,
       ultima_visita = NOW()`,
    [tenantId, telefone, dados.nome || existing?.nome, dados.cpfcnpj || existing?.cpfcnpj, JSON.stringify(merged)]
  );
}

export async function registrarHistorico(telefone, entry, tenantId = CITMAX_TENANT_ID) {
  await query(
    `UPDATE memoria_clientes
     SET historico = (
       CASE WHEN jsonb_array_length(historico) >= 50
         THEN (historico -> 1)
         ELSE historico
       END || $3::jsonb
     )
     WHERE tenant_id=$1 AND telefone=$2`,
    [tenantId, telefone, JSON.stringify(entry)]
  );
}

export async function listarClientes(filtro, tenantId = CITMAX_TENANT_ID) {
  let sql = `SELECT telefone, nome, cpfcnpj, ultima_visita,
               (SELECT jsonb_agg(h) FROM jsonb_array_elements(historico) h LIMIT 3) as historico_recente
             FROM memoria_clientes WHERE tenant_id=$1`;
  const params = [tenantId];
  if (filtro) {
    sql += ` AND (telefone ILIKE $2 OR nome ILIKE $2 OR cpfcnpj ILIKE $2)`;
    params.push("%" + filtro + "%");
  }
  sql += ` ORDER BY ultima_visita DESC LIMIT 50`;
  const r = await query(sql, params);
  return r.rows;
}

export async function deletarMemoria(telefone, tenantId = CITMAX_TENANT_ID) {
  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM memoria_clientes WHERE tenant_id=$1 AND telefone=$2`, [tenantId, telefone]);
    await tx.query(`DELETE FROM sessoes WHERE tenant_id=$1 AND telefone=$2`, [tenantId, telefone]);
  });
}

// ── SESSÕES ───────────────────────────────────────────────────────────────────
export async function buscarSessao(telefone, tenantId = CITMAX_TENANT_ID) {
  const r = await query(
    `SELECT * FROM sessoes WHERE tenant_id=$1 AND telefone=$2`,
    [tenantId, telefone]
  );
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  // Checa TTL
  if (Date.now() - parseInt(row.criado_em) > TTL_MS) {
    await limparSessao(telefone, tenantId);
    return null;
  }
  let dados = {};
  try { dados = typeof row.dados === "object" ? row.dados : JSON.parse(row.dados || "{}"); } catch {}
  return {
    ...dados,
    telefone:       row.telefone,
    nome:           row.nome           || dados.nome,
    cpfcnpj:        row.cpfcnpj        || dados.cpfcnpj,
    contrato_ativo: row.contrato_ativo || dados.contrato_ativo,
    criado_em:      row.criado_em,
  };
}

export async function salvarSessao(telefone, dados, tenantId = CITMAX_TENANT_ID) {
  if (!dados || typeof dados !== "object") return;
  const { criado_em, ...dadosLimpos } = dados;
  const cpfcnpj        = dados.cpfcnpj        || null;
  const nome           = dados.nome           || null;
  const contrato_ativo = dados.contrato_ativo || null;
  const ts = Date.now();
  await query(
    `INSERT INTO sessoes(tenant_id,telefone,nome,cpfcnpj,contrato_ativo,dados,criado_em)
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)
     ON CONFLICT(tenant_id,telefone) DO UPDATE SET
       nome           = COALESCE($3, sessoes.nome),
       cpfcnpj        = COALESCE($4, sessoes.cpfcnpj),
       contrato_ativo = COALESCE($5, sessoes.contrato_ativo),
       dados          = sessoes.dados || $6::jsonb,
       criado_em      = $7`,
    [tenantId, telefone, nome, cpfcnpj, contrato_ativo, JSON.stringify(dadosLimpos), ts]
  );
}

export async function limparSessao(telefone, tenantId = CITMAX_TENANT_ID) {
  await query(`DELETE FROM sessoes WHERE tenant_id=$1 AND telefone=$2`, [tenantId, telefone]);
}

export async function listarSessoes(tenantId = CITMAX_TENANT_ID) {
  const r = await query(
    `SELECT * FROM sessoes WHERE tenant_id=$1 ORDER BY criado_em DESC`,
    [tenantId]
  );
  const agora = Date.now();
  return r.rows
    .filter(s => agora - parseInt(s.criado_em) < TTL_MS)
    .map(s => ({
      ...s,
      expira_em: Math.max(0, Math.floor((parseInt(s.criado_em) + TTL_MS - agora) / 60000)),
      ativa: true,
    }));
}
