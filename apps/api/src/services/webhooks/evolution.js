/**
 * webhooks/evolution.js
 * Processa webhooks da Evolution API (WhatsApp alternativo)
 */
import { conversaRepo } from '../../repositories/conversaRepository.js';
import { mensagemRepo } from '../../repositories/mensagemRepository.js';
import { broadcast }    from '../sseManager.js';

/**
 * @param {object} body  payload cru do provedor
 * @param {object} opts  `{reprocessando}` — só o worker de inbox (§132) passa
 *   true, e só quando um humano mandou reprocessar uma entrada da DLQ. Sem
 *   isso, a segunda passada seria NO-OP: a mensagem já está gravada e todo
 *   caminho de dedup aborta antes do motor — exatamente o turno que se quer
 *   recuperar.
 */
export async function handleEvolution(body, opts = {}) {
  const event = body?.event;
  if (!event) return;

  switch (event) {
    case 'messages.upsert':
      return processarMensagem(body, opts);
    case 'messages.update':
      return atualizarMensagem(body);
    case 'connection.update':
      return procesarConexao(body);
  }
}

async function processarMensagem(body, { reprocessando = false } = {}) {
  const data      = body?.data;
  const msg       = data?.message;
  if (!msg || msg?.key?.fromMe) return;  // ignora mensagens próprias

  const telefone  = msg.key?.remoteJid?.replace(/@s\.whatsapp\.net$/, '').replace(/@g\.us$/, '');
  if (!telefone) return;

  // Evolution v2 envia o nome da instância no body — essencial para enviar respostas de volta
  const instancia = body?.instance || body?.instanceName || body?.data?.instance || null;

  const external_id = msg.key?.id;

  const jaExistia = await mensagemRepo.porExternalId(external_id);
  if (jaExistia && !reprocessando) return;

  // `obterOuCriar` em vez de "checa → cria": duas mensagens simultâneas de um
  // número novo passavam as duas pela checagem e nasciam DUAS conversas, cada
  // uma com sua execução de fluxo. A unique parcial da migration 014 barra.
  const { conversa, nova } = await conversaRepo.obterOuCriar(telefone, 'whatsapp', {
    nome:            data?.pushName || null,
    status:          'ia',
    canal_instancia: instancia,   // salva instância para poder enviar de volta
  });

  if (nova) {
    broadcast('nova_conversa', conversa);
  } else if (instancia && !conversa.canal_instancia) {
    // Atualiza instância se ainda não tinha
    const { getDb } = await import('../../config/db.js');
    await getDb()('conversas').where({ id: conversa.id }).update({ canal_instancia: instancia });
    conversa.canal_instancia = instancia;
  }

  const { texto, tipo, url, mime } = extrairConteudoEvolution(msg);

  let mensagem = jaExistia;
  if (!mensagem) {
    mensagem = await mensagemRepo.criar({
      conversa_id: conversa.id,
      origem:      'cliente',
      tipo,
      texto,
      url,
      mime,
      external_id,
    });

    if (mensagem) {
      await conversaRepo.incrementarNaoLidas(conversa.id);
      broadcast('mensagem', { ...mensagem, conversa_id: conversa.id });
      broadcast('conversa_atualizada', await conversaRepo.porId(conversa.id));
    } else {
      // Reentrega concorrente: a unique de external_id barrou o insert.
      // Sem isto o motor rodaria 2x e a IA responderia (e cobraria) em dobro.
      if (!reprocessando) return;
      mensagem = await mensagemRepo.porExternalId(external_id);
      if (!mensagem) return;
    }
  }

  // Supervisora IA — analisa sentimento em tempo real se há agente na conversa
  if (conversa.status === 'ativa' && conversa.agente_id && texto) {
    const { processarMensagemCliente } = await import('../supervisoraIA.js');
    processarMensagemCliente(conversa, mensagem).catch(() => {});
  }

  if (conversa.status === 'ia') {
    // `await` (FASE 4): a rota não espera mais por isto — quem chama é o worker
    // de inbox, e é o `await` que faz a linha só virar `ok` DEPOIS do turno.
    // Sem ele, morte no meio do turno deixaria a entrada marcada como sucesso.
    const { processarConversa } = await import('../motorFluxo.js');
    await processarConversa(conversa, mensagem);
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
