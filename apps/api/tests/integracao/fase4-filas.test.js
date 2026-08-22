/**
 * Os 14 critérios de aceite da FASE 4 (Inbox, Outbox e Jobs), contra Postgres.
 *
 * O que só o banco prova: a unique de `dedup_hash`, `FOR UPDATE SKIP LOCKED`,
 * o lease vencido, a ordem por conversa via `DISTINCT ON` e o ciclo de vida da
 * execução parada em timer. As decisões de TEMPO (backoff, TTL, expiração)
 * estão na suíte pura, em `politicaRetry.test.js` — aqui não se testa relógio.
 *
 * Nenhum teste daqui fala com a Evolution/Telegram/Anthropic: o dispatcher é
 * injetado (`{enviar}`) e os fluxos usados só têm nós que não chamam rede.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

/** Fluxo: avisa → espera 300 s de verdade → avisa de novo → encerra. */
const FLUXO_ESPERA = {
  id: 'aaaaaaaa-0000-4000-8000-000000000001',
  nome: 'Espera real',
  dados: {
    nodes: [
      { id: 'ini',   tipo: 'inicio',         config: {} },
      { id: 'oi',    tipo: 'enviar_texto',   config: { texto: 'Já volto.' } },
      { id: 'pausa', tipo: 'aguardar_tempo', config: { segundos: 300 } },
      { id: 'volta', tipo: 'enviar_texto',   config: { texto: 'Voltei!' } },
      { id: 'fim',   tipo: 'encerrar',       config: {} },
    ],
    edges: [
      { from: 'ini',   to: 'oi',    port: 'saida' },
      { from: 'oi',    to: 'pausa', port: 'saida' },
      { from: 'pausa', to: 'volta', port: 'saida' },
      { from: 'volta', to: 'fim',   port: 'saida' },
    ],
  },
};

/** Fluxo: pergunta com timeout de 60 s; a porta `timeout` leva a outro texto. */
const FLUXO_TIMEOUT = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  nome: 'Pergunta com timeout',
  dados: {
    nodes: [
      { id: 'ini',      tipo: 'inicio',            config: {} },
      { id: 'pergunta', tipo: 'aguardar_resposta', config: { mensagem: 'Qual seu nome?', variavel: 'nome', timeout: 60 } },
      { id: 'ok',       tipo: 'enviar_texto',      config: { texto: 'Prazer!' } },
      { id: 'desistiu', tipo: 'enviar_texto',      config: { texto: 'Ficou por isso mesmo.' } },
      { id: 'fim',      tipo: 'encerrar',          config: {} },
    ],
    edges: [
      { from: 'ini',      to: 'pergunta', port: 'saida' },
      { from: 'pergunta', to: 'ok',       port: 'saida' },
      { from: 'pergunta', to: 'desistiu', port: 'timeout' },
      { from: 'ok',       to: 'fim',      port: 'saida' },
      { from: 'desistiu', to: 'fim',      port: 'saida' },
    ],
  },
};

/** Fluxo trivial só para o inbox ter o que rodar sem gerar envio nenhum. */
const FLUXO_MUDO = {
  nome: 'Mudo',
  ativo: true,
  dados: JSON.stringify({
    nodes: [{ id: 'ini', tipo: 'inicio', config: {} }, { id: 'fim', tipo: 'encerrar', config: {} }],
    edges: [{ from: 'ini', to: 'fim', port: 'saida' }],
  }),
};

const TABELAS = ['inbox', 'outbox', 'jobs', 'flow_executions', 'mensagens', 'conversas', 'fluxos', 'audit_log'];

