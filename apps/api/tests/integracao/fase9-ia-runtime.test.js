/**
 * AI Runtime V1 (FASE 9) contra Postgres.
 *
 * O que só o banco prova: o desfecho estruturado gravado a cada saída do
 * `ia_responde` (§71), o handoff completo na transferência (§74) e a prioridade
 * que ele empurra para a fila humana da FASE 5.
 *
 * A classificação de motivo, os blocos de prompt e a montagem do handoff estão
 * na suíte pura (`iaRuntime.test.js`) — aqui se testa o efeito no banco.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';
// Puro, sem banco — pode entrar no topo (o `_ambiente` é que exige env).
import { montarHandoff, normalizarMotivo } from '../../src/services/iaRuntime.js';

const TABELAS = ['ia_execucoes', 'ia_perfis', 'playbook_execucoes', 'playbook_etapas', 'playbooks',
  'flow_executions', 'mensagens', 'conversas', 'fluxos', 'agentes'];

/** Fluxo mínimo com um `ia_responde` — o motor não chega a falar com a Anthropic
 *  nestes testes: sem credencial ele cai no catch, que é um dos caminhos testados. */
const fluxoIA = (cfg = {}) => ({
  nodes: [
    { id: 'ini', tipo: 'inicio', config: {} },
    { id: 'ia',  tipo: 'ia_responde', config: cfg },
    { id: 'fim', tipo: 'encerrar', config: {} },
  ],
  edges: [
    { from: 'ini', to: 'ia',  port: 'saida' },
    { from: 'ia',  to: 'fim', port: 'transferir' },
  ],
});

