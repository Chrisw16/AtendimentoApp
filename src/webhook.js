import { runMaxxi } from "./agent.js";
import Anthropic from "@anthropic-ai/sdk";
import { receberMensagemCliente } from "./services/chatInterno.js";
import { iniciarReativacao, cancelarReativacao } from "./services/reativacao.js";
import {
  sendMessage, sendAudio, assignToHuman, addLabel, resolveConversation, setTyping,
  sendPrivateNote, updateContact, updateConversationAttributes, getConversation,
  setConversationName, setCustomAttributes,
} from "./services/chatwoot.js";
import { textToSpeech } from "./services/elevenlabs.js";
import { transcreverAudio } from "./services/whisper.js";
import { analisarImagem, analisarPDF } from "./services/vision.js";
import { logger, appendHistorico } from "./services/logger.js";
import { buscarMemoria, salvarMemoria, registrarHistorico, buscarSessao, salvarSessao, limparSessao } from "./services/memoria.js";
import { estaComHumano, transferirParaHumano, devolverParaIA, encerrarHandoff, carregarEstadoHandoff } from "./services/handoff.js";
import { CITMAX_TENANT_ID } from "./services/db.js";
import {
  lockConversa, unlockConversa, marcarAtividade,
  conversaEstaAtiva, getPreferenciaAudio, setPreferenciaAudio, limparPreferenciaAudio,
  agendarFollowup, agendarEncerramento, cancelarTimers,
} from "./services/conv-state.js";

// ─── ESTADO POR CONVERSA ─────────────────────────────────────────────────────
// processing, protocolSent, audioPreference, followupTimer, closeTimer
// foram migrados para o banco — ver src/services/conv-state.js (Fase 2 SaaS)

const messageBuffer = new Map();  // anti-flood buffer (TTL 8s — OK em memória)
const floodTimer = new Map();     // anti-flood timers (TTL 8s — OK em memória)

const FLOOD_WINDOW_MS = 8000;
const FLOOD_MAX_MSGS = 5;

