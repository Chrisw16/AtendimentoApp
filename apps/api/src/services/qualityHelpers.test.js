import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  avaliacaoValida, calcularScore, aplicarViolacoes, aderenciaPlaybook,
  scoreFinal, padroesRecorrentes, TETO_VIOLACAO_CRITICA,
} from './qualityHelpers.js';

const CRITERIOS = [
  { id: 'c1', nome: 'Identificação', peso: 2 },
  { id: 'c2', nome: 'Diagnóstico',   peso: 3 },
  { id: 'c3', nome: 'Tom',           peso: 1 },
];
const av = (id, nota, justificativa = 'porque sim') => ({ criterio_id: id, nota, justificativa });

describe('avaliacaoValida (§97)', () => {
  test('CRITÉRIO: penalizar sem justificativa não vale', () => {
    assert.equal(avaliacaoValida({ criterio_id: 'c1', nota: 4 }), false);
    assert.equal(avaliacaoValida({ criterio_id: 'c1', nota: 4, justificativa: '   ' }), false);
    assert.equal(avaliacaoValida(av('c1', 4)), true);
  });

  test('nota máxima dispensa justificativa — elogio não precisa de defesa', () => {
    assert.equal(avaliacaoValida({ criterio_id: 'c1', nota: 10 }), true);
  });

  test('nota fora da escala é inválida', () => {
    assert.equal(avaliacaoValida(av('c1', 11)), false);
    assert.equal(avaliacaoValida(av('c1', -1)), false);
    assert.equal(avaliacaoValida(av('c1', 'oito')), false);
    assert.equal(avaliacaoValida(null), false);
  });
});

describe('calcularScore', () => {
  test('média ponderada normalizada em 0-100', () => {
    // (10/10*2 + 5/10*3 + 10/10*1) / 6 = (2 + 1.5 + 1)/6 = 0.75
    assert.equal(calcularScore(CRITERIOS, [av('c1', 10), av('c2', 5), av('c3', 10)]), 75);
  });

  test('CRITÉRIO: critério não avaliado sai da conta — não conta como zero', () => {
    // Se a conversa não teve objeção, "tratamento de objeções" não pode
    // arrastar a nota para baixo.
    assert.equal(calcularScore(CRITERIOS, [av('c1', 10), av('c3', 10)]), 100);
  });

  test('avaliação INVÁLIDA é descartada, não vira zero', () => {
    // Punir o atendente por um defeito do avaliador seria o pior dos mundos.
    const comLixo = [av('c1', 10), { criterio_id: 'c2', nota: 2 }, av('c3', 10)];
    assert.equal(calcularScore(CRITERIOS, comLixo), 100);
  });

  test('peso maior pesa mais', () => {
    const so_c2 = calcularScore(CRITERIOS, [av('c1', 10), av('c2', 0), av('c3', 10)]);
    const so_c3 = calcularScore(CRITERIOS, [av('c1', 10), av('c2', 10), av('c3', 0)]);
    assert.ok(so_c2 < so_c3, `c2 (peso 3) deveria doer mais que c3 (peso 1): ${so_c2} vs ${so_c3}`);
  });

  test('nada avaliado devolve null, não zero', () => {
    assert.equal(calcularScore(CRITERIOS, []), null);
    assert.equal(calcularScore([], [av('c1', 10)]), null);
  });

  test('peso zero ou negativo não quebra a conta', () => {
    assert.equal(calcularScore([{ id: 'x', peso: 0 }], [av('x', 10)]), null);
    assert.ok(Number.isInteger(calcularScore([{ id: 'x', peso: -5 }, { id: 'y', peso: 1 }], [av('x', 0), av('y', 10)])));
  });
});

describe('violações críticas (§96)', () => {
  test('CRITÉRIO: violação crítica é TETO, não desconto', () => {
    // Subtrair deixaria um atendimento excelente com promessa indevida ainda
    // passando com nota alta.
    assert.equal(aplicarViolacoes(98, [{ tipo: 'promessa_indevida' }]), TETO_VIOLACAO_CRITICA);
  });

  test('nota já baixa não SOBE por causa do teto', () => {
    assert.equal(aplicarViolacoes(20, [{ tipo: 'x' }]), 20);
  });

  test('sem violação, o score passa intacto', () => {
    assert.equal(aplicarViolacoes(93, []), 93);
    assert.equal(aplicarViolacoes(93, null), 93);
  });

  test('violação marcada como NÃO crítica não impõe teto', () => {
    assert.equal(aplicarViolacoes(98, [{ tipo: 'x', critico: false }]), 98);
  });

  test('score null continua null', () => {
    assert.equal(aplicarViolacoes(null, [{ tipo: 'x' }]), null);
  });
});

