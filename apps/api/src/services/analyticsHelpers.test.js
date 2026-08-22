import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  taxa, media, custoDeTokens, classificarResolucao, houveRecontato,
  resumoExecutivo, custoEvitado,
} from './analyticsHelpers.js';

const H = 3600_000;
const fato = (extra = {}) => ({
  status: 'encerrada', teve_humano: false, desfecho_ia: 'resolvido',
  encerrada_em: '2026-08-22T12:00:00Z', proximo_contato_em: null, ...extra,
});

describe('taxa e média', () => {
  test('CRITÉRIO: sem base, a taxa é null — não zero', () => {
    // 0% diria "nenhum resolvido"; null diz "não houve atendimento".
    assert.equal(taxa(0, 0), null);
    assert.equal(taxa(5, null), null);
    assert.equal(taxa(0, 10), 0, 'zero de dez É zero por cento');
  });

  test('arredonda para inteiro', () => {
    assert.equal(taxa(1, 3), 33);
    assert.equal(taxa(2, 3), 67);
  });

  test('média ignora lixo e devolve null sem amostra', () => {
    assert.equal(media([10, 20, 30]), 20);
    assert.equal(media([10, null, 'x', 30]), 20);
    assert.equal(media([]), null);
  });
});

describe('custoDeTokens', () => {
  const precos = { 'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 } };

  test('calcula por milhão de tokens', () => {
    const c = custoDeTokens({ modelo: 'claude-haiku-4-5-20251001', tokensIn: 1_000_000, tokensOut: 200_000 }, precos);
    assert.equal(c, 2);
  });

  test('CRITÉRIO: modelo sem preço configurado devolve null, NÃO zero', () => {
    // Custo zerado somado no relatório vira "a IA é de graça" — a mentira mais
    // cara possível num indicador de diretoria.
    assert.equal(custoDeTokens({ modelo: 'outro-modelo', tokensIn: 999_999 }, precos), null);
    assert.equal(custoDeTokens({ modelo: 'x' }, {}), null);
  });

  test('tokens ausentes não estouram', () => {
    assert.equal(custoDeTokens({ modelo: 'claude-haiku-4-5-20251001' }, precos), 0);
  });
});

describe('recontato e resolução (§102/§103)', () => {
  test('CRITÉRIO: voltar dentro da janela NÃO é resolução efetiva', () => {
    // Contar como sucesso um atendimento que virou recontato em 2h é medir o
    // próprio fracasso como vitória.
    const f = fato({ proximo_contato_em: new Date(Date.parse('2026-08-22T12:00:00Z') + 2 * H).toISOString() });
    assert.equal(houveRecontato(f, 24), true);
    assert.equal(classificarResolucao(f, { janelaHoras: 24 }), 'ia_com_recontato');
  });

  test('voltar DEPOIS da janela é atendimento novo, não recontato', () => {
    const f = fato({ proximo_contato_em: new Date(Date.parse('2026-08-22T12:00:00Z') + 40 * H).toISOString() });
    assert.equal(houveRecontato(f, 24), false);
    assert.equal(classificarResolucao(f, { janelaHoras: 24 }), 'ia_efetiva');
  });

  test('contato ANTES do encerramento não conta (a janela é para frente)', () => {
    const f = fato({ proximo_contato_em: '2026-08-22T09:00:00Z' });
    assert.equal(houveRecontato(f, 24), false);
  });

  test('teve humano nunca é resolução da IA', () => {
    assert.equal(classificarResolucao(fato({ teve_humano: true })), 'humano');
  });

  test('encerrar sem a IA declarar resolvido não é resolução efetiva', () => {
    assert.equal(classificarResolucao(fato({ desfecho_ia: 'max_turnos' })), 'ia_sem_resolucao');
    assert.equal(classificarResolucao(fato({ desfecho_ia: null })), 'ia_sem_resolucao');
  });

  test('conversa aberta não é classificada', () => {
    assert.equal(classificarResolucao(fato({ status: 'ativa' })), 'em_aberto');
    assert.equal(classificarResolucao(null), 'em_aberto');
  });

  test('datas inválidas não inventam recontato', () => {
    assert.equal(houveRecontato({ encerrada_em: 'x', proximo_contato_em: 'y' }), false);
    assert.equal(houveRecontato({}), false);
  });
});

describe('resumoExecutivo (§101)', () => {
  const base = Date.parse('2026-08-22T12:00:00Z');
  const fatos = [
    fato({ duracao_seg: 600 }),                                                     // IA efetiva
    fato({ duracao_seg: 300, proximo_contato_em: new Date(base + 3 * H).toISOString() }), // recontato
    fato({ teve_humano: true, duracao_seg: 1200, espera_seg: 120, resposta_hum_seg: 30 }), // humano
    fato({ desfecho_ia: 'max_turnos', duracao_seg: 400 }),                          // IA sem resolução
    fato({ status: 'ativa' }),                                                      // aberta
  ];

  test('CRITÉRIO: aparente e efetiva aparecem JUNTAS', () => {
    // Mostrar só a aparente seria propaganda: ela conta como sucesso quem
    // voltou e quem a IA nem declarou resolvido.
    const r = resumoExecutivo(fatos, { janelaHoras: 24 });
    assert.equal(r.encerrados, 4);
    assert.equal(r.resolucao_ia_aparente, 75, '3 de 4 encerradas sem humano');
    assert.equal(r.resolucao_ia_efetiva, 25, 'só 1 resolveu de verdade');
    assert.equal(r.com_humano, 25);
    assert.equal(r.recontato, 25);
  });

  test('a duração média conta só as encerradas', () => {
    assert.equal(resumoExecutivo(fatos).duracao_media_min, media([600, 300, 1200, 400].map(s => s / 60)));
  });

  test('CRITÉRIO: a nota de qualidade vem com a COBERTURA', () => {
    // Sem "3 de 40", a nota de 3 conversas auditadas é lida como nota da
    // operação inteira.
    const comNota = [fato({ quality_score: 80 }), fato({ quality_score: 60 }), fato({})];
    const r = resumoExecutivo(comNota);
    assert.equal(r.quality.media, 70);
    assert.equal(r.quality.auditadas, 2);
    assert.equal(r.quality.de, 3);
  });

  test('sem dado nenhum, tudo é null em vez de zero', () => {
    const r = resumoExecutivo([]);
    assert.equal(r.atendimentos, 0);
    assert.equal(r.resolucao_ia_efetiva, null);
    assert.equal(r.duracao_media_min, null);
    assert.equal(r.quality.media, null);
  });
});

describe('custoEvitado (§108)', () => {
  test('CRITÉRIO: sem custo configurado, o total é null e diz que não foi configurado', () => {
    const c = custoEvitado({ chamadosEvitados: 40, atendimentosIA: 100 }, {});
    assert.equal(c.total_estimado, null);
    assert.equal(c.configurado, false);
    assert.equal(c.estimativa, true, 'sempre rotulado como estimativa (§108)');
  });

  test('com custo configurado, soma as duas parcelas', () => {
    const c = custoEvitado({ chamadosEvitados: 10, atendimentosIA: 100 },
      { custo_chamado: 50, custo_atendimento_humano: 3 });
    assert.equal(c.total_estimado, 800);
    assert.equal(c.configurado, true);
  });

  test('nunca deixa de rotular como estimativa', () => {
    assert.equal(custoEvitado({}, { custo_chamado: 99 }).estimativa, true);
  });
});
