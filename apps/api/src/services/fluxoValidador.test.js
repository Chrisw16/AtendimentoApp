import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseFluxo,
  portasEmitidas,
  resolverPorta,
  noAguarda,
  noTermina,
  validarFluxo,
} from './fluxoValidador.js';

// helpers de fixture
const mk = (nodes, edges = []) => ({ dados: { nodes, edges } });
const temCodigo = (res, codigo) => res.problemas.some(p => p.codigo === codigo);
const acharProblema = (res, codigo, no) =>
  res.problemas.find(p => p.codigo === codigo && (no === undefined || p.no === no));

// ── parseFluxo ──────────────────────────────────────────────────
// Espelha parseDados do motorFluxo: precisa aceitar os mesmos formatos.

test('parseFluxo lê o formato do editor {dados:{nodes,edges}}', () => {
  const { nodes, edges } = parseFluxo({
    dados: { nodes: [{ id: 'a', tipo: 'inicio' }], edges: [{ from: 'a', to: 'b' }] },
  });
  assert.equal(nodes.length, 1);
  assert.equal(edges.length, 1);
  assert.equal(nodes[0].tipo, 'inicio');
});

test('parseFluxo normaliza tipo/config vindos de n.type e n.data', () => {
  const { nodes } = parseFluxo({
    dados: { nodes: [{ id: 'a', type: 'enviar_texto', data: { config: { texto: 'oi' } } }] },
  });
  assert.equal(nodes[0].tipo, 'enviar_texto');
  assert.deepEqual(nodes[0].config, { texto: 'oi' });
});

test('parseFluxo aceita dados como string JSON', () => {
  const { nodes, edges } = parseFluxo({
    dados: JSON.stringify({ nodes: [{ id: 'a', tipo: 'inicio' }], edges: [] }),
  });
  assert.equal(nodes[0].id, 'a');
  assert.equal(edges.length, 0);
});

test('parseFluxo aceita o formato legado {nos, conexoes} (inclusive como string)', () => {
  const { nodes, edges } = parseFluxo({
    nos: JSON.stringify([{ id: 'a', tipo: 'inicio' }]),
    conexoes: JSON.stringify([{ source: 'a', target: 'b' }]),
  });
  assert.equal(nodes[0].id, 'a');
  assert.equal(edges[0].source, 'a');
});

test('parseFluxo de fluxo vazio devolve listas vazias', () => {
  const { nodes, edges } = parseFluxo({});
  assert.deepEqual(nodes, []);
  assert.deepEqual(edges, []);
});

// ── portasEmitidas ──────────────────────────────────────────────
// O conjunto de portas que o MOTOR pode emitir (avancar) para o nó,
// incluindo portas dinâmicas (config) e fallbacks implícitos.

test('portasEmitidas: nó simples emite só "saida"', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'enviar_texto' }), ['saida']);
});

test('portasEmitidas: condicao emite "sim" e "nao"', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'condicao' }).sort(), ['nao', 'sim']);
});

test('portasEmitidas: enviar_botoes = 1 porta por botão + fallback "saida"', () => {
  const portas = portasEmitidas({
    tipo: 'enviar_botoes',
    config: { botoes: [{ id: 'sim', label: 'Sim' }, { id: 'nao', label: 'Não' }] },
  });
  assert.deepEqual(portas.sort(), ['nao', 'saida', 'sim']);
});

test('portasEmitidas: enviar_botoes com botão string deriva o id por slug', () => {
  const portas = portasEmitidas({ tipo: 'enviar_botoes', config: { botoes: ['Falar com humano'] } });
  assert.ok(portas.includes('falar_com_humano'));
  assert.ok(portas.includes('saida'));
});

test('portasEmitidas: enviar_lista = 1 porta por item + fallback "saida"', () => {
  const portas = portasEmitidas({
    tipo: 'enviar_lista',
    config: { itens: [{ id: 'p1', titulo: 'Plano 1' }, { id: 'p2', titulo: 'Plano 2' }] },
  });
  assert.deepEqual(portas.sort(), ['p1', 'p2', 'saida']);
});

test('portasEmitidas: enviar_lista aceita itens como string JSON', () => {
  const portas = portasEmitidas({
    tipo: 'enviar_lista',
    config: { itens: JSON.stringify([{ id: 'p1' }]) },
  });
  assert.ok(portas.includes('p1'));
});

