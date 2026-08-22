/**
 * O estado do motor sobrevive ao processo (FASE 1 / P0 §14).
 *
 * O que estes testes provam — e que nenhum teste puro pode provar — é que
 * `estadoStore` grava e relê o blob do motor num Postgres de verdade, que a
 * execução é apagada junto com a conversa, e que a unique parcial impede duas
 * conversas vivas para o mesmo (telefone, canal).
 *
 * "Sobreviver ao restart" é simulado como o único jeito honesto num teste:
 * uma instância NOVA do módulo (query-string no import ESM dá módulo
 * independente, sem nada do Map anterior) relê o que a primeira gravou.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

describe('flow_executions — estado do motor no banco', { skip: motivoSkip() }, () => {
  let db, store;

  before(async () => {
    db = await prepararBanco();
    ({ estadoStore: store } = await import('../../src/services/estadoStore.js'));
  });

  // O pool é singleton do processo e os dois `describe` deste arquivo o
  // compartilham — destruí-lo aqui deixaria o segundo sem conexão.
  beforeEach(async () => { await limpar(db, ['flow_executions', 'conversas']); });

  test('grava e relê o blob do motor sem deformá-lo', async () => {
    const c = await criarConversa(db, { telefone: '5584900000001' });
    const estado = {
      noAtual: 'no-7',
      contexto: { cliente: { nome: 'Fulano' }, _cpf_tentativas: 2 },
      historico: [{ de: 'cliente', texto: 'oi' }],
      aguardando: 'no-7',
    };

    await store.set(c.id, estado);
    assert.deepEqual(await store.get(c.id), estado);
  });

  test('sobrevive a um "restart": outra instância do módulo relê o estado', async () => {
    const c = await criarConversa(db, { telefone: '5584900000002' });
    await store.set(c.id, { noAtual: 'no-3', contexto: { cpf: '123' }, historico: [], aguardando: null });

    // Módulo novo = processo novo: nenhum Map em memória sobreviveria a isto.
    const { estadoStore: outraInstancia } = await import('../../src/services/estadoStore.js?reinicio=1');
    const lido = await outraInstancia.get(c.id);

    assert.equal(lido.noAtual, 'no-3', 'o nó atual não sobreviveu ao restart');
    assert.equal(lido.contexto.cpf, '123', 'o contexto coletado não sobreviveu ao restart');
  });

  test('set duas vezes atualiza a mesma linha (uma execução por conversa)', async () => {
    const c = await criarConversa(db, { telefone: '5584900000003' });
    await store.set(c.id, { noAtual: 'a', contexto: {}, historico: [], aguardando: null });
    await store.set(c.id, { noAtual: 'b', contexto: {}, historico: [], aguardando: null });

    const { rows } = await db.raw('SELECT estado->>\'noAtual\' AS no FROM flow_executions WHERE conversa_id = ?', [c.id]);
    assert.equal(rows.length, 1, 'a conversa ficou com mais de uma execução');
    assert.equal(rows[0].no, 'b');
  });

  test('delete some com a linha e get devolve null', async () => {
    const c = await criarConversa(db, { telefone: '5584900000004' });
    await store.set(c.id, { noAtual: 'x', contexto: {}, historico: [], aguardando: null });
    await store.delete(c.id);
    assert.equal(await store.get(c.id), null);
  });

  test('get de conversa sem execução devolve null, não estoura', async () => {
    const c = await criarConversa(db, { telefone: '5584900000005' });
    assert.equal(await store.get(c.id), null);
  });

  test('id de sandbox não é uuid — o store ignora em vez de estourar', async () => {
    // As rotas de teste de fluxo usam `sandbox:<uuid>` / `share:<uuid>` e injetam
    // um Map próprio, então nunca chegam aqui. Se um dia chegarem, tem de degradar.
    assert.equal(await store.get('sandbox:abc'), null);
    await store.set('share:abc', { noAtual: 'x' });   // não pode lançar
    await store.delete('share:abc');
  });

  test('apagar a conversa apaga a execução (ON DELETE CASCADE)', async () => {
    const c = await criarConversa(db, { telefone: '5584900000006' });
    await store.set(c.id, { noAtual: 'y', contexto: {}, historico: [], aguardando: null });

    await db('conversas').where({ id: c.id }).del();

    const { rows } = await db.raw('SELECT 1 FROM flow_executions WHERE conversa_id = ?', [c.id]);
    assert.equal(rows.length, 0, 'a execução ficou órfã depois de apagar a conversa');
  });

  test('o nó atual é inspecionável no banco sem passar pelo app (§14)', async () => {
    const c = await criarConversa(db, { telefone: '5584900000007' });
    await store.set(c.id, { noAtual: 'menu-principal', contexto: {}, historico: [], aguardando: null });

    const { rows } = await db.raw("SELECT estado->>'noAtual' AS no FROM flow_executions");
    assert.equal(rows[0].no, 'menu-principal');
  });
});

describe('uma conversa viva por (telefone, canal)', { skip: motivoSkip() }, () => {
  let db, conversaRepo;

  before(async () => {
    db = await prepararBanco();
    ({ conversaRepo } = await import('../../src/repositories/conversaRepository.js'));
  });

  after(async () => { await db?.destroy?.(); });

  beforeEach(async () => { await limpar(db, ['flow_executions', 'conversas']); });

  test('obterOuCriar concorrente cria UMA conversa, não duas', async () => {
    // O TOCTOU real: os 3 webhooks faziam `porTelefoneCanal` → `criar`. Duas
    // mensagens simultâneas de um número novo passavam as duas pela checagem.
    const feitas = await Promise.all([
      conversaRepo.obterOuCriar('5584911111111', 'whatsapp', { nome: 'A' }),
      conversaRepo.obterOuCriar('5584911111111', 'whatsapp', { nome: 'B' }),
      conversaRepo.obterOuCriar('5584911111111', 'whatsapp', { nome: 'C' }),
    ]);
    assert.equal(feitas.filter(r => r.nova).length, 1, 'mais de um chamador achou que criou a conversa');

    const { rows } = await db.raw(
      "SELECT COUNT(*)::int AS n FROM conversas WHERE telefone = ? AND status <> 'encerrada'",
      ['5584911111111'],
    );
    assert.equal(rows[0].n, 1, 'nasceram conversas duplicadas para o mesmo número');
    assert.equal(new Set(feitas.map(r => r.conversa.id)).size, 1, 'os chamadores receberam conversas diferentes');
    assert.ok(feitas.every(r => r.conversa?.protocolo), 'alguma conversa nasceu sem protocolo');
  });

  test('conversa encerrada não bloqueia uma nova do mesmo número', async () => {
    const { conversa: primeira } = await conversaRepo.obterOuCriar('5584922222222', 'whatsapp', {});
    await conversaRepo.encerrar(primeira.id);

    const { conversa: segunda, nova } = await conversaRepo.obterOuCriar('5584922222222', 'whatsapp', {});
    assert.notEqual(segunda.id, primeira.id, 'reaproveitou a conversa encerrada');
    assert.ok(nova, 'a segunda conversa devia nascer nova');
  });

  test('protocolos concorrentes não colidem (unique em conversas.protocolo)', async () => {
    // `_gerarProtocolo` era COUNT(*)+1: N inserts simultâneos calculavam o
    // MESMO número e o segundo estourava 23505.
    const criadas = await Promise.all(
      Array.from({ length: 8 }, (_, i) => conversaRepo.criar({ canal: 'whatsapp', telefone: `55849333333${i}` })),
    );
    const protocolos = criadas.map(c => c.protocolo);
    assert.equal(new Set(protocolos).size, 8, `protocolos repetidos: ${protocolos.join(', ')}`);
  });

  test('encerrar a conversa apaga a execução do fluxo', async () => {
    const { estadoStore } = await import('../../src/services/estadoStore.js');
    const { conversa: c } = await conversaRepo.obterOuCriar('5584944444444', 'whatsapp', {});
    await estadoStore.set(c.id, { noAtual: 'meio-do-fluxo', contexto: {}, historico: [], aguardando: null });

    await conversaRepo.encerrar(c.id);

    assert.equal(await estadoStore.get(c.id), null,
      'o cliente que voltar a escrever retomaria no meio do fluxo antigo');
  });
});