const AUDIO_TRIGGERS = [
  "manda áudio", "manda audio", "pode mandar áudio", "pode mandar audio",
  "não sei ler", "nao sei ler", "não consigo ler", "nao consigo ler",
  "prefiro áudio", "prefiro audio", "quero áudio", "quero audio",
  "fala pra mim", "não sei escrever", "nao sei escrever"
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function gerarProtocolo(conversationId) {
  const data = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `ATD-${data}-${String(conversationId).padStart(6, "0")}`;
}

function clienteQuerAudio(text, conversationId) {
  if (await getPreferenciaAudio(conversationId)) return true;
  const lower = (text || "").toLowerCase();
  return AUDIO_TRIGGERS.some(t => lower.includes(t));
}

/**
 * Detecta tipo de conteúdo recebido (áudio, imagem, PDF, localização, texto)
 * e retorna uma descrição legível para o agente
 */
async function detectarConteudo(payload) {
  const attachments = payload.attachments || [];
  const content = payload.content || "";

  if (attachments.length > 0) {
    const tipos = await Promise.all(attachments.map(async a => {
      const tipo = a.file_type || a.content_type || "";

      // Localização nativa do WhatsApp via Chatwoot
      if (tipo === "location" || (a.coordinates_lat && a.coordinates_long)) {
        const lat = a.coordinates_lat;
        const lon = a.coordinates_long;
        const nome = a.fallback_title || "não informado";
        return `[LOCALIZAÇÃO RECEBIDA] Latitude: ${lat}, Longitude: ${lon}. Referência: ${nome}. Chame verificar_cobertura com lat=${lat} e lon=${lon}.`;
      }
      if (tipo.includes("audio") || tipo.includes("ogg") || tipo.includes("mp3") || tipo.includes("mpeg") || tipo.includes("aac") || tipo.includes("m4a")) {
        if (a.data_url && process.env.OPENAI_API_KEY) {
          try {
            const transcricao = await transcreverAudio(a.data_url);
            if (transcricao) {
              return `[ÁUDIO TRANSCRITO] O cliente disse em áudio: "${transcricao}"`;
            }
          } catch (err) {
            logger.error(`❌ Whisper erro: ${err.message}`);
          }
        }
        // Salva URL do áudio para reprodução no painel
        const audioUrl = a.data_url || a.file_url || a.download_url || '';
        if (audioUrl) return `[audio:${audioUrl}]`;
        return "[ÁUDIO RECEBIDO] Cliente enviou um áudio mas não foi possível transcrever. Peça para digitar a mensagem.";
      }
      if (tipo.includes("image") || tipo.includes("jpeg") || tipo.includes("png") || tipo.includes("webp")) {
        if (a.data_url && process.env.OPENAI_API_KEY) {
          try {
            const analise = await analisarImagem(a.data_url, tipo.includes("/") ? tipo : "image/jpeg");
            return `[IMAGEM ANALISADA] ${analise}`;
          } catch (err) {
            logger.error(`❌ Vision imagem erro: ${err.message}`);
          }
        }
        return "[IMAGEM RECEBIDA] Cliente enviou uma imagem mas não foi possível analisar. Peça para descrever o conteúdo.";
      }
      if (tipo.includes("pdf") || a.extension === "pdf" || (a.file_name || "").endsWith(".pdf")) {
        if (a.data_url && process.env.OPENAI_API_KEY) {
          try {
            const analise = await analisarPDF(a.data_url);
            return `[PDF ANALISADO] ${analise}`;
          } catch (err) {
            logger.error(`❌ Vision PDF erro: ${err.message}`);
          }
        }
        return "[PDF RECEBIDO] Cliente enviou um documento mas não foi possível analisar. Peça para descrever o conteúdo.";
      }
      if (tipo.includes("video")) {
        return "[VÍDEO RECEBIDO] Cliente enviou um vídeo. Peça para descrever o problema em texto.";
      }
      return `[ARQUIVO RECEBIDO: ${tipo}] Peça para o cliente descrever o que precisa.`;
    }));
    return tipos.join(" ") + (content ? ` Texto junto: "${content}"` : "");
  }

  // Link Google Maps no texto
  if (content && (content.includes("maps.google") || content.includes("goo.gl/maps") || content.includes("maps.app.goo"))) {
    return `[LOCALIZAÇÃO] Cliente enviou link do Google Maps: ${content}`;
  }

  // Coordenadas no texto (ex: "-5.874,-35.226")
  if (content) {
    const coordMatch = content.match(/(-?\d{1,3}\.\d+),\s*(-?\d{1,3}\.\d+)/);
    if (coordMatch) {
      return `[LOCALIZAÇÃO] Coordenadas: ${coordMatch[1]}, ${coordMatch[2]}. ${content}`;
    }
  }

  return content;
}

/**
 * Detecta o assunto do atendimento para etiqueta automática
 */
function detectarEtiqueta(result) {
  if (!result.reply) return null;
  const reply = result.reply.toLowerCase();
  const intent = result.intent || "";

  if (intent === "suporte" || reply.includes("chamado") || reply.includes("técnico") || reply.includes("conexão") || reply.includes("offline")) return "suporte";
  if (intent === "financeiro" || reply.includes("boleto") || reply.includes("fatura") || reply.includes("pagamento") || reply.includes("pix")) return "financeiro";
  if (intent === "vendas" || reply.includes("instalação") || reply.includes("plano") || reply.includes("contratar") || reply.includes("assinar")) return "vendas";
  if (reply.includes("cancelar") || reply.includes("cancelamento")) return "cancelamento";
  if (reply.includes("mudança") || reply.includes("relocação") || reply.includes("endereço")) return "mudanca";
  return null;
}

/**
 * Reinicia o timer de follow-up a cada mensagem do cliente
 */
async function resetFollowupTimer(accountId, conversationId, tenantId = CITMAX_TENANT_ID) {
  // Timers agora persistidos no banco via conv-state.js
  // Reagenda follow-up a cada mensagem do cliente (reseta o contador de inatividade)
  await agendarFollowup(conversationId, accountId, tenantId);
  await marcarAtividade(conversationId, tenantId);
  cancelarReativacao(conversationId);
}

/**
 * Envia resposta em texto ou áudio dependendo da preferência do cliente
 */
async function sendReply(accountId, conversationId, text, clientMessage) {
  const wantsAudio = clienteQuerAudio(clientMessage || "", conversationId);

  if (wantsAudio && process.env.ELEVENLABS_API_KEY) {
    setPreferenciaAudio(conversationId, true);
    try {
      const audio = await textToSpeech(text);
      await sendAudio(accountId, conversationId, audio);
      logger.info(`🎙️ Áudio enviado | Conv #${conversationId}`);
      return;
    } catch (err) {
      logger.error(`❌ ElevenLabs erro: ${err.message} — enviando texto`);
    }
  }
  await sendMessage(accountId, conversationId, text);
}

/**
 * Processa uma conversa após anti-flood buffer
 */
async function processConversation(accountId, conversationId, messages, sender, channel, protocolo, messageId, tenantId = CITMAX_TENANT_ID) {
  // Lock persistido — evita processamento duplo mesmo em multi-processo

  // Modo humano por conversa (via handoff) - IA silencia apenas para conversas assumidas
  // O modo global foi removido - IA sempre ativa por padrão

  const lockObtido = await lockConversa(conversationId, tenantId);
  if (!lockObtido) { logger.warn(`🔒 Conv #${conversationId} já em processamento, ignorando`); return; }

  try {
    // Agrupa mensagens do buffer em uma só
    const content = messages.map(m => m.content).filter(Boolean).join("\n");
    const rawPayload = messages[messages.length - 1]; // último payload para detectar anexos

    const contentFinal = await detectarConteudo(rawPayload) || content;

    // Busca memória do cliente pelo telefone
    const telefone = sender?.phone_number || sender?.identifier || String(conversationId);
    const memoria = await buscarMemoria(telefone, tenantId);

    // Salva preferência de áudio se detectada
    if (clienteQuerAudio(content, conversationId)) {
      await salvarMemoria(telefone, { prefere_audio: true }, tenantId);
    }

    // Ativa "digitando..."
    await setTyping(accountId, conversationId, true);

    const sessao = await buscarSessao(telefone, tenantId);

    // ── dispatch() — ponto de entrada único (motor-fluxo ou runMaxxi) ────────
    const result = await dispatch({
      telefone,
      mensagem:       contentFinal,
      conversationId,
      accountId,
      canal:          channel,
      tenantId,
      sessao,
      memoria,
      protocolo,
      messageId,
      sender,
      // Funções de envio para o canal Chatwoot
      enviarFn:       async (texto) => {
        await sendReply(accountId, conversationId, texto, content);
      },
      enviarBotoesFn: async (corpo, botoes) => {
        await sendMessage(accountId, conversationId, corpo);
      },
      enviarListaFn:  async (corpo, _label, _secoes) => {
        await sendMessage(accountId, conversationId, corpo);
      },
      transferirFn:   async (motivo) => {
        await transferirParaHumano(conversationId, null, motivo);
      },
    });

    // Salva sessão se motor identificou o cliente e atualiza Chatwoot
    if (result.sessaoAtualizada) {
      await salvarSessao(telefone, result.sessaoAtualizada, tenantId);

      // Atualiza contato no Chatwoot com dados do SGP
      const s = result.sessaoAtualizada;
      try {
        const conv = await getConversation(accountId, conversationId);
        const contactId = conv?.meta?.sender?.id;
        if (contactId && s.nome) {
          await updateContact(accountId, contactId, {
            name: s.nome,
            additional_attributes: {
              cpf_cnpj: s.cpfcnpj,
              contratos: s.contratos?.map(c => `#${c.id}`).join(", "),
            },
          }).catch(() => {});
        }
        // Atualiza atributos da conversa — visível na sidebar do agente
        if (s.cpfcnpj) {
          await updateConversationAttributes(accountId, conversationId, {
            cpf_cnpj: s.cpfcnpj,
            cliente: s.nome,
            contrato_ativo: s.contrato_ativo || s.contratos?.[0]?.id,
          }).catch(() => {});
        }
      } catch {}
    }

    // Motor de fluxo já enviou a resposta via enviarFn — não precisa de reply aqui
    // Apenas trata handoff, resolve e reply quando vem do runMaxxi (sem enviarFn efetivo)
    if (result.tipo === "aguardando" && result.reply === null) return;

    await setTyping(accountId, conversationId, false);
    // Inicia reativação configurável após resposta da IA
    iniciarReativacao({
      convId: conversationId, canal: channel || "chatwoot",
      telefone: sender?.phone_number, accountId,
      enviarFn: async (cId, _canal, _tel, accId, msg) => {
        await sendMessage(accId, cId, msg);
      },
    }).catch(() => {});

    if (result.handoff) {
      await addLabel(accountId, conversationId, "atendimento-humano");
      await assignToHuman(accountId, conversationId);

      const sessaoAtiva = await buscarSessao(telefone, tenantId);

      // Gera resumo estruturado com IA (Haiku — rápido e barato)
      let resumoIA = result.resumoAtendimento || "";
      let sentimentoHandoff = "neutro";
      try {
        const histMsgs = messages.slice(-10).map(m =>
          `${m.role === "user" ? "Cliente" : "IA"}: ${typeof m.content === "string" ? m.content.slice(0, 200) : ""}`
        ).filter(Boolean).join("\n");

        const resumoRes = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 400,
          messages: [{
            role: "user",
            content: `Analise este atendimento de suporte e responda SOMENTE JSON:
{"motivo":"motivo principal em 1 frase","tentativas":["o que a IA tentou fazer"],"sentimento":"frustrado|neutro|satisfeito","urgencia":"alta|media|baixa","resumo":"resumo para agente em 2 frases"}

Conversa:
${histMsgs}
${result.resumoAtendimento ? `Motivo transferência: ${result.resumoAtendimento}` : ""}`
          }]
        });
        const txt = resumoRes.content[0]?.text?.replace(/\`\`\`json|\`\`\`/g,"").trim();
        const parsed = JSON.parse(txt);
        resumoIA = parsed.motivo || resumoIA;
        sentimentoHandoff = parsed.sentimento || "neutro";

        const urgenciaEmoji = parsed.urgencia === "alta" ? "🔴" : parsed.urgencia === "media" ? "🟡" : "🟢";
        const sentimentoEmoji = parsed.sentimento === "frustrado" ? "😡" : parsed.sentimento === "satisfeito" ? "😊" : "😐";

        const notaLinhas = [
          `🤖 *Resumo IA — Protocolo ${protocolo}*`,
          `${urgenciaEmoji} Urgência: *${parsed.urgencia || "média"}* ${sentimentoEmoji} Sentimento: *${parsed.sentimento || "neutro"}*`,
          sessaoAtiva?.nome    ? `👤 *Cliente:* ${sessaoAtiva.nome}` : null,
          sessaoAtiva?.cpfcnpj ? `🪪 *CPF/CNPJ:* ${sessaoAtiva.cpfcnpj}` : null,
          sessaoAtiva?.contratos?.length ? `📦 *Contratos:* ${sessaoAtiva.contratos.map(c => `#${c.id}`).join(", ")}` : null,
          sessaoAtiva?.contrato_ativo   ? `⭐ *Contrato ativo:* #${sessaoAtiva.contrato_ativo}` : null,
          `\n📝 *Motivo:* ${parsed.motivo || resumoIA}`,
          parsed.tentativas?.length ? `\n🔧 *Já tentado pela IA:*\n${parsed.tentativas.map(t => `• ${t}`).join("\n")}` : null,
          parsed.resumo ? `\n💡 *Para o agente:* ${parsed.resumo}` : null,
          "\n_Transferido automaticamente pela Maxxi IA_",
        ].filter(Boolean).join("\n");

        await sendPrivateNote(accountId, conversationId, notaLinhas).catch(() => {});

        // Etiqueta urgência alta
        if (parsed.urgencia === "alta") {
          await addLabel(accountId, conversationId, "urgente").catch(() => {});
        }
        if (parsed.sentimento === "frustrado") {
          await addLabel(accountId, conversationId, "cliente-frustrado").catch(() => {});
        }

      } catch(e) {
        logger.warn(`⚠️ Resumo IA falhou, usando básico: ${e.message}`);
        const notaLinhas = [
          "🤖 *Resumo do atendimento — Maxxi IA*",
          `📋 Protocolo: ${protocolo}`,
          sessaoAtiva?.nome    ? `👤 Cliente: ${sessaoAtiva.nome}` : null,
          sessaoAtiva?.cpfcnpj ? `🪪 CPF/CNPJ: ${sessaoAtiva.cpfcnpj}` : null,
          result.resumoAtendimento ? `\n📝 Motivo: ${result.resumoAtendimento}` : null,
        ].filter(Boolean).join("\n");
        await sendPrivateNote(accountId, conversationId, notaLinhas).catch(() => {});
      }

      await sendMessage(accountId, conversationId, "Vou transferir você para um atendente agora. Um momento! 👨‍💻");
      await transferirParaHumano(conversationId, null, resumoIA || "Transferido pela IA");
      logger.info(`🔀 Handoff | Conv #${conversationId} | sentimento: ${sentimentoHandoff}`);

    } else if (result.resolve) {
      await sendReply(accountId, conversationId, result.reply, content).catch(() => 
        sendMessage(accountId, conversationId, result.reply || "Atendimento encerrado. Até mais! 😊").catch(() => {})
      );
      // Etiqueta automática por assunto
      const etiqueta = detectarEtiqueta(result);
      if (etiqueta) await addLabel(accountId, conversationId, etiqueta).catch(() => {});
      await addLabel(accountId, conversationId, "atendido").catch(() => {});
      await resolveConversation(accountId, conversationId).catch(() => {});
      // Salva memória e histórico ao encerrar
      if (result.memoriaAtualizada) await salvarMemoria(telefone, result.memoriaAtualizada, tenantId);
      if (result.resumoAtendimento) await registrarHistorico(telefone, result.resumoAtendimento);

      // Análise de sentimento + tópico (async, não bloqueia)
      analisarSentimento({ result, sessao, telefone, protocolo }).catch(() => {});

      await limparSessao(telefone, tenantId);
      await cancelarTimers(conversationId, tenantId);
      limparPreferenciaAudio(conversationId);
      logger.info(`✅ Encerrado | Conv #${conversationId}`);

    } else {
      // Etiqueta automática mesmo sem encerrar
      const etiqueta = detectarEtiqueta(result);
      if (etiqueta) await addLabel(accountId, conversationId, etiqueta).catch(() => {});
      await sendReply(accountId, conversationId, result.reply, content);
    }

  } catch (err) {
    await setTyping(accountId, conversationId, false).catch(() => {});
    if (err.message?.includes("encerrado") || err.message?.includes("resolved")) {
      logger.warn(`⚠️ Conversa já encerrada: ${conversationId}`);
      return;
    }
    // Inicia reativação configurável após resposta da IA
    iniciarReativacao({
      convId: conversationId, canal: channel || "chatwoot",
      telefone: sender?.phone_number, accountId,
      enviarFn: async (cId, _canal, _tel, accId, msg) => {
        await sendMessage(accId, cId, msg);
      },
    }).catch(() => {});
    logger.error(`❌ Erro #${conversationId}: ${err.message}`);
    await sendMessage(accountId, conversationId, "Tive um problema ao processar. Tente novamente! 🙏");
  } finally {
    await unlockConversa(conversationId, tenantId);
    messageBuffer.delete(conversationId);
  }
}

