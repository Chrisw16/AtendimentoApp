/**
 * audit.js — Audit log for security events
 * Records: logins, config changes, deletions, etc.
 */
export async function initAudit() {
  const { query } = await import("./db.js");
  await query(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id SERIAL PRIMARY KEY,
      agente_id TEXT,
      agente_nome TEXT,
      acao TEXT NOT NULL,
      detalhes TEXT,
      ip TEXT,
      criado_em TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_audit_criado ON audit_log(criado_em)`);
}

export async function registrarAudit(agenteId, agenteNome, acao, detalhes, ip) {
  try {
    const { query } = await import("./db.js");
    await query(
      `INSERT INTO audit_log(agente_id, agente_nome, acao, detalhes, ip) VALUES($1,$2,$3,$4,$5)`,
      [agenteId || 'system', agenteNome || 'System', acao, detalhes || '', ip || '']
    );
  } catch (e) { console.error("Audit log error:", e.message); }
}

export async function listarAudit(limit = 100) {
  const { query } = await import("./db.js");
  const r = await query(`SELECT * FROM audit_log ORDER BY criado_em DESC LIMIT $1`, [limit]);
  return r.rows;
}
