import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { pode, capacidadesDe, CAPACIDADES } from './permissoes.js';

const agente = (permissoes) => ({ role: 'agente', permissoes });

describe('pode', () => {
  test('CRITÉRIO: agente já cadastrado (sem permissões) NÃO perde o que fazia', () => {
    for (const cap of ['cliente360', 'financeiro', 'diagnostico', 'acoes']) {
      assert.equal(pode(agente({}), cap), true, cap);
      assert.equal(pode(agente(undefined), cap), true, `${cap} com permissoes nulo`);
    }
  });

  test('CRITÉRIO: ver_dados_completos é negada por omissão (dívida da FASE 3)', () => {
    assert.equal(pode(agente({}), 'ver_dados_completos'), false);
    assert.equal(pode(agente({ ver_dados_completos: true }), 'ver_dados_completos'), true);
  });

  test('desmarcar explicitamente bloqueia', () => {
    assert.equal(pode(agente({ financeiro: false }), 'financeiro'), false);
    assert.equal(pode(agente({ financeiro: false }), 'diagnostico'), true, 'uma não derruba a outra');
  });

  test('admin passa em tudo — inclusive no que é negado por omissão', () => {
    const adm = { role: 'admin', permissoes: { ver_dados_completos: false, financeiro: false } };
    assert.equal(pode(adm, 'ver_dados_completos'), true);
    assert.equal(pode(adm, 'financeiro'), true);
  });

  test('capacidade desconhecida NEGA — typo tem que fechar a porta', () => {
    assert.equal(pode(agente({ finaceiro: true }), 'finaceiro'), false);
    assert.equal(pode(agente({}), 'apagar_tudo'), false);
  });

  test('sem agente, nada', () => {
    assert.equal(pode(null, 'cliente360'), false);
  });

  test('valor "falsy que não é false" segue a intenção do admin', () => {
    assert.equal(pode(agente({ acoes: 0 }), 'acoes'), false, '0 é uma escolha, não omissão');
    assert.equal(pode(agente({ acoes: null }), 'acoes'), true, 'null é omissão');
  });
});

describe('capacidadesDe', () => {
  test('devolve todas as chaves conhecidas', () => {
    const c = capacidadesDe(agente({}));
    assert.deepEqual(Object.keys(c).sort(), Object.keys(CAPACIDADES).sort());
    assert.equal(c.ver_dados_completos, false);
    assert.equal(c.cliente360, true);
  });

  test('para admin, tudo true', () => {
    assert.ok(Object.values(capacidadesDe({ role: 'admin' })).every(Boolean));
  });
});
