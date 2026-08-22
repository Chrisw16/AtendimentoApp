/**
 * Analytics (FASE 12) contra Postgres.
 *
 * O que só o banco prova: as duas views (`conversa_fatos`, `nps_unificado`), a
 * coluna `encerrada_em` gravada no ponto único, e — o mais importante — que o
 * indicador "resolução IA" parou de ser ~100% por construção.
 *
 * A aritmética dos indicadores está na suíte pura (`analyticsHelpers.test.js`).
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['telemetria', 'quality_auditorias', 'quality_scorecards', 'ia_execucoes',
  'playbook_execucoes', 'playbook_etapas', 'playbooks', 'satisfacao', 'avaliacoes',
  'knowledge_uso', 'knowledge_artigos', 'knowledge_categorias', 'jobs',
  'mensagens', 'conversas', 'agentes'];

describe('FASE 12 — Analytics', { skip: motivoSkip() }, () => {
  let db, analytics;

  before(async () => {
    db = await prepararBanco();
    analytics = await import('../../src/services/analytics.js');
  });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  /** Conversa encerrada, com ou sem fala de agente. */
  const encerrada = async ({ humano = false, desfecho = 'resolvido', telefone = null, min = 10 } = {}) => {
    const inicio = new Date(Date.now() - min * 60_000).toISOString();
    const c = await criarConversa(db, {
      canal: 'whatsapp', telefone, status: 'encerrada',
      criado_em: inicio, encerrada_em: new Date().toISOString(),
    });
    await db('mensagens').insert({ conversa_id: c.id, origem: 'cliente', texto: 'oi', criado_em: inicio });
    if (humano) await db('mensagens').insert({ conversa_id: c.id, origem: 'agente', texto: 'olá' });
    if (desfecho) await db('ia_execucoes').insert({ conversa_id: c.id, desfecho, tools_usadas: JSON.stringify([]) });
    return c;
  };

  // ── O DEFEITO QUE A FASE CONSERTA ───────────────────────────────
  describe('resolução IA deixou de ser 100% por construção', () => {
    test('CRITÉRIO: conversa atendida por HUMANO não conta como resolvida pela IA', async () => {
      // `conversaRepo.encerrar` zera `agente_id`, então a conta antiga
      // (`status='encerrada' AND agente_id IS NULL`) marcava TODA conversa
      // encerrada como resolvida pela IA.
      await encerrada({ humano: true });
      await encerrada({ humano: true });
      await encerrada({ humano: false });

      const fatos = await db('conversa_fatos');
      assert.equal(fatos.filter(f => f.teve_humano).length, 2);

      const r = await analytics.executivo({ dias: 7 });
      assert.equal(r.resolucao_ia_aparente, 33, '1 de 3 — não 100%');
      assert.equal(r.com_humano, 67);
    });

    test('o mesmo vale no DASHBOARD — os dois números não podem divergir', async () => {
      await encerrada({ humano: true });
      const [linha] = await db('conversas').select(db.raw(`
        COUNT(*) FILTER (WHERE status = 'encerrada' AND NOT EXISTS (
          SELECT 1 FROM mensagens m WHERE m.conversa_id = conversas.id AND m.origem = 'agente')) as so_ia`));
      assert.equal(Number(linha.so_ia), 0);
    });
  });

  // ── VIEW conversa_fatos ─────────────────────────────────────────
  describe('view conversa_fatos', () => {
    test('CRITÉRIO: conversa SEM telefone não vira recontato de todas as outras', async () => {
      // `PARTITION BY telefone` joga todos os NULL na mesma partição — a mesma
      // armadilha do vazamento de histórico da FASE 6, em window function.
      await encerrada({ telefone: null });
      await encerrada({ telefone: null });
      await encerrada({ telefone: null });

      const fatos = await db('conversa_fatos');
      assert.deepEqual(fatos.map(f => f.proximo_contato_em), [null, null, null]);
    });

    test('o MESMO telefone encadeia — é assim que o recontato é medido', async () => {
      const tel = '5584911112222';
      await encerrada({ telefone: tel, min: 60 });
      await encerrada({ telefone: tel, min: 30 });

      const fatos = await db('conversa_fatos').whereNotNull('telefone').orderBy('criado_em');
      assert.ok(fatos[0].proximo_contato_em, 'a primeira aponta para a segunda');
      assert.equal(fatos[1].proximo_contato_em, null, 'a última não tem próxima');
    });

    test('traz o desfecho e a duração', async () => {
      await encerrada({ desfecho: 'transferido', min: 20 });
      const [f] = await db('conversa_fatos');
      assert.equal(f.desfecho_ia, 'transferido');
      assert.equal(f.foi_transferido, true);
      assert.ok(f.duracao_seg >= 1190 && f.duracao_seg <= 1210, `duração ${f.duracao_seg}`);
    });

    test('a view degrada com quality_auditorias vazia', async () => {
      await encerrada();
      const [f] = await db('conversa_fatos');
      assert.equal(f.quality_score, null);
    });
  });

  // ── encerrada_em ────────────────────────────────────────────────
  describe('encerrada_em', () => {
    test('CRITÉRIO: é gravada no ponto único do encerramento', async () => {
      const { conversaRepo } = await import('../../src/repositories/conversaRepository.js');
      const c = await criarConversa(db, { canal: 'whatsapp', status: 'ativa' });
      assert.equal(c.encerrada_em, null);

      await conversaRepo.encerrar(c.id);
      assert.ok((await db('conversas').where({ id: c.id }).first()).encerrada_em);
    });
  });

  // ── NPS UNIFICADO (§112) ────────────────────────────────────────
  describe('nps_unificado', () => {
    test('CRITÉRIO: as DUAS tabelas entram — nenhuma some em silêncio', async () => {
      // O `getNPS` antigo usava "tabela com dados vence": com dado nas duas,
      // metade das respostas sumia do cálculo sem ninguém perceber.
      const c = await encerrada();
      await db('satisfacao').insert({ conversa_id: c.id, nota: 9, escala: 10 });
      await db('avaliacoes').insert({ conversa_id: c.id, nota: 5 });

      const linhas = await db('nps_unificado');
      assert.equal(linhas.length, 2);
      assert.deepEqual(linhas.map(l => Number(l.escala)).sort((a, b) => a - b), [5, 10]);
    });

    test('a escala vem por linha — sem ela a nota máxima de 1-5 viraria detrator', async () => {
      const c = await encerrada();
      await db('satisfacao').insert({ conversa_id: c.id, nota: 5, escala: 5 });
      const r = await analytics.nps({ dias: 7 });
      assert.equal(r.geral.promotores, 1, 'nota 5 na escala 5 é promotor');
    });

    test('corte por resolução separa IA de humano', async () => {
      const ia = await encerrada({ humano: false });
      const hum = await encerrada({ humano: true });
      await db('satisfacao').insert([
        { conversa_id: ia.id,  nota: 10, escala: 10 },
        { conversa_id: hum.id, nota: 3,  escala: 10 },
      ]);

      const r = await analytics.nps({ dias: 7, corte: 'resolucao' });
      const porChave = Object.fromEntries(r.grupos.map(g => [g.chave, g]));
      assert.equal(porChave.ia.promotores, 1);
      assert.equal(porChave.humano.detratores, 1);
    });
  });

  // ── TELEMETRIA (§104/§105) ──────────────────────────────────────
  describe('telemetria', () => {
    test('agrega tool por nome, com taxa de sucesso e p95', async () => {
      const c = await encerrada();
      await db('telemetria').insert([
        { tipo: 'tool', nome: 'verificar_conexao', conversa_id: c.id, ok: true,  ms: 100 },
        { tipo: 'tool', nome: 'verificar_conexao', conversa_id: c.id, ok: true,  ms: 300 },
        { tipo: 'tool', nome: 'verificar_conexao', conversa_id: c.id, ok: false, ms: 8000, erro: 'timeout' },
      ]);

      const r = await analytics.iaETools({ dias: 7 });
      const t = r.tools.find(x => x.nome === 'verificar_conexao');
      assert.equal(t.chamadas, 3);
      assert.equal(t.taxa_sucesso, 67);
      assert.equal(t.timeouts, 1);
      assert.ok(t.ultimo_erro_em, 'diz QUANDO falhou pela última vez');
    });

    test('CRITÉRIO: modelo sem preço configurado deixa o custo NULL, não zero', async () => {
      const c = await encerrada();
      await db('telemetria').insert({
        tipo: 'llm', nome: 'modelo-sem-preco', conversa_id: c.id, ok: true,
        tokens_in: 1000, tokens_out: 500, ms: 900,
      });
      const r = await analytics.iaETools({ dias: 7 });
      assert.equal(r.custo_total, null, 'custo zerado viraria "a IA é de graça"');
      assert.equal(r.precos_configurados, false);
    });

    test('com preço configurado, o custo sai e vem por resolvido', async () => {
      const c = await encerrada();
      await db('telemetria').insert({
        tipo: 'llm', nome: 'claude-haiku-4-5-20251001', conversa_id: c.id, ok: true,
        tokens_in: 1_000_000, tokens_out: 200_000, ms: 900,
      });
      const r = await analytics.iaETools({ dias: 7 });
      assert.equal(r.precos_configurados, true);
      assert.equal(r.custo_total, 2);
      assert.ok(r.custo_por_resolvido > 0);
    });
  });

  // ── CUSTO EVITADO (§108) ────────────────────────────────────────
  describe('custo evitado', () => {
    test('só conta resolução da IA em que NENHUM chamado foi aberto', async () => {
      const semChamado = await encerrada();
      const comChamado = await encerrada();
      await db('telemetria').insert({ tipo: 'tool', nome: 'criar_chamado', conversa_id: comChamado.id, ok: true, ms: 500 });

      const r = await analytics.executivo({ dias: 7 });
      assert.equal(r.custo_evitado.atendimentos_ia, 1, `só a ${semChamado.id.slice(0, 8)} conta`);
      assert.equal(r.custo_evitado.estimativa, true);
      assert.equal(r.custo_evitado.configurado, false, 'custos nascem zerados e a API diz isso');
    });
  });
});
