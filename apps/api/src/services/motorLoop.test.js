import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executarLoop, TETO_ITERACOES } from './motorLoop.js';

// helpers
const ctxDe = (nodes, edges, noAtual) => ({
  dados: { nodes, edges },
  estado: { noAtual, contexto: {}, aguardando: null },
  respostas: [],
});
const avancar = (saida = 'saida') => ({ tipo: 'avancar', saida });
const aguardar = () => ({ tipo: 'aguardar_input' });
const fim = () => ({ tipo: 'fim' });

test('executarLoop: progressão linear até nó terminal → concluido', async () => {
  const nodes = [
    { id: 'i', tipo: 'inicio' },
    { id: 't', tipo: 'enviar_texto' },
    { id: 'e', tipo: 'encerrar' },
  ];
  const edges = [
    { from: 'i', to: 't', port: 'saida' },
    { from: 't', to: 'e', port: 'saida' },
  ];
  const trilha = [];
  const res = await executarLoop(ctxDe(nodes, edges, 'i'), {
    processarNo: async (no) => (no.tipo === 'encerrar' ? fim() : avancar('saida')),
    onPasso: ({ no }) => trilha.push(no.id),
  });
  assert.equal(res.status, 'concluido');
  assert.deepEqual(trilha, ['i', 't', 'e']);
});

test('executarLoop: nó que pede input → aguardando (pausa)', async () => {
  const nodes = [{ id: 'm', tipo: 'enviar_botoes' }];
  const res = await executarLoop(ctxDe(nodes, [], 'm'), {
    processarNo: async () => aguardar(),
  });
  assert.equal(res.status, 'aguardando');
  assert.equal(res.noId, 'm');
});

test('executarLoop: avança para porta SEM aresta num nó não-terminal → perdido (cliente largado)', async () => {
  const nodes = [{ id: 't', tipo: 'enviar_texto' }];
  const res = await executarLoop(ctxDe(nodes, [], 't'), {
    processarNo: async () => avancar('saida'),
  });
  assert.equal(res.status, 'perdido');
  assert.equal(res.noId, 't');
});

test('executarLoop: avança sem aresta num nó terminal → concluido (fim legítimo)', async () => {
  const nodes = [{ id: 'tr', tipo: 'transferir_agente' }];
  const res = await executarLoop(ctxDe(nodes, [], 'tr'), {
    processarNo: async () => avancar('fora_horario'),
  });
  assert.equal(res.status, 'concluido');
});

test('executarLoop: fim() explícito → concluido', async () => {
  const nodes = [{ id: 'e', tipo: 'encerrar' }];
  const res = await executarLoop(ctxDe(nodes, [], 'e'), {
    processarNo: async () => fim(),
  });
  assert.equal(res.status, 'concluido');
});

test('executarLoop: ciclo instantâneo estoura o teto de iterações → travado', async () => {
  const nodes = [{ id: 'a', tipo: 'enviar_texto' }, { id: 'b', tipo: 'enviar_texto' }];
  const edges = [
    { from: 'a', to: 'b', port: 'saida' },
    { from: 'b', to: 'a', port: 'saida' },
  ];
  const res = await executarLoop(ctxDe(nodes, edges, 'a'), {
    processarNo: async () => avancar('saida'),
  });
  assert.equal(res.status, 'travado');
  assert.equal(res.iteracoes, TETO_ITERACOES);
});

test('executarLoop: nó atual inexistente → perdido (motivo no_inexistente)', async () => {
  const res = await executarLoop(ctxDe([{ id: 'i', tipo: 'inicio' }], [], 'fantasma'), {
    processarNo: async () => avancar('saida'),
  });
  assert.equal(res.status, 'perdido');
  assert.equal(res.motivo, 'no_inexistente');
});

test('executarLoop: processarNo que lança erro → status erro + resposta de erro empilhada', async () => {
  const ctx = ctxDe([{ id: 't', tipo: 'enviar_texto' }], [], 't');
  const res = await executarLoop(ctx, {
    processarNo: async () => { throw new Error('SGP fora do ar'); },
  });
  assert.equal(res.status, 'erro');
  assert.equal(ctx.respostas.length, 1);
  assert.match(ctx.respostas[0].texto, /Erro interno/);
});

test('executarLoop: roteia pela porta correta entre múltiplos ramos', async () => {
  const nodes = [
    { id: 'c', tipo: 'condicao' },
    { id: 'x', tipo: 'enviar_texto' },
    { id: 'y', tipo: 'enviar_texto' },
    { id: 'e', tipo: 'encerrar' },
  ];
  const edges = [
    { from: 'c', to: 'x', port: 'sim' },
    { from: 'c', to: 'y', port: 'nao' },
    { from: 'y', to: 'e', port: 'saida' },
  ];
  const trilha = [];
  const res = await executarLoop(ctxDe(nodes, edges, 'c'), {
    processarNo: async (no) =>
      no.tipo === 'condicao' ? avancar('nao') : no.tipo === 'encerrar' ? fim() : avancar('saida'),
    onPasso: ({ no }) => trilha.push(no.id),
  });
  assert.equal(res.status, 'concluido');
  assert.deepEqual(trilha, ['c', 'y', 'e']); // tomou o ramo "nao"
});
