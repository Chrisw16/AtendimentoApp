import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectarSinais, decidirProximaAcao, montarResumo, LABEL_ACAO } from './copilotoHelpers.js';

const ids = (t) => detectarSinais(t).map(s => s.id);

describe('detectarSinais (§83/§84)', () => {
  test('objeção de preço nas formas que o cliente realmente escreve', () => {
    for (const t of ['tá muito caro', 'achei caro demais', 'tem desconto?', 'a concorrência cobra menos']) {
      assert.ok(ids(t).includes('objecao_preco'), t);
    }
  });

  test('sinal de compra', () => {
    for (const t of ['quero contratar', 'como faço para assinar?', 'quando instala?', 'vou querer sim']) {
      assert.ok(ids(t).includes('sinal_compra'), t);
    }
  });

  test('recorrência e falha física são sinais de SUPORTE', () => {
    assert.ok(ids('caiu de novo, é toda semana').includes('recorrencia'));
    assert.ok(ids('o cabo tá rompido na rua').includes('falha_fisica'));
    assert.equal(detectarSinais('o cabo tá rompido').find(s => s.id === 'falha_fisica').lado, 'suporte');
  });

  test('frustração aparece dos dois lados', () => {
    assert.ok(ids('isso é um absurdo, vou no Procon').includes('frustracao'));
    assert.equal(detectarSinais('absurdo').find(s => s.id === 'frustracao').lado, 'ambos');
  });

  test('conversa neutra não inventa sinal', () => {
    assert.deepEqual(ids('bom dia, tudo bem?'), []);
    assert.deepEqual(ids(''), []);
    assert.deepEqual(ids(null), []);
  });

  test('a mesma mensagem pode ter mais de um sinal', () => {
    const s = ids('de novo sem internet, isso é um absurdo');
    assert.ok(s.includes('recorrencia') && s.includes('frustracao'));
  });
});

describe('decidirProximaAcao (§79) — o coração do copiloto', () => {
  const fichaCompleta = {
    identidade: { cpf: '***.456.789-**' },
    contrato_principal: { id: '123', status: 'ativo' },
    diagnostico: { executado: true, conexao: { online: true } },
  };

  test('CRITÉRIO: cliente não identificado → CONSULTAR, nunca escrever', () => {
    // Um copiloto que escreve um parágrafo bonito sobre a conta de alguém que
    // ele não sabe quem é está gerando texto, não ajudando.
    const d = decidirProximaAcao({ ficha: null, ultimaMensagem: 'quero minha segunda via' });
    assert.equal(d.acao, 'consultar');
    assert.deepEqual(d.tools, ['consultar_cliente']);
    assert.match(d.motivo, /identificad/);
  });

  test('CRITÉRIO: manutenção ativa muda a resposta inteira e vem antes de tudo', () => {
    const d = decidirProximaAcao({
      ficha: { ...fichaCompleta, manutencao: { ativa: true } },
      ultimaMensagem: 'minha internet caiu',
    });
    assert.equal(d.acao, 'responder');
    assert.equal(d.destaque, true);
    assert.match(d.motivo, /NÃO abra chamado/);
  });

  test('caso técnico sem diagnóstico → consultar conexão antes', () => {
    const d = decidirProximaAcao({
      ficha: { ...fichaCompleta, diagnostico: { executado: false } },
      ultimaMensagem: 'minha internet tá muito lenta',
    });
    assert.equal(d.acao, 'consultar');
    assert.ok(d.tools.includes('verificar_conexao'));
  });

  test('assunto NÃO técnico com cliente identificado não exige diagnóstico', () => {
    const d = decidirProximaAcao({
      ficha: { ...fichaCompleta, diagnostico: { executado: false } },
      ultimaMensagem: 'quero mudar a data de vencimento',
    });
    assert.equal(d.acao, 'responder');
  });

  test('procedimento em andamento manda avançar, e diz qual é a etapa', () => {
    const d = decidirProximaAcao({
      ficha: fichaCompleta,
      playbook: { foco: { titulo: 'Consultar a ONU', tools: ['consultar_onu_acs'] } },
      ultimaMensagem: 'e agora?',
    });
    assert.equal(d.acao, 'avancar_playbook');
    assert.deepEqual(d.tools, ['consultar_onu_acs']);
    assert.match(d.motivo, /Consultar a ONU/);
  });

  test('sem pendência nenhuma, responder — e o sinal crítico vai no aviso', () => {
    const d = decidirProximaAcao({
      ficha: fichaCompleta, ultimaMensagem: 'tá caro demais',
      sinais: detectarSinais('tá caro demais'),
    });
    assert.equal(d.acao, 'responder');
    assert.match(d.motivo, /objeção de preço/i);
  });

  test('a ordem é urgência: manutenção vence playbook pendente', () => {
    const d = decidirProximaAcao({
      ficha: { ...fichaCompleta, manutencao: { ativa: true } },
      playbook: { foco: { titulo: 'Consultar a ONU' } },
      ultimaMensagem: 'caiu tudo',
    });
    assert.equal(d.acao, 'responder');
  });

  test('entrada vazia não estoura e pede identificação', () => {
    assert.equal(decidirProximaAcao().acao, 'consultar');
    assert.equal(decidirProximaAcao({}).acao, 'consultar');
  });

  test('toda ação possível tem rótulo de botão', () => {
    for (const acao of ['responder', 'consultar', 'avancar_playbook']) {
      assert.ok(LABEL_ACAO[acao], acao);
    }
  });
});

describe('montarResumo (§82)', () => {
  const ficha = {
    identidade: { nome: 'Fulano' },
    contrato_principal: { id: '123', status: 'ativo', plano: '500 mega' },
    financeiro: { titulos_abertos: 2, valor_aberto: 199.8 },
    diagnostico: { conexao: { online: false } },
    manutencao: { ativa: true },
  };

  test('junta os FATOS que interessam a quem assume a conversa', () => {
    const r = montarResumo({
      ficha,
      playbook: { playbook: { nome: 'Sem conexão' }, etapas: [{ feita: true }, { feita: false }, { feita: false }] },
      sinais: detectarSinais('de novo isso, um absurdo'),
      mensagens: [{ origem: 'cliente', texto: 'minha internet caiu de novo' }, { origem: 'agente', texto: 'já verifico' }],
    });
    assert.match(r, /Fulano/);
    assert.match(r, /contrato 123/);
    assert.match(r, /2 título/);
    assert.match(r, /Manutenção ativa/);
    assert.match(r, /OFFLINE/);
    assert.match(r, /1\/3 etapas/);
    assert.match(r, /Sinais:/);
    assert.match(r, /1 mensagem\(ns\) do cliente/, 'conta só as do cliente');
  });

  test('CRITÉRIO: sem dado, diz que não sabe — não inventa resumo', () => {
    assert.match(montarResumo({}), /não há dados suficientes/i);
    assert.match(montarResumo(), /não há dados suficientes/i);
  });

  test('cliente em dia não gera linha de financeiro', () => {
    const r = montarResumo({ ficha: { identidade: { nome: 'X' }, financeiro: { titulos_abertos: 0, valor_aberto: 0 } } });
    assert.ok(!r.includes('título'));
  });

  test('a última fala do cliente é cortada, não despejada', () => {
    const r = montarResumo({ mensagens: [{ origem: 'cliente', texto: 'a'.repeat(500) }] });
    assert.ok(r.length < 250, r.length);
  });
});
