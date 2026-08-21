import { test } from 'node:test';
import assert    from 'node:assert/strict';

// Importa com REDIS_URL apagado: initRedis() roda no import e deve sair na hora.
delete process.env.REDIS_URL;
const { ehEcoProprio } = await import('./sseManager.js');

test('ignora o eco da própria instância (evita entrega duplicada)', () => {
  // broadcast() já entregou local ANTES de publicar; se aceitasse o próprio
  // eco de volta do Redis, o agente veria cada mensagem duas vezes.
  assert.equal(ehEcoProprio({ origem: 'inst-A', event: 'mensagem' }, 'inst-A'), true);
});

test('entrega mensagem vinda de outra instância', () => {
  assert.equal(ehEcoProprio({ origem: 'inst-B', event: 'mensagem' }, 'inst-A'), false);
});

test('entrega payload sem origem (instância antiga durante deploy gradual)', () => {
  // Fail-open: na dúvida entrega, porque perder mensagem é pior que duplicar.
  assert.equal(ehEcoProprio({ event: 'mensagem' }, 'inst-A'), false);
});
