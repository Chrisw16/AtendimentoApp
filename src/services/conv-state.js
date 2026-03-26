/**
 * conv-state.js — Estado persistido de conversas
 * ─────────────────────────────────────────────────────────────────────────────
 * Substitui as estruturas em memória do webhook.js:
 *
 *   processing     → conversas.processando   (lock anti-duplicata)
 *   protocolSent   → conversas.status        (conversa ativa = tem protocolo)
 *   audioPreference → sessoes._prefere_audio  (dentro do JSON dados da sessão)
 *   followupTimer  → conv_timers tipo=followup
 *   closeTimer     → conv_timers tipo=encerramento
 *
 * messageBuffer e floodTimer PERMANECEM em memória (TTL 8s — inofensivo).
 *
 * WORKER DE TIMERS:
 *   initTimerWorker() deve ser chamado no startup do servidor.
 *   Varre conv_timers a cada 60s, executa timers vencidos e reagenda
 *   os que foram perdidos em restarts anteriores.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query } from "./db.js";
import { CITMAX_TENANT_ID } from "./db.js";
import { logger } from "./logger.js";

// ── Lock de processamento (substitui: processing Set) ────────────────────────
// Garante que duas mensagens da mesma conversa não sejam processadas em paralelo.

export async function lockConversa(conversationId, tenantId = CITMAX_TENANT_ID) {
  try {
    // UPDATE atômico — só atualiza se processando=false
    const r = await query(
      `UPDATE conversas
       SET processando = true
       WHERE id = $1
         AND tenant_id = $2
         AND (processando = false OR processando IS NULL)
       RETURNING id`,
      [String(conversationId), tenantId]
    );
    return r.rowCount > 0; // true = lock adquirido, false = já estava em processamento
  } catch(e) {
    logger.warn(`⚠️ lockConversa erro: ${e.message}`);
    return true; // em caso de erro de banco, permite continuar (fail-open)
  }
}

export async function unlockConversa(conversationId, tenantId = CITMAX_TENANT_ID) {
  try {
    await query(
      `UPDATE conversas SET processando = false WHERE id = $1 AND tenant_id = $2`,
      [String(conversationId), tenantId]
    );
  } catch(e) {
    logger.warn(`⚠️ unlockConversa erro: ${e.message}`);
  }
}

// Garante que locks não fiquem presos para sempre (ex: crash do processo)
// Libera locks com mais de 2 minutos (nenhum processamento legítimo dura tanto)
export async function limparLocksAntigos() {
  try {
    const { rowCount } = await query(
      `UPDATE conversas
       SET processando = false
       WHERE processando = true
         AND atualizado < NOW() - INTERVAL '2 minutes'`
    );
    if (rowCount > 0) logger.info(`🔓 ${rowCount} lock(s) antigo(s) liberado(s)`);
  } catch(e) {
    logger.warn(`⚠️ limparLocksAntigos: ${e.message}`);
  }
}

// ── Atividade da conversa (para os timers de inatividade) ─────────────────────

export async function marcarAtividade(conversationId, tenantId = CITMAX_TENANT_ID) {
  try {
    await query(
      `UPDATE conversas
       SET ultima_atividade = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [String(conversationId), tenantId]
    );
  } catch(e) {
    logger.warn(`⚠️ marcarAtividade: ${e.message}`);
  }
}

// ── Status da conversa (substitui: protocolSent Set) ─────────────────────────
// "tem protocolo" = conversa existe com status 'ativa'

export async function conversaEstaAtiva(conversationId, tenantId = CITMAX_TENANT_ID) {
  try {
    const r = await query(
      `SELECT id FROM conversas WHERE id = $1 AND tenant_id = $2 AND status = 'ativa'`,
      [String(conversationId), tenantId]
    );
    return r.rowCount > 0;
  } catch { return false; }
}

// ── Preferência de áudio (substitui: audioPreference Map) ────────────────────
// Persiste dentro do JSON dados da tabela sessoes

export async function getPreferenciaAudio(conversationId) {
  // audioPreference era por conversationId, não por telefone
  // Mantemos um Map leve em memória como cache de sessão — dados não críticos
  return _audioCache.get(String(conversationId)) || false;
}

export function setPreferenciaAudio(conversationId, valor) {
  if (valor) {
    _audioCache.set(String(conversationId), true);
  } else {
    _audioCache.delete(String(conversationId));
  }
}

export function limparPreferenciaAudio(conversationId) {
  _audioCache.delete(String(conversationId));
}

// Cache leve — OK em memória pois é preferência de UX, não estado crítico
// Perde em restart mas o cliente simplesmente pede áudio de novo se quiser
const _audioCache = new Map();

// ── Timers de follow-up e encerramento (substitui: followupTimer / closeTimer) ─

const FOLLOWUP_MS   = 30 * 60 * 1000; // 30 min
const ENCERRAMENTO_MS = 60 * 60 * 1000; // 60 min total (30 + 30)

/**
 * Reagenda o timer de follow-up de uma conversa.
 * Chamado a cada mensagem recebida do cliente.
 */
export async function agendarFollowup(conversationId, accountId, tenantId = CITMAX_TENANT_ID) {
  const executarEm = new Date(Date.now() + FOLLOWUP_MS);
  try {
    // Upsert: se já existia timer, atualiza o horário (cliente respondeu, reinicia)
    await query(
      `INSERT INTO conv_timers(tenant_id, conversation_id, account_id, tipo, executar_em, executado)
       VALUES($1, $2, $3, 'followup', $4, false)
       ON CONFLICT(tenant_id, conversation_id, tipo)
       DO UPDATE SET executar_em = $4, executado = false`,
      [tenantId, String(conversationId), String(accountId), executarEm]
    );
    // Cancela encerramento anterior (se o cliente voltou a falar)
    await query(
      `UPDATE conv_timers SET executado = true
       WHERE tenant_id=$1 AND conversation_id=$2 AND tipo='encerramento'`,
      [tenantId, String(conversationId)]
    );
  } catch(e) {
    logger.warn(`⚠️ agendarFollowup: ${e.message}`);
  }
}

