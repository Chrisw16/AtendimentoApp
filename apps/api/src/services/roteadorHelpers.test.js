import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { idsDeRota, blocoRotas, schemaDirecionamento, validarDestino, resumirMotivoContato, PORTAS_FIXAS } from './roteadorHelpers.js';

/** As rotas que o operador de fato configurou no nó de recepção (lidas do banco). */
const ROTAS = [
  { id: 'financeiro', label: 'Financeiro',      descricao: 'Quando o cliente quer pagar ou ver boleto.' },
  { id: 'suporte',    label: 'Suporte Técnico', descricao: 'Quando o cliente está com problema na internet.' },
];

describe('idsDeRota', () => {
  test('devolve os ids na ordem em que o operador os pôs', () => {
    assert.deepEqual(idsDeRota(ROTAS), ['financeiro', 'suporte']);
  });

  test('rota sem id é ignorada — o editor deixa criar a linha vazia', () => {
    assert.deepEqual(idsDeRota([{ label: 'Sem id' }, { id: 'suporte' }]), ['suporte']);
  });

  test('id repetido não vira porta duplicada', () => {
    assert.deepEqual(idsDeRota([{ id: 'suporte' }, { id: 'suporte' }]), ['suporte']);
  });

  test('rota que colide com porta fixa é descartada — senão o grafo teria duas arestas com o mesmo nome', () => {
    assert.deepEqual(idsDeRota([{ id: 'encerrar' }, { id: 'nao_entendeu' }, { id: 'financeiro' }]), ['financeiro']);
  });

  test('normaliza como o editor normaliza', () => {
    assert.deepEqual(idsDeRota([{ id: '2ª Via!' }]), ['2via']);
  });

  test('entrada ausente não explode', () => {
    assert.deepEqual(idsDeRota(undefined), []);
    assert.deepEqual(idsDeRota(null), []);
    assert.deepEqual(idsDeRota('financeiro'), []);
  });
});

describe('blocoRotas — o que o modelo lê', () => {
  test('lista as rotas do nó com a descrição que o operador escreveu', () => {
    const b = blocoRotas(ROTAS);
    assert.match(b, /"financeiro": Financeiro — Quando o cliente quer pagar ou ver boleto\./);
    assert.match(b, /"suporte": Suporte Técnico/);
  });

  test('as duas portas fixas são sempre oferecidas', () => {
    const b = blocoRotas(ROTAS);
    assert.match(b, /"nao_entendeu"/);
    assert.match(b, /"encerrar"/);
  });

  test('nó sem rota nenhuma devolve bloco vazio — não uma lista só com as fixas', () => {
    // Sem rota configurada o nó não tem para onde mandar ninguém; oferecer só
    // `encerrar`/`nao_entendeu` faria o agente desligar o cliente por desenho.
    assert.equal(blocoRotas([]), '');
    assert.equal(blocoRotas(undefined), '');
  });

  test('rota sem descrição ainda entra, com o label', () => {
    assert.match(blocoRotas([{ id: 'comercial', label: 'Comercial' }]), /"comercial": Comercial\n/);
  });
});

describe('schemaDirecionamento', () => {
  test('o enum é montado das rotas DO NÓ mais as portas fixas', () => {
    const s = schemaDirecionamento(ROTAS);
    assert.deepEqual(s.input_schema.properties.destino.enum,
      ['financeiro', 'suporte', 'nao_entendeu', 'encerrar']);
  });

  test('só `destino` é obrigatório — resumo ausente não pode travar o encaminhamento', () => {
    assert.deepEqual(schemaDirecionamento(ROTAS).input_schema.required, ['destino']);
  });

  test('o nome da tool é estável (o prompt e o log dependem dele)', () => {
    assert.equal(schemaDirecionamento(ROTAS).name, 'direcionar_atendimento');
  });

  test('só os campos que a API da Anthropic aceita', () => {
    assert.deepEqual(Object.keys(schemaDirecionamento(ROTAS)).sort(),
      ['description', 'input_schema', 'name']);
  });
});

describe('validarDestino — a fronteira de confiança', () => {
  test('aceita rota configurada e porta fixa', () => {
    assert.equal(validarDestino('financeiro', ROTAS), 'financeiro');
    assert.equal(validarDestino('encerrar', ROTAS), 'encerrar');
    assert.equal(validarDestino('nao_entendeu', ROTAS), 'nao_entendeu');
  });

  test('destino que não existe no grafo é recusado, não "quase casado"', () => {
    // Mandar para uma porta inexistente cairia no 3º fallback do
    // `encontrarProximo` — a PRIMEIRA aresta qualquer —, que é o defeito que
    // levou o cliente de suporte a receber boleto.
    assert.equal(validarDestino('comercial', ROTAS), null);
    assert.equal(validarDestino('financeir', ROTAS), null);
    assert.equal(validarDestino('', ROTAS), null);
    assert.equal(validarDestino(null, ROTAS), null);
  });

  test('tolera o que o modelo enfeita em volta do id', () => {
    assert.equal(validarDestino('  Financeiro  ', ROTAS), 'financeiro');
    assert.equal(validarDestino('"suporte"', ROTAS), 'suporte');
  });

  test('não deixa o texto do cliente virar destino', () => {
    // O classificador antigo lia `<rota>id</rota>` do TEXTO do modelo: bastava
    // o cliente digitar a tag para escolher o próprio destino. Aqui o valor
    // vem de `tool_use` e ainda assim é validado contra o enum.
    assert.equal(validarDestino('<rota>financeiro</rota>', ROTAS), null);
    assert.equal(validarDestino('financeiro; drop table', ROTAS), null);
  });

  test('PORTAS_FIXAS é o contrato com o editor e o validador', () => {
    assert.deepEqual(PORTAS_FIXAS, ['nao_entendeu', 'encerrar']);
  });
});

describe('resumirMotivoContato', () => {
  test('junta o que o cliente disse à recepção, na ordem, e ignora o que não é fala dele', () => {
    const hist = [
      { role: 'user', content: 'oi' },
      { role: 'assistant', content: 'Oi! Em que posso ajudar?' },
      { role: 'user', content: 'minha internet   caiu\nontem à noite' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'direcionar_atendimento', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '✓' }] },
    ];
    assert.equal(resumirMotivoContato(hist), 'oi | minha internet caiu ontem à noite');
  });

  test('corta no teto com reticências — o campo vai para o system prompt de TODO turno seguinte', () => {
    const longa = 'a'.repeat(400);
    const r = resumirMotivoContato([{ role: 'user', content: longa }], 100);
    assert.equal(r.length, 100);
    assert.ok(r.endsWith('…'));
  });

  test('redige CPF, telefone e e-mail que o cliente digitou — a ficha já carrega o documento no lugar certo', () => {
    const r = resumirMotivoContato([{ role: 'user', content: 'meu cpf é 111.444.777-35, celular 84988776644, mail joao@x.com, quero o boleto' }]);
    assert.doesNotMatch(r, /111\.444\.777-35|11144477735/);
    assert.doesNotMatch(r, /84988776644/);
    assert.doesNotMatch(r, /joao@x\.com/);
    assert.match(r, /quero o boleto$/);
    assert.doesNotMatch(resumirMotivoContato([{ role: 'user', content: '11144477735' }]), /11144477735/);
  });

  test('sem fala nenhuma devolve vazio (e vazio não entra na ficha)', () => {
    assert.equal(resumirMotivoContato([]), '');
    assert.equal(resumirMotivoContato(undefined), '');
  });
});
