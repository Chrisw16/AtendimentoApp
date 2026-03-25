/**
 * meta.js — Handler unificado Meta (WhatsApp, Instagram, Facebook)
 */
import Anthropic                         from "@anthropic-ai/sdk";
import { registrarMensagem, registrarRespostaIA, resolverConvId } from "../services/chatInterno.js";
import { runMaxxi }                      from "../agent.js";
import { dentroDoHorario, getHorarios }  from "../services/crm.js";
import { getCanal }                      from "../services/canais.js";
import { buscarMemoria, buscarSessao, salvarSessao } from "../services/memoria.js";
import { estaComHumano, transferirParaHumano, getHandoffInfo } from "../services/handoff.js";
import { atualizarStatus } from "../services/chatInterno.js";
import { iniciarReativacao, cancelarReativacao } from "../services/reativacao.js";
import { verificarAlerta }  from "../services/alertas.js";
import { textToSpeech }    from "../services/elevenlabs.js";
import { agendarNPS, estaAguardandoNPS, processarRespostaNPS, marcarAguardandoNPS, limparAguardandoNPS } from "../services/nps.js";
import { logger }                        from "../services/logger.js";
import { promessaPagamento, verificarConexao, consultarClientes, cancelarContrato } from "../services/erp.js";
import { getSaudacao } from "../services/crm.js";
import {
  waSendText, waSendButtons, waSendList, waSendPix, waSendTemplate,
  waMarkRead, registrarMensagemCliente,
  extrairTextoMensagem, extrairIdInterativo, extrairLocalizacao,
  downloadMedia, extrairMediaId,
} from "../services/whatsapp.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Verificação webhook Meta (GET) ────────────────────────────────────────────
export async function handleMetaVerify(req, res, tipo) {
  const mode      = req.query["hub.mode"];
  const token     = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logger.info(`🔍 Meta verify ${tipo} | mode=${mode} | token_recebido="${token}"`);

  if (mode !== "subscribe" || !token || !challenge) {
    return res.sendStatus(400);
  }

  try {
    const canal = await getCanal(tipo);
    const verifyToken = canal?.config?.verifyToken;
    logger.info(`🔍 Token no banco: "${verifyToken}" | Token recebido: "${token}"`);

    if (verifyToken && token === verifyToken) {
      logger.info(`✅ Webhook ${tipo} verificado pelo banco!`);
      return res.status(200).send(challenge);
    }
    const envToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;
    if (envToken && token === envToken) {
      logger.info(`✅ Webhook ${tipo} verificado pela env!`);
      return res.status(200).send(challenge);
    }
    logger.warn(`❌ Token não confere | banco="${verifyToken}" recebido="${token}"`);
  } catch(e) {
    logger.error(`❌ Erro verify ${tipo}: ${e.message}`);
  }
  res.sendStatus(403);
}

// ── Upload de áudio para WhatsApp ────────────────────────────────────────────
async function waUploadAudio(buffer, mimeType = "audio/mpeg") {
  try {
    const { getCanal } = await import("../services/canais.js");
    const canal = await getCanal("whatsapp");
    const token = canal?.config?.accessToken;
    const phoneId = canal?.config?.phoneNumberId;
    if (!token || !phoneId) return null;

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    // WhatsApp aceita audio/mpeg (mp3) como mensagem de áudio normal
    // Para nota de voz (PTT) seria necessário ogg/opus — mp3 funciona como áudio padrão
    form.append("file", new Blob([buffer], { type: "audio/mpeg" }), "maxxi_audio.mp3");
    form.append("type", "audio/mpeg");

    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/media`, {
      method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
    });
    const d = await r.json();
    return d.id || null;
  } catch { return null; }
}

async function enviarAudioWA(to, text) {
  if (!process.env.ELEVENLABS_API_KEY) {
    logger.warn("⚠️ ELEVENLABS_API_KEY não configurada — áudio WA desativado");
    return false;
  }
  try {
    logger.info(`🎙️ Gerando áudio TTS para ${to} (${text.length} chars)`);
    const audioBuffer = await textToSpeech(text);
    logger.info(`🎙️ TTS gerado: ${audioBuffer.length} bytes — fazendo upload WA`);
    const mediaId = await waUploadAudio(audioBuffer);
    if (!mediaId) {
      logger.warn("⚠️ waUploadAudio retornou null — canal WA não configurado?");
      return false;
    }
    logger.info(`🎙️ Upload OK: mediaId=${mediaId}`);

    const { getCanal } = await import("../services/canais.js");
    const canalData = await getCanal("whatsapp");
    const token = canalData?.config?.accessToken;
    const phoneId = canalData?.config?.phoneNumberId;

    const r = await fetch(`https://graph.facebook.com/v19.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "audio",
        audio: { id: mediaId },
      }),
    });
    const d = await r.json();
    return !d.error;
  } catch(e) {
    logger.error(`❌ Áudio WA: ${e.message}`);
    return false;
  }
}

// Detecta se cliente pediu áudio
const AUDIO_TRIGGERS_WA = [
  "manda áudio", "manda audio", "pode mandar áudio", "pode mandar audio",
  "não sei ler", "nao sei ler", "não consigo ler", "nao consigo ler",
  "prefiro áudio", "prefiro audio", "quero áudio", "quero audio",
  "fala pra mim", "não sei escrever", "nao sei escrever",
  "responde em áudio", "responde em audio", "mande áudio", "pode falar",
];
function clientePediuAudio(text) {
  const t = (text || "").toLowerCase();
  return AUDIO_TRIGGERS_WA.some(tr => t.includes(tr));
}

// Map de preferência de áudio por conversa
const audioPrefsWA = new Map();

// ── Envio pelo canal correto ───────────────────────────────────────────────────
async function enviarResposta(tipo, to, text, canal) {
  if (tipo === "whatsapp") {
    // Verifica preferência de áudio
    if (audioPrefsWA.get(to)) {
      const sent = await enviarAudioWA(to, text);
      if (sent) return;
      // Fallback para texto se áudio falhar
    }
    return waSendText(to, text);
  }
  return fetch("https://graph.facebook.com/v19.0/me/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: to },
      message: { text },
      access_token: canal.config.accessToken,
    }),
  }).then(r => r.json());
}

