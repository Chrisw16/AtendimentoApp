/**
 * A carga inicial da base de conhecimento (migration 024).
 *
 * O que este arquivo protege é sobretudo uma regra de SEGURANÇA: só chega na
 * IA o que está `publicado`, e vários itens desta carga são esqueletos com
 * perguntas a responder. Se um deles fosse publicado, a IA responderia ao
 * cliente com "Existe fidelidade? Qual o período?" como se fosse a política.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar } from './_ambiente.js';
import { CATEGORIAS, ARTIGOS, semearConhecimento } from '../../src/conhecimentoInicial.js';

const TABELAS = ['knowledge_uso', 'knowledge_feedback', 'knowledge_versoes',
  'knowledge_artigos', 'knowledge_categorias'];

describe('carga inicial de conhecimento (migration 024)', { skip: motivoSkip() }, () => {
  let db, kb;
  before(async () => { db = await prepararBanco(); kb = await import('../../src/services/knowledge.js'); });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  test('semeia as categorias e todos os artigos', async () => {
    const n = await semearConhecimento(db);
    assert.equal((await db('knowledge_categorias')).length, CATEGORIAS.length);
    assert.equal((await db('knowledge_artigos')).length, ARTIGOS.length);
    assert.equal(n.artigos, ARTIGOS.length);
  });

  test('CRITÉRIO: todo ESQUELETO fica em rascunho — fora do alcance da IA', async () => {
    await semearConhecimento(db);
    for (const a of ARTIGOS.filter(x => x.rascunho)) {
      const linha = await db('knowledge_artigos').where({ slug: a.slug }).first();
      assert.equal(linha.status, 'rascunho', `${a.slug} não pode estar publicado`);
      assert.match(linha.conteudo, /PREENCHER COM AS REGRAS OFICIAIS/, `${a.slug} sem o aviso`);
    }
  });

  test('CRITÉRIO: buscar na base NUNCA devolve um esqueleto', async () => {
    await semearConhecimento(db);
    for (const termo of ['fidelidade', 'cancelamento', 'visita técnica', 'instalação', 'LEDs do equipamento']) {
      for (const achado of await kb.buscar(termo, { limite: 5 })) {
        assert.ok(!/PREENCHER COM AS REGRAS OFICIAIS/.test(achado.conteudo || ''),
          `a busca por "${termo}" devolveu um esqueleto: ${achado.slug}`);
      }
    }
  });

  test('o conteúdo completo está publicado e é encontrável', async () => {
    await semearConhecimento(db);
    // Cada um destes é uma pergunta que um cliente faz de verdade.
    const casos = [
      ['los vermelho', 'o-que-significa-los-vermelho'],
      ['diferenca entre 2.4 e 5 ghz', 'wifi-2-4-ghz-x-5-ghz'],
      ['onde colocar o roteador', 'onde-posicionar-o-roteador'],
      ['o que e cgnat', 'o-que-e-cgnat'],
      ['cliente disse que ta caro', 'objecao-esta-caro'],
      ['segunda via boleto', 'faq-segunda-via-de-boleto'],
    ];
    for (const [pergunta, slug] of casos) {
      const r = await kb.buscar(pergunta, { limite: 5 });
      assert.ok(r.some(a => a.slug === slug), `"${pergunta}" não achou ${slug} (achou: ${r.map(x => x.slug).join(', ') || 'nada'})`);
    }
  });

  test('rodar duas vezes não duplica', async () => {
    await semearConhecimento(db);
    await semearConhecimento(db);
    assert.equal((await db('knowledge_artigos')).length, ARTIGOS.length);
    assert.equal((await db('knowledge_categorias')).length, CATEGORIAS.length);
  });

  test('CRITÉRIO: o que o operador editar NÃO é desfeito pelo próximo deploy', async () => {
    await semearConhecimento(db);
    await db('knowledge_artigos').where({ slug: 'politica-de-fidelidade' })
      .update({ conteudo: 'Fidelidade de 12 meses em todos os planos.', status: 'publicado' });

    await semearConhecimento(db);

    const a = await db('knowledge_artigos').where({ slug: 'politica-de-fidelidade' }).first();
    assert.equal(a.conteudo, 'Fidelidade de 12 meses em todos os planos.');
    assert.equal(a.status, 'publicado');
  });

  test('todo artigo cai numa categoria que existe', async () => {
    await semearConhecimento(db);
    const semCategoria = await db('knowledge_artigos').whereNull('categoria_id');
    assert.deepEqual(semCategoria.map(a => a.slug), []);
  });

  test('os tipos usados são os que o backend aceita', async () => {
    const TIPOS = ['artigo', 'faq', 'manual', 'politica', 'argumentacao', 'documento', 'procedimento'];
    for (const a of ARTIGOS) assert.ok(TIPOS.includes(a.tipo), `${a.slug}: tipo inválido "${a.tipo}"`);
  });
});
