/**
 * integrations.js — Integração SGP fiel ao código original
 * Todos os endpoints, formatos e campos idênticos ao erp.js de referência
 */
import { getDb } from '../config/db.js';

// ── CACHE DE CONFIG (5 min) ───────────────────────────────────────
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

export function invalidateConfigCache() { cache.clear(); }

// ── SGP CONFIG ────────────────────────────────────────────────────
async function getSGPConfig() {
  const [url, app, token] = await Promise.all([
    getKV('sgp_url'), getKV('sgp_app'), getKV('sgp_token'),
  ]);
  if (!url)   throw new Error('URL do SGP não configurada. Acesse Configurações → SGP/ERP.');
  if (!app)   throw new Error('SGP App não configurado. Acesse Configurações → SGP/ERP.');
  if (!token) throw new Error('Token do SGP não configurado. Acesse Configurações → SGP/ERP.');
  // Remove barra final e também /api/ duplicado caso o usuário tenha incluído na URL base
  let cleanUrl = url.replace(/\/+$/, '').replace(/\/api$/, '');
  // Garante protocolo https:// se não tiver
  if (cleanUrl && !cleanUrl.startsWith('http')) {
    cleanUrl = 'https://' + cleanUrl;
  }
  return { url: cleanUrl, app, token };
}

// ── HELPERS SGP ───────────────────────────────────────────────────

