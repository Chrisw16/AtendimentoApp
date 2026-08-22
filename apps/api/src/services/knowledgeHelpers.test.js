import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  podeTransicionar, erroTransicao, versionaAoEntrar,
  estaVencido, visivelParaIA, trechoParaIA, STATUS,
} from './knowledgeHelpers.js';

// A normalização de pergunta NÃO está aqui de propósito: é feita pelo Postgres
// (`knowledge_norm` + stemmer português), para ser idêntica à da busca. Ela é
// testada em `tests/integracao/fase7-knowledge.test.js`.

describe('workflow editorial (§52)', () => {
  test('o caminho feliz completo', () => {
    assert.ok(podeTransicionar('rascunho', 'revisao'));
    assert.ok(podeTransicionar('revisao', 'publicado'));
    assert.ok(podeTransicionar('publicado', 'arquivado'));
  });

  test('CRITÉRIO: rascunho NÃO vai direto para publicado', () => {
    assert.equal(podeTransicionar('rascunho', 'publicado'), false);
    assert.match(erroTransicao('rascunho', 'publicado'), /revisão/);
  });

  test('devolver para correção é permitido nos dois sentidos', () => {
    assert.ok(podeTransicionar('revisao', 'rascunho'));
    assert.ok(podeTransicionar('publicado', 'revisao'), 'corrigir algo no ar é ato editorial');
  });

  test('arquivado volta para rascunho, nunca direto ao ar', () => {
    assert.ok(podeTransicionar('arquivado', 'rascunho'));
    assert.equal(podeTransicionar('arquivado', 'publicado'), false);
  });

  test('status inexistente é recusado dos dois lados', () => {
    assert.equal(podeTransicionar('rascunho', 'deletado'), false);
    assert.equal(podeTransicionar('inventado', 'revisao'), false);
    assert.match(erroTransicao('rascunho', 'deletado'), /inválido/);
  });

  test('ficar no mesmo status não é transição', () => {
    for (const s of STATUS) assert.equal(podeTransicionar(s, s), false, s);
  });

  test('só publicar cria versão', () => {
    assert.equal(versionaAoEntrar('publicado'), true);
    assert.equal(versionaAoEntrar('revisao'), false);
    assert.equal(versionaAoEntrar('arquivado'), false);
  });
});

describe('validade e visibilidade', () => {
  const agora = Date.parse('2026-08-22T12:00:00Z');

  test('sem data de validade, nunca vence', () => {
    assert.equal(estaVencido(null, agora), false);
    assert.equal(estaVencido('', agora), false);
  });

  test('vence depois da data, não antes', () => {
    assert.equal(estaVencido('2026-08-21', agora), true);
    assert.equal(estaVencido('2026-12-31', agora), false);
  });

  test('data inválida não marca vencido (não se inventa problema)', () => {
    assert.equal(estaVencido('não é data', agora), false);
  });

  test('CRITÉRIO: só publicado chega na IA', () => {
    assert.equal(visivelParaIA({ status: 'publicado' }), true);
    for (const s of ['rascunho', 'revisao', 'arquivado']) {
      assert.equal(visivelParaIA({ status: s }), false, s);
    }
    assert.equal(visivelParaIA(null), false);
  });
});

describe('trechoParaIA', () => {
  test('texto curto passa inteiro, sem reticências', () => {
    const t = trechoParaIA({ conteudo: 'Resposta curta.' });
    assert.equal(t, 'Resposta curta.');
    assert.ok(!t.includes('[…]'));
  });

  test('o resumo vem antes do conteúdo', () => {
    assert.match(trechoParaIA({ resumo: 'PRIMEIRO', conteudo: 'depois' }), /^PRIMEIRO/);
  });

  test('corta em parágrafo inteiro, não no meio da frase', () => {
    const artigo = { conteudo: ['A'.repeat(300), 'B'.repeat(300), 'C'.repeat(300)].join('\n\n') };
    const t = trechoParaIA(artigo, 700);
    assert.ok(t.length <= 720, t.length);
    assert.ok(!t.includes('C'.repeat(10)), 'o terceiro parágrafo não cabia e não entrou pela metade');
    assert.ok(t.endsWith('[…]'));
  });

  test('parágrafo único gigante corta na palavra', () => {
    const t = trechoParaIA({ conteudo: 'palavra '.repeat(500) }, 100);
    assert.ok(t.length <= 120);
    assert.ok(!/palav\s*\[/.test(t), 'não corta no meio da palavra');
  });

  test('artigo vazio não estoura', () => {
    assert.equal(trechoParaIA({}), '');
    assert.equal(trechoParaIA(null), '');
  });
});
