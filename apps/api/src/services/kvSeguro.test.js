import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrar, decifrar, estaCifrado } from './kvSeguro.js';

const SEGREDO = 'chave-mestre-de-teste';

test('roundtrip: cifra e decifra de volta ao original', () => {
  const cifrado = cifrar('sk-ant-api-key-secreta', SEGREDO);
  assert.ok(estaCifrado(cifrado));
  assert.notEqual(cifrado, 'sk-ant-api-key-secreta');
  assert.equal(decifrar(cifrado, SEGREDO), 'sk-ant-api-key-secreta');
});

test('duas cifras do mesmo valor são diferentes (IV aleatório)', () => {
  assert.notEqual(cifrar('x', SEGREDO), cifrar('x', SEGREDO));
});

test('sem segredo, cifrar é no-op (modo compat — nada quebra sem a env)', () => {
  assert.equal(cifrar('texto-plano', undefined), 'texto-plano');
});

test('texto plano passa direto pela decifra (valores antigos seguem legíveis)', () => {
  assert.equal(decifrar('texto-plano-antigo', SEGREDO), 'texto-plano-antigo');
});

test('valor cifrado sem KV_SECRET no ambiente lança com instrução', () => {
  const cifrado = cifrar('segredo', SEGREDO);
  assert.throws(() => decifrar(cifrado, undefined), /KV_SECRET/);
});

test('segredo errado lança, não devolve lixo (tag do GCM)', () => {
  const cifrado = cifrar('segredo', SEGREDO);
  assert.throws(() => decifrar(cifrado, 'outra-chave'), /Re-salve/);
});

test('valor adulterado no banco lança, não vira credencial corrompida', () => {
  const cifrado = cifrar('segredo', SEGREDO);
  const mexido = cifrado.slice(0, -4) + (cifrado.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  assert.throws(() => decifrar(mexido, SEGREDO));
});

test('unicode e JSON sobrevivem ao roundtrip', () => {
  const v = JSON.stringify({ senha: 'çãé🔑', nested: { a: 1 } });
  assert.equal(decifrar(cifrar(v, SEGREDO), SEGREDO), v);
});
