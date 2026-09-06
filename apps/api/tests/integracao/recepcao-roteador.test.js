/**
 * A máquina de estados do agente de RECEPÇÃO (`ia_roteador`), contra Postgres.
 *
 * Por que aqui e não num teste puro: `motorFluxo.js` só é importável quando há
 * `DATABASE_URL`, e o que precisa ser provado é justamente o ciclo de vida do
 * turno — quando o nó fala, quando ele espera, e por qual porta ele sai.
 *
 * O defeito que estes testes travam foi encontrado numa revisão do código, não
 * pela suíte: o guard de reentrada usava `estado.aguardando`, que é PERSISTIDO,
 * e `processarIAResponde` nunca escreve nesse campo. Ele voltava a `null` a
 * cada turno, e a recepção engolia a fala do cliente sim, outra não — num fluxo
 * `inicio → ia_roteador` (a recepção de verdade), a PRIMEIRA mensagem do
 * cliente ficava sem resposta nenhuma.
 *
 * Nenhum destes testes chama a Anthropic: sem credencial no banco de teste, o
 * turno que chega ao modelo cai no `catch` — e é isso que prova a outra metade,
 * o VOCABULÁRIO DE SAÍDA. O `ia_responde` sairia por `transferir`; a recepção
 * tem de sair por `nao_entendeu`.
 */
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { motivoSkip, prepararBanco, limpar, criarConversa } from './_ambiente.js';

const TABELAS = ['flow_executions', 'mensagens', 'conversas', 'fluxos'];

const ROTAS = [
  { id: 'financeiro', label: 'Financeiro',      descricao: 'boleto, pagamento, PIX' },
  { id: 'suporte',    label: 'Suporte Técnico', descricao: 'internet lenta ou fora do ar' },
];

/** Recepção na porta de entrada: `inicio → roteador`. */
const fluxoRecepcao = (cfgRoteador) => ({
  nodes: [
    { id: 'ini', tipo: 'inicio',      config: {} },
    { id: 'rec', tipo: 'ia_roteador', config: { rotas: ROTAS, ...cfgRoteador } },
    { id: 'fin', tipo: 'enviar_texto', config: { texto: 'FINANCEIRO' } },
    { id: 'sup', tipo: 'enviar_texto', config: { texto: 'SUPORTE' } },
    { id: 'duv', tipo: 'enviar_texto', config: { texto: 'NAO_ENTENDEU' } },
    { id: 'fim', tipo: 'encerrar',     config: {} },
  ],
  edges: [
    { from: 'ini', to: 'rec', port: 'saida' },
    { from: 'rec', to: 'fin', port: 'financeiro' },
    { from: 'rec', to: 'sup', port: 'suporte' },
    { from: 'rec', to: 'duv', port: 'nao_entendeu' },
    { from: 'rec', to: 'fim', port: 'encerrar' },
  ],
});

/** O outro uso do nó: "posso ajudar em mais alguma coisa?", depois de uma ação. */
const fluxoPosAcao = () => {
  const f = fluxoRecepcao({});
  f.nodes.unshift({ id: 'aviso', tipo: 'enviar_texto', config: { texto: 'Boleto enviado!' } });
  f.edges = [
    { from: 'ini',   to: 'aviso', port: 'saida' },
    { from: 'aviso', to: 'rec',   port: 'saida' },
    ...f.edges.filter(e => e.from === 'rec'),
  ];
  return f;
};

