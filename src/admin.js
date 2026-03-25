/**
 * admin.js — Painel de gerenciamento Maxxi (versão completa)
 */
import { Router }                    from "express";
import express                       from "express";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { fileURLToPath }               from "url";
import { dirname, join }               from "path";
import rateLimit                       from "express-rate-limit";

// Services
import { getStats, getLogBuffer, addSseClient, removeSseClient, logger } from "./services/logger.js";
import { limparSessao, listarSessoes, listarClientes, deletarMemoria } from "./services/memoria.js";
import { sendMessage, sendOutbound, resolveConversation } from "./services/chatwoot.js";
import { consultarClientes, verificarConexao, criarChamado, segundaViaBoleto, historicoOcorrencias, listarOcorrencias, fecharOcorrencia, adicionarNota as notaOcorrencia, listarPlanos, buscarCliente } from "./services/erp.js";
import { listarCanais, getCanal, salvarCanal, ativarCanal }   from "./services/canais.js";
import {
  listarRespostasRapidas, salvarRespostaRapida, removerRespostaRapida,
  getHorarios, salvarHorarios, getSaudacoes, salvarSaudacoes,
  getSla, salvarSla, getPesquisa, salvarPesquisa, getEstatisticasPesquisa,
} from "./services/crm.js";
import {
  getModo, setModo,
  getConversas, getConversa, enviarMensagemAgente, assumirConversa,
  encerrarConversa, adicionarNota, transferirConversa, getConversasForaDeSla,
  listarAgentes, criarAgente, atualizarAgente, removerAgente, loginAgente,
  setOnline, addAgentSse, removeAgentSse,
} from "./services/chatInterno.js";
import { registrarWebhookTelegram, verificarWebhookTelegram } from "./webhooks/telegram.js";
import { handleEvolutionWebhook } from "./webhooks/evolution.js";
import { getConfig as getNPSConfig, salvarConfig as salvarNPSConfig, getEstatisticasNPS } from "./services/nps.js";
import { getConfig as getAlertasConfig, salvarConfig as salvarAlertasConfig, getHistoricoAlertas, getStatusJanela } from "./services/alertas.js";
import { getConfig as getReativacaoConfig, salvarConfig as salvarReativacaoConfig, getStats as getReativacaoStats, listarAtivos as listarReativacaoAtivos } from "./services/reativacao.js";
import { transferirParaHumano, devolverParaIA, encerrarHandoff, estaComHumano, listarComHumano, agenteAssumiu } from "./services/handoff.js";
import { gerarToken, verificarToken } from "./services/jwt.js";
import { initAudit, registrarAudit, listarAudit } from "./services/audit.js";

const __dirname   = dirname(fileURLToPath(import.meta.url));
const PROMPT_FILE = join(__dirname, "prompts/maxxi.js");

export const adminRouter = Router();

const ADMIN_TOKEN = process.env.ADMIN_PASSWORD || "citmax2026";

// Rate limiter for login (5 attempts per minute)
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: "Muitas tentativas de login. Aguarde 1 minuto." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Init audit table on startup
initAudit().catch(() => {});

// ── Sanitize error for client (never expose stack traces) ──
function safeError(e) { return typeof e === "string" ? e : (e?.message || "Erro interno").slice(0, 200); }

// Full auth — admin or agent
function auth(req, res, next) {
  const token = req.headers["x-admin-token"] || req.query.token || "";
  // Admin: token fixo
  if (token === ADMIN_TOKEN) { req.role = "admin"; req.agenteId = "admin"; req.agenteNome = "Admin"; return next(); }
  // Agente: JWT
  const payload = verificarToken(token);
  if (!payload) return res.status(401).json({ error: "unauthorized" });
  req.role = payload.role || "agente";
  req.agenteId = payload.id;
  req.agenteNome = payload.nome;
  next();
}

// Admin only middleware
function adminOnly(req, res, next) {
  if (req.role !== "admin") return res.status(403).json({ error: "Acesso restrito ao administrador." });
  next();
}

// ── HTML — React build or legacy admin.html ──────────────────────────────────
const REACT_DIR = join(__dirname, "..", "admin-dist");
const hasReact = existsSync(REACT_DIR + "/index.html");
console.log(`🖥️  React build: ${hasReact ? '✅ ' + REACT_DIR : '❌ NÃO ENCONTRADO em ' + REACT_DIR}`);

if (hasReact) {
  // Serve React static assets (JS, CSS, images)
  adminRouter.use(express.static(REACT_DIR, { maxAge: "7d", index: false }));
}

// Main route: serve React SPA or legacy — cobre / e /* (com e sem trailing slash)
function serveReact(req, res) {
  if (req.path.startsWith("/api/") || req.path.startsWith("/logs/") || req.path.startsWith("/chat/")) {
    return res.status(404).json({ error: "not found" });
  }
  if (hasReact) {
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache");
    res.send(readFileSync(join(REACT_DIR, "index.html"), "utf8"));
  } else {
    res.setHeader("Content-Type", "text/html");
    const fallback = join(__dirname, "admin.html");
    if (existsSync(fallback)) {
      res.send(readFileSync(fallback, "utf8"));
    } else {
      res.send("<h2>Maxxi Admin</h2><p>Build React não encontrado. Verifique o deploy.</p>");
    }
  }
}

adminRouter.get("/", serveReact);

// Legacy admin.html — versão clássica completa (fallback para páginas ainda não migradas)
adminRouter.get("/legacy", (req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.send(readFileSync(join(__dirname, "admin.html"), "utf8"));
});

// ── SSE logs ──────────────────────────────────────────────────────────────────
adminRouter.get("/logs/stream", auth, (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection",    "keep-alive");
  res.flushHeaders();
  for (const e of getLogBuffer().slice(-100))
    res.write(`data: ${JSON.stringify({ ts: e.ts, level: e.level, message: e.message, historic: true })}\n\n`);
  addSseClient(res);
  req.on("close", () => removeSseClient(res));
});

// ── Stats ─────────────────────────────────────────────────────────────────────
adminRouter.get("/api/stats", auth, (req, res) => {
  res.json(getStats());
});

