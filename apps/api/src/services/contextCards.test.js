import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { gerarCards } from './contextCards.js';

const AGORA = Date.parse('2026-08-22T12:00:00Z');
const haDias = (d) => new Date(AGORA - d * 86_400_000).toISOString();
const ids = (ficha) => gerarCards(ficha, AGORA).map(c => c.id);

describe('gerarCards — o silêncio importa', () => {
  test('ficha vazia não gera cartão nenhum', () => {
    assert.deepEqual(gerarCards({}, AGORA), []);
    assert.deepEqual(gerarCards(undefined, AGORA), []);
  });

  test('cliente em dia e online não vira alerta', () => {
    assert.deepEqual(ids({
      contratos: [{ status: 'ativo', titulos_abertos: 0, valor_aberto: 0 }],
      conexao: { online: true },
      chamados: [],
    }), []);
  });

  test('conexão NÃO consultada não afirma offline', () => {
    assert.ok(!ids({ conexao: null }).includes('conexao_offline'));
    assert.ok(!ids({}).includes('conexao_offline'));
  });
});

describe('financeiro', () => {
  test('título aberto é alerta; suspenso COM débito é crítico', () => {
    assert.ok(ids({ contratos: [{ status: 'ativo', titulos_abertos: 1, valor_aberto: 99.9 }] })
      .includes('titulos_em_aberto'));
    const s = gerarCards({ contratos: [{ status: 'suspenso', titulos_abertos: 2, valor_aberto: 199.8 }] }, AGORA);
    assert.equal(s[0].id, 'suspenso_por_debito');
    assert.equal(s[0].severidade, 'critico');
    assert.ok(!s.some(c => c.id === 'titulos_em_aberto'), 'os dois juntos seriam a mesma notícia duas vezes');
  });

  test('soma o valor de TODOS os contratos', () => {
    const [card] = gerarCards({ contratos: [
      { status: 'ativo', titulos_abertos: 1, valor_aberto: 100 },
      { status: 'ativo', titulos_abertos: 2, valor_aberto: 50.5 },
    ] }, AGORA);
    assert.match(card.detalhe, /150\.50/);
    assert.match(card.titulo, /3 título/);
  });

  test('suspenso SEM débito não vira cartão financeiro', () => {
    assert.ok(!ids({ contratos: [{ status: 'suspenso', titulos_abertos: 0 }] }).includes('suspenso_por_debito'));
  });
});

describe('chamados e recorrência', () => {
  test('3 chamados em 30 dias alerta; 2 não', () => {
    const tres = { chamados: [{ data_cadastro: haDias(1) }, { data_cadastro: haDias(10) }, { data_cadastro: haDias(20) }] };
    assert.ok(ids(tres).includes('multiplos_chamados'));
    assert.ok(!ids({ chamados: tres.chamados.slice(0, 2) }).includes('multiplos_chamados'));
  });

  test('chamados antigos não contam', () => {
    assert.ok(!ids({ chamados: [{ data_cadastro: haDias(60) }, { data_cadastro: haDias(90) }, { data_cadastro: haDias(120) }] })
      .includes('multiplos_chamados'));
  });

  test('data inválida não conta como recente', () => {
    assert.ok(!ids({ chamados: [{ data_cadastro: 'xx' }, { data_cadastro: null }, { data_cadastro: undefined }] })
      .includes('multiplos_chamados'));
  });

  test('3 conversas anteriores marcam recorrência', () => {
    assert.ok(ids({ conversas_anteriores: 3 }).includes('cliente_recorrente'));
    assert.ok(!ids({ conversas_anteriores: 2 }).includes('cliente_recorrente'));
  });
});