// ── Processa mídia (áudio, imagem, PDF) ───────────────────────────────────────
async function processarMidia(msg) {
  const media = extrairMediaId(msg);
  if (!media) return null;

  try {
    const { buffer, mimeType } = await downloadMedia(media.id);

    // ── ÁUDIO / VOZ ──────────────────────────────────────────────────────
    if (media.tipo === "audio" || media.tipo === "voice") {
      const ext  = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "mp4" : "ogg";
      const mime = mimeType || "audio/ogg";

      // Salva o áudio na tabela chat_midias para o agente ouvir no chat
      let audioMidiaId = null;
      try {
        const { salvarMidia } = await import("../services/chatInterno.js");
        const base64Audio = Buffer.from(buffer).toString("base64");
        audioMidiaId = await salvarMidia(base64Audio, mime);
        logger.info(`🎙️ Áudio salvo na chat_midias: ${audioMidiaId}`);
      } catch(e) {
        logger.warn(`⚠️ Falha ao salvar áudio: ${e.message}`);
      }

      // Transcreve com Whisper se disponível
      let texto = "";
      if (process.env.OPENAI_API_KEY) {
        const formData = new FormData();
        formData.append("file", new Blob([buffer], { type: mimeType }), `audio.${ext}`);
        formData.append("model", "whisper-1");
        formData.append("language", "pt");
        const wRes = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: formData,
        });
        if (wRes.ok) {
          const wData = await wRes.json();
          texto = wData.text?.trim() || "";
          logger.info(`🎙️ Transcrito: "${texto.slice(0, 80)}"`);
        } else {
          logger.warn(`⚠️ Whisper ${wRes.status}`);
        }
      }

      // Retorna formato especial para o chat renderizar player + transcrição
      if (audioMidiaId) {
        return `[audio:${audioMidiaId}:${mime}]\n${texto || "(áudio de voz)"}`;
      }
      // Fallback: só transcrição se não conseguiu salvar o arquivo
      return texto || "[áudio recebido]";
    }

    // ── IMAGEM / STICKER ─────────────────────────────────────────────────
    if (media.tipo === "image" || media.tipo === "sticker") {
      const base64 = Buffer.from(buffer).toString("base64");
      const mime   = mimeType.includes("png") ? "image/png"
                   : mimeType.includes("webp") ? "image/webp" : "image/jpeg";
      const vRes = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
          { type: "text", text: "Analise esta imagem (máx 3 frases). Se for comprovante de pagamento: valor, data, tipo (Pix/boleto/TED). Se for print de erro/tela: descreva o problema. Se for roteador/cabo/equipamento: estado do equipamento. Se for documento: tipo e dados principais. Responda em português direto." }
        ]}],
      });
      const desc = vRes.content[0]?.text?.trim() || "Imagem recebida";
      logger.info(`📸 Imagem: "${desc.slice(0, 80)}"`);
      // Salva imagem na tabela chat_midias e referencia por ID curto
      try {
        const { salvarMidia } = await import("../services/chatInterno.js");
        const midiaId = await salvarMidia(base64, mime);
        // Formato reconhecido pelo Chat.jsx: [media:ID:mime]\ndescrição
        return `[media:${midiaId}:${mime}]\n${desc}`;
      } catch {
        return `[imagem] ${desc}`;
      }
    }

    // ── DOCUMENTO / PDF ──────────────────────────────────────────────────
    if (media.tipo === "document") {
      const fileName = msg.document?.filename || "documento";
      if (mimeType === "application/pdf") {
        const base64 = Buffer.from(buffer).toString("base64");
        const pRes = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{ role: "user", content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
            { type: "text", text: "Resuma este PDF em até 4 frases. Foque em informações úteis para suporte de internet (comprovante, fatura, contrato). Responda em português." }
          ]}],
        });
        const resumo = pRes.content[0]?.text?.trim() || "PDF recebido";
        logger.info(`📄 PDF ${fileName}: "${resumo.slice(0, 80)}"`);
        return `[PDF: ${fileName}] ${resumo}`;
      }
      return `[documento: ${fileName}]\n📄 Documento recebido: ${fileName}`;
    }

  } catch(e) {
    logger.error(`❌ Erro mídia: ${e.message}`);
  }
  return null;
}

// Alias para compatibilidade interna
async function enviarBotoesWA(tipo, to, body, botoes, canal) {
  if (tipo === "whatsapp") {
    try { return await waSendButtons(to, body, botoes); } catch {}
  }
  return enviarResposta(tipo, to, body, canal);
}

// ── Handler principal (POST) ──────────────────────────────────────────────────

// ── HELPERS DE CÓDIGO (sem IA) ────────────────────────────────────────────────

/** Converte AAAA-MM-DD → DD/MM/AAAA para exibir ao cliente */
function fmtData(iso) {
  if (!iso) return "";
  const m = String(iso).match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return iso;
}

/** Formata valor como R$ XX,XX */
function fmtValor(v) {
  const n = parseFloat(String(v).replace(",","."));
  return isNaN(n) ? "?" : "R$ " + n.toFixed(2).replace(".",",");
}

/** Gera protocolo único — usa gerarProtocolo do protocolo.js (formato CIT...) */
async function gerarProtocoloAtd() {
  const { gerarProtocolo } = await import("../services/protocolo.js");
  return gerarProtocolo();
}

/** Detecta se mensagem é um CPF/CNPJ */
function detectarCPFCNPJ(texto) {
  const digits = (texto||"").replace(/\D/g,"");
  if (digits.length === 11 || digits.length === 14) return digits;
  return null;
}

/** Detecta intenção de pagamento */
function detectarIntencaoPagamento(texto) {
  const t = (texto||"").toLowerCase();
  return /pagar|boleto|segunda via|2a via|débito|debito|fatura|vencimento|pix|quero pag/.test(t);
}

