/**
 * nps.js — NPS automatizado pós-atendimento
 * Envia pesquisa NPS após X horas do encerramento
 * Armazena resultados com análise por canal/período
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

await query(`
  CREATE TABLE IF NOT EXISTS nps_respostas (
    id          SERIAL PRIMARY KEY,
    telefone    TEXT NOT NULL,
    nome        TEXT,
    canal       TEXT,
    protocolo   TEXT,
    conv_id     TEXT,
    nota        INT CHECK (nota BETWEEN 0 AND 10),
    comentario  TEXT,
    categoria   TEXT,  -- promotor(9-10), neutro(7-8), detrator(0-6)
    criado_em   TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(() => {});
// Migrations para tabelas antigas
await query(`ALTER TABLE nps_respostas ADD COLUMN IF NOT EXISTS nome TEXT`).catch(()=>{});
await query(`ALTER TABLE nps_respostas ADD COLUMN IF NOT EXISTS conv_id TEXT`).catch(()=>{});

await query(`CREATE INDEX IF NOT EXISTS idx_nps_criado ON nps_respostas(criado_em)`).catch(() => {});
await query(`CREATE INDEX IF NOT EXISTS idx_nps_telefone ON nps_respostas(telefone)`).catch(() => {});

// Controla quem já recebeu NPS recentemente (em memória + banco)
const enviados = new Map(); // telefone → ts

const CONFIG_PADRAO = {
  ativo: true,
  delay_horas: 0,           // Envia X horas após encerramento
  cooldown_dias: 30,        // Não envia para o mesmo cliente antes de X dias
  pergunta: "Em uma escala de 0 a 10, quanto você indicaria a CITmax para um amigo? (Responda com o número)",
  mensagem_agradecimento_promotor:  "Que ótimo! 🎉 Obrigado pela avaliação! Sua opinião é muito importante para nós.",
  mensagem_agradecimento_neutro:    "Obrigado pela avaliação! 😊 Trabalhamos para melhorar sempre.",
  mensagem_agradecimento_detrator:  "Obrigado pelo feedback 🙏 Sentimos muito pela experiência. Pode nos contar o que aconteceu?",
};

export async function getConfig() {
  try {
    const val = await kvGet("nps_config");
    if (val) return { ...CONFIG_PADRAO, ...JSON.parse(val) };
  } catch {}
  return { ...CONFIG_PADRAO };
}

export async function salvarConfig(cfg) {
  await kvSet("nps_config", JSON.stringify(cfg));
}

// Agenda envio de NPS após encerramento
export async function agendarNPS({ telefone, canal, protocolo, enviarFn }) {
  const cfg = await getConfig();
  if (!cfg.ativo) return;

  // Verifica cooldown
  const lastSent = enviados.get(telefone) || 0;
  const cooldownMs = (cfg.cooldown_dias || 30) * 86400000;
  if (Date.now() - lastSent < cooldownMs) return;

  // Verifica no banco também
  try {
    const r = await query(
      `SELECT criado_em FROM nps_respostas WHERE telefone=$1 ORDER BY criado_em DESC LIMIT 1`,
      [telefone]
    );
    if (r.rows[0]) {
      const ts = new Date(r.rows[0].criado_em).getTime();
      if (Date.now() - ts < cooldownMs) return;
    }
  } catch {}

  const delayMs = (cfg.delay_horas != null ? cfg.delay_horas : 0) * 3600000;

  setTimeout(async () => {
    try {
      await enviarFn(cfg.pergunta);
      enviados.set(telefone, Date.now());
      logger.info(`📊 NPS enviado para ${telefone} (canal: ${canal})`);
    } catch (e) {
      logger.error(`❌ Erro ao enviar NPS: ${e.message}`);
    }
  }, delayMs);
}

// Processa resposta do cliente
export async function processarRespostaNPS(telefone, mensagem, canal, protocolo, { nome = null, convId = null } = {}) {
  const nota = parseInt((mensagem || "").trim());
  if (isNaN(nota) || nota < 0 || nota > 10) return null;

  const cfg = await getConfig();
  const categoria = nota >= 9 ? "promotor" : nota >= 7 ? "neutro" : "detrator";

  try {
    await query(
      `INSERT INTO nps_respostas(telefone,nome,canal,protocolo,conv_id,nota,categoria) VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [telefone, nome||null, canal, protocolo, convId||null, nota, categoria]
    );
  } catch (e) {
    logger.error(`❌ Erro ao salvar NPS: ${e.message}`);
    return null;
  }

  // Alerta NPS negativo (≤6) para supervisores/admins
  if (nota <= 6) {
    import("./notif-agentes.js").then(({ notificarNPSNegativo }) =>
      notificarNPSNegativo({ nota, nome, telefone, canal, protocolo }).catch(() => {})
    ).catch(() => {});
  }

  const msgKey = `mensagem_agradecimento_${categoria}`;
  return {
    nota, categoria,
    resposta: cfg[msgKey] || "Obrigado pela avaliação! 😊",
  };
}

// Estatísticas NPS
export async function getEstatisticasNPS(dias = 30) {
  try {
    const since = new Date(Date.now() - dias * 86400000).toISOString();

    const total = await query(`SELECT COUNT(*) FROM nps_respostas WHERE criado_em > $1`, [since]);
    const media = await query(`SELECT ROUND(AVG(nota)::numeric,1) AS media FROM nps_respostas WHERE criado_em > $1`, [since]);
    const cats  = await query(`SELECT categoria, COUNT(*) AS cnt FROM nps_respostas WHERE criado_em > $1 GROUP BY categoria`, [since]);
    const porCanal = await query(`SELECT canal, ROUND(AVG(nota)::numeric,1) AS media, COUNT(*) AS total FROM nps_respostas WHERE criado_em > $1 GROUP BY canal`, [since]);
    const historico = await query(`SELECT DATE(criado_em) AS dia, ROUND(AVG(nota)::numeric,1) AS media, COUNT(*) AS total FROM nps_respostas WHERE criado_em > $1 GROUP BY dia ORDER BY dia`, [since]);
    const ultimas = await query(`SELECT id,telefone,nome,canal,protocolo,nota,categoria,comentario,criado_em FROM nps_respostas ORDER BY criado_em DESC LIMIT 20`);

    const totalN = parseInt(total.rows[0].count) || 0;
    const catMap = {};
    cats.rows.forEach(r => { catMap[r.categoria] = parseInt(r.cnt); });
    const promotores = catMap.promotor || 0;
    const detratores = catMap.detrator || 0;
    const nps = totalN > 0 ? Math.round(((promotores - detratores) / totalN) * 100) : 0;

    // Taxa de resposta = respostas / envios estimados (quem estava no aguardando)
    const totalEnviados = Math.max(totalN, totalN); // já temos respostas; envios ficam no map
    const taxa_resposta = totalN > 0 ? null : null; // placeholder — sem log de envios por ora

    return {
      total: totalN,
      media: parseFloat(media.rows[0].media) || 0,
      nps,
      categorias: catMap,
      por_canal: porCanal.rows,
      historico: historico.rows,
      ultimas: ultimas.rows,
      taxa_resposta: null, // implementar quando tiver log de envios
    };
  } catch (e) {
    return { total: 0, media: 0, nps: 0, categorias: {}, por_canal: [], historico: [], ultimas: [] };
  }
}

// Verifica se cliente está aguardando NPS (para processar a resposta)
const aguardandoNPS = new Map(); // telefone → { protocolo, ts }
export function marcarAguardandoNPS(telefone, protocolo) { aguardandoNPS.set(telefone, { protocolo, ts: Date.now() }); }
export function estaAguardandoNPS(telefone) {
  const e = aguardandoNPS.get(telefone);
  if (!e) return null;
  if (Date.now() - e.ts > 24 * 3600000) { aguardandoNPS.delete(telefone); return null; }
  return e;
}
export function limparAguardandoNPS(telefone) { aguardandoNPS.delete(telefone); }
