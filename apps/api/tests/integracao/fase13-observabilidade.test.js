/**
 * Observabilidade (FASE 13) contra Postgres.
 *
 * O que só o banco prova: a deduplicação por assinatura em `erros_app` — que é
 * o que torna o rastreador barato e legível — e o veredito de saúde reagindo à
 * fila real. O log estruturado, a redação de PII e o disjuntor estão nas suítes
 * puras (`mascarar.test.js`, `disjuntor.test.js`).
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar } from './_ambiente.js';
import { assinatura, normalizarMensagem, primeiroFrameNosso } from '../../src/services/erros.js';

const TABELAS = ['erros_app', 'telemetria', 'inbox', 'outbox', 'jobs', 'mensagens', 'conversas'];

describe('FASE 13 — Observabilidade', { skip: motivoSkip() }, () => {
  let db, erros, saude;

  before(async () => {
    db = await prepararBanco();
    erros = await import('../../src/services/erros.js');
    saude = await import('../../src/services/saude.js');
  });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const esperar = () => new Promise(r => setTimeout(r, 150));

  // ── ERROS ───────────────────────────────────────────────────────
  describe('error tracking (§139)', () => {
    test('CRITÉRIO: o MESMO defeito vira UMA linha com contador', async () => {
      // Sem dedup, um erro que dispara a cada turno gera dezenas de milhares de
      // linhas e a tabela deixa de ser lida — o mesmo que não existir.
      const err = new Error('SGP 500 em /api/ura/consultacliente');
      err.stack = 'Error: x\n    at foo (/app/apps/api/src/services/integrations.js:99:5)';
      for (let i = 0; i < 5; i++) erros.registrar(err, { origem: 'rota' });
      await esperar();

      const linhas = await db('erros_app');
      assert.equal(linhas.length, 1);
      assert.equal(linhas[0].ocorrencias, 5);
    });

    test('CRITÉRIO: ids e números na mensagem NÃO criam erros novos', async () => {
      // "contrato 4242 não encontrado" e "contrato 7777 não encontrado" são o
      // mesmo defeito. Sem normalizar, cada ocorrência vira uma linha.
      const base = 'Error: y\n    at bar (/app/apps/api/src/services/x.js:1:1)';
      for (const n of [4242, 7777, 91011]) {
        const e = new Error(`contrato ${n} não encontrado`);
        e.stack = base;
        erros.registrar(e);
      }
      await esperar();
      assert.equal((await db('erros_app')).length, 1);
    });

    test('erros DIFERENTES continuam separados', async () => {
      const a = new Error('falha A'); a.stack = 'Error\n    at a (/app/apps/api/src/a.js:1:1)';
      const b = new Error('falha B'); b.stack = 'Error\n    at b (/app/apps/api/src/b.js:1:1)';
      erros.registrar(a); erros.registrar(b);
      await esperar();
      assert.equal((await db('erros_app')).length, 2);
    });

    test('CRITÉRIO: PII do erro NÃO chega à tabela', async () => {
      // A mensagem de erro do SGP carrega ficha do assinante.
      const e = new Error('SGP 400 — {"cpf":"12345678901","fone":"5584999887766"}');
      e.stack = 'Error\n    at z (/app/apps/api/src/services/integrations.js:1:1)';
      erros.registrar(e);
      await esperar();

      const [linha] = await db('erros_app');
      assert.ok(!linha.mensagem.includes('12345678901'), linha.mensagem);
      assert.ok(!linha.mensagem.includes('5584999887766'), linha.mensagem);
    });

    test('erro marcado como VISTO que volta é reaberto', async () => {
      const e = new Error('intermitente');
      e.stack = 'Error\n    at w (/app/apps/api/src/w.js:1:1)';
      erros.registrar(e);
      await esperar();
      await db('erros_app').update({ status: 'visto' });

      erros.registrar(e);
      await esperar();
      const [linha] = await db('erros_app');
      assert.equal(linha.status, 'novo', 'erro que volta é erro que não foi resolvido');
      assert.equal(linha.ocorrencias, 2);
    });

    test('registrar nunca lança, nem com erro estranho', async () => {
      erros.registrar(null);
      erros.registrar('string solta');
      erros.registrar({ sem: 'stack' });
      await esperar();
      assert.ok(true);
    });

    test('o stack guardado exclui node_modules', () => {
      const stack = [
        'Error: x',
        '    at f (/app/node_modules/knex/lib/a.js:1:1)',
        '    at g (/app/apps/api/src/services/b.js:2:2)',
      ].join('\n');
      assert.match(primeiroFrameNosso(stack), /services\/b\.js/);
      assert.ok(!primeiroFrameNosso(stack).includes('node_modules'));
    });

    test('normalizarMensagem troca número e uuid por #', () => {
      assert.equal(normalizarMensagem('conversa 550e8400-e29b-41d4-a716-446655440000 falhou 3x'),
                   'conversa # falhou #x');
    });

    test('a assinatura é estável entre chamadas', () => {
      const e = new Error('igual'); e.stack = 'Error\n    at q (/app/apps/api/src/q.js:1:1)';
      assert.equal(assinatura(e), assinatura(e));
    });
  });

  // ── SAÚDE ───────────────────────────────────────────────────────
  describe('saúde do sistema (§134/§140)', () => {
    test('sistema limpo responde "normal"', async () => {
      const d = await saude.dependencias({ agora: Date.now() });
      assert.equal(d.banco.estado, 'ok');
      assert.equal(saude.veredito(d).estado, 'normal');
    });

    test('CRITÉRIO: mensagem na DLQ derruba o veredito para "limitado"', async () => {
      // É o cartão que o operador realmente usa: fila parada diz mais sobre o
      // atendimento que qualquer `SELECT 1`.
      await db('inbox').insert({
        canal: 'evolution', dedup_hash: 'h1', payload: JSON.stringify({}), status: 'falha',
      });
      const d = await saude.dependencias({ agora: Date.now() + 60_000 });
      assert.equal(d.filas.dlq, 1);
      assert.equal(saude.veredito(d).estado, 'limitado');
      assert.match(saude.veredito(d).frase, /não entregue/);
    });

    test('o veredito fala PARA GENTE — sem jargão nem stack', async () => {
      const d = await saude.dependencias({ agora: Date.now() + 120_000 });
      const v = saude.veredito(d);
      assert.ok(!/SELECT|null|undefined|Error|stack/i.test(v.frase), v.frase);
      assert.ok(v.frase.length < 120);
    });

    test('a IA falhando muito vira "limitado"', async () => {
      await db('telemetria').insert([
        { tipo: 'llm', nome: 'm', ok: false, ms: 100 },
        { tipo: 'llm', nome: 'm', ok: false, ms: 100 },
      ]);
      const d = await saude.dependencias({ agora: Date.now() + 180_000 });
      assert.equal(d.ia.estado, 'ruim');
      assert.equal(saude.veredito(d).estado, 'limitado');
    });

    test('sem chamada nenhuma, o estado é "sem_dados" — não "ok" nem "ruim"', async () => {
      const d = await saude.dependencias({ agora: Date.now() + 240_000 });
      assert.equal(d.sgp.estado, 'sem_dados');
      assert.equal(d.ia.estado, 'sem_dados');
    });
  });
});
