/**
 * Os critérios de aceite do P0 (§14), exercitando o motor DE VERDADE.
 *
 * O `motorFluxo.js` não é importável na suíte pura (puxa `config/db.js` → Knex
 * no topo). Aqui é: `DATABASE_URL` está posta, então este é o único lugar onde
 * o motor real roda ponta a ponta.
 *
 * Os fluxos usados de propósito só têm nós que não chamam rede: `enviar_texto`,
 * `aguardar_resposta`, `transferir_agente`, `encerrar`. Nada de IA nem SGP —
 * o que está sob teste é o CICLO DE VIDA da execução, não o conteúdo dos nós.
 *
 * "Restart" é simulado do único jeito honesto: uma instância NOVA do módulo
 * (query-string no import ESM dá módulo independente, sem nada em memória do
 * anterior) processa a mensagem seguinte. Se o estado não estivesse no banco,
 * a conversa recomeçaria no nó de início — que é exatamente o bug desta fase.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

/** Fluxo: pergunta o nome → pergunta a cidade → agradece → encerra. */
const FLUXO_DUAS_PERGUNTAS = {
  id: '11111111-1111-4111-8111-111111111111',
  nome: 'Duas perguntas',
  dados: {
    nodes: [
      { id: 'ini',    tipo: 'inicio',            config: {} },
      { id: 'nome',   tipo: 'aguardar_resposta', config: { mensagem: 'Qual seu nome?',   variavel: 'nome' } },
      { id: 'cidade', tipo: 'aguardar_resposta', config: { mensagem: 'Qual sua cidade?', variavel: 'cidade' } },
      { id: 'tchau',  tipo: 'encerrar',          config: { mensagem: 'Obrigado!' } },
    ],
    edges: [
      { from: 'ini',    to: 'nome',   port: 'saida' },
      { from: 'nome',   to: 'cidade', port: 'saida' },
      { from: 'cidade', to: 'tchau',  port: 'saida' },
    ],
  },
};

/** Fluxo: pergunta algo → transfere para humano, com a porta `transferido` ligada. */
const FLUXO_COM_RETORNO = {
  id: '22222222-2222-4222-8222-222222222222',
  nome: 'Transfere e volta',
  dados: {
    nodes: [
      { id: 'ini',      tipo: 'inicio',            config: {} },
      { id: 'assunto',  tipo: 'aguardar_resposta', config: { mensagem: 'Qual o assunto?', variavel: 'assunto' } },
      { id: 'humano',   tipo: 'transferir_agente', config: {} },
      { id: 'pos',      tipo: 'enviar_texto',      config: { texto: 'A automação voltou.' } },
      { id: 'fim',      tipo: 'encerrar',          config: {} },
    ],
    edges: [
      { from: 'ini',     to: 'assunto', port: 'saida' },
      { from: 'assunto', to: 'humano',  port: 'saida' },
      { from: 'humano',  to: 'pos',     port: 'transferido' },
      { from: 'pos',     to: 'fim',     port: 'saida' },
    ],
  },
};

