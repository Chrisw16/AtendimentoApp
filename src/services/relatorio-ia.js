/**
 * relatorio-ia.js — Relatório diário de agentes gerado pelo Claude
 * Roda às 18h via cron e envia por WhatsApp pro gestor
 */
import { query, kvGet } from "./db.js";
import { logger } from "./logger.js";

// ── COLETAR DADOS DO DIA ──────────────────────────────────────────────────────
async function coletarDadosDia() {
  const hoje = new Date().toISOString().slice(0, 10);

  // Agentes
  const agentes = await query(`
    SELECT a.id, a.nome,
      COALESCE(p.atendimentos, 0) as atendimentos,
      COALESCE(p.tempo_online_s, 0) as tempo_online_s,
      COALESCE(p.tempo_resp_medio_s, 0) as tempo_resp_medio_s,
      COALESCE(p.desconexoes, 0) as desconexoes,
      COALESCE(p.sla_quebrados, 0) as sla_quebrados,
      COALESCE(p.score, 0) as score,
      (SELECT COUNT(*) FROM sessoes_agente WHERE agente_id=a.id AND DATE(login_em)=CURRENT_DATE AND tipo='login') as logins_hoje,
      (SELECT COUNT(*) FROM conversas WHERE agente_id=a.id AND status='ativa') as conversas_ativas
    FROM agentes a
    LEFT JOIN performance_diaria p ON p.agente_id=a.id AND p.data=CURRENT_DATE
    WHERE a.ativo=true
    ORDER BY p.score DESC NULLS LAST
  `).catch(() => ({ rows: [] }));

  // Fila
  const fila = await query(`
    SELECT COUNT(*) as total,
      COUNT(CASE WHEN aguardando_desde IS NOT NULL AND 
        EXTRACT(EPOCH FROM (NOW()-aguardando_desde))/60 > 15 THEN 1 END) as criticos,
      AVG(CASE WHEN aguardando_desde IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW()-aguardando_desde))/60 END) as media_espera_min
    FROM conversas WHERE status='aguardando'
  `).catch(() => ({ rows: [{}] }));

  // Totais do dia
  const totais = await query(`
    SELECT COUNT(*) as total_conv,
      COUNT(CASE WHEN status='encerrada' THEN 1 END) as encerradas,
      COUNT(CASE WHEN status='aguardando' THEN 1 END) as aguardando
    FROM conversas WHERE DATE(criado_em)=CURRENT_DATE
  `).catch(() => ({ rows: [{}] }));

  return { agentes: agentes.rows, fila: fila.rows[0], totais: totais.rows[0], hoje };
}

// ── GERAR RELATÓRIO VIA CLAUDE ────────────────────────────────────────────────
export async function gerarRelatorioIA() {
  const dados = await coletarDadosDia();

  const prompt = `Você é um analista de performance de central de atendimento de uma provedora de internet (CITmax).
Analise os dados abaixo e escreva um relatório executivo CURTO (máximo 10 linhas) em português brasileiro informal mas profissional.
Inclua: resumo do dia, destaque positivo, ponto de atenção e uma recomendação prática.
Use emojis moderadamente. Seja direto e honesto.

DADOS DO DIA ${dados.hoje}:
Total de conversas: ${dados.totais.total_conv}
Encerradas: ${dados.totais.encerradas}
Ainda aguardando: ${dados.totais.aguardando}
Críticos na fila (>15min): ${dados.fila.criticos || 0}

AGENTES:
${dados.agentes.map(a => `- ${a.nome}: ${a.atendimentos} atend, online ${Math.round(a.tempo_online_s/3600*10)/10}h, ${a.desconexoes} desconexões, score ${a.score}`).join('\n')}

Responda APENAS com o texto do relatório, sem formatação markdown, sem títulos.`;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada");

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await resp.json();
    const texto = data.content?.[0]?.text || "Não foi possível gerar o relatório.";
    return { texto, dados };
  } catch (err) {
    logger.error(`❌ Erro ao gerar relatório IA: ${err.message}`);
    const fallback = `📊 Resumo ${dados.hoje}: ${dados.totais.encerradas} atendimentos concluídos. `
      + `${dados.totais.aguardando} na fila. `
      + `Melhor agente: ${dados.agentes[0]?.nome || "—"} (${dados.agentes[0]?.atendimentos || 0} atend).`;
    return { texto: fallback, dados };
  }
}

// ── ENVIAR POR WHATSAPP ───────────────────────────────────────────────────────
export async function enviarRelatorioWhatsApp(numeroGestor) {
  try {
    const { texto } = await gerarRelatorioIA();
    const { waSendText } = await import("./whatsapp.js");
    await waSendText(numeroGestor, `📋 *Relatório diário — Maxxi IA*\n\n${texto}`);
    logger.info(`✅ Relatório enviado para ${numeroGestor}`);
    return true;
  } catch (err) {
    logger.error(`❌ Erro ao enviar relatório: ${err.message}`);
    return false;
  }
}

// ── CRON — 18h ────────────────────────────────────────────────────────────────
export function iniciarCronRelatorio() {
  const agora = new Date();
  const alvo = new Date();
  alvo.setHours(18, 0, 0, 0);
  if (alvo <= agora) alvo.setDate(alvo.getDate() + 1); // amanhã
  const ms = alvo - agora;

  setTimeout(async () => {
    try {
      const numeroGestor = await kvGet("numero_gestor_relatorio");
      if (numeroGestor) {
        await enviarRelatorioWhatsApp(numeroGestor);
      }
    } catch {}
    // Reagenda para o próximo dia
    iniciarCronRelatorio();
  }, ms);

  logger.info(`⏰ Relatório diário agendado para ${alvo.toLocaleTimeString("pt-BR")}`);
}
