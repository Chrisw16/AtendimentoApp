import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { novo, permite, aoPassar, sucesso, falha, contaComoFalha, FECHADO, ABERTO, MEIO_ABERTO } from './disjuntor.js';

const T0 = 1_000_000;

describe('disjuntor', () => {
  test('nasce fechado e deixa passar', () => {
    const d = novo();
    assert.equal(d.estado, FECHADO);
    assert.equal(permite(d, T0), true);
  });

  test('abre só ao atingir o limite — uma falha isolada não corta', () => {
    let d = novo({ limite: 3 });
    d = falha(d); assert.equal(d.estado, FECHADO);
    d = falha(d); assert.equal(d.estado, FECHADO);
    d = falha(d); assert.equal(d.estado, ABERTO);
  });

  test('sucesso no meio do caminho zera o contador', () => {
    let d = novo({ limite: 3 });
    d = falha(d); d = falha(d);
    d = sucesso(d);
    assert.equal(d.falhas, 0);
    d = falha(d); d = falha(d);
    assert.equal(d.estado, FECHADO, 'as duas antigas não somam');
  });

  test('CRITÉRIO: aberto recusa NA HORA — é isso que devolve o turno ao cliente', () => {
    let d = novo({ limite: 1, esperaMs: 45_000 });
    d = falha(d, 'timeout', T0);
    assert.equal(permite(d, T0 + 1_000), false);
  });

  test('depois da espera vira meio-aberto e uma tentativa decide', () => {
    let d = novo({ limite: 1, esperaMs: 10_000 });
    d = falha(d, 'x', T0);
    assert.equal(permite(d, T0 + 10_001), true);
    d = aoPassar(d, T0 + 10_001);
    assert.equal(d.estado, MEIO_ABERTO);

    assert.equal(sucesso(d).estado, FECHADO, 'voltou');
  });

  test('CRITÉRIO: falha no meio-aberto reabre imediatamente', () => {
    // Insistir depois de o serviço dizer que ainda não voltou só devolve a
    // lentidão ao cliente.
    let d = { ...novo({ limite: 5, esperaMs: 10_000 }), estado: MEIO_ABERTO };
    d = falha(d, 'timeout', T0);
    assert.equal(d.estado, ABERTO);
    assert.equal(permite(d, T0 + 1), false);
  });

  test('CRITÉRIO: 4xx NÃO conta como falha — o serviço está de pé', () => {
    // "Esse contrato não existe" é resposta correta. Abrir o disjuntor por isso
    // tiraria do ar uma integração saudável.
    assert.equal(contaComoFalha({ status: 404 }), false);
    assert.equal(contaComoFalha({ status: 400 }), false);
    assert.equal(contaComoFalha({ status: 500 }), true);
    assert.equal(contaComoFalha({ status: 503 }), true);
  });

  test('timeout e erro de rede contam', () => {
    assert.equal(contaComoFalha({ name: 'TimeoutError' }), true);
    assert.equal(contaComoFalha({ message: 'fetch failed' }), true);
    assert.equal(contaComoFalha({ message: 'connect ECONNREFUSED' }), true);
    assert.equal(contaComoFalha(null), false);
  });

  test('estado ausente não bloqueia nada', () => {
    assert.equal(permite(null), true);
  });
});
