/**
 * handoff.js — Controle de transferência IA ↔ Humano
 */
import { query, kvGet, kvSet, withTransaction } from "./db.js";
import { atualizarStatus, broadcast } from "./chatInterno.js";

const handoffMap = new Map();

export async function carregarEstadoHandoff() {
  try {
    const r = await query(`SELECT chave, valor FROM sistema_kv WHERE chave LIKE 'handoff:%'`);
    for (const row of r.rows) {
      const convId = row.chave.replace("handoff:", "");
      try { handoffMap.set(convId, JSON.parse(row.valor)); } catch {}
    }
    console.log(`📋 Handoff: ${handoffMap.size} conversas carregadas`);
  } catch(e) {
    console.warn("⚠️ Handoff init:", e.message);
  }
}

export function estaComHumano(convId) {
  return handoffMap.get(String(convId))?.modo === "humano";
}

export async function transferirParaHumano(convId, agenteId, motivo) {
  const estado = { modo:"humano", agenteId: agenteId||null, motivo, ts: Date.now() };
  handoffMap.set(String(convId), estado);
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO sistema_kv(tenant_id, chave, valor, atualizado) VALUES($1,$2,$3,NOW())
       ON CONFLICT(tenant_id,chave) DO UPDATE SET valor=$3, atualizado=NOW()`,
      [process.env._TENANT_ID_FALLBACK || '00000000-0000-4000-a000-000000000001',
       `handoff:${convId}`, JSON.stringify(estado)]
    );
    await tx.query(
      `UPDATE conversas SET status='aguardando', atualizado=NOW() WHERE id=$1`,
      [String(convId)]
    );
  });
  broadcast("conversa_assumida", { convId, agenteId: null, status: "aguardando" });
  console.log(`🔀 Conv #${convId} → HUMANO (aguardando)`);

  // Notifica agentes offline sobre nova conversa
  try {
    const conv = await query(`SELECT nome, canal FROM conversas WHERE id=$1 LIMIT 1`, [convId]).catch(() => ({ rows: [] }));
    const { notificarTransferenciaAgentes } = await import("./notif-agentes.js");
    await notificarTransferenciaAgentes(convId, conv.rows[0]?.nome, conv.rows[0]?.canal);
  } catch {}
}

export async function agenteAssumiu(convId, agenteId, agenteNome) {
  const estado = handoffMap.get(String(convId)) || { modo: "humano" };
  estado.agenteId = agenteId;
  estado.agenteNome = agenteNome;
  estado.assumidoTs = Date.now();
  handoffMap.set(String(convId), estado);
  await withTransaction(async (tx) => {
    await tx.query(
      `INSERT INTO sistema_kv(tenant_id, chave, valor, atualizado) VALUES($1,$2,$3,NOW())
       ON CONFLICT(tenant_id,chave) DO UPDATE SET valor=$3, atualizado=NOW()`,
      [process.env._TENANT_ID_FALLBACK || '00000000-0000-4000-a000-000000000001',
       `handoff:${convId}`, JSON.stringify(estado)]
    );
    await tx.query(
      `UPDATE conversas SET status='ativa', agente_id=$2, agente_nome=$3, atualizado=NOW() WHERE id=$1`,
      [String(convId), agenteId, agenteNome]
    );
  });
  broadcast("conversa_assumida", { convId, agenteId, agenteNome, status: "ativa" });
  console.log(`👨 Conv #${convId} assumida por ${agenteNome||agenteId}`);
}

export async function devolverParaIA(convId) {
  handoffMap.delete(String(convId));
  await withTransaction(async (tx) => {
    await tx.query(`DELETE FROM sistema_kv WHERE chave=$1`, [`handoff:${convId}`]);
    await tx.query(`UPDATE conversas SET status='ia', atualizado=NOW() WHERE id=$1`, [String(convId)]);
  }).catch(() => {});
  broadcast("status_alterado", { convId, status: "ia" });
  console.log(`🤖 Conv #${convId} → IA`);
}

export async function encerrarHandoff(convId) {
  handoffMap.delete(String(convId));
  await query(`DELETE FROM sistema_kv WHERE chave=$1`, [`handoff:${convId}`]).catch(()=>{});
}

export function listarComHumano() {
  const result = [];
  handoffMap.forEach((v,k) => { if(v.modo==="humano") result.push({convId:k,...v}); });
  return result;
}

export function getHandoffInfo(convId) {
  return handoffMap.get(String(convId)) || null;
}