describe('RECEPÇÃO — o ia_roteador como agente', { skip: motivoSkip() }, () => {
  let db, motor;

  before(async () => {
    db    = await prepararBanco();
    motor = await import('../../src/services/motorFluxo.js');
  });
  after(async () => { await db?.destroy?.(); });
  beforeEach(async () => { await limpar(db, TABELAS); });

  /** Roda um turno capturando o que sairia para o cliente. */
  const turno = async (conversa, texto, dados) => {
    const respostas = [];
    await motor.processarConversa(conversa, { texto, tipo: 'texto' }, {
      fluxo: { id: 'f1', nome: 'recepção', dados },
      enviar: async (_c, resp) => { respostas.push(resp.texto); },
    });
    return respostas;
  };

  const estadoDe = async (id) => (await db('flow_executions').where({ conversa_id: id }).first())?.estado;

  test('sem mensagem inicial, a PRIMEIRA fala do cliente é respondida', async () => {
    // O defeito: com o guard baseado em `estado.aguardando`, este turno não
    // gerava resposta nenhuma — o cliente falava e ninguém respondia. Numa
    // recepção de verdade (quem cumprimenta é o próprio agente), era a primeira
    // impressão do atendimento inteiro.
    const c = await criarConversa(db, { telefone: '5584900000001' });
    const r = await turno(c, 'minha internet caiu', fluxoRecepcao({}));

    assert.ok(r.length > 0, 'a recepção engoliu a primeira mensagem do cliente');
    // Sem credencial de IA no banco de teste, o turno cai no catch — e o
    // caminho de erro da recepção é `nao_entendeu`, não `transferir`.
    assert.ok(r.includes('NAO_ENTENDEU'), `saiu por outra porta: ${JSON.stringify(r)}`);
  });

  test('erro no modelo sai por `nao_entendeu` — a porta que o ia_responde NÃO usa', async () => {
    // Prova o vocabulário de saída: em modo normal esta mesma falha sairia por
    // `transferir`, porta que não existe no `ia_roteador`. Sem o mapeamento,
    // cairia no 3º fallback do `encontrarProximo` (primeira aresta qualquer) e
    // o cliente iria para um ramo arbitrário, em silêncio.
    const c = await criarConversa(db, { telefone: '5584900000002' });
    const r = await turno(c, 'quero a segunda via', fluxoRecepcao({}));
    // O cliente é avisado E o fluxo segue pela porta — as duas coisas.
    assert.equal(r.at(-1), 'NAO_ENTENDEU', `saiu por outra porta: ${JSON.stringify(r)}`);
    assert.match(r[0], /erro/i, 'o cliente tem de saber que algo falhou');
  });

  test('com mensagem inicial, ela é enviada e o fluxo ESPERA', async () => {
    const c = await criarConversa(db, { telefone: '5584900000003' });
    const r = await turno(c, 'oi', fluxoRecepcao({ mensagem: 'Olá! Como posso ajudar?' }));

    assert.deepEqual(r, ['Olá! Como posso ajudar?'], 'não deve rotear no mesmo turno da saudação');
    const e = await estadoDe(c.id);
    assert.equal(e.aguardando, 'rec', 'ficou esperando a resposta do cliente');
    assert.equal(e.contexto._roteador_rec, true, 'marcou que já cumprimentou');
  });

  test('a saudação NÃO se repete no turno seguinte', async () => {
    const c = await criarConversa(db, { telefone: '5584900000004' });
    const dados = fluxoRecepcao({ mensagem: 'Olá! Como posso ajudar?' });
    await turno(c, 'oi', dados);
    const r = await turno(c, 'quero boleto', dados);

    assert.ok(!r.includes('Olá! Como posso ajudar?'), 'cumprimentou de novo no meio da conversa');
  });

  test('a saudação VOLTA numa nova visita ao nó', async () => {
    // `limparNo()` apaga a flag em toda saída. Sem isso, um nó cabeado como
    // "posso ajudar em mais alguma coisa?" ficaria mudo da segunda vez em
    // diante. A flag antiga era posta em `false` (falsy) e tinha o problema
    // oposto: repetia a saudação no meio da mesma visita.
    const c = await criarConversa(db, { telefone: '5584900000005' });
    const dados = fluxoRecepcao({ mensagem: 'Olá! Como posso ajudar?' });
    await turno(c, 'oi', dados);
    await turno(c, 'quero boleto', dados);          // sai por nao_entendeu (sem IA)

    const e = await estadoDe(c.id);
    assert.ok(!e || !e.contexto?._roteador_rec, 'a flag de saudação sobreviveu à saída do nó');
  });

  test('alcançado no MEIO do turno, depois de outro nó já ter falado, ele espera', async () => {
    // É a cabeação de "posso ajudar em mais alguma coisa?". Responder aqui
    // gastaria uma chamada de API respondendo uma fala que o nó anterior já
    // tratou, e mandaria duas mensagens seguidas ao cliente.
    const c = await criarConversa(db, { telefone: '5584900000006' });
    const r = await turno(c, 'oi', fluxoPosAcao());

    assert.deepEqual(r, ['Boleto enviado!'], 'não podia rotear no mesmo turno');
    assert.equal((await estadoDe(c.id)).aguardando, 'rec');
  });

  test('nó sem rota nenhuma sai por `nao_entendeu` sem chamar o modelo', async () => {
    const c = await criarConversa(db, { telefone: '5584900000007' });
    const dados = fluxoRecepcao({});
    dados.nodes.find(n => n.id === 'rec').config.rotas = [];
    assert.deepEqual(await turno(c, 'oi', dados), ['NAO_ENTENDEU']);
  });
});