// ─── WEBHOOK PRINCIPAL ───────────────────────────────────────────────────────

// Anthropic client
const _anthropic  = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Classifica sentimento e tópico de um atendimento encerrado via Haiku (mini-call).
 */
async function analisarSentimento({ result, sessao, telefone, protocolo }) {
  try {
    const resumo = result?.resumoAtendimento || result?.reply || "";
    const nome    = sessao?.nome     || "—";
    const cpf     = sessao?.cpfcnpj  || "—";
    const contrato = sessao?.contrato_ativo || (sessao?.contratos?.[0]?.id ? String(sessao.contratos[0].id) : "—");

    const resp = await _anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 80,
      messages: [{
        role: "user",
        content: `Analise este resumo de atendimento de suporte ao cliente e responda SOMENTE um JSON no formato:
{"sentimento":"positivo|neutro|negativo","topico":"boleto|suporte_tecnico|nova_contratacao|cancelamento|mudanca_plano|streaming|outros"}

Resumo: "${resumo.slice(0, 400)}"
Responda apenas o JSON, sem mais nada.`,
      }],
    });

    const text = resp.content.find(b => b.type === "text")?.text?.trim() || "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    const { sentimento = "neutro", topico = "outros" } = JSON.parse(clean);

    appendHistorico({ telefone, nome, cpfcnpj: cpf, contrato, sentimento, topico, protocolo, resumo, ts: Date.now() }).catch(()=>{});
    logger.info(`😊 Análise | ${protocolo} | sentimento:${sentimento} | tópico:${topico}`);
  } catch (e) {
    logger.warn(`⚠️ analisarSentimento falhou: ${e.message}`);
  }
}




