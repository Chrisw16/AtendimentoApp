/**
 * agente-accountability.js
 * - Score de performance por agente
 * - Detecção de inatividade real (gap entre logout e próximo login)
 * - Limite de conversas simultâneas
 * - Reatribuição em massa
 * - Modo "não perturbe" com prazo
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

// ── MIGRATE ───────────────────────────────────────────────────────────────────
export async function migrateAccountability() {
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS max_conversas INT DEFAULT 8`).catch(() => {});
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS nao_perturbe_ate TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS nao_perturbe_motivo TEXT`).catch(() => {});
  await query(`ALTER TABLE agentes ADD COLUMN IF NOT EXISTS conversas_hoje INT DEFAULT 0`).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS performance_diaria (
      agente_id       TEXT NOT NULL,
      data            DATE NOT NULL DEFAULT CURRENT_DATE,
      atendimentos    INT DEFAULT 0,
      tempo_online_s  INT DEFAULT 0,
      tempo_resp_medio_s INT DEFAULT 0,
      desconexoes     INT DEFAULT 0,
      sla_quebrados   INT DEFAULT 0,
      nps_media       NUMERIC(4,2),
      score           INT DEFAULT 0,
      PRIMARY KEY(agente_id, data)
    )
  `).catch(() => {});
}

// ── SCORE ─────────────────────────────────────────────────────────────────────
export function calcularScore({ atendimentos, tempoOnlineH, tempoRespMedioMin, desconexoes, slasQuebrados, npsMedia }) {
  let score = 100;
  // Premia atendimentos
  score += Math.min(atendimentos * 2, 30);
  // Pune tempo offline (menos de 4h = ruim)
  if (tempoOnlineH < 4) score -= (4 - tempoOnlineH) * 8;
  // Pune resposta lenta
  if (tempoRespMedioMin > 10) score -= Math.min((tempoRespMedioMin - 10) * 3, 30);
  // Pune desconexões excessivas (mais de 3 = suspeito)
  if (desconexoes > 3) score -= (desconexoes - 3) * 4;
  // Pune SLAs quebrados
  score -= slasQuebrados * 5;
  // Premia NPS
  if (npsMedia >= 4.5) score += 10;
  else if (npsMedia < 3) score -= 10;
  return Math.max(0, Math.min(150, Math.round(score)));
}

// ── MODO NÃO PERTURBE ─────────────────────────────────────────────────────────
export async function ativarNaoPerturbe(agenteId, minutos, motivo = "ausente") {
  const ate = new Date(Date.now() + minutos * 60 * 1000);
  await query(
    `UPDATE agentes SET nao_perturbe_ate=$2, nao_perturbe_motivo=$3 WHERE id=$1`,
    [agenteId, ate, motivo]
  );
  logger.info(`🔕 Não perturbe: ${agenteId} por ${minutos}min (${motivo})`);
  return ate;
}

export async function desativarNaoPerturbe(agenteId) {
  await query(`UPDATE agentes SET nao_perturbe_ate=NULL, nao_perturbe_motivo=NULL WHERE id=$1`, [agenteId]);
}

export async function isNaoPerturbe(agenteId) {
  const r = await query(`SELECT nao_perturbe_ate, nao_perturbe_motivo FROM agentes WHERE id=$1`, [agenteId]);
  const row = r.rows[0];
  if (!row?.nao_perturbe_ate) return false;
  if (new Date(row.nao_perturbe_ate) < new Date()) {
    await desativarNaoPerturbe(agenteId); // expirou
    return false;
  }
  return { ate: row.nao_perturbe_ate, motivo: row.nao_perturbe_motivo };
}

// ── LIMITE DE CONVERSAS ───────────────────────────────────────────────────────
export async function podeReceberConversa(agenteId) {
  const r = await query(
    `SELECT a.max_conversas,
     (SELECT COUNT(*) FROM conversas WHERE agente_id=$1 AND status='ativa') as ativas
     FROM agentes a WHERE a.id=$1`,
    [agenteId]
  );
  const row = r.rows[0];
  if (!row) return false;
  const np = await isNaoPerturbe(agenteId);
  if (np) return false;
  return parseInt(row.ativas) < parseInt(row.max_conversas || 8);
}

// ── REATRIBUIÇÃO EM MASSA ─────────────────────────────────────────────────────
export async function reatribuirConversas(deAgenteId, paraAgenteId) {
  const r = await query(
    `UPDATE conversas SET agente_id=$2, atualizado=NOW()
     WHERE agente_id=$1 AND status='ativa' RETURNING id`,
    [deAgenteId, paraAgenteId]
  );
  logger.info(`🔄 ${r.rowCount} conversas reatribuídas de ${deAgenteId} para ${paraAgenteId}`);
  return r.rowCount;
}

export async function devolverFilaConversasAgente(agenteId) {
  const r = await query(
    `UPDATE conversas SET agente_id=NULL, status='aguardando', atualizado=NOW()
     WHERE agente_id=$1 AND status='ativa' RETURNING id, telefone, nome`,
    [agenteId]
  );
  logger.info(`📋 ${r.rowCount} conversas de ${agenteId} devolvidas para a fila`);
  return r.rows;
}

// ── AGENTES DISPONÍVEIS ───────────────────────────────────────────────────────
export async function getAgentesDisponiveis() {
  const r = await query(`
    SELECT a.id, a.nome, a.avatar,
      (SELECT COUNT(*) FROM conversas WHERE agente_id=a.id AND status='ativa') as conversas_ativas,
      a.max_conversas, a.nao_perturbe_ate, a.nao_perturbe_motivo
    FROM agentes a WHERE a.ativo=true AND a.online=true
    ORDER BY conversas_ativas ASC
  `);
  return r.rows.map(row => ({
    ...row,
    disponivel: parseInt(row.conversas_ativas) < parseInt(row.max_conversas || 8)
      && (!row.nao_perturbe_ate || new Date(row.nao_perturbe_ate) < new Date()),
  }));
}

// ── RANKING SEMANAL ───────────────────────────────────────────────────────────
export async function getRankingSemanal() {
  const r = await query(`
    SELECT p.agente_id, a.nome, a.avatar,
      SUM(p.atendimentos) as total_atend,
      AVG(p.score) as score_medio,
      SUM(p.desconexoes) as total_desconexoes,
      AVG(p.nps_media) as nps_medio
    FROM performance_diaria p
    JOIN agentes a ON a.id = p.agente_id
    WHERE p.data >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY p.agente_id, a.nome, a.avatar
    ORDER BY score_medio DESC
  `);
  return r.rows;
}

// ── REGISTRAR ATENDIMENTO CONCLUÍDO ──────────────────────────────────────────
export async function registrarAtendimentoConcluido(agenteId, tempoRespSegs = 0) {
  const hoje = new Date().toISOString().slice(0, 10);
  await query(`
    INSERT INTO performance_diaria(agente_id, data, atendimentos, tempo_resp_medio_s)
    VALUES($1, $2, 1, $3)
    ON CONFLICT(agente_id, data) DO UPDATE SET
      atendimentos = performance_diaria.atendimentos + 1,
      tempo_resp_medio_s = (performance_diaria.tempo_resp_medio_s + $3) / 2
  `, [agenteId, hoje, tempoRespSegs]);
}

export async function registrarDesconexao(agenteId, tipo = "beacon") {
  if (tipo !== "beacon") {
    const hoje = new Date().toISOString().slice(0, 10);
    await query(`
      INSERT INTO performance_diaria(agente_id, data, desconexoes)
      VALUES($1, $2, 1)
      ON CONFLICT(agente_id, data) DO UPDATE SET
        desconexoes = performance_diaria.desconexoes + 1
    `, [agenteId, hoje]);
  }
}

// ── VERIFICAR SE AGENTE ESTÁ EM INTERVALO TOLERADO ────────────────────────────
export function estaEmIntervaloToleravel(horarioTrabalho) {
  if (!horarioTrabalho) return false;
  const agora = new Date();
  const diaSemana = agora.getDay(); // 0=dom
  const cfg = horarioTrabalho[diaSemana];
  if (!cfg?.ativo) return true; // dia não configurado = sem alerta
  if (!cfg.intervalos?.length) return false;

  const horaAtual = agora.getHours() * 60 + agora.getMinutes();

  for (const iv of cfg.intervalos) {
    const [hi, mi] = (iv.inicio || '12:00').split(':').map(Number);
    const [hf, mf] = (iv.fim   || '13:00').split(':').map(Number);
    const inicio = hi * 60 + mi;
    const fim    = hf * 60 + mf;
    // Tolerância de 5 minutos antes e depois do intervalo
    if (horaAtual >= inicio - 5 && horaAtual <= fim + 5) return true;
  }
  return false;
}

// ── VERIFICAR SE ESTÁ DENTRO DO HORÁRIO DE TRABALHO ──────────────────────────
export function estaDentroDoHorario(horarioTrabalho) {
  if (!horarioTrabalho) return true; // sem horário configurado = sempre ok
  const agora = new Date();
  const diaSemana = agora.getDay();
  const cfg = horarioTrabalho[diaSemana];
  if (!cfg?.ativo) return false; // dia de folga

  const horaAtual = agora.getHours() * 60 + agora.getMinutes();
  const [hi, mi] = (cfg.inicio || '08:00').split(':').map(Number);
  const [hf, mf] = (cfg.fim   || '18:00').split(':').map(Number);
  return horaAtual >= hi * 60 + mi && horaAtual <= hf * 60 + mf;
}