describe('motor persistente — critérios de aceite do P0 (§14)', { skip: motivoSkip() }, () => {
  let db, motor, estadoStore, conversaRepo;
  const enviados = [];

  /** Roda um turno capturando o que seria enviado ao cliente. */
  const turno = (m, conversa, texto, fluxo) =>
    m.processarConversa(conversa, { texto, tipo: 'texto' }, {
      fluxo,
      enviar: (_c, resp) => { enviados.push(resp); },
    });

  before(async () => {
    db = await prepararBanco();
    motor = await import('../../src/services/motorFluxo.js');
    ({ estadoStore } = await import('../../src/services/estadoStore.js'));
    ({ conversaRepo } = await import('../../src/repositories/conversaRepository.js'));
  });

  after(async () => { await db?.destroy?.(); });

  beforeEach(async () => {
    enviados.length = 0;
    await limpar(db, ['flow_executions', 'mensagens', 'conversas', 'fluxos']);
  });

  test('restart não reinicia a conversa em andamento', async () => {
    const c = await criarConversa(db, { telefone: '5584800000001', status: 'ia' });

    await turno(motor, c, 'oi', FLUXO_DUAS_PERGUNTAS);
    assert.deepEqual(enviados.map(r => r.texto), ['Qual seu nome?']);

    // ── restart: instância nova do módulo, zero memória da anterior ──
    const depoisDoRestart = await import('../../src/services/motorFluxo.js?restart=1');
    enviados.length = 0;

    await turno(depoisDoRestart, c, 'Christian', FLUXO_DUAS_PERGUNTAS);

    assert.deepEqual(enviados.map(r => r.texto), ['Qual sua cidade?'],
      'a conversa voltou ao início depois do restart');
  });

  test('deploy não perde contexto — o que foi coletado sobrevive', async () => {
    const c = await criarConversa(db, { telefone: '5584800000002', status: 'ia' });

    await turno(motor, c, 'oi', FLUXO_DUAS_PERGUNTAS);
    await turno(motor, c, 'Christian', FLUXO_DUAS_PERGUNTAS);

    const outra = await import('../../src/services/motorFluxo.js?restart=2');
    const estado = await estadoStore.get(c.id);

    assert.equal(estado.contexto.nome, 'Christian', 'o dado coletado não foi persistido');
    assert.equal(estado.noAtual, 'cidade');

    enviados.length = 0;
    await turno(outra, c, 'Natal', FLUXO_DUAS_PERGUNTAS);
    assert.deepEqual(enviados.map(r => r.texto), ['Obrigado!']);
  });

  test('duas mensagens simultâneas não causam salto de nó', async () => {
    const c = await criarConversa(db, { telefone: '5584800000003', status: 'ia' });
    await turno(motor, c, 'oi', FLUXO_DUAS_PERGUNTAS);
    enviados.length = 0;

    // A race que motivou o `filaPorChave`: as duas leem o estado, fazem `await`
    // e gravam por cima uma da outra. Serializadas, a 1ª responde a pergunta do
    // nome e a 2ª a da cidade — nunca as duas a mesma pergunta.
    await Promise.all([
      turno(motor, c, 'Christian', FLUXO_DUAS_PERGUNTAS),
      turno(motor, c, 'Natal',     FLUXO_DUAS_PERGUNTAS),
    ]);

    assert.deepEqual(enviados.map(r => r.texto), ['Qual sua cidade?', 'Obrigado!'],
      'as duas mensagens processaram o mesmo nó (salto/estado corrompido)');
    assert.equal(await estadoStore.get(c.id), null, 'a execução devia ter terminado');
  });

  test('conversa vai para o humano e VOLTA para o fluxo (§13)', async () => {
    const c = await criarConversa(db, { telefone: '5584800000004', status: 'ia' });

    await turno(motor, c, 'oi', FLUXO_COM_RETORNO);
    await turno(motor, c, 'internet caiu', FLUXO_COM_RETORNO);

    // Transferiu: a execução continua VIVA, com o ponto de retorno gravado.
    const emEspera = await estadoStore.get(c.id);
    assert.ok(emEspera, 'a execução foi apagada ao transferir — não há para onde voltar');
    assert.equal(emEspera._retomarNo, 'pos');
    assert.equal(emEspera.contexto.assunto, 'internet caiu', 'o contexto se perdeu na transferência');

    // O agente devolve: retoma no nó da porta `transferido`.
    emEspera.noAtual = emEspera._retomarNo;
    emEspera._retomarNo = null;
    await estadoStore.set(c.id, emEspera);

    enviados.length = 0;
    await turno(motor, c, '', FLUXO_COM_RETORNO);

    assert.deepEqual(enviados.map(r => r.texto), ['A automação voltou.']);
    assert.equal(await estadoStore.get(c.id), null, 'o fluxo devia ter encerrado após o retorno');
  });

  test('sem a porta `transferido` ligada, transferir encerra como sempre encerrou', async () => {
    const semRetorno = {
      ...FLUXO_COM_RETORNO,
      dados: {
        ...FLUXO_COM_RETORNO.dados,
        edges: FLUXO_COM_RETORNO.dados.edges.filter(e => e.port !== 'transferido'),
      },
    };
    const c = await criarConversa(db, { telefone: '5584800000005', status: 'ia' });

    await turno(motor, c, 'oi', semRetorno);
    await turno(motor, c, 'algo', semRetorno);

    assert.equal(await estadoStore.get(c.id), null,
      'sem porta de retorno a execução não devia ficar viva no banco');
  });

  test('nova versão do fluxo não altera execução já iniciada (§12)', async () => {
    // O fluxo ativo é lido do BANCO, sem `opts.fluxo` — é o caminho de produção.
    await db('fluxos').insert({
      id: FLUXO_DUAS_PERGUNTAS.id,
      nome: FLUXO_DUAS_PERGUNTAS.nome,
      ativo: true,
      dados: JSON.stringify(FLUXO_DUAS_PERGUNTAS.dados),
    });
    const c = await criarConversa(db, { telefone: '5584800000006', status: 'ia' });

    enviados.length = 0;
    await motor.processarConversa(c, { texto: 'oi', tipo: 'texto' },
      { enviar: (_x, r) => enviados.push(r) });
    assert.deepEqual(enviados.map(r => r.texto), ['Qual seu nome?']);

    // Publica uma versão NOVA por cima, com outros ids de nó — o pior caso.
    await db('fluxos').where({ id: FLUXO_DUAS_PERGUNTAS.id }).update({
      dados: JSON.stringify({
        nodes: [
          { id: 'novo-ini', tipo: 'inicio',       config: {} },
          { id: 'novo-msg', tipo: 'enviar_texto', config: { texto: 'FLUXO NOVO' } },
        ],
        edges: [{ from: 'novo-ini', to: 'novo-msg', port: 'saida' }],
      }),
    });

    enviados.length = 0;
    await motor.processarConversa(c, { texto: 'Christian', tipo: 'texto' },
      { enviar: (_x, r) => enviados.push(r) });

    assert.deepEqual(enviados.map(r => r.texto), ['Qual sua cidade?'],
      'a conversa em andamento migrou para a versão nova do fluxo');
  });

  test('trocar o fluxo ATIVO não sequestra conversa em andamento', async () => {
    // `POST /fluxos/:id/ativar` desativa todos e ativa outro. Sem o grafo
    // congelado, a conversa passaria a rodar contra ids de nó que não existem e
    // morreria em "Nó não encontrado".
    await db('fluxos').insert([
      { id: FLUXO_DUAS_PERGUNTAS.id, nome: 'A', ativo: true,  dados: JSON.stringify(FLUXO_DUAS_PERGUNTAS.dados) },
      { id: FLUXO_COM_RETORNO.id,    nome: 'B', ativo: false, dados: JSON.stringify(FLUXO_COM_RETORNO.dados) },
    ]);
    const c = await criarConversa(db, { telefone: '5584800000007', status: 'ia' });

    await motor.processarConversa(c, { texto: 'oi', tipo: 'texto' }, { enviar: () => {} });

    await db('fluxos').update({ ativo: false });
    await db('fluxos').where({ id: FLUXO_COM_RETORNO.id }).update({ ativo: true });

    enviados.length = 0;
    await motor.processarConversa(c, { texto: 'Christian', tipo: 'texto' },
      { enviar: (_x, r) => enviados.push(r) });

    assert.deepEqual(enviados.map(r => r.texto), ['Qual sua cidade?'],
      'a conversa foi sequestrada pelo fluxo recém-ativado');
  });

  test('encerrar pelo painel não deixa execução órfã', async () => {
    const c = await criarConversa(db, { telefone: '5584800000008', status: 'ia' });
    await turno(motor, c, 'oi', FLUXO_DUAS_PERGUNTAS);
    assert.ok(await estadoStore.get(c.id));

    await conversaRepo.encerrar(c.id);

    assert.equal(await estadoStore.get(c.id), null,
      'o cliente que voltasse a escrever retomaria no meio do fluxo antigo');
  });

  test('fluxo que morre num nó inexistente não trava a conversa para sempre', async () => {
    const quebrado = {
      id: '33333333-3333-4333-8333-333333333333',
      nome: 'Aresta órfã',
      dados: {
        nodes: [
          { id: 'ini', tipo: 'inicio',            config: {} },
          { id: 'p',   tipo: 'aguardar_resposta', config: { mensagem: 'Fala:', variavel: 'x' } },
        ],
        edges: [
          { from: 'ini', to: 'p',        port: 'saida' },
          { from: 'p',   to: 'sumiu-do-grafo', port: 'saida' },
        ],
      },
    };
    const c = await criarConversa(db, { telefone: '5584800000009', status: 'ia' });

    await turno(motor, c, 'oi', quebrado);
    await turno(motor, c, 'qualquer coisa', quebrado);

    assert.equal(await estadoStore.get(c.id), null,
      'ficou uma execução apontando para um nó que não existe — conversa travada');
  });
});
