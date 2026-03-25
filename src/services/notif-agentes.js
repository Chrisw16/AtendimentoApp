/**
 * notif-agentes.js — Notificações de agentes via Maxxi Equipe (WhatsApp)
 * 1. Alerta de agente atrasado (pro agente + supervisor)
 * 2. Notificação de conversa transferida (só quando agente offline)
 */
import { logger } from "./logger.js";
import { minutosAgora, diaSemana, paraMinutos, dentroDoIntervalo, horaAtual } from "./horario.js";

// Controle para não repetir alertas no mesmo dia
const _alertasEnviados = new Set(); // "atraso_agenteId_data"
const _transferenciasNotif = new Set(); // "convId_agenteId"

// ─── HELPER: envia mensagem via Evolution ─────────────────────────────────────
async function enviarWA(numero, texto) {
  try {
    const { getConfig, enviarTexto } = await import("./evolution.js");
    const cfg = await getConfig();
    if (!cfg.ativo || !cfg.instancia) return false;
    if (!numero || numero.length < 10) return false;
    await enviarTexto(cfg.instancia, numero + "@s.whatsapp.net", texto);
    return true;
  } catch(e) {
    logger.warn(`⚠️ notif-agentes enviarWA: ${e.message}`);
    return false;
  }
}

// ─── HELPER: checa se está dentro do horário do agente ────────────────────────
function dentroDoHorarioAgente(horarioTrabalho) {
  if (!horarioTrabalho) return true;
  const dia = diaSemana();
  const cfg = horarioTrabalho[dia];
  if (!cfg?.ativo) return false;
  return dentroDoIntervalo(cfg.inicio || "08:00", cfg.fim || "18:00");
}

// ─── ALERTA DE AGENTE ATRASADO ────────────────────────────────────────────────
export async function verificarAgentesAtrasados() {
  try {
    const { getConfig } = await import("./evolution.js");
    const cfg = await getConfig();

    // Verifica se notificação está habilitada
    if (!cfg.notif_atraso) return;
    if (!cfg.ativo || !cfg.instancia) return;

    const { query } = await import("./db.js");
    const delay = cfg.notif_atraso_delay || 15; // minutos

    const agentes = await query(`
      SELECT id, nome, whatsapp, categoria, horario_trabalho, online
      FROM agentes WHERE ativo=true AND whatsapp IS NOT NULL AND whatsapp != ''
    `);

    const diaAtual = diaSemana();
    const horaAtualMin = minutosAgora();
    const hoje = new Date().toLocaleDateString("sv", { timeZone: process.env.TZ || "America/Fortaleza" });

    for (const ag of agentes.rows) {
      const diaConfig = (ag.horario_trabalho || {})[diaAtual];
      if (!diaConfig?.ativo) continue;

      const [hi, mi] = (diaConfig.inicio || "08:00").split(":").map(Number);
      const inicioMin = hi * 60 + mi;

      const [hf, mf] = (diaConfig.fim || "18:00").split(":").map(Number);
      const fimMin = hf * 60 + mf;

      // Só verifica após o delay configurado
      if (horaAtualMin < inicioMin + delay) continue;
      // Não alerta depois que o expediente já terminou
      if (horaAtualMin > fimMin) continue;
      // Não alerta quem já está online
      if (ag.online) continue;

      // Verifica se já logou hoje
      const login = await query(
        `SELECT id FROM agente_sessoes WHERE agente_id=$1 AND tipo='login' AND criado_em::date=CURRENT_DATE LIMIT 1`,
        [ag.id]
      );
      if (login.rows.length) continue; // já logou hoje

      // Evita repetir — persiste no banco para sobreviver a redeploys
      const chave = `atraso_${ag.id}_${hoje}`;
      if (_alertasEnviados.has(chave)) continue;
      const jaEnviado = await query(
        `SELECT 1 FROM sistema_kv WHERE chave=$1 AND criado_em::date=CURRENT_DATE LIMIT 1`,
        [chave]
      ).catch(() => ({ rows: [] }));
      if (jaEnviado.rows.length) { _alertasEnviados.add(chave); continue; }
      // Marca no banco
      await query(
        `INSERT INTO sistema_kv(chave, valor) VALUES($1,$2) ON CONFLICT(chave) DO NOTHING`,
        [chave, hoje]
      ).catch(() => {});
      _alertasEnviados.add(chave);

      const atraso = horaAtualMin - inicioMin;
      logger.info(`⏰ Agente atrasado: ${ag.nome} (${atraso}min)`);

      // Notifica o próprio agente
      if (cfg.notif_atraso_agente !== false) {
        const msg = `⏰ *${ag.nome}*, seu horário começou às *${diaConfig.inicio}*.\n\nVocê ainda não registrou o login no sistema. Por favor, acesse o painel para iniciar seu atendimento!\n\n👉 ${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin`;
        await enviarWA(ag.whatsapp, msg);
      }

      // Notifica supervisores/admins
      if (cfg.notif_atraso_supervisor !== false) {
        const supervisores = await query(
          `SELECT whatsapp, nome FROM agentes WHERE ativo=true AND categoria IN ('supervisor','admin') AND whatsapp IS NOT NULL AND whatsapp != ''`
        );
        const msgSup = `⚠️ *Alerta de atraso*\n\n👤 *${ag.nome}* não logou ainda.\n🕐 Horário previsto: ${diaConfig.inicio} | Atraso: ${atraso}min\n\n${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/agentes`;
        for (const sup of supervisores.rows) {
          if (sup.whatsapp !== ag.whatsapp) { // não manda pro próprio agente de novo
            await enviarWA(sup.whatsapp, msgSup);
          }
        }
      }
    }
  } catch(e) {
    logger.error(`❌ verificarAgentesAtrasados: ${e.message}`);
  }
}