/**
 * Agenda o timer de encerramento por inatividade.
 * Chamado depois que o follow-up é enviado.
 */
export async function agendarEncerramento(conversationId, accountId, tenantId = CITMAX_TENANT_ID) {
  const executarEm = new Date(Date.now() + FOLLOWUP_MS); // 30 min após o follow-up
  try {
    await query(
      `INSERT INTO conv_timers(tenant_id, conversation_id, account_id, tipo, executar_em, executado)
       VALUES($1, $2, $3, 'encerramento', $4, false)
       ON CONFLICT(tenant_id, conversation_id, tipo)
       DO UPDATE SET executar_em = $4, executado = false`,
      [tenantId, String(conversationId), String(accountId), executarEm]
    );
  } catch(e) {
    logger.warn(`⚠️ agendarEncerramento: ${e.message}`);
  }
}

/**
 * Cancela todos os timers de uma conversa (cliente encerrou, humano assumiu, etc.)
 */
export async function cancelarTimers(conversationId, tenantId = CITMAX_TENANT_ID) {
  try {
    await query(
      `UPDATE conv_timers SET executado = true
       WHERE tenant_id=$1 AND conversation_id=$2`,
      [tenantId, String(conversationId)]
    );
  } catch(e) {
    logger.warn(`⚠️ cancelarTimers: ${e.message}`);
  }
}

// ── Worker de timers ──────────────────────────────────────────────────────────
// Roda no startup do servidor e a cada 60s.
// Varre conv_timers buscando timers vencidos e executa a ação correspondente.
// Garante que timers perdidos em restarts sejam executados.

let _workerInterval = null;

export function initTimerWorker() {
  if (_workerInterval) return; // já iniciado

  // Executa imediatamente no startup (recupera timers perdidos)
  setTimeout(() => executarTimersVencidos(), 5000);

  // Depois a cada 60 segundos
  _workerInterval = setInterval(executarTimersVencidos, 60 * 1000);

  // Limpa locks antigos no startup (processo pode ter crashado)
  setTimeout(() => limparLocksAntigos(), 3000);

  logger.info("⏰ Timer worker iniciado (varredura a cada 60s)");
}

export function stopTimerWorker() {
  if (_workerInterval) {
    clearInterval(_workerInterval);
    _workerInterval = null;
  }
}

async function executarTimersVencidos() {
  try {
    // Busca timers vencidos (executar_em <= agora) e ainda não executados
    const r = await query(
      `SELECT id, tenant_id, conversation_id, account_id, tipo
       FROM conv_timers
       WHERE executado = false
         AND executar_em <= NOW()
       ORDER BY executar_em ASC
       LIMIT 50`
    );

    if (r.rows.length === 0) return;
    logger.info(`⏰ Timer worker: ${r.rows.length} timer(s) vencido(s)`);

    for (const timer of r.rows) {
      // Marca como executado ANTES de executar — evita duplicatas em caso de erro
      await query(
        `UPDATE conv_timers SET executado = true WHERE id = $1`,
        [timer.id]
      );

      // Verifica se conversa ainda está ativa antes de agir
      const ativa = await conversaEstaAtiva(timer.conversation_id, timer.tenant_id);
      if (!ativa) {
        logger.info(`⏰ Timer ${timer.tipo} #${timer.conversation_id} ignorado — conversa encerrada`);
        continue;
      }

      if (timer.tipo === 'followup') {
        await executarFollowup(timer);
      } else if (timer.tipo === 'encerramento') {
        await executarEncerramento(timer);
      }
    }
  } catch(e) {
    logger.error(`❌ Timer worker erro: ${e.message}`);
  }
}

async function executarFollowup({ tenant_id, conversation_id, account_id }) {
  try {
    const { sendMessage } = await import("./chatwoot.js");
    await sendMessage(
      account_id, conversation_id,
      "Oi! 👋 Ainda estou por aqui caso precise de algo. Posso te ajudar com mais alguma coisa?"
    );
    logger.info(`⏰ Follow-up enviado | Conv #${conversation_id}`);

    // Agenda o encerramento por inatividade
    await agendarEncerramento(conversation_id, account_id, tenant_id);
  } catch(e) {
    logger.error(`❌ Follow-up erro Conv #${conversation_id}: ${e.message}`);
  }
}

async function executarEncerramento({ tenant_id, conversation_id, account_id }) {
  try {
    const { sendMessage, addLabel, resolveConversation } = await import("./chatwoot.js");
    await sendMessage(
      account_id, conversation_id,
      "Vou encerrar nosso atendimento por inatividade. Se precisar é só chamar! 😊"
    );
    await addLabel(account_id, conversation_id, "encerrado-inatividade").catch(() => {});
    await resolveConversation(account_id, conversation_id);

    // Limpa estado da conversa
    limparPreferenciaAudio(conversation_id);
    await unlockConversa(conversation_id, tenant_id);

    logger.info(`🔕 Encerrado por inatividade | Conv #${conversation_id}`);
  } catch(e) {
    logger.error(`❌ Encerramento inatividade Conv #${conversation_id}: ${e.message}`);
  }
}
