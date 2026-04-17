/**
 * API Client — camada centralizada de comunicação com o backend
 * Todos os módulos importam daqui, nunca usam fetch diretamente
 */
import { useStore } from '../store';

const BASE = '/api';

// ── HTTP BASE ─────────────────────────────────────────────────────
async function request(method, path, body = null, opts = {}) {
  const token = useStore.getState().token;

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...opts.headers,
  };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  });

  // Token expirado → logout automático (só se já estiver autenticado)
  if (res.status === 401 && useStore.getState().token) {
    useStore.getState().logout();
    throw new Error('Sessão expirada');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Erro ${res.status}`);
  return data;
}

export const api = {
  get:    (path, opts)        => request('GET',    path, null, opts),
  post:   (path, body, opts)  => request('POST',   path, body, opts),
  put:    (path, body, opts)  => request('PUT',    path, body, opts),
  patch:  (path, body, opts)  => request('PATCH',  path, body, opts),
  delete: (path, opts)        => request('DELETE', path, null, opts),
};

// ── SSE ───────────────────────────────────────────────────────────
export function createSSE(path, handlers = {}) {
  const token  = useStore.getState().token;
  const url    = `${BASE}${path}?token=${encodeURIComponent(token || '')}`;
  const source = new EventSource(url);

  source.onopen  = handlers.onOpen  || null;
  source.onerror = handlers.onError || null;

  Object.entries(handlers).forEach(([event, handler]) => {
    if (['onOpen', 'onError'].includes(event)) return;
    source.addEventListener(event, e => {
      try { handler(JSON.parse(e.data)); } catch { handler(e.data); }
    });
  });

  return () => source.close();
}

// ── UPLOAD ────────────────────────────────────────────────────────
export async function upload(path, file, extra = {}) {
  const token  = useStore.getState().token;
  const form   = new FormData();
  form.append('file', file);
  Object.entries(extra).forEach(([k, v]) => form.append(k, v));

  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

// ── ENDPOINTS — AUTH ──────────────────────────────────────────────
export const authApi = {
  login:  (creds)  => api.post('/auth/login', creds),
  me:     ()       => api.get('/auth/me'),
  logout: ()       => api.post('/auth/logout'),
};

// ── ENDPOINTS — CHAT ──────────────────────────────────────────────
export const chatApi = {
  conversas:       (params = {}) => api.get('/chat/conversas?' + new URLSearchParams(params)),
  conversa:        (id)          => api.get(`/chat/conversas/${id}`),
  mensagens:       (id, params)  => api.get(`/chat/conversas/${id}/mensagens?` + new URLSearchParams(params)),
  enviar:          (id, body)    => api.post(`/chat/conversas/${id}/mensagens`, body),
  assumir:         (id)          => api.post(`/chat/conversas/${id}/assumir`),
  devolverIA:      (id)          => api.post(`/chat/conversas/${id}/devolver-ia`),
  encerrar:        (id, body)    => api.post(`/chat/conversas/${id}/encerrar`, body),
  transferir:      (id, body)    => api.post(`/chat/conversas/${id}/transferir`, body),
  nota:            (id, body)    => api.post(`/chat/conversas/${id}/notas`, body),
  reagir:          (msgId, body) => api.post(`/chat/mensagens/${msgId}/reacao`, body),
  apagar:          (msgId)       => api.delete(`/chat/mensagens/${msgId}`),
  respostasRapidas: ()           => api.get('/chat/respostas-rapidas'),

// ── PROMPTS IA ───────────────────────────────────────────────────
export const promptsApi = {
  list:     ()           => api.get('/prompts'),
  update:   (slug, body) => api.put(`/prompts/${slug}`, body),
  restaurar:(slug)       => api.post(`/prompts/${slug}/restaurar`, {}),
};
  agendarRetorno:  (id, body)    => api.post(`/chat/conversas/${id}/agendamento`, body),
  cancelarRetorno: (id)          => api.delete(`/chat/conversas/${id}/agendamento`),
};

// ── ENDPOINTS — AGENTES ───────────────────────────────────────────
export const agentesApi = {
  list:   ()           => api.get('/agentes'),
  get:    (id)         => api.get(`/agentes/${id}`),
  create: (body)       => api.post('/agentes', body),
  update: (id, body)   => api.put(`/agentes/${id}`, body),
  delete: (id)         => api.delete(`/agentes/${id}`),
  online: ()           => api.get('/agentes/online'),
};

// ── ENDPOINTS — CLIENTES ──────────────────────────────────────────
export const clientesApi = {
  list:   (params)     => api.get('/clientes?' + new URLSearchParams(params)),
  get:    (id)         => api.get(`/clientes/${id}`),
  create: (body)       => api.post('/clientes', body),
  update: (id, body)   => api.put(`/clientes/${id}`, body),
  buscar: (q)          => api.get(`/clientes/buscar?q=${encodeURIComponent(q)}`),
};

// ── ENDPOINTS — OCORRÊNCIAS ───────────────────────────────────────
export const ocorrenciasApi = {
  list:   (params)     => api.get('/ocorrencias?' + new URLSearchParams(params)),
  get:    (id)         => api.get(`/ocorrencias/${id}`),
  create: (body)       => api.post('/ocorrencias', body),
  update: (id, body)   => api.put(`/ocorrencias/${id}`, body),
  fechar: (id, body)   => api.post(`/ocorrencias/${id}/fechar`, body),
  nota:   (id, body)   => api.post(`/ocorrencias/${id}/notas`, body),
  tipos:  ()           => api.get('/ocorrencias/tipos'),
};

// ── ENDPOINTS — DASHBOARD ─────────────────────────────────────────
export const dashboardApi = {
  kpis:        ()      => api.get('/dashboard/kpis'),
  atendimentos:(range) => api.get(`/dashboard/atendimentos?range=${range}`),
  agentes:     ()      => api.get('/dashboard/agentes'),
};

// ── ENDPOINTS — FLUXOS ───────────────────────────────────────────
export const fluxosApi = {
  list:    ()          => api.get('/fluxos'),
  get:     (id)        => api.get(`/fluxos/${id}`),
  create:  (body)      => api.post('/fluxos', body),
  update:  (id, body)  => api.put(`/fluxos/${id}`, body),
  delete:  (id)        => api.delete(`/fluxos/${id}`),
  ativar:  (id)        => api.post(`/fluxos/${id}/ativar`),
};

// ── ENDPOINTS — CANAIS ───────────────────────────────────────────
export const canaisApi = {
  list:   ()           => api.get('/canais'),
  update: (tipo, body) => api.put(`/canais/${tipo}`, body),
};

// ── ENDPOINTS — FINANCEIRO ────────────────────────────────────────
export const financeiroApi = {
  resumo:   (params)   => api.get('/financeiro/resumo?' + new URLSearchParams(params)),
  cobranças:(params)   => api.get('/financeiro/cobrancas?' + new URLSearchParams(params)),
  regua:    ()         => api.get('/financeiro/regua'),
};
