/**
 * SSE sobre Redis pub/sub — contra um Redis real.
 *
 * Duas apostas registradas na ERS §8.2 vivem aqui:
 *
 * 1. A migração de `redis` → `ioredis` nunca foi exercitada com um Redis de
 *    verdade. Enquanto o import errado existia, `initRedis` sempre falhava, o
 *    SSE caía em modo local em silêncio e o broadcast NUNCA cruzava instâncias.
 *    Ninguém percebeu porque só há um processo em produção.
 *
 * 2. `ehEcoProprio`. Como `broadcast()` entrega local E publica, o subscriber
 *    do mesmo processo recebe o próprio anúncio de volta — toda mensagem
 *    apareceria DUAS vezes na tela do agente. Há teste unitário da função pura;
 *    não havia prova de que o caminho real do Redis a respeita.
 *
 * Duas "instâncias" no mesmo processo: o ESM cacheia módulo por especificador,
 * então `?instancia=B` devolve um módulo independente, com outro INSTANCIA_ID e
 * outras conexões — que é exatamente o que dois containers seriam.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

const URL_REDIS = process.env.REDIS_URL_TEST || null;
const skip = URL_REDIS ? false : 'sem REDIS_URL_TEST — teste de integração pulado';

/** `res` de mentira: guarda o que o SSE escreveria no socket do agente. */
function clienteFalso() {
  const recebidos = [];
  return {
    recebidos,
    write: (msg) => recebidos.push(msg),
    eventos: () => recebidos.map(m => m.match(/^event: (.+)$/m)?.[1]),
  };
}

/** Espera até `cond()` virar verdade — evita depender do tempo de propagação. */
async function ateQue(cond, { limiteMs = 3000, passoMs = 25 } = {}) {
  const fim = Date.now() + limiteMs;
  while (Date.now() < fim) {
    if (cond()) return true;
    await new Promise(r => setTimeout(r, passoMs));
  }
  return false;
}

describe('SSE cruzando instâncias via Redis', { skip }, () => {
  let A, B;

  before(async () => {
    process.env.REDIS_URL = URL_REDIS;
    // Duas instâncias independentes do módulo — ver cabeçalho.
    A = await import('../../src/services/sseManager.js?instancia=A');
    B = await import('../../src/services/sseManager.js?instancia=B');
    // initRedis() é disparado no import e não expõe prontidão; a espera real
    // acontece dentro de cada teste, via ateQue().
    await new Promise(r => setTimeout(r, 400));
  });

  after(async () => {
    await Promise.all([A?.closeRedis?.(), B?.closeRedis?.()]);
  });

  test('broadcast da instância A chega no agente conectado na instância B', async () => {
    const naB = clienteFalso();
    B.addClient('agente-1', naB);

    await A.broadcast('mensagem_nova', { conversa_id: 'c-1', texto: 'oi' });

    const chegou = await ateQue(() => naB.recebidos.length > 0);
    assert.ok(chegou, 'o evento publicado por A nunca chegou em B — pub/sub não está cruzando');
    assert.deepEqual(naB.eventos(), ['mensagem_nova']);

    B.removeClient('agente-1', naB);
  });

  test('quem publica NÃO entrega duas vezes ao próprio cliente (ehEcoProprio)', async () => {
    const naA = clienteFalso();
    A.addClient('agente-2', naA);

    await A.broadcast('mensagem_nova', { conversa_id: 'c-2', texto: 'eco?' });

    // Entrega local é síncrona; o eco do Redis, se vier, vem depois. Espera a
    // janela inteira de propagação antes de contar — senão o teste passaria
    // por chegar cedo demais, não por estar correto.
    await new Promise(r => setTimeout(r, 600));
    assert.equal(naA.recebidos.length, 1, 'a instância que publicou entregou o próprio eco de volta');

    A.removeClient('agente-2', naA);
  });

  test('sendToAgente cruza instâncias e respeita o destinatário', async () => {
    const destinatario = clienteFalso();
    const outro        = clienteFalso();
    B.addClient('agente-alvo', destinatario);
    B.addClient('agente-outro', outro);

    await A.sendToAgente('agente-alvo', 'conversa_atribuida', { conversa_id: 'c-3' });

    const chegou = await ateQue(() => destinatario.recebidos.length > 0);
    assert.ok(chegou, 'o evento direcionado não cruzou para B');
    assert.equal(outro.recebidos.length, 0, 'entregue a um agente que não era o destino');

    B.removeClient('agente-alvo', destinatario);
    B.removeClient('agente-outro', outro);
  });
});