// ─── NOTIFICAÇÃO DE CONVERSA TRANSFERIDA (só offline) ─────────────────────────
export async function notificarTransferenciaAgentes(convId, nomeCliente, canal) {
  try {
    const { getConfig } = await import("./evolution.js");
    const cfg = await getConfig();

    if (!cfg.notif_transferencia || !cfg.ativo || !cfg.instancia) return;

    const { query } = await import("./db.js");

    // Busca agentes atendentes OFFLINE com WhatsApp e dentro do horário
    const agentes = await query(`
      SELECT id, nome, whatsapp, horario_trabalho, online, status_atual
      FROM agentes
      WHERE ativo=true
        AND categoria IN ('atendente','supervisor')
        AND whatsapp IS NOT NULL AND whatsapp != ''
        AND (online = false OR status_atual = 'offline')
    `);

    const chave = `transf_${convId}`;
    if (_transferenciasNotif.has(chave)) return;
    _transferenciasNotif.add(chave);
    // Limpa após 1h
    setTimeout(() => _transferenciasNotif.delete(chave), 3600000);

    const msgPadrao = cfg.notif_transferencia_msg
      || "💬 *Nova conversa aguardando!*\n\nO cliente *{cliente}* está aguardando atendimento.\n\n👉 {url}/admin/chat";

    const msg = msgPadrao
      .replace("{cliente}", nomeCliente || "Cliente")
      .replace("{url}", process.env.APP_URL || "https://maxxi.citmax.com.br")
      .replace("{canal}", canal || "WhatsApp");

    let enviados = 0;
    for (const ag of agentes.rows) {
      if (!dentroDoHorarioAgente(ag.horario_trabalho)) continue;
      await enviarWA(ag.whatsapp, msg);
      enviados++;
    }

    if (enviados > 0) {
      logger.info(`💬 Notificação transferência: ${nomeCliente} → ${enviados} agente(s) offline`);
    }
  } catch(e) {
    logger.error(`❌ notificarTransferenciaAgentes: ${e.message}`);
  }
}

// ─── NOTIFICAÇÃO DE CHAMADO TÉCNICO ──────────────────────────────────────────
export async function notificarTecnicosChamado({ protocolo, nome, telefone, contrato, tipo, conteudo }) {
  try {
    const { query } = await import("./db.js");
    // Busca técnicos com WhatsApp cadastrado
    const tecnicos = await query(`
      SELECT whatsapp, nome FROM agentes
      WHERE ativo=true AND categoria='tecnico' AND whatsapp IS NOT NULL AND whatsapp != ''
    `);
    if (!tecnicos.rows.length) return;

    const msg = `🔧 *Nova ocorrência técnica*\n\n`
      + `👤 Cliente: *${nome || "Não identificado"}*\n`
      + `📞 Telefone: ${telefone || "—"}\n`
      + `🎫 Protocolo: *${protocolo || "—"}*\n`
      + `📋 Tipo: ${tipo || "Reparo"}\n`
      + `📝 ${conteudo || ""}\n\n`
      + `👉 ${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/chat`;

    for (const t of tecnicos.rows) {
      await enviarWA(t.whatsapp, msg);
      logger.info(`🔧 Notif chamado → ${t.nome}`);
    }
  } catch(e) {
    logger.error(`❌ notificarTecnicosChamado: ${e.message}`);
  }
}

