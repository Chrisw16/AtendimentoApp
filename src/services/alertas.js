/**
 * alertas.js — Detecção de problemas massivos
 * Se N clientes reportam o mesmo problema em X minutos → alerta
 */
import { query, kvGet, kvSet } from "./db.js";
import { logger } from "./logger.js";

// Config padrão
const CONFIG_PADRAO = {
  ativo: true,
  janela_minutos: 15,       // Janela de tempo para detectar padrão
  min_ocorrencias: 5,       // Mínimo de clientes com mesmo problema
  canais_notificacao: ["logs"],  // logs | whatsapp | email
  numero_alerta: "",        // WhatsApp do responsável para receber alerta
  padroes: [
    { id: "sem_sinal",    palavras: ["sem sinal","sem internet","caiu","sem acesso","não conecta","não abre"], label: "Sem Sinal" },
    { id: "lentidao",     palavras: ["lento","devagar","travando","baixa velocidade","internet lenta"], label: "Lentidão" },
    { id: "instabilidade",palavras: ["caindo","cortando","instável","cai e volta","intermitente"], label: "Instabilidade" },
    { id: "login",        palavras: ["não consigo entrar","login","senha","app não abre"], label: "Problema de Login" },
  ],
};

// ── Janela deslizante em memória ──────────────────────────────────────────────
// padraoId → [{ts, telefone, msg}]
const janela = new Map();
// alertas já disparados para não repetir (padraoId → lastAlertTs)
const ultimoAlerta = new Map();
const COOLDOWN_MS = 30 * 60 * 1000; // Não repete alerta do mesmo tipo em 30min

export async function getConfig() {
  try {
    const val = await kvGet("alertas_config");
    if (val) return { ...CONFIG_PADRAO, ...JSON.parse(val) };
  } catch {}
  return { ...CONFIG_PADRAO };
}

export async function salvarConfig(cfg) {
  await kvSet("alertas_config", JSON.stringify(cfg));
}

// ── Verifica mensagem entrante ────────────────────────────────────────────────
export async function verificarAlerta(telefone, mensagem, canal) {
  const cfg = await getConfig();
  if (!cfg.ativo) return null;

  const msgLower = (mensagem || "").toLowerCase();
  const agora = Date.now();
  const janelaMs = (cfg.janela_minutos || 15) * 60 * 1000;
  const minOcorr = cfg.min_ocorrencias || 5;

  for (const padrao of (cfg.padroes || [])) {
    const match = (padrao.palavras || []).some(p => msgLower.includes(p));
    if (!match) continue;

    // Adiciona à janela
    if (!janela.has(padrao.id)) janela.set(padrao.id, []);
    const lista = janela.get(padrao.id);
    lista.push({ ts: agora, telefone, msg: mensagem.slice(0, 80) });

    // Remove entradas antigas
    const recentes = lista.filter(e => agora - e.ts < janelaMs);
    janela.set(padrao.id, recentes);

    // Conta clientes únicos
    const clientesUnicos = new Set(recentes.map(e => e.telefone));

    if (clientesUnicos.size >= minOcorr) {
      // Verifica cooldown
      const lastAlert = ultimoAlerta.get(padrao.id) || 0;
      if (agora - lastAlert < COOLDOWN_MS) continue;

      ultimoAlerta.set(padrao.id, agora);
      await dispararAlerta(padrao, clientesUnicos.size, recentes, cfg);
      return padrao;
    }
  }
  return null;
}

async function dispararAlerta(padrao, quantidade, ocorrencias, cfg) {
  const msg = `🚨 *ALERTA MASSIVO — CITmax*\n\n`
    + `⚠️ *${quantidade} clientes* relatando: *${padrao.label}*\n`
    + `⏱️ Janela: últimos ${cfg.janela_minutos} minutos\n\n`
    + `Últimos relatos:\n`
    + ocorrencias.slice(-3).map(o => `• ${o.telefone}: "${o.msg}"`).join("\n")
    + `\n\n📋 Verifique o sistema e abra uma manutenção se necessário.`;

  logger.warn(`🚨 ALERTA MASSIVO: ${quantidade}x ${padrao.label} em ${cfg.janela_minutos}min`);

  // Salva no banco para histórico
  try {
    await query(
      `INSERT INTO sistema_kv(chave,valor,atualizado) VALUES($1,$2,NOW())
       ON CONFLICT(chave) DO UPDATE SET valor=$2,atualizado=NOW()`,
      [`alerta_ultimo_${padrao.id}`, JSON.stringify({
        padrao: padrao.label, quantidade, ts: Date.now(),
        ocorrencias: ocorrencias.slice(-5),
      })]
    );
  } catch {}

  // Notificação WhatsApp se configurado
  if (cfg.canais_notificacao?.includes("whatsapp") && cfg.numero_alerta) {
    try {
      const { waSendText } = await import("./whatsapp.js");
      await waSendText(cfg.numero_alerta, msg);
      logger.info(`📱 Alerta enviado via WhatsApp para ${cfg.numero_alerta}`);
    } catch (e) {
      logger.error(`❌ Erro ao enviar alerta WA: ${e.message}`);
    }
  }
}

// Histórico de alertas
export async function getHistoricoAlertas() {
  try {
    const r = await query(`SELECT chave, valor, atualizado FROM sistema_kv WHERE chave LIKE 'alerta_ultimo_%' ORDER BY atualizado DESC`);
    return r.rows.map(row => ({ tipo: row.chave.replace("alerta_ultimo_",""), ...JSON.parse(row.valor), atualizado: row.atualizado }));
  } catch { return []; }
}

// Status atual da janela
export function getStatusJanela() {
  const result = {};
  janela.forEach((lista, id) => {
    const agora = Date.now();
    result[id] = {
      total: lista.length,
      clientes_unicos: new Set(lista.map(e => e.telefone)).size,
      mais_recente: lista.length ? new Date(lista[lista.length-1].ts).toLocaleTimeString("pt-BR") : null,
    };
  });
  return result;
}
