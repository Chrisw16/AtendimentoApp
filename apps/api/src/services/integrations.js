/**
 * integrations.js — Centraliza todas as chamadas a APIs externas
 * Lê credenciais do banco (sistema_kv) em tempo real
 * Nunca usa process.env para credenciais de negócio
 */
import { getDb } from '../config/db.js';

// Cache em memória com TTL de 5 minutos
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

async function getKV(chave) {
  const now = Date.now();
  if (cache.has(chave) && now - cache.get(chave).ts < CACHE_TTL) {
    return cache.get(chave).val;
  }
  const db  = getDb();
  const row = await db('sistema_kv').where({ chave }).first();
  let val = null;
  if (row?.valor) {
    try { val = JSON.parse(row.valor); } catch { val = row.valor; }
  }
  cache.set(chave, { val, ts: now });
  return val;
}

// Limpa cache quando config é salva
export function invalidateConfigCache() {
  cache.clear();
}

// ── ANTHROPIC ─────────────────────────────────────────────────────
export async function getAnthropicClient() {
  const key = await getKV('anthropic_api_key');
  if (!key) throw new Error('Anthropic API Key não configurada. Acesse Configurações → Integrações de IA.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: key });
}

// ── SGP ───────────────────────────────────────────────────────────
export async function sgpRequest(path, opts = {}) {
  const base  = await getKV('sgp_url');
  const token = await getKV('sgp_token');
  if (!base)  throw new Error('URL do SGP não configurada. Acesse Configurações → SGP/ERP.');
  if (!token) throw new Error('Token do SGP não configurado. Acesse Configurações → SGP/ERP.');

  const url = `${base.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`SGP ${res.status}: ${body || res.statusText}`);
  }
  return res.json();
}

// ── EVOLUTION API ─────────────────────────────────────────────────
export async function evolutionRequest(path, body = null, method = 'GET') {
  const base = await getKV('evolution_url');
  const key  = await getKV('evolution_key');
  if (!base) throw new Error('URL da Evolution API não configurada. Acesse Configurações → Evolution API.');
  if (!key)  throw new Error('API Key da Evolution não configurada. Acesse Configurações → Evolution API.');

  const opts = {
    method,
    headers: { 'apikey': key, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${base.replace(/\/$/, '')}${path}`, opts);
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Evolution ${res.status}: ${txt || res.statusText}`);
  }
  return res.json().catch(() => ({}));
}

// ── SGP: funções de alto nível ────────────────────────────────────

export async function sgpBuscarCliente(cpfCnpj) {
  const cpf = String(cpfCnpj).replace(/\D/g, '');
  return sgpRequest(`/clientes?cpf_cnpj=${cpf}&limit=5`);
}

export async function sgpBuscarBoletos(contratoId) {
  return sgpRequest(`/financeiro/boletos?contrato=${contratoId}&status=aberto`);
}

export async function sgpVerificarStatus(contratoId) {
  return sgpRequest(`/contratos/${contratoId}/status`);
}

export async function sgpAbrirChamado({ contratoId, tipoId, descricao }) {
  return sgpRequest('/chamados', {
    method: 'POST',
    body: JSON.stringify({ contrato_id: contratoId, tipo_id: tipoId || 5, descricao }),
  });
}

export async function sgpPromessaPagamento(contratoId) {
  return sgpRequest(`/financeiro/promessa`, {
    method: 'POST',
    body: JSON.stringify({ contrato_id: contratoId }),
  });
}

export async function sgpListarPlanos(cidade) {
  return sgpRequest(`/planos?cidade=${encodeURIComponent(cidade || '')}`);
}

// ── Evolution: envio de mensagens ─────────────────────────────────

export async function evolutionEnviarTexto(instancia, numero, texto) {
  return evolutionRequest(`/message/sendText/${instancia}`, {
    number: numero,
    text:   texto,
  }, 'POST');
}

export async function evolutionEnviarBotoes(instancia, numero, { corpo, botoes }) {
  return evolutionRequest(`/message/sendButtons/${instancia}`, {
    number:   numero,
    title:    corpo,
    buttons:  botoes.map((b, i) => ({
      buttonId:   b.id || `btn${i}`,
      buttonText: { displayText: b.label || b },
      type: 1,
    })),
  }, 'POST');
}

export async function evolutionEnviarLista(instancia, numero, { corpo, labelBotao, tituloSecao, itens }) {
  return evolutionRequest(`/message/sendList/${instancia}`, {
    number:   numero,
    title:    corpo,
    buttonText: labelBotao || 'Ver opções',
    sections: [{
      title: tituloSecao || 'Opções',
      rows:  itens.map(it => ({ rowId: it.id, title: it.titulo })),
    }],
  }, 'POST');
}

export async function evolutionEnviarCTA(instancia, numero, { corpo, label, url }) {
  return evolutionRequest(`/message/sendLink/${instancia}`, {
    number:      numero,
    caption:     corpo,
    title:       label,
    linkPreview: url,
  }, 'POST');
}

export async function evolutionEnviarImagem(instancia, numero, { url, legenda }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, {
    number:   numero,
    mediatype: 'image',
    media:    url,
    caption:  legenda || '',
  }, 'POST');
}

export async function evolutionEnviarAudio(instancia, numero, { url }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, {
    number:   numero,
    mediatype: 'audio',
    media:    url,
  }, 'POST');
}

export async function evolutionEnviarArquivo(instancia, numero, { url, filename }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, {
    number:    numero,
    mediatype: 'document',
    media:     url,
    fileName:  filename || 'arquivo',
  }, 'POST');
}
