/**
 * O time financeiro chegou de verdade ao banco?
 *
 * Esta pergunta tem uma história: filas (FASE 5), categorias de conhecimento
 * (FASE 7), playbooks (FASE 8) e perfis de IA (FASE 9) foram entregues e
 * **nunca existiram em produção** — o `seed` não roda no deploy, as telas
 * abriam vazias, e nada acusava. Catálogo entregue sem teste que prove a
 * chegada é catálogo que pode não existir.
 *
 * As decisões puras (playbook, perfil, critérios) não se repetem aqui.
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco } from './_ambiente.js';

describe('FINANCEIRO — os catálogos chegam ao banco', { skip: motivoSkip() }, () => {
  let db;

  before(async () => {
    db = await prepararBanco();
    // Os arquivos deste diretório compartilham um banco e TRUNCAM tabelas; as
    // migrations não re-semeiam (o rastreamento é por nome de arquivo). Então
    // reproduzimos o deploy aqui: as três semeaduras são idempotentes, e é
    // justamente essa idempotência que interessa provar.
    const { semearCatalogos } = await import('../../src/dadosIniciais.js');
    const prompts = await import('../../src/migrations/versions/005_prompts_ia.js');
    const fin     = await import('../../src/migrations/versions/029_catalogos_financeiro.js');
    const scs     = await import('../../src/migrations/versions/030_scorecards_faltantes.js');
    const log = console.log; console.log = () => {};
    try {
      await semearCatalogos(db);
      await prompts.up(db);
      await fin.up(db);
      await fin.up(db);            // duas vezes: semear de novo não duplica
      await scs.up(db);
      await scs.up(db);
    } finally { console.log = log; }
  });
  after(async () => { await db?.destroy?.(); });

  test('o perfil financeiro existe e aponta para o prompt e o playbook certos', async () => {
    const p = await db('ia_perfis').where({ slug: 'financeiro' }).first();
    assert.ok(p, 'perfil financeiro não foi semeado');
    assert.equal(p.prompt_slug, 'financeiro');
    assert.equal(p.playbook_slug, 'financeiro_2via_e_desbloqueio');
    assert.equal(p.max_turnos, 10);
  });

  test('o playbook financeiro existe, com etapas, e nasce em RASCUNHO', async () => {
    const pb = await db('playbooks').where({ slug: 'financeiro_2via_e_desbloqueio' }).first();
    assert.ok(pb, 'playbook financeiro não foi semeado');
    // §60/§62: publicar é decisão de quem opera. `carregar()` só lê `publicado`,
    // então este `rascunho` é o que faz o procedimento NÃO valer até alguém
    // publicar na tela — e é por isso que a doc precisa dizer isso em voz alta.
    assert.equal(pb.status, 'rascunho');

    const etapas = await db('playbook_etapas').where({ playbook_id: pb.id }).orderBy('ordem');
    assert.equal(etapas.length, 8);
    assert.equal(etapas[0].titulo, 'Identificar o cliente');
  });

  test('toda tool citada num playbook existe de verdade no backend', async () => {
    // O defeito que isto trava: a etapa 1 do playbook de suporte declarava
    // `consultar_cliente`, que é TIPO DE NÓ e não tool. Como a etapa é dada por
    // cumprida pela tool que a evidencia, ela nunca podia ser marcada — o
    // procedimento ficava travado na etapa 1 e a auditoria via um atendimento
    // eternamente incompleto.
    const { IA_TOOLS } = await import('../../src/services/iaTools.js');
    const reais = new Set(IA_TOOLS.map(t => t.name));
    const etapas = await db('playbook_etapas').select('titulo', 'tools');
    const fantasmas = [];
    for (const e of etapas) {
      for (const t of (Array.isArray(e.tools) ? e.tools : JSON.parse(e.tools || '[]'))) {
        if (!reais.has(t)) fantasmas.push(`${e.titulo} → ${t}`);
      }
    }
    assert.deepEqual(fantasmas, [], `etapas apontando para tool inexistente:\n  ${fantasmas.join('\n  ')}`);
  });

  test('o scorecard financeiro existe, nasce DESLIGADO e tem critério crítico', async () => {
    const sc = await db('quality_scorecards').where({ slug: 'financeiro' }).first();
    assert.ok(sc, 'scorecard financeiro não foi semeado');
    assert.equal(sc.ativo, false, 'auditar custa uma chamada de IA por conversa encerrada');
    assert.equal(sc.perfil, 'financeiro');
    const criterios = Array.isArray(sc.criterios) ? sc.criterios : JSON.parse(sc.criterios);
    assert.ok(criterios.some(c => c.critico), 'sem critério crítico não há teto por violação');
  });

  test('o scorecard do financeiro é ESCOLHIDO para a fila financeiro', async () => {
    // O seletor conhecia dois perfis (`comercial` ou senão `suporte`): uma
    // conversa da fila Financeiro seria auditada com critérios de RADIUS, ONU e
    // reteste. Scorecard que a tela mostra e o backend ignora é a família do
    // `agentes.permissoes` que nunca decidiu nada.
    const { scorecardDe } = await import('../../src/services/quality.js');
    await db('quality_scorecards').where({ slug: 'financeiro' }).update({ ativo: true });
    try {
      const sc = await scorecardDe('financeiro');
      assert.equal(sc?.slug, 'financeiro');
    } finally {
      await db('quality_scorecards').where({ slug: 'financeiro' }).update({ ativo: false });
    }
  });

  test('os TRÊS scorecards existem — não só o do financeiro', async () => {
    // Medido em produção em 2026-09-05: existia UM. A 022 semeia os catálogos e
    // a 023 cria `quality_scorecards`; quando a 022 rodou a tabela não existia,
    // `semearCatalogos` pulou o bloco pelo `hasTable` e nada voltou para
    // semear. Tela de Quality abrindo com um scorecard só, e nada acusando —
    // o mesmo defeito que a 022 foi criada para resolver.
    const slugs = (await db('quality_scorecards').select('slug')).map(s2 => s2.slug).sort();
    assert.deepEqual(slugs, ['comercial', 'financeiro', 'suporte']);
  });

  test('a fila e a categoria de conhecimento do financeiro continuam de pé', async () => {
    assert.ok(await db('filas').where({ slug: 'financeiro' }).first());
    assert.ok(await db('knowledge_categorias').where({ slug: 'financeiro' }).first());
  });

  test('o prompt roteador virou recepção conversacional, não classificador', async () => {
    const p = await db('prompts_ia').where({ slug: 'roteador' }).first();
    assert.ok(p);
    // O prompt do seed mandava "Responda SOMENTE com uma palavra" — usá-lo como
    // base de um agente que precisa conversar entrega uma recepção muda.
    assert.ok(!/SOMENTE com uma palavra/i.test(p.conteudo), 'ainda é o classificador antigo');
    assert.match(p.conteudo, /direcionar_atendimento/);
    assert.match(p.conteudo, /\[REGRAS\]/);
    assert.match(p.conteudo, /\[ESTILO\]/);
  });

  test('o prompt financeiro deixou de citar uma tool que não existe', async () => {
    const p = await db('prompts_ia').where({ slug: 'financeiro' }).first();
    assert.ok(!/consultar_clientes/.test(p.conteudo), 'ainda manda chamar `consultar_clientes`');
    assert.match(p.conteudo, /identificar_cliente/);
  });

  test('semear duas vezes não duplica (o `before` já rodou a 029 em dobro)', async () => {
    const [{ count: perfis }]  = await db('ia_perfis').where({ slug: 'financeiro' }).count('id');
    const [{ count: playbks }] = await db('playbooks').where({ slug: 'financeiro_2via_e_desbloqueio' }).count('id');
    const [{ count: scs }]     = await db('quality_scorecards').where({ slug: 'financeiro' }).count('id');
    // `count(*)` volta como STRING do node-pg — comparar com `!== 1` seria
    // sempre verdadeiro. Armadilha já registrada no CLAUDE.md.
    assert.equal(Number(perfis), 1);
    assert.equal(Number(playbks), 1);
    assert.equal(Number(scs), 1);
    const [{ count: etapas }] = await db('playbook_etapas')
      .join('playbooks', 'playbooks.id', 'playbook_etapas.playbook_id')
      .where('playbooks.slug', 'financeiro_2via_e_desbloqueio').count('playbook_etapas.id');
    assert.equal(Number(etapas), 8);
  });
});
