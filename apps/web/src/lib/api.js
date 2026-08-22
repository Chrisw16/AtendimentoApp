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

  // Token expirado → tenta refresh antes de fazer logout
  if (res.status === 401 && useStore.getState().token) {
    // Evita loop infinito na própria rota de refresh/login
    if (!path.includes('/auth/')) {
      try {
        const refreshRes = await fetch(`${BASE}/auth/refresh`, {
          headers: { Authorization: `Bearer ${useStore.getState().token}` },
        });
        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          useStore.getState().setAuth({ token: refreshData.token, user: refreshData.user, role: refreshData.user?.role });
          // Retenta a requisição original com o novo token
          const retryHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${refreshData.token}`,
          };
          const retryRes = await fetch(`${BASE}${path}`, { method, headers: retryHeaders, body: body ? JSON.stringify(body) : undefined });
          const retryData = await retryRes.json().catch(() => ({}));
          if (!retryRes.ok) throw new Error(retryData.error || `Erro ${retryRes.status}`);
          return retryData;
        }
      } catch {}
    }
    useStore.getState().logout();
    throw new Error('Sessão expirada. Faça login novamente.');
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
  transferirFila:  (id, body)    => api.post(`/chat/conversas/${id}/transferir-fila`, body),
  fila:            ()            => api.get('/chat/fila'),
  nota:            (id, body)    => api.post(`/chat/conversas/${id}/notas`, body),
  reagir:          (msgId, body) => api.post(`/chat/mensagens/${msgId}/reacao`, body),
  apagar:          (msgId)       => api.delete(`/chat/mensagens/${msgId}`),
  respostasRapidas: ()           => api.get('/chat/respostas-rapidas'),
  agendarRetorno:  (id, body)    => api.post(`/chat/conversas/${id}/agendamento`, body),
  cancelarRetorno: (id)          => api.delete(`/chat/conversas/${id}/agendamento`),
};

// ── ENDPOINTS — FILAS DE ATENDIMENTO (FASE 5) ─────────────────────
// `/atendimento`, não `/filas`: aquela é a de inbox/outbox/jobs (FASE 4).
export const filasApi = {
  list:          ()             => api.get('/atendimento/filas'),
  criar:         (body)         => api.post('/atendimento/filas', body),
  atualizar:     (id, body)     => api.put(`/atendimento/filas/${id}`, body),
  remover:       (id)           => api.delete(`/atendimento/filas/${id}`),
  agentes:       (id)           => api.get(`/atendimento/filas/${id}/agentes`),
  definirAgentes:(id, agentes)  => api.put(`/atendimento/filas/${id}/agentes`, { agentes }),
  minhas:        ()             => api.get('/atendimento/minhas-filas'),
  assumirProximo:(fila_id)      => api.post('/atendimento/assumir-proximo', fila_id ? { fila_id } : {}),
};

// ── ENDPOINTS — CLIENTE 360 (FASE 6) ──────────────────────────────
export const cliente360Api = {
  // `diagnostico=1` inclui conexão e chamados — é lento (2 chamadas ao SGP),
  // por isso não vem no carregamento normal do painel.
  ficha:       (convId, diagnostico = false) =>
    api.get(`/cliente360/${convId}${diagnostico ? '?diagnostico=1' : ''}`),
  capacidades: ()                => api.get('/cliente360/capacidades'),
  acao:        (convId, body)    => api.post(`/cliente360/${convId}/acao`, body),
  diagnostico: (convId)          => api.post(`/cliente360/${convId}/diagnostico`),
  // As duas consultas caras do painel completo — fora da ficha de propósito,
  // para a lateral do chat continuar abrindo rápido.
  tecnico:     (convId, contrato) => api.get(`/cliente360/${convId}/tecnico${contrato ? `?contrato=${contrato}` : ''}`),
  faturas:     (convId, contrato) => api.get(`/cliente360/${convId}/faturas${contrato ? `?contrato=${contrato}` : ''}`),
};

// ── ENDPOINTS — KNOWLEDGE HUB (FASE 7) ────────────────────────────
export const knowledgeApi = {
  list:       (params = {}) => api.get('/knowledge?' + new URLSearchParams(params)),
  buscar:     (q, params = {}) => api.get('/knowledge/buscar?' + new URLSearchParams({ q, ...params })),
  artigo:     (id)          => api.get(`/knowledge/${id}`),
  criar:      (body)        => api.post('/knowledge', body),
  atualizar:  (id, body)    => api.put(`/knowledge/${id}`, body),
  status:     (id, status)  => api.post(`/knowledge/${id}/status`, { status }),
  feedback:   (id, body)    => api.post(`/knowledge/${id}/feedback`, body),
  remover:    (id)          => api.delete(`/knowledge/${id}`),
  categorias: ()            => api.get('/knowledge/categorias'),
  criarCategoria: (body)    => api.post('/knowledge/categorias', body),
  removerCategoria: (id)    => api.delete(`/knowledge/categorias/${id}`),
  gaps:       (params = {}) => api.get('/knowledge/gaps?' + new URLSearchParams(params)),
  atualizarGap: (id, body)  => api.put(`/knowledge/gaps/${id}`, body),
};

// ── ENDPOINTS — PLAYBOOKS (FASE 8) ────────────────────────────────
export const playbooksApi = {
  list:      (params = {}) => api.get('/playbooks?' + new URLSearchParams(params)),
  get:       (id)          => api.get(`/playbooks/${id}`),
  criar:     (body)        => api.post('/playbooks', body),
  atualizar: (id, body)    => api.put(`/playbooks/${id}`, body),
  etapas:    (id, etapas)  => api.put(`/playbooks/${id}/etapas`, { etapas }),
  status:    (id, status)  => api.post(`/playbooks/${id}/status`, { status }),
  remover:   (id)          => api.delete(`/playbooks/${id}`),
  execucao:  (conversaId)  => api.get(`/playbooks/execucao/${conversaId}`),
};

// ── ENDPOINTS — COPILOTO (FASE 10) ────────────────────────────────
export const copilotoApi = {
  painel:   (convId)          => api.get(`/copiloto/${convId}`),
  sugestao: (convId, body)    => api.post(`/copiloto/${convId}/sugestao`, body || {}),
  evento:   (convId, body)    => api.post(`/copiloto/${convId}/evento`, body),
  feedback: (convId, body)    => api.post(`/copiloto/${convId}/feedback`, body),
  metricas: (dias = 7)        => api.get(`/copiloto/metricas?dias=${dias}`),
};

// ── ENDPOINTS — QUALITY AI (FASE 11) ──────────────────────────────
export const qualityApi = {
  painel:      (dias = 30)      => api.get(`/quality/painel?dias=${dias}`),
  scorecards:  ()               => api.get('/quality/scorecards'),
  criarScorecard:   (body)      => api.post('/quality/scorecards', body),
  salvarScorecard:  (id, body)  => api.put(`/quality/scorecards/${id}`, body),
  removerScorecard: (id)        => api.delete(`/quality/scorecards/${id}`),
  auditorias:  (params = {})    => api.get('/quality/auditorias?' + new URLSearchParams(params)),
  auditoria:   (id)             => api.get(`/quality/auditorias/${id}`),
  auditar:     (conversaId)     => api.post(`/quality/auditar/${conversaId}`),
  revisar:     (id, body)       => api.post(`/quality/auditorias/${id}/revisao`, body),
  coaching:    (agenteId, dias) => api.get(`/quality/coaching/${agenteId}?dias=${dias || 30}`),
};

// ── ENDPOINTS — ANALYTICS (FASE 12) ───────────────────────────────
export const analyticsApi = {
  executivo:    (dias = 30) => api.get(`/analytics/executivo?dias=${dias}`),
  ia:           (dias = 30) => api.get(`/analytics/ia?dias=${dias}`),
  filas:        (dias = 30) => api.get(`/analytics/filas?dias=${dias}`),
  conhecimento: (dias = 30) => api.get(`/analytics/conhecimento?dias=${dias}`),
  nps:   (dias = 30, corte) => api.get(`/analytics/nps?dias=${dias}${corte ? `&corte=${corte}` : ''}`),
};

// ── ENDPOINTS — SAÚDE DO SISTEMA (FASE 13) ────────────────────────
export const saudeApi = {
  saude:     ()          => api.get('/monitor/saude'),
  erros:     (params={}) => api.get('/monitor/erros?' + new URLSearchParams(params)),
  marcarErro:(id, status)=> api.put(`/monitor/erros/${id}`, { status }),
};

// ── ENDPOINTS — AGENTES ───────────────────────────────────────────
export const promptsApi = {
  list:      ()           => api.get('/prompts'),
  update:    (slug, body) => api.put(`/prompts/${slug}`, body),
  restaurar: (slug)       => api.post(`/prompts/${slug}/restaurar`, {}),
};

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
  validar:     (id)       => api.post(`/fluxos/${id}/validar`),
  simular:     (id, body) => api.post(`/fluxos/${id}/simular`, body),
  simularReal:  (id, body) => api.post(`/fluxos/${id}/simular-real`, body),
  compartilhar: (id, body) => api.post(`/fluxos/${id}/compartilhar`, body),
  revogarLink:  (id)       => api.delete(`/fluxos/${id}/compartilhar`),
};

// Link público de teste (sem login) — usado pela página /teste/:token
export const chatTesteApi = {
  info:   (token)       => api.get(`/chat-teste/${token}`),
  enviar: (token, body) => api.post(`/chat-teste/${token}`, body),
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
