/**
 * Os catálogos que o deploy precisa levar sozinho.
 *
 * O defeito que este arquivo trava: filas, categorias, playbooks e perfis foram
 * entregues nas FASES 5 a 9 e **nunca chegaram em produção**, porque o `seed`
 * não roda no deploy — só as migrations. A tela abria vazia e nada acusava.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar } from './_ambiente.js';
import { FILAS, CATEGORIAS_KB, PLAYBOOKS, PERFIS_IA, semearCatalogos } from '../../src/dadosIniciais.js';

const TABELAS = ['playbook_execucoes', 'playbook_etapas', 'playbooks', 'ia_perfis',
  'knowledge_artigos', 'knowledge_categorias', 'conversas', 'filas'];

describe('catálogos iniciais (migration 022)', { skip: motivoSkip() }, () => {
  let db;
  before(async () => { db = await prepararBanco(); });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  test('CRITÉRIO: semear leva os quatro catálogos, com as etapas dos playbooks', async () => {
    const n = await semearCatalogos(db);

    assert.equal((await db('filas')).length, FILAS.length);
    assert.equal((await db('knowledge_categorias')).length, CATEGORIAS_KB.length);
    assert.equal((await db('playbooks')).length, PLAYBOOKS.length);
    assert.equal((await db('ia_perfis')).length, PERFIS_IA.length);
    assert.equal(n.playbooks, PLAYBOOKS.length);

    const etapas = await db('playbook_etapas');
    assert.equal(etapas.length, PLAYBOOKS.reduce((s, p) => s + p.etapas.length, 0));
  });

  test('rodar duas vezes não duplica nada', async () => {
    await semearCatalogos(db);
    await semearCatalogos(db);
    assert.equal((await db('filas')).length, FILAS.length);
    assert.equal((await db('playbooks')).length, PLAYBOOKS.length);
    assert.equal((await db('playbook_etapas')).length, PLAYBOOKS.reduce((s, p) => s + p.etapas.length, 0));
  });

  test('CRITÉRIO: o que o operador editou NÃO é desfeito pelo próximo deploy', async () => {
    await semearCatalogos(db);
    await db('filas').where({ slug: 'suporte' }).update({ nome: 'Suporte N1', sla_critico_min: 5 });

    await semearCatalogos(db);

    const fila = await db('filas').where({ slug: 'suporte' }).first();
    assert.equal(fila.nome, 'Suporte N1');
    assert.equal(fila.sla_critico_min, 5);
  });

  test('playbook removido pelo operador não volta a cada deploy... mas o slug livre é resemeado', async () => {
    // Comportamento honesto do `onConflict ignore`: ele repõe o que não existe.
    // Fica registrado para ninguém se surpreender — remover de vez exige
    // arquivar, não apagar.
    await semearCatalogos(db);
    await db('playbooks').where({ slug: 'suporte_sem_conexao' }).del();
    await semearCatalogos(db);
    assert.ok(await db('playbooks').where({ slug: 'suporte_sem_conexao' }).first());
  });

  test('os playbooks nascem em RASCUNHO — ninguém publica procedimento por deploy', async () => {
    await semearCatalogos(db);
    for (const pb of await db('playbooks')) assert.equal(pb.status, 'rascunho', pb.slug);
  });

  test('os perfis apontam para playbooks que existem', async () => {
    await semearCatalogos(db);
    const slugs = new Set((await db('playbooks')).map(p => p.slug));
    for (const p of await db('ia_perfis')) {
      if (p.playbook_slug) assert.ok(slugs.has(p.playbook_slug), `perfil ${p.slug} → playbook inexistente`);
    }
  });

  test('CRITÉRIO: NÃO semeia artigo de conhecimento — seria informação inventada', async () => {
    await semearCatalogos(db);
    assert.equal((await db('knowledge_artigos')).length, 0,
      'artigo semeado vira "política da casa" que ninguém escreveu');
  });
});
