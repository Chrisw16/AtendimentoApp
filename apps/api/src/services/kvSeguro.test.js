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

// ── CHAVES SECRETAS, MÁSCARA NO GET E FORMATO DE GRAVAÇÃO ────────
import { ehSecreta, mascararConfig, valorParaGravar } from './kvSeguro.js';

test('ehSecreta separa credencial de configuração comum', () => {
  assert.ok(ehSecreta('anthropic_api_key'));
  assert.ok(ehSecreta('sgpdb_password'));
  assert.ok(ehSecreta('telegram_bot_token'));
  // URL/usuário/nome não são segredo — mascarar isso só atrapalharia o operador
  assert.ok(!ehSecreta('sgp_url'));
  assert.ok(!ehSecreta('sgpdb_user'));
  assert.ok(!ehSecreta('nome_empresa'));
});

test('mascararConfig esconde só as credenciais e preserva o resto', () => {
  const saida = mascararConfig({
    sgp_url:           'https://sgp.netgo.net.br',
    anthropic_api_key: 'sk-ant-abcdefghijk9876',
    horario:           { inicio: '08:00' },
  });
  assert.equal(saida.sgp_url, 'https://sgp.netgo.net.br', 'config comum não pode ser mascarada');
  assert.deepEqual(saida.horario, { inicio: '08:00' }, 'objeto não-secreto passa intacto');
  assert.ok(!saida.anthropic_api_key.includes('abcdefghijk'), 'a chave vazou no GET');
  assert.match(saida.anthropic_api_key, /9876$/, 'últimos 4 ajudam o operador a reconhecer qual chave é');
});

test('credencial vazia não vira máscara (senão a tela mostra segredo onde não há)', () => {
  assert.equal(mascararConfig({ sgp_token: '' }).sgp_token, '');
});

test('PUT ignora a máscara devolvida pela tela — salvar não destrói o segredo', () => {
  assert.equal(valorParaGravar('anthropic_api_key', '••••••••9876').gravar, false);
});

test('PUT com valor novo de verdade grava', () => {
  assert.equal(valorParaGravar('anthropic_api_key', 'sk-ant-nova', undefined).gravar, true);
});

test('sem KV_SECRET a credencial grava como sempre foi (compat, sem migração)', () => {
  const { valor } = valorParaGravar('sgp_token', 'tok-123', undefined);
  assert.equal(valor, JSON.stringify('tok-123'));
  assert.ok(!valor.includes('enc:v1:'));
});

test('com KV_SECRET a credencial grava CIFRADA — e volta inteira na leitura', () => {
  const { valor } = valorParaGravar('sgp_token', 'tok-123', SEGREDO);
  // jsonb: o que vai pro banco precisa ser JSON VÁLIDO. `enc:v1:...` cru não é.
  const comoOPgDevolve = JSON.parse(valor);
  assert.ok(estaCifrado(comoOPgDevolve), 'não cifrou');
  assert.ok(!valor.includes('tok-123'), 'o segredo ficou legível no banco');
  assert.equal(lerValorKV(comoOPgDevolve, 'sgp_token', SEGREDO), 'tok-123');
});

test('config comum NÃO é cifrada mesmo com KV_SECRET (o GET agregado precisa dela)', () => {
  const { valor } = valorParaGravar('sgp_url', 'https://sgp.x', SEGREDO);
  assert.equal(lerValorKV(JSON.parse(valor), 'sgp_url'), 'https://sgp.x');
  assert.ok(!valor.includes('enc:v1:'));
});

test('objeto de configuração sobrevive ao roundtrip de gravação', () => {
  const { valor } = valorParaGravar('horario', { inicio: '08:00', fim: '18:00' }, SEGREDO);
  assert.deepEqual(lerValorKV(JSON.parse(valor), 'horario'), { inicio: '08:00', fim: '18:00' });
});