describe('FASE 9 — AI Runtime V1', { skip: motivoSkip() }, () => {
  let db, motor;

  before(async () => {
    db = await prepararBanco();
    motor = await import('../../src/services/motorFluxo.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  // ── PERFIS ──────────────────────────────────────────────────────
  describe('perfis (§66)', () => {
    test('perfil INATIVO não orienta atendimento', async () => {
      await db('ia_perfis').insert({ slug: 'desligado', nome: 'X', ativo: false, max_turnos: 99 });
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000010' });

      // max_turnos do perfil inativo (99) não pode valer; vale o default (6).
      await db('flow_executions').insert({
        conversa_id: conv.id,
        estado: JSON.stringify({ noAtual: 'ia', contexto: { _ia_turnos_ia: 6 }, aguardando: null }),
      });

      const r = await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({ perfil: 'desligado' }) }, enviar: async () => {},
      });
      // Estourou o limite padrão: registrou max_turnos em vez de seguir 99.
      const exec = await db('ia_execucoes').where({ conversa_id: conv.id }).first();
      assert.equal(exec?.desfecho, 'max_turnos');
      assert.ok(r);
    });

    test('o perfil ATIVO fornece max_turnos e goal', async () => {
      await db('ia_perfis').insert({ slug: 'suporte', nome: 'Suporte', goal: 'resolver_suporte', max_turnos: 2 });
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000011' });
      await db('flow_executions').insert({
        conversa_id: conv.id,
        estado: JSON.stringify({ noAtual: 'ia', contexto: { _ia_turnos_ia: 2 }, aguardando: null }),
      });

      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({ perfil: 'suporte' }) }, enviar: async () => {},
      });

      const exec = await db('ia_execucoes').where({ conversa_id: conv.id }).first();
      assert.equal(exec.desfecho, 'max_turnos');
      assert.equal(exec.perfil_slug, 'suporte');
      assert.equal(exec.goal, 'resolver_suporte', 'o objetivo do perfil viaja com o desfecho');
    });

    test('CRITÉRIO: a config do NÓ vence a do perfil', async () => {
      await db('ia_perfis').insert({ slug: 'suporte', nome: 'Suporte', max_turnos: 50 });
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000012' });
      await db('flow_executions').insert({
        conversa_id: conv.id,
        estado: JSON.stringify({ noAtual: 'ia', contexto: { _ia_turnos_ia: 3 }, aguardando: null }),
      });

      // O nó diz 3; o perfil diz 50. Quem configurou o nó estava olhando o ramo.
      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({ perfil: 'suporte', max_turnos: 3 }) }, enviar: async () => {},
      });
      assert.equal((await db('ia_execucoes').where({ conversa_id: conv.id }).first()).desfecho, 'max_turnos');
    });

    test('perfil inexistente não derruba o turno', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000013' });
      const r = await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({ perfil: 'nao_existe' }) }, enviar: async () => {},
      });
      assert.ok(r, 'seguiu com a config do nó');
    });
  });

  // ── DESFECHO ESTRUTURADO ────────────────────────────────────────
  describe('desfecho estruturado (§71)', () => {
    test('CRITÉRIO: estourar turnos é registrado como max_turnos, não como resolvido', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000014' });
      await db('flow_executions').insert({
        conversa_id: conv.id,
        estado: JSON.stringify({ noAtual: 'ia', contexto: { _ia_turnos_ia: 6 }, aguardando: null }),
      });

      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({}) }, enviar: async () => {},
      });

      const exec = await db('ia_execucoes').where({ conversa_id: conv.id }).first();
      assert.equal(exec.desfecho, 'max_turnos');
      assert.equal(exec.motivo, 'max_turns');
      assert.notEqual(exec.desfecho, 'resolvido');
    });

    test('falha da IA vira desfecho "erro" com motivo tool_failure', async () => {
      // Sem credencial da Anthropic configurada, o turno cai no catch — que é
      // exatamente o caminho de indisponibilidade que precisa ser registrado.
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000015' });
      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({}) }, enviar: async () => {},
      });

      const exec = await db('ia_execucoes').where({ conversa_id: conv.id }).first();
      assert.ok(exec, 'a falha foi registrada, não engolida');
      assert.equal(exec.desfecho, 'erro');
      assert.equal(exec.motivo, 'tool_failure');
    });

    test('CRITÉRIO: o sandbox NÃO registra execução', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000016' });
      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoIA({}) }, estados: new Map(), sandbox: true, enviar: async () => {},
      });
      assert.equal((await db('ia_execucoes')).length, 0, 'testar fluxo não polui o relatório');
    });

    test('cada passagem gera uma linha — o histórico de desfechos é acumulável', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000017' });
      for (let i = 0; i < 3; i++) {
        await motor.processarConversa(conv, { texto: 'oi' }, {
          fluxo: { dados: fluxoIA({}) }, enviar: async () => {},
        });
      }
      assert.equal((await db('ia_execucoes').where({ conversa_id: conv.id })).length, 3);
    });
  });

  // ── HANDOFF ─────────────────────────────────────────────────────
  describe('handoff (§74)', () => {
    test('o handoff cabe no jsonb e volta estruturado', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      const handoff = montarHandoff({
        motivo: 'cliente irritado', cliente: { nome: 'Fulano', contrato: '123' },
        tools: ['verificar_conexao'], playbook: { nome: 'Sem conexão', feitas: 2, total: 9 },
      });
      await db('ia_execucoes').insert({
        conversa_id: conv.id, desfecho: 'transferido', motivo: handoff.motivo,
        handoff: JSON.stringify(handoff),
      });

      const lido = await db('ia_execucoes').where({ conversa_id: conv.id }).first();
      assert.equal(lido.handoff.motivo, 'customer_frustrated');
      assert.equal(lido.handoff.prioridade, 2);
      assert.match(lido.handoff.resumo, /verificar_conexao/);
    });

    test('CRITÉRIO: o motivo estruturado é indexável — dá para somar por motivo', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp' });
      for (const m of ['cliente nervoso', 'cliente está bravo', 'quer falar com atendente']) {
        await db('ia_execucoes').insert({
          conversa_id: conv.id, desfecho: 'transferido',
          motivo: normalizarMotivo(m),
        });
      }
      const porMotivo = await db('ia_execucoes').groupBy('motivo').select('motivo').count('id as n');
      const mapa = Object.fromEntries(porMotivo.map(r => [r.motivo, Number(r.n)]));
      assert.equal(mapa.customer_frustrated, 2, 'as duas variações somaram');
      assert.equal(mapa.customer_requested_human, 1);
    });
  });
});
