/**
 * fluxoValidador.js — validador estático de fluxos do motor.
 *
 * Analisa o GRAFO de um fluxo (sem executar) e aponta problemas que deixam
 * o cliente travado, em limbo ou perdido sem atendimento. Funções puras,
 * testáveis sem banco/IA.
 *
 * A peça central é o catálogo NOS: para cada tipo de nó, quais portas o
 * MOTOR pode emitir (chamadas `avancar('porta')` em motorFluxo.js), incluindo
 * portas dinâmicas (derivadas da config) e fallbacks implícitos. É a fonte da
 * verdade para detectar "porta sem conexão" — extraído lendo o switch de
 * `processarNo`. Mantenha sincronizado ao mexer no motor.
 */

// slug de botão string → id de porta (espelha motorFluxo: toLowerCase + espaços→_)
const slug = (s) => String(s).toLowerCase().replace(/\s+/g, '_');

/**
 * Catálogo de comportamento por tipo de nó.
 * - estaticas: portas sempre emitíveis
 * - dinamicas(cfg): portas derivadas da config (menus, ramos, rotas)
 * - fallback: portas que o motor emite quando nada casa (o editor costuma esquecer)
 * - aguarda: o nó pode pausar esperando o cliente (quebra loop)
 * - termina: o nó pode encerrar a conversa (fim())
 */
export const NOS = {
  // ── Gatilhos ──
  inicio:           { estaticas: ['saida'] },
  gatilho_keyword:  { estaticas: ['saida'] },

  // ── Mensagens ──
  enviar_texto:       { estaticas: ['saida'] },
  enviar_cta:         { estaticas: ['saida'] },
  enviar_imagem:      { estaticas: ['saida'] },
  enviar_audio:       { estaticas: ['saida'] },
  enviar_arquivo:     { estaticas: ['saida'] },
  enviar_localizacao: { estaticas: ['saida'] },
  enviar_botoes: {
    estaticas: [],
    dinamicas: (cfg) => (cfg.botoes || [])
      .map(b => (typeof b === 'object' ? b.id : slug(b)))
      .filter(Boolean),
    fallback: ['saida'],
    aguarda: true,
  },
  enviar_lista: {
    estaticas: [],
    dinamicas: (cfg) => normalizarItens(cfg.itens).map(it => it.id).filter(Boolean),
    fallback: ['saida'],
    aguarda: true,
  },
  solicitar_localizacao: { estaticas: ['localizacao_recebida'], aguarda: true },

  // ── Lógica ──
  aguardar_resposta: {
    estaticas: ['saida'],
    // FASE 4: `timeout` e `max_tentativas` só existem quando `cfg.timeout` está
    // configurado — sem isso o nó espera para sempre, como sempre esperou.
    // São DINÂMICAS de propósito: como estáticas, todo fluxo já existente
    // passaria a acusar `porta_nao_conectada` sem nada ter mudado nele.
    dinamicas: (cfg) => (Number(cfg.timeout) > 0
      ? ['timeout', ...(Number(cfg.max_tentativas) > 0 ? ['max_tentativas'] : [])]
      : []),
    aguarda: true,
  },
  condicao:          { estaticas: ['sim', 'nao'] },
  condicao_multipla: {
    estaticas: [],
    dinamicas: (cfg) => (cfg.ramos || []).map(r => r.porta || 'ramo1'),
    fallback: ['default'],
  },
  definir_variavel: { estaticas: ['saida'] },
  divisao_ab:       { estaticas: ['a', 'b'] },
  // FASE 4: pausa DE VERDADE (job `flow_resume` retoma). `aguarda: true` porque
  // um ciclo que passa por ele não é mais um loop instantâneo que trava o motor.
  aguardar_tempo:   { estaticas: ['saida'], aguarda: true },

  // ── SGP / ERP ──
  consultar_cliente:   { estaticas: ['encontrado', 'multiplos_contratos', 'max_tentativas'], aguarda: true },
  consultar_boleto:    { estaticas: ['encontrado', 'nao_encontrado'], aguarda: true },
  verificar_status:    { estaticas: ['ativo', 'inativo', 'cancelado', 'suspenso', 'inviabilidade', 'novo', 'reduzido'] },
  abrir_chamado:       { estaticas: ['sucesso', 'erro'] },
  promessa_pagamento:  { estaticas: ['sucesso', 'adimplente', 'erro'] },
  listar_planos:       { estaticas: ['saida'] },
  consultar_historico: { estaticas: ['saida'] },

  // ── IA ──
  ia_responde: { estaticas: ['resolvido', 'transferir', 'max_turnos'], aguarda: true },
  ia_roteador: {
    estaticas: ['nao_entendeu', 'encerrar'],
    dinamicas: (cfg) => (cfg.rotas || []).map(r => r.id).filter(Boolean),
    aguarda: true,
  },

  // ── Ações ──
  // `transferido` deixou de ser morta na FASE 1: é o destino da retomada quando
  // o agente devolve a conversa (`_retomarNo`). Sem essa aresta, transferir
  // encerra a execução como sempre encerrou — por isso ela é válida, não órfã.
  transferir_agente: { estaticas: ['transferido', 'fora_horario'], termina: true },
  chamada_http:      { estaticas: ['sucesso', 'erro'] },
  nota_interna:      { estaticas: ['saida'] },
  enviar_email:      { estaticas: ['saida'] }, // nodeTypes diz "sucesso", motor emite "saida"
  nps_inline:        { estaticas: ['promotor', 'neutro', 'detrator'], aguarda: true },

  // ── Fim ──
  encerrar: { estaticas: [], termina: true },

};