// ── DASHBOARD — dados em tempo real ─────────────────────────────────────────
adminRouter.get("/api/dashboard", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const dias = parseInt(req.query.dias) || 1;
    const since = dias === 1
      ? new Date(new Date().setHours(0,0,0,0)).toISOString()
      : new Date(Date.now() - dias * 86400000).toISOString();

    const [totais, porCanal, porDia, porHora, agentes, fila] = await Promise.all([

      // Totais do período
      dbQ(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='encerrada') as encerradas,
        COUNT(*) FILTER (WHERE status='ativa') as ativas,
        COUNT(*) FILTER (WHERE status='aguardando') as aguardando,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_agente,
        COUNT(*) FILTER (WHERE agente_id IS NULL AND status='encerrada') as so_ia,
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos BETWEEN 10 AND 7200))::int as tma_seg
      FROM conversas WHERE criado_em > $1`, [since]),

      // Por canal
      dbQ(`SELECT canal, COUNT(*) as total
        FROM conversas WHERE criado_em > $1
        GROUP BY canal ORDER BY total DESC`, [since]),

      // Por dia — últimos 7 dias sempre
      dbQ(`SELECT DATE(criado_em AT TIME ZONE 'America/Fortaleza') as dia, COUNT(*) as total
        FROM conversas WHERE criado_em > NOW() - INTERVAL '7 days'
        GROUP BY dia ORDER BY dia`, []),

      // Por hora — hoje
      dbQ(`SELECT EXTRACT(HOUR FROM criado_em AT TIME ZONE 'America/Fortaleza')::int as hora,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_agente
        FROM conversas
        WHERE criado_em >= (NOW() AT TIME ZONE 'America/Fortaleza')::date
        GROUP BY hora ORDER BY hora`, []),

      // Ranking agentes
      dbQ(`SELECT a.nome, c.agente_id,
        COUNT(*) as total,
        ROUND(AVG(c.trp_segundos) FILTER (WHERE c.trp_segundos BETWEEN 10 AND 7200))::int as tma_seg
        FROM conversas c
        JOIN agentes a ON a.id::text = c.agente_id::text
        WHERE c.agente_id IS NOT NULL AND c.criado_em > $1
        GROUP BY c.agente_id, a.nome ORDER BY total DESC LIMIT 10`, [since]),

      // Fila atual em tempo real
      dbQ(`SELECT COUNT(*) as aguardando,
        MIN(EXTRACT(EPOCH FROM (NOW() - criado_em))::int) as min_espera_seg,
        MAX(EXTRACT(EPOCH FROM (NOW() - criado_em))::int) as max_espera_seg
        FROM conversas WHERE status='aguardando'`, []),
    ]);

    const t = totais.rows[0] || {};
    const f = fila.rows[0] || {};
    const total = parseInt(t.total) || 0;
    const soIA = parseInt(t.so_ia) || 0;
    const enc = parseInt(t.encerradas) || 0;
    const taxaIA = enc > 0 ? Math.round((soIA / enc) * 100) : 0;
    const tmaSeg = parseInt(t.tma_seg) || 0;

    res.json({
      periodo_dias: dias,
      gerado_em: new Date().toISOString(),
      totais: {
        total, encerradas: enc,
        ativas: parseInt(t.ativas) || 0,
        com_agente: parseInt(t.com_agente) || 0,
        so_ia: soIA,
        taxa_ia: taxaIA,
        tma_seg: tmaSeg,
        tma_fmt: tmaSeg > 0 ? `${Math.floor(tmaSeg/60)}m${(tmaSeg%60).toString().padStart(2,'0')}s` : '—',
      },
      fila: {
        aguardando: parseInt(f.aguardando) || 0,
        min_espera_seg: parseInt(f.min_espera_seg) || 0,
        max_espera_seg: parseInt(f.max_espera_seg) || 0,
      },
      por_canal: porCanal.rows,
      por_dia: porDia.rows,
      por_hora: porHora.rows,
      agentes: agentes.rows,
    });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR DE FLUXOS — CRUD completo
// ═══════════════════════════════════════════════════════════════════════════════

adminRouter.get("/api/fluxos", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`SELECT id,nome,descricao,ativo,publicado,versao,criado_em,atualizado FROM fluxos ORDER BY atualizado DESC`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.get("/api/fluxos/:id", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`SELECT * FROM fluxos WHERE id=$1`, [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: "Fluxo não encontrado" });
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.post("/api/fluxos", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { nome, descricao, dados } = req.body;
    const id = "fluxo_" + Date.now();
    const r = await dbQ(
      `INSERT INTO fluxos(id,nome,descricao,dados) VALUES($1,$2,$3,$4) RETURNING *`,
      [id, nome || "Novo fluxo", descricao || "", JSON.stringify(dados || { nodes:[], edges:[] })]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.put("/api/fluxos/:id", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { invalidarCacheFluxo } = await import("./services/motor-fluxo.js");
    const { nome, descricao, dados } = req.body;
    const r = await dbQ(
      `UPDATE fluxos SET nome=$2,descricao=$3,dados=$4,atualizado=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id, nome, descricao || "", JSON.stringify(dados)]
    );
    invalidarCacheFluxo(); // invalida cache imediatamente ao salvar
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.post("/api/fluxos/:id/publicar", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { invalidarCacheFluxo } = await import("./services/motor-fluxo.js");
    // Publica este fluxo SEM desativar os outros
    // (cada canal tem seu fluxo_id — coexistência de múltiplos fluxos ativos)
    const r = await dbQ(
      `UPDATE fluxos SET ativo=true,publicado=true,versao=versao+1,atualizado=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id]
    );
    invalidarCacheFluxo();
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.post("/api/fluxos/:id/despublicar", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { invalidarCacheFluxo } = await import("./services/motor-fluxo.js");
    await dbQ(`UPDATE fluxos SET ativo=false,publicado=false WHERE id=$1`, [req.params.id]);
    invalidarCacheFluxo();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.delete("/api/fluxos/:id", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    await dbQ(`DELETE FROM fluxos WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── VINCULAR FLUXO A CANAL ───────────────────────────────────────────────────
adminRouter.put("/api/canais/:tipo/fluxo", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { invalidarCacheFluxo } = await import("./services/motor-fluxo.js");
    const { fluxo_id } = req.body;
    await dbQ(
      `UPDATE canais SET fluxo_id=$1, atualizado=NOW() WHERE tipo=$2`,
      [fluxo_id || null, req.params.tipo]
    );
    invalidarCacheFluxo();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.get("/api/canais/:tipo/fluxo", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`SELECT fluxo_id FROM canais WHERE tipo=$1`, [req.params.tipo]);
    res.json({ fluxo_id: r.rows[0]?.fluxo_id || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

adminRouter.post("/api/fluxos/seed-padrao", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { gerarSaudacao } = await import("./services/saudacao.js");
    const FLUXO_ID = "fluxo_citmax_principal";
    const FLUXO = {"nodes":[{"id":"inicio","tipo":"inicio","posX":60,"posY":300},{"id":"saudacao","tipo":"enviar_botoes","posX":260,"posY":220,"config":{"corpo":"{{saudacao}}\nSou a Maxxi, atendente virtual da CITmax! 😊\n\n📋 Protocolo: *{{protocolo}}*\n\nVocê já é cliente CITmax?","botoes":[{"id":"sou_cliente","label":"✅ Sou cliente"},{"id":"quero_ser","label":"🆕 Quero contratar"}]}},{"id":"consultar_sgp","tipo":"consultar_cliente","posX":520,"posY":120,"config":{"pergunta":"Perfeito! Qual o seu *CPF* ou *CNPJ*? 📝","cpf":"{{cliente.cpf}}","max_tentativas":3,"mensagem_erro":"CPF/CNPJ não encontrado. Verifique e tente novamente."}},{"id":"cpf_nao_encontrado","tipo":"enviar_texto","posX":780,"posY":0,"config":{"texto":"Não foi possível identificar seu cadastro. 😔\nUm atendente irá te ajudar."}},{"id":"menu_cliente","tipo":"enviar_lista","posX":780,"posY":140,"config":{"corpo":"Encontrei! 👋 Olá, *{{cliente.nome}}*!\n\nContrato *#{{cliente.contrato}}* — {{cliente.status}}\n\nComo posso te ajudar?","label_botao":"Ver opções","titulo_secao":"O que precisa?","itens":"boleto|2ª via de boleto\npagamento|Informar pagamento\nmeus_dados|Meus dados\ncomercial|Mudar de plano\nsuporte_tec|Suporte técnico\natendente|Falar com atendente\nencerrar|Encerrar atendimento"}},{"id":"gerar_boleto","tipo":"consultar_boleto","posX":1060,"posY":40,"config":{"contrato":"{{cliente.contrato}}"}},{"id":"enviar_boleto","tipo":"enviar_texto","posX":1320,"posY":40,"config":{"texto":"📄 *Boleto CITmax*\n\n👤 *{{cliente.nome}}*\n💰 Valor: *R$ {{boleto.valor}}*\n📅 Vencimento: {{boleto.vencimento}}\n\n🔗 {{boleto.link}}\n\n💠 PIX copia e cola:\n{{boleto.pix}}"}},{"id":"verificar_conexao","tipo":"verificar_conexao","posX":1060,"posY":160,"config":{"contrato":"{{cliente.contrato}}"}},{"id":"verificar_manutencao","tipo":"verificar_manutencao","posX":1320,"posY":160,"config":{"cpf":"{{cliente.cpf}}"}},{"id":"ia_suporte","tipo":"ia_responde","posX":1580,"posY":160,"config":{"contexto":"suporte","prompt":"Cliente reportou problema de internet. Já verificamos a conexão e manutenção. Ajude com suporte técnico ou abra um chamado se necessário.","max_turns":6}},{"id":"mostrar_dados","tipo":"enviar_texto","posX":1060,"posY":280,"config":{"texto":"📋 *Seus dados CITmax*\n\n👤 *{{cliente.nome}}*\nCPF: {{cliente.cpf}}\n📄 Contrato: *#{{cliente.contrato}}*\n📡 Plano: *{{cliente.plano}}*\n🔌 Status: {{cliente.status}}"}},{"id":"transferir","tipo":"transferir_agente","posX":1060,"posY":380,"config":{"motivo":"Cliente solicitou atendimento humano\nCliente: {{cliente.nome}}\nCPF: {{cliente.cpf}}\nContrato: #{{cliente.contrato}}\nProtocolo: {{protocolo}}"}},{"id":"ia_geral","tipo":"ia_responde","posX":1060,"posY":480,"config":{"contexto":"geral","prompt":"Atenda o cliente com base no contexto disponível. Para pagamentos use promessa_pagamento. Para mudança de plano, oriente sobre os planos disponíveis.","max_turns":8}},{"id":"encerrar_cliente","tipo":"encerrar","posX":1580,"posY":480,"config":{"mensagem":"Fico feliz em ter ajudado! 😊\nQualquer coisa é só chamar.\n\n📋 Protocolo: *{{protocolo}}*"}},{"id":"pedir_cep","tipo":"aguardar_resposta","posX":520,"posY":420,"config":{"mensagem":"Que legal que quer contratar CITmax! 😊\n\nPara verificar cobertura na sua região:\n\n📍 Envie sua *localização* pelo WhatsApp\nou\n✍️ Digite seu *CEP* (ex: 59064-625)","variavel":"cliente.cep"}},{"id":"ia_comercial","tipo":"ia_responde","posX":780,"posY":420,"config":{"contexto":"comercial","prompt":"Novo cliente interessado em contratar CITmax. Verifique cobertura pelo CEP/localização informado, mostre os planos disponíveis e colete os dados para cadastro: nome, CPF, data de nascimento, celular, email, endereço completo, vencimento desejado.","max_turns":20}},{"id":"encerrar_comercial","tipo":"encerrar","posX":1060,"posY":580,"config":{"mensagem":"Cadastro realizado! 🎉\nEm breve nossa equipe técnica entrará em contato para agendar a instalação.\n\n📱 Baixe nosso app: https://cit.net.br/app\n\n📋 Protocolo: *{{protocolo}}*"}}],"edges":[{"from":"inicio","to":"saudacao"},{"from":"saudacao","port":"sou_cliente","to":"consultar_sgp"},{"from":"saudacao","port":"quero_ser","to":"pedir_cep"},{"from":"consultar_sgp","port":"encontrado","to":"menu_cliente"},{"from":"consultar_sgp","port":"multiplos_contratos","to":"menu_cliente"},{"from":"consultar_sgp","port":"max_tentativas","to":"cpf_nao_encontrado"},{"from":"cpf_nao_encontrado","to":"transferir"},{"from":"menu_cliente","port":"boleto","to":"gerar_boleto"},{"from":"menu_cliente","port":"suporte_tec","to":"verificar_conexao"},{"from":"menu_cliente","port":"atendente","to":"transferir"},{"from":"menu_cliente","port":"meus_dados","to":"mostrar_dados"},{"from":"menu_cliente","port":"pagamento","to":"ia_geral"},{"from":"menu_cliente","port":"comercial","to":"ia_geral"},{"from":"menu_cliente","port":"encerrar","to":"encerrar_cliente"},{"from":"gerar_boleto","port":"encontrado","to":"enviar_boleto"},{"from":"gerar_boleto","port":"nao_encontrado","to":"ia_geral"},{"from":"enviar_boleto","to":"encerrar_cliente"},{"from":"verificar_conexao","port":"online","to":"verificar_manutencao"},{"from":"verificar_conexao","port":"offline","to":"verificar_manutencao"},{"from":"verificar_manutencao","port":"sim","to":"ia_suporte"},{"from":"verificar_manutencao","port":"nao","to":"ia_suporte"},{"from":"ia_suporte","port":"resolvido","to":"encerrar_cliente"},{"from":"ia_suporte","port":"transferir","to":"transferir"},{"from":"mostrar_dados","to":"encerrar_cliente"},{"from":"ia_geral","port":"resolvido","to":"encerrar_cliente"},{"from":"ia_geral","port":"transferir","to":"transferir"},{"from":"pedir_cep","to":"ia_comercial"},{"from":"ia_comercial","port":"resolvido","to":"encerrar_comercial"},{"from":"ia_comercial","port":"transferir","to":"transferir"}]}
    const existe = await dbQ(`SELECT id FROM fluxos WHERE id=$1`, [FLUXO_ID]);
    if (existe.rows.length > 0) {
      await dbQ(`UPDATE fluxos SET nome=$2,descricao=$3,dados=$4,ativo=true,publicado=true,versao=versao+1,atualizado=NOW() WHERE id=$1`,
        [FLUXO_ID, "Atendimento CITmax — Principal", "Fluxo padrão de atendimento WhatsApp", JSON.stringify(FLUXO)]);
    } else {
      await dbQ(`INSERT INTO fluxos(id,nome,descricao,dados,ativo,publicado,versao) VALUES($1,$2,$3,$4,true,true,1)`,
        [FLUXO_ID, "Atendimento CITmax — Principal", "Fluxo padrão de atendimento WhatsApp", JSON.stringify(FLUXO)]);
    }

    const { invalidarCacheFluxo } = await import("./services/motor-fluxo.js");
    invalidarCacheFluxo();
    res.json({ ok: true, mensagem: "Fluxo padrão CITmax instalado e ativo!" });
  } catch(e) { res.status(500).json({ ok:false, erro: e.message }); }
});

adminRouter.post("/api/fluxos/:id/duplicar", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const orig = await dbQ(`SELECT * FROM fluxos WHERE id=$1`, [req.params.id]);
    if (!orig.rows.length) return res.status(404).json({ error: "Não encontrado" });
    const o = orig.rows[0];
    const novoId = "fluxo_" + Date.now();
    const r = await dbQ(
      `INSERT INTO fluxos(id,nome,descricao,dados) VALUES($1,$2,$3,$4) RETURNING *`,
      [novoId, `Cópia de ${o.nome}`, o.descricao, JSON.stringify(o.dados)]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── RELATÓRIO COMPLETO ────────────────────────────────────────────────────────
adminRouter.get("/api/relatorio", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const dias = parseInt(req.query.dias) || 30;
    const since = new Date(Date.now() - dias * 86400000).toISOString();

    // Totais gerais de conversas
    const [totais, porCanal, porStatus, porDia, tmResp, agentes, leads, nps, cobertura, frustracao] = await Promise.all([

      // Totais
      dbQ(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='encerrada') as encerradas,
        COUNT(*) FILTER (WHERE status='ativa') as ativas,
        COUNT(*) FILTER (WHERE status='aguardando') as aguardando,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
        COUNT(*) FILTER (WHERE agente_id IS NULL AND status='encerrada') as so_ia,
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos > 0))::int as tma_seg,
        COUNT(*) FILTER (WHERE sentimento ILIKE '%frust%' OR sentimento ILIKE '%neg%') as frustrados
      FROM conversas WHERE criado_em > $1`, [since]),

      // Por canal
      dbQ(`SELECT canal, COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='encerrada') as encerradas
        FROM conversas WHERE criado_em > $1 GROUP BY canal ORDER BY total DESC`, [since]),

      // Por status atual
      dbQ(`SELECT status, COUNT(*) as total FROM conversas GROUP BY status ORDER BY total DESC`),

      // Por dia (últimos N dias)
      dbQ(`SELECT DATE(criado_em) as dia, COUNT(*) as total,
        COUNT(*) FILTER (WHERE agente_id IS NOT NULL) as com_humano,
        COUNT(*) FILTER (WHERE sentimento ILIKE '%frust%') as frustrados
        FROM conversas WHERE criado_em > $1
        GROUP BY dia ORDER BY dia`, [since]),

      // Tempo médio de resposta
      dbQ(`SELECT
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos BETWEEN 1 AND 3600))::int as media_seg,
        ROUND(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trp_segundos) FILTER (WHERE trp_segundos BETWEEN 1 AND 3600))::int as mediana_seg,
        MIN(trp_segundos) FILTER (WHERE trp_segundos > 0) as min_seg,
        MAX(trp_segundos) FILTER (WHERE trp_segundos BETWEEN 1 AND 3600) as max_seg
        FROM conversas WHERE criado_em > $1`, [since]),

      // Agentes — chamados/atendimentos por agente
      dbQ(`SELECT agente_id, COUNT(*) as total,
        ROUND(AVG(trp_segundos) FILTER (WHERE trp_segundos > 0))::int as tma_seg
        FROM conversas WHERE agente_id IS NOT NULL AND criado_em > $1
        GROUP BY agente_id ORDER BY total DESC LIMIT 10`, [since]),

      // Leads captados
      dbQ(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='cadastrado') as cadastrados,
        COUNT(*) FILTER (WHERE criado_em > $1) as periodo
        FROM leads`, [since]),

      // NPS
      dbQ(`SELECT
        COUNT(*) FILTER (WHERE nota IS NOT NULL AND categoria != 'aguardando') as total,
        ROUND(AVG(nota) FILTER (WHERE nota IS NOT NULL AND categoria != 'aguardando'), 1) as media,
        COUNT(*) FILTER (WHERE categoria='promotor') as promotores,
        COUNT(*) FILTER (WHERE categoria='neutro') as neutros,
        COUNT(*) FILTER (WHERE categoria='detrator') as detratores,
        COUNT(*) FILTER (WHERE categoria='aguardando') as enviados_aguardando
        FROM nps_respostas WHERE criado_em > $1`, [since]),

      // Cobertura
      dbQ(`SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE resultado='com_cobertura') as com_cobertura,
        COUNT(*) FILTER (WHERE resultado='sem_cobertura') as sem_cobertura,
        COUNT(*) FILTER (WHERE resultado='lista_espera') as lista_espera
        FROM consultas_cobertura WHERE criado_em > $1`, [since]),

      // Sentimento
      dbQ(`SELECT sentimento, COUNT(*) as total FROM conversas
        WHERE sentimento IS NOT NULL AND criado_em > $1
        GROUP BY sentimento ORDER BY total DESC`, [since]),
    ]);

    const t = totais.rows[0] || {};
    const npsRow = nps.rows[0] || {};
    const tmRow = tmResp.rows[0] || {};
    const leadsRow = leads.rows[0] || {};
    const cobRow = cobertura.rows[0] || {};

    // Calcula NPS Score
    const npsTotal = parseInt(npsRow.total) || 0;
    const npsScore = npsTotal > 0
      ? Math.round(((parseInt(npsRow.promotores||0) - parseInt(npsRow.detratores||0)) / npsTotal) * 100)
      : null;

    // Taxa resolução IA
    const totalEnc = parseInt(t.encerradas) || 0;
    const soIA = parseInt(t.so_ia) || 0;
    const taxaIA = totalEnc > 0 ? Math.round((soIA / totalEnc) * 100) : 0;

    res.json({
      periodo_dias: dias,
      gerado_em: new Date().toISOString(),

      atendimento: {
        total: parseInt(t.total) || 0,
        encerradas: totalEnc,
        ativas: parseInt(t.ativas) || 0,
        aguardando: parseInt(t.aguardando) || 0,
        com_humano: parseInt(t.com_humano) || 0,
        so_ia: soIA,
        taxa_resolucao_ia: taxaIA,
        frustrados: parseInt(t.frustrados) || 0,
        taxa_frustracao: parseInt(t.total) > 0
          ? Math.round((parseInt(t.frustrados||0) / parseInt(t.total)) * 100) : 0,
      },

      tempo_resposta: {
        media_seg: tmRow.media_seg || 0,
        mediana_seg: tmRow.mediana_seg || 0,
        min_seg: tmRow.min_seg || 0,
        max_seg: tmRow.max_seg || 0,
        media_min: tmRow.media_seg ? (tmRow.media_seg / 60).toFixed(1) : "0",
      },

      por_canal: porCanal.rows,
      por_status: porStatus.rows,
      por_dia: porDia.rows,
      sentimento: frustracao.rows,

      agentes: agentes.rows,

      leads: {
        total_historico: parseInt(leadsRow.total) || 0,
        cadastrados: parseInt(leadsRow.cadastrados) || 0,
        periodo: parseInt(leadsRow.periodo) || 0,
      },

      nps: {
        score: npsScore,
        media: parseFloat(npsRow.media) || 0,
        total: npsTotal,
        promotores: parseInt(npsRow.promotores) || 0,
        neutros: parseInt(npsRow.neutros) || 0,
        detratores: parseInt(npsRow.detratores) || 0,
        aguardando: parseInt(npsRow.enviados_aguardando) || 0,
        taxa_resposta: (parseInt(npsRow.enviados_aguardando||0) + npsTotal) > 0
          ? Math.round(npsTotal / (npsTotal + parseInt(npsRow.enviados_aguardando||0)) * 100) : 0,
      },

      cobertura: {
        total: parseInt(cobRow.total) || 0,
        com_cobertura: parseInt(cobRow.com_cobertura) || 0,
        sem_cobertura: parseInt(cobRow.sem_cobertura) || 0,
        lista_espera: parseInt(cobRow.lista_espera) || 0,
        taxa_cobertura: parseInt(cobRow.total) > 0
          ? Math.round(parseInt(cobRow.com_cobertura||0) / parseInt(cobRow.total) * 100) : 0,
      },

      // Stats de IA (tokens/custo)
      ia: getStats(),
    });
  } catch(e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ── Sessões ───────────────────────────────────────────────────────────────────
adminRouter.get("/api/sessoes", auth, async (req, res) => {
  try { res.json(await listarSessoes()); } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.delete("/api/sessoes/:telefone", auth, async (req, res) => {
  await limparSessao(decodeURIComponent(req.params.telefone)); res.json({ ok: true });
});

// ── Memória ───────────────────────────────────────────────────────────────────
adminRouter.get("/api/memoria", auth, async (req, res) => {
  try { res.json(await listarClientes(req.query.q || "")); } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.delete("/api/memoria/:telefone", auth, async (req, res) => {
  await deletarMemoria(decodeURIComponent(req.params.telefone)); res.json({ ok: true });
});

// ── SGP ───────────────────────────────────────────────────────────────────────
adminRouter.get("/api/sgp/cliente",   auth, async (req,res) => { try { res.json(await consultarClientes((req.query.cpf||"").replace(/\D/g,""))); } catch(e) { res.status(500).json({error:safeError(e)}); } });
adminRouter.get("/api/sgp/conexao",   auth, async (req,res) => { try { res.json(await verificarConexao(req.query.contrato)); } catch(e) { res.status(500).json({error:safeError(e)}); } });
adminRouter.post("/api/sgp/chamado",  auth, async (req,res) => {
  const { contrato, tipo, conteudo, contato_nome, contato_telefone } = req.body;
  if (!contrato || !tipo || !conteudo) return res.status(400).json({ error: "contrato, tipo e conteudo obrigatorios" });
  try {
    const raw = await criarChamado(contrato, String(tipo), `[Agente: ${req.agenteNome || req.agenteId || 'admin'}] ${conteudo}`, {
      contato_nome: contato_nome || undefined,
      contato_telefone: contato_telefone || undefined,
      usuario: "maxxi",
    });
    res.json({ ok: true, protocolo: raw.protocolo, chamado_aberto: raw.chamado_aberto, raw });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// SGP: dados completos do cliente (cliente + boletos + ocorrências)
adminRouter.get("/api/sgp/cliente-completo", auth, async (req, res) => {
  const cpf = (req.query.cpf || "").replace(/\D/g, "");
  if (!cpf) return res.status(400).json({ error: "cpf obrigatório" });
  try {
    const { sgpPostRaw, segundaViaBoleto, historicoOcorrencias } = await import("./services/erp.js");

    // Busca contratos ativos com títulos em aberto
    const rawData = await sgpPostRaw("/api/ura/consultacliente/", {
      cpfcnpj: cpf,
      status: "1",              // só ativos
      titulo_status: "abertos", // só títulos em aberto
    });

    // A API /consultacliente/ retorna { msg, contratos: [...] }
    const contratos = rawData?.contratos || [];
    if (!contratos.length) return res.json({ error: "Cliente não encontrado", contratos: [] });

    // Dados do cliente vêm do primeiro contrato
    const primeiro = contratos[0];
    const nomeCliente = primeiro.razaoSocial || primeiro.nome || "";
    const cpfCliente = primeiro.cpfCnpj || cpf;

    // IDs dos contratos para buscar ocorrências
    const contratosIds = contratos.map(c => c.contratoId).filter(Boolean).slice(0, 8);

    // Contratos com títulos em aberto (contratoTitulosAReceber > 0 ou contratoValorAberto > 0)
    const contratosComBoleto = contratos
      .filter(c => (c.contratoTitulosAReceber > 0) || (c.contratoValorAberto > 0))
      .map(c => c.contratoId)
      .filter(Boolean)
      .slice(0, 5);

    // Para cada contrato com boleto, busca segunda via atualizada
    const segundaViaMap = {};
    await Promise.all(contratosComBoleto.map(async (cid) => {
      try {
        const sv = await segundaViaBoleto(cpf, cid);
        if (sv?.status === "boleto_encontrado") {
          segundaViaMap[String(cid)] = [sv];
        } else if (sv?.status === "multiplos_boletos") {
          segundaViaMap[String(cid)] = sv.lista || [];
        }
      } catch {}
    }));

    // Monta lista de boletos a partir da segunda_via
    const boletos = [];
    for (const [cid, lista] of Object.entries(segundaViaMap)) {
      for (const b of lista) {
        boletos.push({
          fatura_id: b.fatura_id,
          valor: b.valor_cobrado,
          valor_original: b.valor_original,
          multa: b.multa ?? 0,
          juros: b.juros ?? 0,
          vencimento_atual: b.vencimento_atual,
          vencimento_original: b.vencimento_original,
          link_cobranca: b.link_cobranca,
          pix_copia_cola: b.pix_copia_cola,
          linha_digitavel: b.linha_digitavel,
          contrato: Number(cid),
          vencido: b.vencido ?? (b.vencimento_atual && new Date(b.vencimento_atual) < new Date()),
        });
      }
    }

    // Ocorrências
    const allOcorrencias = [];
    await Promise.all(contratosIds.slice(0,3).map(async (cid) => {
      try {
        const ocs = await historicoOcorrencias(cid);
        if (Array.isArray(ocs)) allOcorrencias.push(...ocs);
      } catch {}
    }));
    const ocorrencias = allOcorrencias
      .sort((a, b) => (b.data_cadastro || '').localeCompare(a.data_cadastro || ''))
      .slice(0, 10);

    // Formata contratos
    const contratosFormatados = contratos.map(ct => ({
      id: ct.contratoId,
      status: ct.contratoStatusDisplay || "Ativo",
      plano: ct.planointernet || ct.planotv || ct.servico_plano || "",
      endereco: [ct.endereco_logradouro, ct.endereco_numero, ct.endereco_bairro].filter(Boolean).join(", "),
      bloqueado: ct.contratoStatusModo === 4,
    }));

    res.json({
      nome: nomeCliente,
      cpf_cnpj: cpfCliente,
      cpfcnpj: cpfCliente,
      boletos: boletos.slice(0, 15),
      contratos: contratosFormatados,
      ocorrencias,
    });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ── Outbound ──────────────────────────────────────────────────────────────────
adminRouter.post("/api/outbound", auth, async (req,res) => {
  const{inboxId,phone,message,contactName}=req.body;
  try { const r=await sendOutbound(process.env.CHATWOOT_ACCOUNT_ID||"1",inboxId,phone,message,contactName); res.json({ok:true,conversationId:r?.id}); }
  catch(e) { res.status(500).json({error:safeError(e)}); }
});

// ── Status integrações ────────────────────────────────────────────────────────
adminRouter.get("/api/status", auth, async (req,res) => {
  const chk = async (url,opts={}) => { try { const r=await fetch(url,{...opts,signal:AbortSignal.timeout(5000)}); return r.ok||r.status<500?"ok":`erro ${r.status}`; } catch { return "offline"; } };
  const [sgp,chatwoot,anthropic,elevenlabs] = await Promise.all([
    chk("https://citrn.sgp.net.br/api/v2/contratos?app=n8n&token=05ffb2b9-8d63-406d-8467-d471b82e0c35&limit=1"),
    chk(`${process.env.CHATWOOT_URL}/auth/sign_in`,{method:"HEAD"}),
    chk("https://api.anthropic.com/v1/models",{headers:{"x-api-key":process.env.ANTHROPIC_API_KEY,"anthropic-version":"2023-06-01"}}),
    chk("https://api.elevenlabs.io/v1/user",{headers:{"xi-api-key":process.env.ELEVENLABS_API_KEY||""}}),
  ]);
  // WhatsApp Cloud API: verifica se token existe e testa endpoint
  let whatsapp = "offline";
  if (process.env.WA_ACCESS_TOKEN) {
    whatsapp = await chk(`https://graph.facebook.com/v21.0/${process.env.WA_PHONE_NUMBER_ID || "me"}`, { headers: { Authorization: `Bearer ${process.env.WA_ACCESS_TOKEN}` } });
  }
  // OpenAI check
  const openai = process.env.OPENAI_API_KEY ? await chk("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }) : "offline";
  // Google AI check
  const google = process.env.GOOGLE_AI_KEY ? "ok" : "offline";
  res.json({sgp,chatwoot,anthropic,elevenlabs,whatsapp,openai,google});
});

// ── Logs ──────────────────────────────────────────────────────────────────────
adminRouter.get("/api/logs", auth, (req,res) => {
  const{level}=req.query; const buf=getLogBuffer();
  res.json((level?buf.filter(l=>l.level===level):buf).slice(-200).reverse());
});

// ── Prompts IA (do banco, editáveis no painel) ──────────────────────────────
adminRouter.get("/api/prompts", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT id, slug, nome, conteudo, padrao, provedor, modelo, temperatura, ativo, atualizado FROM prompts ORDER BY id`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/prompts/:slug", auth, adminOnly, async (req, res) => {
  try {
    const { conteudo, provedor, modelo, temperatura } = req.body;
    if (!conteudo) return res.status(400).json({ error: "conteudo obrigatório" });
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`UPDATE prompts SET conteudo=$2, provedor=$3, modelo=$4, temperatura=$5, atualizado=NOW() WHERE slug=$1`,
      [req.params.slug, conteudo, provedor || 'openai', modelo || 'gpt-4o-mini', parseFloat(temperatura) || 0.3]);
    const { invalidarCachePrompts } = await import("./agent.js");
    invalidarCachePrompts();
    registrarAudit(req.agenteId, req.agenteNome, "editar_prompt", `Prompt "${req.params.slug}" alterado (${provedor}/${modelo})`, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/prompts/:slug/restaurar", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`UPDATE prompts SET conteudo=padrao, atualizado=NOW() WHERE slug=$1`, [req.params.slug]);
    const { invalidarCachePrompts } = await import("./agent.js");
    invalidarCachePrompts();
    registrarAudit(req.agenteId, req.agenteNome, "restaurar_prompt", `Prompt "${req.params.slug}" restaurado ao padrão`, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── Webhook URL ───────────────────────────────────────────────────────────────
adminRouter.get("/api/webhook-url", auth, (req,res) => {
  const proto=req.headers["x-forwarded-proto"]||"http"; const host=req.headers.host||"localhost";
  res.json({ url:`${proto}://${host}/webhook` });
});

// ══════════════════════════════════════════════════════════════════════════════
// MODO BOT/HUMANO
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/api/modo",  auth, async(req,res) => res.json({modo:await getModo()}));
adminRouter.post("/api/modo", auth, async(req,res) => {
  const{modo}=req.body; if(!["bot","humano"].includes(modo)) return res.status(400).json({error:"modo inválido"});
  await setModo(modo); res.json({ok:true,modo});
});

// ══════════════════════════════════════════════════════════════════════════════
// CHAT INTERNO SSE
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/chat/stream", async(req,res) => {
  // ── Auth check for SSE ──
  const token = req.query.token || "";
  let agenteId = "admin";
  if (token === ADMIN_TOKEN) { agenteId = req.query.agenteId || "admin"; }
  else {
    const payload = verificarToken(token);
    if (!payload) return res.status(401).json({ error: "Token inválido" });
    agenteId = payload.id || req.query.agenteId || "admin";
  }
  res.setHeader("Content-Type","text/event-stream"); res.setHeader("Cache-Control","no-cache"); res.setHeader("Connection","keep-alive"); res.flushHeaders();
  res.write(`event: init\ndata: ${JSON.stringify({modo:await getModo(),conversas:await getConversas()})}\n\n`);
  addAgentSse(agenteId,res);
  req.on("close",()=>{ removeAgentSse(agenteId,res); if(agenteId!=="admin") setOnline(agenteId,false); });
});

// ══════════════════════════════════════════════════════════════════════════════
// CONVERSAS CHAT INTERNO
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/api/conversas", auth, async(req,res)=>{ 
  try {
    const conversas = await getConversas(req.query.filtro);
    if (req.role === "admin") return res.json(conversas);
    // Agente: SOMENTE fila aguardando + conversas que ELE assumiu
    const filtradas = conversas.filter(c => 
      c.status === "aguardando" ||
      (c.status === "ativa" && c.agente_id === req.agenteId)
    );
    res.json(filtradas);
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});
adminRouter.get("/api/conversas/:id", auth, async(req,res)=>{ 
  try { 
    const c = await getConversa(req.params.id); 
    if (!c) return res.status(404).json({error:"não encontrada"});
    // Agente só pode ver a conversa se for da fila ou assumida por ele
    if (req.role !== "admin") {
      const podeVer = c.status === "aguardando" || (c.status === "ativa" && c.agente_id === req.agenteId);
      if (!podeVer) return res.status(403).json({error:"Acesso negado a esta conversa."});
    }
    // Enriquece com CPF da sessão se disponível
    try {
      const { buscarSessao } = await import("./services/memoria.js");
      const sessao = await buscarSessao(c.telefone);
      if (sessao?.cpfcnpj) c.cpfcnpj_sessao = sessao.cpfcnpj;
      if (sessao?.nome) c.nome_sessao = sessao.nome;
    } catch {}
    res.json(c);
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});
adminRouter.post("/api/conversas/:id/assumir", auth, async(req,res)=>{ 
  try {
    const agenteId = req.agenteId || req.body.agenteId || "admin";
    const agenteNome = req.agenteNome || req.body.agenteNome || "Agente";
    await assumirConversa(req.params.id, agenteId);
    await agenteAssumiu(req.params.id, agenteId, agenteNome);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});
adminRouter.post("/api/conversas/:id/encerrar", auth, async(req,res)=>{ 
  try {
    const conv = await getConversa(req.params.id);
    if (conv?.account_id) await resolveConversation(conv.account_id, req.params.id).catch(()=>{});
    await encerrarConversa(req.params.id);
    await encerrarHandoff(req.params.id);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

adminRouter.post("/api/conversas/:id/reabrir", auth, async(req,res)=>{  try {
    const { query } = await import("./services/db.js");
    const { rows } = await query(`SELECT * FROM conversas WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "Conversa não encontrada" });
    const conv = rows[0];

    // Só reabrir se for WhatsApp e dentro da janela de 24h
    const ultimaMsgTs = Number(conv.ultima_msg) || 0;
    const dentroJanela = (Date.now() - ultimaMsgTs) < 86400000; // 24h em ms
    const ehWhatsapp = (conv.canal || "").toLowerCase().includes("whatsapp");

    if (!ehWhatsapp) return res.status(400).json({ error: "Reabrir só disponível para conversas WhatsApp" });
    if (!dentroJanela) return res.status(400).json({ error: "Fora da janela de 24h do WhatsApp. Não é possível reabrir." });

    // Reativa como aguardando (fila) ou ia dependendo da preferência
    const novoStatus = req.body.status || "aguardando";
    await query(
      `UPDATE conversas SET status=$1, atualizado=NOW() WHERE id=$2`,
      [novoStatus, req.params.id]
    );

    // Registra nota interna
    const { registrarRespostaIA } = await import("./services/chatInterno.js");
    await registrarRespostaIA(req.params.id, `📂 Conversa reaberta por ${req.agenteNome || "admin"}.`).catch(()=>{});

    res.json({ ok: true, status: novoStatus });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/conversas/:id/transferir-fluxo", auth, async(req,res)=>{
  try {
    const { fluxo_id } = req.body;
    if (!fluxo_id) return res.status(400).json({ error: "fluxo_id obrigatório" });

    const { query: dbQ } = await import("./services/db.js");

    // Verifica se fluxo existe e está publicado
    const fr = await dbQ(`SELECT id, nome, publicado FROM fluxos WHERE id=$1`, [fluxo_id]);
    if (!fr.rows.length) return res.status(404).json({ error: "Fluxo não encontrado" });
    if (!fr.rows[0].publicado) return res.status(400).json({ error: "Fluxo não está publicado" });

    // Busca conversa
    const conv = await getConversa(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada" });

    // Reseta sessão e aponta para o fluxo
    const { buscarSessao, salvarSessao } = await import("./services/memoria.js");
    const sess = (await buscarSessao(conv.telefone)) || {};
    sess._estado            = "fluxo";
    sess._fluxo_no          = null;
    sess._fluxo_aguardando  = null;
    sess._vars              = {};
    sess._fluxo_id_override = fluxo_id; // motor-fluxo usará este ID
    await salvarSessao(conv.telefone, sess);

    // Atualiza status da conversa para ia (ativa novamente)
    await dbQ(`UPDATE conversas SET status='ia', atualizado=NOW() WHERE id=$1`, [req.params.id]);

    // Registra nota
    const { registrarRespostaIA } = await import("./services/chatInterno.js");
    await registrarRespostaIA(req.params.id,
      `🔀 Conversa transferida para o fluxo *${fr.rows[0].nome}* por ${req.agenteNome || "admin"}.`
    ).catch(()=>{});

    res.json({ ok: true, fluxo: fr.rows[0].nome });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/conversas/:id/mensagem", auth, async(req,res)=>{
  try {
    const { conteudo, agenteId, agenteNome } = req.body;
    if (!conteudo?.trim()) return res.status(400).json({ error: "conteudo obrigatório" });

    const conv = await getConversa(req.params.id);
    if (!conv) return res.status(404).json({ error: "conversa não encontrada" });

    // Auto-assumir: se aguardando e agente envia msg, assume automaticamente
    const effAgenteId   = req.agenteId   || agenteId   || "admin";
    const effAgenteNome = req.agenteNome || agenteNome || "Agente";
    if (conv.status === "aguardando") {
      await assumirConversa(req.params.id, effAgenteId);
      await agenteAssumiu(req.params.id, effAgenteId, effAgenteNome);
      logger.info(`Auto-assumido por ${effAgenteNome}`);
    }

    // Salva no banco
    const msg = await enviarMensagemAgente({
      convId: req.params.id,
      agenteId:   effAgenteId,
      agenteNome: effAgenteNome,
      conteudo,
    });

    // Envia ao usuário pelo canal correto
    // convId tem formato "canal_telefone" ex: "whatsapp_5584..." ou "telegram_123"
    const canalFromId = (req.params.id || "").split("_")[0];
    const canal = conv.canal || canalFromId || "chatwoot";
    const telefoneFromId = (req.params.id || "").includes("_")
      ? req.params.id.split("_").slice(1).join("_")
      : (conv.telefone || "");
    const telefoneEnvio = conv.telefone || telefoneFromId;

    logger.info(`📤 Admin envia msg | canal=${canal} | tel=${telefoneEnvio} | convId=${req.params.id}`);

    if (canal === "chatwoot" && conv.account_id) {
      // Chatwoot
      await sendMessage(conv.account_id, req.params.id, conteudo).catch(()=>{});

    } else if (canal === "telegram") {
      // Telegram
      const { getCanal } = await import("./services/canais.js");
      const canalData = await getCanal("telegram");
      const token = canalData?.config?.botToken;
      const telefone = conv.telefone;
      if (token && telefone) {
        const { sendTelegram } = await import("./webhooks/telegram.js");
        await sendTelegram(telefone, conteudo, token).catch(()=>{});
      }

    } else if (canal === "whatsapp" || canal === "instagram" || canal === "facebook") {
      // WhatsApp / Instagram / Facebook via Meta API
      const { waSendText } = await import("./services/whatsapp.js");
      if (telefoneEnvio) {
        try {
          const waResult = await waSendText(telefoneEnvio, conteudo);
          const waMsgId = waResult?.messages?.[0]?.id;
          // Salva o wa_msg_id na mensagem para permitir apagar no WA depois
          if (waMsgId && msg?.id) {
            try {
              const convAtual = await getConversa(req.params.id);
              if (convAtual) {
                const msgsAtual = (convAtual.mensagens||[]).map(m =>
                  String(m.id) === String(msg.id) ? { ...m, wa_msg_id: waMsgId } : m
                );
                const { query: dbQ } = await import("./services/db.js");
                await dbQ(`UPDATE conversas SET mensagens=$2::jsonb WHERE id=$1`, [req.params.id, JSON.stringify(msgsAtual)]);
              }
            } catch {}
          }
          logger.info(`✅ Msg enviada WA para ${telefoneEnvio} | wamid=${waMsgId||'?'}`);
        } catch(waErr) {
          logger.error(`❌ WA falhou: ${waErr.message}`);
          // Retorna erro ao admin para ele saber que não foi entregue
          return res.status(200).json({ ok: true, msg, aviso: `⚠️ Salvo mas WA falhou: ${waErr.message}` });
        }
      } else {
        logger.warn(`⚠️ WhatsApp sem telefone | convId=${req.params.id}`);
      }

    } else if (canal === "widget") {
      // Widget - mensagem fica no banco e aparece via SSE/reload
    } else {
      logger.warn(`⚠️ Canal desconhecido: '${canal}' | convId=${req.params.id}`);
    }

    res.json({ ok: true, msg });
  } catch(e) {
    res.status(500).json({ error: safeError(e) });
  }
});
adminRouter.delete("/api/conversas/:id/mensagem/:msgId", auth, async(req,res)=>{
  try {
    const conv = await getConversa(req.params.id);
    if (!conv) return res.status(404).json({error:"conversa não encontrada"});
    const msgId = req.params.msgId;

    // Remove mensagem do array
    const msgs = (conv.mensagens||[]).filter(function(m){ return String(m.id) !== String(msgId); });
    const { query } = await import("./services/db.js");
    await query(`UPDATE conversas SET mensagens=$2::jsonb WHERE id=$1`, [req.params.id, JSON.stringify(msgs)]);

    // Tenta apagar no canal de origem (Telegram)
    if (conv.canal === "telegram" && conv.telefone) {
      // Busca o telegram_msg_id armazenado na mensagem
      const msgObj = (conv.mensagens||[]).find(function(m){ return String(m.id) === String(msgId); });
      if (msgObj?.telegram_msg_id) {
        const { getCanal } = await import("./services/canais.js");
        const canal = await getCanal("telegram");
        if (canal?.config?.botToken) {
          await fetch(`https://api.telegram.org/bot${canal.config.botToken}/deleteMessage`, {
            method:"POST", headers:{"Content-Type":"application/json"},
            body: JSON.stringify({ chat_id: conv.telefone, message_id: msgObj.telegram_msg_id }),
          }).catch(()=>{});
        }
      }
    }

    // Apagar no WhatsApp se canal for whatsapp
    if ((conv.canal === "whatsapp" || conv.canal === "meta") && conv.telefone) {
      const msgObj = (conv.mensagens||[]).find(m => String(m.id) === String(msgId));
      // wa_msg_id é o ID da mensagem na Meta (wamid.xxx...)
      const waMsgId = msgObj?.wa_msg_id || msgObj?.wamid || (String(msgObj?.id||"").startsWith("wamid.") ? msgObj.id : null);
      if (waMsgId) {
        try {
          const { getCanal } = await import("./services/canais.js");
          const canal = await getCanal("whatsapp");
          const cfg = canal?.config || {};
          const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
          const phoneId = cfg.phoneNumberId || process.env.WHATSAPP_PHONE_ID;
          if (token && phoneId) {
            const delRes = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                status: "deleted",
                message_id: waMsgId,
              }),
            });
            const delData = await delRes.json();
            if (delData.error) {
              logger.warn(`⚠️ WA delete msg: ${delData.error.message}`);
            } else {
              logger.info(`🗑️ Mensagem ${waMsgId} apagada no WhatsApp do cliente`);
            }
          }
        } catch(e) {
          logger.warn(`⚠️ Erro ao apagar no WA: ${e.message}`);
        }
      }
    }

    // Broadcast para atualizar o chat em tempo real nos painéis abertos
    const { broadcast } = await import("./services/chatInterno.js");
    broadcast("mensagem_apagada", { convId: req.params.id, msgId });

    res.json({ok:true});
  } catch(e){ res.status(500).json({error:safeError(e)}); }
});

adminRouter.post("/api/conversas/:id/nota",      auth,async(req,res)=>{ try{const{nota,agenteId,agenteNome}=req.body;const msg=await adicionarNota(req.params.id,agenteId||"admin",agenteNome||"Admin",nota);msg?res.json(msg):res.status(404).json({error:"não encontrada"});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.post("/api/conversas/:id/transferir",auth,async(req,res)=>{ try{const{paraAgenteId,deAgenteNome}=req.body;await transferirConversa(req.params.id,paraAgenteId,deAgenteNome||"Admin");res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });

// ══════════════════════════════════════════════════════════════════════════════
// AGENTES
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/api/agentes",        auth, adminOnly, async(req,res)=>{ try{res.json(await listarAgentes());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.post("/api/agentes",       auth, adminOnly, async(req,res)=>{ try{ const ag=await criarAgente(req.body); registrarAudit(req.agenteId,req.agenteNome,"criar_agente",req.body.nome,req.ip); res.json(ag); }catch(e){res.status(400).json({error:safeError(e)});} });
adminRouter.put("/api/agentes/:id",    auth, adminOnly, async(req,res)=>{ try{ await atualizarAgente(req.params.id,req.body); registrarAudit(req.agenteId,req.agenteNome,"editar_agente",req.params.id,req.ip); res.json({ok:true}); }catch(e){res.status(400).json({error:safeError(e)});} });
adminRouter.delete("/api/agentes/:id", auth, adminOnly, async(req,res)=>{ try{ await removerAgente(req.params.id); registrarAudit(req.agenteId,req.agenteNome,"remover_agente",req.params.id,req.ip); res.json({ok:true}); }catch(e){res.status(500).json({error:safeError(e)});} });
// Login unificado: admin (senha .env) ou agente (login+senha BD)
adminRouter.post("/api/login", loginLimiter, async (req, res) => {
  try {
    const { login, senha } = req.body;
    if (!login || !senha) return res.status(400).json({ error: "login e senha obrigatórios" });

    // Admin?
    if ((login === "admin" || login === "") && senha === ADMIN_TOKEN) {
      const token = gerarToken({ id: "admin", nome: "Admin", login: "admin", role: "admin" });
      import("./services/agente-monitor.js").then(m => m.registrarEvento("admin", "login", { nome: "Admin", ip: req.ip, userAgent: req.headers['user-agent'] })).catch(()=>{});
      registrarAudit("admin", "Admin", "login", "Login admin", req.ip);
      return res.json({ ok: true, role: "admin", nome: "Admin", id: "admin", token });
    }

    // Agente?
    const ag = await loginAgente(login, senha);
    if (!ag) {
      registrarAudit(login, login, "login_falhou", "Senha incorreta", req.ip);
      return res.status(401).json({ error: "Login ou senha incorretos." });
    }

    await setOnline(ag.id, true);
    import("./services/agente-monitor.js").then(m => m.registrarEvento(ag.id, "login", { nome: ag.nome, ip: req.ip, userAgent: req.headers['user-agent'] })).catch(()=>{});
    registrarAudit(ag.id, ag.nome, "login", "Login agente", req.ip);
    const token = gerarToken({ id: ag.id, nome: ag.nome, login: ag.login, role: ag.role || "agente", avatar: ag.avatar });
    return res.json({ ok: true, role: ag.role || "agente", nome: ag.nome, id: ag.id, avatar: ag.avatar, token });
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/agentes/login", async(req,res)=>{ try{ const{login,senha}=req.body; const ag=await loginAgente(login,senha); if(!ag) return res.status(401).json({error:"Login ou senha inválidos"}); await setOnline(ag.id,true); const token=gerarToken({id:ag.id,nome:ag.nome,login:ag.login,role:ag.role||"agente",avatar:ag.avatar}); res.json({...ag,token}); }catch(e){res.status(500).json({error:safeError(e)});} });

// ══════════════════════════════════════════════════════════════════════════════
// CANAIS
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/api/canais",               auth, adminOnly,async(req,res)=>{ try{res.json(await listarCanais());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/canais/:tipo",         auth, adminOnly,async(req,res)=>{ try{res.json(await getCanal(req.params.tipo)||{});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/canais/:tipo",         auth, adminOnly,(req,res)=>res.json(salvarCanal(req.params.tipo,req.body)));
adminRouter.post("/api/canais/:tipo/ativar", auth, adminOnly,async(req,res)=>{ try{await ativarCanal(req.params.tipo,req.body.ativo!==false);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });

adminRouter.post("/api/canais/telegram/registrar-webhook", auth, async(req,res)=>{
  const canal = await getCanal("telegram");
  if(!canal?.config?.botToken) return res.status(400).json({error:"Configure o botToken primeiro"});
  const proto="https"; const origin=`${proto}://${req.headers.host}`;
  const r = await registrarWebhookTelegram(canal.config.botToken, `${origin}/webhook/telegram`).catch(e=>({error:safeError(e)}));
  res.json(r);
});

adminRouter.get("/api/canais/telegram/status-webhook", auth, async(req,res)=>{
  try {
    const canal = await getCanal("telegram");
    if(!canal?.config?.botToken) return res.json({ok:false, error:"Bot token não configurado"});
    const info = await verificarWebhookTelegram(canal.config.botToken);
    res.json(info);
  } catch(e){ res.status(500).json({error:safeError(e)}); }
});
adminRouter.post("/api/conversas/:id/devolver-ia", auth, async(req,res)=>{ 
  try {
    await devolverParaIA(req.params.id);
    res.json({ok:true, mensagem:"Conversa devolvida para a IA"});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

// Devolver pra fila (aguardando) — remove atribuição do agente
adminRouter.post("/api/conversas/:id/fila", auth, async(req,res)=>{ 
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const { broadcast } = await import("./services/chatInterno.js");
    await dbQuery(`UPDATE conversas SET status='aguardando', agente_id=NULL, agente_nome=NULL, atualizado=NOW() WHERE id=$1`, [req.params.id]);
    await encerrarHandoff(req.params.id).catch(() => {});
    registrarAudit(req.agenteId, req.agenteNome, "devolver_fila", req.params.id, req.ip);
    broadcast("status_alterado", { convId: req.params.id, status: "aguardando" });
    res.json({ok:true, mensagem:"Conversa devolvida para a fila"});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

// Status handoff de uma conversa
adminRouter.get("/api/conversas/:id/handoff", auth, async(req,res)=>{ 
  res.json({ comHumano: estaComHumano(req.params.id) });
});

// Lista todas conversas atualmente com humano
adminRouter.get("/api/handoff/ativas", auth, (req,res)=>{ 
  res.json(listarComHumano()); 
});

// ── ENVIAR BOLETO VIA CHAT ────────────────────────────────────────────────────
adminRouter.post("/api/chat/enviar-boleto", auth, async (req, res) => {
  const { convId, canal, telefone, accountId, boleto } = req.body;
  if (!convId || !boleto) return res.status(400).json({ error: "convId e boleto obrigatórios" });
  try {
    const { waSendPix, waSendText } = await import("./services/whatsapp.js");
    const { sendMessage } = await import("./services/chatwoot.js");

    const canal_tipo = (canal || "").toLowerCase();
    const link = boleto.link_cobranca || boleto.link || "";
    const valorFmt = boleto.valor ? "R$ " + parseFloat(boleto.valor).toFixed(2).replace(".", ",") : "";
    const vencFmt = boleto.data_vencimento || "";
    // Ignora demonstrativo se tiver variáveis não resolvidas (${...})
    const demonstrativo = (boleto.descricao || "").includes("${") ? "" : (boleto.descricao || "");
    const desc = demonstrativo || ("Fatura #" + (boleto.fatura_id || boleto.numero || boleto.id));

    if (canal_tipo === "whatsapp" && telefone) {
      // Usa waSendPix que já suporta link_cobranca (botão CTA) internamente
      await waSendPix(telefone, {
        codigoPix:      boleto.pix,
        linhaDigitavel: boleto.linha,
        valor:          boleto.valor ? String(parseFloat(boleto.valor).toFixed(2)).replace(".", ",") : "",
        vencimento:     vencFmt,
        descricao:      desc,
        linkCobranca:   boleto.link_cobranca || boleto.link,
      });
    } else if (canal_tipo === "telegram" && telefone) {
      const { sendTelegram } = await import("./webhooks/telegram.js");
      const { getCanal: getC } = await import("./services/canais.js");
      const tgCfg = await getC("telegram");
      const token = tgCfg?.config?.botToken;
      if (token) {
        const msg = "💰 *" + desc + "*" + (valorFmt?"\n💵 "+valorFmt:"") + (vencFmt?"\n📅 Venc: "+vencFmt:"") + (link?"\n🔗 " + link:"");
        await sendTelegram(telefone, msg, token);
      }
    } else if (accountId && convId) {
      // Chatwoot / Widget
      const msg = "💰 " + desc + (valorFmt?" — "+valorFmt:"") + (vencFmt?" — Venc: "+vencFmt:"") + (link?"\n🔗 " + link:"");
      await sendMessage(accountId, convId, msg);
    }
    // Registra no chat interno para aparecer no painel
    const { registrarRespostaIA } = await import("./services/chatInterno.js");
    const msgRegistro = "📤 Boleto enviado: " + desc + (valorFmt ? " — " + valorFmt : "") + (vencFmt ? " | Venc: " + vencFmt : "") + (link ? "\n🔗 " + link : "");
    await registrarRespostaIA(convId, msgRegistro).catch(() => {});

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ── REATIVAÇÃO ────────────────────────────────────────────────────────────────
adminRouter.get("/api/reativacao/config", auth, adminOnly, async(req,res)=>{ try{res.json(await getReativacaoConfig());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/reativacao/config", auth, adminOnly, async(req,res)=>{ try{await salvarReativacaoConfig(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/reativacao/stats",  auth, adminOnly, async(req,res)=>{ try{res.json(await getReativacaoStats(7));}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/reativacao/ativos", auth, adminOnly, (req,res)=>{ res.json(listarReativacaoAtivos()); });


// ── MIGRATION: ATUALIZA PLANOS E CIDADES COM DADOS CORRETOS ──────────────────
adminRouter.post("/api/admin/migrar-planos", auth, adminOnly, async (req, res) => {
  try {
    const { query: q } = await import("./services/db.js");

    // ── Corrige nomes de cidades se necessário ────────────────────────────────
    await q(`UPDATE cidades SET nome='Macaíba' WHERE nome ILIKE 'macai%'`).catch(()=>{});
    await q(`UPDATE cidades SET nome='São Gonçalo do Amarante' WHERE nome ILIKE '%gonc%' OR nome ILIKE '%gon%alo%'`).catch(()=>{});

    // ── Definição completa dos planos ─────────────────────────────────────────
    const todosPlanos = [
      // Natal, Macaíba, São Gonçalo — com fidelidade, sem taxa de adesão
      { sgp_id: 12, nome: 'Essencial',     velocidade: '400', valor: 79.90,  destaque: false,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago'] },
      { sgp_id: 13, nome: 'Avançado',      velocidade: '600', valor: 99.90,  destaque: false,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Standard incluso'] },
      { sgp_id: 16, nome: 'Premium',       velocidade: '700', valor: 129.90, destaque: true,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Premium + 1 Standard','Zapping TV (+45 canais)'] },
      // Macaíba e São Gonçalo — sem fidelidade, com taxa de adesão
      { sgp_id: 12, nome: 'Essencial MAC', velocidade: '300', valor: 59.90,  destaque: false,
        beneficios: ['Sem fidelidade','Taxa de adesão: R$ 59,90 (paga na instalação)','Pós-pago','Pix / espécie / débito / crédito em até 12x'] },
      { sgp_id: 13, nome: 'Avançado MAC',  velocidade: '450', valor: 99.90,  destaque: false,
        beneficios: ['Sem fidelidade','Taxa de adesão: R$ 99,90 (paga na instalação)','Pós-pago','1 app Standard incluso','Pix / espécie / débito / crédito em até 12x'] },
      { sgp_id: 16, nome: 'Premium MAC',   velocidade: '600', valor: 119.90, destaque: true,
        beneficios: ['Sem fidelidade','Taxa de adesão: R$ 119,90 (paga na instalação)','Pós-pago','1 app Premium + 1 Standard','Zapping TV (+45 canais)','Pix / espécie / débito / crédito em até 12x'] },
      // São Miguel do Gostoso
      { sgp_id: 30, nome: 'Essencial SMG', velocidade: '200', valor: 69.90,  destaque: false,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago'] },
      { sgp_id: 29, nome: 'Avançado SMG',  velocidade: '350', valor: 99.90,  destaque: false,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Standard incluso'] },
      { sgp_id: 28, nome: 'Premium SMG',   velocidade: '500', valor: 119.90, destaque: true,
        beneficios: ['Com fidelidade','Sem taxa de adesão','Instalação gratuita','Pós-pago','1 app Premium + 1 Standard','Zapping TV (+45 canais)'] },
    ];

    const resultados = [];
    for (const p of todosPlanos) {
      // Tenta atualizar pelo nome exato
      const upd = await q(
        `UPDATE planos SET sgp_id=$1, velocidade=$3, valor=$4, beneficios=$5::jsonb, destaque=$6, ativo=true
         WHERE nome=$2 RETURNING id`,
        [p.sgp_id, p.nome, p.velocidade, p.valor, JSON.stringify(p.beneficios), p.destaque]
      );
      if (upd.rows.length > 0) {
        resultados.push({ acao: 'atualizado', nome: p.nome, id: upd.rows[0].id });
      } else {
        // INSERT novo plano
        const ins = await q(
          `INSERT INTO planos(sgp_id,nome,velocidade,unidade,valor,beneficios,destaque,ativo,ordem)
           VALUES($1,$2,$3,'Mega',$4,$5::jsonb,$6,true,
             (SELECT COALESCE(MAX(ordem),0)+1 FROM planos))
           ON CONFLICT DO NOTHING RETURNING id`,
          [p.sgp_id, p.nome, p.velocidade, p.valor, JSON.stringify(p.beneficios), p.destaque]
        );
        resultados.push({ acao: ins.rows[0] ? 'criado' : 'ja_existe', nome: p.nome, id: ins.rows[0]?.id });
      }
    }

    // ── Vínculos cidade ↔ plano ───────────────────────────────────────────────
    const cidades = (await q(`SELECT id, nome FROM cidades WHERE ativo=true`)).rows;
    const planos  = (await q(`SELECT id, nome FROM planos WHERE ativo=true`)).rows;
    const getC = (busca) => cidades.find(c => c.nome.toLowerCase().includes(busca.toLowerCase()))?.id;
    const getP = (nome)  => planos.find(p => p.nome === nome)?.id;

    const vinculos = [
      { cidade: 'Natal',        planos: ['Essencial','Avançado','Premium'] },
      { cidade: 'Macaíba',      planos: ['Essencial MAC','Avançado MAC','Premium MAC'] },
      { cidade: 'Gonçalo',      planos: ['Essencial MAC','Avançado MAC','Premium MAC'] },
      { cidade: 'Gostoso',      planos: ['Essencial SMG','Avançado SMG','Premium SMG'] },
    ];

    const vinculosRes = [];
    for (const v of vinculos) {
      const cid = getC(v.cidade);
      if (!cid) { vinculosRes.push({ cidade: v.cidade, erro: 'cidade não encontrada' }); continue; }
      for (const nomePlano of v.planos) {
        const pid = getP(nomePlano);
        if (!pid) { vinculosRes.push({ cidade: v.cidade, plano: nomePlano, erro: 'plano não encontrado' }); continue; }
        await q(`INSERT INTO cidade_planos(cidade_id,plano_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [cid, pid]);
        vinculosRes.push({ cidade: v.cidade, plano: nomePlano, ok: true });
      }
    }

    res.json({ ok: true, planos: resultados, vinculos: vinculosRes });
  } catch(e) {
    res.status(500).json({ ok: false, erro: e.message, stack: e.stack?.slice(0,400) });
  }
});

// ── MÍDIAS DO CHAT (imagens do WhatsApp) ─────────────────────────────────────
adminRouter.get("/api/chat/midia/:id", auth, async (req, res) => {
  try {
    const { getMidia } = await import("./services/chatInterno.js");
    const midia = await getMidia(req.params.id);
    if (!midia) return res.status(404).send("Não encontrado");
    const buf = Buffer.from(midia.dados, "base64");
    res.setHeader("Content-Type", midia.mime || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=604800"); // 7 dias
    res.setHeader("Content-Disposition", `inline; filename="imagem.${(midia.mime||'').split('/')[1]||'jpg'}"`);
    res.send(buf);
  } catch(e) { res.status(500).send(safeError(e)); }
});

// ── EVOLUTION API — INSTÂNCIA INTERNA ────────────────────────────────────────

// Webhook público (Evolution chama sem token)
adminRouter.post("/webhook/evolution/:instancia", async (req, res) => {
  await handleEvolutionWebhook(req, res);
});

// Listar instâncias
adminRouter.get("/api/equipe/instancias", auth, adminOnly, async (req, res) => {
  try {
    const { listarInstancias } = await import("./services/evolution.js");
    res.json(await listarInstancias());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Diagnóstico — testa várias URLs possíveis do Evolution
adminRouter.get("/api/equipe/debug", auth, adminOnly, async (req, res) => {
  const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";
  const urlsTestar = [
    process.env.EVOLUTION_URL,
    "http://evolution.citmax.com.br",
    "https://evolution.citmax.com.br",
    "http://evolution.citmax.com.br:8080",
    "https://evolution.citmax.com.br:8080",
    "http://evolution:8080",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ].filter(Boolean);

  const resultados = {};
  for (const url of urlsTestar) {
    try {
      const r = await fetch(`${url}/`, {
        headers: { "apikey": EVO_KEY },
        signal: AbortSignal.timeout(3000),
      });
      const txt = await r.text().catch(() => "");
      resultados[url] = { status: r.status, ok: r.ok, body: txt.slice(0, 200) };
    } catch(e) {
      resultados[url] = { erro: e.message };
    }
  }
  res.json({ env_url: process.env.EVOLUTION_URL || "(não definido)", resultados });
});

// Criar instância
adminRouter.post("/api/equipe/instancia", auth, adminOnly, async (req, res) => {
  try {
    const EVO_URL = process.env.EVOLUTION_URL || "https://evolution.citmax.com.br:8080";
    const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";
    const { nome } = req.body;
    if (!nome) return res.status(400).json({ error: "nome obrigatório" });

    // Chama Evolution diretamente para ter resposta raw
    const r = await fetch(`${EVO_URL}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({ instanceName: nome, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    });
    const txt = await r.text();
    logger.info(`📱 Evolution criar instância [${r.status}]: ${txt.slice(0, 300)}`);

    let data;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }

    if (!r.ok) return res.status(r.status).json({ error: `Evolution ${r.status}: ${txt.slice(0, 200)}`, raw: data });

    // Configura webhook com formato correto da v2.3.7
    const webhookUrl = `${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/webhook/evolution/${nome}`;
    
    // Aguarda 2s para instância estar pronta
    await new Promise(r => setTimeout(r, 2000));
    
    const rwRes = await fetch(`${EVO_URL}/webhook/set/${nome}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            "MESSAGES_UPSERT","MESSAGES_UPDATE",
            "SEND_MESSAGE",
            "CONNECTION_UPDATE","QRCODE_UPDATED",
            "GROUPS_UPSERT","GROUP_UPDATE","GROUP_PARTICIPANTS_UPDATE",
          ],
        }
      }),
    });
    const rwTxt = await rwRes.text();
    logger.info(`📱 Webhook set [${rwRes.status}]: ${rwTxt.slice(0, 300)}`);
    let rw;
    try { rw = JSON.parse(rwTxt); } catch { rw = { raw: rwTxt }; }

    // Salva instância na config
    const { getConfig, salvarConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    cfg.instancia = nome;
    await salvarConfig(cfg);

    res.json({ ok: true, instancia: nome, evolution: data, webhook: rw });
  } catch(e) {
    logger.error("❌ criar instância: " + e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

// Conectar / pegar QR
adminRouter.get("/api/equipe/qr/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const { getQRCode } = await import("./services/evolution.js");
    res.json(await getQRCode(req.params.instancia));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── TESTES MAXXI EQUIPE ───────────────────────────────────────────────────────

// Tags de conversa
adminRouter.put("/api/conversas/:id/tags", auth, async (req, res) => {
  try {
    const { atualizarTags } = await import("./services/chatInterno.js");
    await atualizarTags(req.params.id, req.body.tags || []);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Prioridade de conversa
adminRouter.put("/api/conversas/:id/prioridade", auth, async (req, res) => {
  try {
    const { atualizarPrioridade } = await import("./services/chatInterno.js");
    await atualizarPrioridade(req.params.id, req.body.prioridade || "normal");
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Histórico de atendimentos anteriores do cliente
adminRouter.get("/api/clientes/:telefone/historico", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`
      SELECT id, status, canal, criado_em, atualizado, agente_nome,
        jsonb_array_length(mensagens) as total_msgs,
        mensagens->-1->>'content' as ultima_msg,
        tags, prioridade
      FROM conversas
      WHERE telefone=$1
      ORDER BY criado_em DESC
      LIMIT 20
    `, [req.params.telefone]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Transferir para agente específico
adminRouter.post("/api/conversas/:id/transferir-agente", auth, async (req, res) => {
  try {
    const { agenteAssumiu } = await import("./services/handoff.js");
    const { query: dbQ } = await import("./services/db.js");
    const { agenteId } = req.body;
    if (!agenteId) return res.status(400).json({ error: "agenteId obrigatório" });
    const ag = await dbQ(`SELECT nome FROM agentes WHERE id=$1 LIMIT 1`, [agenteId]);
    if (!ag.rows.length) return res.status(404).json({ error: "Agente não encontrado" });
    await agenteAssumiu(req.params.id, agenteId, ag.rows[0].nome);
    res.json({ ok: true, agente: ag.rows[0].nome });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Indicador "digitando" via SSE broadcast
adminRouter.post("/api/conversas/:id/digitando", auth, async (req, res) => {
  try {
    const { broadcast } = await import("./services/chatInterno.js");
    broadcast("digitando", { convId: req.params.id, quem: req.body.quem || "agente", ativo: req.body.ativo !== false });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Reação em mensagem
adminRouter.post("/api/conversas/:id/reacao", auth, async (req, res) => {
  try {
    const { msgId, emoji } = req.body;
    const autor = req.user?.nome || req.user?.username || "agente";
    const { adicionarReacao } = await import("./services/chatInterno.js");
    await adicionarReacao(req.params.id, msgId, emoji, autor);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Testar número individual de agente
adminRouter.post("/api/equipe/testar-numero", auth, adminOnly, async (req, res) => {
  try {
    const { getConfig, enviarTexto } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.instancia) return res.status(400).json({ erro: "Instância não configurada em Maxxi Equipe" });

    let { numero, nome } = req.body;
    numero = String(numero).replace(/\D/g, "");
    if (!numero || numero.length < 10) return res.status(400).json({ erro: "Número inválido" });

    const msg = `✅ *Teste Maxxi Equipe*

Olá *${nome || "Agente"}*! Seu número foi cadastrado com sucesso no sistema.

Você receberá alertas e poderá conversar com a IA da equipe por aqui. 🎉`;
    await enviarTexto(cfg.instancia, numero + "@s.whatsapp.net", msg);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ erro: safeError(e) }); }
});

// Teste 1: Envia mensagem de teste para o grupo
adminRouter.post("/api/equipe/testar-envio", auth, adminOnly, async (req, res) => {
  try {
    const { getConfig, enviarTextoGrupo, enviarTexto } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.instancia) return res.status(400).json({ error: "Instância não configurada" });

    const msg = "🧪 *Teste de envio Maxxi* — " + new Date().toLocaleTimeString("pt-BR") + "\n\nSe você recebeu esta mensagem, o envio está funcionando! ✅";
    const resultados = [];

    // Envia para grupos com alertas
    for (const grupo of (cfg.grupos || []).filter(g => g.alertas)) {
      const r = await enviarTextoGrupo(cfg.instancia, grupo.id, msg).catch(e => ({ erro: e.message }));
      resultados.push({ destino: grupo.nome, tipo: "grupo", resultado: r });
    }
    // Envia para números individuais
    for (const num of (cfg.numeros || [])) {
      const r = await enviarTexto(cfg.instancia, num, msg).catch(e => ({ erro: e.message }));
      resultados.push({ destino: num, tipo: "individual", resultado: r });
    }

    if (resultados.length === 0) return res.json({ ok: false, erro: "Nenhum grupo/número configurado para receber alertas" });
    res.json({ ok: true, resultados });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Teste 2: Simula webhook chegando (testa o processamento sem depender do Evolution)
adminRouter.post("/api/equipe/testar-webhook", auth, adminOnly, async (req, res) => {
  try {
    const { getConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    const grupo = (cfg.grupos || []).find(g => g.ia);
    if (!grupo) return res.json({ ok: false, erro: "Nenhum grupo com IA ativa. Ative IA em um grupo primeiro." });

    // Simula mensagem chegando do Evolution
    const fakeReq = {
      body: {
        event: "messages.upsert",
        instance: cfg.instancia,
        data: [{
          key: { remoteJid: grupo.id, fromMe: false, id: "FAKE_" + Date.now() },
          pushName: "Teste Admin",
          message: { conversation: req.body?.texto || "/stats" },
        }]
      },
      params: { instancia: cfg.instancia },
    };

    let replied = null;
    const fakeRes = {
      sendStatus: () => {},
      json: (d) => { replied = d; },
    };

    const { handleEvolutionWebhook } = await import("./webhooks/evolution.js");
    await handleEvolutionWebhook(fakeReq, fakeRes);

    res.json({ ok: true, grupo: grupo.nome, texto_enviado: req.body?.texto || "/stats", nota: "Verifique os logs para ver o processamento" });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Teste 3: Polling manual — busca mensagens novas do Evolution diretamente
adminRouter.post("/api/equipe/polling", auth, adminOnly, async (req, res) => {
  try {
    const EVO_URL = process.env.EVOLUTION_URL || "http://evolution.citmax.com.br";
    const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";
    const { getConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.instancia) return res.json({ ok: false, erro: "Instância não configurada" });

    // Busca mensagens recentes dos grupos com IA ativa
    const resultados = [];
    for (const grupo of (cfg.grupos || []).filter(g => g.ia)) {
      const r = await fetch(`${EVO_URL}/chat/findMessages/${cfg.instancia}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
        body: JSON.stringify({ where: { key: { remoteJid: grupo.id }, fromMe: false }, limit: 5 }),
      }).then(r => r.json()).catch(e => ({ erro: e.message }));
      resultados.push({ grupo: grupo.nome, mensagens: r });
    }
    res.json({ ok: true, resultados });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Ver webhook atual da instância
adminRouter.get("/api/equipe/webhook/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const EVO_URL = process.env.EVOLUTION_URL || "http://evolution.citmax.com.br";
    const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";
    const r = await fetch(`${EVO_URL}/webhook/find/${req.params.instancia}`, {
      headers: { "apikey": EVO_KEY }
    });
    const d = await r.json().catch(() => ({}));
    res.json({ ok: true, webhook: d });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Reconfigurar webhook de instância existente
adminRouter.post("/api/equipe/webhook/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const EVO_URL = process.env.EVOLUTION_URL || "http://evolution.citmax.com.br";
    const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";
    const nome = req.params.instancia;
    const webhookUrl = `${process.env.APP_URL || "https://maxxi.citmax.com.br"}/admin/webhook/evolution/${nome}`;

    logger.info(`📱 Reconfigurando webhook: ${webhookUrl}`);

    // Evolution v2.3.7 — tenta os dois formatos de endpoint
    let d = null, rvTxt = "";
    
    // Formato v2
    const rw = await fetch(`${EVO_URL}/webhook/set/${nome}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
      body: JSON.stringify({
        webhook: {
          enabled: true,
          url: webhookUrl,
          webhookByEvents: false,
          webhookBase64: false,
          events: [
            "MESSAGES_UPSERT","MESSAGES_UPDATE",
            "SEND_MESSAGE",
            "CONNECTION_UPDATE","QRCODE_UPDATED",
            "GROUPS_UPSERT","GROUP_UPDATE","GROUP_PARTICIPANTS_UPDATE",
          ],
        }
      }),
    });
    rvTxt = await rw.text();
    logger.info(`📱 Webhook set [${rw.status}]: ${rvTxt.slice(0,300)}`);
    try { d = JSON.parse(rvTxt); } catch { d = { raw: rvTxt }; }

    // Verifica resultado
    const rv = await fetch(`${EVO_URL}/webhook/find/${nome}`, {
      headers: { "apikey": EVO_KEY },
    }).then(r => r.json()).catch(() => ({}));
    logger.info(`📱 Webhook find: ${JSON.stringify(rv).slice(0,200)}`);

    res.json({ ok: true, webhookUrl, configurado: d, atual: rv });
  } catch(e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// Status da instância
adminRouter.get("/api/equipe/status/:instancia", auth, async (req, res) => {
  try {
    const { statusInstancia } = await import("./services/evolution.js");
    res.json(await statusInstancia(req.params.instancia));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Deletar instância
adminRouter.delete("/api/equipe/instancia/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const { deletarInstancia } = await import("./services/evolution.js");
    res.json(await deletarInstancia(req.params.instancia));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Desconectar (logout)
adminRouter.post("/api/equipe/desconectar/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const { desconectarInstancia } = await import("./services/evolution.js");
    res.json(await desconectarInstancia(req.params.instancia));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Listar grupos detectados
adminRouter.get("/api/equipe/grupos/:instancia", auth, adminOnly, async (req, res) => {
  try {
    const { listarGrupos } = await import("./services/evolution.js");
    res.json(await listarGrupos(req.params.instancia));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Config equipe (alertas, grupos, thresholds)
adminRouter.get("/api/equipe/config", auth, adminOnly, async (req, res) => {
  try {
    const { getConfig } = await import("./services/evolution.js");
    res.json(await getConfig());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.put("/api/equipe/config", auth, adminOnly, async (req, res) => {
  try {
    const { salvarConfig } = await import("./services/evolution.js");
    await salvarConfig(req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Cron de alertas de fila — roda a cada 60 segundos
setInterval(async () => {
  try {
    const { verificarEDispararAlertas } = await import("./services/maxxi-equipe.js");
    await verificarEDispararAlertas();
  } catch {}
}, 60 * 1000);

// Polling de mensagens — fallback quando webhook não chega
// _processados é global e compartilhado com o webhook para evitar duplicatas
const _processados = new Set(); // evita duplicatas entre polling E webhook

// Exporta para o webhook usar o mesmo Set
global._maxxiProcessados = _processados;

setInterval(async () => {
  try {
    const { getConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.instancia) return;

    const gruposIA = (cfg.grupos || []).filter(g => g.ia);
    const EVO_URL = process.env.EVOLUTION_URL || "http://evolution.citmax.com.br";
    const EVO_KEY = process.env.EVOLUTION_KEY || "bBLO6YjF3H97evU6t572Tku7nk3pcEpz";

    // Busca agentes com WhatsApp para polling de mensagens privadas
    const { query: dbQ2 } = await import("./services/db.js");
    const agentesR = await dbQ2(`SELECT whatsapp, nome FROM agentes WHERE ativo=true AND whatsapp IS NOT NULL AND whatsapp != ''`).catch(() => ({ rows: [] }));

    // Para privado: tenta múltiplos formatos (com/sem DDI, com/sem 9 extra)
    const numerosAgentes = [];
    for (const a of agentesR.rows) {
      const base = String(a.whatsapp).replace(/\D/g, "");
      const semDDI = base.replace(/^55/, "");
      const comDDI = "55" + semDDI;
      // Sem 9: 8498727... → 84987278686 (10 dígitos DDD+8)
      const semDDIsem9 = semDDI.length === 11 && semDDI[2] === "9" ? semDDI.slice(0,2) + semDDI.slice(3) : semDDI;
      // Com 9: 8487... → 84987... (adiciona 9 se só tem 10 dígitos)
      const semDDIcom9 = semDDI.length === 10 ? semDDI.slice(0,2) + "9" + semDDI.slice(2) : semDDI;
      // Adiciona todas as variações como chats separados
      const variações = [...new Set(["55"+semDDI, "55"+semDDIsem9, "55"+semDDIcom9])];
      for (const num of variações) {
        numerosAgentes.push({ id: num + "@s.whatsapp.net", nome: a.nome + "(" + num.slice(-4) + ")" });
      }
    }
    logger.info(`📱 Polling privados: ${[...new Set(agentesR.rows.map(a=>a.nome))].join(', ')}`);

    // Junta grupos IA + privados dos agentes
    const chats = [
      ...gruposIA.map(g => ({ id: g.id.includes("@") ? g.id : g.id + "@g.us", nome: g.nome, tipo: "grupo" })),
      ...numerosAgentes.map(n => ({ id: n.id, nome: n.nome, tipo: "privado" })),
    ];

    if (!chats.length) return;

    for (const chat of chats) {
      try {
        const chatId = chat.id;

        // Tenta múltiplos endpoints da Evolution v2 até achar o correto
        let rTxt = "", rStatus = 0;
        const endpoints = [
          { method: "POST", url: `${EVO_URL}/chat/findMessages/${cfg.instancia}`,
            body: JSON.stringify({ where: { key: { remoteJid: chatId }, fromMe: false }, limit: 10 }) },
          { method: "POST", url: `${EVO_URL}/message/findMessages/${cfg.instancia}`,
            body: JSON.stringify({ remoteJid: chatId, limit: 10 }) },
          { method: "GET", url: `${EVO_URL}/chat/messages/${cfg.instancia}/${chatId}?limit=10` },
        ];
        let data = null;
        for (const ep of endpoints) {
          try {
            const r = await fetch(ep.url, {
              method: ep.method,
              headers: { "Content-Type": "application/json", "apikey": EVO_KEY },
              ...(ep.body ? { body: ep.body } : {}),
              signal: AbortSignal.timeout(4000),
            });
            rTxt = await r.text();
            rStatus = r.status;
            logger.info(`📱 Polling [${ep.method} ${ep.url.split('/').slice(-2).join('/')}] ${r.status}: ${rTxt.slice(0,200)}`);
            if (r.ok) {
              try { data = JSON.parse(rTxt); } catch {}
              break;
            }
          } catch(e) {
            logger.warn(`📱 Polling endpoint erro: ${e.message}`);
          }
        }
        if (!data) continue;

        // Evolution v2: { messages: { total, pages, records: [...] } }
        const msgs = Array.isArray(data)
          ? data
          : (data?.messages?.records || data?.records || data?.messages || data?.data || []);
        
        if (chat.tipo === "privado") {
          // Log detalhado para debug do privado
          logger.info(`📱 Polling privado [${chat.nome}] ${chat.id}: ${msgs.length} msgs | primeira: fromMe=${msgs[0]?.key?.fromMe} id=${msgs[0]?.key?.id?.slice(0,10)}`);
        } else {
          logger.info(`📱 Polling ${chat.nome} [${chat.tipo}]: ${msgs.length} mensagens`);
        }
        if (!msgs.length) continue;

        // Ordena por timestamp — mais recente primeiro
        msgs.sort((a, b) => (b?.messageTimestamp || 0) - (a?.messageTimestamp || 0));

        for (const msg of msgs) {
          const msgId = msg?.key?.id || msg?.id;
          if (!msgId || _processados.has(msgId)) continue;
          if (msg?.key?.fromMe || msg?.fromMe) continue;

          const texto = msg?.message?.conversation
            || msg?.message?.extendedTextMessage?.text
            || msg?.message?.ephemeralMessage?.message?.conversation
            || msg?.message?.ephemeralMessage?.message?.extendedTextMessage?.text
            || msg?.message?.viewOnceMessage?.message?.conversation
            || msg?.text || msg?.body || "";
          
          if (chat.tipo === "privado" && !texto.trim()) {
            logger.info(`📱 Privado sem texto: msgType=${Object.keys(msg?.message||{}).join(',')}`);
          }
          if (!texto.trim()) continue;

          // Só mensagens dos últimos 30 segundos — usa continue (não break) para não parar o loop
          const ts = (msg?.messageTimestamp || msg?.timestamp || 0) * 1000;
          const idade = Date.now() - ts;
          if (ts > 0 && idade > 30000) continue; // mensagem velha — pula esta mas verifica próxima

          // Grupo: só processa se bot foi mencionado (mentionedJid ou @numero)
          let textoFinal = texto;
          if (chat.tipo === "grupo") {
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            const { getNumeroInstancia } = await import("./services/evolution.js");
            const botJid = await getNumeroInstancia(cfg.instancia).catch(() => null);
            const foiMencionado = mentionedJids.length > 0
              || (botJid && msg.message?.extendedTextMessage?.contextInfo?.participant === botJid)
              || texto.includes("@"); // fallback
            if (!foiMencionado) {
              _processados.add(msgId); // evita reprocessar
              continue;
            }
            textoFinal = texto.replace(/@\d+/g, "").replace(/@\S+/g, "").trim();
            if (!textoFinal) { _processados.add(msgId); continue; }
          }

          logger.info(`📱 Polling ENCONTROU [${chat.nome}/${chat.tipo}]: "${textoFinal.slice(0,60)}"`);
          _processados.add(msgId);
          // Limpa set para não crescer infinito
          if (_processados.size > 500) {
            const it = _processados.values();
            for (let i = 0; i < 100; i++) _processados.delete(it.next().value);
          }

          const { processarMensagemEquipe } = await import("./services/maxxi-equipe.js");
          const { enviarTexto } = await import("./services/evolution.js");
          const resposta = await processarMensagemEquipe(cfg.instancia, chatId, msg?.pushName || "Agente", textoFinal);
          if (resposta) {
            await enviarTexto(cfg.instancia, chatId, resposta).catch(e => {
              logger.warn("⚠️ Polling enviar: " + e.message);
            });
          }
          break; // uma mensagem por grupo por ciclo
        }
      } catch(e) {
        logger.warn(`⚠️ Polling ${chat.nome}: ${e.message}`);
      }
    }
  } catch(e) {
    logger.warn("⚠️ Polling equipe: " + e.message);
  }
}, 8000);

// Verifica agentes atrasados — roda a cada 5 minutos
setInterval(async () => {
  try {
    const { verificarAgentesAtrasados } = await import("./services/notif-agentes.js");
    await verificarAgentesAtrasados();
  } catch {}
}, 5 * 60 * 1000);

// Detecta problema em área — roda a cada 10 minutos
setInterval(async () => {
  try {
    const { verificarProblemaArea } = await import("./services/notif-agentes.js");
    await verificarProblemaArea();
  } catch {}
}, 10 * 60 * 1000);

// Resumo individual — verifica a cada minuto se é hora
setInterval(async () => {
  try {
    const { getConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.resumo_individual || !cfg.resumo_individual_horario) return;
    const agora = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
    if (agora === cfg.resumo_individual_horario) {
      const { enviarResumoIndividual } = await import("./services/notif-agentes.js");
      await enviarResumoIndividual();
    }
  } catch {}
}, 60 * 1000);

// Resumo diário — verifica a cada minuto se é hora de enviar
setInterval(async () => {
  try {
    const { getConfig } = await import("./services/evolution.js");
    const cfg = await getConfig();
    if (!cfg.resumo_diario || !cfg.resumo_horario) return;
    const agora = new Date().toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" });
    if (agora === cfg.resumo_horario) {
      const { enviarResumoDiario } = await import("./services/maxxi-equipe.js");
      await enviarResumoDiario();
    }
  } catch {}
}, 60 * 1000);

// ── ENCERRAMENTO AUTOMÁTICO DE CONVERSAS PARADAS ────────────────────────────
// Roda a cada 15 minutos verificando conversas que ultrapassaram o limite
setInterval(async () => {
  try {
    const { getConfig } = await import("./services/reativacao.js");
    const cfg = await getConfig();
    if (!cfg.encerrar_ativo) return;

    const horasLimit = cfg.encerrar_conversa_horas ?? 24;
    const tsLimit = Date.now() - horasLimit * 3600000;

    // Status encerráveis:
    // 'ia'         → só bot, cliente sumiu → encerra SEMPRE
    // 'aguardando' → cliente esperando agente humano → só encerra se toggle ativo (padrão: NÃO)
    // 'ativa'      → agente humano ativo → NUNCA encerra
    const incluiAguardando = cfg.encerrar_aguardando_agente === true; // padrão: false
    const statusFiltro = incluiAguardando
      ? "('ia','aguardando')"
      : "('ia')";
    const r = await query(
      `SELECT id, telefone, canal, agente_id, nome FROM conversas
       WHERE status IN ${statusFiltro} AND ultima_msg < $1 AND ultima_msg > 0`,
      [tsLimit]
    );

    for (const conv of r.rows) {
      try {
        // Encerra no banco
        await query(
          `UPDATE conversas SET status='encerrada', atualizado=NOW() WHERE id=$1`,
          [conv.id]
        );
        // Reseta sessão da IA
        const { salvarSessao, getSessao } = await import("./services/memoria.js");
        const sess = await getSessao(conv.telefone) || {};
        await salvarSessao(conv.telefone, {
          ...sess, _estado: "inicio", _cadastro: null,
          _protocolo: null, _lastActivity: null,
        });
        logger.info(`🔒 Conv ${conv.id} encerrada automaticamente (>${horasLimit}h inativa)`);
        broadcast("status_alterado", { convId: conv.id, status: "encerrada" });
      } catch(e) {
        logger.warn(`⚠️ Erro ao encerrar conv ${conv.id}: ${e.message}`);
      }
    }
    if (r.rows.length > 0) logger.info(`🔒 ${r.rows.length} conversa(s) encerrada(s) por inatividade`);
  } catch {}
}, 15 * 60 * 1000); // a cada 15 minutos

// ── NPS ───────────────────────────────────────────────────────────────────────
adminRouter.get("/api/nps/config",  auth, adminOnly, async(req,res)=>{ try{res.json(await getNPSConfig());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/nps/config",  auth, adminOnly, async(req,res)=>{ try{await salvarNPSConfig(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/nps/stats",   auth, adminOnly, async(req,res)=>{ try{res.json(await getEstatisticasNPS(parseInt(req.query.dias)||30));}catch(e){res.status(500).json({error:safeError(e)});} });

// ── ALERTAS MASSIVOS ──────────────────────────────────────────────────────────
adminRouter.get("/api/alertas/config",   auth, adminOnly, async(req,res)=>{ try{res.json(await getAlertasConfig());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/alertas/config",   auth, adminOnly, async(req,res)=>{ try{await salvarAlertasConfig(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/alertas/historico",auth, adminOnly, async(req,res)=>{ try{res.json(await getHistoricoAlertas());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/alertas/status",   auth, (req,res)=>{ res.json(getStatusJanela()); });

adminRouter.get("/api/canais/webhooks/urls", auth,(req,res)=>{
  const proto=req.headers["x-forwarded-proto"]||"http"; const origin=`${proto}://${req.headers.host}`;
  res.json({ chatwoot:`${origin}/webhook`, telegram:`${origin}/webhook/telegram`, whatsapp:`${origin}/webhook/whatsapp`,
    instagram:`${origin}/webhook/instagram`, facebook:`${origin}/webhook/facebook`,
    widget:`${origin}/widget`, widgetEmbed:`<script src="${origin}/widget/embed.js"></script>` });
});

// ══════════════════════════════════════════════════════════════════════════════
// CRM — Respostas Rápidas, Horários, Saudações, SLA, Pesquisa
// ══════════════════════════════════════════════════════════════════════════════
adminRouter.get("/api/respostas-rapidas",        auth,async(req,res)=>{ try{res.json(await listarRespostasRapidas());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.post("/api/respostas-rapidas",       auth,(req,res)=>res.json(salvarRespostaRapida(req.body)));
adminRouter.delete("/api/respostas-rapidas/:id", auth,(req,res)=>{ removerRespostaRapida(req.params.id); res.json({ok:true}); });

// Config fora do horário
adminRouter.get("/api/horarios/fora", auth, async (req, res) => {
  try {
    const { getCfg } = await import("./services/crm.js");
    res.json((await getCfg("horario_fora")) || {});
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.put("/api/horarios/fora", auth, adminOnly, async (req, res) => {
  try {
    const { setCfg } = await import("./services/crm.js");
    await setCfg("horario_fora", req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/horarios",   auth,async(req,res)=>{ try{res.json(await getHorarios());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/horarios",   auth,async(req,res)=>{ try{await salvarHorarios(req.body); registrarAudit(req.agenteId,req.agenteNome,"editar_horarios","",req.ip); res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });

adminRouter.get("/api/saudacoes",  auth,async(req,res)=>{ try{res.json(await getSaudacoes());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/saudacoes",  auth,async(req,res)=>{ try{await salvarSaudacoes(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });

adminRouter.get("/api/sla",        auth,async(req,res)=>{ try{res.json(await getSla());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/sla",        auth,async(req,res)=>{ try{await salvarSla(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/sla/alertas",auth,async(req,res)=>{ try{const sla=await getSla();res.json(await getConversasForaDeSla((sla.alertaMinutos)||5));}catch(e){res.status(500).json({error:safeError(e)});} });

adminRouter.get("/api/pesquisa",       auth,async(req,res)=>{ try{res.json(await getPesquisa());}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.put("/api/pesquisa",       auth,async(req,res)=>{ try{await salvarPesquisa(req.body);res.json({ok:true});}catch(e){res.status(500).json({error:safeError(e)});} });
adminRouter.get("/api/pesquisa/stats", auth,async(req,res)=>{ try{res.json(await getEstatisticasPesquisa());}catch(e){res.status(500).json({error:safeError(e)});} });


// Debug: ver estrutura raw do SGP para ocorrencias (admin only)
adminRouter.get("/api/debug/ocorrencias-raw", auth, adminOnly, async (req, res) => {
  try {
    const raw = await listarOcorrencias();
    const sample = Array.isArray(raw) ? raw.slice(0, 3) : raw;
    res.json({ total: Array.isArray(raw) ? raw.length : "?", sample });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// ── SGP WEBHOOK INFO ─────────────────────────────────────────────────────────
adminRouter.get("/api/sgp/webhook-url", auth, adminOnly, (req, res) => {
  const base = process.env.APP_URL || `https://${req.headers.host}`;
  const secret = process.env.SGP_WEBHOOK_SECRET || "";
  res.json({
    url: `${base}/webhook/sgp`,
    instrucoes: "Configure no SGP em: Sistema > Gateways > Gateway Outros > Adicionar Gateway Genérico",
    json_config: secret
      ? JSON.stringify({ url: `${base}/webhook/sgp`, body: { sgp_secret: secret } })
      : JSON.stringify({ url: `${base}/webhook/sgp` }),
    acoes_suportadas: ["cadastrar", "atualizar", "alterar_plano", "alterar_status"],
    obs: "Quando contrato muda para ATIVO, o lead é fechado automaticamente no painel",
  });
});

// ── DASHBOARD DO AGENTE ───────────────────────────────────────────────────────

adminRouter.get("/api/agente/ocorrencias", auth, async (req, res) => {
  try {
    const todas = await listarOcorrencias();
    const agora = Date.now();
    const abertas = todas
      .filter(o => { const s=(o.status||"").toLowerCase(); return s==="aberto"||s==="open"||s==="em aberto"||s==="1"||s==="pendente"; })
      .map(o => {
        const dt = o.data_abertura||o.created_at||o.data||null;
        const d  = dt ? Math.floor((agora-new Date(dt).getTime())/86400000) : 0;
        return { id:o.id, protocolo:o.protocolo||o.id, tipo:o.ocorrenciatipo_nome||o.tipo||"",
          status:o.status, descricao:(o.descricao||o.conteudo||"").slice(0,120),
          cliente:o.cliente_nome||o.cliente||"", contrato:o.clientecontrato_id||o.contrato||"",
          data_abertura:dt, dias_aberto:d, alerta:d>7?"critico":d>3?"atencao":"ok" };
      })
      .sort((a,b)=>b.dias_aberto-a.dias_aberto);
    res.json({ total:abertas.length, ocorrencias:abertas });
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

adminRouter.get("/api/agente/leads", auth, async (req, res) => {
  try {
    const { query: dbq } = await import("./services/db.js");
    const agora = Date.now();
    const dbLeads = await dbq(`SELECT * FROM leads WHERE status='aberto' ORDER BY criado_em DESC LIMIT 100`);
    let sgpLeads = [];
    try {
      const todas = await listarOcorrencias();
      sgpLeads = todas
        .filter(o => {
          // Filtra por ID 201 (Instalação) OU por nome como fallback
          const tipoId = o.ocorrenciatipo_id || o.tipo_id || null;
          const tipoNome = (o.ocorrenciatipo_nome||o.tipo||"").toLowerCase();
          const st = (o.status||"").toLowerCase();
          const ehInstalacao = tipoId === 201 || tipoId === "201" || tipoNome.includes("instala");
          const aberto = st==="aberto"||st==="open"||st==="em aberto"||st==="1"||st==="ativo"||st==="pendente";
          return ehInstalacao && aberto;
        })
        .map(o => {
          const dt=o.data_abertura||o.created_at||o.data||null;
          const d=dt?Math.floor((agora-new Date(dt).getTime())/86400000):0;
          return { origem:"sgp", id:"sgp_"+o.id, protocolo:o.protocolo||o.id,
            nome:o.cliente_nome||o.cliente||"", contrato:o.clientecontrato_id||"",
            tipo:o.ocorrenciatipo_nome||o.tipo, data_abertura:dt, dias_aberto:d,
            alerta:d>7?"critico":d>3?"atencao":"ok" };
        });
    } catch {}
    const localIds = new Set(dbLeads.rows.map(r=>r.ocorrencia_id).filter(Boolean));
    const sgpExtra = sgpLeads.filter(l=>!localIds.has(String(l.protocolo)));
    const local = dbLeads.rows.map(r => {
      const d=Math.floor((agora-new Date(r.criado_em).getTime())/86400000);
      return { origem:"local",id:r.id,nome:r.nome,cpf:r.cpf,telefone:r.telefone,
        cidade:r.cidade,plano_id:r.plano_id,contrato_id:r.contrato_id,
        ocorrencia_id:r.ocorrencia_id,agente_nome:r.agente_nome,canal:r.canal,
        data_abertura:r.criado_em,dias_aberto:d,alerta:d>7?"critico":d>3?"atencao":"ok",obs:r.obs };
    });
    res.json({ total:local.length+sgpExtra.length,
      leads:[...local,...sgpExtra].sort((a,b)=>b.dias_aberto-a.dias_aberto) });
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

adminRouter.get("/api/agente/kpis", auth, async (req, res) => {
  try {
    const { query: dbq } = await import("./services/db.js");
    const aid=req.agenteId;
    const hoje=new Date(); hoje.setHours(0,0,0,0);
    const semana=new Date(hoje); semana.setDate(semana.getDate()-7);
    const [kH,kS,kF] = await Promise.all([
      dbq(`SELECT COUNT(*) FROM conversas WHERE agente_id=$1 AND atualizado>=$2`,[aid,hoje.toISOString()]),
      dbq(`SELECT COUNT(*) FROM conversas WHERE agente_id=$1 AND atualizado>=$2`,[aid,semana.toISOString()]),
      dbq(`SELECT COUNT(*) FROM conversas WHERE status='aguardando'`),
    ]);
    res.json({ atendimentos_hoje:+kH.rows[0].count, atendimentos_semana:+kS.rows[0].count, fila_aguardando:+kF.rows[0].count });
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

adminRouter.post("/api/agente/leads", auth, async (req, res) => {
  try {
    const { query: dbq } = await import("./services/db.js");
    const { nome, cpf, telefone, email, cidade, plano_id, contrato_id, ocorrencia_id, canal, obs } = req.body;
    if (!nome) return res.status(400).json({error:"nome obrigatorio"});
    await dbq(
      `INSERT INTO leads(nome,cpf,telefone,email,cidade,plano_id,contrato_id,ocorrencia_id,agente_id,agente_nome,canal,obs) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [nome,cpf,telefone,email,cidade,plano_id,contrato_id,ocorrencia_id,req.agenteId,req.agenteNome,canal,obs]
    );
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

adminRouter.patch("/api/agente/leads/:id", auth, async (req, res) => {
  try {
    const { query: dbq } = await import("./services/db.js");
    await dbq(`UPDATE leads SET status=$1, obs=COALESCE($2,obs), atualizado=NOW() WHERE id=$3`,
      [req.body.status||"fechado", req.body.obs, req.params.id]);
    res.json({ok:true});
  } catch(e) { res.status(500).json({error:safeError(e)}); }
});

// ── AÇÕES SGP DO AGENTE ───────────────────────────────────────────────────────

// Fechar ocorrência no SGP
adminRouter.post("/api/sgp/ocorrencia/:id/fechar", auth, async (req, res) => {
  try {
    const { conteudo } = req.body;
    const msg = conteudo || `Ocorrência encerrada pelo agente ${req.agenteNome || req.agenteId}`;
    const raw = await fecharOcorrencia(req.params.id, msg);
    res.json({ ok: true, raw });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// Adicionar nota em ocorrência
adminRouter.post("/api/sgp/ocorrencia/:id/nota", auth, async (req, res) => {
  try {
    const { conteudo } = req.body;
    if (!conteudo) return res.status(400).json({error:"conteudo obrigatorio"});
    const raw = await notaOcorrencia(req.params.id, conteudo);
    res.json({ ok: true, raw });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// Listar tipos de ocorrência (busca dos dados existentes)
// ══════════════════════════════════════════════════════════════════════
// TIPOS DE OCORRÊNCIA — CRUD (configurável no painel)
// ══════════════════════════════════════════════════════════════════════
adminRouter.get("/api/ocorrencia-tipos", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT * FROM ocorrencia_tipos ORDER BY ordem, nome`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/ocorrencia-tipos", auth, adminOnly, async (req, res) => {
  try {
    const { sgp_id, nome, descricao, keywords, ativo, ordem } = req.body;
    if (!sgp_id || !nome) return res.status(400).json({ error: "sgp_id e nome obrigatórios" });
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(
      `INSERT INTO ocorrencia_tipos(sgp_id,nome,descricao,keywords,ativo,ordem) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [Number(sgp_id), nome, descricao || '', keywords || '', ativo !== false, Number(ordem) || 0]
    );
    registrarAudit(req.agenteId, req.agenteNome, "criar_tipo_ocorrencia", `${sgp_id} - ${nome}`, req.ip);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/ocorrencia-tipos/:id", auth, adminOnly, async (req, res) => {
  try {
    const { sgp_id, nome, descricao, keywords, ativo, ordem } = req.body;
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(
      `UPDATE ocorrencia_tipos SET sgp_id=$2, nome=$3, descricao=$4, keywords=$5, ativo=$6, ordem=$7 WHERE id=$1`,
      [req.params.id, Number(sgp_id), nome, descricao || '', keywords || '', ativo !== false, Number(ordem) || 0]
    );
    registrarAudit(req.agenteId, req.agenteNome, "editar_tipo_ocorrencia", `${sgp_id} - ${nome}`, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/ocorrencia-tipos/:id", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`DELETE FROM ocorrencia_tipos WHERE id=$1`, [req.params.id]);
    registrarAudit(req.agenteId, req.agenteNome, "remover_tipo_ocorrencia", req.params.id, req.ip);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Compat: rota antiga /api/sgp/ocorrencia-tipos redireciona pro novo
adminRouter.get("/api/sgp/ocorrencia-tipos", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT sgp_id as id, nome FROM ocorrencia_tipos WHERE ativo=true ORDER BY ordem`);
    res.json({ tipos: r.rows, fonte: "banco" });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Listar planos SGP (para montar proposta ao lead)
adminRouter.get("/api/sgp/planos", auth, async (req, res) => {
  try {
    const raw = await listarPlanos();
    const planos = Array.isArray(raw) ? raw : (raw?.planos || raw?.results || []);
    res.json({ total: planos.length, planos });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// Busca rápida de cliente (nome, cpf ou contrato)
adminRouter.get("/api/sgp/buscar", auth, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 3) return res.status(400).json({error:"busca muito curta (minimo 3 chars)"});
    const filtro = /^\d+$/.test(q.replace(/\D/g,"")) && q.replace(/\D/g,"").length >= 11
      ? { cpf: q }
      : /^\d+$/.test(q) && q.length <= 8
        ? { contrato: q }
        : { nome: q };
    const raw = await buscarCliente(filtro);
    const clientes = raw?.clientes || (Array.isArray(raw) ? raw : []);
    res.json({ total: clientes.length, clientes: clientes.slice(0,10) });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// ══════════════════════════════════════════════════════════════════════
// CIDADES & PLANOS — configuráveis no painel
// ══════════════════════════════════════════════════════════════════════
adminRouter.get("/api/cidades", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT * FROM cidades ORDER BY ordem, nome`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/cidades", auth, adminOnly, async (req, res) => {
  try {
    const { nome, uf, pop_id, portador_id, lat, lng, ativo, ordem } = req.body;
    if (!nome) return res.status(400).json({ error: "nome obrigatório" });
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`INSERT INTO cidades(nome,uf,pop_id,portador_id,lat,lng,ativo,ordem) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [nome, uf||'RN', pop_id||null, portador_id||null, lat||null, lng||null, ativo!==false, ordem||0]);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/cidades/:id", auth, adminOnly, async (req, res) => {
  try {
    const { nome, uf, pop_id, portador_id, lat, lng, ativo, ordem } = req.body;
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`UPDATE cidades SET nome=$2,uf=$3,pop_id=$4,portador_id=$5,lat=$6,lng=$7,ativo=$8,ordem=$9 WHERE id=$1`,
      [req.params.id, nome, uf||'RN', pop_id||null, portador_id||null, lat||null, lng||null, ativo!==false, ordem||0]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/cidades/:id", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`DELETE FROM cidades WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/planos", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT p.id, p.sgp_id, p.nome, p.velocidade, p.unidade, p.valor, p.beneficios, p.destaque, p.ativo, p.ordem, p.criado_em,
      COALESCE(json_agg(json_build_object('cidade_id',cp.cidade_id,'cidade_nome',c.nome,'ativo',cp.ativo)) FILTER (WHERE cp.id IS NOT NULL), '[]') as cidades
      FROM planos p LEFT JOIN cidade_planos cp ON cp.plano_id=p.id LEFT JOIN cidades c ON c.id=cp.cidade_id
      GROUP BY p.id, p.sgp_id, p.nome, p.velocidade, p.unidade, p.valor, p.beneficios, p.destaque, p.ativo, p.ordem, p.criado_em
      ORDER BY p.ordem, p.nome`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/planos", auth, adminOnly, async (req, res) => {
  try {
    const { sgp_id, nome, velocidade, unidade, valor, beneficios, destaque, ativo, ordem, cidades } = req.body;
    if (!sgp_id || !nome || !velocidade) return res.status(400).json({ error: "ID ERP, nome e velocidade obrigatórios" });
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`INSERT INTO planos(sgp_id,nome,velocidade,unidade,valor,beneficios,destaque,ativo,ordem) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9) RETURNING *`,
      [sgp_id, nome, velocidade, unidade||'Mega', valor||0, JSON.stringify(beneficios||[]), destaque||false, ativo!==false, ordem||0]);
    const planoId = r.rows[0].id;
    if (Array.isArray(cidades)) {
      for (const c of cidades) {
        if (c.cidade_id) {
          await dbQuery(`INSERT INTO cidade_planos(cidade_id,plano_id) VALUES($1,$2) ON CONFLICT(cidade_id,plano_id) DO NOTHING`, [c.cidade_id, planoId]);
        }
      }
    }
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/planos/:id", auth, adminOnly, async (req, res) => {
  try {
    const { sgp_id, nome, velocidade, unidade, valor, beneficios, destaque, ativo, ordem, cidades } = req.body;
    const sgpNum  = parseInt(String(sgp_id ?? ''), 10);
    const planoId = parseInt(req.params.id, 10);
    if (!sgpNum || isNaN(sgpNum)) return res.status(400).json({ error: "ID ERP (sgp_id) inv\u00e1lido ou ausente" });
    if (!nome || !velocidade) return res.status(400).json({ error: "Nome e velocidade s\u00e3o obrigat\u00f3rios" });
    const { query: dbQuery } = await import("./services/db.js");
    const upd = await dbQuery(
      `UPDATE planos SET sgp_id=$2,nome=$3,velocidade=$4,unidade=$5,valor=$6,beneficios=$7::jsonb,destaque=$8,ativo=$9,ordem=$10 WHERE id=$1 RETURNING *`,
      [planoId, sgpNum, nome, String(velocidade), unidade||'Mega', Number(valor)||0, JSON.stringify(beneficios||[]), !!destaque, ativo!==false, Number(ordem)||0]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: "Plano n\u00e3o encontrado" });
    if (Array.isArray(cidades)) {
      await dbQuery(`DELETE FROM cidade_planos WHERE plano_id=$1`, [planoId]);
      for (const c of cidades) {
        const cid = parseInt(String(c.cidade_id ?? ''), 10);
        if (cid) await dbQuery(`INSERT INTO cidade_planos(cidade_id,plano_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [cid, planoId]);
      }
    }
    res.json({ ok: true, plano: upd.rows[0] });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/planos/:id", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`DELETE FROM planos WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});


// ══════════════════════════════════════════════════════════════════════════════
// COBERTURA — Zonas geográficas + Geocodificação
// ══════════════════════════════════════════════════════════════════════════════

// ── LIST zonas ────────────────────────────────────────────────────────────────
adminRouter.get("/api/zonas", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`
      SELECT z.id, z.nome, z.cidade_id, z.geojson, z.cor, z.tipo, z.descricao, z.ativo, z.criado_em,
        c.nome as cidade_nome,
        COALESCE(json_agg(json_build_object('plano_id',zp.plano_id,'nome',p.nome,'velocidade',p.velocidade,'valor',p.valor))
          FILTER (WHERE zp.plano_id IS NOT NULL), '[]') as planos
      FROM zonas_cobertura z
      LEFT JOIN cidades c ON c.id = z.cidade_id
      LEFT JOIN zona_planos zp ON zp.zona_id = z.id
      LEFT JOIN planos p ON p.id = zp.plano_id
      GROUP BY z.id, c.nome ORDER BY z.id
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── CREATE zona ───────────────────────────────────────────────────────────────
adminRouter.post("/api/zonas", auth, adminOnly, async (req, res) => {
  try {
    const { nome, cidade_id, geojson, cor, tipo, descricao, ativo, planos } = req.body;
    if (!nome) return res.status(400).json({ error: "Nome obrigatório" });
    if (!geojson) return res.status(400).json({ error: "GeoJSON obrigatório" });
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(
      `INSERT INTO zonas_cobertura(nome,cidade_id,geojson,cor,tipo,descricao,ativo)
       VALUES($1,$2,$3::jsonb,$4,$5,$6,$7) RETURNING *`,
      [nome, cidade_id||null, JSON.stringify(geojson), cor||'#00c896', tipo||'cobertura', descricao||'', ativo!==false]
    );
    const zonaId = r.rows[0].id;
    if (Array.isArray(planos)) {
      for (const pid of planos) {
        const p = parseInt(pid, 10);
        if (p) await dbQuery(`INSERT INTO zona_planos(zona_id,plano_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [zonaId, p]);
      }
    }
    const { invalidarCacheZonas } = await import("./services/cobertura.js");
    invalidarCacheZonas();
    res.json({ ok: true, zona: r.rows[0] });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── UPDATE zona ───────────────────────────────────────────────────────────────
adminRouter.put("/api/zonas/:id", auth, adminOnly, async (req, res) => {
  try {
    const { nome, cidade_id, geojson, cor, tipo, descricao, ativo, planos } = req.body;
    const zonaId = parseInt(req.params.id, 10);
    if (!nome) return res.status(400).json({ error: "Nome obrigatório" });
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(
      `UPDATE zonas_cobertura SET nome=$2,cidade_id=$3,geojson=$4::jsonb,cor=$5,tipo=$6,descricao=$7,ativo=$8,atualizado=NOW() WHERE id=$1`,
      [zonaId, nome, cidade_id||null, JSON.stringify(geojson), cor||'#00c896', tipo||'cobertura', descricao||'', ativo!==false]
    );
    if (Array.isArray(planos)) {
      await dbQuery(`DELETE FROM zona_planos WHERE zona_id=$1`, [zonaId]);
      for (const pid of planos) {
        const p = parseInt(pid, 10);
        if (p) await dbQuery(`INSERT INTO zona_planos(zona_id,plano_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [zonaId, p]);
      }
    }
    const { invalidarCacheZonas } = await import("./services/cobertura.js");
    invalidarCacheZonas();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── DELETE zona ───────────────────────────────────────────────────────────────
adminRouter.delete("/api/zonas/:id", auth, adminOnly, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`DELETE FROM zonas_cobertura WHERE id=$1`, [req.params.id]);
    const { invalidarCacheZonas } = await import("./services/cobertura.js");
    invalidarCacheZonas();
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── IMPORT KMZ/KML ────────────────────────────────────────────────────────────
adminRouter.post("/api/zonas/import-kmz", auth, adminOnly, async (req, res) => {
  try {
    const { kmlParaGeoJSON, kmzParaGeoJSON } = await import("./services/cobertura.js");
    const { nome_prefixo, cidade_id, cor } = req.body;

    // Recebe base64 do arquivo
    const { arquivo, tipo_arquivo } = req.body;
    if (!arquivo) return res.status(400).json({ error: "Arquivo não enviado" });

    const buffer = Buffer.from(arquivo, "base64");
    let geojson;
    if (tipo_arquivo === "kml") {
      geojson = kmlParaGeoJSON(buffer.toString("utf8"));
    } else {
      geojson = await kmzParaGeoJSON(buffer);
    }

    if (!geojson?.features?.length) {
      return res.status(400).json({ error: "Nenhum polígono encontrado no arquivo" });
    }

    const { query: dbQuery } = await import("./services/db.js");
    const criadas = [];
    for (const feat of geojson.features) {
      const nomeFeat = feat.properties?.name || feat.properties?.Nome || "Zona importada";
      const nomeZona = nome_prefixo ? `${nome_prefixo} — ${nomeFeat}` : nomeFeat;
      const featGeoJSON = { type: "FeatureCollection", features: [feat] };
      const r = await dbQuery(
        `INSERT INTO zonas_cobertura(nome,cidade_id,geojson,cor) VALUES($1,$2,$3::jsonb,$4) RETURNING id,nome`,
        [nomeZona, cidade_id||null, JSON.stringify(featGeoJSON), cor||'#00c896']
      );
      criadas.push(r.rows[0]);
    }

    const { invalidarCacheZonas } = await import("./services/cobertura.js");
    invalidarCacheZonas();
    res.json({ ok: true, criadas, total: criadas.length });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── LOG de consultas ──────────────────────────────────────────────────────────
adminRouter.get("/api/zonas/consultas", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const dias = parseInt(req.query.dias, 10) || 30;
    const r = await dbQuery(`
      SELECT cc.*, z.nome as zona_nome
      FROM consultas_cobertura cc
      LEFT JOIN zonas_cobertura z ON z.id = cc.zona_id
      WHERE cc.criado_em > NOW() - ($1 || ' days')::interval
      ORDER BY cc.criado_em DESC LIMIT 500
    `, [dias]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── GeoJSON público (sem auth) — para o mapa na landing page ─────────────────
adminRouter.get("/api/public/cobertura", async (_req, res) => {
  try {
    const { carregarZonas } = await import("./services/cobertura.js");
    const zonas = await carregarZonas();
    const features = zonas.flatMap(z => {
      let g = z.geojson;
      if (typeof g === "string") { try { g = JSON.parse(g); } catch { return []; } }
      const feats = g?.type === "FeatureCollection" ? g.features : [g];
      return feats.map(f => ({
        ...f,
        properties: { ...f.properties, zona_id: z.id, nome: z.nome, cor: z.cor, cidade: z.cidade_nome },
      }));
    });
    res.json({ type: "FeatureCollection", features });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── CHECK por lat/lng (sem auth) ──────────────────────────────────────────────
adminRouter.get("/api/public/cobertura/check", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (isNaN(lat) || isNaN(lng)) return res.status(400).json({ error: "lat e lng obrigatórios" });
    const { verificarCobertura } = await import("./services/cobertura.js");
    res.json(await verificarCobertura(lat, lng));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── CHECK por CEP (sem auth) ──────────────────────────────────────────────────
adminRouter.get("/api/public/cep/:cep", async (req, res) => {
  try {
    const { geocodificarCEP } = await import("./services/cobertura.js");
    const dados = await geocodificarCEP(req.params.cep);
    if (!dados) return res.status(404).json({ error: "CEP não encontrado" });
    res.json(dados);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── CHECK por endereço (sem auth) ─────────────────────────────────────────────
adminRouter.get("/api/public/geocode", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Parâmetro q obrigatório" });
    const { geocodificarEndereco } = await import("./services/cobertura.js");
    const results = await geocodificarEndereco(q);
    res.json(results || []);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── CHECK completo por endereço + cobertura (sem auth) ────────────────────────
adminRouter.get("/api/public/cobertura/endereco", async (req, res) => {
  try {
    const q = req.query.q;
    const cep = req.query.cep;
    if (!q && !cep) return res.status(400).json({ error: "q ou cep obrigatório" });
    const { consultarPorEndereco, consultarPorCEP } = await import("./services/cobertura.js");
    const result = cep ? await consultarPorCEP(cep) : await consultarPorEndereco(q);
    res.json(result);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});


// ── REIMPORTAR GeoJSON de cobertura do site ───────────────────────────────────
adminRouter.post("/api/zonas/import-geojson-url", auth, adminOnly, async (req, res) => {
  try {
    const url = req.body?.url || "https://citmax.com.br/cobertura/mapa.geojson";
    const { query: dbQuery } = await import("./services/db.js");
    const { invalidarCacheZonas } = await import("./services/cobertura.js");

    const r = await fetch(url, {
      headers: { "User-Agent": "CITmax-Maxxi/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return res.status(400).json({ error: `HTTP ${r.status} ao buscar ${url}` });

    const geojson = await r.json();
    const features = geojson?.features || (geojson?.type === "Feature" ? [geojson] : []);
    if (!features.length) return res.status(400).json({ error: "Nenhuma feature encontrada no GeoJSON" });

    const cidade_id = req.body?.cidade_id || null;
    const cor = req.body?.cor || "#00c896";
    const tipo = req.body?.tipo || "cobertura";
    const substituir = req.body?.substituir === true;

    if (substituir) {
      await dbQuery(`DELETE FROM zonas_cobertura WHERE descricao LIKE '%citmax.com.br/cobertura%'`);
    }

    const criadas = [];
    for (const feat of features) {
      const nome = feat.properties?.name || feat.properties?.Nome || feat.properties?.nome || "Cobertura CITmax";
      const gj = { type: "FeatureCollection", features: [feat] };
      const ins = await dbQuery(
        `INSERT INTO zonas_cobertura(nome, cidade_id, geojson, cor, tipo, descricao, ativo)
         VALUES($1, $2, $3::jsonb, $4, $5, $6, true) RETURNING id, nome`,
        [nome, cidade_id, JSON.stringify(gj), cor, tipo,
         `Importado de ${url} em ${new Date().toLocaleDateString("pt-BR")}`]
      );
      criadas.push(ins.rows[0]);
    }

    invalidarCacheZonas();
    res.json({ ok: true, total: criadas.length, criadas });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// LEADS — Cadastro de novos clientes
// ══════════════════════════════════════════════════════════════════════
adminRouter.get("/api/sgp/vencimentos", auth, async (req, res) => {
  try {
    const { listarVencimentos } = await import("./services/erp.js");
    const raw = await listarVencimentos();
    res.json(raw);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/leads", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT * FROM leads ORDER BY criado_em DESC LIMIT 200`);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/leads", auth, async (req, res) => {
  try {
    const d = req.body;
    if (!d.nome || !d.cpf || !d.celular || !d.cidade || !d.plano_id) {
      return res.status(400).json({ error: "Campos obrigatórios: nome, cpf, celular, cidade, plano_id" });
    }
    // 1. Envia pro ERP SGP
    let erpResult = null;
    try {
      const { cadastrarCliente: cadastrarERP } = await import("./services/erp.js");
      erpResult = await cadastrarERP(d);
    } catch (e) { erpResult = { erro: e.message }; }

    // 2. Salva localmente
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(
      `INSERT INTO leads(cpf,nome,telefone,email,cidade,plano_id,datanasc,logradouro,numero,complemento,bairro,pontoreferencia,vencimento_id,pop_id,portador_id,status,canal,agente_id,agente_nome,erp_response,obs)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
      [
        d.cpf?.replace(/\D/g,''), d.nome, d.celular?.replace(/\D/g,''), d.email || '',
        d.cidade, String(d.plano_id), d.datanasc || '', d.logradouro || '', d.numero || '',
        d.complemento || '', d.bairro || '', d.pontoreferencia || '',
        String(d.vencimento_id || ''), String(d.pop_id || ''), String(d.portador_id || ''),
        erpResult?.erro ? 'erro_erp' : 'cadastrado', 'painel',
        req.agenteId || 'admin', req.agenteNome || 'Admin',
        JSON.stringify(erpResult), d.obs || 'Cadastro via painel'
      ]
    );
    registrarAudit(req.agenteId, req.agenteNome, "cadastrar_lead", `${d.nome} - ${d.cpf}`, req.ip);
    res.json({ ok: true, lead: r.rows[0], erp: erpResult });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Verificar conexão de um contrato (para diagnóstico rápido)
adminRouter.get("/api/sgp/conexao/:contrato", auth, async (req, res) => {
  try {
    const raw = await verificarConexao(req.params.contrato);
    res.json(raw);
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// Liberar/ativar contrato (status=1)
adminRouter.post("/api/sgp/contrato/:id/liberar", auth, async (req, res) => {
  try {
    const { sgpPostRaw } = await import("./services/erp.js");
    const SGP_URL = process.env.SGP_URL || "https://citrn.sgp.net.br";
    const SGP_APP = process.env.SGP_APP || "n8n";
    const SGP_TOKEN = process.env.SGP_TOKEN || "";
    const raw = await fetch(`${SGP_URL}/api/ura/contrato/status/edit/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app: SGP_APP, token: SGP_TOKEN, contrato: String(req.params.id), status: 1 }),
    }).then(r => r.json());
    registrarAudit(req.agenteId, req.agenteNome, "liberar_contrato", `Contrato #${req.params.id}`, req.ip);
    res.json({ ok: true, raw });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/sgp/contrato/:id/promessa", auth, async (req, res) => {
  try {
    const { promessaPagamento } = await import("./services/erp.js");
    const resultado = await promessaPagamento(req.params.id);
    registrarAudit(req.agenteId, req.agenteNome, "promessa_pagamento", `Contrato #${req.params.id}`, req.ip);
    res.json(resultado);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Histórico completo de ocorrências de um contrato
adminRouter.get("/api/sgp/ocorrencias/:contrato", auth, async (req, res) => {
  try {
    const raw = await historicoOcorrencias(req.params.contrato);
    res.json(raw);
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

// ── CONFIGURAÇÕES DE INTEGRAÇÕES (tokens, SGP, APIs) ─────────────────────────

adminRouter.get("/api/config/integracoes", auth, adminOnly, async (req, res) => {
  try {
    const { kvGet } = await import("./services/db.js");
    const [sgpUrl, sgpApp, sgpToken, claudeKey, openaiKey] = await Promise.all([
      kvGet("sgp_url"),   kvGet("sgp_app"),   kvGet("sgp_token"),
      kvGet("claude_key"), kvGet("openai_key"),
    ]);
    // Mascara keys para exibição
    const mask = v => v ? v.slice(0,8) + "•".repeat(Math.max(0, v.length-12)) + v.slice(-4) : "";
    res.json({
      sgp_url:    sgpUrl   || process.env.SGP_URL   || "https://citrn.sgp.net.br",
      sgp_app:    sgpApp   || process.env.SGP_APP   || "n8n",
      sgp_token:  sgpToken ? mask(sgpToken) : mask(process.env.SGP_TOKEN || ""),
      claude_key: claudeKey ? mask(claudeKey) : mask(process.env.ANTHROPIC_API_KEY || ""),
      openai_key: openaiKey ? mask(openaiKey) : mask(process.env.OPENAI_API_KEY || ""),
      // Indica qual fonte está sendo usada
      fonte: {
        sgp:    sgpToken ? "banco" : "env",
        claude: claudeKey ? "banco" : "env",
        openai: openaiKey ? "banco" : "env",
      },
    });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

adminRouter.post("/api/config/integracoes", auth, adminOnly, async (req, res) => {
  try {
    const { kvSet } = await import("./services/db.js");
    const { sgp_url, sgp_app, sgp_token, claude_key, openai_key } = req.body;
    const saves = [];
    if (sgp_url   && sgp_url.startsWith("http"))   saves.push(kvSet("sgp_url",    sgp_url.trim()));
    if (sgp_app   && sgp_app.trim())               saves.push(kvSet("sgp_app",    sgp_app.trim()));
    if (sgp_token && !sgp_token.includes("•"))     saves.push(kvSet("sgp_token",  sgp_token.trim()));
    if (claude_key && !claude_key.includes("•"))   saves.push(kvSet("claude_key", claude_key.trim()));
    if (openai_key && !openai_key.includes("•"))   saves.push(kvSet("openai_key", openai_key.trim()));
    await Promise.all(saves);
    res.json({ ok: true, salvos: saves.length });
  } catch(e) { res.status(500).json({error: safeError(e)}); }
});

adminRouter.post("/api/config/integracoes/testar-sgp", auth, adminOnly, async (req, res) => {
  try {
    const { consultarClientes } = await import("./services/erp.js");
    const r = await consultarClientes("00000000000");
    res.json({ ok: true, resposta: r?.erro ? "conectado (sem resultado)" : "conectado ✅" });
  } catch(e) { res.json({ ok: false, erro: e.message }); }
});

// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// PWA — Manifest + Service Worker
// ⚠️  Bloco novo — não altera nada acima
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/manifest.json", (_req, res) => {
  res.setHeader("Content-Type", "application/manifest+json");
  res.json({
    name: "Maxxi Admin · CITmax",
    short_name: "Maxxi",
    description: "Painel de atendimento inteligente — CITmax",
    start_url: "/admin",
    scope: "/admin/",
    display: "standalone",
    orientation: "any",
    theme_color: "#036271",
    background_color: "#032d3d",
    categories: ["business", "productivity"],
    icons: [
      { src: "/admin/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/admin/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  });
});

// ── Static icons ─────────────────────────────────────────────────────────────
adminRouter.get("/favicon.ico", (_req, res) => {
  try { res.setHeader("Content-Type","image/x-icon"); res.setHeader("Cache-Control","public,max-age=604800"); res.send(readFileSync(join(__dirname,"icons/favicon.ico"))); }
  catch(e) { res.status(404).end(); }
});
adminRouter.get("/icons/:file", (req, res) => {
  try {
    const f = req.params.file.replace(/[^a-z0-9.\-_]/gi,"");
    const ext = f.endsWith(".ico") ? "image/x-icon" : f.endsWith(".svg") ? "image/svg+xml" : "image/png";
    res.setHeader("Content-Type", ext);
    res.setHeader("Cache-Control", "public,max-age=604800");
    res.send(readFileSync(join(__dirname, "icons/" + f)));
  } catch(e) { res.status(404).end(); }
});

adminRouter.get("/sw.js", (_req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/admin/");
  res.send(`
// Maxxi PWA Service Worker v7.0
const CACHE_NAME = 'maxxi-v7.4.9';
const PRECACHE = ['/admin'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// ── PUSH NOTIFICATIONS ──────────────────────────────────────
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  const options = {
    body: data.body || '',
    icon: '/admin/icons/icon-192.png',
    badge: '/admin/icons/icon-192.png',
    tag: data.tag || 'maxxi-default',
    renotify: true,
    vibrate: data.urgente ? [200,100,200,100,200] : [200,100,200],
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Abrir' },
      { action: 'dismiss', title: 'Dispensar' }
    ]
  };
  e.waitUntil(self.registration.showNotification(data.title || 'Maxxi', options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('/admin') && 'focus' in client) return client.focus();
      }
      return clients.openWindow('/admin');
    })
  );
});
  `);
});

// ══════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ⚠️  Bloco novo — não altera nada acima
// ══════════════════════════════════════════════════════════════════════

// Retorna a public key VAPID (frontend precisa pra subscribir)
adminRouter.get("/api/push/vapid-key", auth, async (req, res) => {
  try {
    const { getVapidPublicKey } = await import("./services/push.js");
    const key = await getVapidPublicKey();
    if (!key) return res.status(500).json({ error: "VAPID não configurado" });
    res.json({ publicKey: key });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Subscribe — salva a subscription do agente
adminRouter.post("/api/push/subscribe", auth, async (req, res) => {
  try {
    const { salvarAssinatura } = await import("./services/push.js");
    const agenteId = req.agenteId || "admin";
    const result = await salvarAssinatura(agenteId, req.body);
    res.json(result);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Unsubscribe
adminRouter.post("/api/push/unsubscribe", auth, async (req, res) => {
  try {
    const { removerAssinatura } = await import("./services/push.js");
    await removerAssinatura(req.body.endpoint);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Teste — envia push para o próprio agente
adminRouter.post("/api/push/test", auth, async (req, res) => {
  try {
    const { notificarAgente } = await import("./services/push.js");
    const agenteId = req.agenteId || "admin";
    const result = await notificarAgente(agenteId, {
      title: "🔔 Teste de Notificação",
      body: "Push notifications funcionando! — Maxxi v3.4",
      tag: "teste",
    });
    res.json({ ok: true, enviados: result.length, resultados: result });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// PERFIL DO AGENTE (self-edit — agente edita só seus dados)
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/api/agente/perfil", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery("SELECT id, nome, login, avatar, ativo, online, whatsapp, categoria FROM agentes WHERE id = $1", [req.agenteId]);
    if (r.rows.length === 0) return res.status(404).json({ error: "Agente não encontrado" });
    res.json(r.rows[0]);
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/agente/perfil", auth, async (req, res) => {
  try {
    const { avatar, senha } = req.body;
    const { query: dbQuery } = await import("./services/db.js");
    const updates = [];
    const values = [];
    let idx = 1;

    if (avatar !== undefined) { updates.push(`avatar = $${idx++}`); values.push(avatar); }
    if (senha) {
      const bcryptMod = await import("bcryptjs");
      const hash = await bcryptMod.default.hash(senha, 10);
      updates.push(`senha_hash = $${idx++}`);
      values.push(hash);
    }

    if (updates.length === 0) return res.json({ ok: true, msg: "Nada para atualizar" });

    values.push(req.agenteId);
    await dbQuery(`UPDATE agentes SET ${updates.join(", ")} WHERE id = $${idx}`, values);
    res.json({ ok: true, msg: "Perfil atualizado" });
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// AUDIT LOG
// ══════════════════════════════════════════════════════════════════════
adminRouter.get("/api/audit", auth, adminOnly, async (req, res) => {
  try { res.json(await listarAudit(parseInt(req.query.limit) || 100)); }
  catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// 2FA TOTP (desativado por padrão — usuário ativa em Meu Painel)
// ══════════════════════════════════════════════════════════════════════
adminRouter.post("/api/agente/2fa/setup", auth, async (req, res) => {
  try {
    const { TOTP } = await import("otpauth");
    const QRCode = await import("qrcode");
    const secret = new (await import("crypto")).webcrypto.getRandomValues(new Uint8Array(20));
    const base32Secret = Buffer.from(secret).toString("base64").replace(/[=+\/]/g, "").slice(0, 16).toUpperCase();
    const totp = new TOTP({ issuer: "Maxxi CITmax", label: req.agenteNome || req.agenteId, secret: base32Secret });
    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri);
    // Salva secret temporário (não ativa até confirmar)
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`UPDATE agentes SET totp_secret_pending = $2 WHERE id = $1`, [req.agenteId, base32Secret]).catch(() => {});
    res.json({ qr: qrDataUrl, secret: base32Secret, uri });
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/agente/2fa/verify", auth, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "Código obrigatório" });
    const { query: dbQuery } = await import("./services/db.js");
    const r = await dbQuery(`SELECT totp_secret_pending FROM agentes WHERE id = $1`, [req.agenteId]);
    const secret = r.rows[0]?.totp_secret_pending;
    if (!secret) return res.status(400).json({ error: "Nenhum setup pendente. Gere um novo QR." });
    const { TOTP } = await import("otpauth");
    const totp = new TOTP({ secret });
    const valid = totp.validate({ token: String(code), window: 1 }) !== null;
    if (!valid) return res.status(400).json({ error: "Código inválido" });
    // Ativa 2FA
    await dbQuery(`UPDATE agentes SET totp_secret = $2, totp_secret_pending = NULL, totp_ativo = true WHERE id = $1`, [req.agenteId, secret]);
    registrarAudit(req.agenteId, req.agenteNome, "ativar_2fa", "", req.ip);
    res.json({ ok: true, msg: "2FA ativado!" });
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/agente/2fa/disable", auth, async (req, res) => {
  try {
    const { query: dbQuery } = await import("./services/db.js");
    await dbQuery(`UPDATE agentes SET totp_secret = NULL, totp_secret_pending = NULL, totp_ativo = false WHERE id = $1`, [req.agenteId]);
    registrarAudit(req.agenteId, req.agenteNome, "desativar_2fa", "", req.ip);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// MONITORAMENTO DE AGENTES
// ⚠️  Bloco novo — não altera nada acima
// ══════════════════════════════════════════════════════════════════════

// Status em tempo real de todos os agentes
adminRouter.get("/api/agentes/monitor", auth, async (req, res) => {
  try {
    const { getStatusAgentes, migrateMonitor } = await import("./services/agente-monitor.js");
    await migrateMonitor().catch(() => {}); // garante tabela existe
    res.json(await getStatusAgentes());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Resumo do dia
adminRouter.get("/api/agentes/monitor/resumo", auth, async (req, res) => {
  try {
    const { getResumoDia } = await import("./services/agente-monitor.js");
    res.json(await getResumoDia());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Ranking de produtividade
adminRouter.get("/api/agentes/monitor/ranking", auth, async (req, res) => {
  try {
    const { getRanking } = await import("./services/agente-monitor.js");
    res.json(await getRanking(parseInt(req.query.dias) || 7));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Histórico de sessões
adminRouter.get("/api/agentes/monitor/sessoes", auth, async (req, res) => {
  try {
    const { getHistoricoSessoes } = await import("./services/agente-monitor.js");
    res.json(await getHistoricoSessoes(req.query.data));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Relatório semanal (para CSV/export)
adminRouter.get("/api/agentes/monitor/relatorio", auth, async (req, res) => {
  try {
    const { getRelatorioSemanal } = await import("./services/agente-monitor.js");
    res.json(await getRelatorioSemanal(req.query.agente));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Heartbeat — agente manda a cada 60s para detectar idle
adminRouter.post("/api/agentes/monitor/heartbeat", auth, async (req, res) => {
  try {
    const { registrarEvento } = await import("./services/agente-monitor.js");
    await registrarEvento(req.agenteId, "heartbeat", { ip: req.ip, userAgent: req.headers['user-agent'], nome: req.agenteNome });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Logout beacon — called by sendBeacon when browser tab closes (no auth header possible)
adminRouter.post("/api/agentes/monitor/logout-beacon", async (req, res) => {
  try {
    const token = req.query.token || "";
    let agenteId = null;
    if (token === ADMIN_TOKEN) { agenteId = "admin"; }
    else {
      const payload = verificarToken(token);
      if (payload) agenteId = payload.id;
    }
    if (agenteId && agenteId !== "admin") {
      const { registrarEvento } = await import("./services/agente-monitor.js");
      await registrarEvento(agenteId, "logout", { ip: req.ip, nome: "beacon" });
    }
    res.json({ ok: true });
  } catch(e) { res.status(200).end(); }
});
// Also handle GET for sendBeacon fallback
adminRouter.get("/api/agentes/monitor/logout-beacon", async (req, res) => {
  try {
    const token = req.query.token || "";
    let agenteId = null;
    if (token !== ADMIN_TOKEN) {
      const payload = verificarToken(token);
      if (payload) agenteId = payload.id;
    }
    if (agenteId) {
      const { registrarEvento } = await import("./services/agente-monitor.js");
      await registrarEvento(agenteId, "logout", { ip: req.ip, nome: "beacon" });
    }
    res.json({ ok: true });
  } catch(e) { res.status(200).end(); }
});

// Ponto do dia — timeline de um agente
adminRouter.get("/api/agentes/:id/ponto", auth, async (req, res) => {
  try {
    const { getPontoDia } = await import("./services/agente-monitor.js");
    const ponto = await getPontoDia(req.params.id, req.query.data);
    res.json(ponto);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Horário de trabalho — salvar
adminRouter.put("/api/agentes/:id/horario-trabalho", auth, adminOnly, async (req, res) => {
  try {
    const { salvarHorarioTrabalho } = await import("./services/agente-monitor.js");
    await salvarHorarioTrabalho(req.params.id, req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Alertas de ponto
adminRouter.get("/api/agentes/alertas-ponto", auth, adminOnly, async (req, res) => {
  try {
    const { getAlertasPonto } = await import("./services/agente-monitor.js");
    res.json(await getAlertasPonto());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Pausas — iniciar/finalizar
adminRouter.post("/api/agentes/monitor/pausa", auth, async (req, res) => {
  try {
    const { registrarEvento } = await import("./services/agente-monitor.js");
    const { acao, motivo } = req.body; // acao: "iniciar" ou "finalizar"
    if (acao === "iniciar") {
      await registrarEvento(req.agenteId, "pausa_inicio", { motivo: motivo || "pausa", nome: req.agenteNome });
    } else {
      await registrarEvento(req.agenteId, "pausa_fim", { nome: req.agenteNome });
    }
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Detectar idle (chamado pelo cron/intervalo)
adminRouter.post("/api/agentes/monitor/detectar-idle", auth, async (req, res) => {
  try {
    const { detectarIdle } = await import("./services/agente-monitor.js");
    const idle = await detectarIdle();
    // Notifica via push se alguém ficou idle
    if (idle.length > 0) {
      try {
        const { notificarTodos } = await import("./services/push.js");
        for (const ag of idle) {
          await notificarTodos({ title: "⏳ Agente ausente", body: `${ag.nome} está idle há +15min`, tag: "idle-" + ag.id });
        }
      } catch {}
    }
    res.json({ ok: true, idle });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// HEATMAP DE ATIVIDADE POR AGENTE
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/api/agentes/:id/heatmap", auth, async (req, res) => {
  try {
    // Grid 7 dias × 24 horas — conta mensagens enviadas pelo agente
    // Usa JSONB das conversas para extrair timestamps das mensagens
    const r = await query(`
      SELECT
        EXTRACT(DOW FROM to_timestamp((msg->>'ts')::bigint/1000)) AS dia_semana,
        EXTRACT(HOUR FROM to_timestamp((msg->>'ts')::bigint/1000)) AS hora,
        COUNT(*) AS total
      FROM conversas c,
           jsonb_array_elements(c.mensagens) msg
      WHERE c.agente_id = $1
        AND msg->>'role' = 'agente'
        AND msg->>'agenteId' = $1
        AND c.atualizado >= NOW() - INTERVAL '7 days'
        AND (msg->>'ts')::bigint > 0
      GROUP BY dia_semana, hora
    `, [req.params.id]);

    // Build 7×24 grid
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maximo = 0;
    for (const row of r.rows) {
      const d = parseInt(row.dia_semana);
      const h = parseInt(row.hora);
      const t = parseInt(row.total);
      if (d >= 0 && d <= 6 && h >= 0 && h <= 23) {
        grid[d][h] = t;
        if (t > maximo) maximo = t;
      }
    }
    res.json({ grid, maximo, agente_id: req.params.id });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// FILA & URGÊNCIA
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/api/fila/status", auth, async (req, res) => {
  try {
    const { getTotalNaFila, getTempoMedioEspera, getSlaConfig } = await import("./services/fila.js");
    const [total, mediaSegs, cfg] = await Promise.all([getTotalNaFila(), getTempoMedioEspera(), getSlaConfig()]);
    const r = await query(`
      SELECT id, telefone, nome, canal, aguardando_desde, prioridade, palavras_criticas
      FROM conversas WHERE status='aguardando' AND aguardando_desde IS NOT NULL
      ORDER BY prioridade DESC, aguardando_desde ASC LIMIT 50
    `);
    const { calcularUrgencia } = await import("./services/fila.js");
    const fila = r.rows.map(c => ({
      ...c,
      urgencia: calcularUrgencia(c.aguardando_desde, c.prioridade, cfg),
    }));
    res.json({ total, media_espera_s: mediaSegs, fila, sla: cfg });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/fila/sla", auth, adminOnly, async (req, res) => {
  try {
    const { getSlaConfig } = await import("./services/fila.js");
    res.json(await getSlaConfig());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/fila/sla", auth, adminOnly, async (req, res) => {
  try {
    const { salvarSlaConfig } = await import("./services/fila.js");
    await salvarSlaConfig(req.body);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// AGENDAMENTO DE RETORNO
// ══════════════════════════════════════════════════════════════════════

adminRouter.post("/api/agendamento/retorno", auth, async (req, res) => {
  try {
    const { convId, telefone, canal, minutos, mensagem } = req.body;
    if (!convId || !telefone || !minutos) return res.status(400).json({ error: "convId, telefone e minutos são obrigatórios" });
    const { agendarRetorno } = await import("./services/agendamento.js");
    const result = await agendarRetorno({ convId, telefone, canal: canal || "whatsapp", minutos, mensagem });
    res.json({ ok: true, ...result });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/agendamento/retorno/:convId", auth, async (req, res) => {
  try {
    const { cancelarRetorno } = await import("./services/agendamento.js");
    const cancelados = await cancelarRetorno(req.params.convId);
    res.json({ ok: true, cancelados });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/agendamento/retorno", auth, adminOnly, async (req, res) => {
  try {
    const { listarAgendamentos } = await import("./services/agendamento.js");
    res.json(await listarAgendamentos(req.query.filtro || "pendentes"));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// ACCOUNTABILITY DE AGENTES
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/api/agentes/disponiveis", auth, async (req, res) => {
  try {
    const { getAgentesDisponiveis } = await import("./services/agente-accountability.js");
    res.json(await getAgentesDisponiveis());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/agentes/ranking", auth, adminOnly, async (req, res) => {
  try {
    const { getRankingSemanal } = await import("./services/agente-accountability.js");
    res.json(await getRankingSemanal());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/agentes/nao-perturbe", auth, async (req, res) => {
  try {
    const { minutos, motivo } = req.body;
    const agenteId = req.agenteId || "admin";
    const { ativarNaoPerturbe } = await import("./services/agente-accountability.js");
    const ate = await ativarNaoPerturbe(agenteId, minutos || 30, motivo || "ausente");
    res.json({ ok: true, ate });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/agentes/nao-perturbe", auth, async (req, res) => {
  try {
    const agenteId = req.agenteId || "admin";
    const { desativarNaoPerturbe } = await import("./services/agente-accountability.js");
    await desativarNaoPerturbe(agenteId);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/agentes/:id/reatribuir", auth, adminOnly, async (req, res) => {
  try {
    const { paraAgenteId, devolverFila } = req.body;
    if (devolverFila) {
      const { devolverFilaConversasAgente } = await import("./services/agente-accountability.js");
      const devolvidas = await devolverFilaConversasAgente(req.params.id);
      return res.json({ ok: true, devolvidas: devolvidas.length });
    }
    if (!paraAgenteId) return res.status(400).json({ error: "paraAgenteId obrigatório" });
    const { reatribuirConversas } = await import("./services/agente-accountability.js");
    const total = await reatribuirConversas(req.params.id, paraAgenteId);
    res.json({ ok: true, total });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/agentes/:id/max-conversas", auth, adminOnly, async (req, res) => {
  try {
    const { max } = req.body;
    await query(`UPDATE agentes SET max_conversas=$1 WHERE id=$2`, [max || 8, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// RELATÓRIO IA
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/api/relatorio/agente/:id", auth, adminOnly, async (req, res) => {
  try {
    const { gerarRelatorioIA } = await import("./services/relatorio-ia.js");
    const resultado = await gerarRelatorioIA();
    res.json(resultado);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/relatorio/enviar-whatsapp", auth, adminOnly, async (req, res) => {
  try {
    const { numero } = req.body;
    if (!numero) return res.status(400).json({ error: "numero obrigatório" });
    const { enviarRelatorioWhatsApp } = await import("./services/relatorio-ia.js");
    await enviarRelatorioWhatsApp(numero);

    // Salva número do gestor para cron diário
    const { kvSet } = await import("./services/db.js");
    await kvSet("numero_gestor_relatorio", numero);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// MONITOR TV (requer login — sem heartbeat, sessão não expira)
// ══════════════════════════════════════════════════════════════════════

adminRouter.get("/monitor", (_req, res) => {
  const p = join(dirname(fileURLToPath(import.meta.url)), "../src/public/monitor.html");
  res.setHeader("Content-Type", "text/html");
  res.send(existsSync(p) ? readFileSync(p, "utf8") : "<h1>Monitor</h1>");
});

adminRouter.get("/monitor/dados", auth, async (req, res) => {
  try {
    const [filaR, agentesR, slaR] = await Promise.all([
      query(`SELECT COUNT(*) as total,
        COUNT(CASE WHEN aguardando_desde IS NOT NULL AND EXTRACT(EPOCH FROM (NOW()-aguardando_desde))/60 > 15 THEN 1 END) as criticos,
        AVG(CASE WHEN aguardando_desde IS NOT NULL THEN EXTRACT(EPOCH FROM (NOW()-aguardando_desde))/60 END) as media_min
        FROM conversas WHERE status='aguardando'`),
      query(`SELECT a.id, a.nome, a.online, a.avatar,
        (SELECT COUNT(*) FROM conversas WHERE agente_id=a.id AND status='ativa') as ativas,
        a.nao_perturbe_ate, a.nao_perturbe_motivo
        FROM agentes a WHERE a.ativo=true ORDER BY a.online DESC, a.nome`),
      query(`SELECT COUNT(*) as total_hoje,
        COUNT(CASE WHEN status='encerrada' THEN 1 END) as encerradas_hoje
        FROM conversas WHERE DATE(criado_em)=CURRENT_DATE`),
    ]);
    res.json({
      fila: filaR.rows[0],
      agentes: agentesR.rows,
      hoje: slaR.rows[0],
      ts: Date.now(),
    });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── Monitoramento de rede ──────────────────────────────────────────────────
adminRouter.get("/api/monitor/hosts", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { rows } = await query(`SELECT * FROM network_hosts ORDER BY grupo, nome`);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/monitor/hosts", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { nome, host, tipo = "ping", porta, grupo = "Geral", descricao } = req.body;
    const { rows } = await query(
      `INSERT INTO network_hosts(nome,host,tipo,porta,grupo,descricao) VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nome, host, tipo, porta||null, grupo, descricao||null]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/monitor/hosts/:id", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { nome, host, tipo, porta, grupo, descricao, ativo } = req.body;
    const { rows } = await query(
      `UPDATE network_hosts SET nome=$1,host=$2,tipo=$3,porta=$4,grupo=$5,descricao=$6,ativo=$7 WHERE id=$8 RETURNING *`,
      [nome, host, tipo, porta||null, grupo||"Geral", descricao||null, ativo !== false, req.params.id]
    );
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/monitor/hosts/:id", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    await query(`DELETE FROM network_hosts WHERE id=$1`, [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/monitor/status", auth, async (_req, res) => {
  try {
    const { getStatusRede } = await import("./services/monitor-rede.js");
    res.json(await getStatusRede());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/monitor/historico/:id", auth, async (req, res) => {
  try {
    const { getHistorico } = await import("./services/monitor-rede.js");
    res.json(await getHistorico(req.params.id, parseInt(req.query.limite)||60));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/monitor/checar/:id", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { checarHost } = await import("./services/monitor-rede.js");
    const { rows } = await query(`SELECT * FROM network_hosts WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "host não encontrado" });
    res.json(await checarHost(rows[0]));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/monitor/uptime-bulk", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { calcularUptimeBulk } = await import("./services/monitor-rede.js");
    const { rows } = await query(`SELECT id FROM network_hosts WHERE ativo=true`);
    const ids = rows.map(r => r.id);
    res.json(await calcularUptimeBulk(ids, parseInt(req.query.horas)||24));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/monitor/historico-horario/:id", auth, async (req, res) => {
  try {
    const { getHistoricoHorario } = await import("./services/monitor-rede.js");
    res.json(await getHistoricoHorario(req.params.id));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/monitor/traceroute/:id", auth, async (req, res) => {
  try {
    const { query } = await import("./services/db.js");
    const { tracerouteHost } = await import("./services/monitor-rede.js");
    const { rows } = await query(`SELECT * FROM network_hosts WHERE id=$1`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: "host não encontrado" });
    res.json(await tracerouteHost(rows[0].host));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// TR-069 / Gerenciador CPE — rotas admin
// ══════════════════════════════════════════════════════════════════════

// GET info detalhada do CPE
adminRouter.get("/api/cpe/:idServico", auth, async (req, res) => {
  try {
    const { consultarDispositivoCPE } = await import("./services/tr069.js");
    res.json(await consultarDispositivoCPE(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET sinal óptico
adminRouter.get("/api/cpe/:idServico/sinal", auth, async (req, res) => {
  try {
    const { consultarSinalOptico } = await import("./services/tr069.js");
    res.json(await consultarSinalOptico(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST reboot
adminRouter.post("/api/cpe/:idServico/reboot", auth, async (req, res) => {
  try {
    const { reiniciarDispositivoCPE } = await import("./services/tr069.js");
    const agenteId = req.agente?.id || "admin";
    res.json(await reiniciarDispositivoCPE(req.params.idServico, agenteId));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST ping do CPE
adminRouter.post("/api/cpe/:idServico/ping", auth, async (req, res) => {
  try {
    const { diagnosticoPing } = await import("./services/tr069.js");
    res.json(await diagnosticoPing(req.params.idServico, req.body.host || "8.8.8.8"));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST speedtest do CPE
adminRouter.post("/api/cpe/:idServico/speedtest", auth, async (req, res) => {
  try {
    const { speedTestCPE } = await import("./services/tr069.js");
    res.json(await speedTestCPE(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET lista de redes Wi-Fi
adminRouter.get("/api/cpe/:idServico/wifi", auth, async (req, res) => {
  try {
    const { listarWifi } = await import("./services/tr069.js");
    res.json(await listarWifi(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST configurar Wi-Fi
adminRouter.post("/api/cpe/:idServico/wifi", auth, async (req, res) => {
  try {
    const { configurarWifi } = await import("./services/tr069.js");
    const agenteId = req.agente?.id || "admin";
    res.json(await configurarWifi(req.params.idServico, { ...req.body, agenteId }));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST sincronizar WAN
adminRouter.post("/api/cpe/:idServico/syncwan", auth, async (req, res) => {
  try {
    const { sincronizarWAN } = await import("./services/tr069.js");
    res.json(await sincronizarWAN(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST importar Wi-Fi (CPE → SGP)
adminRouter.post("/api/cpe/:idServico/importwifi", auth, async (req, res) => {
  try {
    const { importarWifi } = await import("./services/tr069.js");
    res.json(await importarWifi(req.params.idServico));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET histórico de ações
adminRouter.get("/api/cpe/:idServico/acoes", auth, async (req, res) => {
  try {
    const { historicoAcoesCPE } = await import("./services/tr069.js");
    res.json(await historicoAcoesCPE(req.params.idServico, parseInt(req.query.limite) || 20));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── WhatsApp Templates (Meta Business API) ───────────────────────────────────
adminRouter.get("/api/wa/templates", auth, async (req, res) => {
  try {
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
    if (!token || !wabaId) return res.status(400).json({ error: "Configure accessToken e wabaId no canal WhatsApp" });
    const r = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?fields=name,status,category,language,components,rejected_reason,quality_score&limit=100&access_token=${token}`);
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json(data.data || []);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.post("/api/wa/templates", auth, async (req, res) => {
  try {
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
    if (!token || !wabaId) return res.status(400).json({ error: "Configure accessToken e wabaId no canal WhatsApp" });
    const payload = req.body;
    console.log("📋 WA Template payload:", JSON.stringify(payload, null, 2));
    const r = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    console.log("📋 WA Template resposta Meta:", JSON.stringify(data));
    if (data.error) return res.status(400).json({ error: data.error.message, details: data.error });
    res.json(data);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.delete("/api/wa/templates/:name", auth, async (req, res) => {
  try {
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
    if (!token || !wabaId) return res.status(400).json({ error: "Configure accessToken e wabaId no canal WhatsApp" });
    const r = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${req.params.name}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ── WhatsApp Flows ────────────────────────────────────────────────────────────
// Listar flows criados na WABA
adminRouter.get("/api/wa/flows", auth, async (req, res) => {
  try {
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
    if (!token || !wabaId) return res.status(400).json({ error: "Configure accessToken e wabaId no canal WhatsApp" });
    const r = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/flows?fields=id,name,status,categories&access_token=${token}`);
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    res.json(data.data || []);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Endpoint dinâmico chamado pelo Flow para buscar planos por CEP
// Meta chama este endpoint quando o cliente digita o CEP no Flow
adminRouter.post("/api/wa/flows/data", async (req, res) => {
  try {
    // Descriptografa payload do Flow (por ora sem criptografia pois é modo draft/teste)
    const body = req.body;
    const screen = body.screen || body.action;
    const data = body.data || {};

    // Tela de planos — chamada quando cliente digita o CEP
    if (screen === "TELA_PLANOS" || body.action === "data_exchange") {
      const cep = (data.cep || "").replace(/\D/g, "");
      const { sgpPostRaw } = await import("./services/erp.js");

      // Busca planos disponíveis pelo CEP no SGP
      let planos = [];
      try {
        const raw = await sgpPostRaw("/api/precadastro/planos/", { cep });
        planos = (raw?.planos || raw?.data || []).map(p => ({
          id: String(p.id || p.plano_id),
          title: p.descricao || p.nome || "",
          description: `R$ ${p.valor || "—"}/mês`,
        }));
      } catch {}

      // Busca vencimentos disponíveis
      let vencimentos = [];
      try {
        const rawV = await sgpPostRaw("/api/precadastro/vencimento/list", {});
        vencimentos = (rawV?.vencimentos || rawV?.data || []).map(v => ({
          id: String(v.id),
          title: `Dia ${v.dia}`,
        }));
      } catch {}

      // Se não achou planos, usa padrão CITmax
      if (!planos.length) {
        planos = [
          { id: "12", title: "Essencial 300M", description: "R$ 59,90/mês" },
          { id: "13", title: "Avançado 450M",  description: "R$ 99,90/mês" },
          { id: "16", title: "Premium 600M",   description: "R$ 119,90/mês" },
        ];
      }
      if (!vencimentos.length) {
        vencimentos = [5,10,15,20,25].map(d => ({ id: String(d), title: `Dia ${d}` }));
      }

      return res.json({
        screen: "TELA_DADOS",
        data: { planos, vencimentos, cep_digitado: cep },
      });
    }

    // Tela final — cliente enviou todos os dados
    if (screen === "SUCESSO" || body.action === "SUBMIT") {
      const { cadastrarCliente } = await import("./services/erp.js");
      const resultado = await cadastrarCliente({
        nome:         data.nome,
        cpf:          data.cpf,
        datanasc:     data.datanasc,
        email:        data.email || "",
        celular:      data.celular || body.from || "",
        logradouro:   data.logradouro,
        numero:       data.numero,
        bairro:       data.bairro,
        cidade:       data.cidade,
        complemento:  data.complemento || "",
        plano_id:     Number(data.plano_id),
        vencimento_id: Number(data.vencimento_id),
        pop_id:       Number(data.pop_id || 1),
        portador_id:  Number(data.portador_id || 16),
      });
      return res.json({ screen: "CONFIRMACAO", data: { protocolo: resultado?.protocolo || resultado?.id || "—", nome: data.nome } });
    }

    res.json({ screen: "TELA_CEP", data: {} });
  } catch(e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// Criar flow na Meta
adminRouter.post("/api/wa/flows/criar", auth, async (req, res) => {
  try {
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
    if (!token || !wabaId) return res.status(400).json({ error: "Configure accessToken e wabaId no canal WhatsApp" });

    const { name, categories, flow_json, endpoint_uri } = req.body;

    // Cria o flow
    const createRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, categories: categories || ["SIGN_UP"], endpoint_uri }),
    });
    const created = await createRes.json();
    if (created.error) return res.status(400).json({ error: created.error.message, details: created.error });

    // Faz upload do JSON do flow
    if (flow_json && created.id) {
      const uploadRes = await fetch(`https://graph.facebook.com/v19.0/${created.id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "flow.json", asset_type: "FLOW_JSON", file: flow_json }),
      });
      const uploaded = await uploadRes.json();
      if (uploaded.error) {
        return res.json({ id: created.id, warning: "Flow criado mas JSON não enviado: " + uploaded.error.message });
      }
    }

    res.json({ ok: true, id: created.id });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.post("/api/wa/flows/enviar", auth, async (req, res) => {
  try {
    const { telefone, flowId, flowToken, headerText, bodyText, actionLabel } = req.body;
    const { getCanal } = await import("./services/canais.js");
    const canal = await getCanal("whatsapp");
    const cfg = canal?.config || {};
    const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
    const phoneNumberId = cfg.phoneNumberId || process.env.WHATSAPP_PHONE_ID;
    if (!token || !phoneNumberId) return res.status(400).json({ error: "Canal WhatsApp não configurado" });

    const payload = {
      messaging_product: "whatsapp",
      to: telefone,
      type: "interactive",
      interactive: {
        type: "flow",
        header: { type: "text", text: headerText || "CITmax Internet" },
        body: { text: bodyText || "Preencha o formulário para contratar:" },
        footer: { text: "CITmax — Internet de verdade" },
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_token: flowToken || "FLOW_TOKEN_CITMAX",
            flow_id: flowId,
            flow_cta: actionLabel || "📋 Fazer cadastro",
            flow_action: "navigate",
            flow_action_payload: { screen: "TELA_CEP" },
          },
        },
      },
    };

    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    });
    const data = await r.json();
    if (data.error) return res.status(400).json({ error: data.error.message, details: data.error });
    res.json({ ok: true, messageId: data.messages?.[0]?.id });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Encaminhar mensagem para outro número
adminRouter.post("/api/wa/encaminhar", auth, async (req, res) => {
  try {
    const { para, content, fromName } = req.body;
    if (!para || !content) return res.status(400).json({ error: "para e content obrigatórios" });
    const { waSendForward } = await import("./services/whatsapp.js");
    const r = await waSendForward(para, content, fromName || "cliente");
    res.json({ ok: true, messageId: r?.messages?.[0]?.id });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Enviar sticker
adminRouter.post("/api/wa/sticker", auth, async (req, res) => {
  try {
    const { para, stickerUrl } = req.body;
    if (!para || !stickerUrl) return res.status(400).json({ error: "para e stickerUrl obrigatórios" });
    const { waSendSticker } = await import("./services/whatsapp.js");
    const r = await waSendSticker(para, stickerUrl);
    res.json({ ok: true, messageId: r?.messages?.[0]?.id });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Enviar reação manual (agente reage a mensagem do cliente)
adminRouter.post("/api/wa/reaction", auth, async (req, res) => {
  try {
    const { para, messageId, emoji } = req.body;
    if (!para || !messageId || !emoji) return res.status(400).json({ error: "para, messageId e emoji obrigatórios" });
    const { waSendReaction } = await import("./services/whatsapp.js");
    const r = await waSendReaction(para, messageId, emoji);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// Upload e envio de arquivo pelo agente no chat
// Frontend envia: { convId, canal, telefone, filename, mimeType, data (base64), caption }
adminRouter.post("/api/chat/enviar-arquivo", auth, async (req, res) => {
  try {
    const { convId, canal, telefone, filename, mimeType, data: b64, caption = "" } = req.body;
    if (!convId || !telefone || !b64 || !filename) return res.status(400).json({ error: "Campos obrigatórios ausentes" });

    const fileBuffer = Buffer.from(b64, "base64");
    const isImage = mimeType?.startsWith("image/");
    const isVideo = mimeType?.startsWith("video/");
    const isAudio = mimeType?.startsWith("audio/");

    let msgConteudo = "";
    let envioOk = false;

    if (canal === "whatsapp" || canal === "whatsapp_cloud") {
      const { waUploadMedia, waSendDocument, waSendImage } = await import("./services/whatsapp.js");
      try {
        // Faz upload para a Meta e envia via media_id
        const mediaId = await waUploadMedia(fileBuffer, mimeType || "application/octet-stream", filename);
        if (isImage) {
          await waSendImage(telefone, mediaId, caption);
          msgConteudo = caption ? `[imagem] ${caption}` : "[imagem enviada pelo agente]";
        } else {
          await waSendDocument(telefone, mediaId, filename, caption);
          msgConteudo = caption ? `[arquivo: ${filename}] ${caption}` : `[arquivo: ${filename}]`;
        }
        envioOk = true;
      } catch(e) {
        logger.error(`❌ waUploadMedia: ${e.message}`);
        return res.status(500).json({ error: `Erro ao enviar para WhatsApp: ${e.message}` });
      }
    } else {
      // Canal não suportado para envio de arquivo direto
      return res.status(400).json({ error: "Envio de arquivo só suportado no canal WhatsApp" });
    }

    // Salva na conversa como mensagem do agente
    if (envioOk) {
      const { adicionarMensagemAgente } = await import("./services/chatInterno.js");
      await adicionarMensagemAgente(convId, {
        role: "agente",
        content: msgConteudo,
        agenteId: req.agenteId || "admin",
        agenteNome: req.agenteNome || "Agente",
      }).catch(() => {});
      registrarAudit(req.agenteId, req.agenteNome, "enviar_arquivo", convId, req.ip);
    }

    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
adminRouter.get("/api/gateway/sms/config", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`SELECT valor FROM crm_config WHERE chave='gateway_sms_config'`);
    res.json(r.rows[0]?.valor || { template: "", force: true });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.put("/api/gateway/sms/config", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const { template = "", force = true } = req.body;
    await dbQ(
      `INSERT INTO crm_config(chave, valor) VALUES('gateway_sms_config', $1::jsonb)
       ON CONFLICT(chave) DO UPDATE SET valor=$1::jsonb, atualizado=NOW()`,
      [JSON.stringify({ template, force })]
    );
    res.json({ ok: true, template, force });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/gateway/sms", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const limite  = parseInt(req.query.limite)  || 100;
    const offset  = parseInt(req.query.offset)  || 0;
    const status  = req.query.status || null;
    const busca   = req.query.busca  || null;

    let sql = `SELECT * FROM gateway_sms_log WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); sql += ` AND status=$${params.length}`; }
    if (busca)  { params.push(`%${busca}%`); sql += ` AND (numero ILIKE $${params.length} OR body ILIKE $${params.length} OR recipient ILIKE $${params.length})`; }
    sql += ` ORDER BY criado_em DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limite, offset);

    const r = await dbQ(sql, params);
    const total = await dbQ(`SELECT COUNT(*) FROM gateway_sms_log${status?` WHERE status='${status}'`:""}`);
    res.json({ rows: r.rows, total: parseInt(total.rows[0].count) });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

adminRouter.get("/api/gateway/sms/stats", auth, async (req, res) => {
  try {
    const { query: dbQ } = await import("./services/db.js");
    const r = await dbQ(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='enviado')          as enviados,
        COUNT(*) FILTER (WHERE status='enviado_template') as templates,
        COUNT(*) FILTER (WHERE status='fora_janela')      as fora_janela,
        COUNT(*) FILTER (WHERE status='erro')             as erros,
        COUNT(*) FILTER (WHERE status='token_invalido')   as token_invalido,
        COUNT(*) FILTER (WHERE criado_em > NOW() - INTERVAL '24 hours') as ultimas_24h
      FROM gateway_sms_log`);
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// ══════════════════════════════════════════════════════════════════════
// ACS TR-069 — rotas admin (gerenciamento do servidor ACS)
// ══════════════════════════════════════════════════════════════════════

// GET stats resumidas
adminRouter.get("/api/acs/stats", auth, async (req, res) => {
  try {
    const { getAcsStats } = await import("./services/acs-db.js");
    res.json(await getAcsStats());
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET informações de conexão do ACS (URL, user, pass)
adminRouter.get("/api/acs/info", auth, (req, res) => {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const host  = req.headers["x-forwarded-host"] || req.headers.host || "";
  const base  = `${proto}://${host.replace(/\/admin.*/, "")}`;
  res.json({
    url_cwmp: `${base}/cwmp`,
    url_direct: `http://${req.headers["x-real-ip"] || "SEU_IP"}:${process.env.ACS_PORT || "7547"}/`,
    port: process.env.ACS_PORT || "7547",
    user: process.env.ACS_USER || "",
    pass: process.env.ACS_PASS || "",
  });
});

// GET lista de dispositivos
adminRouter.get("/api/acs/devices", auth, async (req, res) => {
  try {
    const { listarDevices } = await import("./services/acs-db.js");
    res.json(await listarDevices(req.query));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET device por ID
adminRouter.get("/api/acs/devices/:id", auth, async (req, res) => {
  try {
    const { getDevice } = await import("./services/acs-db.js");
    const d = await getDevice(parseInt(req.params.id));
    if (!d) return res.status(404).json({ error: "Device não encontrado" });
    res.json(d);
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET parâmetros brutos do device
adminRouter.get("/api/acs/devices/:id/params", auth, async (req, res) => {
  try {
    const { getParams } = await import("./services/acs-db.js");
    res.json(await getParams(parseInt(req.params.id)));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET eventos do device
adminRouter.get("/api/acs/devices/:id/events", auth, async (req, res) => {
  try {
    const { getEvents } = await import("./services/acs-db.js");
    res.json(await getEvents(parseInt(req.params.id), parseInt(req.query.limite)||50));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET histórico de comandos
adminRouter.get("/api/acs/devices/:id/comandos", auth, async (req, res) => {
  try {
    const { getComandos } = await import("./services/acs-db.js");
    res.json(await getComandos(parseInt(req.params.id), parseInt(req.query.limite)||30));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// GET auditoria do device
adminRouter.get("/api/acs/devices/:id/auditoria", auth, async (req, res) => {
  try {
    const { getAuditoria } = await import("./services/acs-db.js");
    res.json(await getAuditoria(parseInt(req.params.id), parseInt(req.query.limite)||30));
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST reboot remoto via ACS
adminRouter.post("/api/acs/devices/:id/reboot", auth, async (req, res) => {
  try {
    const { enfileirarReboot } = await import("./services/acs.js");
    const solicitante = req.agente?.id || "admin";
    const cmdId = await enfileirarReboot(parseInt(req.params.id), solicitante);
    res.json({ ok: true, cmdId, mensagem: "Reboot enfileirado. Será executado no próximo Inform do CPE." });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST configurar Wi-Fi via ACS
adminRouter.post("/api/acs/devices/:id/setwifi", auth, async (req, res) => {
  try {
    const { enfileirarSetWifi } = await import("./services/acs.js");
    const { ssid, senha, banda } = req.body;
    if (!ssid || !senha) return res.status(400).json({ error: "ssid e senha obrigatórios" });
    const solicitante = req.agente?.id || "admin";
    const cmdId = await enfileirarSetWifi(parseInt(req.params.id), { ssid, senha, banda }, solicitante);
    res.json({ ok: true, cmdId, mensagem: "SetParameterValues enfileirado. Será executado no próximo Inform." });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST atualizar parâmetros (força GetParameterValues no próximo Inform)
adminRouter.post("/api/acs/devices/:id/refresh", auth, async (req, res) => {
  try {
    const { enfileirarGetParams } = await import("./services/acs.js");
    const cmdId = await enfileirarGetParams(parseInt(req.params.id));
    res.json({ ok: true, cmdId, mensagem: "GetParameterValues enfileirado." });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});

// POST firmware update
adminRouter.post("/api/acs/devices/:id/firmware", auth, async (req, res) => {
  try {
    const { enfileirarComando } = await import("./services/acs.js");
    const { url, fileType, fileSize } = req.body;
    if (!url) return res.status(400).json({ error: "url obrigatório" });
    const solicitante = req.agente?.id || "admin";
    const cmdId = await enfileirarComando(parseInt(req.params.id), "Download",
      { url, fileType: fileType || "1 Firmware Upgrade Image", fileSize: fileSize || 0 }, solicitante);
    res.json({ ok: true, cmdId, mensagem: "Download firmware enfileirado." });
  } catch(e) { res.status(500).json({ error: safeError(e) }); }
});
if (hasReact) {
  adminRouter.get("*", (req, res) => {
    // Skip API/asset paths
    if (req.path.startsWith("/api/") || req.path.startsWith("/logs/") || req.path.startsWith("/chat/")) return res.status(404).json({ error: "not found" });
    res.setHeader("Content-Type", "text/html");
    res.setHeader("Cache-Control", "no-cache");
    res.send(readFileSync(join(REACT_DIR, "index.html"), "utf8"));
  });
}
