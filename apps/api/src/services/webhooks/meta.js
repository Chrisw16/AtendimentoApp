/**
 * webhooks/meta.js
 * Processa webhooks da Meta (WhatsApp Business API)
 * Converte eventos externos em conversas/mensagens internas
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

export async function handleMeta(body) {
  const entry = body?.entry?.[0];
  if (!entry) return;

  const changes = entry.changes || [];
  for (const change of changes) {
    if (change.field !== 'messages') continue;
    const value = change.value;

    // Mensagens recebidas
    for (const msg of value?.messages || []) {
      await processarMensagemMeta(msg, value);
    }

    // Atualizações de status (entregue, lido, etc.)
    for (const status of value?.statuses || []) {
      await atualizarStatusMeta(status);
    }
  }
}

async function processarMensagemMeta(msg, value) {
  const telefone = msg.from;
  const canal    = 'whatsapp';

  // Deduplica por external_id
  const existe = await mensagemRepo.porExternalId(msg.id);
  if (existe) return;

  // Encontra ou cria conversa
  let conversa = await conversaRepo.porTelefoneCanal(telefone, canal);

  if (!conversa) {
    // Pega nome do contato se disponível
    const contato = value?.contacts?.find(c => c.wa_id === telefone);
    const nome    = contato?.profile?.name || null;

    conversa = await conversaRepo.criar({
      canal,
      telefone,
      nome,
      status: 'ia',
    });

    broadcast('nova_conversa', conversa);
  }

  // Extrai conteúdo da mensagem
  const { texto, tipo, url, mime } = extrairConteudo(msg);

  const mensagem = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'cliente',
    tipo,
    texto,
    url,
    mime,
    external_id: msg.id,
    meta: { timestamp: msg.timestamp },
  });

  // Incrementa não lidas se conversa não estiver aberta por nenhum agente
  await conversaRepo.incrementarNaoLidas(conversa.id);

  broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
  broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));

  // Aciona motor de fluxo se conversa estiver com IA
  if (conversa.status === 'ia') {
    const { processarConversa } = await import('../motorFluxo.js');
    processarConversa(conversa, mensagem).catch(err =>
      console.error('[Webhook Meta] Motor fluxo erro:', err.message)
    );
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
