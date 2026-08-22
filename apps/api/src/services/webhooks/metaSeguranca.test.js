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

// ── verificarAssinaturaMeta (§122) ───────────────────────────────────────────
import { createHmac } from 'node:crypto';
import { verificarAssinaturaMeta } from './metaSeguranca.js';

const CORPO = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
const SECRET = 'app-secret-de-teste';
const assinar = (buf, secret) => 'sha256=' + createHmac('sha256', secret).update(buf).digest('hex');

test('assinatura correta sobre o corpo cru passa', () => {
  const r = verificarAssinaturaMeta(CORPO, assinar(CORPO, SECRET), SECRET);
  assert.equal(r.ok, true);
});

test('assinatura de outro secret é recusada', () => {
  const r = verificarAssinaturaMeta(CORPO, assinar(CORPO, 'outro'), SECRET);
  assert.deepEqual(r, { ok: false, motivo: 'assinatura_invalida' });
});

test('corpo adulterado depois de assinado é recusado', () => {
  const adulterado = Buffer.from(CORPO.toString().replace('[]', '[{}]'));
  const r = verificarAssinaturaMeta(adulterado, assinar(CORPO, SECRET), SECRET);
  assert.equal(r.ok, false);
});

test('sem header de assinatura, com secret configurado: recusa', () => {
  const r = verificarAssinaturaMeta(CORPO, undefined, SECRET);
  assert.deepEqual(r, { ok: false, motivo: 'sem_assinatura' });
});

test('sem META_APP_SECRET: aceita em modo compat, sinalizando', () => {
  // Endurecer sem a env viraria outage do canal no deploy — a rota avisa no log.
  const r = verificarAssinaturaMeta(CORPO, 'sha256=qualquer', undefined);
  assert.deepEqual(r, { ok: true, motivo: 'nao_configurado' });
});

test('assinatura de tamanho diferente não estoura (comparaSegura)', () => {
  const r = verificarAssinaturaMeta(CORPO, 'sha256=curta', SECRET);
  assert.equal(r.ok, false);
});
