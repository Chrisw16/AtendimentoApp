/**
 * memoria.js — PostgreSQL
 * Memória de clientes + sessões com TTL de 24h
 */
import { query } from "./db.js";

const TTL_MS = 24 * 3600 * 1000;

// ── MEMÓRIA DE CLIENTES ───────────────────────────────────────────────────────
export async function buscarMemoria(telefone) {
  const r = await query(`SELECT * FROM memoria_clientes WHERE telefone=$1`, [telefone]);
  if (!r.rows[0]) return null;
  return r.rows[0];
}

export async function salvarMemoria(telefone, dados) {
  const existing = await buscarMemoria(telefone);
  const merged = { ...(existing?.dados || {}), ...dados };
  const historico = existing?.historico || [];
  await query(
    `INSERT INTO memoria_clientes(telefone,nome,cpfcnpj,dados,ultima_visita)
     VALUES($1,$2,$3,$4::jsonb,NOW())
     ON CONFLICT(telefone) DO UPDATE SET
       nome=COALESCE($2,memoria_clientes.nome),
       cpfcnpj=COALESCE($3,memoria_clientes.cpfcnpj),
       dados=$4::jsonb,
       ultima_visita=NOW()`,
    [telefone, dados.nome || existing?.nome, dados.cpfcnpj || existing?.cpfcnpj, JSON.stringify(merged)]
  );
}

export async function registrarHistorico(telefone, entry) {
  await query(
    `UPDATE memoria_clientes
     SET historico = (
       CASE WHEN jsonb_array_length(historico) >= 50
         THEN (historico -> 1) -- remove o mais antigo
         ELSE historico
       END || $2::jsonb
     )
     WHERE telefone=$1`,
    [telefone, JSON.stringify(entry)]
  );
}

export async function listarClientes(filtro) {
  let sql = `SELECT telefone, nome, cpfcnpj, ultima_visita,
               (SELECT jsonb_agg(h) FROM jsonb_array_elements(historico) h LIMIT 3) as historico_recente
             FROM memoria_clientes`;
  const params = [];
  if (filtro) {
    sql += ` WHERE telefone ILIKE $1 OR nome ILIKE $1 OR cpfcnpj ILIKE $1`;
    params.push("%" + filtro + "%");
  }
  sql += ` ORDER BY ultima_visita DESC LIMIT 50`;
  const r = await query(sql, params);
  return r.rows;
}

export async function deletarMemoria(telefone) {
  await query(`DELETE FROM memoria_clientes WHERE telefone=$1`, [telefone]);
  await query(`DELETE FROM sessoes WHERE telefone=$1`, [telefone]);
}

// ── SESSÕES ───────────────────────────────────────────────────────────────────
export async function buscarSessao(telefone) {
  const r = await query(`SELECT * FROM sessoes WHERE telefone=$1`, [telefone]);
  if (!r.rows[0]) return null;
  const row = r.rows[0];
  // Checa TTL
  if (Date.now() - parseInt(row.criado_em) > TTL_MS) {
    await limparSessao(telefone);
    return null;
  }
  // Mescla colunas dedicadas + dados JSON, colunas têm prioridade
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

export async function salvarSessao(telefone, dados) {
  if (!dados || typeof dados !== "object") return;
  // Remove campos que são colunas DB para não poluir o JSON dados
  const { criado_em, ...dadosLimpos } = dados;
  // Filtra campos undefined
  const cpfcnpj       = dados.cpfcnpj        || null;
  const nome          = dados.nome           || null;
  const contrato_ativo = dados.contrato_ativo || null;
  const ts = Date.now();
  await query(
    `INSERT INTO sessoes(telefone,nome,cpfcnpj,contrato_ativo,dados,criado_em)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)
     ON CONFLICT(telefone) DO UPDATE SET
       nome            = COALESCE($2, sessoes.nome),
       cpfcnpj         = COALESCE($3, sessoes.cpfcnpj),
       contrato_ativo  = COALESCE($4, sessoes.contrato_ativo),
       dados           = sessoes.dados || $5::jsonb,
       criado_em       = $6`,
    [telefone, nome, cpfcnpj, contrato_ativo, JSON.stringify(dadosLimpos), ts]
  );
}

export async function limparSessao(telefone) {
  await query(`DELETE FROM sessoes WHERE telefone=$1`, [telefone]);
}

export async function listarSessoes() {
  const r = await query(`SELECT * FROM sessoes ORDER BY criado_em DESC`);
  const agora = Date.now();
  return r.rows
    .filter(s => agora - parseInt(s.criado_em) < TTL_MS)
    .map(s => ({
      ...s,
      expira_em: Math.max(0, Math.floor((parseInt(s.criado_em) + TTL_MS - agora) / 60000)),
      ativa: true,
    }));
}