// ═══════════════════════════════════════════════════════════════════════════
// dispatch() — ponto de entrada único para todos os canais
// ═══════════════════════════════════════════════════════════════════════════
//
// Decide qual motor usar:
//   1. Se o canal tem fluxo visual ativo no banco → executarFluxo()
//   2. Senão                                      → runMaxxi()
//
// Normaliza os retornos dos dois motores para o mesmo formato:
//   { handled, tipo, reply?, sessaoAtualizada?, handoff?, resolve?, resumo? }
//
// USO (em qualquer webhook):
//   const result = await dispatch({
//     telefone, mensagem, conversationId, accountId,
//     canal, tenantId, sessao,
//     enviarFn, enviarBotoesFn, enviarListaFn, transferirFn,
//   });
//   if (!result.handled) { /* motor não processou — trate como erro */ }
//
export async function dispatch({
  telefone,
  mensagem,
  conversationId,
  accountId,
  canal,
  tenantId  = CITMAX_TENANT_ID,
  sessao    = {},
  memoria   = null,
  protocolo = null,
  messageId = null,
  sender    = null,
  // Funções de envio — cada canal implementa a sua
  enviarFn,
  enviarBotoesFn,
  enviarListaFn,
  transferirFn,
}) {
  // ── 1. Tenta o motor de fluxo visual ──────────────────────────────────────
  try {
    const { executarFluxo, carregarFluxoAtivo } = await import("./services/motor-fluxo.js");
    const fluxoAtivo = await carregarFluxoAtivo(false, canal);

    // Usa o motor se:
    //   a) o canal tem fluxo publicado vinculado, OU
    //   b) a sessão já está em andamento no motor (_fluxo_no indica nó atual)
    const sessaoNoMotor = sessao._fluxo_no !== undefined;
    const canalTemFluxo = !!fluxoAtivo?.dados;

    if (canalTemFluxo || sessaoNoMotor) {
      const resultado = await executarFluxo({
        telefone,
        mensagem,
        sessao,
        conversationId,
        canal,
        accountId,
        tenantId,
        enviarFn,
        enviarBotoesFn,
        enviarListaFn,
        transferirFn,
      });

      if (resultado) {
        // Salva sessão atualizada pelo motor
        if (resultado.sessaoAtualizada) {
          await salvarSessao(telefone, resultado.sessaoAtualizada, tenantId).catch(() => {});
        }

        // Normaliza retorno do motor para o formato padrão
        // tipo "ia" significa que o motor delegou para runMaxxi (nó ia_responde sem enviarFn)
        if (resultado.tipo === "ia" && resultado.reply) {
          return {
            handled: true,
            tipo: "ia",
            reply: resultado.reply,
            sessaoAtualizada: resultado.sessaoAtualizada,
          };
        }

        return {
          handled:          true,
          tipo:             resultado.tipo,        // aguardando|encerrado|transferido|resetado|fim|ia
          reply:            resultado.reply || null,
          sessaoAtualizada: resultado.sessaoAtualizada || null,
          handoff:          resultado.tipo === "transferido",
          resolve:          resultado.tipo === "encerrado" || resultado.tipo === "fim",
        };
      }
    }
  } catch(e) {
    logger.warn(`⚠️ dispatch: motor-fluxo erro em conv #${conversationId}: ${e.message}`);
    // Fallback para runMaxxi em caso de erro no motor
  }

  // ── 2. Fallback: máquina de estados (runMaxxi) ─────────────────────────────
  try {
    const result = await runMaxxi({
      tenantId,
      accountId,
      conversationId,
      messageId,
      content: mensagem,
      sender,
      channel: canal,
      protocolo,
      memoria,
      telefone,
      sessao,
    });

    return {
      handled:          true,
      tipo:             result.handoff  ? "transferido"
                      : result.resolve  ? "encerrado"
                      : "aguardando",
      reply:            result.reply    || null,
      sessaoAtualizada: result.sessaoAtualizada || null,
      handoff:          !!result.handoff,
      resolve:          !!result.resolve,
      resumo:           result.resumoAtendimento || null,
      memoriaAtualizada: result.memoriaAtualizada || null,
    };
  } catch(e) {
    logger.error(`❌ dispatch: runMaxxi erro em conv #${conversationId}: ${e.message}`);
    return { handled: false, tipo: "erro", reply: null };
  }
}

