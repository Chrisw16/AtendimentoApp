/**
 * maxxi-equipe.js — IA interna para funcionários CITmax
 * Responde dúvidas, envia alertas, resumos diários
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import { getConfig, enviarTexto, enviarTextoGrupo } from "./evolution.js";
import { dentroDoHorario } from "./crm.js";
import { query } from "./db.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PROMPT_EQUIPE = `Você é a Maxxi Interna, assistente exclusiva da equipe CITmax.
Você ajuda os funcionários (atendentes, técnicos, supervisores) com:
- Dúvidas sobre processos internos
- Scripts de atendimento
- Informações sobre planos e preços
- Procedimentos técnicos
- Políticas da empresa
- Informações sobre o sistema Maxxi

PLANOS ATUAIS:
Natal: Essencial 400M R$79,90 | Avançado 600M R$99,90 | Premium 700M R$129,90 (sem taxa adesão, com fidelidade)
Macaíba/São Gonçalo: Essencial 300M R$59,90 | Avançado 450M R$99,90 | Premium 600M R$119,90 (sem fidelidade, taxa adesão paga na instalação)
São Miguel do Gostoso: Essencial 200M R$69,90 | Avançado 350M R$99,90 | Premium 500M R$119,90 (sem taxa adesão, com fidelidade)

COMANDOS DISPONÍVEIS:
/fila → mostra conversas aguardando agente agora
/stats → métricas do dia
/ajuda → lista todos os comandos

Responda em português, de forma objetiva e amigável. Use emojis moderadamente.
Você está em um grupo de WhatsApp da equipe ou em conversa privada com um funcionário.
NUNCA compartilhe informações confidenciais de clientes sem necessidade.`;

// ─── PROCESSAR MENSAGEM DA EQUIPE ─────────────────────────────────────────────

export async function processarMensagemEquipe(instancia, remoteJid, remetente, texto) {
  const lower = (texto || "").toLowerCase().trim();

  // Comandos especiais
  if (lower === "/fila" || lower === "/queue") {
    return await cmdFila();
  }
  if (lower === "/stats" || lower === "/metricas") {
    return await cmdStats();
  }
  if (lower === "/ajuda" || lower === "/help") {
    return `📋 *Comandos disponíveis:*\n\n/fila → conversas aguardando agente\n/stats → métricas do dia\n/cliente [número ou CPF] → dados do cliente\n/ajuda → esta lista\n\nOu me pergunte qualquer coisa sobre processos, planos e atendimento! 😊`;
  }

  // /cliente — consulta cliente pelo número ou CPF
  if (lower.startsWith("/cliente")) {
    const param = texto.slice(8).trim().replace(/\D/g, "");
    return await cmdCliente(param);
  }

  // IA responde texto livre
  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      system: PROMPT_EQUIPE,
      messages: [{ role: "user", content: texto }],
    });
    return res.content[0]?.text || "Não entendi. Tente /ajuda para ver os comandos.";
  } catch(e) {
    logger.error(`❌ Maxxi Equipe IA: ${e.message}`);
    return "Estou com instabilidade. Tente novamente em instantes. 🙏";
  }
}

// ─── COMANDO /cliente ─────────────────────────────────────────────────────────

async function cmdCliente(param) {
  if (!param || param.length < 8) return "❓ Use: /cliente [número ou CPF]\nEx: /cliente 84999999999";
  try {
    // Busca no banco de conversas primeiro
    const { query } = await import("./db.js");
    const r = await query(`
      SELECT nome, telefone, canal, status, criado_em,
        (SELECT COUNT(*) FROM conversas c2 WHERE c2.telefone = c.telefone) as total_conv
      FROM conversas c
      WHERE telefone ILIKE $1 OR telefone ILIKE $2
      ORDER BY criado_em DESC LIMIT 1
    `, ["%" + param.slice(-8) + "%", "%" + param + "%"]);

    if (!r.rows.length) return `❌ Cliente não encontrado para: *${param}*`;

    const cl = r.rows[0];
    const status = { ativa:"🟢 Ativo", aguardando:"🟡 Aguardando", encerrada:"⚫ Encerrada", ia:"🤖 Com IA" }[cl.status] || cl.status;
    const data = new Date(cl.criado_em).toLocaleDateString("pt-BR");

    // Tenta buscar dados do SGP também
    let sgpInfo = "";
    try {
      const { consultarClientes } = await import("./erp.js");
      const sgp = await consultarClientes(param);
      if (sgp?.contratos?.length) {
        const cont = sgp.contratos[0];
        sgpInfo = `\n📡 Plano: *${cont.plano || "—"}*\n💰 Status contrato: *${cont.status || "—"}*\n🔑 Contrato: #${cont.id || "—"}`;
      }
    } catch {}

    return `👤 *${cl.nome || "Cliente"}*\n📞 ${cl.telefone}\n📱 Canal: ${cl.canal}\n🔄 Status atual: ${status}\n📅 Primeiro contato: ${data}\n💬 Total conversas: ${cl.total_conv}${sgpInfo}\n\n👉 ${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/chat`;
  } catch(e) {
    return "Erro ao buscar cliente: " + e.message;
  }
}

// ─── COMANDO /fila ────────────────────────────────────────────────────────────

async function cmdFila() {
  try {
    const r = await query(`
      SELECT nome, canal, ultima_msg,
        EXTRACT(EPOCH FROM (NOW() - to_timestamp(ultima_msg/1000)))::int as seg_espera
      FROM conversas
      WHERE status = 'aguardando' AND ultima_msg > 0
      ORDER BY ultima_msg ASC
      LIMIT 10
    `);
    if (!r.rows.length) return "✅ Fila vazia! Nenhum cliente aguardando agente.";
    const linhas = r.rows.map(c => {
      const min = Math.floor((c.seg_espera || 0) / 60);
      const icon = min >= 10 ? "🔴" : min >= 5 ? "🟡" : "🟢";
      return `${icon} *${c.nome || "Cliente"}* — ${min}min aguardando`;
    });
    return `📋 *Fila atual (${r.rows.length}):*\n\n${linhas.join("\n")}`;
  } catch(e) {
    return "Não consegui buscar a fila agora. 🙏";
  }
}

// ─── COMANDO /stats ───────────────────────────────────────────────────────────

async function cmdStats() {
  try {
    const hoje = new Date(); hoje.setHours(0,0,0,0);
    const r = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='encerrada') as encerradas,
        COUNT(*) FILTER (WHERE status='aguardando') as aguardando,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL AND status='encerrada') as com_humano,
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos > 0 AND trp_segundos < 3600))::int as tma
      FROM conversas WHERE criado_em >= $1
    `, [hoje.toISOString()]);
    const d = r.rows[0];
    const tmaStr = d.tma ? `${Math.floor(d.tma/60)}min ${d.tma%60}s` : "—";
    return `📊 *Métricas de hoje:*\n\n📞 Total: ${d.total}\n✅ Encerradas: ${d.encerradas}\n⏳ Aguardando agente: ${d.aguardando}\n👤 Atendidas por humano: ${d.com_humano}\n⏱️ TMA: ${tmaStr}`;
  } catch(e) {
    return "Não consegui buscar as métricas agora. 🙏";
  }
}

// ─── ALERTAS DE FILA ──────────────────────────────────────────────────────────

export async function verificarEDispararAlertas() {
  try {
    const dentroHorario = await dentroDoHorario();
    if (!dentroHorario) return; // Silêncio fora do expediente

    const cfg = await getConfig();
    if (!cfg.ativo || !cfg.instancia) return;

    const t_amarelo  = (cfg.alerta_amarelo  || 2)  * 60 * 1000;
    const t_vermelho = (cfg.alerta_vermelho || 5)  * 60 * 1000;
    const t_admin    = (cfg.alerta_admin    || 10) * 60 * 1000;
    const agora = Date.now();

    const r = await query(`
      SELECT id, nome, canal, telefone, ultima_msg,
        $1 - ultima_msg as ms_espera
      FROM conversas
      WHERE status = 'aguardando' AND ultima_msg > 0
      ORDER BY ultima_msg ASC
      LIMIT 20
    `, [agora]);

    // Imports fora do loop para eficiência
    const { kvGet, kvSet, query: dbQ } = await import("./db.js");
    const appUrl = process.env.APP_URL || "https://maxxi.citmax.com.br";

    // Busca agentes por categoria com WhatsApp cadastrado e dentro do horário
    const agentesR = await dbQ(`
      SELECT id, nome, whatsapp, categoria FROM agentes
      WHERE ativo=true AND whatsapp IS NOT NULL AND whatsapp != ''
    `).catch(() => ({ rows: [] }));
    const agentes = agentesR.rows;

    const numsPorCategoria = (cats) =>
      agentes.filter(a => cats.includes(a.categoria || 'atendente')).map(a => a.whatsapp);

    for (const conv of r.rows) {
      const ms = parseInt(conv.ms_espera) || 0;
      const min = Math.floor(ms / 60000);
      const nomeCliente = conv.nome || "Cliente";

      const chaveAlerta = `alerta_fila_${conv.id}`;
      const ultimoAlerta = parseInt((await kvGet(chaveAlerta)) || "0");

      // Escala crescente: amarelo → vermelho → admin
      if (ms >= t_admin && ultimoAlerta < t_admin) {
        const msg = `🚨 *ESCALONAMENTO — Admin*\n\n👤 *${nomeCliente}* aguarda há *${min} minutos* SEM ATENDIMENTO!\n⚠️ Verificar imediatamente!\n\n👉 ${appUrl}/admin/chat`;
        // Avisa todos os grupos
        for (const grupo of cfg.grupos) {
          await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(() => {});
        }
        // Avisa supervisores e admins individualmente
        for (const num of numsPorCategoria(['supervisor','admin'])) {
          await enviarTexto(cfg.instancia, num, msg).catch(() => {});
        }
        await kvSet(chaveAlerta, String(t_admin));
        logger.info(`🚨 Alerta admin: ${nomeCliente} ${min}min`);

      } else if (ms >= t_vermelho && ultimoAlerta < t_vermelho) {
        const msg = `🔴 *FILA — URGENTE*\n\n👤 *${nomeCliente}* aguarda há *${min} minutos* sem atendimento!\n📱 Canal: ${conv.canal}\n\n👉 ${appUrl}/admin/chat`;
        for (const grupo of cfg.grupos.filter(g => g.alertas)) {
          await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(() => {});
        }
        // Avisa atendentes e supervisores individualmente
        for (const num of numsPorCategoria(['atendente','supervisor','admin'])) {
          await enviarTexto(cfg.instancia, num, msg).catch(() => {});
        }
        await kvSet(chaveAlerta, String(t_vermelho));
        logger.info(`🔴 Alerta vermelho: ${nomeCliente} ${min}min`);

      } else if (ms >= t_amarelo && ultimoAlerta < t_amarelo) {
        const msg = `🟡 *FILA — Atenção*\n\n👤 *${nomeCliente}* aguarda há *${min} minuto(s)*.\n📱 Canal: ${conv.canal}`;
        for (const grupo of cfg.grupos.filter(g => g.alertas)) {
          await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(() => {});
        }
        // Só atendentes no amarelo
        for (const num of numsPorCategoria(['atendente'])) {
          await enviarTexto(cfg.instancia, num, msg).catch(() => {});
        }
        await kvSet(chaveAlerta, String(t_amarelo));
        logger.info(`🟡 Alerta amarelo: ${nomeCliente} ${min}min`);

        // Mensagem automática pro cliente
        if (cfg.enviar_msg_cliente && cfg.msg_cliente_espera) {
          const { waSendText } = await import("./whatsapp.js");
          await waSendText(conv.telefone, cfg.msg_cliente_espera).catch(() => {});
        }
      }
    }

    // Limpa chaves de alerta de conversas que já saíram da fila
    const idsAtivos = new Set(r.rows.map(c => c.id));
  } catch(e) {
    logger.error(`❌ verificarAlertas: ${e.message}`);
  }
}

// ─── RESUMO DIÁRIO ────────────────────────────────────────────────────────────

export async function enviarResumoDiario() {
  try {
    const cfg = await getConfig();
    if (!cfg.ativo || !cfg.instancia || !cfg.resumo_diario) return;

    const ontem = new Date(); ontem.setDate(ontem.getDate()-1); ontem.setHours(0,0,0,0);
    const hoje  = new Date(); hoje.setHours(0,0,0,0);

    const r = await query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE agente_id IS NULL AND status='encerrada') as so_ia,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos > 0))::int as tma
      FROM conversas WHERE criado_em >= $1 AND criado_em < $2
    `, [ontem.toISOString(), hoje.toISOString()]);

    const nps = await query(`
      SELECT ROUND(AVG(nota),1) as media, COUNT(*) as total
      FROM nps_respostas WHERE criado_em >= $1 AND criado_em < $2 AND nota IS NOT NULL
    `, [ontem.toISOString(), hoje.toISOString()]);

    const d = r.rows[0];
    const n = nps.rows[0];
    const tmaStr = d.tma ? `${Math.floor(d.tma/60)}min` : "—";
    const taxaIA = d.total > 0 ? Math.round((d.so_ia / d.total) * 100) : 0;

    const data = ontem.toLocaleDateString("pt-BR", { weekday:"long", day:"2-digit", month:"2-digit" });
    const msg = `☀️ *Bom dia, equipe!*\n\n📊 *Resumo de ${data}:*\n\n📞 ${d.total} atendimentos\n🤖 IA resolveu ${taxaIA}% (${d.so_ia} conv)\n👤 Humano: ${d.com_humano}\n⏱️ TMA médio: ${tmaStr}${n.total > 0 ? `\n⭐ NPS: ${n.media}/10 (${n.total} resp)` : ""}\n\nBom trabalho ontem! Vamos nessa hoje 💪`;

    for (const grupo of cfg.grupos.filter(g => g.alertas)) {
      await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(() => {});
    }
    logger.info("📊 Resumo diário enviado para equipe");
  } catch(e) {
    logger.error(`❌ resumo diário: ${e.message}`);
  }
}
