import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termosBusca, estaIdentificado } from './clientesHelpers.js';

test('termo curto não é busca — é o agente ainda digitando', () => {
  assert.deepEqual(termosBusca('a'),  { texto: null, digitos: null });
  assert.deepEqual(termosBusca(''),   { texto: null, digitos: null });
  assert.deepEqual(termosBusca(null), { texto: null, digitos: null });
  assert.deepEqual(termosBusca('  '), { texto: null, digitos: null });
});

test('nome vira busca por texto, sem dígitos', () => {
  assert.deepEqual(termosBusca('joão'), { texto: 'joão', digitos: null });
});

test('telefone digitado com máscara vira dígitos limpos', () => {
  assert.equal(termosBusca('(84) 99988-7766').digitos, '84999887766');
});

test('CPF pontuado vira dígitos limpos — o SGP grava do jeito dele', () => {
  assert.equal(termosBusca('123.456.789-00').digitos, '12345678900');
});

test('menos de 4 dígitos NÃO vira busca numérica (casaria meia base)', () => {
  assert.equal(termosBusca('123').digitos, null);
  assert.equal(termosBusca('1234').digitos, '1234');
});

test('metacaractere de LIKE é escapado — senão "%" devolve a base inteira', () => {
  assert.equal(termosBusca('50%').texto, '50\\%');
  assert.equal(termosBusca('a_b').texto, 'a\\_b');
  assert.equal(termosBusca('a\\b').texto, 'a\\\\b');
});

test('identificado é ter vínculo com o SGP, não ter nome', () => {
  assert.equal(estaIdentificado({ nome: 'Maria' }), false, 'nome dito no "oi" não identifica ninguém');
  assert.equal(estaIdentificado({ cpf: '12345678900' }), true);
  assert.equal(estaIdentificado({ contrato_id: '4321' }), true);
  assert.equal(estaIdentificado({}), false);
  assert.equal(estaIdentificado(null), false);
});