export async function handleWebhook(req, res) {
  res.sendStatus(200);

  const payload = req.body;

  // ── Bot retoma após agente encerrar ou devolver para pendente ──────────────
  if (payload.event === "conversation_status_changed") {
    const { conversation, account } = payload;
    if (!conversation || !account) return;

    const convId = conversation.id;
    const status = conversation.status;
    const assigneeId = conversation.meta?.assignee?.id;

    if (status === "pending" && estaComHumano(convId)) {
      // Agente devolveu para fila → bot assume novamente
      await devolverParaIA(convId);
      logger.info(`🤖 Bot retomou conv #${convId} (status: pending)`);

    } else if (status === "resolved") {
      // Encerrado (por agente ou bot) — limpa TUDO, próxima msg = novo atendimento
      await devolverParaIA(convId);
      await cancelarTimers(convId, tenantId);
      limparPreferenciaAudio(convId);
      limparPreferenciaAudio(convId);
      await cancelarTimers(convId, tenantId);
      const telefone = conversation.meta?.sender?.phone_number
                    || conversation.meta?.sender?.identifier;
      if (telefone) limparSessao(telefone, tenantId);
      logger.info(`✅ Conv #${convId} encerrada — próxima msg inicia novo atendimento`);

    } else if (status === "open" && assigneeId) {
      // Agente assumiu → suspende bot + etiqueta
      await transferirParaHumano(convId, null, 'Transferido');
      addLabel(account.id, convId, "atendimento-humano").catch(() => {});
      logger.info(`👨‍💻 Agente assumiu conv #${convId} — bot suspenso`);
    }
    return;
  }

  if (payload.event !== "message_created") return;

  // ── Comandos do agente (mensagens outgoing não-privadas) ──────────────────
  if (payload.message_type === "outgoing" && !payload.private) {
    const cmd = (payload.content || "").trim().toLowerCase();
    const { conversation, account, sender } = payload;
    const convId = conversation?.id;
    const accId  = account?.id;

    if (cmd === "/reset") {
      // Zera tudo — próxima mensagem do cliente começa do zero
      await devolverParaIA(convId);
      await cancelarTimers(convId, tenantId);
      limparPreferenciaAudio(convId);
      limparPreferenciaAudio(convId);
      messageBuffer.delete(convId);
      await cancelarTimers(convId, tenantId);
      const telefone = conversation?.meta?.sender?.phone_number
                    || conversation?.meta?.sender?.identifier;
      if (telefone) limparSessao(telefone, tenantId);

      await resolveConversation(accId, convId).catch(() => {});
      logger.info(`🔄 /reset | Conv #${convId} zerada por ${sender?.name || "agente"}`);
    }
    return;
  }

  if (payload.message_type !== "incoming") return;

  // Aceita mensagens sem conteúdo se tiver anexo (áudio, imagem, etc.)
  const hasContent = payload.content && payload.content.trim();
  const hasAttachment = payload.attachments && payload.attachments.length > 0;
  const hasLocation = payload.content_type === "location" || payload.location;
  if (!hasContent && !hasAttachment && !hasLocation) return;

  const { conversation, account, sender } = payload;
  const conversationId = conversation.id;
  const accountId = account.id;
  const protocolo = gerarProtocolo(conversationId);

  const tipoConteudo = payload.content_type || "text";
  const temAnexo = payload.attachments?.length > 0;
  logger.info(`📩 Conv #${conversationId} | ${sender?.name}: ${payload.content || "[mídia]"} | type:${tipoConteudo} | anexos:${temAnexo}`);

  // Se agente humano está ativo → bot não interfere
  if (estaComHumano(conversationId)) {
    logger.info(`🚫 Bot suspenso (agente humano ativo) | Conv #${conversationId}`);
    return;
  }

  // Debug: loga payload completo para localização e mídia (temporário)
  if (tipoConteudo !== "text" || temAnexo) {
    logger.info(`🔍 DEBUG payload: ${JSON.stringify({
      content_type: payload.content_type,
      content: payload.content,
      location: payload.location,
      attachments: payload.attachments
    })}`);
  }

  // Primeira mensagem: protocolo + LGPD + define título da conversa no Chatwoot
  // Protocolo registrado no status=ativa da conversa (banco)
  if (!(await conversaEstaAtiva(conversationId, tenantId))) {
    // Primeira mensagem desta sessão
    // Preenche atributo personalizado "protocolo" — aparece em "Informação da conversa"
    // (requer criar o atributo em Configurações → Atributos Personalizados → Conversa)
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    setCustomAttributes(accountId, conversationId, {
      protocolo,
      atendimento_iniciado: agora,
    }).catch(() => {});
    setConversationName(accountId, conversationId, protocolo).catch(() => {});
    await sendMessage(accountId, conversationId,
      `Olá! 👋 Bem-vindo à CITmax!\n\n` +
      `📋 *Protocolo:* \`${protocolo}\`\n\n` +
      `🔒 Seus dados são protegidos conforme a LGPD (Lei 13.709/2018), usados apenas para este atendimento.\n\n` +
      `Como posso te ajudar?`
    );
    return;
  }

  // ── Anti-flood: agrupa mensagens rápidas ──────────────────────────────────
  if (!messageBuffer.has(conversationId)) {
    messageBuffer.set(conversationId, []);
  }
  messageBuffer.get(conversationId).push(payload);

  // Cancela timer anterior
  if (floodTimer.has(conversationId)) {
    clearTimeout(floodTimer.get(conversationId));
  }

  const bufferSize = messageBuffer.get(conversationId).length;

  // Processa imediatamente se atingiu limite de mensagens
  if (bufferSize >= FLOOD_MAX_MSGS) {
    floodTimer.delete(conversationId);
    const messages = messageBuffer.get(conversationId);
    if (bufferSize > 1) {
      logger.info(`🌊 Anti-flood: ${bufferSize} msgs agrupadas | Conv #${conversationId}`);
    }
    await resetFollowupTimer(accountId, conversationId, tenantId);
    await processConversation(accountId, conversationId, messages, sender, conversation.channel, protocolo, payload.id, tenantId);
    return;
  }

  // Aguarda janela de flood antes de processar
  const timer = setTimeout(async () => {
    floodTimer.delete(conversationId);
    const messages = messageBuffer.get(conversationId) || [];
    if (messages.length === 0) return;
    if (messages.length > 1) {
      logger.info(`⏱️ Buffer: ${messages.length} msgs agrupadas | Conv #${conversationId}`);
    }
    const lastMsgId = (messageBuffer.get(conversationId) || [messages[messages.length-1]]).at(-1)?.id;
    await resetFollowupTimer(accountId, conversationId, tenantId);
    await processConversation(accountId, conversationId, messages, sender, conversation.channel, protocolo, lastMsgId, tenantId);
  }, FLOOD_WINDOW_MS);

  floodTimer.set(conversationId, timer);
}
