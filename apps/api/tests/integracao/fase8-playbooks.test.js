/**
 * Playbook Engine (FASE 8) contra Postgres.
 *
 * O que só o banco prova: o snapshot de versão (§64), a execução única por
 * conversa, e o rastreamento de etapa POR TOOL — que é o mecanismo que permite
 * auditar o procedimento sem acreditar no que o modelo disse ter feito.
 *
 * O workflow e a montagem do prompt estão na suíte pura (`playbookHelpers`).
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['playbook_execucoes', 'playbook_versoes', 'playbook_etapas', 'playbooks',
  'flow_executions', 'mensagens', 'conversas', 'agentes'];

describe('FASE 8 — Playbook Engine', { skip: motivoSkip() }, () => {
  let db, pbs;

  before(async () => {
    db  = await prepararBanco();
    pbs = await import('../../src/services/playbook.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const criar = async ({ status = 'publicado', etapas = null, ...dados } = {}) => {
    const [pb] = await db('playbooks').insert({
      nome: 'Sem conexão', slug: `pb-${Math.random().toString(36).slice(2, 9)}`,
      dominio: 'suporte', objetivo: 'Restabelecer o acesso', status,
      excecoes: 'cabo rompido dispensa testes remotos',
      ...dados,
    }).returning('*');

    const lista = etapas || [
      { ordem: 1, titulo: 'Identificar cliente', obrigatoriedade: 'obrigatoria', tools: JSON.stringify(['consultar_cliente']) },
      { ordem: 2, titulo: 'Verificar conexão',   obrigatoriedade: 'obrigatoria', tools: JSON.stringify(['verificar_conexao']) },
      { ordem: 3, titulo: 'Entender o relato',   obrigatoriedade: 'obrigatoria', tools: JSON.stringify([]) },
      { ordem: 4, titulo: 'Avaliar sinal',       obrigatoriedade: 'condicional', condicao: 'houver leitura', tools: JSON.stringify([]) },
    ];
    await db('playbook_etapas').insert(lista.map(e => ({ ...e, playbook_id: pb.id })));
    return pb;
  };

  // ── CARREGAMENTO ────────────────────────────────────────────────
  describe('carregar', () => {
    test('só traz playbook PUBLICADO — rascunho não orienta atendimento', async () => {
      const pb = await criar({ status: 'rascunho' });
      assert.equal(await pbs.carregar(pb.slug), null);
      assert.ok(await pbs.carregar((await criar()).slug));
    });

    test('o modo teste enxerga o status "teste" (é para isso que ele existe)', async () => {
      const pb = await criar({ status: 'teste' });
      assert.equal(await pbs.carregar(pb.slug), null);
      assert.ok(await pbs.carregar(pb.slug, { permitirTeste: true }));
    });

    test('slug inexistente devolve null, não estoura', async () => {
      assert.equal(await pbs.carregar('nao-existe'), null);
      assert.equal(await pbs.carregar(null), null);
    });
  });

  // ── EXECUÇÃO E RASTREAMENTO ─────────────────────────────────────
  describe('rastreamento por tool', () => {
    test('CRITÉRIO: a tool executada cumpre a etapa, sem a IA declarar nada', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const pronto = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });

      const depois = await pbs.registrarTool(pronto.exec, pronto.etapas, 'verificar_conexao');
      const feitas = depois.etapas_feitas;
      assert.equal(feitas.length, 1);
      assert.equal(feitas[0].via, 'tool');
      assert.equal(pronto.etapas.find(e => e.id === feitas[0].etapa_id).titulo, 'Verificar conexão');
    });

    test('tool que não pertence a etapa nenhuma não inventa progresso', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      const d    = await pbs.registrarTool(p.exec, p.etapas, 'listar_planos_ativos');
      assert.deepEqual(d.etapas_feitas, []);
    });

    test('a mesma tool duas vezes não duplica a etapa', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      let e = await pbs.registrarTool(p.exec, p.etapas, 'consultar_cliente');
      e     = await pbs.registrarTool(e, p.etapas, 'consultar_cliente');
      assert.equal(e.etapas_feitas.length, 1);
    });

    test('etapa CONVERSACIONAL é marcada explicitamente, por número ou título', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });

      const r1 = await pbs.concluirEtapa(p.exec, p.etapas, '3');
      assert.equal(r1.etapa.titulo, 'Entender o relato');
      const r2 = await pbs.concluirEtapa(r1.exec, p.etapas, 'Avaliar sinal');
      assert.equal(r2.etapa.ordem, 4);
      assert.equal(r2.exec.etapas_feitas.length, 2);
    });

    test('etapa inexistente devolve erro sem sujar a execução', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      const r    = await pbs.concluirEtapa(p.exec, p.etapas, 'etapa que não existe');
      assert.equal(r.erro, 'etapa_nao_encontrada');
      assert.deepEqual(r.exec.etapas_feitas, []);
    });

    test('cumprir as OBRIGATÓRIAS conclui a execução — condicional não segura', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });

      let e = await pbs.registrarTool(p.exec, p.etapas, 'consultar_cliente');
      e     = await pbs.registrarTool(e, p.etapas, 'verificar_conexao');
      assert.equal(e.resultado, 'em_andamento');
      e = (await pbs.concluirEtapa(e, p.etapas, '3')).exec;

      assert.equal(e.resultado, 'concluido', 'a condicional pendente não pode impedir');
      assert.ok(e.concluido_em);
    });
  });

  // ── CONTINUIDADE ────────────────────────────────────────────────
  describe('execução por conversa', () => {
    test('CRITÉRIO: o cliente que volta CONTINUA de onde parou', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p1   = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      await pbs.registrarTool(p1.exec, p1.etapas, 'consultar_cliente');

      const p2 = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      assert.equal(p2.exec.id, p1.exec.id, 'não criou execução nova');
      assert.equal(p2.exec.etapas_feitas.length, 1);
      assert.match(p2.bloco, /\[x\] 1\./, 'o prompt mostra a etapa já cumprida');
      assert.match(p2.bloco, /2\..*VOCÊ ESTÁ AQUI/);
    });

    test('conversas diferentes têm execuções independentes', async () => {
      const pb = await criar();
      const [a, b] = [await criarConversa(db, {}), await criarConversa(db, {})];
      const pa = await pbs.prepararParaIA(pb.slug, { conversaId: a.id });
      const pb2 = await pbs.prepararParaIA(pb.slug, { conversaId: b.id });
      assert.notEqual(pa.exec.id, pb2.exec.id);
    });

    test('CRITÉRIO: no sandbox NÃO cria execução (o histórico é auditado)', async () => {
      const pb   = await criar({ status: 'teste' });
      const conv = await criarConversa(db, {});
      const p = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id, sandbox: true });

      assert.ok(p.bloco, 'o prompt sai igual');
      assert.equal(p.exec, null);
      assert.equal((await db('playbook_execucoes')).length, 0);
    });

    test('o bloco do prompt carrega as exceções (§61)', async () => {
      const pb   = await criar();
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      assert.match(p.bloco, /cabo rompido/);
    });

    test('slug inexistente não derruba o turno da IA', async () => {
      assert.equal(await pbs.prepararParaIA('nao-existe', { conversaId: null }), null);
    });
  });

  // ── WORKFLOW E VERSÃO ───────────────────────────────────────────
  describe('workflow e versionamento (§64)', () => {
    test('CRITÉRIO: publicar congela o playbook INTEIRO, com etapas', async () => {
      // Guardar só o número da versão não bastaria: a auditoria de um
      // atendimento antigo precisa ver o procedimento COMO ELE ERA.
      const pb = await criar({ status: 'teste' });
      const r  = await pbs.mudarStatus(pb.id, 'publicado');
      assert.equal(r.playbook.status, 'publicado');

      const [v] = await db('playbook_versoes').where({ playbook_id: pb.id });
      assert.equal(v.versao, 1);
      assert.equal(v.snapshot.etapas.length, 4, 'as etapas foram junto');
      assert.equal(v.snapshot.playbook.nome, 'Sem conexão');
    });

    test('a versão antiga sobrevive à reescrita das etapas', async () => {
      const pb = await criar({ status: 'teste' });
      await pbs.mudarStatus(pb.id, 'publicado');
      await pbs.mudarStatus(pb.id, 'teste');
      await db('playbook_etapas').where({ playbook_id: pb.id }).del();
      await db('playbook_etapas').insert({ playbook_id: pb.id, ordem: 1, titulo: 'Procedimento novo', tools: JSON.stringify([]) });
      await pbs.mudarStatus(pb.id, 'publicado');

      const versoes = await db('playbook_versoes').where({ playbook_id: pb.id }).orderBy('versao');
      assert.equal(versoes.length, 2);
      assert.equal(versoes[0].snapshot.etapas.length, 4);
      assert.equal(versoes[1].snapshot.etapas[0].titulo, 'Procedimento novo');
    });

    test('sair de publicado para teste sobe a versão', async () => {
      const pb = await criar({ status: 'teste' });
      await pbs.mudarStatus(pb.id, 'publicado');
      assert.equal((await pbs.mudarStatus(pb.id, 'teste')).playbook.versao, 2);
    });

    test('rascunho → publicado é recusado com explicação', async () => {
      const pb = await criar({ status: 'rascunho' });
      const r  = await pbs.mudarStatus(pb.id, 'publicado');
      assert.equal(r.erro, 'transicao_invalida');
      assert.match(r.mensagem, /teste/);
    });

    test('CRITÉRIO: playbook SEM etapas não vai ao ar', async () => {
      const [pb] = await db('playbooks').insert({ nome: 'Vazio', slug: 'vazio', status: 'teste' }).returning('*');
      const r = await pbs.mudarStatus(pb.id, 'publicado');
      assert.equal(r.erro, 'sem_etapas');
      assert.equal((await db('playbooks').where({ id: pb.id }).first()).status, 'teste');
    });

    test('a execução guarda a VERSÃO que orientou o atendimento', async () => {
      const pb   = await criar({ status: 'teste' });
      await pbs.mudarStatus(pb.id, 'publicado');
      const conv = await criarConversa(db, {});
      const p    = await pbs.prepararParaIA(pb.slug, { conversaId: conv.id });
      assert.equal(p.exec.versao, 1);
    });
  });
});