describe('aderência ao playbook (§95)', () => {
  const etapas = [
    { id: 'e1', titulo: 'Identificar', obrigatoriedade: 'obrigatoria' },
    { id: 'e2', titulo: 'Verificar',   obrigatoriedade: 'obrigatoria' },
    { id: 'e3', titulo: 'Retestar',    obrigatoriedade: 'obrigatoria' },
    { id: 'e4', titulo: 'Avaliar',     obrigatoriedade: 'condicional' },
    { id: 'e5', titulo: 'Extra',       obrigatoriedade: 'opcional' },
  ];

  test('conta só as obrigatórias', () => {
    const a = aderenciaPlaybook(etapas, ['e1', 'e2', 'e3']);
    assert.equal(a.total, 3);
    assert.equal(a.percentual, 100);
  });

  test('etapa pulada derruba o percentual e é nomeada', () => {
    const a = aderenciaPlaybook(etapas, ['e1']);
    assert.equal(a.percentual, 33);
    assert.deepEqual(a.puladas.map(e => e.titulo), ['Verificar', 'Retestar']);
  });

  test('CRITÉRIO: exceção justificada NÃO conta contra (§61)', () => {
    // Punir quem pulou o teste remoto de um cabo comprovadamente rompido
    // ensinaria a seguir o roteiro contra o bom senso.
    const a = aderenciaPlaybook(etapas, ['e1', 'e3'], [{ etapa_id: 'e2' }]);
    assert.equal(a.percentual, 100);
    assert.deepEqual(a.justificadas.map(e => e.titulo), ['Verificar']);
    assert.deepEqual(a.puladas, []);
  });

  test('aceita exceção como string simples', () => {
    assert.equal(aderenciaPlaybook(etapas, ['e1', 'e3'], ['e2']).percentual, 100);
  });

  test('playbook sem etapa obrigatória devolve null — não há o que aderir', () => {
    assert.equal(aderenciaPlaybook([{ id: 'x', obrigatoriedade: 'opcional' }], []), null);
    assert.equal(aderenciaPlaybook([], []), null);
  });

  test('aceita o formato rico de feitas', () => {
    assert.equal(aderenciaPlaybook(etapas, [{ etapa_id: 'e1' }, { etapa_id: 'e2' }, { etapa_id: 'e3' }]).percentual, 100);
  });
});

describe('score final e revisão humana (§98)', () => {
  test('sem revisão, o final é o da IA', () => {
    const r = scoreFinal({ ai: 82 });
    assert.equal(r.final_score, 82);
    assert.equal(r.human_score, null);
    assert.equal(r.divergencia, null);
  });

  test('CRITÉRIO: com revisão, o humano manda — e o da IA NÃO some', () => {
    const r = scoreFinal({ ai: 82, humano: 60 });
    assert.equal(r.final_score, 60);
    assert.equal(r.ai_score, 82, 'a divergência é o que ensina a calibrar o scorecard');
    assert.equal(r.divergencia, -22);
  });

  test('humano zero é uma nota, não ausência de nota', () => {
    const r = scoreFinal({ ai: 90, humano: 0 });
    assert.equal(r.final_score, 0);
    assert.equal(r.divergencia, -90);
  });

  test('sem nota nenhuma não estoura', () => {
    assert.equal(scoreFinal({}).final_score, null);
    assert.equal(scoreFinal().final_score, null);
  });
});

describe('coaching por padrão, não por ranking (§99)', () => {
  const auditoria = (score, avs) => ({ final_score: score, avaliacoes: avs });

  test('CRITÉRIO: um tropeço isolado NÃO vira ponto de melhoria', () => {
    const r = padroesRecorrentes([
      auditoria(80, [av('c1', 3, 'não identificou')]),
      auditoria(90, [av('c1', 10)]),
    ]);
    assert.equal(r.tem_padrao, false);
    assert.deepEqual(r.pontos_de_melhoria, []);
  });

  test('o que se repete vira padrão, com exemplos', () => {
    const r = padroesRecorrentes([
      auditoria(60, [av('c1', 3, 'pediu CPF duas vezes')]),
      auditoria(65, [av('c1', 4, 'não conferiu o contrato')]),
      auditoria(70, [av('c2', 2, 'não retestou')]),
    ]);
    assert.equal(r.tem_padrao, true);
    assert.equal(r.pontos_de_melhoria[0].criterio_id, 'c1');
    assert.equal(r.pontos_de_melhoria[0].ocorrencias, 2);
    assert.equal(r.pontos_de_melhoria[0].exemplos.length, 2);
  });

  test('nota boa não entra como ponto de melhoria', () => {
    const r = padroesRecorrentes([auditoria(95, [av('c1', 9)]), auditoria(95, [av('c1', 8)])]);
    assert.deepEqual(r.pontos_de_melhoria, []);
  });

  test('a média sai das auditorias, e é null sem nota', () => {
    assert.equal(padroesRecorrentes([auditoria(80, []), auditoria(60, [])]).media, 70);
    assert.equal(padroesRecorrentes([{ avaliacoes: [] }]).media, null);
    assert.equal(padroesRecorrentes([]).auditorias, 0);
  });

  test('avaliação sem justificativa não sustenta padrão nenhum', () => {
    const r = padroesRecorrentes([
      auditoria(50, [{ criterio_id: 'c1', nota: 2 }]),
      auditoria(50, [{ criterio_id: 'c1', nota: 2 }]),
    ]);
    assert.equal(r.tem_padrao, false, 'sem evidência não se acusa padrão de comportamento');
  });
});
