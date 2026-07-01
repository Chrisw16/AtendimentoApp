/**
 * fluxoHelpers.js — funções puras usadas pelo motorFluxo.
 * Extraídas para serem testáveis sem banco/IA. Resolvem mismatches
 * entre o que o editor (PropsPanel) salva e o que o motor lê.
 */

// abrir_chamado: o editor salva cfg.tipo (string), o motor precisa do código SGP.
const TIPO_CHAMADO_SGP = { tecnico: 200, financeiro: 22, comercial: 5 };

export function resolverTipoChamado(cfg = {}) {
  const id = Number(cfg.tipo_id);
  if (Number.isFinite(id) && id > 0) return id;
  return TIPO_CHAMADO_SGP[cfg.tipo] ?? 5;
}

// nps_inline: o editor oferece escala "5" ou "10"; o motor hardcodava 1-10.
// Retorna { valida, porta } respeitando a escala escolhida.
export function avaliarNps(notaRaw, escala) {
  const nota = parseInt(notaRaw, 10);
  if (!Number.isFinite(nota)) return { valida: false };

  if (String(escala) === '5') {
    if (nota < 1 || nota > 5) return { valida: false };
    const porta = nota >= 4 ? 'promotor' : nota === 3 ? 'neutro' : 'detrator';
    return { valida: true, porta };
  }

  // Default: escala 0-10 (NPS clássico)
  if (nota < 0 || nota > 10) return { valida: false };
  const porta = nota >= 9 ? 'promotor' : nota >= 7 ? 'neutro' : 'detrator';
  return { valida: true, porta };
}

// ia_responde: o editor salva a instrução extra em cfg.instrucao (o motor lia cfg.prompt).
// Compõe o system prompt na ordem: base + instrução específica + dados do cliente + ficha + regras de tool.
export function montarSystemPrompt({ systemBase, instrucao, ctxCliente, ficha, regrasTools } = {}) {
  return [
    systemBase || instrucao,
    instrucao && systemBase ? `\nInstrução específica: ${instrucao}` : '',
    ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : '',
    ficha ? `\n${ficha}` : '',
    regrasTools || '',
  ].filter(Boolean).join('\n');
}

// enviar_lista: o editor salva cfg.botao / cfg.secao; o motor lia cfg.label_botao / cfg.titulo_secao.
// Lê os nomes do editor com fallback para os antigos (fluxos já salvos).
export function camposLista(cfg = {}) {
  return {
    label_botao:  cfg.botao ?? cfg.label_botao ?? '',
    titulo_secao: cfg.secao ?? cfg.titulo_secao ?? '',
  };
}

// salvar_dado: normaliza o nome do campo salvo pela IA para um slug ASCII,
// porque a interpolação {{campo}} usa regex \w+ (não casa acento/espaço).
export function normalizarNomeCampo(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')    // remove acentos decompostos pelo NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')       // não-alfanumérico → _
    .replace(/^_+|_+$/g, '');          // apara _ das bordas
}

// Chaves do contexto que são objetos aninhados com semântica própria
// (interpolação {{cliente.nome}}, {{boleto.valor}}, ...). salvar_dado NUNCA
// pode sobrescrevê-las com um escalar, e a ficha não deve listá-las.
export const CAMPOS_RESERVADOS = new Set(['cliente', 'boleto', 'chamado', 'promessa', 'planos']);

// ia_responde: monta o bloco de "memória" injetado no system prompt a cada turno.
// Inclui só variáveis flat escalares (não-vazias) do contexto; ignora chaves internas
// (_ia_hist_*, _ia_turnos_*) e valores não-escalares (cliente/boleto/planos são objetos).
export function montarFichaColetada(contexto = {}) {
  const linhas = Object.entries(contexto)
    .filter(([k, v]) =>
      !k.startsWith('_') &&
      !CAMPOS_RESERVADOS.has(k) &&
      (typeof v === 'string' || typeof v === 'number') &&
      String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`);
  if (!linhas.length) return '';
  return [
    '## DADOS JÁ COLETADOS (memória — NUNCA re-pergunte)',
    ...linhas,
    'Estes dados já foram coletados nesta conversa. NUNCA pergunte de novo por eles. Se faltar algum dado que não está na lista acima, pergunte e salve com a ferramenta salvar_dado.',
  ].join('\n');
}

// SGP: normaliza data de nascimento para AAAA-MM-DD (exigido pelo /api/precadastro/F).
// Aceita DD/MM/AAAA, DD/MM/AA, D/M/AAAA com "/", "-" ou ".". Já em AAAA-MM-DD → devolve igual.
// Não reconheceu → devolve o input (deixa o SGP validar em vez de corromper).
export function normalizarData(valor) {
  const s = String(valor || '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return s;
  let [, dd, mm, yy] = m;
  dd = dd.padStart(2, '0');
  mm = mm.padStart(2, '0');
  if (yy.length === 2) yy = (Number(yy) <= 30 ? '20' : '19') + yy;   // pivô 30 p/ ano de 2 dígitos
  return `${yy}-${mm}-${dd}`;
}
