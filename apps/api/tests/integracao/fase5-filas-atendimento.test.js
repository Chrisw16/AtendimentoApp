/**
 * Critérios de aceite da FASE 5 (Equipes, Filas e Human Handoff), contra Postgres.
 *
 * O que só o banco prova: o claim atômico de "assumir próximo"
 * (`FOR UPDATE SKIP LOCKED` — dois agentes clicando junto NÃO pegam a mesma
 * conversa), a ordem por prioridade/antiguidade, o `ON DELETE SET NULL` da
 * fila e o `transferir_agente` do motor gravando a fila certa.
 *
 * As decisões puras (visibilidade, capacidade, horário, faixas de SLA) estão em
 * `services/filasHelpers.test.js` e não se repetem aqui.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['flow_executions', 'mensagens', 'conversas', 'agentes_filas', 'filas', 'agentes', 'fluxos', 'audit_log'];

const fluxoTransferencia = (fila) => ({
  nodes: [
    { id: 'ini',  tipo: 'inicio',            config: {} },
    { id: 'tra',  tipo: 'transferir_agente', config: { fila, msg_fora: 'Estamos fechados.' } },
    { id: 'fora', tipo: 'encerrar',          config: {} },
  ],
  edges: [
    { from: 'ini', to: 'tra',  port: 'saida' },
    { from: 'tra', to: 'fora', port: 'fora_horario' },
  ],
});

describe('FASE 5 — filas de atendimento humano', { skip: motivoSkip() }, () => {
  let db, filaService, motor;

  before(async () => {
    db          = await prepararBanco();
    filaService = await import('../../src/services/filaService.js');
    motor       = await import('../../src/services/motorFluxo.js');
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  const criarFila = async (dados = {}) => {
    const [f] = await db('filas').insert({ nome: 'Suporte', slug: 'suporte', ...dados }).returning('*');
    return f;
  };
  const criarAgente = async (dados = {}) => {
    const [a] = await db('agentes').insert({
      nome: 'Agente', login: `ag_${Math.random().toString(36).slice(2, 9)}`, senha_hash: 'x', ...dados,
    }).returning('*');
    return a;
  };
  /** Conversa esperando há N minutos. */
  const naFila = (min, extra = {}) => criarConversa(db, {
    status: 'aguardando',
    aguardando_desde: new Date(Date.now() - min * 60_000).toISOString(),
    ...extra,
  });

  // ── SCHEMA ──────────────────────────────────────────────────────
  describe('migration 017', () => {
    test('capacidade nasce 0 (= ilimitado): subir a migration não barra ninguém', async () => {
      const a = await criarAgente();
      assert.equal(a.capacidade, 0);
    });

    test('apagar a fila NÃO leva a conversa junto — ela volta a ser de todos', async () => {
      const fila = await criarFila();
      const conv = await naFila(1, { fila_id: fila.id });

      await db('filas').where({ id: fila.id }).del();

      const depois = await db('conversas').where({ id: conv.id }).first();
      assert.ok(depois, 'a conversa sobreviveu ao DELETE da fila');
      assert.equal(depois.fila_id, null, 'ON DELETE SET NULL');
    });

    test('slug é único — duas filas com o mesmo slug quebrariam o nó do fluxo', async () => {
      await criarFila({ slug: 'suporte' });
      await assert.rejects(() => criarFila({ nome: 'Outro', slug: 'suporte' }));
    });
  });

  // ── ASSUMIR PRÓXIMO ─────────────────────────────────────────────
  describe('assumir próximo', () => {
    test('CRITÉRIO: dois agentes simultâneos NUNCA recebem a mesma conversa', async () => {
      const [a, b] = [await criarAgente(), await criarAgente()];
      await naFila(10); await naFila(5);

      const [x, y] = await Promise.all([
        filaService.assumirProxima(a.id),
        filaService.assumirProxima(b.id),
      ]);

      assert.ok(x && y, 'havia duas conversas, os dois agentes pegaram uma');
      assert.notEqual(x.id, y.id, 'o claim é atômico — SKIP LOCKED');
      const donos = await db('conversas').whereIn('id', [x.id, y.id]).pluck('agente_id');
      assert.equal(new Set(donos).size, 2);
    });

    test('a fila vazia devolve null, não erro', async () => {
      const a = await criarAgente();
      assert.equal(await filaService.assumirProxima(a.id), null);
    });

    test('ordem: prioridade primeiro, depois quem espera há mais tempo', async () => {
      const a = await criarAgente();
      const antiga = await naFila(30);
      const urgente = await naFila(1, { prioridade: 2 });

      assert.equal((await filaService.assumirProxima(a.id)).id, urgente.id, 'prioridade fura a fila');
      assert.equal((await filaService.assumirProxima(a.id)).id, antiga.id);
    });

    test('conversa assumida sai de "aguardando" e ganha assumido_em', async () => {
      const a = await criarAgente();
      await naFila(2);
      const conv = await filaService.assumirProxima(a.id);

      assert.equal(conv.status, 'ativa');
      assert.equal(conv.agente_id, a.id);
      assert.equal(conv.aguardando_desde, null, 'sai do relógio de SLA');
      assert.ok(conv.assumido_em);
    });

    test('com fila escolhida, só pega daquela fila', async () => {
      const suporte   = await criarFila({ slug: 'suporte' });
      const comercial = await criarFila({ nome: 'Comercial', slug: 'comercial' });
      const a = await criarAgente();
      await naFila(20, { fila_id: comercial.id });
      const alvo = await naFila(1, { fila_id: suporte.id });

      const conv = await filaService.assumirProxima(a.id, { filaId: suporte.id });
      assert.equal(conv.id, alvo.id, 'ignorou a mais antiga porque era de outra fila');
    });

    test('sem fila escolhida, o agente puxa das SUAS filas e das conversas sem fila', async () => {
      const minha  = await criarFila({ slug: 'minha' });
      const outra  = await criarFila({ nome: 'Outra', slug: 'outra' });
      const a = await criarAgente();
      await db('agentes_filas').insert({ agente_id: a.id, fila_id: minha.id });

      const daOutra = await naFila(60, { fila_id: outra.id });
      const semFila = await naFila(30);
      const minhaC  = await naFila(10, { fila_id: minha.id });

      const filaIds = await filaService.filasDoAgente(a.id);
      const p1 = await filaService.assumirProxima(a.id, { filaIds });
      const p2 = await filaService.assumirProxima(a.id, { filaIds });
      const p3 = await filaService.assumirProxima(a.id, { filaIds });

      assert.deepEqual([p1.id, p2.id], [semFila.id, minhaC.id], 'pegou a sem fila e a da fila dele, nessa ordem');
      assert.equal(p3, null, `a conversa da fila alheia (${daOutra.id}) ficou lá`);
    });
  });

  // ── ASSUNÇÃO MANUAL ─────────────────────────────────────────────
  describe('assumir uma conversa específica', () => {
    test('CRITÉRIO: o segundo agente NÃO sequestra a conversa do primeiro', async () => {
      const [a, b] = [await criarAgente(), await criarAgente()];
      const conv = await naFila(3);

      const r1 = await filaService.assumirConversa(conv.id, { agenteId: a.id });
      const r2 = await filaService.assumirConversa(conv.id, { agenteId: b.id });

      assert.equal(r1.conv.agente_id, a.id);
      assert.equal(r2.erro, 'ocupada');
      assert.equal(r2.donoId, a.id, 'a mensagem de erro sabe dizer com quem está');
      assert.equal((await db('conversas').where({ id: conv.id }).first()).agente_id, a.id);
    });

    test('reassumir a própria conversa continua funcionando', async () => {
      const a = await criarAgente();
      const conv = await naFila(1);
      await filaService.assumirConversa(conv.id, { agenteId: a.id });
      assert.ok((await filaService.assumirConversa(conv.id, { agenteId: a.id })).conv);
    });

    test('admin TOMA a conversa travada com outro agente', async () => {
      const [a, adm] = [await criarAgente(), await criarAgente({ role: 'admin' })];
      const conv = await naFila(1);
      await filaService.assumirConversa(conv.id, { agenteId: a.id });

      const r = await filaService.assumirConversa(conv.id, { agenteId: adm.id, ehAdmin: true });
      assert.equal(r.conv.agente_id, adm.id);
    });

    test('supervisor DA FILA também toma; supervisor de outra fila, não', async () => {
      const fila  = await criarFila();
      const outra = await criarFila({ nome: 'Outra', slug: 'outra' });
      const dono  = await criarAgente();
      const sup   = await criarAgente();
      const supDeOutra = await criarAgente();
      await db('agentes_filas').insert([
        { agente_id: sup.id,        fila_id: fila.id,  supervisor: true },
        { agente_id: supDeOutra.id, fila_id: outra.id, supervisor: true },
      ]);

      const conv = await naFila(1, { fila_id: fila.id });
      await filaService.assumirConversa(conv.id, { agenteId: dono.id });

      assert.equal((await filaService.assumirConversa(conv.id, { agenteId: supDeOutra.id })).erro, 'ocupada');
      assert.equal((await filaService.assumirConversa(conv.id, { agenteId: sup.id })).conv.agente_id, sup.id);
    });

    test('membro comum da fila NÃO toma (supervisor é flag, não é participar)', async () => {
      const fila = await criarFila();
      const [dono, membro] = [await criarAgente(), await criarAgente()];
      await db('agentes_filas').insert({ agente_id: membro.id, fila_id: fila.id, supervisor: false });

      const conv = await naFila(1, { fila_id: fila.id });
      await filaService.assumirConversa(conv.id, { agenteId: dono.id });
      assert.equal((await filaService.assumirConversa(conv.id, { agenteId: membro.id })).erro, 'ocupada');
    });

    test('conversa inexistente devolve erro, não explode', async () => {
      const a = await criarAgente();
      const r = await filaService.assumirConversa('00000000-0000-4000-8000-000000000999', { agenteId: a.id });
      assert.equal(r.erro, 'nao_encontrada');
    });
  });

  // ── CAPACIDADE ──────────────────────────────────────────────────
  describe('capacidade simultânea', () => {
    test('contarAtivas conta só as conversas ATIVAS do agente', async () => {
      const a = await criarAgente({ capacidade: 2 });
      await criarConversa(db, { status: 'ativa',      agente_id: a.id });
      await criarConversa(db, { status: 'ativa',      agente_id: a.id });
      await criarConversa(db, { status: 'encerrada',  agente_id: a.id });
      await criarConversa(db, { status: 'aguardando', agente_id: a.id });

      assert.equal(await filaService.contarAtivas(a.id), 2);
      assert.equal(await filaService.temVaga(a), false, 'encostou no teto');
    });

    test('capacidade 0 é ilimitada mesmo com 10 conversas abertas', async () => {
      const a = await criarAgente({ capacidade: 0 });
      for (let i = 0; i < 10; i++) await criarConversa(db, { status: 'ativa', agente_id: a.id });
      assert.equal(await filaService.temVaga(a), true);
    });
  });

  // ── TRANSFERÊNCIA ENTRE FILAS ───────────────────────────────────
  describe('transferir entre filas', () => {
    test('devolve para a espera, larga o agente e REINICIA o relógio do SLA', async () => {
      const destino = await criarFila({ nome: 'Financeiro', slug: 'financeiro' });
      const a = await criarAgente();
      const conv = await criarConversa(db, {
        status: 'ativa', agente_id: a.id,
        assumido_em: new Date().toISOString(),
        aguardando_desde: new Date(Date.now() - 60 * 60_000).toISOString(),
      });

      const depois = await filaService.transferirParaFila(conv.id, destino.id);

      assert.equal(depois.fila_id, destino.id);
      assert.equal(depois.status, 'aguardando');
      assert.equal(depois.agente_id, null, 'transferir para fila é abrir mão da conversa');
      assert.equal(depois.assumido_em, null);
      const esperaMin = (Date.now() - new Date(depois.aguardando_desde).getTime()) / 60_000;
      assert.ok(esperaMin < 1, `o SLA da fila nova começa agora, não herdado (${esperaMin} min)`);
    });

    test('CRITÉRIO: a Flow Execution SOBREVIVE à troca de fila', async () => {
      // É o item "preservar contexto e Flow Execution" do plano: o cliente que
      // já contou o CPF para a IA não recomeça do zero porque a conversa
      // andou de fila.
      const destino = await criarFila({ nome: 'Nível 2', slug: 'n2' });
      const conv = await criarConversa(db, { status: 'ativa', canal: 'whatsapp' });
      await db('flow_executions').insert({
        conversa_id: conv.id,
        estado: JSON.stringify({ noAtual: 'tra', _retomarNo: 'depois', contexto: { cliente: { cpf: '000' } } }),
      });

      await filaService.transferirParaFila(conv.id, destino.id);

      const exec = await db('flow_executions').where({ conversa_id: conv.id }).first();
      assert.ok(exec, 'a execução continua viva');
      const estado = typeof exec.estado === 'string' ? JSON.parse(exec.estado) : exec.estado;
      assert.equal(estado._retomarNo, 'depois', 'o ponto de retomada continua lá');
      assert.equal(estado.contexto.cliente.cpf, '000', 'o que a IA já coletou continua lá');
    });
  });

  // ── MOTOR ───────────────────────────────────────────────────────
  describe('nó "transferir para fila"', () => {
    test('cfg.fila com o slug grava conversas.fila_id', async () => {
      const fila = await criarFila({ slug: 'comercial', nome: 'Comercial' });
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000001' });

      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoTransferencia('comercial') },
        estados: new Map(),
        enviar: async () => {},
      });

      const depois = await db('conversas').where({ id: conv.id }).first();
      assert.equal(depois.fila_id, fila.id);
      assert.equal(depois.status, 'aguardando');
    });

    test('slug inexistente não engole a transferência: enfileira sem fila', async () => {
      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000002' });

      await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoTransferencia('fila_que_alguem_apagou') },
        estados: new Map(),
        enviar: async () => {},
      });

      const depois = await db('conversas').where({ id: conv.id }).first();
      assert.equal(depois.status, 'aguardando', 'o cliente entrou na fila mesmo assim');
      assert.equal(depois.fila_id, null);
    });

    test('CRITÉRIO: o horário da FILA fecha mesmo com o horário global aberto', async () => {
      // Global explicitamente aberto; a fila fecha num dia que não é hoje.
      await db('sistema_kv').insert({ chave: 'horario', valor: JSON.stringify({ ativo: false }) })
        .onConflict('chave').merge();
      const hoje = new Date().getDay();
      await criarFila({
        slug: 'noturna', nome: 'Noturna',
        horario: JSON.stringify({ ativo: true, dias: [(hoje + 1) % 7], inicio: '00:00', fim: '23:59' }),
      });

      const conv = await criarConversa(db, { canal: 'whatsapp', telefone: '5584900000003' });
      const r = await motor.processarConversa(conv, { texto: 'oi' }, {
        fluxo: { dados: fluxoTransferencia('noturna') },
        estados: new Map(),
        enviar: async () => {},
      });

      assert.equal(r.respostas.at(-1)?.texto, 'Estamos fechados.');
      const depois = await db('conversas').where({ id: conv.id }).first();
      assert.notEqual(depois.status, 'aguardando', 'fora do horário não enfileira');
    });
  });

  // ── SLA POR FILA ────────────────────────────────────────────────
  describe('SLA por fila', () => {
    test('a mesma espera é "ok" numa fila e "crítica" na outra', async () => {
      const folgada = await criarFila({ slug: 'folgada', sla_atencao_min: 30, sla_critico_min: 60 });
      const apertada = await criarFila({ nome: 'Apertada', slug: 'apertada', sla_atencao_min: 1, sla_critico_min: 2 });
      await naFila(10, { fila_id: folgada.id });
      await naFila(10, { fila_id: apertada.id });

      const linhas = await db('conversas as c')
        .leftJoin('filas as f', 'f.id', 'c.fila_id')
        .select('f.slug', 'c.aguardando_desde', 'c.prioridade',
          'f.sla_atencao_min as atencao_min', 'f.sla_critico_min as critico_min');

      const nivel = Object.fromEntries(linhas.map(l =>
        [l.slug, filaService.calcularUrgencia(l.aguardando_desde, l.prioridade, l).nivel]));

      assert.equal(nivel.folgada, 'ok');
      assert.equal(nivel.apertada, 'critico');
    });
  });
});
