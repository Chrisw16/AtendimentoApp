/**
 * Copiloto V1 (FASE 10) contra Postgres.
 *
 * O que só o banco prova: o painel compondo ficha + procedimento + histórico
 * real, e as métricas de uso (§87) — que são o único jeito de responder se o
 * copiloto ajuda ou atrapalha.
 *
 * A decisão de "responder, consultar ou avançar" (§79) é pura e está em
 * `copilotoHelpers.test.js`. A geração de TEXTO não é testada aqui: depende da
 * Anthropic, e o que importa dela (o contexto montado) é montado por partes já
 * testadas.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['copiloto_eventos', 'playbook_execucoes', 'playbook_etapas', 'playbooks',
  'knowledge_artigos', 'knowledge_categorias', 'mensagens', 'conversas', 'agentes'];

const AGENTE = { id: '99999999-0000-4000-8000-000000000001', role: 'agente', permissoes: {} };

describe('FASE 10 — Copiloto', { skip: motivoSkip() }, () => {
  let db, copiloto;

  before(async () => {
    db = await prepararBanco();
    copiloto = await import('../../src/services/copiloto.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const comMensagens = async (textos) => {
    const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000030' });
    for (const [i, t] of textos.entries()) {
      await db('mensagens').insert({
        conversa_id: conv.id, origem: t.origem || 'cliente', texto: t.texto || t,
        criado_em: new Date(Date.now() - (textos.length - i) * 60_000).toISOString(),
      });
    }
    return conv;
  };

  // ── PAINEL ──────────────────────────────────────────────────────
  describe('painel (analisar)', () => {
    test('CRITÉRIO: sem cliente identificado, manda CONSULTAR — não escrever', async () => {
      const conv = await comMensagens([{ texto: 'quero minha segunda via' }]);
      const r = await copiloto.analisar(conv, AGENTE);
      assert.equal(r.proxima.acao, 'consultar');
      assert.deepEqual(r.proxima.tools, ['consultar_cliente']);
    });

    test('o painel NÃO chama o modelo — é lido a cada conversa aberta', async () => {
      // Sem credencial da Anthropic, uma chamada ao modelo lançaria. O painel
      // responder normalmente é a prova de que ele é determinístico.
      const conv = await comMensagens([{ texto: 'oi' }]);
      const r = await copiloto.analisar(conv, AGENTE);
      assert.ok(r.resumo);
      assert.ok(r.proxima.acao);
    });

    test('o resumo conta só as mensagens do cliente e traz a última', async () => {
      const conv = await comMensagens([
        { origem: 'cliente', texto: 'minha internet caiu' },
        { origem: 'agente',  texto: 'vou verificar' },
        { origem: 'cliente', texto: 'de novo isso, um absurdo' },
      ]);
      const r = await copiloto.analisar(conv, AGENTE);
      assert.match(r.resumo, /2 mensagem/);
      assert.match(r.resumo, /um absurdo/);
      assert.ok(r.sinais.some(s => s.id === 'frustracao'), JSON.stringify(r.sinais));
      assert.ok(r.sinais.some(s => s.id === 'recorrencia'));
    });

    test('os sinais vêm da ÚLTIMA fala do cliente, não da do agente', async () => {
      const conv = await comMensagens([
        { origem: 'cliente', texto: 'tá muito caro' },
        { origem: 'agente',  texto: 'entendo, posso ajudar?' },
        { origem: 'cliente', texto: 'quero contratar então' },
      ]);
      const r = await copiloto.analisar(conv, AGENTE);
      assert.ok(r.sinais.some(s => s.id === 'sinal_compra'));
      assert.ok(!r.sinais.some(s => s.id === 'objecao_preco'), 'a objeção era da mensagem anterior');
    });

    test('conversa sem mensagem nenhuma não estoura', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      const r = await copiloto.analisar(conv, AGENTE);
      assert.ok(r.resumo);
      assert.deepEqual(r.sinais, []);
    });

    test('o procedimento em andamento aparece com etapas feitas e foco', async () => {
      const [pb] = await db('playbooks').insert({
        nome: 'Sem conexão', slug: 'sc', status: 'publicado',
      }).returning('*');
      const etapas = await db('playbook_etapas').insert([
        { playbook_id: pb.id, ordem: 1, titulo: 'Identificar', tools: JSON.stringify([]) },
        { playbook_id: pb.id, ordem: 2, titulo: 'Verificar conexão', tools: JSON.stringify([]) },
      ]).returning('*');

      const conv = await comMensagens([{ texto: 'sem internet' }]);
      await db('playbook_execucoes').insert({
        conversa_id: conv.id, playbook_id: pb.id, versao: 1,
        etapas_feitas: JSON.stringify([{ etapa_id: etapas[0].id, via: 'tool' }]),
      });

      const r = await copiloto.analisar(conv, AGENTE);
      assert.equal(r.playbook.etapas.filter(e => e.feita).length, 1);
      assert.equal(r.playbook.foco.titulo, 'Verificar conexão');
    });
  });

  // ── MÉTRICAS ────────────────────────────────────────────────────
  describe('métricas de uso (§87)', () => {
    test('CRITÉRIO: o aproveitamento conta enviada + editada sobre gerada', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      const ev = (evento) => copiloto.registrarEvento({ conversaId: conv.id, evento });
      await Promise.all([ev('sugestao_gerada'), ev('sugestao_gerada'), ev('sugestao_gerada'), ev('sugestao_gerada')]);
      await ev('enviada');
      await ev('editada');
      await ev('ignorada');

      const m = await copiloto.metricas({ dias: 7 });
      assert.equal(m.sugestao_gerada, 4);
      assert.equal(m.aproveitamento, 0.5, 'sugestão ignorada é o sinal de que ela não serve');
    });

    test('sem sugestão gerada, o aproveitamento é null — não zero', async () => {
      // Zero diria "o copiloto não serve"; null diz "ninguém usou ainda".
      assert.equal((await copiloto.metricas({ dias: 7 })).aproveitamento, null);
    });

    test('registrarEvento nunca lança, mesmo com conversa inexistente', async () => {
      await copiloto.registrarEvento({ conversaId: '00000000-0000-4000-8000-000000000999', evento: 'enviada' });
      await copiloto.registrarEvento({ conversaId: null, evento: 'enviada' });
      assert.ok(true, 'métrica que derruba a tela do atendente é pior que métrica ausente');
    });

    test('o feedback guarda o motivo (§86)', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      await copiloto.registrarEvento({
        conversaId: conv.id, evento: 'feedback', feedback: 'negativo', motivo: 'inventou um prazo',
      });
      const linha = await db('copiloto_eventos').where({ evento: 'feedback' }).first();
      assert.equal(linha.feedback, 'negativo');
      assert.equal(linha.motivo, 'inventou um prazo');
    });
  });
});
