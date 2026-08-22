/**
 * Criptografia em repouso do `sistema_kv`, ponta a ponta (§117 / FASE 3).
 *
 * Os testes puros provam `cifrar`/`decifrar`/`valorParaGravar` isoladamente.
 * O que eles NÃO provam é a ligação: que o valor gravado pelo PUT chega cifrado
 * ao Postgres e que `integrations.getKV` — o leitor por onde passam SGP,
 * Evolution e Anthropic — devolve o segredo inteiro do outro lado.
 *
 * O desenho é OPORTUNISTA: sem `KV_SECRET` nada é cifrado e nada quebra. Por
 * isso os dois modos são testados; o modo compat é o que roda em produção hoje,
 * e quebrá-lo derrubaria as integrações inteiras.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar } from './_ambiente.js';

const SEGREDO = 'chave-mestre-de-integracao';

describe('sistema_kv cifrado em repouso', { skip: motivoSkip() }, () => {
  let db, valorParaGravar, getKV, invalidateConfigCache, estaCifrado;

  before(async () => {
    db = await prepararBanco();
    ({ valorParaGravar, estaCifrado } = await import('../../src/services/kvSeguro.js'));
    ({ getKV, invalidateConfigCache } = await import('../../src/services/integrations.js'));
  });

  after(async () => {
    delete process.env.KV_SECRET;
    await db.destroy();
  });

  beforeEach(async () => {
    await limpar(db, ['sistema_kv']);
    invalidateConfigCache();          // getKV memoiza por 3 min
    delete process.env.KV_SECRET;
  });

  /** Faz o que o `PUT /sysconfig` faz, sem subir o Express. */
  async function salvarComoOPut(chave, valor) {
    const decisao = valorParaGravar(chave, valor);
    if (!decisao.gravar) return false;
    await db('sistema_kv').insert({ chave, valor: decisao.valor })
      .onConflict('chave').merge(['valor', 'atualizado']);
    invalidateConfigCache();
    return true;
  }

  const cru = async (chave) => (await db('sistema_kv').where({ chave }).first())?.valor;

  test('COM KV_SECRET: o banco guarda ciphertext e getKV devolve o segredo', async () => {
    process.env.KV_SECRET = SEGREDO;
    await salvarComoOPut('sgp_token', 'token-super-secreto-123');

    const noBanco = await cru('sgp_token');
    assert.ok(estaCifrado(noBanco), 'gravou em texto plano mesmo com KV_SECRET');
    assert.ok(!String(noBanco).includes('token-super-secreto-123'), 'o segredo ficou legível no banco');

    assert.equal(await getKV('sgp_token'), 'token-super-secreto-123', 'o leitor não recuperou o segredo');
  });

  test('SEM KV_SECRET: grava em texto plano e segue funcionando (modo compat)', async () => {
    await salvarComoOPut('sgp_token', 'token-plano');
    assert.equal(await cru('sgp_token'), 'token-plano');
    assert.equal(await getKV('sgp_token'), 'token-plano');
  });

  test('credencial cifrada ANTES continua legível depois — ativação é gradual', async () => {
    // Estado real de uma instância que rodou meses sem a env: texto plano no banco.
    await salvarComoOPut('anthropic_api_key', 'sk-ant-antiga');
    // Operador define KV_SECRET e reinicia. O valor antigo NÃO foi migrado.
    process.env.KV_SECRET = SEGREDO;
    invalidateConfigCache();
    assert.equal(await getKV('anthropic_api_key'), 'sk-ant-antiga', 'texto plano antigo parou de ser lido');

    // Ao re-salvar pela tela, passa a ficar cifrado — sem janela de quebra.
    await salvarComoOPut('anthropic_api_key', 'sk-ant-nova');
    assert.ok(estaCifrado(await cru('anthropic_api_key')));
    assert.equal(await getKV('anthropic_api_key'), 'sk-ant-nova');
  });

  test('config comum não é cifrada nem com KV_SECRET', async () => {
    process.env.KV_SECRET = SEGREDO;
    await salvarComoOPut('sgp_url', 'https://sgp.netgo.net.br');
    assert.equal(await cru('sgp_url'), 'https://sgp.netgo.net.br');
    assert.equal(await getKV('sgp_url'), 'https://sgp.netgo.net.br');
  });

  test('salvar a máscara NÃO destrói a credencial guardada', async () => {
    process.env.KV_SECRET = SEGREDO;
    await salvarComoOPut('evolution_key', 'key-real-9876');

    // A tela devolve `••••••••9876` nos campos que o operador não tocou.
    const gravou = await salvarComoOPut('evolution_key', '••••••••9876');
    assert.equal(gravou, false, 'a máscara foi aceita como valor novo');
    assert.equal(await getKV('evolution_key'), 'key-real-9876', 'a credencial real foi destruída ao salvar a tela');
  });
});