test('portasEmitidas: condicao_multipla = 1 porta por ramo + fallback "default"', () => {
  const portas = portasEmitidas({
    tipo: 'condicao_multipla',
    config: { ramos: [{ porta: 'r1' }, { porta: 'r2' }] },
  });
  assert.deepEqual(portas.sort(), ['default', 'r1', 'r2']);
});

test('portasEmitidas: ia_roteador = rotas + "nao_entendeu" + "encerrar"', () => {
  const portas = portasEmitidas({
    tipo: 'ia_roteador',
    config: { rotas: [{ id: 'financeiro' }, { id: 'suporte' }] },
  });
  assert.deepEqual(portas.sort(), ['encerrar', 'financeiro', 'nao_entendeu', 'suporte']);
});

test('portasEmitidas: ia_responde emite resolvido/transferir/max_turnos', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'ia_responde' }).sort(), ['max_turnos', 'resolvido', 'transferir']);
});

test('portasEmitidas: transferir_agente só emite "fora_horario" (transferido/sem_agente são mortas)', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'transferir_agente' }), ['fora_horario']);
});

test('portasEmitidas: abrir_chamado emite sucesso/erro (não "saida")', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'abrir_chamado' }).sort(), ['erro', 'sucesso']);
});

test('portasEmitidas: encerrar é terminal, não emite porta', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'encerrar' }), []);
});

test('portasEmitidas: tipo desconhecido cai no default "saida"', () => {
  assert.deepEqual(portasEmitidas({ tipo: 'tipo_que_nao_existe' }), ['saida']);
});

// ── resolverPorta ───────────────────────────────────────────────
// Espelha encontrarProximo: exata → "saida" → qualquer aresta → null.

test('resolverPorta acha a aresta exata (formato editor {from,to,port})', () => {
  const edges = [{ from: 'a', to: 'b', port: 'sim' }];
  assert.deepEqual(resolverPorta('a', 'sim', edges), { target: 'b', via: 'exata' });
});

test('resolverPorta acha a aresta exata (formato legado {source,target,sourceHandle})', () => {
  const edges = [{ source: 'a', target: 'b', sourceHandle: 'sim' }];
  assert.deepEqual(resolverPorta('a', 'sim', edges), { target: 'b', via: 'exata' });
});

test('resolverPorta cai na aresta "saida" quando a porta exata não existe', () => {
  const edges = [{ from: 'a', to: 'b', port: 'saida' }];
  assert.deepEqual(resolverPorta('a', 'sim', edges), { target: 'b', via: 'saida' });
});

test('resolverPorta cai em qualquer aresta do nó como último recurso', () => {
  const edges = [{ from: 'a', to: 'b', port: 'outra' }];
  assert.deepEqual(resolverPorta('a', 'sim', edges), { target: 'b', via: 'fallback' });
});

test('resolverPorta devolve via:null quando o nó não tem nenhuma aresta', () => {
  assert.deepEqual(resolverPorta('a', 'sim', [{ from: 'x', to: 'y' }]), { target: null, via: null });
});

// ── noAguarda / noTermina ───────────────────────────────────────

test('noAguarda: enviar_botoes pausa para o cliente', () => {
  assert.equal(noAguarda({ tipo: 'enviar_botoes' }), true);
});

test('noAguarda: enviar_texto não pausa', () => {
  assert.equal(noAguarda({ tipo: 'enviar_texto' }), false);
});

test('noTermina: encerrar termina a conversa', () => {
  assert.equal(noTermina({ tipo: 'encerrar' }), true);
});

test('noTermina: transferir_agente pode terminar (fim no sucesso)', () => {
  assert.equal(noTermina({ tipo: 'transferir_agente' }), true);
});

test('noTermina: enviar_texto não termina', () => {
  assert.equal(noTermina({ tipo: 'enviar_texto' }), false);
});

// ── validarFluxo: cenários ──────────────────────────────────────

test('validarFluxo: fluxo feliz (inicio→texto→encerrar) não tem erro', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 't', tipo: 'enviar_texto' }, { id: 'e', tipo: 'encerrar' }],
    [{ from: 'i', to: 't', port: 'saida' }, { from: 't', to: 'e', port: 'saida' }],
  ));
  assert.equal(res.ok, true);
  assert.equal(res.problemas.filter(p => p.nivel === 'erro').length, 0);
});

