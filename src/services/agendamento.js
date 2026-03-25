/**
 * agendamento.js — "Me retorne em X minutos"
 * O cliente agenda um retorno dentro da janela de 24h do WhatsApp.
 * O sistema envia automaticamente uma mensagem no horário solicitado.
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

// In-memory map convId → timeoutId
const timers = new Map();

// ── MIGRATE ───────────────────────────────────────────────────────────────────
export async function migrateAgendamentos() {
  await query(`
    CREATE TABLE IF NOT EXISTS agendamentos_retorno (
      id          SERIAL PRIMARY KEY,
      conv_id     TEXT NOT NULL,
      telefone    TEXT NOT NULL,
      canal       TEXT NOT NULL DEFAULT 'whatsapp',
      minutos     INT  NOT NULL,
      mensagem    TEXT,
      agendado_em TIMESTAMPTZ DEFAULT NOW(),
      disparar_em TIMESTAMPTZ NOT NULL,
      disparado   BOOLEAN DEFAULT false,
      cancelado   BOOLEAN DEFAULT false
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_agend_disparar ON agendamentos_retorno(disparar_em) WHERE disparado=false AND cancelado=false`).catch(() => {});
}

// ── AGENDAR ───────────────────────────────────────────────────────────────────
export async function agendarRetorno({ convId, telefone, canal = "whatsapp", minutos, mensagem }) {
  // Valida janela de 24h (WhatsApp exige que o cliente tenha enviado mensagem há menos de 24h)
  const maxMinutos = 23 * 60; // 23h para folga
  const mins = Math.min(Math.max(1, parseInt(minutos) || 30), maxMinutos);

  const dispararEm = new Date(Date.now() + mins * 60 * 1000);
  const msg = mensagem || `Olá! Você pediu para ser retornado agora. Como posso te ajudar? 😊`;

  const r = await query(
    `INSERT INTO agendamentos_retorno(conv_id, telefone, canal, minutos, mensagem, disparar_em)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [convId, telefone, canal, mins, msg, dispararEm]
  );
  const agendId = r.rows[0].id;

  // Agenda timer em memória
  const ms = dispararEm.getTime() - Date.now();
  const tid = setTimeout(() => dispararRetorno(agendId), ms);
  timers.set(agendId, tid);

  logger.info(`⏰ Retorno agendado: ${telefone} em ${mins}min (id=${agendId})`);
  return { id: agendId, disparar_em: dispararEm, minutos: mins };
}

// ── CANCELAR ──────────────────────────────────────────────────────────────────
export async function cancelarRetorno(convId) {
  const r = await query(
    `UPDATE agendamentos_retorno SET cancelado=true
     WHERE conv_id=$1 AND disparado=false AND cancelado=false RETURNING id`,
    [convId]
  );
  for (const row of r.rows) {
    const tid = timers.get(row.id);
    if (tid) { clearTimeout(tid); timers.delete(row.id); }
  }
  return r.rowCount;
}

// ── LISTAR PENDENTES ──────────────────────────────────────────────────────────
export async function listarAgendamentos(filtro = "pendentes") {
  let sql = `SELECT * FROM agendamentos_retorno`;
  if (filtro === "pendentes") sql += ` WHERE disparado=false AND cancelado=false`;
  sql += ` ORDER BY disparar_em ASC LIMIT 100`;
  const r = await query(sql);
  return r.rows;
}

// ── DISPARAR ──────────────────────────────────────────────────────────────────
async function dispararRetorno(agendId) {
  try {
    const r = await query(
      `UPDATE agendamentos_retorno SET disparado=true WHERE id=$1 AND disparado=false AND cancelado=false RETURNING *`,
      [agendId]
    );
    if (!r.rows[0]) return; // já disparado ou cancelado
    const { telefone, canal, mensagem, conv_id } = r.rows[0];

    // Reativa a conversa no banco
    const { getConversa, registrarMensagem, broadcast } = await import("./chatInterno.js");
    const conv = await getConversa(conv_id);

    // Envia mensagem pelo canal correto
    if (canal === "whatsapp") {
      const { waSendText } = await import("./whatsapp.js");
      await waSendText(telefone, mensagem);
    } else if (canal === "telegram") {
      const { telegramSendText } = await import("./telegram.js").catch(() => ({}));
      if (telegramSendText) await telegramSendText(telefone, mensagem);
    }

    // Registra no histórico da conversa
    if (conv) {
      const msg = { id: Date.now(), role: "sistema", content: `⏰ Retorno automático disparado: "${mensagem}"`, ts: Date.now() };
      const msgs = [...(conv.mensagens || []), msg];
      await query(`UPDATE conversas SET mensagens=$1, status='ia', atualizado=NOW() WHERE id=$2`,
        [JSON.stringify(msgs), conv_id]);
      broadcast("retorno_disparado", { convId: conv_id, telefone, mensagem });
    }

    timers.delete(agendId);
    logger.info(`✅ Retorno disparado: ${telefone} (id=${agendId})`);
  } catch (err) {
    logger.error(`❌ Erro ao disparar retorno ${agendId}: ${err.message}`);
  }
}

// ── RECARREGAR PENDENTES AO INICIAR ──────────────────────────────────────────
export async function recarregarAgendamentos() {
  try {
    await migrateAgendamentos();
    const r = await query(
      `SELECT * FROM agendamentos_retorno WHERE disparado=false AND cancelado=false AND disparar_em > NOW()`
    );
    for (const row of r.rows) {
      const ms = new Date(row.disparar_em).getTime() - Date.now();
      if (ms > 0) {
        const tid = setTimeout(() => dispararRetorno(row.id), ms);
        timers.set(row.id, tid);
      } else {
        // Atrasado — dispara agora
        dispararRetorno(row.id);
      }
    }
    logger.info(`⏰ ${r.rows.length} agendamentos de retorno recarregados`);
  } catch (err) {
    logger.error(`❌ Erro ao recarregar agendamentos: ${err.message}`);
  }
}