// ─── NOTIFICAÇÃO DE CANCELAMENTO — RETIRADA DE EQUIPAMENTO ──────────────────
export async function notificarTecnicosCancelamento({ nome, contrato, endereco, telefone, plano }) {
  try {
    const { query } = await import("./db.js");
    const tecnicos = await query(`
      SELECT whatsapp, nome FROM agentes
      WHERE ativo=true AND categoria='tecnico' AND whatsapp IS NOT NULL AND whatsapp != ''
    `);
    // Também notifica supervisores e admins
    const supervisores = await query(`
      SELECT whatsapp, nome FROM agentes
      WHERE ativo=true AND categoria IN ('supervisor','admin') AND whatsapp IS NOT NULL AND whatsapp != ''
    `);

    const todos = [...tecnicos.rows, ...supervisores.rows];
    if (!todos.length) return;

    const msg = `❌ *Cancelamento — Retirar equipamento*\n\n`
      + `👤 Cliente: *${nome || "Não identificado"}*\n`
      + `📞 Telefone: ${telefone || "—"}\n`
      + `🏠 Contrato: #${contrato || "—"}\n`
      + `${endereco ? `📍 Endereço: ${endereco}\n` : ""}`
      + `${plano ? `📡 Plano: ${plano}\n` : ""}\n`
      + `⚠️ *Prioridade: Retirar o equipamento o quanto antes!*\n`
      + `O acesso foi interrompido imediatamente.`;

    for (const t of todos) {
      await enviarWA(t.whatsapp, msg);
      logger.info(`❌ Notif cancelamento → ${t.nome}`);
    }
  } catch(e) {
    logger.error(`❌ notificarTecnicosCancelamento: ${e.message}`);
  }
}

// ─── ALERTA NPS NEGATIVO ─────────────────────────────────────────────────────
export async function notificarNPSNegativo({ nota, nome, telefone, canal, protocolo }) {
  try {
    const { query } = await import("./db.js");
    const dest = await query(`
      SELECT whatsapp, nome FROM agentes
      WHERE ativo=true AND categoria IN ('supervisor','admin')
      AND whatsapp IS NOT NULL AND whatsapp != ''
    `);
    if (!dest.rows.length) return;

    const emoji = nota <= 3 ? "🔴" : nota <= 5 ? "🟠" : "🟡";
    const msg = `${emoji} *NPS Negativo — Nota ${nota}/10*\n\n`
      + `👤 Cliente: *${nome || "Não identificado"}*\n`
      + `📞 ${telefone || "—"} | Canal: ${canal || "—"}\n`
      + `🎫 Protocolo: ${protocolo || "—"}\n\n`
      + `⚠️ Cliente detrator — verificar atendimento!\n`
      + `👉 ${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/relatorio`;

    for (const d of dest.rows) {
      await enviarWA(d.whatsapp, msg);
    }
    logger.info(`⭐ Alerta NPS ${nota} enviado para ${dest.rows.length} supervisor(es)`);
  } catch(e) {
    logger.error(`❌ notificarNPSNegativo: ${e.message}`);
  }
}

// ─── DETECTAR PROBLEMA EM ÁREA (por bairro via SGP + configurável) ───────────
const _alertasAreaEnviados = new Set();