describe('NPS', () => {
  test('detrator recente vira cartão, promotor não', () => {
    assert.ok(ids({ ultimo_nps: { nota: 4, escala: 10, criado_em: haDias(5) } }).includes('nps_detrator'));
    assert.ok(!ids({ ultimo_nps: { nota: 9, escala: 10, criado_em: haDias(5) } }).includes('nps_detrator'));
  });

  test('a escala 1-5 tem faixa própria — nota 2 é detrator, 4 não', () => {
    assert.ok(ids({ ultimo_nps: { nota: 2, escala: 5, criado_em: haDias(5) } }).includes('nps_detrator'));
    assert.ok(!ids({ ultimo_nps: { nota: 4, escala: 5, criado_em: haDias(5) } }).includes('nps_detrator'),
      'sem a escala, 4 seria lido como detrator de 0-10 e a nota BOA viraria alerta');
  });

  test('insatisfação de um ano atrás não assombra o atendimento de hoje', () => {
    assert.ok(!ids({ ultimo_nps: { nota: 2, escala: 10, criado_em: haDias(200) } }).includes('nps_detrator'));
  });

  test('nota ausente ou lixo é ignorada', () => {
    assert.ok(!ids({ ultimo_nps: { nota: null } }).includes('nps_detrator'));
    assert.ok(!ids({ ultimo_nps: { nota: 'abc', criado_em: haDias(1) } }).includes('nps_detrator'));
  });
});

describe('risco de churn — exige COMBINAÇÃO', () => {
  test('um sinal sozinho não acusa churn', () => {
    assert.ok(!ids({ contratos: [{ status: 'ativo', titulos_abertos: 1, valor_aberto: 50 }] }).includes('risco_churn'));
    assert.ok(!ids({ ultimo_nps: { nota: 3, escala: 10, criado_em: haDias(2) } }).includes('risco_churn'));
  });

  test('débito + insatisfação acusa', () => {
    assert.ok(ids({
      contratos: [{ status: 'ativo', titulos_abertos: 1, valor_aberto: 50 }],
      ultimo_nps: { nota: 3, escala: 10, criado_em: haDias(2) },
    }).includes('risco_churn'));
  });

  test('chamados repetidos + débito acusa', () => {
    assert.ok(ids({
      contratos: [{ status: 'suspenso', titulos_abertos: 2, valor_aberto: 200 }],
      chamados: [{ data_cadastro: haDias(3) }, { data_cadastro: haDias(9) }],
    }).includes('risco_churn'));
  });
});

describe('ordem e forma', () => {
  test('o crítico vem antes do informativo', () => {
    const cards = gerarCards({
      contratos: [{ status: 'suspenso', titulos_abertos: 2, valor_aberto: 200 }],
      conversas_anteriores: 5,
      manutencao: { ativa: true, descricao: 'Fibra rompida no POP Centro' },
    }, AGORA);
    assert.equal(cards[0].id, 'manutencao_regional');
    const peso = { critico: 0, alerta: 1, info: 2, oportunidade: 3 };
    const pesos = cards.map(c => peso[c.severidade]);
    assert.deepEqual(pesos, [...pesos].sort((a, b) => a - b), 'severidade nunca sobe ao descer a lista');
  });

  test('todo cartão diz o que FAZER — cartão sem ação é ruído', () => {
    const cards = gerarCards({
      contratos: [{ status: 'suspenso', titulos_abertos: 2, valor_aberto: 200 }],
      conexao: { online: false },
      chamados: [{ data_cadastro: haDias(1) }, { data_cadastro: haDias(2) }, { data_cadastro: haDias(3) }],
      conversas_anteriores: 4,
      ultimo_nps: { nota: 1, escala: 10, criado_em: haDias(1) },
      manutencao: { ativa: true },
    }, AGORA);
    for (const c of cards) {
      assert.ok(c.acao && c.titulo && c.severidade, `cartão incompleto: ${c.id}`);
    }
    assert.equal(new Set(cards.map(c => c.id)).size, cards.length, 'nenhum cartão duplicado');
  });

  test('contrato inativo aponta assunto comercial', () => {
    assert.ok(ids({ contratos: [{ status: 'cancelado' }] }).includes('sem_contrato_ativo'));
    assert.ok(!ids({ contratos: [{ status: 'ativo' }] }).includes('sem_contrato_ativo'));
    assert.ok(!ids({ contratos: [] }).includes('sem_contrato_ativo'), 'sem ficha não se afirma nada');
    assert.ok(!ids({ contratos: [{ status: 'suspenso', titulos_abertos: 1 }] }).includes('sem_contrato_ativo'),
      'suspenso é cliente com contrato bloqueado, não candidato a novo contrato');
  });
});
