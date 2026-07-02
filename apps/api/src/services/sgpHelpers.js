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
