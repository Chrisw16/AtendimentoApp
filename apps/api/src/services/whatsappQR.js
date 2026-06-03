/**
 * whatsappQR.js
 * Canal WhatsApp QR Code via Evolution API.
 * Cria uma instância dedicada de teste na Evolution e exibe o QR Code no painel.
 */
import { evolutionRequest } from './integrations.js';

// Nome fixo da instância usada para o canal QR de testes
export const QR_INSTANCE_NAME = 'maxxi-qr-teste';

// ── ESTADO LOCAL ──────────────────────────────────────────────────
let cache = {
  status: 'disconnected', // 'disconnected' | 'connecting' | 'qr' | 'connected'
  qrcode: null,
  updatedAt: 0,
};

let pollTimer = null;

export function getStatus() {
  return { status: cache.status, qrcode: cache.qrcode };
}

// ── HELPERS ───────────────────────────────────────────────────────

// Busca estado real da instância na Evolution API
// Retorna 'open' | 'connecting' | 'close' | null (null = instância não existe)
async function fetchEvolutionState() {
  try {
    const res   = await evolutionRequest(`/instance/connectionState/${QR_INSTANCE_NAME}`, null, 'GET');
    // Evolution v1: { state }  |  Evolution v2: { instance: { state } }
    return res?.state || res?.instance?.state || 'close';
  } catch {
    return null; // instância não existe ou Evolution inacessível
  }
}

// Tenta deletar a instância usando todos os endpoints conhecidos das versões da Evolution API
async function deletarInstancia() {
  // Tenta logout primeiro (desconecta sessão WhatsApp)
  const logoutOk = await evolutionRequest(`/instance/logout/${QR_INSTANCE_NAME}`, null, 'DELETE')
    .then(() => true)
    .catch(err => { console.warn('[WhatsApp QR] logout:', err.message); return false; });

  // Evolution v1/v2: DELETE /instance/delete/{name}
  const del1 = await evolutionRequest(`/instance/delete/${QR_INSTANCE_NAME}`, null, 'DELETE')
    .then(() => true)
    .catch(() => false);

  // Evolution v2 recente: DELETE /instance/{name}
  const del2 = del1 ? true : await evolutionRequest(`/instance/${QR_INSTANCE_NAME}`, null, 'DELETE')
    .then(() => true)
    .catch(err => { console.warn('[WhatsApp QR] delete alternativo:', err.message); return false; });

  console.log(`[WhatsApp QR] deletarInstancia → logout=${logoutOk} delete=${del1 || del2}`);
  return del1 || del2;
}

// ── SINCRONIZAR ESTADO COM A EVOLUTION ───────────────────────────
// Chamado no getStatus para refletir a realidade quando o cache pode estar desatualizado
export async function sincronizarStatus() {
  // Se já está em processo ativo (connecting/qr), não sobrescreve
  if (cache.status === 'connecting') return;

  const state = await fetchEvolutionState();

  if (state === 'open') {
    if (cache.status !== 'connected') {
      cache = { status: 'connected', qrcode: null, updatedAt: Date.now() };
      pararPolling();
    }
  } else if (state === null) {
    // Instância não existe na Evolution — garante que o cache reflete isso
    if (cache.status !== 'disconnected') {
      cache = { status: 'disconnected', qrcode: null, updatedAt: Date.now() };
      pararPolling();
    }
  }
  // Se state = 'close' / 'connecting' e cache = 'qr', mantém o QR atual
}

// ── CONECTAR ──────────────────────────────────────────────────────
export async function conectar() {
  if (cache.status === 'connected' || cache.status === 'connecting') return;

  cache = { status: 'connecting', qrcode: null, updatedAt: Date.now() };

  try {
    // Remove instância antiga se existir (tenta todos os endpoints)
    await deletarInstancia();

    // Cria nova instância com qrcode habilitado
    const created = await evolutionRequest('/instance/create', {
      instanceName: QR_INSTANCE_NAME,
      qrcode:       true,
      integration:  'WHATSAPP-BAILEYS',
    }, 'POST');

    console.log('[WhatsApp QR] Instância criada:', JSON.stringify(created)?.slice(0, 200));

    // Tenta extrair QR do retorno direto da criação (Evolution v2)
    const qrBase64 = created?.qrcode?.base64 || null;
    if (qrBase64) {
      cache = { status: 'qr', qrcode: qrBase64, updatedAt: Date.now() };
    } else {
      // Aguarda um pouco e busca o QR no endpoint de connect
      await new Promise(r => setTimeout(r, 2000));
      await refreshQR();
    }

  } catch (err) {
    console.error('[WhatsApp QR] Erro ao conectar via Evolution:', err.message);
    cache = { status: 'disconnected', qrcode: null, updatedAt: Date.now() };
    throw err;
  }

  iniciarPolling();
}

// ── ATUALIZAR QR ──────────────────────────────────────────────────
export async function refreshQR() {
  try {
    const res = await evolutionRequest(`/instance/connect/${QR_INSTANCE_NAME}`, null, 'GET');
    const qrBase64 = res?.base64 || res?.qrcode?.base64 || null;
    if (qrBase64) {
      cache = { status: 'qr', qrcode: qrBase64, updatedAt: Date.now() };
      console.log('[WhatsApp QR] QR Code atualizado');
    } else {
      console.warn('[WhatsApp QR] QR não encontrado na resposta:', JSON.stringify(res)?.slice(0, 200));
    }
  } catch (err) {
    console.warn('[WhatsApp QR] Não foi possível obter QR Code:', err.message);
  }
}

// ── POLLING DE ESTADO ─────────────────────────────────────────────
function iniciarPolling() {
  pararPolling();
  pollTimer = setInterval(async () => {
    const state = await fetchEvolutionState();

    if (state === 'open') {
      cache = { status: 'connected', qrcode: null, updatedAt: Date.now() };
      pararPolling();
      console.log('[WhatsApp QR] Conectado via Evolution!');
    } else if (state === null) {
      // Instância sumiu — para de tentar
      console.warn('[WhatsApp QR] Instância não encontrada no polling, parando.');
      cache = { status: 'disconnected', qrcode: null, updatedAt: Date.now() };
      pararPolling();
    } else {
      // state = 'close' ou 'connecting': renova QR se expirado
      const qrAge = Date.now() - cache.updatedAt;
      if (cache.status === 'qr' && qrAge > 55_000) {
        await refreshQR();
      }
    }
  }, 5000);
}

function pararPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── DESCONECTAR ───────────────────────────────────────────────────
export async function desconectar() {
  pararPolling();

  const deletou = await deletarInstancia();
  if (!deletou) {
    console.error('[WhatsApp QR] Não foi possível deletar a instância na Evolution API. Verifique manualmente em {evolution_url}/manager.');
  }

  cache = { status: 'disconnected', qrcode: null, updatedAt: Date.now() };
}

// ── ENVIO ─────────────────────────────────────────────────────────
export async function enviarTexto(numero, texto) {
  if (cache.status !== 'connected') {
    throw new Error('WhatsApp QR não está conectado');
  }
  const { evolutionEnviarTexto } = await import('./integrations.js');
  return evolutionEnviarTexto(QR_INSTANCE_NAME, numero, texto);
}
