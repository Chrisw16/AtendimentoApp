import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { verificarHandshake } from './metaSeguranca.js';

// A rota GET /api/webhooks/meta é PÚBLICA e devolvia `hub.challenge` cru.
// Com META_VERIFY_TOKEN ausente, `undefined === undefined` casava e a rota
// virava um refletor de HTML na origem do painel (XSS não autenticado).
test('sem segredo configurado, recusa — não vira bypass', () => {
  const r = verificarHandshake({ mode: 'subscribe', token: undefined, challenge: 'x' }, undefined);
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'nao_configurado');
});

test('segredo vazio também recusa (campo em branco não libera)', () => {
  assert.equal(verificarHandshake({ mode: 'subscribe', token: '', challenge: 'x' }, '').ok, false);
});

test('token correto com mode subscribe aceita e devolve o challenge', () => {
  const r = verificarHandshake({ mode: 'subscribe', token: 'segredo', challenge: '12345' }, 'segredo');
  assert.equal(r.ok, true);
  assert.equal(r.challenge, '12345');
});

test('token errado recusa', () => {
  assert.equal(verificarHandshake({ mode: 'subscribe', token: 'errado', challenge: 'x' }, 'segredo').ok, false);
});

test('token de tamanho diferente recusa sem estourar', () => {
  // timingSafeEqual lança se os buffers têm tamanhos diferentes — precisa de guarda.
  assert.doesNotThrow(() => verificarHandshake({ mode: 'subscribe', token: 'a', challenge: 'x' }, 'segredo-bem-maior'));
  assert.equal(verificarHandshake({ mode: 'subscribe', token: 'a', challenge: 'x' }, 'segredo-bem-maior').ok, false);
});

test('mode diferente de subscribe recusa mesmo com token certo', () => {
  assert.equal(verificarHandshake({ mode: 'unsubscribe', token: 'segredo', challenge: 'x' }, 'segredo').ok, false);
});

test('challenge sempre volta como string (nunca objeto/array do query)', () => {
  const r = verificarHandshake({ mode: 'subscribe', token: 's', challenge: ['a', 'b'] }, 's');
  assert.equal(typeof r.challenge, 'string');
});