function normalizarItens(itens) {
  if (typeof itens === 'string') {
    try { itens = JSON.parse(itens); } catch { itens = []; }
  }
  return Array.isArray(itens) ? itens : [];
}

/** Espelha parseDados(motorFluxo): aceita formato editor, legado e strings JSON. */
export function parseFluxo(fluxo = {}) {
  let nodes = [], edges = [];

  if (fluxo.dados) {
    const d = typeof fluxo.dados === 'string' ? JSON.parse(fluxo.dados) : fluxo.dados;
    if (d?.nodes) {
      nodes = d.nodes;
      edges = d.edges || [];
    }
  } else {
    nodes = typeof fluxo.nos      === 'string' ? JSON.parse(fluxo.nos      || '[]') : (fluxo.nos      || []);
    edges = typeof fluxo.conexoes === 'string' ? JSON.parse(fluxo.conexoes || '[]') : (fluxo.conexoes || []);
  }

  nodes = nodes.map(n => ({
    ...n,
    tipo:   n.tipo   || n.type   || n.data?.tipo   || '',
    config: n.config || n.data?.config || {},
  }));

  return { nodes, edges };
}

const descritor = (tipo) => NOS[tipo] || { estaticas: ['saida'] };

/** Conjunto (sem repetição) de portas que o motor pode emitir para este nó. */
export function portasEmitidas(no = {}) {
  const d = descritor(no.tipo);
  const cfg = no.config || {};
  const portas = [
    ...(d.estaticas || []),
    ...(d.dinamicas ? d.dinamicas(cfg) : []),
    ...(d.fallback || []),
  ];
  return [...new Set(portas)];
}

/** Espelha encontrarProximo(motorFluxo): exata → "saida" → qualquer aresta → null. */
export function resolverPorta(noId, porta, edges = []) {
  const de = (e) => e.from || e.source;
  const p  = (e) => e.port || e.sourceHandle || 'saida';
  const alvo = (e) => e.to || e.target || null;

  const exata = edges.find(e => de(e) === noId && p(e) === porta);
  if (exata) return { target: alvo(exata), via: 'exata' };

  const porSaida = edges.find(e => de(e) === noId && p(e) === 'saida');
  if (porSaida) return { target: alvo(porSaida), via: 'saida' };

  const qualquer = edges.find(e => de(e) === noId);
  if (qualquer) return { target: alvo(qualquer), via: 'fallback' };

  return { target: null, via: null };
}

export function noAguarda(no = {}) {
  return !!descritor(no.tipo).aguarda;
}

export function noTermina(no = {}) {
  return !!descritor(no.tipo).termina;
}

const ENTRADAS = new Set(['inicio', 'gatilho_keyword']);

/** Alvos (ids de nó) realmente alcançáveis a partir de um nó, como o motor faria. */
function alvosDe(no, edges) {
  const alvos = new Set();
  for (const porta of portasEmitidas(no)) {
    const { target } = resolverPorta(no.id, porta, edges);
    if (target) alvos.add(target);
  }
  return alvos;
}

/** BFS a partir dos nós de entrada, seguindo as portas como o motor resolve. */
function alcancaveis(nodes, edges) {
  const porId = new Map(nodes.map(n => [n.id, n]));
  const vistos = new Set();
  const fila = nodes.filter(n => ENTRADAS.has(n.tipo)).map(n => n.id);
  fila.forEach(id => vistos.add(id));
  while (fila.length) {
    const no = porId.get(fila.shift());
    if (!no) continue;
    for (const alvo of alvosDe(no, edges)) {
      if (!vistos.has(alvo) && porId.has(alvo)) { vistos.add(alvo); fila.push(alvo); }
    }
  }
  return vistos;
}

