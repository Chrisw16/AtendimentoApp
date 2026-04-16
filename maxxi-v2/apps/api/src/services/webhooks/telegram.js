/**
 * webhooks/telegram.js
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

export async function handleTelegram(body) {
  const msg = body?.message || body?.edited_message;
  if (!msg) return;

  const chatId   = String(msg.chat?.id);
  const nome     = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || null;
  const external = String(msg.message_id);

  const existe = await mensagemRepo.porExternalId(`tg-${external}`);
  if (existe) return;

  let conversa = await conversaRepo.porTelefoneCanal(chatId, 'telegram');
  if (!conversa) {
    conversa = await conversaRepo.criar({ canal: 'telegram', telefone: chatId, nome, status: 'ia' });
    broadcast('nova_conversa', conversa);
  }

  const { texto, tipo } = extrairConteudoTelegram(msg);

  const mensagem = await mensagemRepo.criar({
    conversa_id: conversa.id,
    origem:      'cliente',
    tipo,
    texto,
    external_id: `tg-${external}`,
  });

  await conversaRepo.incrementarNaoLidas(conversa.id);
  broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
  broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));
}

function extrairConteudoTelegram(msg) {
  if (msg.text)     return { tipo: 'texto', texto: msg.text };
  if (msg.photo)    return { tipo: 'imagem', texto: msg.caption || null };
  if (msg.voice)    return { tipo: 'audio',  texto: null };
  if (msg.video)    return { tipo: 'video',  texto: msg.caption || null };
  if (msg.document) return { tipo: 'doc',    texto: msg.document.file_name || null };
  if (msg.location) return { tipo: 'texto',  texto: `📍 ${msg.location.latitude}, ${msg.location.longitude}` };
  if (msg.sticker)  return { tipo: 'texto',  texto: '🎭 [sticker]' };
  return { tipo: 'texto', texto: '[mensagem não suportada]' };
}
