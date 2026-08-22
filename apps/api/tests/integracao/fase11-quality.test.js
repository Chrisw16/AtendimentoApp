/**
 * Quality AI (FASE 11) contra Postgres.
 *
 * A geração da nota depende da Anthropic e não é testada aqui. O que é testado
 * é tudo que decide o resultado ANTES e DEPOIS dela: a reunião de evidências
 * (§90 — "a conversa sozinha não é suficiente"), a revisão humana que preserva
 * o `ai_score` (§98), a auditoria automática no encerramento (§89) e o
 * coaching por padrão (§99).
 *
 * A aritmética da nota está na suíte pura (`qualityHelpers.test.js`).
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['quality_auditorias', 'quality_scorecards', 'jobs', 'ia_execucoes',
  'playbook_execucoes', 'playbook_etapas', 'playbooks', 'knowledge_uso',
  'flow_executions', 'mensagens', 'conversas', 'agentes'];

describe('FASE 11 — Quality AI', { skip: motivoSkip() }, () => {
  let db, quality;

  before(async () => {
    db = await prepararBanco();
    quality = await import('../../src/services/quality.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const criarAgente = async () => {
    const [a] = await db('agentes').insert({
      nome: 'Fulano', login: `ag_${Math.random().toString(36).slice(2, 9)}`, senha_hash: 'x',
    }).returning('*');
    return a;
  };

  const criarScorecard = async (dados = {}) => {
    const [sc] = await db('quality_scorecards').insert({
      slug: `sc_${Math.random().toString(36).slice(2, 9)}`, nome: 'Suporte', perfil: 'suporte', ativo: true,
      criterios: JSON.stringify([
        { id: 'ident', nome: 'Identificação', peso: 2, critico: false },
        { id: 'diag',  nome: 'Diagnóstico',   peso: 3, critico: false },
      ]),
      ...dados,
    }).returning('*');
    return sc;
  };

  // ── EVIDÊNCIAS (§90) ────────────────────────────────────────────
  describe('reunir evidências', () => {
    test('CRITÉRIO: reúne o que foi EXECUTADO, não só o que foi dito', async () => {
      // "A conversa sozinha não é suficiente": auditar lendo só o texto
      // premiaria quem escreve bonito e puniria quem resolveu rápido.
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert([
        { conversa_id: conv.id, origem: 'cliente', texto: 'sem internet' },
        { conversa_id: conv.id, origem: 'ia',      texto: 'já verifico' },
      ]);
      await db('ia_execucoes').insert({
        conversa_id: conv.id, desfecho: 'transferido', motivo: 'customer_frustrated',
        tools_usadas: JSON.stringify(['consultar_cliente', 'verificar_conexao']),
      });

      const ev = await quality.reunirEvidencias(conv);
      assert.deepEqual(ev.tools.sort(), ['consultar_cliente', 'verificar_conexao']);
      assert.equal(ev.desfecho, 'transferido');
      assert.equal(ev.tempos.mensagens, 2);
    });

    test('mede a primeira resposta — que não se lê no texto da conversa', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      const t0 = Date.now();
      await db('mensagens').insert([
        { conversa_id: conv.id, origem: 'cliente', texto: 'oi', criado_em: new Date(t0).toISOString() },
        { conversa_id: conv.id, origem: 'agente',  texto: 'olá', criado_em: new Date(t0 + 90_000).toISOString() },
      ]);
      const ev = await quality.reunirEvidencias(conv);
      assert.equal(ev.tempos.primeira_resposta_seg, 90);
    });

    test('traz o procedimento esperado junto do que foi cumprido', async () => {
      const [pb] = await db('playbooks').insert({ nome: 'Sem conexão', slug: 'sc', status: 'publicado' }).returning('*');
      const etapas = await db('playbook_etapas').insert([
        { playbook_id: pb.id, ordem: 1, titulo: 'Identificar', obrigatoriedade: 'obrigatoria', tools: JSON.stringify([]) },
        { playbook_id: pb.id, ordem: 2, titulo: 'Verificar',   obrigatoriedade: 'obrigatoria', tools: JSON.stringify([]) },
      ]).returning('*');

      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert({ conversa_id: conv.id, origem: 'cliente', texto: 'oi' });
      await db('playbook_execucoes').insert({
        conversa_id: conv.id, playbook_id: pb.id, versao: 1,
        etapas_feitas: JSON.stringify([{ etapa_id: etapas[0].id }]),
      });

      const ev = await quality.reunirEvidencias(conv);
      assert.equal(ev.playbook.etapas.length, 2);
      assert.equal(ev.playbook.execucao.etapas_feitas.length, 1);
    });

    test('conversa sem nada não estoura', async () => {
      const ev = await quality.reunirEvidencias(await criarConversa(db, { canal: 'whatsapp' }));
      assert.deepEqual(ev.mensagens, []);
      assert.equal(ev.tempos.primeira_resposta_seg, null);
    });
  });

  // ── PRÉ-CONDIÇÕES ───────────────────────────────────────────────
  describe('quando NÃO se audita', () => {
    test('sem scorecard ativo, devolve erro em vez de inventar nota', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert({ conversa_id: conv.id, origem: 'cliente', texto: 'oi' });
      assert.equal((await quality.auditar(conv)).erro, 'sem_scorecard');
    });

    test('scorecard sem critérios não vira auditoria', async () => {
      await criarScorecard({ criterios: JSON.stringify([]) });
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert({ conversa_id: conv.id, origem: 'cliente', texto: 'oi' });
      assert.equal((await quality.auditar(conv)).erro, 'scorecard_vazio');
    });

    test('conversa sem mensagem não vira auditoria', async () => {
      await criarScorecard();
      assert.equal((await quality.auditar(await criarConversa(db, { canal: 'whatsapp' }))).erro, 'conversa_vazia');
    });

    test('scorecard INATIVO não é escolhido', async () => {
      await criarScorecard({ ativo: false });
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert({ conversa_id: conv.id, origem: 'cliente', texto: 'oi' });
      assert.equal((await quality.auditar(conv)).erro, 'sem_scorecard');
    });
  });

  // ── REVISÃO HUMANA (§98) ────────────────────────────────────────
  describe('revisão humana', () => {
    const auditoriaFake = async (dados = {}) => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      const [a] = await db('quality_auditorias').insert({
        conversa_id: conv.id, ai_score: 82, final_score: 82,
        avaliacoes: JSON.stringify([{ criterio_id: 'ident', nota: 8, justificativa: 'ok' }]),
        ...dados,
      }).returning('*');
      return a;
    };

    test('CRITÉRIO: o humano manda, e o ai_score NÃO é apagado', async () => {
      const a = await auditoriaFake();
      const sup = await criarAgente();
      const r = await quality.revisar(a.id, { humanScore: 60, observacao: 'foi mais grave', agenteId: sup.id });

      assert.equal(r.auditoria.final_score, 60);
      assert.equal(r.auditoria.ai_score, 82, 'a divergência é o que calibra o scorecard');
      assert.equal(r.divergencia, -22);
      assert.ok(r.auditoria.revisado_em);
    });

    test('revisão para zero é uma nota, não ausência de nota', async () => {
      const a = await auditoriaFake();
      const r = await quality.revisar(a.id, { humanScore: 0, observacao: 'x', agenteId: null });
      assert.equal(r.auditoria.final_score, 0);
    });

    test('auditoria inexistente não estoura', async () => {
      assert.equal((await quality.revisar('00000000-0000-4000-8000-000000000999', { humanScore: 50 })).erro, 'nao_encontrada');
    });
  });

  // ── AUDITORIA PÓS-ATENDIMENTO (§89) ─────────────────────────────
  describe('auditoria automática no encerramento', () => {
    test('CRITÉRIO: encerrar agenda o job — e não segura o encerramento', async () => {
      const { conversaRepo } = await import('../../src/repositories/conversaRepository.js');
      const conv = await criarConversa(db, { canal: 'whatsapp', status: 'ativa' });

      const encerrada = await conversaRepo.encerrar(conv.id);
      assert.equal(encerrada.status, 'encerrada', 'o encerramento respondeu na hora');

      // O job é agendado sem await na rota; dá um tick para o insert cair.
      await new Promise(r => setTimeout(r, 120));
      const job = await db('jobs').where({ tipo: 'quality_audit' }).first();
      assert.ok(job, 'a auditoria foi agendada');
      assert.ok(new Date(job.executar_em) > new Date(), 'com atraso, para a conversa assentar');
    });

    test('sem scorecard, o job vira no-op — e NÃO entope a DLQ', async () => {
      // Sem esta guarda, toda conversa encerrada viraria uma linha de falha e a
      // DLQ deixaria de significar "algo deu errado".
      const jobs = await import('../../src/services/jobs.js');
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('mensagens').insert({ conversa_id: conv.id, origem: 'cliente', texto: 'oi' });

      await jobs.agendar({
        tipo: 'quality_audit', conversaId: conv.id, noId: 'quality',
        executarEm: new Date(Date.now() - 1000).toISOString(),
      });
      const [r] = await jobs.processarVencidos({ db });

      assert.equal(r.auditou, false);
      assert.equal((await db('jobs').where({ id: r.id }).first()).status, 'ok');
    });
  });

  // ── COACHING (§99) ──────────────────────────────────────────────
  describe('coaching por padrão, não por ranking', () => {
    const auditoriaDe = async (agenteId, score, avaliacoes) => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await db('quality_auditorias').insert({
        conversa_id: conv.id, agente_id: agenteId, ai_score: score, final_score: score,
        avaliacoes: JSON.stringify(avaliacoes),
      });
    };

    test('o que se repete vira ponto de melhoria; o isolado não', async () => {
      const a = await criarAgente();
      await auditoriaDe(a.id, 60, [{ criterio_id: 'ident', nota: 3, justificativa: 'pediu CPF duas vezes' }]);
      await auditoriaDe(a.id, 65, [{ criterio_id: 'ident', nota: 4, justificativa: 'não conferiu contrato' }]);
      await auditoriaDe(a.id, 90, [{ criterio_id: 'diag',  nota: 4, justificativa: 'tropeço isolado' }]);

      const c = await quality.coaching(a.id);
      assert.equal(c.auditorias, 3);
      assert.equal(c.media, 72);
      assert.equal(c.pontos_de_melhoria.length, 1);
      assert.equal(c.pontos_de_melhoria[0].criterio_id, 'ident');
    });

    test('agente sem auditoria não recebe diagnóstico inventado', async () => {
      const c = await quality.coaching((await criarAgente()).id);
      assert.equal(c.auditorias, 0);
      assert.equal(c.media, null);
      assert.equal(c.tem_padrao, false);
    });

    test('o coaching não mistura agentes', async () => {
      const [a, b] = [await criarAgente(), await criarAgente()];
      await auditoriaDe(a.id, 50, [{ criterio_id: 'ident', nota: 2, justificativa: 'x' }]);
      await auditoriaDe(b.id, 95, [{ criterio_id: 'ident', nota: 10 }]);
      assert.equal((await quality.coaching(b.id)).media, 95);
    });
  });
});
