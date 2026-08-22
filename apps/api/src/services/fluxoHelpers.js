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
export function montarSystemPrompt({ systemBase, instrucao, ctxCliente, ficha, playbook, regrasTools } = {}) {
  return [
    systemBase || instrucao,
    instrucao && systemBase ? `\nInstrução específica: ${instrucao}` : '',
    ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : '',
    ficha ? `\n${ficha}` : '',
    // FASE 8: o procedimento vem DEPOIS da ficha e ANTES das regras de tool —
    // ele diz o que fazer, e as regras dizem como operar as ferramentas.
    playbook ? `\n${playbook}` : '',
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

/**
 * Tools ativas quando o nó `ia_responde` não declara `cfg.tools_ativas`: só
 * suporte. As comerciais ficam de fora de propósito — `precadastrar_cliente`
 * cria cliente de verdade no SGP.
 *
 * Mora aqui (módulo puro) e não no motor porque `motorFluxo.js` não é importável
 * em teste (puxa Knex no topo), e esta lista precisa ser comparada com o
 * `IA_TOOLS_DEFAULT` do editor — até 2026-08-21 elas divergiam, e o checkbox de
 * `listar_planos_ativos`/`listar_vencimentos` aparecia marcado na tela com a
 * tool desligada na execução. Travado por `tests/contrato-catalogos.test.js`.
 */
export const TOOLS_PADRAO = [
  // FASE 7: entra no padrão porque o custo de NÃO consultar a base é a IA
  // inventar procedimento — que é o pior defeito possível num atendimento.
  'buscar_conhecimento',
  // FASE 8: sem ela, as etapas conversacionais do procedimento nunca são
  // marcadas e o playbook comercial fica eternamente na etapa 1.
  'concluir_etapa_playbook',
  'verificar_conexao', 'consultar_manutencao', 'status_rede',
  'consultar_onu_acs', 'reiniciar_onu_acs', 'consultar_radius',
  'criar_chamado', 'segunda_via_boleto',
  'promessa_pagamento', 'historico_ocorrencias',
  'transferir_para_humano', 'encerrar_atendimento',
];

/**
 * `ia_responde`: resolve os dois campos que tinham alias — e que resolviam em
 * direções CONTRÁRIAS, o que é pior do que os dois estarem errados.
 *
 * Como era até 2026-08-21 (FASE 2):
 * - a tela gravava `cfg.prompt`, o motor lia `cfg.instrucao ?? cfg.prompt` →
 *   o valor **antigo vencia**. Num nó importado do `fluxo-netgo-v2.json` (que
 *   grava `instrucao`), editar "Instruções extras" na tela **não tinha efeito**
 *   e nada avisava.
 * - a tela gravava `cfg.max_turns` com default 5, o motor lia
 *   `cfg.max_turns || cfg.max_turnos` com default 6 → o valor **novo vencia**.
 *   A tela mostrava 5 num nó configurado para 25, e bastava encostar no campo
 *   para a janela de um cadastro comercial cair de 25 para 5 turnos e o
 *   atendimento encerrar no meio.
 *
 * Regra única agora: **o nome que a tela grava hoje (`instrucao`/`max_turnos`)
 * vence**; o nome antigo é só fallback de leitura, para fluxo já salvo.
 *
 * `??` e não `||` na instrução: apagar o campo na tela é uma escolha do
 * operador, e com `||` o texto antigo ressuscitaria.
 */
export function camposIaResponde(cfg = {}) {
  const maxTurnos = parseInt(cfg.max_turnos ?? cfg.max_turns, 10);
  return {
    instrucao: cfg.instrucao ?? cfg.prompt,
    maxTurnos: Number.isFinite(maxTurnos) && maxTurnos > 0 ? maxTurnos : 6,
  };
}

/**
 * Agrega respostas de NPS em promotores/neutros/detratores + score.
 *
 * Fonte ÚNICA das faixas: delega a classificação a `avaliarNps`, que conhece a
 * escala de cada resposta. O dashboard antes reimplementava as faixas em SQL
 * com 0-10 fixo, então uma nota 5 numa escala de 5 (nota máxima) era promotora
 * no fluxo e detratora no relatório — todo respondente virava detrator.
 *
 * @param {Array<{nota: number|string, escala?: string|number}>} respostas
 */
export function agregarNps(respostas = []) {
  let promotores = 0, neutros = 0, detratores = 0, total = 0;

  for (const r of respostas) {
    const { valida, porta } = avaliarNps(r?.nota, r?.escala);
    if (!valida) continue;               // nota fora da escala não vira detrator
    total++;
    if      (porta === 'promotor') promotores++;
    else if (porta === 'neutro')   neutros++;
    else                           detratores++;
  }

  // Sem respostas o score é indefinido, não zero — zero significaria
  // "promotores e detratores se anulam", que é uma afirmação diferente.
  const score = total > 0 ? Math.round(((promotores - detratores) / total) * 100) : null;

  return { total, promotores, neutros, detratores, score };
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
