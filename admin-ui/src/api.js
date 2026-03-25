const BASE = window.location.origin + '/admin';
function getToken() { return localStorage.getItem('maxxi_token') || ''; }
export function setToken(t) { localStorage.setItem('maxxi_token', t); }
export function clearAuth() { ['maxxi_token','maxxi_role','maxxi_nome','maxxi_id'].forEach(k => localStorage.removeItem(k)); }

export async function api(path, opts = {}) {
  const headers = { 'x-admin-token': getToken(), 'Content-Type': 'application/json', ...opts.headers };
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (res.status === 401) { clearAuth(); window.location.reload(); throw new Error('Unauthorized'); }
  return res;
}
export async function apiJson(path, opts) { return (await api(path, opts)).json(); }

// Auth
export const login = (u, s) => fetch(`${BASE}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: u || 'admin', senha: s }) }).then(r => r.json());

// Dashboard
export const fetchStats = () => apiJson('/api/stats');
export const fetchDashboard = (dias = 1) => apiJson(`/api/dashboard?dias=${dias}`);
export const fetchNpsStats = (d = 30) => apiJson(`/api/nps/stats?dias=${d}`);
export const fetchAlertasStatus = () => apiJson('/api/alertas/status');

// Chat — FIX: "conteudo" instead of "texto"
export const fetchConversas = (filtro) => apiJson('/api/conversas' + (filtro ? `?filtro=${filtro}` : ''));
export const fetchConversa = (id) => apiJson(`/api/conversas/${id}`);
export const enviarMensagem = (id, conteudo, agenteId, agenteNome) => api(`/api/conversas/${id}/mensagem`, { method: 'POST', body: JSON.stringify({ conteudo, agenteId, agenteNome }) }).then(r => r.json());
export const assumirConversa = (id, agenteId, agenteNome) => api(`/api/conversas/${id}/assumir`, { method: 'POST', body: JSON.stringify({ agenteId, agenteNome }) }).then(r => r.json());
export const devolverIA = (id) => api(`/api/conversas/${id}/devolver-ia`, { method: 'POST', body: '{}' }).then(r => r.json());
export const encerrarConversa = (id) => api(`/api/conversas/${id}/encerrar`, { method: 'POST', body: '{}' }).then(r => r.json());
export const adicionarNota = (id, nota, agenteId, agenteNome) => api(`/api/conversas/${id}/nota`, { method: 'POST', body: JSON.stringify({ nota, agenteId, agenteNome }) }).then(r => r.json());
export const transferirConversa = (id, paraAgenteId, deAgenteNome) => api(`/api/conversas/${id}/transferir`, { method: 'POST', body: JSON.stringify({ paraAgenteId, deAgenteNome }) }).then(r => r.json());
export const apagarMensagem = (convId, msgId) => api(`/api/conversas/${convId}/mensagem/${msgId}`, { method: 'DELETE' }).then(r => r.json());
export const fetchRespostasRapidas = () => apiJson('/api/respostas-rapidas');

// SGP / Cliente
export const fetchClienteCompleto = (cpf) => apiJson(`/api/sgp/cliente-completo?cpf=${cpf}`);
export const fetchConexao = (contrato) => apiJson(`/api/sgp/conexao/${contrato}`);
export const liberarContrato = (contrato) => api(`/api/sgp/contrato/${contrato}/liberar`, { method: 'POST', body: '{}' }).then(r => r.json());
export const promessaPagamento = (contrato) => api(`/api/sgp/contrato/${contrato}/promessa`, { method: 'POST', body: '{}' }).then(r => r.json());
export const fetchAgentes = () => apiJson('/api/agentes');

// Boleto / PIX
export const enviarBoleto = (convId, canal, telefone, accountId, boleto) => api('/api/chat/enviar-boleto', { method: 'POST', body: JSON.stringify({ convId, canal, telefone, accountId, boleto }) }).then(r => r.json());

// Ocorrências
export const fecharOcorrencia = (id, conteudo) => api(`/api/sgp/ocorrencia/${id}/fechar`, { method: 'POST', body: JSON.stringify({ conteudo }) }).then(r => r.json());
export const notaOcorrencia = (id, conteudo) => api(`/api/sgp/ocorrencia/${id}/nota`, { method: 'POST', body: JSON.stringify({ conteudo }) }).then(r => r.json());
export const criarChamado = (contrato, tipo, conteudo) => api('/api/sgp/chamado', { method: 'POST', body: JSON.stringify({ contrato, tipo, conteudo }) }).then(r => r.json());

// Canais
export const fetchCanais = () => apiJson('/api/canais');
export const fetchCanal = (tipo) => apiJson(`/api/canais/${tipo}`);
export const salvarCanal = (tipo, data) => api(`/api/canais/${tipo}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.json());
export const ativarCanal = (tipo, ativo) => api(`/api/canais/${tipo}/ativar`, { method: 'POST', body: JSON.stringify({ ativo }) }).then(r => r.json());
export const registrarWebhookTelegram = () => api('/api/canais/telegram/registrar-webhook', { method: 'POST' }).then(r => r.json());
export const statusWebhookTelegram = () => apiJson('/api/canais/telegram/status-webhook');
export const fetchWebhookUrls = () => apiJson('/api/canais/webhooks/urls');

