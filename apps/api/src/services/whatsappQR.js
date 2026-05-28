/**
 * whatsappQR.js
 * Canal WhatsApp QR Code via Evolution API.
 * Cria uma instância dedicada de teste na Evolution e exibe o QR Code no painel.
 */
import { evolutionRequest } from './integrations.js';

// Nome fixo da instância usada para o canal QR de testes
export const QR_INSTANCE_NAME = 'maxxi-qr-teste';

// ── ESTADO LOCAL ──────────────────────────────────────────────────
// Mantém cache do estado para evitar polling excessivo à Evolution API
let cache = {
  status: 'disconnected', // 'disconnected' | 'connecting' | 'qr' | 'connected'
  qrcode: null,           // data URL base64 retornada pela Evolution
  updatedAt: 0,
};

let pollTimer = null;

export function getStatus() {
  return { status: cache.status, qrcode: cache.qrcode };
}

// ── CONECTAR ──────────────────────────────────────────────────────
export async function conectar() {
  if (cache.status === 'connected' || cache.status === 'connecting') return;

  cache = { status: 'connecting', qrcode: null, updatedAt: Date.now() };

  try {
    // Remove instância antiga se existir
    await evolutionRequest(`/instance/logout/${QR_INSTANCE_NAME}`, null, 'DELETE').catch(() => {});
    await evolutionRequest(`/instance/delete/${QR_INSTANCE_NAME}`, null, 'DELETE').catch(() => {});

    // Cria nova instância com qrcode habilitado
    const created = await evolutionRequest('/instance/create', {
      instanceName: QR_INSTANCE_NAME,
      qrcode:       true,
      integration:  'WHATSAPP-BAILEYS',
    }, 'POST');

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
    }
  } catch (err) {
    console.warn('[WhatsApp QR] Não foi possível obter QR Code:', err.message);
  }
}

// ── POLLING DE ESTADO ─────────────────────────────────────────────
function iniciarPolling() {
  pararPolling();
  pollTimer = setInterval(async () => {
    try {
      const res   = await evolutionRequest(`/instance/connectionState/${QR_INSTANCE_NAME}`, null, 'GET');
      // Evolution v1: { state: 'open' }  |  Evolution v2: { instance: { state: 'open' } }
      const state = res?.state || res?.instance?.state || 'close';

      if (state === 'open') {
        cache = { status: 'connected', qrcode: null, updatedAt: Date.now() };
        pararPolling();
        console.log('[WhatsApp QR] Conectado via Evolution!');
      } else if (state === 'connecting' || state === 'close') {
        // Se o QR expirou (mais de 55s sem scan), busca um novo
        const qrAge = Date.now() - cache.updatedAt;
        if (cache.status === 'qr' && qrAge > 55_000) {
          await refreshQR();
        }
      }
    } catch {
      // Instância pode não existir ainda — ignora
    }
  }, 5000);
}

function pararPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ── DESCONECTAR ───────────────────────────────────────────────────
export async function desconectar() {
  pararPolling();
  await evolutionRequest(`/instance/logout/${QR_INSTANCE_NAME}`, null, 'DELETE').catch(() => {});
  await evolutionRequest(`/instance/delete/${QR_INSTANCE_NAME}`, null, 'DELETE').catch(() => {});
  cache = { status: 'disconnected', qrcode: null, updatedAt: Date.now() };
}

// ── ENVIO ─────────────────────────────────────────────────────────
// Delega para evolutionEnviarTexto usando a instância QR dedicada
export async function enviarTexto(numero, texto) {
  if (cache.status !== 'connected') {
    throw new Error('WhatsApp QR não está conectado');
  }
  const { evolutionEnviarTexto } = await import('./integrations.js');
  return evolutionEnviarTexto(QR_INSTANCE_NAME, numero, texto);
}