describe('FASE 4 — inbox, outbox e jobs', { skip: motivoSkip() }, () => {
  let db, inbox, outbox, jobs, motor, filaDb, worker, estadoStore;

  before(async () => {
    db = await prepararBanco();
    inbox       = await import('../../src/services/inbox.js');
    outbox      = await import('../../src/services/outbox.js');
    jobs        = await import('../../src/services/jobs.js');
    filaDb      = await import('../../src/services/filaDb.js');
    worker      = await import('../../src/services/workerFilas.js');
    motor       = await import('../../src/services/motorFluxo.js');
    ({ estadoStore } = await import('../../src/services/estadoStore.js'));
  });

  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  // ── INBOX ───────────────────────────────────────────────────────
  describe('inbox', () => {
    test('o webhook só persiste: o handler roda depois, no worker', async () => {
      const corpo = JSON.stringify({ event: 'connection.update', data: { state: 'open' } });
      const r = await inbox.receber('evolution', corpo, JSON.parse(corpo), { cutucar: false });

      assert.equal(r.duplicada, false);
      const linha = await db('inbox').where({ id: r.id }).first();
      assert.equal(linha.status, 'pendente');
      assert.equal(linha.tentativas, 0);

      await inbox.processarPendentes({ db });
      const depois = await db('inbox').where({ id: r.id }).first();
      assert.equal(depois.status, 'ok');
      assert.equal(depois.tentativas, 1, 'a reivindicação conta a passada');
      assert.ok(depois.processado_em);
    });

    test('reentrega byte-idêntica não produz segundo processamento', async () => {
      const corpo = JSON.stringify({ event: 'connection.update', data: { state: 'open' } });
      const a = await inbox.receber('evolution', corpo, JSON.parse(corpo), { cutucar: false });
      const b = await inbox.receber('evolution', corpo, JSON.parse(corpo), { cutucar: false });

      assert.equal(a.duplicada, false);
      assert.equal(b.duplicada, true, 'o mesmo payload entrou duas vezes');
      assert.equal(Number((await db('inbox').count('id as n').first()).n), 1);
    });

    test('o MESMO corpo em canais diferentes não colide', async () => {
      const corpo = JSON.stringify({ ping: 1 });
      await inbox.receber('evolution', corpo, { ping: 1 }, { cutucar: false });
      const b = await inbox.receber('telegram', corpo, { ping: 1 }, { cutucar: false });
      assert.equal(b.duplicada, false);
    });

    test('entrega da Meta com 3 mensagens num único POST processa as 3', async () => {
      await db('fluxos').insert(FLUXO_MUDO);
      const msg = (id, texto) => ({ id, from: '5584911110000', type: 'text', text: { body: texto }, timestamp: '1' });
      const body = {
        entry: [{ changes: [{ field: 'messages', value: {
          contacts: [{ wa_id: '5584911110000', profile: { name: 'Fulano' } }],
          messages: [msg('wamid.1', 'um'), msg('wamid.2', 'dois'), msg('wamid.3', 'três')],
        } }] }],
      };

      await inbox.receber('meta', JSON.stringify(body), body, { cutucar: false });
      await inbox.processarPendentes({ db });

      const textos = await db('mensagens').where({ origem: 'cliente' }).orderBy('criado_em').pluck('texto');
      assert.deepEqual(textos, ['um', 'dois', 'três']);
      assert.equal((await db('inbox').first()).status, 'ok');
    });

    test('connection.update (evento sem id) entra sem violar constraint', async () => {
      const body = { event: 'connection.update', data: { state: 'close' } };
      const r = await inbox.receber('evolution', JSON.stringify(body), body, { cutucar: false });
      assert.equal(r.duplicada, false);
      await inbox.processarPendentes({ db });
      assert.equal((await db('inbox').first()).status, 'ok');
    });

    test('entrada que estoura vai para a DLQ com o erro e uma linha de auditoria', async () => {
      const body = { qualquer: 'coisa' };
      await inbox.receber('canal_inexistente', JSON.stringify(body), body, { cutucar: false });
      await inbox.processarPendentes({ db });

      const linha = await db('inbox').first();
      assert.equal(linha.status, 'falha');
      assert.match(linha.ultimo_erro, /canal desconhecido/);

      // `auditar` é fire-and-forget de propósito; dá tempo do insert cair.
      await new Promise(r => setTimeout(r, 50));
      const audit = await db('audit_log').where({ action: 'dlq_entrada' }).first();
      assert.equal(audit.actor_type, 'system');
    });
  });

  // ── OUTBOX ──────────────────────────────────────────────────────
  describe('outbox', () => {
    const destino = { numero: '5584911110000', instancia: 'inst' };

    test('morte entre persistir e enviar deixa linha pendente que o worker entrega', async () => {
      const c = await criarConversa(db, { telefone: destino.numero, status: 'ia' });

      // O processo "morre" aqui: registrou a intenção e não chegou a entregar.
      const { linha, esperar } = await outbox.registrar(c, { tipo: 'texto', texto: 'menu' }, destino);
      assert.equal(esperar, false);
      assert.equal(linha.status, 'pendente');

      // O worker do próximo boot encontra a linha e entrega.
      const enviados = [];
      await outbox.processarPendentes({
        db,
        enviar: async (canal, d, resp) => {
          enviados.push([canal, d, resp]);
          return { despachado: true, retorno: { key: { id: 'X1' } } };
        },
      });

      const final = await db('outbox').where({ id: linha.id }).first();
      assert.equal(final.status, 'enviada');
      assert.equal(final.external_id, 'X1', 'guarda o id do provedor (§126)');
      assert.equal(enviados.length, 1);
    });

    test('resposta 1 pendente segura a resposta 2 — nada chega fora de ordem', async () => {
      const c = await criarConversa(db, { telefone: destino.numero, status: 'ia' });

      const a = await outbox.registrar(c, { tipo: 'texto', texto: 'saudação' }, destino);
      const b = await outbox.registrar(c, { tipo: 'texto', texto: 'menu' }, destino);

      assert.equal(a.esperar, false, 'a primeira sai inline');
      assert.equal(b.esperar, true,  'a segunda espera a vez');

      // O worker também respeita a ordem: só a mais antiga é reivindicada.
      const enviados = [];
      const enviar = async (_canal, _d, resp) => { enviados.push(resp.texto); return { despachado: true }; };
      const rodada = async () => {
        const { rows } = await db.raw(
          `SELECT DISTINCT ON (conversa_id) id FROM outbox
            WHERE status IN ('pendente','processando') ORDER BY conversa_id, criado_em, id`);
        for (const r of rows) {
          const [l] = await db('outbox').where({ id: r.id }).where({ status: 'pendente' })
            .update({ status: 'processando', tentativas: db.raw('tentativas + 1') }).returning('*');
          if (l) await outbox.entregar(l, { db, enviar });
        }
      };
      await rodada();
      await rodada();
      assert.deepEqual(enviados, ['saudação', 'menu']);
    });

    test('tipo que o canal não suporta termina em `nao_suportada`, não em silêncio', async () => {
      const c = await criarConversa(db, { telefone: destino.numero, status: 'ia', canal: 'whatsapp' });
      const { linha } = await outbox.registrar(c, { tipo: 'localizacao', lat: 1, lng: 2 }, destino);

      // Dispatcher real, adapters reais: a Evolution não implementa localizacao.
      const { criarDispatcher } = await import('../../src/services/canais/index.js');
      const { criarAdapterEvolution } = await import('../../src/services/canais/evolution.js');
      const enviar = criarDispatcher({ whatsapp: criarAdapterEvolution({}) });

      await outbox.entregar(linha, { db, enviar });
      const final = await db('outbox').where({ id: linha.id }).first();
      assert.equal(final.status, 'nao_suportada');
      assert.match(final.ultimo_erro, /localizacao/);
    });

    test('falha de transporte agenda nova tentativa (não é a mesma coisa que não suportar)', async () => {
      const c = await criarConversa(db, { telefone: destino.numero, status: 'ia' });
      const { linha } = await outbox.registrar(c, { tipo: 'texto', texto: 'oi' }, destino);

      await outbox.entregar(linha, { db, enviar: async () => { throw new Error('provedor fora'); } });
      const final = await db('outbox').where({ id: linha.id }).first();
      assert.equal(final.status, 'pendente');
      assert.equal(final.tentativas, 1);
      assert.ok(new Date(final.proxima_tentativa_em) > new Date(final.criado_em));
    });
  });

  // ── ESPERA COM RELÓGIO ──────────────────────────────────────────
  describe('aguardar_tempo e aguardar_resposta', () => {
    const enviados = [];
    const turno = (conversa, texto, fluxo) =>
      motor.processarConversa(conversa, { texto, tipo: 'texto' }, {
        fluxo, enviar: (_c, resp) => { enviados.push(resp.texto); },
      });

    beforeEach(() => { enviados.length = 0; });

    test('aguardar_tempo PARA de verdade e agenda a retomada', async () => {
      const c = await criarConversa(db, { telefone: '5584922220001', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);

      assert.deepEqual(enviados, ['Já volto.'], 'não avançou para o "Voltei!"');

      const job = await db('jobs').first();
      assert.equal(job.tipo, 'flow_resume');
      assert.equal(job.chave, `${c.id}:pausa`);
      assert.ok(new Date(job.executar_em) > new Date(Date.now() + 250_000), 'agendou ~300s à frente');

      const estado = await estadoStore.get(c.id);
      assert.equal(estado.aguardandoTimer, 'pausa');
      assert.ok(estado._parkedAte, 'o TTL de 2h não pode matar a espera');
    });

    test('cliente que escreve durante a espera não agenda um segundo job', async () => {
      const c = await criarConversa(db, { telefone: '5584922220002', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);
      await turno(c, 'alô?', FLUXO_ESPERA);
      await turno(c, 'tem alguém aí?', FLUXO_ESPERA);

      assert.equal(Number((await db('jobs').count('id as n').first()).n), 1);
      assert.deepEqual(enviados, ['Já volto.'], 'segue parado, sem repetir nada');
      assert.equal((await estadoStore.get(c.id)).aguardandoTimer, 'pausa');
    });

    test('o job vencido retoma pela porta `saida` e limpa a marca de espera', async () => {
      const c = await criarConversa(db, { telefone: '5584922220003', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);
      await db('jobs').update({ executar_em: new Date(Date.now() - 1000) });

      const retomou = await motor.retomarTimer(c.id, 'pausa', {
        fluxo: FLUXO_ESPERA, enviar: (_c, resp) => { enviados.push(resp.texto); },
      });

      assert.equal(retomou, true);
      assert.deepEqual(enviados, ['Já volto.', 'Voltei!']);
      assert.equal(await estadoStore.get(c.id), null, 'o fluxo terminou: a execução some');
    });

    test('timer em conversa que um humano assumiu é no-op', async () => {
      const c = await criarConversa(db, { telefone: '5584922220004', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);
      await db('conversas').where({ id: c.id }).update({ status: 'ativa' });

      assert.equal(await motor.retomarTimer(c.id, 'pausa'), false);
      assert.deepEqual(enviados, ['Já volto.']);
    });

    test('o worker executa o job vencido e marca `ok`', async () => {
      const c = await criarConversa(db, { telefone: '5584922220005', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);
      await db('jobs').update({ executar_em: new Date(Date.now() - 1000) });

      // A conversa foi encerrada: `retomarTimer` vira no-op e nada é enviado —
      // o que está sob teste é o CICLO do job, não o conteúdo do turno.
      await db('conversas').where({ id: c.id }).update({ status: 'encerrada' });
      await jobs.processarVencidos({ db });

      const job = await db('jobs').first();
      assert.equal(job.status, 'ok');
      assert.equal(job.tentativas, 1);
    });

    test('timeout de aguardar_resposta sai pela porta `timeout` e NÃO grava resposta vazia', async () => {
      const c = await criarConversa(db, { telefone: '5584922220006', status: 'ia' });
      await turno(c, 'oi', FLUXO_TIMEOUT);
      assert.deepEqual(enviados, ['Qual seu nome?']);

      const job = await db('jobs').first();
      assert.equal(job.tipo, 'wait_timeout');

      await motor.retomarTimer(c.id, 'pergunta', {
        fluxo: FLUXO_TIMEOUT, enviar: (_c, resp) => { enviados.push(resp.texto); },
      });

      assert.deepEqual(enviados, ['Qual seu nome?', 'Ficou por isso mesmo.']);
      const msgs = await db('mensagens').where({ conversa_id: c.id }).pluck('texto');
      assert.ok(!msgs.includes(''), 'nenhuma resposta vazia foi gravada como do cliente');
    });

    test('cliente que responde a tempo cancela o job e segue pela porta `saida`', async () => {
      const c = await criarConversa(db, { telefone: '5584922220007', status: 'ia' });
      await turno(c, 'oi', FLUXO_TIMEOUT);
      await turno(c, 'Maria', FLUXO_TIMEOUT);

      assert.deepEqual(enviados, ['Qual seu nome?', 'Prazer!']);
      assert.equal(Number((await db('jobs').count('id as n').first()).n), 0, 'o job foi cancelado');
    });

    test('_parkedAte futuro segura a execução além do TTL de 2h; sem ele, ela morre', async () => {
      const c = await criarConversa(db, { telefone: '5584922220008', status: 'ia' });
      await turno(c, 'oi', FLUXO_ESPERA);

      // 4h atrás, mas parada em timer com hora marcada no futuro.
      await db('flow_executions').where({ conversa_id: c.id })
        .update({ atualizado_em: new Date(Date.now() - 4 * 3600_000) });
      assert.ok(await estadoStore.get(c.id), 'espera de timer não é abandono');

      const estado = await estadoStore.get(c.id);
      delete estado._parkedAte;
      await db('flow_executions').where({ conversa_id: c.id })
        .update({ estado: JSON.stringify(estado), atualizado_em: new Date(Date.now() - 4 * 3600_000) });
      assert.equal(await estadoStore.get(c.id), null, 'sem _parkedAte, o TTL normal volta a valer');
    });

    test('sandbox não escreve linha em inbox, outbox nem jobs', async () => {
      const estados = new Map();
      await motor.processarConversa(
        { id: 'sandbox:11111111-1111-4111-8111-111111111111', canal: 'whatsapp', telefone: '55849' },
        { texto: 'oi', tipo: 'texto' },
        { fluxo: FLUXO_ESPERA, estados, sandbox: true, enviar: (_c, r) => enviados.push(r.texto) },
      );

      assert.deepEqual(enviados, ['Já volto.', 'Voltei!'], 'no sandbox o tempo não passa: avança na hora');
      for (const t of ['inbox', 'outbox', 'jobs']) {
        assert.equal(Number((await db(t).count('id as n').first()).n), 0, `escreveu em ${t}`);
      }
    });
  });

  // ── LEASE, RECLAIM E DRENO ──────────────────────────────────────
  describe('lease e dreno', () => {
    test('lease vencido volta para `pendente` no outbox e para `falha` no inbox/jobs', async () => {
      const c = await criarConversa(db, { telefone: '5584933330001', status: 'ia' });
      const velho = new Date(Date.now() - 10 * 60_000);

      await db('inbox').insert({ canal: 'evolution', dedup_hash: 'h1', payload: '{}', status: 'processando', reivindicado_em: velho });
      await db('jobs').insert({ tipo: 'flow_resume', chave: 'k1', payload: '{}', executar_em: velho, status: 'processando', reivindicado_em: velho });
      await db('outbox').insert({ conversa_id: c.id, canal: 'whatsapp', payload: '{}', status: 'processando', reivindicado_em: velho, expira_em: new Date(Date.now() + 3600_000) });

      for (const t of ['inbox', 'outbox', 'jobs']) await filaDb.reclamarLeases(db, t);

      assert.equal((await db('inbox').first()).status,  'falha',    'reprocessar turno é escrita: decisão humana');
      assert.equal((await db('jobs').first()).status,   'falha');
      assert.equal((await db('outbox').first()).status, 'pendente', 'reenviar é seguro');
      assert.match((await db('inbox').first()).ultimo_erro, /lease expirado/);
    });

    test('lease fresco NÃO é reivindicado por outro tick', async () => {
      await db('inbox').insert({ canal: 'evolution', dedup_hash: 'h2', payload: '{}', status: 'processando', reivindicado_em: new Date() });
      await filaDb.reclamarLeases(db, 'inbox');
      assert.equal((await db('inbox').first()).status, 'processando');
    });

    test('duas reivindicações simultâneas não pegam a mesma linha (SKIP LOCKED)', async () => {
      for (let i = 0; i < 4; i++) {
        await db('inbox').insert({ canal: 'evolution', dedup_hash: `c${i}`, payload: '{}', status: 'pendente' });
      }
      const [a, b] = await Promise.all([
        filaDb.reivindicar(db, 'inbox', { ordem: 'recebido_em', limite: 4 }),
        filaDb.reivindicar(db, 'inbox', { ordem: 'recebido_em', limite: 4 }),
      ]);
      const ids = [...a, ...b].map(l => l.id);
      assert.equal(new Set(ids).size, ids.length, 'a mesma linha foi reivindicada duas vezes');
      assert.equal(ids.length, 4);
    });

    test('SIGTERM devolve a `pendente` o lote reivindicado', async () => {
      await db('inbox').insert({ canal: 'evolution', dedup_hash: 'd1', payload: '{}', status: 'pendente' });
      const [linha] = await filaDb.reivindicar(db, 'inbox', { ordem: 'recebido_em', limite: 1 });
      assert.equal(linha.status, 'processando');

      await filaDb.liberar(db, 'inbox', [linha.id]);
      const depois = await db('inbox').where({ id: linha.id }).first();
      assert.equal(depois.status, 'pendente');
      assert.equal(depois.reivindicado_em, null);
    });

    test('o tick do worker roda inteiro sem nada na fila', async () => {
      await worker.tick({ db });   // não pode explodir com as tabelas vazias
      assert.ok(true);
    });
  });
});
