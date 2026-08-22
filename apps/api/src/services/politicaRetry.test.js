import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  expirou, backoffMs, proximaTentativaEm, expiraEm, destinoLease,
  decidirFalhaEnvio,
  TTL_MS, TETO_PARK_MS, MAX_TENTATIVAS,
} from './politicaRetry.js';

const H = 3600_000;
const AGORA = Date.parse('2026-08-22T12:00:00Z');
const atras = (ms) => new Date(AGORA - ms).toISOString();
const adiante = (ms) => new Date(AGORA + ms).toISOString();

describe('expirou — TTL do estado do fluxo', () => {
  test('execução recente vive', () => {
    assert.equal(expirou(atras(30 * 60_000), {}, AGORA), false);
  });

  test('sem _parkedAte, expira em 2h (é o que existia antes da FASE 4)', () => {
    assert.equal(expirou(atras(TTL_MS - 1), {}, AGORA), false);
    assert.equal(expirou(atras(TTL_MS + 1), {}, AGORA), true);
  });

  test('critério de aceite: parada com _parkedAte futuro sobrevive a 4h', () => {
    const estado = { _parkedAte: adiante(2 * H) };
    assert.equal(expirou(atras(4 * H), estado, AGORA), false);
  });

  test('_parkedAte VENCIDO não segura nada — volta a valer o TTL normal', () => {
    const estado = { _parkedAte: atras(1 * H) };
    assert.equal(expirou(atras(3 * H), estado, AGORA), true);
    assert.equal(expirou(atras(1 * H), estado, AGORA), false);
  });

  test('teto duro de 72h vence até _parkedAte futuro (blob imortal)', () => {
    const estado = { _parkedAte: adiante(1000 * H) };
    assert.equal(expirou(atras(TETO_PARK_MS + 1), estado, AGORA), true);
  });

  test('_parkedAte lixo não derruba a leitura', () => {
    assert.equal(expirou(atras(30 * 60_000), { _parkedAte: 'ontem' }, AGORA), false);
    assert.equal(expirou(atras(5 * H), { _parkedAte: 'ontem' }, AGORA), true);
  });

  test('estado nulo cai no TTL normal', () => {
    assert.equal(expirou(atras(5 * H), null, AGORA), true);
  });
});

describe('backoff', () => {
  test('cresce e satura — nunca 0, nunca infinito', () => {
    const seq = [1, 2, 3, 4, 5, 6, 7, 8].map(backoffMs);
    assert.ok(seq[0] > 0);
    for (let i = 1; i < seq.length; i++) assert.ok(seq[i] >= seq[i - 1], `regrediu em ${i}`);
    assert.ok(seq.at(-1) <= 5 * 60_000, 'saturou acima de 5 min');
  });

  test('proximaTentativaEm devolve Date no futuro', () => {
    const d = proximaTentativaEm(1, AGORA);
    assert.ok(d instanceof Date);
    assert.ok(d.getTime() > AGORA);
  });
});

describe('expiraEm — mensagem velha não deve ser entregue', () => {
  test('padrão global de 6h', () => {
    assert.equal(expiraEm('whatsapp', AGORA).getTime(), AGORA + 6 * H);
    assert.equal(expiraEm('telegram', AGORA).getTime(), AGORA + 6 * H);
  });

  test('Meta usa 24h, casando com a janela de sessão dela', () => {
    assert.equal(expiraEm('whatsapp_oficial', AGORA).getTime(), AGORA + 24 * H);
  });
});

describe('destinoLease — leitura retenta, escrita não (§23)', () => {
  test('outbox volta para pendente: reenviar é seguro', () => {
    assert.equal(destinoLease('outbox'), 'pendente');
  });

  test('inbox e jobs vão para falha: reprocessar re-executa o turno do motor', () => {
    assert.equal(destinoLease('inbox'), 'falha');
    assert.equal(destinoLease('jobs'), 'falha');
  });
});

describe('decidirFalhaEnvio', () => {
  const base = { tentativas: 1, expiraEm: adiante(2 * H), agora: AGORA };

  test('falha comum agenda nova tentativa', () => {
    const d = decidirFalhaEnvio(base);
    assert.equal(d.status, 'pendente');
    assert.ok(d.proximaTentativaEm.getTime() > AGORA);
  });

  test('prazo estourado não vira retry — vira expirada', () => {
    const d = decidirFalhaEnvio({ ...base, expiraEm: atras(1) });
    assert.equal(d.status, 'expirada');
  });

  test('tentativas esgotadas vão para a DLQ', () => {
    const d = decidirFalhaEnvio({ ...base, tentativas: MAX_TENTATIVAS });
    assert.equal(d.status, 'falha');
  });

  test('prazo tem precedência sobre backoff que cairia depois dele', () => {
    const d = decidirFalhaEnvio({ ...base, tentativas: 6, expiraEm: adiante(1000) });
    assert.equal(d.status, 'expirada');
  });
});