test('validarFluxo: sem nó de entrada → erro sem_entrada', () => {
  const res = validarFluxo(mk([{ id: 't', tipo: 'enviar_texto' }], []));
  assert.equal(res.ok, false);
  assert.ok(temCodigo(res, 'sem_entrada'));
});

test('validarFluxo: nó não-terminal sem aresta de saída → erro beco_sem_saida (cliente perdido)', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 't', tipo: 'enviar_texto' }],
    [{ from: 'i', to: 't', port: 'saida' }],
  ));
  const p = acharProblema(res, 'beco_sem_saida', 't');
  assert.ok(p, 'esperava beco_sem_saida no nó t');
  assert.equal(p.nivel, 'erro');
  assert.equal(res.ok, false);
});

test('validarFluxo: nó terminal sem aresta NÃO é beco (fim é saída legítima)', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'e', tipo: 'encerrar' }],
    [{ from: 'i', to: 'e', port: 'saida' }],
  ));
  assert.equal(temCodigo(res, 'beco_sem_saida'), false);
  assert.equal(res.ok, true);
});

test('validarFluxo: ramo de condição não ligado → aviso porta_nao_conectada', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'c', tipo: 'condicao' }, { id: 'e', tipo: 'encerrar' }],
    [{ from: 'i', to: 'c', port: 'saida' }, { from: 'c', to: 'e', port: 'sim' }],
  ));
  const p = acharProblema(res, 'porta_nao_conectada', 'c');
  assert.ok(p, 'esperava porta_nao_conectada no nó c');
  assert.equal(p.porta, 'nao');
  assert.equal(p.nivel, 'aviso');
});

test('validarFluxo: nó solto → aviso no_inalcancavel (e não vira beco)', () => {
  const res = validarFluxo(mk(
    [
      { id: 'i', tipo: 'inicio' }, { id: 't', tipo: 'enviar_texto' },
      { id: 'e', tipo: 'encerrar' }, { id: 'solto', tipo: 'enviar_texto' },
    ],
    [{ from: 'i', to: 't', port: 'saida' }, { from: 't', to: 'e', port: 'saida' }],
  ));
  assert.ok(acharProblema(res, 'no_inalcancavel', 'solto'), 'esperava no_inalcancavel');
  assert.equal(res.problemas.some(p => p.codigo === 'beco_sem_saida' && p.no === 'solto'), false);
});

test('validarFluxo: aresta saindo de porta que o motor nunca emite → aviso aresta_orfa', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'tr', tipo: 'transferir_agente' }, { id: 'e', tipo: 'encerrar' }],
    [{ from: 'i', to: 'tr', port: 'saida' }, { from: 'tr', to: 'e', port: 'transferido' }],
  ));
  const p = acharProblema(res, 'aresta_orfa', 'tr');
  assert.ok(p, 'esperava aresta_orfa no nó tr');
  assert.equal(p.porta, 'transferido');
});

test('validarFluxo: ciclo de nós instantâneos → aviso loop_sem_espera (trava)', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'a', tipo: 'enviar_texto' }, { id: 'b', tipo: 'enviar_texto' }],
    [
      { from: 'i', to: 'a', port: 'saida' },
      { from: 'a', to: 'b', port: 'saida' },
      { from: 'b', to: 'a', port: 'saida' },
    ],
  ));
  assert.ok(temCodigo(res, 'loop_sem_espera'), 'esperava loop_sem_espera');
});

test('validarFluxo: ciclo que passa por nó que aguarda NÃO é trava', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'm', tipo: 'enviar_botoes', config: { botoes: [{ id: 'v', label: 'Voltar' }] } }],
    [{ from: 'i', to: 'm', port: 'saida' }, { from: 'm', to: 'm', port: 'v' }],
  ));
  assert.equal(temCodigo(res, 'loop_sem_espera'), false);
});

test('validarFluxo: ok=true quando só há avisos (sem erros)', () => {
  const res = validarFluxo(mk(
    [{ id: 'i', tipo: 'inicio' }, { id: 'tr', tipo: 'transferir_agente' }, { id: 'e', tipo: 'encerrar' }],
    [{ from: 'i', to: 'tr', port: 'saida' }, { from: 'tr', to: 'e', port: 'transferido' }],
  ));
  assert.equal(res.problemas.filter(p => p.nivel === 'erro').length, 0);
  assert.equal(res.ok, true);
});
