/**
 * webhooks/evolution.js
 * Processa webhooks da Evolution API (WhatsApp alternativo)
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

export async function handleEvolution(body) {
  const event = body?.event;
  if (!event) return;

  switch (event) {
    case 'messages.upsert':
      return processarMensagem(body);
    case 'messages.update':
      return atualizarMensagem(body);
    case 'connection.update':
      return procesarConexao(body);
  }
}

async function processarMensagem(body) {
  const data    = body?.data;
  const msg     = data?.message;
  if (!msg || msg?.key?.fromMe) return;  // ignora mensagens próprias

  const telefone = msg.key?.remoteJid?.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
  if (!telefone) return;

  const external_id = msg.key?.id;

  const existe = await mensagemRepo.porExternalId(external_id);
  if (existe) return;

  let conversa = await conversaRepo.porTelefoneCanal(telefone, 'whatsapp');

  if (!conversa) {
    const nome = data?.pushName || null;
    conversa   = await conversaRepo.criar({ canal: 'whatsapp', telefone, nome, status: 'ia' });
    broadcast('nova_conversa', conversa);
  }

  const { texto, tipo, url, mime } = extrairConteudoEvolution(msg);

  const mensagem = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'cliente',
    tipo,
    texto,
    url,
    mime,
    external_id,
  });

  await conversaRepo.incrementarNaoLidas(conversa.id);
  broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
  broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));

  if (conversa.status === 'ia') {
    const { processarConversa } = await import('../motorFluxo.js');
    processarConversa(conversa, mensagem).catch(err =>
      console.error('[Webhook Evolution] Motor fluxo erro:', err.message)
    );
  }
}

async function atualizarMensagem(body) {
  const updates = body?.data || [];
  for (const u of updates) {
    if (u.update?.status === 'READ') {
      const msg = await mensagemRepo.porExternalId(u.key?.id);
      if (msg) broadcast('mensagem_atualizada', { ...msg, lida: true });
    }
  }
}

async function procesarConexao(body) {
  const state = body?.data?.state;
  console.log(`[Evolution] Conexão: ${state}`);
  // TODO: atualizar status do canal no banco
}

function extrairConteudoEvolution(msg) {
  const content = msg.message;

  if (content?.conversation)
    return { tipo: 'texto', texto: content.conversation };

  if (content?.extendedTextMessage)
    return { tipo: 'texto', texto: content.extendedTextMessage.text };

  if (content?.imageMessage)
    return { tipo: 'imagem', texto: content.imageMessage.caption || null, mime: 'image/jpeg' };

  if (content?.audioMessage || content?.pttMessage)
    return { tipo: 'audio', mime: 'audio/ogg' };

  if (content?.videoMessage)
    return { tipo: 'video', texto: content.videoMessage.caption || null, mime: 'video/mp4' };

  if (content?.documentMessage)
    return { tipo: 'doc', texto: content.documentMessage.fileName || null };

  if (content?.locationMessage) {
    const { degreesLatitude: lat, degreesLongitude: lng } = content.locationMessage;
    return { tipo: 'texto', texto: `📍 Localização: ${lat}, ${lng}` };
  }

  if (content?.buttonsResponseMessage)
    return { tipo: 'texto', texto: content.buttonsResponseMessage.selectedDisplayText };

  if (content?.listResponseMessage)
    return { tipo: 'texto', texto: content.listResponseMessage.title };

  return { tipo: 'texto', texto: '[mensagem não suportada]' };
}