// SGP usa application/x-www-form-urlencoded com app+token em todos os requests
async function sgpPost(path, params = {}) {
  const { url, app, token } = await getSGPConfig();
  const body = new URLSearchParams({ app, token, ...params }).toString();
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

async function sgpPostJSON(path, body = {}) {
  const { url, app, token } = await getSGPConfig();
  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app, token, ...body }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

async function sgpGet(path, params = {}) {
  const { url, app, token } = await getSGPConfig();
  const qs = new URLSearchParams({ app, token, ...params }).toString();
  const res = await fetch(`${url}${path}?${qs}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`SGP ${res.status} em ${path}`);
  return res.json();
}

function formatarCPFCNPJ(digits) {
  if (digits.length === 11) return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (digits.length === 14) return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return digits;
}

// ── SGP: CONSULTAR CLIENTE ────────────────────────────────────────
// POST /api/ura/consultacliente/ — retorna contratos com status, títulos, etc.
export async function consultarClientes(cpfcnpj) {
  const digits = (cpfcnpj || '').replace(/\D/g, '');
  if (digits.length < 11) {
    return { erro: true, mensagem: 'CPF ou CNPJ inválido. Solicite o número completo.' };
  }
  const formatted = formatarCPFCNPJ(digits);

  // Tenta 3 formas como no original
  let raw = null;
  try {
    const { url } = await getSGPConfig();
    console.log(`[SGP] consultacliente: URL=${url} CPF=${digits}`);
    raw = await sgpPost('/api/ura/consultacliente/', { cpfcnpj: digits });
    console.log(`[SGP] Resposta (digits):`, JSON.stringify(raw)?.slice(0, 200));
  } catch(e) {
    console.error('[SGP] Erro consultacliente (digits):', e.message);
    raw = null;
  }
  if (!raw?.contratos?.length) {
    try {
      raw = await sgpPost('/api/ura/consultacliente/', { cpfcnpj: formatted });
      console.log(`[SGP] Resposta (formatted):`, JSON.stringify(raw)?.slice(0, 200));
    } catch(e) {
      console.error('[SGP] Erro consultacliente (formatted):', e.message);
      raw = null;
    }
  }
  // Endpoint /api/ura/clientes/ não consta na doc oficial SGP — removido

  const todosContratos = raw?.contratos || [];
  if (!todosContratos.length) return { erro: true, mensagem: 'Cliente não encontrado para este CPF/CNPJ.' };

  const primeiro = todosContratos[0];
  const STATUS_MAP = { 1:'ativo', 2:'inativo', 3:'cancelado', 4:'suspenso', 5:'inviabilidade técnica', 6:'novo', 7:'ativo vel. reduzida' };
  const STATUS_ORDEM = { ativo:0, novo:0, suspenso:1, 'ativo vel. reduzida':1, inativo:2, 'inviabilidade técnica':2, cancelado:3 };

  function normalizarStatus(ct) {
    const display = (ct.contratoStatusDisplay || '').toLowerCase().trim();
    if (display) return display;
    return STATUS_MAP[ct.contratoStatus] || 'desconhecido';
  }

  const ordenados = [...todosContratos]
    .sort((a, b) => (STATUS_ORDEM[normalizarStatus(a)] ?? 3) - (STATUS_ORDEM[normalizarStatus(b)] ?? 3))
    .slice(0, 8);

  return {
    nome:     primeiro.razaoSocial || '',
    cpfcnpj:  primeiro.cpfCnpj    || digits,
    // emails é array direto no contrato, não no cliente
    email:    primeiro.emails?.[0] || '',
    // telefones_cargos é o campo real do SGP; telefones é array de strings direto
    fone:     primeiro.telefones?.[0] || primeiro.telefones_cargos?.[0]?.contato || '',
    contratos: ordenados.map(ct => ({
      id:              ct.contratoId,
      plano:           ct.planointernet || ct.planotv || ct.servico_plano || '',
      status:          normalizarStatus(ct),
      titulos_abertos: ct.contratoTitulosAReceber || 0,
      valor_aberto:    ct.contratoValorAberto     || 0,
      cidade:          ct.endereco_cidade || (ct.popNome || '').split('/')[0].trim() || null,
      popId:           ct.popId  || null,
      popNome:         ct.popNome || null,
      venc_dia:        ct.cobVencimento ? `dia ${ct.cobVencimento}` : null,
    })),
  };
}

// ── SGP: SEGUNDA VIA BOLETO ───────────────────────────────────────
// POST /api/ura/fatura2via/
export async function segundaViaBoleto(cpfcnpj, contrato) {
  const digits = (cpfcnpj || '').replace(/\D/g, '');
  if (digits.length < 11) return { erro: true, mensagem: 'CPF/CNPJ inválido.' };

  const raw = await sgpPost('/api/ura/fatura2via/', {
    cpfcnpj:               digits,
    contrato,
    faturas_abertas_todas: '1',
    notafiscal:            '1',
  });

  if (raw?.status !== 1 || !Array.isArray(raw?.links) || raw.links.length === 0) {
    return { status: 'sem_boleto', mensagem: 'Nenhum boleto em aberto para este contrato.' };
  }

  const links = raw.links;

  function formatarBoleto(f, idx = null) {
    return {
      ...(idx !== null ? { indice: idx + 1 } : {}),
      status:              'boleto_encontrado',
      cliente:             raw.razaoSocial,
      contrato:            raw.contratoId,
      fatura_id:           f.fatura || f.id,
      valor_original:      f.valor_original,
      valor_cobrado:       f.valor,
      vencimento_original: f.vencimento_original,
      vencimento_atual:    f.vencimento,
      vencido:             f.vencimento && new Date(f.vencimento) < new Date(),
      link_boleto:         f.link || raw.link,
      link_cobranca:       f.link_cobranca || raw.link_cobranca,
      link_pix_html:       f.link_pix_html,
      pix_copia_cola:      f.codigopix,
      linha_digitavel:     f.linhadigitavel,
    };
  }

  if (links.length > 1) {
    return {
      status:   'multiplos_boletos',
      total:    links.length,
      cliente:  raw.razaoSocial,
      contrato: raw.contratoId,
      lista:    links.map((f, i) => formatarBoleto(f, i)),
    };
  }

  return formatarBoleto(links[0]);
}

// ── SGP: PROMESSA DE PAGAMENTO ────────────────────────────────────
// POST /api/ura/liberacaopromessa/
export async function promessaPagamento(contrato, extras = {}) {
  const hoje = new Date();
  const promessa = new Date(hoje);
  promessa.setDate(promessa.getDate() + 3);
  const dataPromessa = extras.data_promessa || promessa.toISOString().split('T')[0];

  const { url, app, token } = await getSGPConfig();
  const body = new URLSearchParams({
    app, token,
    contrato:      String(contrato),
    data_promessa: dataPromessa,
    // enviar_sms e conteudo removidos — não documentados na API SGP
  }).toString();

  const res = await fetch(`${url}/api/ura/liberacaopromessa/`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json().catch(() => ({}));

  return {
    httpStatus:    res.status,
    status:        data.status,
    liberado:      data.status === 1,
    liberado_dias: data.liberado_dias || 3,
    protocolo:     data.protocolo || null,
    data_promessa: dataPromessa,
    contratoId:    data.contratoId || contrato,
    razaoSocial:   data.razaoSocial || null,
    msg:           data.msg || data.message || null,
    erro:          data.status !== 1 ? (data.msg || 'Falha na liberação') : null,
  };
}

// ── SGP: CRIAR CHAMADO ────────────────────────────────────────────
// POST /api/ura/chamado/ — body JSON
// Tipos: 5=Outros, 200=Reparo, 13=MudEndereco, 23=MudPlano, 22=ProbFatura
export async function criarChamado(contrato, ocorrenciatipo, conteudo, extras = {}) {
  // Doc SGP: apenas app, token, contrato (int), ocorrenciatipo (int), conteudo
  const raw = await sgpPostJSON('/api/ura/chamado/', {
    contrato:       Number(contrato),
    ocorrenciatipo: Number(ocorrenciatipo) || 5,
    conteudo:       conteudo || 'Chamado aberto via GoCHAT',
    // notificar_cliente e conteudolimpo removidos — não documentados na API SGP
  });

  return {
    ...raw,
    protocolo:     raw?.protocolo || null,
    chamado_aberto: raw?.status === 1,
    contrato:      raw?.contratoId || contrato,
    cliente:       raw?.razaoSocial || null,
  };
}

// ── SGP: VERIFICAR ACESSO/CONEXÃO ─────────────────────────────────
// POST /api/ura/verificaacesso/
export async function verificarConexao(contrato) {
  const raw = await sgpPost('/api/ura/verificaacesso/', { contrato });
  const online = raw?.status === 1;
  return {
    contrato:        raw?.contratoId || raw?.contrato || contrato,
    online,
    status_conexao:  online ? 'online' : 'offline',
    msg:             raw?.msg || (online ? 'Serviço Online' : 'Serviço Offline'),
    status_contrato: raw?.staus || raw?.status,
    razao_social:    raw?.razaoSocial || null,
  };
}

// ── SGP: HISTÓRICO DE OCORRÊNCIAS ─────────────────────────────────
// POST /api/ura/ocorrencia/list/ — body JSON
export async function historicoOcorrencias(contrato) {
  const raw = await sgpPostJSON('/api/ura/ocorrencia/list/', {
    contrato: Number(contrato),
    offset:   0,
    limit:    50,
  });
  const lista = raw?.ocorrencias || [];
  return lista.map(o => ({
    numero:           o.numero,
    status:           o.status,
    tipo:             o.tipo,
    data_cadastro:    o.data_cadastro,
    data_finalizacao: o.data_finalizacao,
    conteudo:         (o.conteudo || '').slice(0, 200),
    responsavel:      o.responsavel,
  }));
}

// ── SGP: LISTAR PLANOS ────────────────────────────────────────────
// POST /api/ura/planos/
export async function listarPlanos(cidade) {
  const raw = await sgpPost('/api/ura/planos/', cidade ? { cidade } : {});
  const lista = Array.isArray(raw) ? raw : (raw?.planos || raw?.data || []);
  return lista.map(p => ({
    id:        p.id || p.plano_id,
    descricao: p.descricao || p.nome || p.plano,
    valor:     p.valor || p.preco,
    velocidade: p.velocidade || p.velocidade_down || '',
  }));
}

// ── SGP: VERIFICAR MANUTENÇÃO ─────────────────────────────────────
// GET /api/ura/manutencao/list
export async function consultarManutencao() {
  try {
    const raw = await sgpGet('/api/ura/manutencao/list');
    let itens = [];
    if (Array.isArray(raw))                    itens = raw;
    else if (Array.isArray(raw?.manutencoes))  itens = raw.manutencoes;
    else if (Array.isArray(raw?.data))         itens = raw.data;
    else if (raw?.em_manutencao || raw?.manutencao) itens = [{ descricao: 'Manutenção ativa', ativa: true }];

    const ativas = itens.filter(m => m.ativa === true || m.status === 'ativo' || m.ativo === true);
    const cidadesAfetadas = [...new Set(ativas.flatMap(m => (m.pops || []).map(p => p.cidade).filter(Boolean)))];
    const mensagemCentral = ativas[0]?.mensagem_central || ativas[0]?.mensagem_ura || null;
    const previsao = ativas[0]?.data_final
      ? new Date(ativas[0].data_final).toLocaleTimeString('pt-BR', { timeZone: 'America/Fortaleza', hour:'2-digit', minute:'2-digit' })
      : null;

    return { ativa: ativas.length > 0, total: ativas.length, itens: ativas, cidadesAfetadas, mensagemCentral, previsao };
  } catch {
    return { ativa: false, total: 0, itens: [], cidadesAfetadas: [], mensagemCentral: null, previsao: null };
  }
}

// ── ANTHROPIC ─────────────────────────────────────────────────────
export async function getAnthropicClient() {
  const key = await getKV('anthropic_api_key');
  if (!key) throw new Error('Anthropic API Key não configurada. Acesse Configurações → Integrações de IA.');
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  return new Anthropic({ apiKey: key });
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

export async function evolutionEnviarTexto(instancia, numero, texto) {
  return evolutionRequest(`/message/sendText/${instancia}`, { number: numero, text: texto }, 'POST');
}
export async function evolutionEnviarBotoes(instancia, numero, { corpo, botoes }) {
  return evolutionRequest(`/message/sendButtons/${instancia}`, {
    number: numero, title: corpo,
    buttons: botoes.map((b, i) => ({ buttonId: b.id||`btn${i}`, buttonText: { displayText: b.label||b }, type: 1 })),
  }, 'POST');
}
export async function evolutionEnviarLista(instancia, numero, { corpo, labelBotao, tituloSecao, itens }) {
  return evolutionRequest(`/message/sendList/${instancia}`, {
    number: numero, title: corpo, buttonText: labelBotao || 'Ver opções',
    sections: [{ title: tituloSecao || 'Opções', rows: itens.map(it => ({ rowId: it.id, title: it.titulo })) }],
  }, 'POST');
}
export async function evolutionEnviarCTA(instancia, numero, { corpo, label, url }) {
  return evolutionRequest(`/message/sendLink/${instancia}`, { number: numero, caption: corpo, title: label, linkPreview: url }, 'POST');
}
export async function evolutionEnviarImagem(instancia, numero, { url, legenda }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, { number: numero, mediatype: 'image', media: url, caption: legenda || '' }, 'POST');
}
export async function evolutionEnviarAudio(instancia, numero, { url }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, { number: numero, mediatype: 'audio', media: url }, 'POST');
}
export async function evolutionEnviarArquivo(instancia, numero, { url, filename }) {
  return evolutionRequest(`/message/sendMedia/${instancia}`, { number: numero, mediatype: 'document', media: url, fileName: filename||'arquivo' }, 'POST');
}

// Aliases para o motorFluxo
export const sgpBuscarCliente    = consultarClientes;
export const sgpBuscarBoletos    = segundaViaBoleto;
export const sgpVerificarStatus  = async (contratoId) => {
  // Status vem do consultar_clientes — busca pelo contrato direto
  const raw = await sgpPost('/api/ura/consultacliente/', { contrato: contratoId }).catch(() => null);
  const ct  = raw?.contratos?.[0];
  if (!ct) return { status: 'desconhecido' };
  const STATUS_MAP = {1:'ativo',2:'inativo',3:'cancelado',4:'suspenso',5:'inviabilidade técnica',6:'novo',7:'ativo vel. reduzida'};
  return {
    status: (ct.contratoStatusDisplay || STATUS_MAP[ct.contratoStatus] || 'desconhecido').toLowerCase(),
    status_num: ct.contratoStatus,
    contrato: ct.contratoId,
  };
};
export const sgpAbrirChamado = ({ contratoId, tipoId, descricao, extras }) =>
  criarChamado(contratoId, tipoId, descricao, extras || {});
export const sgpPromessaPagamento = promessaPagamento;
export const sgpListarPlanos      = listarPlanos;
