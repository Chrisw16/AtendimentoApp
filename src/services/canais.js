/**
 * canais.js — PostgreSQL
 */
import { query } from "./db.js";

export async function listarCanais() {
  const r = await query(`SELECT * FROM canais ORDER BY tipo`);
  return r.rows.map(row => ({ ...row, config: row.config || {} }));
}

export async function getCanal(tipo) {
  const r = await query(`SELECT * FROM canais WHERE tipo=$1`, [tipo]);
  if (!r.rows[0]) return null;
  return { ...r.rows[0], config: r.rows[0].config || {} };
}

export async function salvarCanal(tipo, dados) {
  const existing = await getCanal(tipo);
  const config = { ...(existing?.config || {}), ...(dados.config || {}) };
  await query(
    `INSERT INTO canais(tipo,nome,icone,ativo,config,atualizado)
     VALUES($1,$2,$3,$4,$5::jsonb,NOW())
     ON CONFLICT(tipo) DO UPDATE SET
       nome=COALESCE($2,canais.nome),
       icone=COALESCE($3,canais.icone),
       ativo=COALESCE($4,canais.ativo),
       config=$5::jsonb,
       atualizado=NOW()`,
    [tipo, dados.nome || existing?.nome || tipo, dados.icone || existing?.icone, dados.ativo ?? existing?.ativo ?? false, JSON.stringify(config)]
  );
  return getCanal(tipo);
}

export async function ativarCanal(tipo, ativo) {
  await query(`UPDATE canais SET ativo=$2, atualizado=NOW() WHERE tipo=$1`, [tipo, ativo]);
}
