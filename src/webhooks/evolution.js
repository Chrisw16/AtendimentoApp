/**
 * evolution.js — Webhook da Evolution API (instância interna)
 * Recebe mensagens do WhatsApp interno da equipe
 */
import { logger } from "../services/logger.js";
import { detectarERegistrarGrupo, getConfig, enviarTexto, getNumeroInstancia } from "../services/evolution.js";
import { processarMensagemEquipe } from "../services/maxxi-equipe.js";

export async function handleEvolutionWebhook(req, res) {
  res.sendStatus(200); // Responde rápido

  try {
    const body = req.body;
    logger.info(`📱 Evolution RAW: ${JSON.stringify(body).slice(0, 500)}`);

    // Set compartilhado com o polling para evitar processar 2x
    const processados = global._maxxiProcessados || new Set();

    // Evolution v2 — instância vem do params da URL E do body
    const event    = body.event || body.type || body.action || "";
    const instancia = body.instance?.instanceName || body.instance || body.instanceName || req.params?.instancia || "";

    logger.info(`📱 Evolution webhook: event="${event}" | instancia="${instancia}" | params=${JSON.stringify(req.params)}`);

    // ── Conexão/QR atualizado ──────────────────────────────────────────────
    if (event === "qrcode.updated" || event === "CONNECTION_UPDATE") {
      const { broadcast } = await import("../services/chatInterno.js");
      broadcast("evolution_status", {
        instancia,
        status: body.data?.state || body.data?.status || "unknown",
        qr: body.data?.qrcode?.base64 || body.data?.base64 || null,
      });
      return;
    }

    // ── Grupo detectado (vários eventos possíveis na v2) ─────────────────
    if (["groups.upsert","GROUPS_UPSERT","group.update","GROUP_UPDATE","groups.update"].includes(event)) {
      const dados = body.data || body.groups || [];
      const grupos = Array.isArray(dados) ? dados : [dados];
      for (const g of grupos) {
        const gId   = g?.id || g?.remoteJid || g?.groupId || "";
        const gNome = g?.subject || g?.name || g?.groupName || gId;
        if (gId && gId.endsWith("@g.us")) {
          await detectarERegistrarGrupo(instancia, gId, gNome);
          const { broadcast } = await import("../services/chatInterno.js");
          broadcast("evolution_grupo", { id: gId, nome: gNome });
        }
      }
      return;
    }

    // ── Mensagem recebida — aceita todos os formatos da v2 ───────────────
    const isMessageEvent = event === "messages.upsert"
      || event === "MESSAGES_UPSERT"
      || event === "messages.update"
      || event === "message"
      || event === "MESSAGE"
      // Se não tem evento mas tem data com key (mensagem direta)
      || (!event && (body.data?.key || body.key));

    if (isMessageEvent) {
      // v2: data pode ser array ou objeto único
      const rawData = body.data || body.messages || [];
      const msgs = Array.isArray(rawData) ? rawData : [rawData];

      for (const msg of msgs) {
        if (!msg) continue;
        if (msg.key?.fromMe || msg.fromMe) continue;

        // Deduplicação — ignora se já processado pelo polling
        const msgIdWH = msg.key?.id || msg.id;
        if (msgIdWH && processados.has(msgIdWH)) {
          logger.info(`📱 Webhook: ${msgIdWH} já processado — skip`);
          continue;
        }
        if (msgIdWH) processados.add(msgIdWH);

        const remoteJid  = msg.key?.remoteJid || msg.remoteJid || "";
        const pushName   = msg.pushName || msg.notifyName || msg.key?.participant?.split("@")[0] || remoteJid.split("@")[0];
        const texto      = msg.message?.conversation
          || msg.message?.extendedTextMessage?.text
          || msg.message?.imageMessage?.caption
          || msg.message?.ephemeralMessage?.message?.extendedTextMessage?.text
          || msg.text || msg.body || "";

        logger.info(`📱 Webhook msg: remoteJid=${remoteJid} | pushName=${pushName} | texto=${texto?.slice(0,40)}`);
        if (!texto.trim()) continue;

        const cfg = await getConfig();

        if (remoteJid.endsWith("@g.us")) {
          // ── GRUPO — só responde se marcado com @ ──────────────────────────
          const nomeGrupo = msg.groupMetadata?.subject
            || msg.key?.remoteJid?.split("@")[0]
            || remoteJid;
          await detectarERegistrarGrupo(instancia, remoteJid, nomeGrupo);

          const grupo = cfg.grupos.find(g => g.id === remoteJid);
          if (!grupo?.ia) continue; // IA não ativa neste grupo

          // Busca o número real do bot via Evolution API para verificar menção correta
          const botJid = await getNumeroInstancia(instancia).catch(() => null);
          
          // Verifica se o bot foi mencionado
          const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
            || msg.message?.conversation?.match(/@(\d+)/g)?.map(m => m.slice(1) + "@s.whatsapp.net")
            || [];
          
          const foiMencionado = (
            // Bot está na lista de mencionados
            (botJid && mentionedJids.some(j => j === botJid || j.replace("@s.whatsapp.net","") === botJid.replace("@s.whatsapp.net","")))
            // Ou é uma resposta direta ao bot
            || (botJid && msg.message?.extendedTextMessage?.contextInfo?.participant === botJid)
            // Fallback: texto contém @ seguido de número (menção manual)
            || (mentionedJids.length > 0)
          );

          if (!foiMencionado) {
            logger.info(`📱 Grupo [${nomeGrupo}]: não mencionado — ignorando`);
            continue;
          }

          // Remove a menção do texto antes de processar
          const textoLimpo = texto.replace(/@\d+/g, "").replace(/@\S+/g, "").trim();
          if (!textoLimpo) continue;
          Object.defineProperty(msg, "_textoLimpo", { value: textoLimpo, writable: true });
          logger.info(`📱 Grupo [${nomeGrupo}] mencionado: "${textoLimpo.slice(0,60)}"`);

        } else {
          // ── PRIVADO — responde qualquer agente cadastrado ─────────────────
          const numeroLimpo = remoteJid.replace("@s.whatsapp.net", "").replace(/\D/g, "");
          try {
            const { query: dbQ } = await import("../services/db.js");
            // Gera variações: com/sem DDI, com/sem 9 extra
            const semDDI = numeroLimpo.replace(/^55/, "");
            const comDDI = numeroLimpo.startsWith("55") ? numeroLimpo : "55" + numeroLimpo;
            // Com 9 extra após DDD (padrão celular BR)
            const semDDIcom9 = semDDI.length === 10 ? semDDI.slice(0,2) + "9" + semDDI.slice(2) : semDDI;
            const comDDIcom9 = "55" + semDDIcom9;
            // Sem 9 extra
            const semDDIsem9 = semDDI.length === 11 && semDDI[2] === "9" ? semDDI.slice(0,2) + semDDI.slice(3) : semDDI;
            const comDDIsem9 = "55" + semDDIsem9;

            const r = await dbQ(
              `SELECT id FROM agentes WHERE ativo=true AND whatsapp IN ($1,$2,$3,$4,$5,$6) LIMIT 1`,
              [numeroLimpo, comDDI, semDDI, comDDIcom9, semDDIcom9, comDDIsem9]
            );
            if (!r.rows.length) {
              logger.info(`🚫 Privado não cadastrado: ${remoteJid} | variações testadas: ${[numeroLimpo,comDDI,semDDI,comDDIcom9,semDDIcom9].join(',')}`);
              continue;
            }
            logger.info(`💬 Privado agente confirmado: ${remoteJid}`);
          } catch(e) { logger.warn("⚠️ privado check: " + e.message); continue; }
        }

        // Processa mensagem com IA da equipe
        const textoFinal = msg._textoLimpo || texto;
        logger.info(`💬 Equipe [${instancia}] ${pushName}: ${textoFinal.slice(0, 60)}`);
        const resposta = await processarMensagemEquipe(instancia, remoteJid, pushName, textoFinal);
        if (resposta) {
          await enviarTexto(instancia, remoteJid, resposta);
        }
      }
    }

    // Fallback: se chegou algo com mensagem mas evento não reconhecido, loga para debug
    if (!isMessageEvent && event && !["qrcode.updated","CONNECTION_UPDATE","QRCODE_UPDATED"].includes(event)) {
      logger.info(`📱 Evolution evento não mapeado: "${event}" — body keys: ${Object.keys(body).join(', ')}`);
    }

  } catch(e) {
    logger.error(`❌ Evolution webhook: ${e.message}\n${e.stack?.slice(0,300)}`);
  }
}