export async function verificarProblemaArea() {
  try {
    const { getConfig } = await import("./evolution.js");
    const cfg = await getConfig();
    if (!cfg.ativo || !cfg.instancia || !cfg.notif_problema_area) return;

    const threshold = cfg.area_threshold || 3;
    const janela = cfg.area_janela || 30;

    const { query } = await import("./db.js");
    const r = await query(`
      SELECT telefone, nome FROM conversas
      WHERE criado_em >= NOW() - INTERVAL '${janela} minutes'
      AND status IN ('ia','aguardando','ativa')
      AND (
        lower(mensagens::text) LIKE '%sem sinal%'
        OR lower(mensagens::text) LIKE '%sem internet%'
        OR lower(mensagens::text) LIKE '%internet caiu%'
        OR lower(mensagens::text) LIKE '%offline%'
        OR lower(mensagens::text) LIKE '%lentid%'
        OR lower(mensagens::text) LIKE '%sem acesso%'
      )
    `).catch(() => ({ rows: [] }));

    if (r.rows.length < threshold) return;

    // Agrupa por bairro consultando o SGP
    const { consultarClientes } = await import("./erp.js");
    const porArea = {};
    for (const conv of r.rows) {
      try {
        const cliente = await consultarClientes(conv.telefone).catch(() => null);
        const end = cliente?.contratos?.[0]?.end || "";
        const bairro = end.includes(" - ") ? end.split(" - ").pop().trim() : "Área desconhecida";
        porArea[bairro] = porArea[bairro] || [];
        porArea[bairro].push(conv.nome || conv.telefone);
      } catch { 
        porArea["Área desconhecida"] = porArea["Área desconhecida"] || [];
        porArea["Área desconhecida"].push(conv.nome || conv.telefone);
      }
    }

    for (const [area, clientes] of Object.entries(porArea)) {
      if (clientes.length < threshold) continue;
      const chave = `area_${area}_${new Date().toISOString().slice(0,13)}`;
      if (_alertasAreaEnviados.has(chave)) continue;
      _alertasAreaEnviados.add(chave);

      const msg = `📡 *Possível problema de rede*\n\n`
        + `📍 Área: *${area}*\n`
        + `⚠️ *${clientes.length} clientes* com problemas nos últimos ${janela}min\n`
        + `👤 ${clientes.slice(0,3).join(", ")}${clientes.length > 3 ? ` +${clientes.length-3}` : ""}\n\n`
        + `Verificar equipamento da área!\n\n`
        + `👉 ${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/chat`;

      const dest = await query(`SELECT whatsapp FROM agentes WHERE ativo=true AND categoria IN ('supervisor','admin','tecnico') AND whatsapp IS NOT NULL AND whatsapp != ''`);
      for (const d of dest.rows) await enviarWA(d.whatsapp, msg);
      const { enviarTextoGrupo } = await import("./evolution.js");
      for (const grupo of (cfg.grupos || []).filter(g => g.alertas)) {
        await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(() => {});
      }
      logger.info(`📡 Alerta área [${area}]: ${clientes.length} clientes`);
    }
  } catch(e) {
    logger.error(`❌ verificarProblemaArea: ${e.message}`);
  }
}

// ─── RESUMO INDIVIDUAL POR AGENTE ────────────────────────────────────────────
export async function enviarResumoIndividual() {
  try {
    const { getConfig } = await import("./evolution.js");
    const cfg = await getConfig();
    if (!cfg.ativo || !cfg.instancia || !cfg.resumo_individual) return;

    const { query } = await import("./db.js");
    const agentes = await query(`
      SELECT id, nome, whatsapp, horario_trabalho FROM agentes
      WHERE ativo=true AND whatsapp IS NOT NULL AND whatsapp != ''
    `);

    const hoje = new Date(); hoje.setHours(0,0,0,0);

    for (const ag of agentes.rows) {
      if (!ag.whatsapp) continue;
      // Só envia se trabalhou hoje
      if (!dentroDoHorarioAgente(ag.horario_trabalho)) continue;

      const r = await query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='encerrada') as encerradas,
          ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos > 0 AND trp_segundos < 3600))::int as tma
        FROM conversas
        WHERE agente_id=$1 AND criado_em >= $2
      `, [ag.id, hoje.toISOString()]);

      const nps = await query(`
        SELECT ROUND(AVG(nota),1) as media, COUNT(*) as total
        FROM nps_respostas
        WHERE criado_em >= $1
        AND protocolo IN (SELECT _protocolo FROM conversas WHERE agente_id=$2 AND criado_em >= $3)
      `, [hoje.toISOString(), ag.id, hoje.toISOString()]).catch(() => ({ rows: [{}] }));

      const d = r.rows[0];
      if (!d || parseInt(d.total) === 0) continue; // não trabalhou hoje

      const tmaStr = d.tma ? `${Math.floor(d.tma/60)}min ${d.tma%60}s` : "—";
      const npsStr = nps.rows[0]?.media ? `⭐ NPS: ${nps.rows[0].media}/10` : "";

      const msg = `📊 *Seu resumo de hoje, ${ag.nome.split(' ')[0]}!*\n\n`
        + `💬 Atendimentos: *${d.total}*\n`
        + `✅ Encerrados: *${d.encerradas}*\n`
        + `⏱️ TMA médio: *${tmaStr}*\n`
        + `${npsStr}\n\n`
        + `Bom trabalho! Até amanhã 👋`;

      await enviarWA(ag.whatsapp, msg);
      logger.info(`📊 Resumo individual enviado → ${ag.nome}`);
    }
  } catch(e) {
    logger.error(`❌ enviarResumoIndividual: ${e.message}`);
  }
}
