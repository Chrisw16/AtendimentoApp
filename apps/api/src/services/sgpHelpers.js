/**
 * sgpHelpers.js — funções puras de parsing/decisão sobre respostas do SGP.
 * Vivem fora de integrations.js (que puxa knex e não roda em teste unitário).
 * Teste: sgpHelpers.test.js.
 */

// Data do SGP: "AAAA-MM-DD HH:MM:SS" ou "AAAA-MM-DD" → Date (hora local) ou null.
export function parseDataSgp(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  const dt = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  return isNaN(dt.getTime()) ? null : dt;
}

// Normaliza a resposta do /api/ura/manutencao/list/ numa lista de registros.
// FAIL-SAFE: formato inesperado → []. NUNCA fabrica um positivo a partir de um
// campo meramente truthy (o bug antigo transformava {manutencao: []} em ativa:true).
export function normalizarManutencoes(raw) {
  if (Array.isArray(raw))              return raw;
  if (Array.isArray(raw?.manutencoes)) return raw.manutencoes;
  if (Array.isArray(raw?.data))        return raw.data;
  if (Array.isArray(raw?.results))     return raw.results;
  return [];
}

const STATUS_RESOLVIDO = 4; // 0=Desconhecido 1=Investigando 2=Identificado 3=Observando 4=Resolvido

function estaAtivaAgora(m, now) {
  const ativa = m?.ativa === true || m?.ativa === 1 || m?.ativa === '1'
             || m?.ativo === true || m?.ativo === 1;
  if (!ativa) return false;
  const st = m?.status;
  if (st === STATUS_RESOLVIDO || st === '4' || String(st).toLowerCase() === 'resolvido') return false;
  const ini = parseDataSgp(m?.data_inicial);
  const fim = parseDataSgp(m?.data_final);
  if (ini && now < ini) return false; // agendada p/ o futuro
  if (fim && now > fim) return false; // já terminou
  return true;
}

// Manutenções genuinamente ativas AGORA (rede inteira — sem escopo de cliente).
export function manutencoesAtivas(raw, now = new Date()) {
  return normalizarManutencoes(raw).filter(m => estaAtivaAgora(m, now));
}

// Manutenções ativas que afetam ESTE cliente (escopo por POP; fail-safe).
// scope: { popId, cidade }. Sem escopo ou registro sem POP → não afirma nada.
export function manutencaoParaCliente(raw, scope = {}, now = new Date()) {
  const popId  = scope?.popId != null && scope.popId !== '' ? String(scope.popId) : null;
  const cidade = scope?.cidade ? String(scope.cidade).toLowerCase().trim() : null;
  if (!popId && !cidade) return { ativa: false, itens: [] };

  const itens = manutencoesAtivas(raw, now).filter(m => {
    const pops = Array.isArray(m?.pops) ? m.pops : [];
    if (!pops.length) return false; // fail-safe: sem POP não dá p/ confirmar que afeta o cliente
    return pops.some(p => {
      if (popId && p?.id != null && String(p.id) === popId) return true;
      if (cidade && p?.cidade && String(p.cidade).toLowerCase().includes(cidade)) return true;
      return false;
    });
  });
  return { ativa: itens.length > 0, itens };
}

// Corpo do POST /api/ura/chamado/ — repassa os extras suportados pela doc do SGP
// (contato_nome, contato_telefone, observacao, usuario), omitindo os vazios.
export function montarBodyChamado(contrato, ocorrenciatipo, conteudo, extras = {}) {
  const body = {
    contrato:       Number(contrato),
    ocorrenciatipo: Number(ocorrenciatipo) || 5,
    conteudo:       conteudo || 'Chamado aberto via GoCHAT',
  };
  if (extras.contato_nome)     body.contato_nome     = extras.contato_nome;
  if (extras.contato_telefone) body.contato_telefone = extras.contato_telefone;
  if (extras.observacao)       body.observacao       = extras.observacao;
  if (extras.usuario)          body.usuario          = extras.usuario;
  return body;
}

// Classifica o Rx do cliente (dBm) conforme a régua da NetGo.
export function classificarSinal(rx) {
  if (rx == null) return { nivel: 'desconhecido', emoji: '⚪', label: 'sinal indisponível' };
  const v = Number(rx);
  if (!Number.isFinite(v)) return { nivel: 'desconhecido', emoji: '⚪', label: 'sinal indisponível' };
  if (v >= -25) return { nivel: 'bom',     emoji: '🟢', label: 'bom' };
  if (v >= -27) return { nivel: 'atencao', emoji: '🟡', label: 'atenção' };
  if (v >= -28) return { nivel: 'ruim',    emoji: '🔴', label: 'ruim' };
  return          { nivel: 'critico', emoji: '🔴', label: 'crítico' };
}

