/**
 * Deduplicação de reentrega de webhook — contra Postgres real.
 *
 * A migration 008 e o `onConflict` do mensagemRepository foram escritos em
 * 2026-08-21 e nunca exercitados contra um banco: a máquina de dev não tinha
 * Postgres. A ERS registra isso como aposta (§8.2). Estes testes existem para
 * converter a aposta em fato.
 *
 * O bug original é um TOCTOU: os webhooks faziam "checa por external_id →
 * insere". Numa reentrega concorrente da Evolution as duas execuções passam
 * pela checagem antes de qualquer insert, a mensagem duplica, o motor roda
 * duas vezes e a IA responde — e cobra — em dobro. A defesa é o banco ser a
 * autoridade, não o código.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

describe('dedup de mensagens por external_id', { skip: motivoSkip() }, () => {
  let db, mensagemRepo, conversa;

  before(async () => {
    db = await prepararBanco();
    ({ mensagemRepo } = await import('../../src/repositories/mensagemRepository.js'));
  });

  after(async () => { await db.destroy(); });

  beforeEach(async () => {
    await limpar(db, ['mensagens', 'conversas']);
    conversa = await criarConversa(db);
  });

  const recebida = (external_id, texto = 'oi') => ({
    conversa_id: conversa.id,
    origem: 'cliente',
    tipo: 'texto',
    texto,
    external_id,
  });

  test('a migration 008 deixou o índice ÚNICO no lugar (é ele que sustenta o resto)', async () => {
    const { rows } = await db.raw(`
      SELECT indexdef FROM pg_indexes
      WHERE tablename = 'mensagens' AND indexname = 'mensagens_external_id_unique'
    `);
    assert.equal(rows.length, 1, 'índice mensagens_external_id_unique não existe');
    assert.match(rows[0].indexdef, /CREATE UNIQUE INDEX/);
  });

  test('reentrega sequencial do mesmo external_id grava UMA mensagem', async () => {
    const primeira = await mensagemRepo.criar(recebida('EVT-1'));
    const segunda  = await mensagemRepo.criar(recebida('EVT-1'));

    assert.ok(primeira?.id, 'a primeira entrega deve gravar');
    assert.equal(segunda, null, 'a reentrega deve devolver null para o chamador parar');

    const total = await db('mensagens').where({ external_id: 'EVT-1' }).count({ n: '*' });
    assert.equal(Number(total[0].n), 1);
  });

  test('reentrega CONCORRENTE do mesmo external_id grava UMA mensagem (o TOCTOU)', async () => {
    const resultados = await Promise.all([
      mensagemRepo.criar(recebida('EVT-CONC')),
      mensagemRepo.criar(recebida('EVT-CONC')),
      mensagemRepo.criar(recebida('EVT-CONC')),
    ]);

    const gravadas = resultados.filter(Boolean);
    assert.equal(gravadas.length, 1, 'exatamente uma das execuções concorrentes deve gravar');

    const total = await db('mensagens').where({ external_id: 'EVT-CONC' }).count({ n: '*' });
    assert.equal(Number(total[0].n), 1);
  });

  test('external_ids diferentes gravam normalmente', async () => {
    await mensagemRepo.criar(recebida('EVT-A', 'primeira'));
    await mensagemRepo.criar(recebida('EVT-B', 'segunda'));

    const total = await db('mensagens').where({ conversa_id: conversa.id }).count({ n: '*' });
    assert.equal(Number(total[0].n), 2);
  });

  test('mensagens SEM external_id nunca conflitam entre si (agente, IA, sistema)', async () => {
    // No Postgres NULLs são distintos num índice único — é o que mantém as
    // mensagens de saída normais. Se isso quebrasse, o agente só conseguiria
    // mandar uma mensagem por conversa.
    const enviadas = await Promise.all([
      mensagemRepo.criar({ conversa_id: conversa.id, origem: 'agente', texto: 'a' }),
      mensagemRepo.criar({ conversa_id: conversa.id, origem: 'agente', texto: 'b' }),
      mensagemRepo.criar({ conversa_id: conversa.id, origem: 'ia',     texto: 'c' }),
    ]);

    assert.equal(enviadas.filter(Boolean).length, 3, 'nenhuma delas pode ser descartada');
    const total = await db('mensagens').where({ conversa_id: conversa.id }).count({ n: '*' });
    assert.equal(Number(total[0].n), 3);
  });

  test('a entrega que vence atualiza o preview da conversa', async () => {
    await mensagemRepo.criar(recebida('EVT-PREV', 'mensagem do cliente'));
    const atualizada = await db('conversas').where({ id: conversa.id }).first();
    assert.equal(atualizada.ultima_mensagem, 'mensagem do cliente');
  });
});
