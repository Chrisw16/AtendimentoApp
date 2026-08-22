/**
 * webhooks/meta.js
 * Processa webhooks da Meta (WhatsApp Business API)
 * Converte eventos externos em conversas/mensagens internas
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

/**
 * @param {object} opts `{reprocessando}` — ver a nota em evolution.js.
 *
 * ⚠️ Teto declarado (FASE 4): a Meta entrega N mensagens num único POST, e a
 * entrada do inbox é o POST inteiro. Uma que falhe no meio não impede as
 * outras (o erro é acumulado e lançado no fim), mas **reprocessar a entrada
 * re-executa o turno das que já tinham sido respondidas**. Por isso o
 * reprocessamento é manual e auditado (§132), nunca automático.
 */
export async function handleMeta(body, opts = {}) {
  const entry = body?.entry?.[0];
  if (!entry) return;

  const erros = [];
  const changes = entry.changes || [];
  for (const change of changes) {
    if (change.field !== 'messages') continue;
    const value = change.value;

    // Mensagens recebidas — uma quebrada não pode engolir as seguintes.
    for (const msg of value?.messages || []) {
      try {
        await processarMensagemMeta(msg, value, opts);
      } catch (err) {
        console.error(`[Webhook Meta] mensagem ${msg?.id} falhou:`, err.message);
        erros.push(`${msg?.id}: ${err.message}`);
      }
    }

    // Atualizações de status (entregue, lido, etc.)
    for (const status of value?.statuses || []) {
      await atualizarStatusMeta(status);
    }
  }

  // Lançar no fim é o que manda a entrada para a DLQ com o diagnóstico junto.
  if (erros.length) throw new Error(`${erros.length} mensagem(ns) falharam — ${erros.join(' | ')}`);
}

async function processarMensagemMeta(msg, value, { reprocessando = false } = {}) {
  const telefone = msg.from;
  const canal    = 'whatsapp';

  // Deduplica por external_id
  const jaExistia = await mensagemRepo.porExternalId(msg.id);
  if (jaExistia && !reprocessando) return;

  // Encontra ou cria conversa — atômico, ver `obterOuCriar` e a migration 014.
  const contato = value?.contacts?.find(c => c.wa_id === telefone);
  const { conversa, nova } = await conversaRepo.obterOuCriar(telefone, canal, {
    nome:   contato?.profile?.name || null,
    status: 'ia',
  });
  if (nova) broadcast('nova_conversa', conversa);

  // Extrai conteúdo da mensagem
  const { texto, tipo, url, mime } = extrairConteudo(msg);

  let mensagem = jaExistia;
  if (!mensagem) {
    mensagem = await mensagemRepo.criar({
      conversa_id: conversa.id,
      origem:      'cliente',
      tipo,
      texto,
      url,
      mime,
      external_id: msg.id,
      meta: { timestamp: msg.timestamp },
    });

    if (mensagem) {
      // Incrementa não lidas se conversa não estiver aberta por nenhum agente
      await conversaRepo.incrementarNaoLidas(conversa.id);
      broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
      broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));
    } else {
      // Reentrega concorrente: a unique de external_id barrou o insert.
      if (!reprocessando) return;
      mensagem = await mensagemRepo.porExternalId(msg.id);
      if (!mensagem) return;
    }
  }

  // Aciona motor de fluxo se conversa estiver com IA
  if (conversa.status === 'ia') {
    // `await`: ver a nota em evolution.js — é o que dá durabilidade ao turno.
    const { processarConversa } = await import('../motorFluxo.js');
    await processarConversa(conversa, mensagem);
  }
}

async function atualizarStatusMeta(status) {
  if (status.status === 'read') {
    // Marca mensagem como lida
    const msg = await mensagemRepo.porExternalId(status.id);
    if (msg) {
      broadcast('mensagem_atualizada', { ...msg, lida: true });
    }
  }
}

function extrairConteudo(msg) {
  switch (msg.type) {
    case 'text':
      return { texto: msg.text?.body, tipo: 'texto' };

    case 'image':
      return {
        tipo: 'imagem',
        texto: msg.image?.caption || null,
        url:  `/api/media/${msg.image?.id}`,
        mime: msg.image?.mime_type,
      };

    case 'audio':
    case 'voice':
      return {
        tipo: 'audio',
        url:  `/api/media/${msg.audio?.id || msg.voice?.id}`,
        mime: 'audio/ogg',
      };

    case 'video':
      return {
        tipo: 'video',
        texto: msg.video?.caption || null,
        url:  `/api/media/${msg.video?.id}`,
        mime: msg.video?.mime_type,
      };

    case 'document':
      return {
        tipo: 'doc',
        texto: msg.document?.filename || msg.document?.caption || null,
        url:  `/api/media/${msg.document?.id}`,
        mime: msg.document?.mime_type,
      };

    case 'location':
      return {
        tipo:  'texto',
        texto: `📍 Localização: ${msg.location?.latitude}, ${msg.location?.longitude}`,
      };

    case 'interactive':
      // Resposta de botão/lista
      const reply = msg.interactive?.button_reply || msg.interactive?.list_reply;
      return { tipo: 'texto', texto: reply?.title || reply?.id || '' };

    default:
      return { tipo: 'texto', texto: `[${msg.type}]` };
  }
}
