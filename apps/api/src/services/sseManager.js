/**
 * sseManager.js — Server-Sent Events
 * Redis é opcional — se não estiver disponível, funciona em modo single-process
 */

import { randomUUID } from 'node:crypto';

// Mapa local: agenteId → Set<res>
const localClients = new Map();

// Identifica ESTA instância no pub/sub. `broadcast`/`sendToAgente` já entregam
// local antes de publicar; sem isto o processo receberia o próprio anúncio de
// volta pelo Redis e entregaria tudo DUAS vezes na tela do agente.
const INSTANCIA_ID = randomUUID();

/** true = o payload nasceu nesta instância e já foi entregue localmente. */
export function ehEcoProprio(payload, instanciaId = INSTANCIA_ID) {
  return payload?.origem === instanciaId;
}

let publisher  = null;
let subscriber = null;
let redisOk    = false;

const CHANNEL = 'maxxi:sse';

async function initRedis() {
  if (!process.env.REDIS_URL) return;
  try {
    // O pacote instalado é `ioredis`, não `redis` — o import antigo (`redis`)
    // sempre falhava e o SSE caía silenciosamente em modo local, então o
    // broadcast nunca cruzava instâncias.
    const { default: Redis } = await import('ioredis');

    // lazyConnect: falha de conexão vira rejeição de `connect()` (e cai no
    // catch) em vez de ficar reconectando para sempre em background.
    const opts = { lazyConnect: true, maxRetriesPerRequest: 2 };
    publisher  = new Redis(process.env.REDIS_URL, opts);
    subscriber = publisher.duplicate();

    // Registrado antes de conectar: 'error' sem listener derruba o processo.
    publisher.on('error',  () => {});
    subscriber.on('error', () => {});

    await Promise.all([publisher.connect(), subscriber.connect()]);

    // ioredis entrega por evento; a API do `redis` usava callback no subscribe.
    subscriber.on('message', (_canal, raw) => {
      try {
        const payload = JSON.parse(raw);
        if (ehEcoProprio(payload)) return;   // já entregue local por quem publicou
        _deliverLocal(payload.event, payload.data, payload.target);
      } catch {}
    });
    await subscriber.subscribe(CHANNEL);

    redisOk = true;
    console.log('✅ Redis SSE conectado (ioredis)');
  } catch (err) {
    console.warn('⚠️  Redis SSE não disponível, usando modo local:', err.message);
    redisOk = false;
    publisher?.disconnect?.();
    subscriber?.disconnect?.();
    publisher = subscriber = null;
  }
}

initRedis();

// ── REGISTRO DE CLIENTES ─────────────────────────────────────────
export function addClient(agenteId, res) {
  if (!localClients.has(agenteId)) localClients.set(agenteId, new Set());
  localClients.get(agenteId).add(res);
}

export function removeClient(agenteId, res) {
  localClients.get(agenteId)?.delete(res);
  if (localClients.get(agenteId)?.size === 0) localClients.delete(agenteId);
}

// ── ENTREGA LOCAL ─────────────────────────────────────────────────
function _deliverLocal(event, data, target = null) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

  if (target) {
    localClients.get(target)?.forEach(res => {
      try { res.write(msg); } catch {}
    });
  } else {
    localClients.forEach(set => {
      set.forEach(res => { try { res.write(msg); } catch {} });
    });
  }
}

// ── BROADCAST ────────────────────────────────────────────────────
export async function broadcast(event, data) {
  _deliverLocal(event, data);

  if (redisOk) {
    await publisher.publish(CHANNEL, JSON.stringify({ event, data, target: null, origem: INSTANCIA_ID }))
      .catch(() => {});
  }
}

// ── SEND TO AGENTE ────────────────────────────────────────────────
export async function sendToAgente(agenteId, event, data) {
  _deliverLocal(event, data, agenteId);

  if (redisOk) {
    await publisher.publish(CHANNEL, JSON.stringify({ event, data, target: agenteId, origem: INSTANCIA_ID }))
      .catch(() => {});
  }
}
