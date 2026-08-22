import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simularConversa } from './motorSimulador.js';

const mkFluxo = (nodes, edges = []) => ({ dados: { nodes, edges } });

test('simularConversa: fluxo linear (inicio→texto→encerrar) → concluido, trilha completa', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 't', tipo: 'enviar_texto', config: { texto: 'Olá!' } },
      { id: 'e', tipo: 'encerrar', config: { mensagem: 'Até logo!' } },
    ],
    [{ from: 'i', to: 't', port: 'saida' }, { from: 't', to: 'e', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'] });
  assert.equal(r.status, 'concluido');
  assert.deepEqual(r.trilha, ['i', 't', 'e']);
  assert.ok(r.transcript.some(m => m.texto === 'Olá!'));
});

test('simularConversa: menu pausa no 1º turno e retoma no 2º (padrão enviar-e-aguardar)', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'm', tipo: 'enviar_botoes', config: { corpo: 'Escolha:', botoes: [{ id: 'boleto', label: '2ª via' }, { id: 'humano', label: 'Atendente' }] } },
      { id: 'fb', tipo: 'enviar_texto', config: { texto: 'Seu boleto...' } },
      { id: 'e', tipo: 'encerrar' },
    ],
    [
      { from: 'i', to: 'm', port: 'saida' },
      { from: 'm', to: 'fb', port: 'boleto' },
      { from: 'fb', to: 'e', port: 'saida' },
    ],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi', 'boleto'] });
  assert.equal(r.turnos[0].status, 'aguardando'); // 1º turno mostra o menu e pausa
  assert.equal(r.status, 'concluido');            // 2º turno escolhe boleto e conclui
  assert.deepEqual(r.trilha, ['i', 'm', 'm', 'fb', 'e']);
});

test('simularConversa: nó sem nenhuma aresta de saída → perdido (cliente largado em runtime)', async () => {
  // 'c' é alcançado mas não tem NENHUMA aresta saindo → o motor encerra em silêncio.
  // (Se tivesse qualquer aresta, o fallback do encontrarProximo mandaria pro ramo errado,
  //  não perderia o cliente — isso o validador estático pega como porta_nao_conectada.)
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'c', tipo: 'condicao' },
    ],
    [{ from: 'i', to: 'c', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'], decisoes: { c: 'nao' } });
  assert.equal(r.status, 'perdido');
  assert.equal(r.perdidoEm, 'c');
});

test('simularConversa: ciclo instantâneo → travado', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'a', tipo: 'enviar_texto' },
      { id: 'b', tipo: 'enviar_texto' },
    ],
    [
      { from: 'i', to: 'a', port: 'saida' },
      { from: 'a', to: 'b', port: 'saida' },
      { from: 'b', to: 'a', port: 'saida' },
    ],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'] });
  assert.equal(r.status, 'travado');
});

test('simularConversa: nps_inline usa a escala real (avaliarNps) para rotear', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'n', tipo: 'nps_inline', config: { pergunta: 'Nota?', escala: '5' } },
      { id: 'ok', tipo: 'encerrar', config: { mensagem: 'Obrigado!' } },
      { id: 'ruim', tipo: 'transferir_agente' },
    ],
    [
      { from: 'i', to: 'n', port: 'saida' },
      { from: 'n', to: 'ok', port: 'promotor' },
      { from: 'n', to: 'ruim', port: 'detrator' },
    ],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi', '5'] });
  assert.equal(r.status, 'concluido');
  assert.ok(r.trilha.includes('ok'));   // nota 5 (escala 5) = promotor
  assert.ok(!r.trilha.includes('ruim'));
});

test('simularConversa: transferir_agente conclui (cliente entra na fila)', async () => {
  const fluxo = mkFluxo(
    [{ id: 'i', tipo: 'inicio' }, { id: 'tr', tipo: 'transferir_agente' }],
    [{ from: 'i', to: 'tr', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['quero falar com humano'] });
  assert.equal(r.status, 'concluido');
  assert.ok(r.trilha.includes('tr'));
});

test('simularConversa: decisão como função lê o contexto da conversa', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'vs', tipo: 'verificar_status' },
      { id: 'a', tipo: 'enviar_texto', config: { texto: 'Ativo' } },
      { id: 's', tipo: 'enviar_texto', config: { texto: 'Suspenso' } },
      { id: 'e', tipo: 'encerrar' },
    ],
    [
      { from: 'i', to: 'vs', port: 'saida' },
      { from: 'vs', to: 'a', port: 'ativo' },
      { from: 'vs', to: 's', port: 'suspenso' },
      { from: 's', to: 'e', port: 'saida' },
    ],
  );
  const r = await simularConversa(fluxo, {
    turnos: ['oi'],
    contextoInicial: { statusCliente: 'suspenso' },
    decisoes: { vs: (ctx) => ctx.estado.contexto.statusCliente },
  });
  assert.equal(r.status, 'concluido');
  assert.ok(r.trilha.includes('s'));
  assert.ok(!r.trilha.includes('a'));
});

test('simularConversa: fluxo sem entrada → status sem_entrada', async () => {
  const r = await simularConversa(mkFluxo([{ id: 't', tipo: 'enviar_texto' }], []), { turnos: ['oi'] });
  assert.equal(r.status, 'sem_entrada');
});

test('simularConversa: pausa sem turno seguinte fica aguardando (esperando o cliente)', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'm', tipo: 'enviar_botoes', config: { botoes: [{ id: 'a', label: 'A' }] } },
    ],
    [{ from: 'i', to: 'm', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'] });
  assert.equal(r.status, 'aguardando');
});

// ── consultar_cliente: o simulador tem de espelhar o MOTOR, não melhorá-lo ──
//
// Divergência da pauta de 2026-08-21: o simulador lia `cfg.mensagem` com default
// 'Informe seu CPF:', o motor lê `cfg.pergunta` sem default — sem ela, o nó fica
// em SILÊNCIO esperando. A aba Simulação mostrava uma pergunta que a produção
// nunca enviaria: falso positivo de confiança justo no nó de entrada de dado.
test('simularConversa: consultar_cliente com cfg.pergunta envia a pergunta', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'c', tipo: 'consultar_cliente', config: { pergunta: 'Qual o seu CPF?' } },
    ],
    [{ from: 'i', to: 'c', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'] });
  assert.ok(r.transcript.some(m => m.texto === 'Qual o seu CPF?'),
    'a pergunta configurada não foi enviada');
});

test('simularConversa: consultar_cliente SEM pergunta fica em silêncio, como o motor', async () => {
  const fluxo = mkFluxo(
    [
      { id: 'i', tipo: 'inicio' },
      { id: 'c', tipo: 'consultar_cliente', config: {} },
    ],
    [{ from: 'i', to: 'c', port: 'saida' }],
  );
  const r = await simularConversa(fluxo, { turnos: ['oi'] });
  assert.ok(!r.transcript.some(m => /CPF/i.test(m.texto || '')),
    'o simulador inventou uma pergunta que o motor real nunca enviaria');
});
