import express from "express";
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import helmet from "helmet";
import cors from "cors";
import "dotenv/config";
import { adminRouter } from "./src/admin.js";
import { handleWebhook } from "./src/webhook.js";
import { handleMetaWebhook, handleMetaVerify } from "./src/webhooks/meta.js";
import { handleTelegramWebhook } from "./src/webhooks/telegram.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

// ── Trust proxy (Coolify/Traefik) — get real client IP from X-Forwarded-For ──
app.set('trust proxy', true);

// ── Security headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // React app manages its own CSP
  crossOriginEmbedderPolicy: false, // Widget needs to be embeddable
}));
app.use(cors({
  origin: process.env.CORS_ORIGIN || true, // Set CORS_ORIGIN in Coolify for strict mode
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));

// ── Responde health CHECK ANTES de qualquer import pesado ─────────────────────
app.get("/health", (_req, res) => res.json({ status: "ok", agent: "Maxxi" }));

// ── ACS TR-069 via HTTPS (porta 443 / path /cwmp) ────────────────────────────
// express.text captura qualquer Content-Type (XML, SOAP, etc.)
app.all("/cwmp",
  express.text({ type: "*/*", limit: "2mb" }),
  async (req, res) => {
    req.rawBody = typeof req.body === "string" ? req.body : "";
    console.log(`📡 CWMP ← ${req.method} len=${req.rawBody.length} auth=${req.headers.authorization?"SIM":"NÃO"} ct=${req.headers["content-type"]||"-"}`);
    try {
      const { handleCWMP } = await import("./src/services/acs.js");
      return handleCWMP(req, res);
    } catch(e) {
      console.error("❌ CWMP error:", e.message, e.stack);
      res.status(500).send("error");
    }
  }
);

// ── Página pública de status da rede ────────────────────────────────────────
app.get("/status.json", async (_req, res) => {
  try {
    const { getStatusRede } = await import("./src/services/monitor-rede.js");
    const hosts = await getStatusRede();
    const grupos = {};
    hosts.forEach(h => { if (!grupos[h.grupo||"Geral"]) grupos[h.grupo||"Geral"]=[]; grupos[h.grupo||"Geral"].push(h); });
    const nOffline = hosts.filter(h=>h.status==="offline").length;
    const geral = nOffline === 0 ? "operacional" : nOffline < hosts.length * 0.3 ? "degradado" : "critico";
    res.json({ geral, hosts, grupos: Object.keys(grupos), total: hosts.length, offline: nOffline, ts: Date.now() });
  } catch { res.json({ geral:"desconhecido", hosts:[], ts: Date.now() }); }
});

app.get("/status", (_req, res) => {
  res.setHeader("Content-Type","text/html");
  res.send(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Status CITmax</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#020f14;color:#e2e8f0;min-height:100vh;padding:24px 16px}.container{max-width:720px;margin:0 auto}.header{text-align:center;margin-bottom:32px}.logo{font-size:28px;font-weight:800;color:#3ecfff;margin-bottom:4px}.sub{font-size:13px;color:#4a6b7a;margin-bottom:16px}.badge{display:inline-block;padding:6px 18px;border-radius:20px;font-size:13px;font-weight:700}.ok{background:rgba(0,200,150,.15);color:#00c896;border:1px solid rgba(0,200,150,.3)}.degradado{background:rgba(245,197,24,.15);color:#f5c518;border:1px solid rgba(245,197,24,.3)}.critico{background:rgba(255,71,87,.15);color:#ff4757;border:1px solid rgba(255,71,87,.3)}.grupo{margin-bottom:24px}.grupo-nome{font-size:11px;font-weight:700;color:#4a6b7a;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px}.card{background:#071820;border:1px solid #102030;border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}.nome{font-size:14px;font-weight:600;color:#e2e8f0}.host{font-size:11px;color:#4a6b7a;font-family:monospace;margin-top:2px}.status-dot{width:10px;height:10px;border-radius:50%;flex-shrink:0;margin-right:12px}.status-badge{font-size:11px;font-weight:700}.online{color:#00c896}.offline{color:#ff4757}.lento{color:#f5c518}.instavel{color:#ff6b35}.desconhecido{color:#4a6b7a}.latencia{font-size:11px;font-family:monospace;margin-left:8px;color:#4a6b7a}.footer{text-align:center;margin-top:32px;font-size:11px;color:#4a6b7a}#atualizado{font-size:11px;color:#4a6b7a;margin-top:8px}</style></head><body><div class="container"><div class="header"><div class="logo">CITmax</div><div class="sub">Status dos serviços</div><div id="geral-badge" class="badge ok">Verificando...</div><div id="atualizado"></div></div><div id="hosts"></div><div class="footer">Atualiza automaticamente a cada 30s</div></div><script>const COR={online:'#00c896',offline:'#ff4757',lento:'#f5c518',instavel:'#ff6b35',desconhecido:'#4a6b7a'};const LBL={online:'Operacional',offline:'Offline',lento:'Lento',instavel:'Instável',desconhecido:'Verificando'};async function atualizar(){try{const d=await fetch('/status.json').then(r=>r.json());document.getElementById('atualizado').textContent='Atualizado '+new Date(d.ts).toLocaleTimeString('pt-BR');const b=document.getElementById('geral-badge');b.textContent=d.geral==='operacional'?'Todos os serviços operacionais':d.geral==='degradado'?'Serviços parcialmente afetados':'Interrupção em andamento';b.className='badge '+(d.geral==='operacional'?'ok':d.geral==='degradado'?'degradado':'critico');const grps={};d.hosts.forEach(h=>{const g=h.grupo||'Geral';if(!grps[g])grps[g]=[];grps[g].push(h);});const container=document.getElementById('hosts');container.innerHTML='';Object.entries(grps).forEach(([g,hs])=>{const div=document.createElement('div');div.className='grupo';div.innerHTML='<div class="grupo-nome">'+g+'</div>'+hs.sort((a,b)=>a.status==='offline'?-1:1).map(h=>'<div class="card"><div style="display:flex;align-items:center;"><div class="status-dot" style="background:'+COR[h.status||'desconhecido']+'"></div><div><div class="nome">'+h.nome+'</div><div class="host">'+h.host+(h.porta?':'+h.porta:'')+'</div></div></div><div style="text-align:right"><span class="status-badge '+( h.status||'desconhecido')+'">'+LBL[h.status||'desconhecido']+'</span>'+(h.latencia_ms?'<span class="latencia">'+h.latencia_ms+'ms</span>':'')+'</div></div>').join('');container.appendChild(div);});}catch(e){console.error(e);}};atualizar();setInterval(atualizar,30000);</script></body></html>`);
});

// ── Redireciona / → /admin (para quando o domínio aponta para a raiz) ──────────
app.get("/", (_req, res) => res.redirect(302, "/admin"));

// ── Gateway SMS — recebe mensagens do SGP e envia via WhatsApp ───────────────
// Suporta JSON e form-urlencoded (o SGP geralmente envia form-urlencoded)
app.post("/gateway/sms",
  express.urlencoded({ extended: true }),
  async (req, res) => {
  const { body: texto, recipient, token, channel, campaign } = req.body;
  console.log(`📥 SMS Gateway recebido:`, JSON.stringify(req.body).slice(0, 200));
  let numero = "", naJanela = null, status = "erro", erro = null;

  try {
    // Valida token
    const SMS_TOKEN = process.env.SMS_GATEWAY_TOKEN || "citmax2026sms";
    const tokenRecebido = token || req.headers["x-token"] || req.query.token || "";
    const tokenNorm    = decodeURIComponent(String(tokenRecebido).trim());
    const tokenEsperado = decodeURIComponent(String(SMS_TOKEN).trim());
    if (tokenNorm !== tokenEsperado) {
      console.warn(`⚠️ SMS Gateway: token inválido "${tokenNorm}" de ${req.ip}`);
      try {
        const { query: dbQ } = await import("./src/services/db.js");
        await dbQ(`INSERT INTO gateway_sms_log(recipient,numero,body,channel,campaign,status,erro) VALUES($1,$2,$3,$4,$5,'token_invalido',$6)`,
          [recipient||"", "", texto||"", channel||"", campaign||"", `Token recebido: "${tokenNorm}"`]);
      } catch {}
      return res.status(401).json({ success: false, error: "Token inválido" });
    }

    if (!texto || !recipient)
      return res.status(400).json({ success: false, error: "body e recipient são obrigatórios" });

    // Normaliza número
    numero = String(recipient).replace(/\D/g, "");
    if (!numero.startsWith("55")) numero = "55" + numero;
    const to = numero + "@s.whatsapp.net";

    const { waSendText, waSendTemplate, dentroJanela24h } = await import("./src/services/whatsapp.js");
    naJanela = await dentroJanela24h(numero).catch(() => false);

    // Campanhas que mostram botão de boleto
    const CAMPANHAS_BOLETO = ['cobranca', 'cobrança', 'boleto', 'fatura', 'vencimento', 'maxxi_wa'];
    const campanhaNorm = (campaign || '').toLowerCase().trim();
    const ehCampanhaBoleto = CAMPANHAS_BOLETO.some(c => campanhaNorm.includes(c));

    if (naJanela || process.env.SMS_GATEWAY_FORCE === "true") {
      const { waSendButtons, waSendText } = await import("./src/services/whatsapp.js");
      const corpoMsg = texto;

      if (ehCampanhaBoleto) {
        // Campanha de cobrança → envia com botão de boleto
        try {
          const result = await waSendButtons(to, corpoMsg,
            [{ id: "SGP_BOLETO", title: "💰 Ver meu boleto" }],
            "CITmax Internet", ""
          );
          if (result?.error) throw new Error(result.error.message || "Erro Meta");
          status = "enviado";
          console.log(`📲 SMS Gateway [botão boleto]: ${numero} | ${texto.slice(0, 60)}`);
        } catch {
          await waSendText(to, corpoMsg + "\n\nResponda *boleto* para gerar seu boleto/PIX.");
          status = "enviado";
        }
      } else {
        // Outras campanhas → texto simples
        await waSendText(to, corpoMsg);
        status = "enviado";
        console.log(`📲 SMS Gateway [texto]: ${numero} | campanha=${campanhaNorm} | ${texto.slice(0, 60)}`);
      }
    } else {
      // Fora da janela: usa template obrigatório
      let templateName = process.env.SMS_GATEWAY_TEMPLATE || "";
      let forceEnvio = false;
      try {
        const { query: dbQ } = await import("./src/services/db.js");
        const r = await dbQ(`SELECT valor FROM crm_config WHERE chave='gateway_sms_config'`);
        if (r.rows[0]?.valor) {
          templateName = r.rows[0].valor.template || templateName;
          forceEnvio   = r.rows[0].valor.force === true;
        }
      } catch {}

      if (forceEnvio) {
        const { waSendText } = await import("./src/services/whatsapp.js");
        await waSendText(to, texto);
        status = "enviado";
        console.log(`📲 SMS Gateway [force]: ${numero} | ${texto.slice(0, 60)}`);
      } else if (templateName) {
        // Verifica se o template está aprovado antes de enviar
        try {
          const { getCanal } = await import("./src/services/canais.js");
          const canal = await getCanal("whatsapp");
          const cfg = canal?.config || {};
          const token = cfg.accessToken || process.env.WHATSAPP_TOKEN;
          const wabaId = cfg.wabaId || cfg.businessId || process.env.WHATSAPP_WABA_ID;
          if (token && wabaId) {
            const tRes = await fetch(`https://graph.facebook.com/v19.0/${wabaId}/message_templates?name=${templateName}&fields=status&access_token=${token}`);
            const tData = await tRes.json();
            const tStatus = tData?.data?.[0]?.status;
            if (tStatus && tStatus !== "APPROVED" && tStatus !== "ACTIVE") {
              status = "fora_janela";
              erro = `Template "${templateName}" está com status "${tStatus}" — aguardando aprovação da Meta.`;
              console.warn(`⚠️ SMS Gateway: template ${templateName} não aprovado (${tStatus})`);
              // Pula envio
              throw new Error(erro);
            }
          }
        } catch(te) {
          if (te.message === erro) throw te; // re-throw nosso erro
          // Se falhou verificação, tenta enviar mesmo assim
          console.warn(`⚠️ Não conseguiu verificar status do template: ${te.message}`);
        }
        const templatePayload = {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: { code: "pt_BR" },
            components: [{ type: "body", parameters: [{ type: "text", text: texto.slice(0, 1024) }] }]
          }
        };
        console.log(`📤 Template payload:`, JSON.stringify(templatePayload));
        const templateResult = await waSendTemplate(numero, templateName, "pt_BR", [{ type:"body", parameters:[{ type:"text", text:texto.slice(0,1024) }] }]);
        console.log(`📤 Template resposta Meta:`, JSON.stringify(templateResult));
        if (templateResult?.error) {
          throw new Error(templateResult.error.message || JSON.stringify(templateResult.error));
        }
        status = "enviado_template";
        console.log(`📲 SMS Gateway [template:${templateName}]: ${numero}`);
      } else {
        status = "fora_janela";
        erro = "Número fora da janela 24h. Configure um template aprovado na página Gateway SMS → Configurações.";
        console.warn(`⚠️ SMS Gateway: ${numero} fora da janela 24h — sem template configurado`);
      }
    }
  } catch (e) {
    status = "erro";
    erro = e.message;
    console.error(`❌ SMS Gateway erro: ${e.message}`);
  }

  // Salva log SEMPRE — independente do status
  try {
    const { query: dbQ } = await import("./src/services/db.js");
    await dbQ(
      `INSERT INTO gateway_sms_log(recipient,numero,body,channel,campaign,status,erro,na_janela) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [recipient||"", numero, texto||"", channel||"", campaign||"", status, erro, naJanela]
    );
  } catch(e2) { console.error("❌ SMS log erro:", e2.message); }

  if (status === "fora_janela")
    return res.status(422).json({ success: false, error: erro, numero, dica: "Use SMS_GATEWAY_TEMPLATE no .env para enviar fora da janela 24h" });
  if (status === "erro")
    return res.status(500).json({ success: false, error: erro });

  res.json({ success: true, recipient: numero, status, janela: naJanela });
});
app.get("/pix", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.send(readFileSync(join(__dirname, "src/pix.html"), "utf8"));
});
app.get("/ping",   (_req, res) => res.send("pong"));

// ── Startup assíncrono ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Rotas críticas registradas imediatamente (sem depender do async)
app.use("/admin", adminRouter);
app.post("/webhook", handleWebhook);
app.get ("/webhook/whatsapp",  (req,res) => handleMetaVerify(req,res,"whatsapp"));
app.post("/webhook/whatsapp",  handleMetaWebhook);
app.get ("/webhook/instagram", (req,res) => handleMetaVerify(req,res,"instagram"));
app.post("/webhook/instagram", handleMetaWebhook);
app.get ("/webhook/facebook",  (req,res) => handleMetaVerify(req,res,"facebook"));
app.post("/webhook/facebook",  handleMetaWebhook);
app.post("/webhook/telegram",  handleTelegramWebhook);

// ── Sobe na porta IMEDIATAMENTE — Coolify precisa ver a porta aberta
const server = app.listen(PORT, () => {
  console.log(`🚀 Maxxi escutando na porta ${PORT}`);
});

// ── Servidor TR-069 ACS (porta 7547) ─────────────────────────────────────────
try {
  const ACS_PORT = parseInt(process.env.ACS_PORT || "7547");
  const acsApp = express();
  acsApp.set("trust proxy", true);

  // Captura rawBody (SOAP XML) — deve vir ANTES de qualquer body parser
  acsApp.use((req, res, next) => {
    let data = Buffer.alloc(0);
    req.on("data", chunk => { data = Buffer.concat([data, chunk]); });
    req.on("end",  () => { req.rawBody = data.toString("utf8"); next(); });
    req.on("error", next);
  });

  acsApp.all("/",    async (req, res) => { const { handleCWMP } = await import("./src/services/acs.js"); return handleCWMP(req, res); });
  acsApp.all("/acs", async (req, res) => { const { handleCWMP } = await import("./src/services/acs.js"); return handleCWMP(req, res); });
  acsApp.get("/health", (_req, res) => res.json({ status: "ok", service: "Maxxi ACS TR-069" }));

  acsApp.listen(ACS_PORT, () => {
    console.log(`📡 ACS TR-069 escutando na porta ${ACS_PORT}`);
  });
} catch (e) {
  console.error("⚠️  ACS TR-069 não iniciou:", e.message);
}

// Carrega tudo depois
(async () => {
  try {
    console.log("🔄 [1/4] Iniciando banco de dados...");
    if (process.env.DATABASE_URL) {
      const { migrate }              = await import("./src/services/db.js");
      const { loadStats }            = await import("./src/services/logger.js");
      const { carregarEstadoHandoff } = await import("./src/services/handoff.js");
      await migrate();
      await loadStats();
      await carregarEstadoHandoff();

      const { migrateFila, iniciarMonitorSLA } = await import("./src/services/fila.js");
      const { migrateAccountability } = await import("./src/services/agente-accountability.js");
      const { migrateAgendamentos, recarregarAgendamentos } = await import("./src/services/agendamento.js");
      const { iniciarCronRelatorio } = await import("./src/services/relatorio-ia.js");
      const { broadcast } = await import("./src/services/chatInterno.js");

      await migrateFila();
      await migrateAccountability();
      await migrateAgendamentos();
      await recarregarAgendamentos();
      iniciarMonitorSLA(broadcast);
      iniciarCronRelatorio();

      const { iniciarMonitor, setAlertCallback } = await import("./src/services/monitor-rede.js");
      iniciarMonitor(30);

      // Alertas automáticos quando host muda de status
      setAlertCallback(async ({ host, status, anterior }) => {
        try {
          const { query: dbQ } = await import("./src/services/db.js");
          const { waSendText }  = await import("./src/services/whatsapp.js");
          // Busca admins com telefone
          const { rows: admins } = await dbQ(`SELECT telefone,nome FROM agentes WHERE role='admin' AND ativo=true AND telefone IS NOT NULL`);
          const emoji = status === "offline" ? "🔴" : status === "online" ? "🟢" : "🟡";
          const msg = status === "offline"
            ? `${emoji} *ALERTA — Host offline*\n\n*${host.nome}* (${host.host}) ficou *offline*.\n\nVerifique o equipamento.`
            : `${emoji} *Recuperado*\n\n*${host.nome}* voltou online.\n\nAnterior: ${anterior} → Agora: online`;
          for (const a of admins) {
            waSendText(a.telefone + "@s.whatsapp.net", msg).catch(() => {});
          }
        } catch {}
      });

      console.log("✅ [1/4] Banco conectado");
    } else {
      console.warn("⚠️  DATABASE_URL não definida — rodando sem banco");
    }

    console.log("🔄 [2/4] Importando handlers...");
    const { adminRouter }                         = await import("./src/admin.js");
    console.log("✅ adminRouter OK");
    const { runMaxxi }                            = await import("./src/agent.js");
    const { getCanal }                            = await import("./src/services/canais.js");
    const { dentroDoHorario, getHorarios }        = await import("./src/services/crm.js");
    const { buscarMemoria, buscarSessao }         = await import("./src/services/memoria.js");
    const { sendOutbound }                        = await import("./src/services/chatwoot.js");
    console.log("✅ [2/4] Handlers importados");

    console.log("🔄 [3/4] Registrando rotas...");
    // adminRouter já registrado antes do async

    // ── PÁGINA PÚBLICA: Contrate CITmax ──
    app.get("/contratar", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.send(readFileSync(join(__dirname, "src/contratar.html"), "utf8"));
    });

    // ── API PÚBLICA: Cadastro de lead (sem auth) ──
    app.get("/api/public/vencimentos", async (_req, res) => {
      try {
        const { listarVencimentos } = await import("./src/services/erp.js");
        res.json(await listarVencimentos());
      } catch (e) { res.status(500).json({ error: "Erro ao buscar vencimentos" }); }
    });

    app.get("/api/public/planos", async (_req, res) => {
      try {
        const { query } = await import("./src/services/db.js");
        const r = await query(`
          SELECT c.id as cidade_id, c.nome as cidade, c.pop_id, c.portador_id,
            json_agg(json_build_object('plano_id',p.id,'sgp_id',p.sgp_id,'nome',p.nome,'velocidade',p.velocidade,'unidade',p.unidade,'valor',p.valor,'beneficios',p.beneficios,'destaque',p.destaque) ORDER BY p.ordem) as planos
          FROM cidades c
          JOIN cidade_planos cp ON cp.cidade_id=c.id AND cp.ativo=true
          JOIN planos p ON p.id=cp.plano_id AND p.ativo=true
          WHERE c.ativo=true
          GROUP BY c.id ORDER BY c.ordem
        `);
        res.json(r.rows);
      } catch (e) { res.status(500).json({ error: "Erro ao buscar planos" }); }
    });

    app.post("/api/public/lead", async (req, res) => {
      try {
        const d = req.body;
        if (!d.nome || !d.cpf || !d.celular || !d.cidade || !d.plano_id) {
          return res.status(400).json({ error: "Campos obrigatórios: nome, cpf, celular, cidade, plano_id" });
        }
        // Rate limit simples por IP
        const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
        const now = Date.now();
        if (!app._leadRateLimit) app._leadRateLimit = new Map();
        const last = app._leadRateLimit.get(ip) || 0;
        if (now - last < 30000) { return res.status(429).json({ error: "Aguarde 30 segundos entre cadastros" }); }
        app._leadRateLimit.set(ip, now);

        // 1. Envia pro ERP
        const { cadastrarCliente } = await import("./src/services/erp.js");
        let erpResult = null;
        try { erpResult = await cadastrarCliente(d); } catch (e) { erpResult = { erro: e.message }; }

        // 2. Salva localmente
        const { query } = await import("./src/services/db.js");
        await query(
          `INSERT INTO leads(cpf,nome,telefone,email,cidade,plano_id,datanasc,logradouro,numero,complemento,bairro,pontoreferencia,vencimento_id,pop_id,portador_id,status,canal,erp_response,obs)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            d.cpf?.replace(/\D/g,''), d.nome, d.celular?.replace(/\D/g,''), d.email || '',
            d.cidade, String(d.plano_id), d.datanasc || '', d.logradouro || '', d.numero || '',
            d.complemento || '', d.bairro || '', d.pontoreferencia || '',
            String(d.vencimento_id || ''), String(d.pop_id || ''), String(d.portador_id || ''),
            erpResult?.erro ? 'erro_erp' : 'cadastrado', 'landing_page',
            JSON.stringify(erpResult), 'Cadastro via landing page /contratar'
          ]
        );

        const protocolo = erpResult?.protocolo || erpResult?.clienteId || null;
        res.json({ ok: !erpResult?.erro, protocolo, erp: erpResult?.erro ? erpResult.erro : undefined });
      } catch (e) { res.status(500).json({ error: "Erro interno. Tente pelo WhatsApp." }); }
    });

    app.get("/dashboard-app", (_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.setHeader("X-Frame-Options", "ALLOWALL");
      res.setHeader("Content-Security-Policy", "frame-ancestors *");
      res.send(readFileSync(join(__dirname, "src/dashboard-app.html"), "utf8"));
    });

    // SGP Gateway Genérica webhook
    const { handleSgpWebhook } = await import("./src/webhooks/sgp.js");
    app.post("/webhook/sgp", handleSgpWebhook);


    app.get("/widget", async (req, res) => {
      try {
        const canal = await getCanal("widget");
        const cfg   = canal?.config || {};
        let html    = readFileSync(join(__dirname, "src/widget.html"), "utf8");
        const script = `<script>window.MAXXI_CONFIG=${JSON.stringify({
          titulo: cfg.titulo || "CITmax", cor: cfg.corPrimaria || "#00c896",
          saudacao: cfg.saudacao, base: "",
        })};</script>`;
        html = html.replace("</head>", script + "</head>");
        res.setHeader("Content-Type", "text/html");
        res.setHeader("X-Frame-Options", "ALLOWALL");
        res.setHeader("Content-Security-Policy", "frame-ancestors *");
        res.send(html);
      } catch(e) { res.status(500).send("Erro: " + e.message); }
    });

    app.get("/widget/embed.js", (req, res) => {
      const proto  = req.headers["x-forwarded-proto"] || "http";
      const origin = `${proto}://${req.headers.host}`;
      res.setHeader("Content-Type", "application/javascript");
      res.send(`(function(){var f=document.createElement('iframe');f.src='${origin}/widget';f.style='position:fixed;bottom:0;right:0;width:380px;height:580px;border:none;z-index:9999';document.body.appendChild(f);})();`);
    });

    app.post("/widget/chat", async (req, res) => {
      try {
        const canal = await getCanal("widget");
        if (!canal?.ativo) return res.json({ resposta: "Canal não configurado." });
        const { sessao, mensagem } = req.body;
        if (!mensagem?.trim()) return res.status(400).json({ error: "mensagem obrigatória" });
        if (!(await dentroDoHorario())) {
          const h = await getHorarios();
          return res.json({ resposta: h.mensagemForaHorario || "Fora do horário." });
        }
        const convId = `widget_${sessao}`;
        const { registrarMensagem, registrarRespostaIA } = await import("./src/services/chatInterno.js");

        await registrarMensagem({
          convId, telefone: sessao, nome: "Visitante Web",
          conteudo: mensagem, canal: "widget", accountId: null, statusInicial: "ia",
        }).catch(()=>{});

        const result = await runMaxxi({
          accountId: null, conversationId: convId, messageId: Date.now(),
          content: mensagem, sender: { name: "Visitante", phone_number: sessao },
          channel: "widget", protocolo: `WEB-${Date.now().toString(36).toUpperCase()}`,
          memoria: await buscarMemoria(sessao), telefone: sessao, sessao: await buscarSessao(sessao),
        });
        const resposta = result?.reply || "Como posso ajudar?";
        await registrarRespostaIA(convId, resposta).catch(()=>{});
        res.json({ resposta });
      } catch(e) { res.json({ resposta: "Desculpe, tive um problema!" }); }
    });

    app.post("/outbound", async (req, res) => {
      const secret = process.env.OUTBOUND_SECRET;
      if (secret && req.headers["x-secret"] !== secret) return res.status(401).json({ error: "unauthorized" });
      const { inboxId, phone, message, contactName } = req.body;
      if (!inboxId || !phone || !message) return res.status(400).json({ error: "campos obrigatórios faltando" });
      try {
        const r = await sendOutbound(process.env.CHATWOOT_ACCOUNT_ID||"1", inboxId, phone, message, contactName);
        res.json({ ok: true, conversationId: r?.id });
      } catch(e) { res.status(500).json({ error: e.message }); }
    });

    console.log("✅ Todas as rotas registradas");
    console.log(`🖥️  Admin:  http://localhost:${PORT}/admin`);
    console.log(`🌐 Widget: http://localhost:${PORT}/widget`);

    // ── Server-side presence detection (runs every 30s) ──
    // Marks agents offline if no heartbeat in 2 minutes
    setInterval(async () => {
      try {
        const { query } = await import("./src/services/db.js");
        // Mark offline if no heartbeat in 2 min AND currently online/idle
        const r = await query(`
          UPDATE agentes SET online = false, status_atual = 'offline', pausa_atual = NULL
          WHERE (status_atual IN ('online','idle','pausa'))
            AND ultimo_heartbeat < NOW() - INTERVAL '2 minutes'
            AND id != 'admin'
          RETURNING id, nome
        `);
        if (r.rows.length > 0) {
          const { registrarEvento } = await import("./src/services/agente-monitor.js");
          for (const ag of r.rows) {
            await registrarEvento(ag.id, "logout", { nome: ag.nome + " (auto)", ip: null }).catch(() => {});
          }
          console.log(`⏰ Auto-offline: ${r.rows.map(a => a.nome).join(', ')}`);
        }
      } catch {}
    }, 30000); // Verifica a cada 30s
    console.log("⏰ Server-side presence detection ativa (2min threshold)");

    // ── Reativação + Limpeza automática (a cada 5 min) ──
    const reativadosSet = new Set(); // Evita mandar 2x pro mesmo telefone
    setInterval(async () => {
      try {
        const { query } = await import("./src/services/db.js");
        const { waSendText } = await import("./src/services/whatsapp.js");

        // 1. Conversas com IA sem atividade há 30min — mandar reativação
        const inativos30 = await query(`
          SELECT id, telefone, nome FROM conversas 
          WHERE status = 'ia' 
            AND atualizado < NOW() - INTERVAL '30 minutes'
            AND atualizado > NOW() - INTERVAL '60 minutes'
        `);
        for (const c of inativos30.rows) {
          if (c.telefone && !reativadosSet.has(c.telefone)) {
            try {
              const nome = c.nome?.split(' ')[0] || '';
              await waSendText(c.telefone, `${nome ? nome + ', ainda' : 'Ainda'} posso te ajudar com algo? 😊\nSe não precisar, vou encerrar o atendimento. Qualquer coisa é só chamar!`);
              reativadosSet.add(c.telefone);
              // Limpa o set depois de 1h pra não bloquear pra sempre
              setTimeout(() => reativadosSet.delete(c.telefone), 3600000);
            } catch {}
          }
        }

        // 2. Conversas com IA sem atividade há 1h (já mandou reativação e não respondeu) — encerra
        const inativos60 = await query(`
          UPDATE conversas SET status='encerrada', atualizado=NOW()
          WHERE status = 'ia'
            AND atualizado < NOW() - INTERVAL '60 minutes'
          RETURNING id, nome, telefone
        `);
        for (const c of inativos60.rows) {
          if (c.telefone) {
            try { await waSendText(c.telefone, "Atendimento encerrado por inatividade. Precisando é só chamar! 😊"); } catch {}
          }
          // Limpa sessão
          try {
            const { limparSessao } = await import("./src/services/memoria.js");
            await limparSessao(c.telefone);
          } catch {}
        }

        // 3. Conversas na fila ou com agente sem atividade há 24h — encerra silenciosamente
        const inativos24h = await query(`
          UPDATE conversas SET status='encerrada', atualizado=NOW()
          WHERE status IN ('aguardando','em_atendimento')
            AND atualizado < NOW() - INTERVAL '24 hours'
          RETURNING id, nome
        `);

        // 4. Remove sessões com mais de 24h
        const sessoes = await query(`DELETE FROM sessoes WHERE criado_em::bigint < $1 RETURNING telefone`, [Date.now() - 24 * 3600 * 1000]);

        const total = inativos60.rows.length + inativos24h.rows.length + sessoes.rows.length;
        if (total > 0) {
          console.log(`🧹 Limpeza: ${inativos30.rows.length} reativados, ${inativos60.rows.length} IA encerradas (1h), ${inativos24h.rows.length} fila/agente encerradas (24h), ${sessoes.rows.length} sessões removidas`);
        }
      } catch (e) { console.error("🧹 Erro limpeza:", e.message); }
    }, 300000); // A cada 5 minutos
    console.log("🧹 Reativação 30min + limpeza 24h ativa");

  } catch(e) {
    console.error("❌ Erro no startup:", e.message);
    console.error(e.stack);

  }
})();
