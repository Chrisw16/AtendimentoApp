import { test } from 'node:test';
import assert from 'node:assert/strict';
import { novoId, guardar, ler, _tamanho } from './sessaoTeste.js';

const H = 3600_000;

test('guarda e lê o estado pelo id', () => {
  const id = novoId();
  guardar(id, { noAtual: 'x' });
  assert.deepEqual(ler(id), { noAtual: 'x' });
});

test('id desconhecido devolve null — nunca o estado de outra sessão', () => {
  assert.equal(ler('nao-existe'), null);
});

test('sessão expira em 2 h, como o estado do fluxo', () => {
  const id = novoId();
  guardar(id, { noAtual: 'x' }, 0);
  assert.notEqual(ler(id, 2 * H - 1), null);
  assert.equal(ler(id, 2 * H + 1), null);
});

test('guardar null encerra a sessão e some com o estado', () => {
  const id = novoId();
  guardar(id, { noAtual: 'x' });
  guardar(id, null);
  assert.equal(ler(id), null);
});

test('escrever purga as sessões vencidas — o link é público, não pode virar depósito de ficha', () => {
  const velha = novoId();
  guardar(velha, { cliente: { cpf: '1' } }, 0);
  const antes = _tamanho();
  guardar(novoId(), { noAtual: 'y' }, 3 * H);
  assert.ok(_tamanho() < antes + 1, 'a velha tinha que ter saído junto');
  assert.equal(ler(velha, 3 * H), null);
});

test('ids não colidem', () => {
  const ids = new Set(Array.from({ length: 500 }, novoId));
  assert.equal(ids.size, 500);
});