/** Detecta problema de conexão */
function detectarProblemaConexao(texto) {
  const t = (texto||"").toLowerCase();
  return /internet caiu|sem internet|sem acesso|caiu a net|sem conex|offline|nao conecta|não conecta|sem sinal|net caiu|wifi caiu|fibra caiu|caiu o sinal/.test(t);
}

export async function handleMetaWebhook(req, res) {
  res.sendStatus(200); // Responde imediatamente — Meta exige < 5s

  const body = req.body;
  if (!["whatsapp_business_account", "instagram", "page"].includes(body.object)) return;

  const tipo = body.object === "whatsapp_business_account" ? "whatsapp"
             : body.object === "instagram" ? "instagram" : "facebook";

  const canal = await getCanal(tipo);
  if (!canal?.ativo) {
    logger.warn(`⚠️ Canal ${tipo} inativo ou não configurado`);
    return;
  }

  for (const entry of (body.entry || [])) {
    for (const change of (entry.changes || entry.messaging || [])) {

      // ── WhatsApp ──────────────────────────────────────────────────────
      if (tipo === "whatsapp") {
        const value    = change.value || {};
        const msgs     = value.messages || [];
        const statuses = value.statuses || [];

        // Processa status de leitura (sent/delivered/read)
        for (const st of statuses) {
          if (!st.id || !st.status) continue;
          const stStatus = { sent: "sent", delivered: "delivered", read: "read" }[st.status];
          if (!stStatus) continue;
          try {
            const { atualizarStatusMensagem } = await import("../services/chatInterno.js");
            const convId = `whatsapp_${st.recipient_id || ""}`;
            await atualizarStatusMensagem(convId, st.id, stStatus, st.timestamp).catch(() => {});
          } catch {}
        }
        if (statuses.length && !msgs.length) continue; // ignora se só status

        for (const msg of msgs) {
          const from  = msg.from;
          const nome  = value.contacts?.[0]?.profile?.name || from;
          const msgId = msg.id;

          waMarkRead(msgId).catch(() => {});
          registrarMensagemCliente(from);
          // Busca e salva foto de perfil do cliente via Graph API (assíncrono, não bloqueia)
          const convIdFoto = `whatsapp_${from}`;
          Promise.all([
            import("../services/whatsapp.js"),
            import("../services/chatInterno.js"),
          ]).then(async ([{ buscarFotoPerfil }, { atualizarFotoPerfil }]) => {
            const fotoUrl = await buscarFotoPerfil(from).catch(() => null);
            if (fotoUrl) await atualizarFotoPerfil(convIdFoto, fotoUrl).catch(() => {});
          }).catch(() => {});
          cancelarReativacao(`whatsapp_${from}`);

          // ── Mensagem editada — atualiza no painel ─────────────────────────
          if (msg.type === "edited" || msg.edited) {
            const editedText = msg.edited?.text || msg.text?.body || "";
            const originalMsgId = msg.edited?.message_id || msg.context?.id;
            if (editedText && originalMsgId) {
              try {
                const { atualizarMensagemEditada } = await import("../services/chatInterno.js");
                const convId = `whatsapp_${from}`;
                await atualizarMensagemEditada(convId, originalMsgId, editedText).catch(() => {});
              } catch {}
            }
            continue;
          }

          // Detecta texto ou mídia
          let conteudo = extrairTextoMensagem(msg);
          // Reações (tipo "reaction") retornam null — ignora silenciosamente
          if (conteudo === null) continue;

          // ── Detecta encaminhamento ────────────────────────────────────────
          const isForwarded = !!(msg.context?.forwarded || msg.context?.frequently_forwarded);
          if (isForwarded) {
            conteudo = `[encaminhado] ${conteudo}`;
          }

          const idInter = extrairIdInterativo(msg);

          // Intercepta mensagem de localização GPS
          const locMsg = extrairLocalizacao(msg);
          if (locMsg && !isNaN(locMsg.lat) && !isNaN(locMsg.lng)) {
            try {
              const { consultarPorLocalizacao } = await import("../services/cobertura.js");
              const resultado = await consultarPorLocalizacao(locMsg.lat, locMsg.lng, from);
              const end = resultado.enderecoResolvido;
              const endStr = end ? `\n📍 ${end.logradouro ? end.logradouro + (end.numero ? ', ' + end.numero : '') + '\n' : ''}${end.bairro ? end.bairro + ', ' : ''}${end.cidade || ''}` : '';

              if (resultado.cobertura) {
                const zona = resultado.zona;
                const planos = resultado.planos || [];
                const planosStr = planos.length
                  ? '\n\n📡 Planos disponíveis na sua região:\n' + planos.map(p => `• *${p.nome}* — ${p.velocidade} Mega — R$ ${parseFloat(p.valor||0).toFixed(2).replace('.',',')} /mês`).join('\n')
                  : '';
                const resposta = `✅ *Boa notícia!* Temos cobertura no seu endereço! 🎉${endStr}\n🗺️ Zona: ${zona.nome}${planosStr}\n\nDeseja contratar? 😊`;
                await enviarResposta(tipo, from, resposta, canal);
                // Avança para o fluxo comercial com dados pré-preenchidos
                conteudo = `[cobertura_confirmada:${locMsg.lat},${locMsg.lng}:${resultado.cidade_id || ''}]`;
                // Salva coordenadas na sessão para usar no cadastro
                try {
                  const { salvarSessao } = await import("../services/memoria.js");
                  await salvarSessao(from, { _lat: locMsg.lat, _lng: locMsg.lng, _map_ll: `${locMsg.lat},${locMsg.lng}` });
                } catch {}
              } else {
                const prox = resultado.zonaMaisProxima;
                const proxStr = prox ? `\n\nA cobertura mais próxima fica a aproximadamente *${prox.distanciaKm}km* deste endereço (${prox.nome}).` : '';
                const resposta = `😔 Ainda não temos cobertura neste endereço.${endStr}${proxStr}\n\nGostaria de entrar na *lista de espera*? Quando chegarmos na sua região, você será o primeiro a saber! 📋`;
                await enviarBotoesWA(tipo, from, resposta, [
                  { id: 'lista_espera_sim', title: '✅ Quero entrar na lista' },
                  { id: 'lista_espera_nao', title: '❌ Não, obrigado' },
                ], canal);
                return;
              }
            } catch(e) {
              console.warn("⚠️ Cobertura GPS:", e.message);
              conteudo = extrairTextoMensagem(msg);
            }
          }

          // Processa mídia se houver
          const mediaTexto = await processarMidia(msg);
          if (mediaTexto) {
            conteudo = mediaTexto;
            // Cliente mandou áudio de voz → ativa resposta em áudio automaticamente
            const mediaInfo = extrairMediaId(msg);
            if (mediaInfo && (mediaInfo.tipo === "audio" || mediaInfo.tipo === "voice")) {
              if (process.env.ELEVENLABS_API_KEY) {
                audioPrefsWA.set(from, true);
              }
            }
          }

          logger.info(`📩 WhatsApp | ${nome} (${from}): ${conteudo.slice(0, 80)}`);
          verificarAlerta(from, conteudo, "whatsapp").catch(()=>{});

          // Detecta se cliente pediu áudio e persiste na sessão
          if (clientePediuAudio(conteudo)) {
            audioPrefsWA.set(from, true);
            try {
              const { salvarSessao, getSessao } = await import("../services/memoria.js");
              const sessAudio = await getSessao(from) || {};
              await salvarSessao(from, { ...sessAudio, _prefere_audio: true });
            } catch {}
          }
          // Restaura preferência de áudio da sessão persistida
          if (!audioPrefsWA.has(from)) {
            try {
              const { getSessao } = await import("../services/memoria.js");
              const sessAudio = await getSessao(from);
              if (sessAudio?._prefere_audio) audioPrefsWA.set(from, true);
            } catch {}
          }

          await processarMensagem({ tipo, from, nome, conteudo, idInterativo: idInter, canal, msgId });
        }

      // ── Instagram / Facebook ──────────────────────────────────────────
      } else {
        for (const m of (change.messaging || [])) {
          if (!m.message?.text) continue;
          const from     = m.sender.id;
          const conteudo = m.message.text;
          logger.info(`📩 ${tipo} | ${from}: ${conteudo.slice(0, 60)}`);
          await processarMensagem({ tipo, from, nome: from, conteudo, idInterativo: null, canal, msgId: m.message.mid });
        }
      }
    }
  }
}

