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

// ── lerValorKV / mascarar / ehMascara ────────────────────────────────────────
import { lerValorKV, mascarar, ehMascara } from './kvSeguro.js';

test('lerValorKV: decifra ANTES de parsear — ciphertext nunca vira "o valor"', () => {
  process.env.KV_SECRET = SEGREDO;
  try {
    const noBanco = cifrar(JSON.stringify('token-sgp-real'), SEGREDO);
    assert.equal(lerValorKV(noBanco, 'sgp_token'), 'token-sgp-real');
  } finally { delete process.env.KV_SECRET; }
});

test('lerValorKV: texto plano antigo (JSON e cru) segue legível', () => {
  assert.equal(lerValorKV('"valor-json"'), 'valor-json');
  assert.equal(lerValorKV('cru-sem-aspas'), 'cru-sem-aspas');
  assert.deepEqual(lerValorKV('{"a":1}'), { a: 1 });
  assert.deepEqual(lerValorKV({ ja: 'objeto' }), { ja: 'objeto' });   // jsonb
});

test('lerValorKV: cifrado sem KV_SECRET lança nomeando a chave', () => {
  const noBanco = cifrar(JSON.stringify('x'), SEGREDO);
  assert.throws(() => lerValorKV(noBanco, 'anthropic_api_key'), /anthropic_api_key/);
});

test('mascarar: nunca devolve o valor, sempre contém •', () => {
  assert.equal(mascarar('sk-ant-1234567890abcdef'), '••••••••cdef');
  assert.equal(mascarar('curto'), '••••••••');
  assert.equal(mascarar(''), '');
  assert.ok(ehMascara(mascarar('qualquer-segredo')));
});

test('ehMascara: pega máscara intacta E editada pela metade', () => {
  assert.ok(ehMascara('••••••••1234'));
  assert.ok(ehMascara('••••colou-no-meio••1234'));
  assert.ok(!ehMascara('sk-ant-nova-chave-real'));
  assert.ok(!ehMascara(''));
});