/** Detecta ciclo composto SÓ por nós instantâneos (não aguardam nem terminam) → trava. */
function ciclosInstantaneos(nodes, edges) {
  const inst = nodes.filter(n => !noAguarda(n) && !noTermina(n));
  const idsInst = new Set(inst.map(n => n.id));
  const adj = new Map();
  for (const n of inst) {
    adj.set(n.id, [...alvosDe(n, edges)].filter(t => idsInst.has(t)));
  }
  // DFS com 3 cores; back-edge para nó cinza = ciclo.
  const cor = new Map(); // 0 branco, 1 cinza, 2 preto
  const ciclo = new Set();
  const stack = [];
  const dfs = (u) => {
    cor.set(u, 1); stack.push(u);
    for (const v of (adj.get(u) || [])) {
      if (cor.get(v) === 1) {
        // fecha ciclo: do topo da pilha até v
        const i = stack.lastIndexOf(v);
        stack.slice(i).forEach(x => ciclo.add(x));
      } else if (!cor.get(v)) {
        dfs(v);
      }
    }
    stack.pop(); cor.set(u, 2);
  };
  for (const n of inst) if (!cor.get(n.id)) dfs(n.id);
  return [...ciclo];
}

/**
 * Valida o grafo de um fluxo e devolve { ok, problemas:[{nivel,codigo,no,porta,msg}] }.
 * ok = não há problemas de nível "erro". Códigos:
 *   erro:  sem_entrada, beco_sem_saida
 *   aviso: porta_nao_conectada, no_inalcancavel, aresta_orfa, loop_sem_espera
 */
export function validarFluxo(fluxo = {}) {
  const { nodes, edges } = parseFluxo(fluxo);
  const problemas = [];
  const add = (nivel, codigo, no, msg, extra = {}) =>
    problemas.push({ nivel, codigo, no, msg, ...extra });

  // 1. Entrada
  const entradas = nodes.filter(n => ENTRADAS.has(n.tipo));
  if (!entradas.length) {
    add('erro', 'sem_entrada', null,
      'Nenhum nó "inicio" ou "gatilho_keyword": o fluxo não tem por onde começar.');
    return finalizar(problemas);
  }

  const porId = new Map(nodes.map(n => [n.id, n]));
  const alcanca = alcancaveis(nodes, edges);

  // 2. Nós inalcançáveis
  for (const n of nodes) {
    if (!ENTRADAS.has(n.tipo) && !alcanca.has(n.id)) {
      add('aviso', 'no_inalcancavel', n.id,
        `Nó "${n.id}" (${n.tipo}) nunca é alcançado a partir do início — código morto no fluxo.`);
    }
  }

  // 3. Becos sem saída e portas não conectadas (só nós alcançáveis)
  for (const n of nodes) {
    if (!alcanca.has(n.id)) continue;
    const portas = portasEmitidas(n);
    const temAlgumaAresta = edges.some(e => (e.from || e.source) === n.id);

    if (!noTermina(n) && portas.length && !temAlgumaAresta) {
      add('erro', 'beco_sem_saida', n.id,
        `Nó "${n.id}" (${n.tipo}) não tem nenhuma conexão de saída: a conversa morre aqui ` +
        `(o motor encerra em silêncio) e o cliente fica sem atendimento.`);
      continue; // sem arestas, não faz sentido checar porta a porta
    }
    if (noTermina(n)) continue; // fim é saída legítima

    for (const porta of portas) {
      const { via } = resolverPorta(n.id, porta, edges);
      if (via !== 'exata') {
        add('aviso', 'porta_nao_conectada', n.id,
          `A porta "${porta}" do nó "${n.id}" (${n.tipo}) não tem conexão própria; ` +
          `o motor vai cair no fallback e pode mandar o cliente para o ramo errado.`,
          { porta });
      }
    }
  }

  // 4. Arestas órfãs (saem de porta que o motor nunca emite p/ aquele tipo)
  for (const e of edges) {
    const origem = e.from || e.source;
    const porta = e.port || e.sourceHandle;
    const no = porId.get(origem);
    if (!no || !porta || porta === 'saida') continue;
    if (!portasEmitidas(no).includes(porta)) {
      add('aviso', 'aresta_orfa', origem,
        `Aresta sai da porta "${porta}" do nó "${origem}" (${no.tipo}), mas o motor nunca ` +
        `emite essa porta — conexão inerte (config fantasma).`,
        { porta });
    }
  }

  // 5. Loops sem ponto de espera (trava)
  const ciclo = ciclosInstantaneos(nodes.filter(n => alcanca.has(n.id)), edges);
  if (ciclo.length) {
    add('aviso', 'loop_sem_espera', ciclo[0],
      `Ciclo entre nós que não esperam o cliente nem encerram (${ciclo.join(' → ')}): ` +
      `o motor roda até o limite de 15 iterações e a conversa trava.`,
      { ciclo });
  }

  return finalizar(problemas);
}

function finalizar(problemas) {
  return {
    ok: !problemas.some(p => p.nivel === 'erro'),
    problemas,
  };
}