// ── Processamento central ─────────────────────────────────────────────────────
async function processarMensagem({ tipo, from, nome, conteudo, idInterativo, canal, msgId }) {
  // Fora do horário
  if (!(await dentroDoHorario())) {
    const { getCfg } = await import("../services/crm.js");
    const cfgFora = (await getCfg("horario_fora")) || {};

    // IA continua para self-service (boleto, protocolo, etc.)
    // Mas se pedir humano → pergunta assunto e abre chamado
    const lower = (conteudo || "").toLowerCase();
    const pedindoHumano = /humano|atendente|pessoa|falar com|quero falar|ajuda humana/i.test(lower);
    const sessaoFora = await getSessao(from).catch(() => ({}));

    if (pedindoHumano || sessaoFora?._fora_aguardando_assunto) {
      if (!sessaoFora?._fora_aguardando_assunto) {
        // Primeira vez pedindo humano — pergunta o assunto
        await salvarSessao(from, { ...sessaoFora, _fora_aguardando_assunto: true });
        const msg = cfgFora.msg_fora || "Nosso atendimento humano funciona de Seg-Sex, das 08h às 18h. Mas posso te ajudar agora! 😊 Qual é o seu assunto?";
        await enviarResposta(tipo, from, msg, canal);
        return;
      } else {
        // Cliente respondeu o assunto — tenta resolver via IA ou abre chamado
        await salvarSessao(from, { ...sessaoFora, _fora_aguardando_assunto: false });

        if (cfgFora.abrir_chamado !== false) {
          // Abre chamado com o assunto informado
          const convId = `${tipo}_${from}`;
          const prot = sessaoFora._protocolo || gerarProtocolo();
          try {
            const { criarChamadoFora } = await import("../services/erp.js");
            await criarChamadoFora({ telefone: from, assunto: conteudo, protocolo: prot }).catch(() => {});
          } catch {}
          const msgChamado = (cfgFora.msg_chamado || "Registrei sua solicitação! 📋 Nossa equipe irá te atender assim que o expediente começar. Protocolo: *{protocolo}*")
            .replace("{protocolo}", prot);
          await enviarResposta(tipo, from, msgChamado, canal);
          return;
        }
      }
    }

    // Se ia_continua está ativo, processa normalmente (self-service)
    if (cfgFora.ia_continua !== false) {
      // Continua para o processamento normal da IA
    } else {
      const msg = cfgFora.msg_fora || "Estamos fora do horário de atendimento. Retornamos em breve!";
      await enviarResposta(tipo, from, msg, canal);
      return;
    }
  }

  const baseConvId = `${tipo}_${from}`;
  // Se cliente retorna após conversa encerrada, novo protocolo = novo convId
  const convId = await resolverConvId(baseConvId, from, tipo);
  const isNovoAtendimento = convId !== baseConvId;

  // Verifica se está aguardando resposta NPS
  const npsInfo = estaAguardandoNPS(from);
  if (npsInfo) {
    const npsResult = await processarRespostaNPS(from, conteudo, tipo, npsInfo.protocolo, {
      nome: nome || from,
      convId: convId || baseConvId || from,
    });
    if (npsResult) {
      limparAguardandoNPS(from);
      await enviarResposta(tipo, from, npsResult.resposta, canal);
      return;
    }
  }

  // Registra no chat interno
  await registrarMensagem({
    convId, telefone: from, nome,
    conteudo: idInterativo ? `[botão: ${conteudo}]` : conteudo,
    canal: tipo, accountId: null, statusInicial: "ia",
  });

  // Handoff: se já está com humano ou aguardando humano — IA silencia
  if (estaComHumano(convId)) {
    logger.info(`👨 Conv ${convId} com humano — IA silenciada`);
    // Garante que status está correto no banco
    const hi = getHandoffInfo(convId);
    if (hi && !hi.agenteId) {
      // Ainda aguardando - atualiza status e notifica
      await atualizarStatus(convId, "aguardando").catch(() => {});
    }
    return;
  }

  // ── MOTOR DE FLUXO VISUAL — prioridade máxima ─────────────────────────────
  try {
    const { executarFluxo, carregarFluxoAtivo } = await import("../services/motor-fluxo.js");
    const fluxoAtivo = await carregarFluxoAtivo(false, tipo);
    if (fluxoAtivo?.dados) {
      const sessaoFluxo = await buscarSessao(from);
      // Só usa o motor se o canal tem fluxo vinculado OU se a sessão já está em andamento no motor
      const sessaoNoMotor = sessaoFluxo?._fluxo_no !== undefined;
      const canalTemFluxo = !!fluxoAtivo;
      if (canalTemFluxo || sessaoNoMotor) {
        const resultado = await executarFluxo({
          telefone: from,
          mensagem: idInterativo || conteudo,
          sessao: sessaoFluxo || {},
          conversationId: convId,
          canal: tipo,
          accountId: null,
          enviarFn: async (texto) => {
            await registrarRespostaIA(convId, texto).catch(() => {});
            const partes = texto.split("\n---\n").filter(Boolean);
            for (const p of partes) await enviarResposta(tipo, from, p.trim(), canal);
          },
          enviarBotoesFn: async (corpo, botoes) => {
            await registrarRespostaIA(convId, corpo).catch(() => {});
            await waSendButtons(from, corpo, botoes.map(b => ({ id: b.id, title: b.title })));
          },
          enviarListaFn: async (corpo, label, secoes) => {
            await registrarRespostaIA(convId, corpo).catch(() => {});
            await waSendList(from, corpo, label, secoes);
          },
          transferirFn: async (motivo) => {
            await transferirParaHumano(convId, tipo, from, motivo, canal);
          },
        });

        if (resultado) {
          // Salva sessão atualizada do motor
          if (resultado.sessaoAtualizada) {
            await salvarSessao(from, resultado.sessaoAtualizada).catch(() => {});
          }
          // Motor processou — sempre para aqui, nunca cai nos intercepts/runMaxxi
          // Tipos: "aguardando", "encerrado", "transferido", "resetado", "fim", "ia"
          return;
        }
      }
    }
  } catch(e) {
    logger.warn("⚠️ Motor de fluxo erro: " + e.message);
    // Fallback: continua para IA tradicional
  }

  // ── INTERCEPT DE BOLETO — prova de bala, detecta qualquer forma de seleção ──
  const sessaoBot = await buscarSessao(from);
  if (sessaoBot?.boletos_pendentes?.length > 0) {
    const bPend = sessaoBot.boletos_pendentes;
    let b = null;

    // Busca o boleto escolhido por qualquer meio possível
    const textoTotal = String(conteudo||"") + " " + String(idInterativo||"");

    // Forma 1: id numérico (list_reply.id = "1", "2"...)
    if (idInterativo && /^\d+$/.test(String(idInterativo).trim())) {
      const idx = parseInt(idInterativo) - 1;
      b = bPend[idx] || null;
    }
    // Forma 2: cliente digitou "1" ou "2"
    if (!b && !idInterativo && /^\s*[1-9]\s*$/.test(conteudo)) {
      b = bPend[parseInt(conteudo.trim()) - 1] || null;
    }
    // Forma 3: fatura_id aparece em qualquer parte (conteudo ou idInterativo)
    if (!b) {
      const m = textoTotal.match(/Fatura #?(\d+)|#(\d+)/);
      if (m) {
        const fId = m[1] || m[2];
        b = bPend.find(x => String(x.fatura_id) === fId) || null;
      }
    }
    // Forma 4 (fallback): qualquer interação com botão quando há apenas 1 boleto pendente
    if (!b && idInterativo && bPend.length === 1) {
      b = bPend[0];
      logger.info("Boleto intercept fallback: 1 boleto pendente, qualquer botao aceito");
    }

    if (b) {
      logger.info("Boleto intercept OK: Fatura #" + b.fatura_id);
      const vencFmt = fmtData(b.vencimento_atual || b.vencimento_original);
      const msg = "Segue o boleto da Fatura #" + b.fatura_id + " — " + fmtValor(b.valor_cobrado) + " | Venc: " + vencFmt;
      await registrarRespostaIA(convId, msg).catch(() => {});
      // Pega status do contrato da sessão para mensagem correta
      const stContrato = sessaoBot?.contratos?.[0]?.status || sessaoBot?.status_contrato || null;
      await waSendPix(from, {
        codigoPix:      b.pix_copia_cola,
        linhaDigitavel: b.linha_digitavel,
        valor:          b.valor_cobrado,
        vencimento:     vencFmt,
        descricao:      "Fatura #" + b.fatura_id + (b.vencido ? " (Vencida)" : ""),
        linkCobranca:   b.link_cobranca,
        statusContrato: stContrato,
      });
      await salvarSessao(from, { ...sessaoBot, boletos_pendentes: null }).catch(() => {});
      return;
    }
  }

  // ── INTERCEPT DE BOTÕES (sem IA) ────────────────────────────────────────────
  if (idInterativo) {
    const sessaoBot2 = await buscarSessao(from);

    // Respostas fixas imediatas
    const respostasFixas = {
      "sat_otimo":          "😊 Fico muito feliz em saber! Obrigado pela avaliação. Até a próxima! 👋",
      "sat_regular":        "Obrigado pelo feedback! Vamos sempre buscar melhorar 💪. Até mais!",
      "cancelar_promessa":  "Tudo bem! Me avise quando quiser usar a promessa. Posso ajudar com mais alguma coisa?",
      "pix_copy":           "✅ Perfeito! Após o pagamento, a liberação é automática em até 10 minutos. Precisa de mais alguma coisa?",
      "aguardar":           "⏳ Certo! Nossa equipe entra em contato em breve. Qualquer dúvida, estou aqui! 😊",
      "cancelar_contrato_nao": "Que ótimo! Fico feliz em continuar te atendendo 😊 Posso ajudar com mais alguma coisa?",
    };
    if (respostasFixas[idInterativo]) {
      await registrarRespostaIA(convId, respostasFixas[idInterativo]).catch(() => {});
      await enviarResposta(tipo, from, respostasFixas[idInterativo], canal);
      return;
    }

    // sat_ruim → resposta fixa + transfere para humano
    if (idInterativo === "sat_ruim") {
      const resp = "Sinto muito pela experiência 😔 Vou te transferir para um atendente para resolver melhor. Aguarde!";
      await registrarRespostaIA(convId, resp).catch(() => {});
      await enviarResposta(tipo, from, resp, canal);
      await transferirParaHumano(convId, null, "Insatisfação: sat_ruim");
      return;
    }

    // cancelar_contrato_confirma → 2ª confirmação (duplo check)
    if (idInterativo === "cancelar_contrato_confirma") {
      const contrato = sessaoBot2?.contrato_ativo || sessaoBot2?.contratos?.[0]?.id;
      const endereco  = sessaoBot2?.contratos?.[0]?.end || "";
      const endText = endereco ? "\n📍 " + endereco : "";
      try {
        await waSendButtons(from,
          "⚠️ *ÚLTIMA CONFIRMAÇÃO*" + endText + "\n\nAo confirmar:\n• Acesso interrompido imediatamente\n• Técnico passará para recolher o equipamento\n\nTem certeza?",
          [
            { id: "cancelar_contrato_definitivo", title: "🔴 Confirmar cancelamento" },
            { id: "cancelar_contrato_nao",        title: "✅ Não, manter serviço"  },
          ]
        );
      } catch(e) {
        await enviarResposta(tipo, from, "Confirma o cancelamento definitivo? Responda SIM para cancelar.", canal);
      }
      return;
    }

    // cancelar_contrato_definitivo → executa o cancelamento de fato
    if (idInterativo === "cancelar_contrato_definitivo") {
      const contrato = sessaoBot2?.contrato_ativo || sessaoBot2?.contratos?.[0]?.id;
      if (!contrato) {
        await enviarResposta(tipo, from, "Não encontrei o contrato. Me informe seu CPF ou CNPJ para continuar.", canal);
        return;
      }
      try {
        const r = await cancelarContrato(String(contrato));
        logger.info("Cancelamento result: " + JSON.stringify(r));
        const resp = "✅ Cancelamento registrado.\n\nSeu acesso foi interrompido.\n\n📦 *Sobre o equipamento:*\nNosso técnico passará para recolher o roteador/ONU em breve. Deixe-o disponível para evitar cobranças adicionais.\n\nAgradecemos por ter sido nosso cliente! Se precisar de nós novamente, estaremos aqui. 🙏";
        await registrarRespostaIA(convId, resp).catch(() => {});
        await enviarResposta(tipo, from, resp, canal);
        // Notifica técnicos sobre cancelamento — prioridade de retirada
        try {
          const { notificarTecnicosCancelamento } = await import("../services/notif-agentes.js");
          const contInfo = sessaoBot2?.contratos?.[0];
          await notificarTecnicosCancelamento({
            nome: sessaoBot2?.nome || from,
            contrato,
            endereco: contInfo?.end || contInfo?.endereco || "",
            telefone: from,
            plano: contInfo?.plano || "",
          });
        } catch(e) { logger.warn("⚠️ notif cancelamento: " + e.message); }
        // Transfere para humano para acompanhar
        await transferirParaHumano(convId, null, "Cancelamento de contrato confirmado").catch(() => {});
      } catch(e) {
        logger.error("Cancelamento erro: " + e.message);
        await enviarResposta(tipo, from, "Tive um problema ao processar o cancelamento. Um de nossos atendentes irá te ajudar.", canal);
        await transferirParaHumano(convId, null, "Erro no cancelamento — verificar manualmente").catch(() => {});
      }
      return;
    }

        // confirmar_promessa → chama API de promessa direto
    if (idInterativo === "confirmar_promessa") {
      const contrato = sessaoBot2?.contrato_ativo || sessaoBot2?.contratos?.[0]?.id;
      if (contrato) {
        try {
          const r = await promessaPagamento(String(contrato));
          logger.info("Promessa result: " + JSON.stringify(r));
          let resp;
          const sucesso = r?.liberado === true || r?.liberado === 1 || r?.liberado === "1"
            || r?.status === "ok" || r?.status === "liberado" || r?.status === 1;
          if (sucesso) {
            const dataProm = fmtData(r.data_promessa);
            const diasLib = r._raw?.liberado_dias || 3;
            resp = "✅ *Acesso liberado por " + diasLib + " dias!*\n\n"
              + "🔑 Protocolo: " + (r.protocolo || "registrado") + "\n"
              + "📅 Pague até: *" + dataProm + "*\n\n"
              + "⚠️ Lembre-se: após esse prazo, o acesso é bloqueado novamente.\n"
              + "Essa opção está disponível 1x por mês. 🙏";
          } else {
            const msgSgp = (r?.msg || "").toLowerCase();
            if (msgSgp.includes("j") && (msgSgp.includes("utiliz") || msgSgp.includes("mes") || msgSgp.includes("mês"))) {
              resp = "❌ Você já utilizou a promessa de pagamento neste mês.\n\nEssa opção está disponível apenas *1x por mês*. Para regularizar o acesso, efetue o pagamento do boleto. Precisa da 2ª via?";
            } else if (msgSgp.includes("ativo") || msgSgp.includes("adimplente")) {
              resp = "✅ Seu contrato já está ativo! Não há necessidade de promessa de pagamento.";
            } else if (r?.msg) {
              resp = "ℹ️ " + r.msg + "\n\nPrecisa de mais alguma coisa?";
            } else {
              resp = "Não foi possível registrar a promessa. Por favor, entre em contato com nosso suporte.";
            }
          }
          await registrarRespostaIA(convId, resp).catch(() => {});
          await enviarResposta(tipo, from, resp, canal);
        } catch(e) {
          logger.error("Promessa erro: " + e.message);
          await enviarResposta(tipo, from, "Tive um problema ao processar. Tente novamente em instantes.", canal);
        }
      } else {
        await enviarResposta(tipo, from, "Não encontrei seu contrato. Me informe seu CPF ou CNPJ para continuar.", canal);
      }
      return;
    }

    // ainda_problema → verifica conexão direto
    if (idInterativo === "ainda_problema") {
      const contrato = sessaoBot2?.contrato_ativo || sessaoBot2?.contratos?.[0]?.id;
      if (contrato) {
        try {
          const r = await verificarConexao(String(contrato));
          const acesso = r?.acesso;
          let resp;
          if (acesso === true || acesso === "online" || r?.status === "ativo") {
            resp = "✅ O sistema mostra que sua conexão está ativa! Tente reiniciar o roteador:\n1️⃣ Desligue o roteador da tomada\n2️⃣ Aguarde 30 segundos\n3️⃣ Ligue novamente e aguarde 2 minutos\n\nSe persistir, vou abrir um chamado técnico.";
          } else {
            resp = `⚠️ Identificamos instabilidade na sua conexão. Estou registrando um chamado técnico para você. Nossa equipe entrará em contato em breve! Protocolo gerado automaticamente.`;
          }
          await registrarRespostaIA(convId, resp).catch(() => {});
          await enviarResposta(tipo, from, resp, canal);
        } catch(e) {
          await enviarResposta(tipo, from, "Vou registrar um chamado para nossa equipe técnica analisar.", canal);
        }
      } else {
        await enviarResposta(tipo, from, "Vou acionar nossa equipe técnica. Me informe seu CPF ou CNPJ para abrir o chamado.", canal);
      }
      return;
    }
  }

  // ── INTERCEPT DE TEXTO SEM IA ─────────────────────────────────────────────
  const textoLimpo = (conteudo||"").trim();
  const sessaoTexto = await buscarSessao(from);

  // ── /sair — reseta sessão completamente ────────────────────────────────────
  if (/^\/sair$/i.test(textoLimpo) || /^(encerrar|cancelar|reiniciar|reset)$/i.test(textoLimpo)) {
    logger.info(`🚪 /sair: resetando sessão de ${from}`);
    await salvarSessao(from, {}).catch(() => {});
    const saudacaoReset = "✅ Atendimento encerrado! Para iniciar um novo atendimento, é só me chamar. 😊";
    await registrarRespostaIA(convId, saudacaoReset).catch(() => {});
    await enviarResposta(tipo, from, saudacaoReset, canal);
    return;
  }

  // CPF/CNPJ já identificado na sessão — salva na memória persistente também
  if (sessaoTexto?.cpfcnpj) {
    const { salvarMemoria } = await import("../services/memoria.js").catch(() => ({ salvarMemoria: null }));
    if (salvarMemoria) {
      salvarMemoria(from, { cpfcnpj: sessaoTexto.cpfcnpj, nome: sessaoTexto.nome }).catch(() => {});
    }
  }

  // Cliente digitou CPF/CNPJ mas já temos na sessão — ignora e continua com o que já tem
  const cpfDigitado = detectarCPFCNPJ(textoLimpo);
  if (cpfDigitado && sessaoTexto?.cpfcnpj) {
    const cpfSessao = (sessaoTexto.cpfcnpj || "").replace(/\D/g, "");
    if (cpfDigitado === cpfSessao) {
      logger.info("CPF já na sessão — ignorando re-digitação");
      // Não processa — deixa a IA responder com o que já tem em sessão
    }
  }

  // CPF/CNPJ digitado + cliente quer pagar → lista boletos direto
  const cpfDetectado = detectarCPFCNPJ(textoLimpo);
  if (cpfDetectado && detectarIntencaoPagamento(sessaoTexto?._ultimaIntencao || "")) {
    // Guarda intenção e CPF, deixa IA resolver (ela já foi instruída)
    // Mas guarda a intenção para próxima mensagem
  }

  // Problema de conexão com contrato identificado → verifica conexão direto
  if (detectarProblemaConexao(textoLimpo) && sessaoTexto?.contrato_ativo) {
    logger.info(`⚡ Intercept: problema conexão detectado para contrato ${sessaoTexto.contrato_ativo}`);
    try {
      const r = await verificarConexao(String(sessaoTexto.contrato_ativo));
      const acesso = r?.acesso;
      const protoc = await gerarProtocoloAtd();
      let resp;
      if (acesso === true || acesso === "online" || r?.status === "ativo") {
        resp = `😕 Entendo! O sistema mostra sua conexão ativa, mas pode ter instabilidade.

🔄 *Tente reiniciar o roteador:*
1️⃣ Desligue da tomada
2️⃣ Aguarde 30 segundos
3️⃣ Ligue e aguarde 2 minutos

Se não resolver, me avise que abro chamado técnico! Protocolo: ${protoc}`;
      } else {
        resp = `⚠️ Identificamos instabilidade no seu acesso.

Protocolo: *${protoc}*
Já registramos para nossa equipe técnica. Você será contatado em breve! ⏰`;
      }
      await registrarRespostaIA(convId, resp).catch(() => {});
      await enviarResposta(tipo, from, resp, canal);
      return; // Não passa para IA
    } catch {}
  }

  // Despedida após atendimento concluído → pesquisa satisfação sem pedir CPF
  const ehDespedida = /^(obrigad[oa]|valeu|vlw|de nada|ok|certo|entend[ie]|fechado?|flw|até mais|até logo|tudo bem|tudo ótimo|tá bom|ta bom|ótimo|otimo)[\s!.]*$/i.test(textoLimpo);
  if (ehDespedida && sessaoTexto?.cpfcnpj) {
    // Cliente já foi identificado e agradeceu → pesquisa de satisfação
    logger.info("⚡ Intercept despedida após atendimento identificado");
    await waSendButtons(from,
      "Foi um prazer te atender! 😊 Como avalia nosso atendimento hoje?",
      [
        { id: "sat_otimo",   title: "⭐ Ótimo"    },
        { id: "sat_regular", title: "😐 Regular"  },
        { id: "sat_ruim",    title: "👎 Ruim"     },
      ]
    );
    await registrarRespostaIA(convId, "Foi um prazer te atender! 😊 Como avalia nosso atendimento?").catch(() => {});
    return;
  }

  // Saudação inicial → protocolo só em conversa REALMENTE nova
  // Critérios para considerar nova conversa:
  // 1. Sem CPF/contrato na sessão (cliente não identificado)
  // 2. Sem protocolo ativo (_protocolo vazio)
  // 3. Sem estado de fluxo em andamento (_estado = inicio ou vazio)
  // 4. Último atendimento foi há mais de 4 horas (evita novo protocolo por simples "opa")
  const semProtocolo = !sessaoTexto?._protocolo;
  const semEstado = !sessaoTexto?._estado || sessaoTexto._estado === "inicio";
  const semCpf = !sessaoTexto?.cpfcnpj && !sessaoTexto?.contrato_ativo;
  const ultimaAtiv = sessaoTexto?._lastActivity ? new Date(sessaoTexto._lastActivity).getTime() : 0;
  const inativoHa4h = ultimaAtiv === 0 || (Date.now() - ultimaAtiv > 4 * 3600000);
  const isNovaConversaReal = semCpf && semProtocolo && semEstado && inativoHa4h;

  // Saudação de nova conversa → deixa agent.js processar para mostrar botões (Sou cliente / Quero contratar)

  // Roda a IA
  try {
    const memoria   = await buscarMemoria(from);
    const sessao    = await buscarSessao(from);
    const protocolo = `${tipo.toUpperCase().slice(0,2)}-${Date.now().toString(36).toUpperCase()}`;
    const conteudoFinal = idInterativo ? `${conteudo} [id:${idInterativo}]` : conteudo;

    const result = await runMaxxi({
      accountId: null, conversationId: convId, messageId: msgId,
      content: conteudoFinal,
      sender: { name: nome, phone_number: from },
      channel: tipo, protocolo, memoria, telefone: from, sessao,
    });

    if (result?.reply) {
      await registrarRespostaIA(convId, result.reply).catch(() => {});
      const partes = result.reply.split("\n---\n").filter(Boolean);
      for (const parte of partes) await enviarResposta(tipo, from, parte.trim(), canal);
      // Incrementa contador de atendimentos IA
      try {
        const { incrementStats } = await import("../services/logger.js");
        await incrementStats(0, 0, 0, false);
      } catch {}
    }

    if (result?.reply && !result?.handoff && !result?.resolve) {
      // Inicia reativação após resposta da IA
      iniciarReativacao({
        convId, canal: tipo, telefone: from, accountId: null,
        enviarFn: async (_cId, canalEnv, tel, _accId, msg) => {
          await enviarResposta(canalEnv, tel, msg, canal);
        },
      }).catch(() => {});
    }
    // IA reage com moderação em mensagens positivas (máx 1 por conversa)
    if (result?.reply) {
      try {
        const lowerContent = (conteudo || "").toLowerCase();
        const isPosMsg = /obrigad|valeu|resolveu|voltou|funcionou|top|perfeito|excelente|ajudou/i.test(lowerContent);
        if (isPosMsg) {
          const { adicionarReacao, fetchConversa } = await import("../services/chatInterno.js");
          const convCheck = await fetchConversa(convId).catch(() => null);
          const msgs = convCheck?.mensagens || [];
          const jaReagiu = msgs.some(m => m.reacoes?.ia);
          if (!jaReagiu) {
            // Encontra a última mensagem do cliente para reagir
            const lastClientMsg = [...msgs].reverse().find(m => m.role === 'cliente');
            if (lastClientMsg?.id) {
              const emojisPos = ['👍', '❤️', '🙏'];
              const emoji = emojisPos[Math.floor(Math.random() * emojisPos.length)];
              await adicionarReacao(convId, lastClientMsg.id, emoji, 'ia').catch(() => {});
            }
          }
        }
      } catch {}
    }

    if (result?.resolve) {
      // Agenda NPS pós-atendimento
      const _prot = sessao?._protocolo || result?.sessaoAtualizada?._protocolo || convId || from;
      agendarNPS({
        telefone: from, canal: tipo, protocolo: _prot,
        enviarFn: async (pergunta) => {
          marcarAguardandoNPS(from, _prot);
          await enviarResposta(tipo, from, pergunta, canal);
        },
      }).catch(()=>{});
    }
    if (result?.handoff) {
      // Envia mensagem de confirmação ao cliente antes de transferir
      const msgTransferencia = result?.reply
        ? null  // IA já enviou mensagem de aviso
        : "⏳ Transferindo para um atendente humano... Aguarde um momento, em breve alguém irá atendê-lo!";
      if (msgTransferencia) {
        await registrarRespostaIA(convId, msgTransferencia).catch(() => {});
        await enviarResposta(tipo, from, msgTransferencia, canal);
      }
      await transferirParaHumano(convId, null, "Transferido pela IA");
    }
    // Salva sessão: prioriza sessaoAtualizada da IA, mas sempre preserva cpfcnpj/contrato existentes
    const sessaoExistente = await buscarSessao(from).catch(() => null);
    const sessaoParaSalvar = {
      ...(sessaoExistente || {}),
      ...(result?.sessaoAtualizada || {}),
    };
    // Salva sessão: sempre salva quando houve reset, ou quando tem estado relevante
    const temEstado = sessaoParaSalvar.cpfcnpj || sessaoParaSalvar.contrato_ativo
      || sessaoParaSalvar._estado || sessaoParaSalvar._cadastro
      || sessaoParaSalvar._fluxo_no;
    const foiResetado = sessaoParaSalvar._resetado;
    if (foiResetado) {
      // Reset completo — salva objeto vazio para limpar tudo
      await salvarSessao(from, {}).catch(() => {});
      logger.info(`🔄 Sessão de ${from} resetada completamente`);
    } else if (temEstado) {
      await salvarSessao(from, sessaoParaSalvar).catch(() => {});
    }

  } catch(e) {
    logger.error(`❌ Meta ${tipo} erro: ${e.message}\n${e.stack}`);
    await enviarResposta(tipo, from, "Desculpe, tive um problema. Tente novamente! 🙏", canal).catch(() => {});
  }
}