// Push
export const fetchVapidKey = () => apiJson('/api/push/vapid-key');
export const subscribePush = (sub) => api('/api/push/subscribe', { method: 'POST', body: JSON.stringify(sub) });
export const testPush = () => api('/api/push/test', { method: 'POST', body: '{}' });

// SSE
export function createChatSSE() { return new EventSource(`${BASE}/chat/stream?agenteId=${localStorage.getItem('maxxi_id') || 'admin'}&token=${getToken()}`); }

// Fila & urgência
export const fetchFilaStatus = () => apiJson('/api/fila/status');
export const fetchSlaConfig = () => apiJson('/api/fila/sla');
export const salvarSlaConfig = (cfg) => api('/api/fila/sla', { method: 'PUT', body: JSON.stringify(cfg) }).then(r => r.json());

// Agendamento de retorno
export const agendarRetorno = (convId, telefone, canal, minutos, mensagem) =>
  api('/api/agendamento/retorno', { method: 'POST', body: JSON.stringify({ convId, telefone, canal, minutos, mensagem }) }).then(r => r.json());
export const cancelarRetorno = (convId) =>
  api(`/api/agendamento/retorno/${convId}`, { method: 'DELETE' }).then(r => r.json());
export const listarAgendamentos = (filtro = 'pendentes') => apiJson(`/api/agendamento/retorno?filtro=${filtro}`);

// Accountability de agentes
export const fetchAgentesDisponiveis = () => apiJson('/api/agentes/disponiveis');
export const fetchRankingSemanal = () => apiJson('/api/agentes/ranking');
export const ativarNaoPerturbe = (minutos, motivo) =>
  api('/api/agentes/nao-perturbe', { method: 'POST', body: JSON.stringify({ minutos, motivo }) }).then(r => r.json());
export const desativarNaoPerturbe = () =>
  api('/api/agentes/nao-perturbe', { method: 'DELETE' }).then(r => r.json());
export const reatribuirConversas = (agenteId, paraAgenteId, devolverFila = false) =>
  api(`/api/agentes/${agenteId}/reatribuir`, { method: 'POST', body: JSON.stringify({ paraAgenteId, devolverFila }) }).then(r => r.json());
export const setMaxConversas = (agenteId, max) =>
  api(`/api/agentes/${agenteId}/max-conversas`, { method: 'PUT', body: JSON.stringify({ max }) }).then(r => r.json());

// Relatório IA
export const gerarRelatorioIA = () => apiJson('/api/relatorio/agente/hoje');
export const enviarRelatorioWhatsApp = (numero) =>
  api('/api/relatorio/enviar-whatsapp', { method: 'POST', body: JSON.stringify({ numero }) }).then(r => r.json());

// Monitor TV
export const fetchMonitorDados = () => fetch(window.location.origin + '/admin/monitor/dados').then(r => r.json());
