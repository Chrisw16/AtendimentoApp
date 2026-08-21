import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { resolverSegredo } from './auth.js';

test('usa JWT_SECRET quando definido', () => {
  const r = resolverSegredo({ JWT_SECRET: 'segredo-real', NODE_ENV: 'production' });
  assert.equal(r.segredo, 'segredo-real');
  assert.equal(r.origem, 'env');
});

test('falha em produção quando JWT_SECRET não está definido', () => {
  // Falha alta e imediata: em produção, secret ausente é erro de configuração.
  assert.throws(() => resolverSegredo({ NODE_ENV: 'production' }), /JWT_SECRET/);
});

test('fora de produção gera segredo aleatório em vez de usar um fixo', () => {
  // O segredo fixo que existia aqui estava versionado no repositório: qualquer
  // um que lesse o código forjava um token de admin. Aleatório por boot elimina
  // isso — o custo é só invalidar sessões no restart.
  const a = resolverSegredo({ NODE_ENV: 'development' });
  const b = resolverSegredo({ NODE_ENV: 'development' });
  assert.equal(a.origem, 'aleatorio');
  assert.notEqual(a.segredo, b.segredo, 'não pode ser um valor fixo');
  assert.ok(a.segredo.length >= 32);
});

test('sem NODE_ENV também gera aleatório (nunca cai num segredo conhecido)', () => {
  const r = resolverSegredo({});
  assert.equal(r.origem, 'aleatorio');
});
