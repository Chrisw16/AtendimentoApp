/**
 * sseManager.js — Server-Sent Events
 * Redis é opcional — se não estiver disponível, funciona em modo single-process
 */

// Mapa local: agenteId → Set<res>
const localClients = new Map();

let publisher  = null;
let subscriber = null;
let redisOk    = false;

const CHANNEL = 'maxxi:sse';

async function initRedis() {
  if (!process.env.REDIS_URL) return;
  try {
    // Import dinâmico para não quebrar se redis não estiver instalado
    const { createClient } = await import('redis');

    publisher  = createClient({ url: process.env.REDIS_URL });
    subscriber = publisher.duplicate();

    await Promise.all([publisher.connect(), subscriber.connect()]);

    subscriber.subscribe(CHANNEL, (raw) => {
      try {
        const { event, data, target } = JSON.parse(raw);
        _deliverLocal(event, data, target);
      } catch {}
    });

    redisOk = true;
    console.log('✅ Redis SSE conectado');
  } catch (err) {
    console.warn('⚠️  Redis SSE não disponível, usando modo local:', err.message);
    redisOk = false;
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
    await publisher.publish(CHANNEL, JSON.stringify({ event, data, target: null }))
      .catch(() => {});
  }
}

// ── SEND TO AGENTE ────────────────────────────────────────────────
export async function sendToAgente(agenteId, event, data) {
  _deliverLocal(event, data, agenteId);

  if (redisOk) {
    await publisher.publish(CHANNEL, JSON.stringify({ event, data, target: agenteId }))
      .catch(() => {});
  }
}
