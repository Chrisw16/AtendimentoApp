import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTIVOS, normalizarMotivo, prioridadeDoMotivo, blocosRuntime,
  contextoEstruturado, desfechoDe, montarHandoff,
  BLOCO_HIERARQUIA, BLOCO_ANTI_ALUCINACAO, BLOCO_GUARDRAILS,
} from './iaRuntime.js';

describe('motivos de transferência (§73)', () => {
  test('valor já estruturado passa intacto', () => {
    for (const m of Object.keys(MOTIVOS)) assert.equal(normalizarMotivo(m), m);
  });

  test('CRITÉRIO: texto livre da IA vira valor estruturado', () => {
    assert.equal(normalizarMotivo('cliente está muito irritado'), 'customer_frustrated');
    assert.equal(normalizarMotivo('cliente falou em processo e Procon'), 'customer_frustrated');
    assert.equal(normalizarMotivo('quer cancelar o contrato'), 'sensitive_case');
    assert.equal(normalizarMotivo('cliente quer fazer upgrade de plano'), 'commercial_opportunity');
    assert.equal(normalizarMotivo('a integração com o SGP está fora do ar'), 'tool_failure');
    assert.equal(normalizarMotivo('não encontrei na base de conhecimento'), 'missing_knowledge');
    assert.equal(normalizarMotivo('cliente pediu para falar com um atendente'), 'customer_requested_human');
  });

  test('variações da mesma coisa caem no MESMO motivo — é o que faz o relatório somar', () => {
    const iguais = ['cliente nervoso', 'cliente está bravo', 'cliente furioso', 'cliente revoltado'];
    const ms = iguais.map(normalizarMotivo);
    assert.equal(new Set(ms).size, 1, JSON.stringify(ms));
    assert.equal(ms[0], 'customer_frustrated');
  });

  test('frustração vence pedido de humano quando os dois aparecem', () => {
    // "Estou irritado, quero falar com um atendente" é uma escalada, não um
    // pedido de rotina — a prioridade na fila depende disso.
    assert.equal(normalizarMotivo('estou irritado, quero falar com um atendente'), 'customer_frustrated');
  });

  test('sem casar nada assume o motivo mais comum e MENOS alarmante', () => {
    assert.equal(normalizarMotivo('xyz'), 'customer_requested_human');
    assert.equal(normalizarMotivo(''), 'customer_requested_human');
    assert.equal(normalizarMotivo(null), 'customer_requested_human');
    assert.equal(prioridadeDoMotivo(null), 1, 'não inventa urgência crítica');
  });

  test('frustrado e caso sensível furam a fila; falta de conhecimento não', () => {
    assert.equal(prioridadeDoMotivo('customer_frustrated'), 2);
    assert.equal(prioridadeDoMotivo('sensitive_case'), 2);
    assert.equal(prioridadeDoMotivo('missing_knowledge'), 0);
    assert.equal(prioridadeDoMotivo('max_turns'), 0);
  });

  test('todo motivo tem label e prioridade', () => {
    for (const [id, d] of Object.entries(MOTIVOS)) {
      assert.ok(d.label, id);
      assert.ok(Number.isInteger(d.prioridade), id);
    }
  });
});

describe('blocos de prompt (§67/§68/§75)', () => {
  test('a hierarquia diz explicitamente que dado vivo vence documento', () => {
    assert.match(BLOCO_HIERARQUIA, /ferramenta.*prevalece|prevalece sobre qualquer documento/i);
    assert.match(BLOCO_HIERARQUIA, /1\..*ferramenta/is);
  });

  test('CRITÉRIO: a lista do que não se inventa é NOMINAL', () => {
    // "não invente nada" é fácil de contornar; "não invente prazo" não é.
    for (const termo of ['preço', 'protocolo', 'PIX', 'cobertura', 'prazo', 'sinal', 'manutenção', 'agendamento']) {
      assert.ok(BLOCO_ANTI_ALUCINACAO.toLowerCase().includes(termo.toLowerCase()), `faltou: ${termo}`);
    }
  });

  test('CRITÉRIO: os guardrails de campo nomeiam os riscos reais de ISP', () => {
    for (const termo of ['ONU', 'fibra', 'conector', 'poste', 'elétrica']) {
      assert.ok(BLOCO_GUARDRAILS.includes(termo), `faltou: ${termo}`);
    }
    assert.match(BLOCO_GUARDRAILS, /mesmo que o cliente peça|insista/i,
      'o cliente pedindo não pode liberar orientação perigosa');
  });

  test('blocosRuntime junta os três na ordem', () => {
    const b = blocosRuntime();
    assert.ok(b.indexOf('HIERARQUIA') < b.indexOf('NUNCA INVENTE'));
    assert.ok(b.indexOf('NUNCA INVENTE') < b.indexOf('SEGURANÇA'));
  });
});

