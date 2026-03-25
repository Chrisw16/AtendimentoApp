/**
 * fila.js — Sistema de fila de atendimento com urgência
 * - Rastreia aguardando_desde por conversa
 * - Calcula tempo de espera em tempo real
 * - Envia posição na fila pro cliente via WhatsApp
 * - Auto-escalação por palavras críticas
 * - SLA configurável
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

// ── MIGRATE ───────────────────────────────────────────────────────────────────
export async function migrateFila() {
  // Adiciona colunas na tabela conversas
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS aguardando_desde TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS prioridade INT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS palavras_criticas TEXT[]`).catch(() => {});
  await query(`ALTER TABLE conversas ADD COLUMN IF NOT EXISTS pos_na_fila INT`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_conv_aguardando ON conversas(aguardando_desde) WHERE status='aguardando'`).catch(() => {});
}

// ── CONFIG SLA ────────────────────────────────────────────────────────────────
const SLA_DEFAULT = {
  critico_min: 15,   // vermelho
  atencao_min: 5,    // amarelo
  notif_cliente: true,
  palavras_criticas: ["cancelar", "cancelamento", "procon", "advogado", "absurdo",
    "inaceitável", "processo", "reclamação", "reclame aqui", "anatel",
    "operadora péssima", "horrível", "vergonha", "fraude"],
};

export async function getSlaConfig() {
  try {
    const v = await kvGet("sla_config");
    return v ? { ...SLA_DEFAULT, ...JSON.parse(v) } : SLA_DEFAULT;
  } catch { return SLA_DEFAULT; }
}
export async function salvarSlaConfig(cfg) {
  await kvSet("sla_config", JSON.stringify({ ...SLA_DEFAULT, ...cfg }));
}

// ── MARCAR COMO AGUARDANDO ────────────────────────────────────────────────────
export async function marcarAguardando(convId, prioridade = 0) {
  await query(
    `UPDATE conversas SET aguardando_desde=NOW(), prioridade=$2, status='aguardando', atualizado=NOW()
     WHERE id=$1 AND (aguardando_desde IS NULL OR status != 'aguardando')`,
    [convId, prioridade]
  );
}

// ── LIMPAR AGUARDANDO (assumiu ou encerrou) ───────────────────────────────────
export async function limparAguardando(convId) {
  await query(`UPDATE conversas SET aguardando_desde=NULL WHERE id=$1`, [convId]);
}

// ── CALCULAR URGÊNCIA ─────────────────────────────────────────────────────────
export function calcularUrgencia(aguardandoDesde, prioridade = 0, cfg = SLA_DEFAULT) {
  if (!aguardandoDesde) return { nivel: "ia", minutos: 0, segundos: 0 };
  const segs = Math.floor((Date.now() - new Date(aguardandoDesde).getTime()) / 1000);
  const mins = Math.floor(segs / 60);

  if (prioridade >= 2 || mins >= cfg.critico_min) return { nivel: "critico", minutos: mins, segundos: segs };
  if (prioridade >= 1 || mins >= cfg.atencao_min) return { nivel: "atencao", minutos: mins, segundos: segs };
  return { nivel: "ok", minutos: mins, segundos: segs };
}

// ── DETECTAR PALAVRAS CRÍTICAS ────────────────────────────────────────────────
export async function detectarPalavrasCriticas(texto) {
  const cfg = await getSlaConfig();
  const lower = (texto || "").toLowerCase();
  const encontradas = cfg.palavras_criticas.filter(p => lower.includes(p));
  return encontradas;
}

// ── POSIÇÃO NA FILA ───────────────────────────────────────────────────────────
export async function getPosicaoNaFila(convId) {
  const r = await query(
    `SELECT id FROM conversas
     WHERE status='aguardando' AND aguardando_desde IS NOT NULL
     ORDER BY prioridade DESC, aguardando_desde ASC`
  );
  const idx = r.rows.findIndex(row => row.id === convId);
  return idx === -1 ? null : idx + 1;
}

export async function getTotalNaFila() {
  const r = await query(`SELECT COUNT(*) as total FROM conversas WHERE status='aguardando'`);
  return parseInt(r.rows[0]?.total) || 0;
}

// ── TEMPO MÉDIO DE ESPERA (últimas 2h) ───────────────────────────────────────
export async function getTempoMedioEspera() {
  const r = await query(`
    SELECT AVG(EXTRACT(EPOCH FROM (atualizado - aguardando_desde))) as media_segs
    FROM conversas
    WHERE status='ativa' AND aguardando_desde IS NOT NULL
      AND atualizado > NOW() - INTERVAL '2 hours'
  `);
  return Math.round(r.rows[0]?.media_segs || 0);
}

// ── NOTIFICAR POSIÇÃO NA FILA (pro cliente) ───────────────────────────────────
export async function notificarPosicaoFila(convId, canal, telefone) {
  try {
    const cfg = await getSlaConfig();
    if (!cfg.notif_cliente) return;

    const pos = await getPosicaoNaFila(convId);
    const mediaSegs = await getTempoMedioEspera();
    if (!pos || pos > 10) return; // só avisa os primeiros 10

    const mediaMin = Math.round(mediaSegs / 60);
    let texto;
    if (pos === 1) {
      texto = `Você é o próximo! Um atendente estará com você em instantes. 😊`;
    } else {
      const estimativa = mediaMin > 0 ? ` Tempo estimado: ~${pos * mediaMin} minutos.` : "";
      texto = `Você está na posição ${pos}º da fila de atendimento.${estimativa} Aguarde, estamos quase lá! 🙏`;
    }

    if (canal === "whatsapp") {
      const { waSendText } = await import("./whatsapp.js");
      await waSendText(telefone, texto);
    }

    // Salva posição no banco
    await query(`UPDATE conversas SET pos_na_fila=$1 WHERE id=$2`, [pos, convId]);
    logger.info(`📬 Posição na fila enviada: ${telefone} (pos ${pos})`);
  } catch (err) {
    logger.error(`❌ notificarPosicaoFila: ${err.message}`);
  }
}

// ── ALERTAS SLA (verifica a cada 1min) ───────────────────────────────────────
let slaInterval = null;
const alertasEmitidos = new Set();
function dedup(chave, ttlMs, fn) {
  if (alertasEmitidos.has(chave)) return;
  alertasEmitidos.add(chave);
  setTimeout(() => alertasEmitidos.delete(chave), ttlMs);
  fn();
}

export function iniciarMonitorSLA(broadcast) {
  if (slaInterval) clearInterval(slaInterval);
  slaInterval = setInterval(async () => {
    try {
      const cfg = await getSlaConfig();

      // 1 — SLA fila critico
      const fila = await query(`
        SELECT id, telefone, nome, canal, aguardando_desde, prioridade
        FROM conversas WHERE status='aguardando' AND aguardando_desde IS NOT NULL
      `);
      for (const conv of fila.rows) {
        const { nivel, minutos } = calcularUrgencia(conv.aguardando_desde, conv.prioridade, cfg);
        if (nivel === "critico") {
          dedup(`sla_${conv.id}_${Math.floor(minutos/5)}`, 5*60*1000, () => {
            broadcast("sla_critico", { convId: conv.id, nome: conv.nome || conv.telefone, minutos, canal: conv.canal, som: "urgente" });
          });
        }
      }

      // 2 — Agente fantasma (assumiu mas ainda nao respondeu)
      const fantasmas = await query(`
        SELECT c.id, c.nome, c.canal, c.agente_id, a.nome as agente_nome,
          a.horario_trabalho,
          ROUND(EXTRACT(EPOCH FROM (NOW()-c.assumido_em))/60) as mins
        FROM conversas c
        LEFT JOIN agentes a ON a.id=c.agente_id
        WHERE c.status='ativa'
          AND c.assumido_em IS NOT NULL
          AND c.primeira_msg_agente_em IS NULL
          AND c.assumido_em < NOW() - INTERVAL '5 minutes'
      `);
      const { estaEmIntervaloToleravel, estaDentroDoHorario } = await import("./agente-accountability.js").catch(() => ({}));
      for (const f of fantasmas.rows) {
        // Se agente está em intervalo tolerado → ignorar
        if (estaEmIntervaloToleravel && f.horario_trabalho && estaEmIntervaloToleravel(f.horario_trabalho)) continue;
        dedup(`fantasma_${f.id}_${Math.floor(f.mins/10)}`, 10*60*1000, () => {
          broadcast("agente_fantasma", {
            convId: f.id, clienteNome: f.nome, canal: f.canal,
            agenteId: f.agente_id, agenteNome: f.agente_nome || f.agente_id,
            minutos: parseInt(f.mins), som: "medio"
          });
        });
      }

      // 3 — Conversa ativa abandonada (sem msg do agente ha +60min)
      const abandonadas = await query(`
        SELECT c.id, c.nome, c.canal, c.agente_id, a.nome as agente_nome,
          a.horario_trabalho,
          ROUND(EXTRACT(EPOCH FROM (NOW()-c.ultima_msg_agente_em))/60) as mins
        FROM conversas c
        LEFT JOIN agentes a ON a.id=c.agente_id
        WHERE c.status='ativa'
          AND c.ultima_msg_agente_em IS NOT NULL
          AND c.ultima_msg_agente_em < NOW() - INTERVAL '60 minutes'
      `);
      for (const ab of abandonadas.rows) {
        // Se agente está em intervalo tolerado (almoço etc) → ignorar
        if (estaEmIntervaloToleravel && ab.horario_trabalho && estaEmIntervaloToleravel(ab.horario_trabalho)) continue;
        dedup(`abandon_${ab.id}`, 30*60*1000, () => {
          broadcast("conversa_abandonada", {
            convId: ab.id, clienteNome: ab.nome, canal: ab.canal,
            agenteId: ab.agente_id, agenteNome: ab.agente_nome,
            minutos: parseInt(ab.mins)
          });
        });
      }

    } catch {}
  }, 60 * 1000);
}