function formatarUptimeOnu(seg) {
  const s = Number(seg);
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`;
  if (h >= 1)  return `${h}h${m > 0 ? m + 'min' : ''}`;
  return `${m}min`;
}

// Monta o texto INTERNO (técnico + veredito) que a IA lê. O prompt traduz p/ leigo.
export function formatarDiagnosticoOnu(row, now = new Date()) {
  if (!row || row.rx_dbm == null) {
    return 'Não consegui ler o sinal do equipamento agora. Siga o diagnóstico normal (reinício → chamado).';
  }
  const s = classificarSinal(row.rx_dbm);
  let msg = `📡 Sinal da ONU: Rx ${row.rx_dbm} dBm ${s.emoji} (${s.label})`;
  if (row.tx_dbm != null) msg += ` · Tx ${row.tx_dbm}`;

  const lido = parseDataSgp(row.sinal_lido_em);
  if (lido) {
    const dias = Math.floor((now - lido) / 86400000);
    if (dias <= 0)       msg += ` · medido hoje`;
    else if (dias === 1) msg += ` · medido ontem`;
    else                 msg += ` · medido há ${dias} dias`;
    if (dias > 7) msg += ` ⚠️ (leitura antiga, pode estar desatualizada)`;
  }

  if (row.online) {
    const up = formatarUptimeOnu(row.uptime_segundos);
    msg += ` · Equipamento ONLINE${up ? ` há ${up}` : ''}`;
  } else {
    msg += ` · Equipamento OFFLINE`;
    if (row.ultima_queda_motivo) msg += ` (última queda: ${row.ultima_queda_motivo})`;
  }
  return msg;
}

// ── Cliente 360 v2: o payload do SGP inteiro ──────────────────────
//
// O `/api/ura/consultacliente/` sempre devolveu endereço, dados do serviço,
// WiFi e Central do Assinante — e a gente lia 8 campos e jogava o resto fora.
// (A dívida da FASE 6 dizia que "o endpoint não devolve endereço". Devolve.)
//
// Mapear aqui, puro, é o que torna isso testável: `integrations.js` puxa knex
// no topo e não roda em teste unitário.

/** Ausência tem muitas caras no SGP: null, '', e o `"None"` do Python. */
function limpo(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return (s === '' || s === 'None' || s === 'null') ? null : s;
}

/**
 * Contato do SGP: às vezes string, às vezes `{contato, tipoContato, inscricoes}`.
 * O objeto cru chegando ao React matou o painel inteiro em 22/08/2026 (#31) —
 * a conversão mora na origem, não na tela.
 */
export function textoContato(v) {
  if (v && typeof v === 'object') return limpo(v.contato ?? v.valor);
  return limpo(v);
}

/** `"-24.51,-50.41"` → `{lat, lng}`. Coordenada inválida é ausência, não zero. */
function parseLL(v) {
  const s = limpo(v);
  if (!s) return null;
  const [lat, lng] = s.split(',').map(n => Number(n.trim()));
  return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : null;
}

const STATUS_MAP   = { 1:'ativo', 2:'inativo', 3:'cancelado', 4:'suspenso', 5:'inviabilidade técnica', 6:'novo', 7:'ativo vel. reduzida' };
const STATUS_ORDEM = { ativo:0, novo:0, suspenso:1, 'ativo vel. reduzida':1, inativo:2, 'inviabilidade técnica':2, cancelado:3 };

export function normalizarStatusContrato(ct) {
  const display = (ct?.contratoStatusDisplay || '').toLowerCase().trim();
  return display || STATUS_MAP[ct?.contratoStatus] || 'desconhecido';
}

/** Um contrato do SGP → o contrato do GoCHAT. */
export function mapearContrato(ct) {
  return {
    id:              ct.contratoId,
    plano:           ct.planointernet || ct.planotv || ct.servico_plano || '',
    status:          normalizarStatusContrato(ct),
    motivo_status:   limpo(ct.motivo_status),
    titulos_abertos: ct.contratoTitulosAReceber || 0,
    valor_aberto:    ct.contratoValorAberto     || 0,
    cidade:          limpo(ct.endereco_cidade) || limpo((ct.popNome || '').split('/')[0]),
    popId:           ct.popId   || null,
    popNome:         limpo(ct.popNome),
    venc_dia:        ct.cobVencimento ? `dia ${ct.cobVencimento}` : null,
    cliente_id:      ct.clienteId || null,
    cadastrado_em:   limpo(ct.dataCadastro),
    promessas_mes:   ct.promessasPagamentoMes ?? null,
    link_quitacao:   limpo(ct.link_quitacao),
    tags:            Array.isArray(ct.tags) ? ct.tags.map(limpo).filter(Boolean) : [],
    endereco: {
      logradouro:  limpo(ct.endereco_logradouro),
      numero:      limpo(ct.endereco_numero),
      complemento: limpo(ct.endereco_complemento),
      bairro:      limpo(ct.endereco_bairro),
      cidade:      limpo(ct.endereco_cidade),
      uf:          limpo(ct.endereco_uf),
      cep:         limpo(ct.endereco_cep),
      referencia:  limpo(ct.endereco_pontoreferencia),
      ll:          parseLL(ct.endereco_ll),
    },
    servico: {
      plano:        limpo(ct.servico_plano),
      login:        limpo(ct.servico_login),
      senha:        limpo(ct.servico_senha),
      mac:          limpo(ct.servico_mac),
      mac2:         limpo(ct.servico_mac2),
      vlan:         limpo(ct.servico_vlan),
      tipo_conexao: limpo(ct.servico_tipo_conexao),
      grupo:        limpo(ct.servico_grupo),
    },
    wifi: {
      ssid:    limpo(ct.servico_wifi_ssid),      senha:    limpo(ct.servico_wifi_password),
      canal:   limpo(ct.servico_wifi_channel),
      ssid_5:  limpo(ct.servico_wifi_ssid_5),    senha_5:  limpo(ct.servico_wifi_password_5),
      canal_5: limpo(ct.servico_wifi_channel_5),
    },
    central: { login: limpo(ct.contratoCentralLogin), senha: limpo(ct.contratoCentralSenha) },
    observacao_cliente: limpo(ct.observacao_cliente),
    observacao_servico: limpo(ct.observacao_servico),
  };
}

/**
 * A resposta inteira do `consultacliente` → a ficha do GoCHAT.
 * Ordena por status (quem atende quer o contrato ATIVO na frente) e corta em 8.
 */
export function mapearRespostaCliente(raw, digits = '') {
  const todos = raw?.contratos || [];
  if (!todos.length) return { erro: true, mensagem: 'Cliente não encontrado para este CPF/CNPJ.' };

  const primeiro = todos[0];
  const ordenados = [...todos]
    .sort((a, b) => (STATUS_ORDEM[normalizarStatusContrato(a)] ?? 3) - (STATUS_ORDEM[normalizarStatusContrato(b)] ?? 3))
    .slice(0, 8);

  return {
    nome:    primeiro.razaoSocial || '',
    cpfcnpj: primeiro.cpfCnpj || digits,
    // emails/telefones são arrays DIRETO no contrato, não no cliente
    email: textoContato(primeiro.emails?.[0]) || '',
    fone:  textoContato(primeiro.telefones?.[0]) || textoContato(primeiro.telefones_cargos?.[0]) || '',
    nascimento: limpo(primeiro.dataNascimento),
    contratos: ordenados.map(mapearContrato),
  };
}

/**
 * Topologia da fibra, de `/api/fttx/onu/list/?contrato=`.
 *
 * Só a TOPOLOGIA: o sinal (Rx/Tx, online, uptime) vem do `sgpDb.js`, que lê o
 * banco do SGP direto e já era usado pelo `consultar_onu_acs`. Duas fontes de
 * propósito — cada uma responde o que sabe, e uma fora do ar não apaga a outra.
 */
export function mapearOnuFttx(rows) {
  const r = Array.isArray(rows) ? rows[0] : null;
  if (!r) return null;
  const cto = limpo(r.cto);
  return {
    id:      r.id ?? null,
    serial:  limpo(r.phy_addr),
    olt:     limpo(r.olt_name),
    olt_id:  r.olt_id ?? null,
    slot:    r.slot ?? null,
    pon:     r.pon  ?? null,
    onu:     r.onu  ?? null,
    vlan:    r.vlan ?? null,
    modelo:  limpo(r.type),
    modo:    limpo(r.mode),
    // "NETGO-LMR 03 (Porta 5)" é como o técnico fala. Sem porta, só a CTO —
    // "(Porta null)" na tela é pior que a informação faltando.
    cto:     cto ? (r.ctoport != null ? `${cto} (Porta ${r.ctoport})` : cto) : null,
    login:   limpo(r.service_login),
  };
}