describe('contexto estruturado (§69)', () => {
  const estado = {
    contexto: {
      cliente: { nome: 'Fulano', contrato: '123', cidade: 'Natal' },
      endereco: 'Rua X, 10',
      plano_desejado: '500 mega',
      _ia_turnos_no1: 4,
      _ia_hist_no1: [{ role: 'user' }],
    },
  };

  test('separa o cliente dos dados coletados', () => {
    const c = contextoEstruturado(estado);
    assert.equal(c.customer.nome, 'Fulano');
    assert.equal(c.identified_contract, '123');
    assert.deepEqual(c.collected_data, { endereco: 'Rua X, 10', plano_desejado: '500 mega' });
  });

  test('CRITÉRIO: campos internos do motor não vazam para o contexto', () => {
    const c = contextoEstruturado(estado);
    assert.ok(!('_ia_turnos_no1' in (c.collected_data || {})));
    assert.ok(!JSON.stringify(c).includes('_ia_hist'));
  });

  test('slot vazio SOME — campo vazio no prompt é ruído', () => {
    const c = contextoEstruturado({ contexto: {} });
    assert.equal('current_goal' in c, false);
    assert.equal('queue' in c, false);
    assert.deepEqual(contextoEstruturado({}), {});
  });

  test('extras entram nos slots nomeados pelo §69', () => {
    const c = contextoEstruturado(estado, {
      goal: 'resolver_suporte', playbook: 'sem_conexao',
      playbookEstado: '2/9', fila: 'suporte', sentimento: 'negativo',
      tools: ['verificar_conexao'],
    });
    assert.equal(c.current_goal, 'resolver_suporte');
    assert.equal(c.active_playbook, 'sem_conexao');
    assert.equal(c.playbook_state, '2/9');
    assert.equal(c.queue, 'suporte');
    assert.equal(c.sentiment, 'negativo');
    assert.deepEqual(c.tool_results, ['verificar_conexao']);
  });
});

describe('desfecho (§71)', () => {
  test('CRITÉRIO: estourar turnos NÃO é resolvido — é desistência', () => {
    assert.deepEqual(desfechoDe({ estourouTurnos: true }), { desfecho: 'max_turnos', motivo: 'max_turns' });
  });

  test('erro vence tudo, inclusive "resolveu"', () => {
    assert.equal(desfechoDe({ erro: true, resolveu: true }).desfecho, 'erro');
  });

  test('transferir vence resolver', () => {
    assert.equal(desfechoDe({ transferiu: true, resolveu: true }).desfecho, 'transferido');
  });

  test('sem sinal nenhum, a execução segue em andamento — não é sucesso', () => {
    assert.equal(desfechoDe({}).desfecho, 'em_andamento');
    assert.equal(desfechoDe().desfecho, 'em_andamento');
  });
});

describe('handoff (§74)', () => {
  const base = {
    motivo: 'cliente irritado com a terceira queda',
    cliente: { nome: 'Fulano', contrato: '123', cidade: 'Natal', cpf: '12345678901', telefone: '5584999887766' },
    goal: 'resolver_suporte',
    tools: ['consultar_cliente', 'verificar_conexao', 'consultar_cliente'],
    playbook: { nome: 'Sem conexão', feitas: 2, total: 9 },
    ultimasMensagens: Array.from({ length: 20 }, (_, i) => ({ texto: `msg ${i}` })),
  };

  test('o resumo cabe numa linha e responde o que o agente precisa', () => {
    const h = montarHandoff(base);
    assert.match(h.resumo, /Fulano/);
    assert.match(h.resumo, /contrato 123/);
    assert.match(h.resumo, /verificar_conexao/);
    assert.match(h.resumo, /2\/9 etapas/);
    assert.match(h.resumo, /Cliente frustrado/);
  });

  test('o motivo vira estruturado e leva a prioridade junto', () => {
    const h = montarHandoff(base);
    assert.equal(h.motivo, 'customer_frustrated');
    assert.equal(h.prioridade, 2);
  });

  test('CRITÉRIO: o handoff NÃO carrega CPF nem telefone', () => {
    // A FASE 6 tirou PII do payload do agente; duplicá-la aqui abriria a porta
    // dos fundos que aquela fase fechou.
    const json = JSON.stringify(montarHandoff(base));
    assert.ok(!json.includes('12345678901'));
    assert.ok(!json.includes('5584999887766'));
  });

  test('tool repetida aparece uma vez só', () => {
    assert.deepEqual(montarHandoff(base).tools_executadas, ['consultar_cliente', 'verificar_conexao']);
  });

  test('não despeja a conversa inteira — só o rabo dela', () => {
    assert.equal(montarHandoff(base).ultimas_mensagens.length, 6);
  });

  test('sem nada executado, diz isso em vez de omitir', () => {
    const h = montarHandoff({ motivo: 'atendente', cliente: {}, tools: [] });
    assert.match(h.resumo, /nenhuma consulta executada/);
    assert.match(h.resumo, /Cliente não identificado/);
  });

  test('handoff vazio não estoura', () => {
    const h = montarHandoff();
    assert.equal(h.motivo, 'customer_requested_human');
    assert.ok(h.resumo);
  });
});
