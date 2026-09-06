/**
 * Provedor e modelo de IA configuráveis — o que só o banco prova.
 *
 * A precedência (prompt → global → padrão) é pura e está em `llmHelpers.test.js`.
 * Aqui: a migration 031 anula o par que o seed gravou (senão o global nunca é
 * alcançado), tira o default das colunas, e sobe a temperatura do `roteador`;
 * e `llm/index.js:resolver()` lê o global do `sistema_kv` de verdade.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco } from './_ambiente.js';

describe('IA — provedor e modelo globais', { skip: motivoSkip() }, () => {
  let db;

  before(async () => {
    db = await prepararBanco();
    // Reproduz o deploy: o seed da 005 (idempotente) e a 031 duas vezes.
    const p005 = await import('../../src/migrations/versions/005_prompts_ia.js');
    const p031 = await import('../../src/migrations/versions/031_ia_provedor_global.js');
    const log = console.log; console.log = () => {};
    try { await p005.up(db); await p031.up(db); await p031.up(db); } finally { console.log = log; }
  });
  after(async () => {
    await db('sistema_kv').whereIn('chave', ['ia_provedor', 'ia_modelo']).del().catch(() => {});
    await db?.destroy?.();
  });

  test('o par gravado pelo seed virou NULL — o prompt HERDA', async () => {
    const rows = await db('prompts_ia').select('slug', 'provedor', 'modelo');
    assert.ok(rows.length >= 8);
    for (const r of rows) {
      assert.equal(r.provedor, null, `${r.slug} ainda tem provedor cravado`);
      assert.equal(r.modelo, null, `${r.slug} ainda tem modelo cravado`);
    }
  });

  test('linha NOVA nasce herdando — o default da coluna saiu', async () => {
    await db('prompts_ia').insert({ slug: 'zz_teste', nome: 'T', conteudo: 'x', padrao: 'x' });
    try {
      const r = await db('prompts_ia').where({ slug: 'zz_teste' }).first();
      assert.equal(r.provedor, null);
      assert.equal(r.modelo, null);
    } finally { await db('prompts_ia').where({ slug: 'zz_teste' }).del(); }
  });

  test('roteador subiu para 0.40 — e uma segunda rodada não mexe mais', async () => {
    const r = await db('prompts_ia').where({ slug: 'roteador' }).first();
    assert.equal(Number(r.temperatura), 0.4);
  });

  test('resolverPrompt devolve provedor/modelo VAZIOS para prompt que herda', async () => {
    const { resolverPrompt, invalidarCachePrompts } = await import('../../src/services/promptService.js');
    invalidarCachePrompts();
    const r = await resolverPrompt('suporte');
    assert.equal(r.provedor, '');
    assert.equal(r.modelo, '');
  });

  test('sem global configurado, resolver() cai no padrão do código', async () => {
    const { resolver } = await import('../../src/services/llm/index.js');
    const { invalidateConfigCache } = await import('../../src/services/integrations.js');
    await db('sistema_kv').whereIn('chave', ['ia_provedor', 'ia_modelo']).del();
    invalidateConfigCache();
    assert.deepEqual(await resolver({}), { provedor: 'anthropic', modelo: 'claude-haiku-4-5-20251001', origem: 'padrao' });
  });

  test('o global de Configurações É alcançado pelos prompts que herdam', async () => {
    // Era isto que o par gravado pelo seed impedia.
    const { resolver } = await import('../../src/services/llm/index.js');
    const { invalidateConfigCache } = await import('../../src/services/integrations.js');
    await db('sistema_kv').insert({ chave: 'ia_provedor', valor: JSON.stringify('deepseek') }).onConflict('chave').merge();
    await db('sistema_kv').insert({ chave: 'ia_modelo',   valor: JSON.stringify('deepseek-chat') }).onConflict('chave').merge();
    invalidateConfigCache();
    const { resolverPrompt, invalidarCachePrompts } = await import('../../src/services/promptService.js');
    invalidarCachePrompts();
    const p = await resolverPrompt('suporte');
    assert.deepEqual(await resolver({ provedor: p.provedor, modelo: p.modelo }), { provedor: 'deepseek', modelo: 'deepseek-chat', origem: 'global' });
  });

  test('prompt com par próprio VENCE o global', async () => {
    const { resolver } = await import('../../src/services/llm/index.js');
    assert.deepEqual(await resolver({ provedor: 'openai', modelo: 'gpt-x' }), { provedor: 'openai', modelo: 'gpt-x', origem: 'prompt' });
  });

  test('sem chave do provedor escolhido, gerar() falha HONESTAMENTE e nomeia o provedor', async () => {
    const { gerar } = await import('../../src/services/llm/index.js');
    await assert.rejects(
      () => gerar({ messages: [{ role: 'user', content: 'oi' }], provedor: 'deepseek', modelo: 'deepseek-chat' }, { sandbox: true }),
      (e) => e.name === 'LLMError' && /DeepSeek/.test(e.message) && /Configurações/.test(e.message),
    );
  });
});
