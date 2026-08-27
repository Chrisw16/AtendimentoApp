/**
 * `agruparConversas` mora em `apps/web/src/lib/` e é testada AQUI porque não há
 * runner de frontend no repositório — mesmo truque de `contrato-catalogos.test.js`
 * com o `nodeTypes.js`: JS puro atravessa a fronteira dos dois pacotes sem tocar
 * em build nenhum.
 *
 * A lateral do Chat depende inteiramente desta função. Ela errar não estoura:
 * some com conversa da tela da atendente, que é o defeito silencioso de sempre.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { agruparConversas, GRUPOS } from '../../web/src/lib/agruparConversas.js';

const HOJE  = Date.parse('2026-08-27T14:00:00Z');
const ONTEM = Date.parse('2026-08-26T14:00:00Z');
const g = (res, key) => res.find(x => x.key === key);

describe('agruparConversas', () => {
  test('cada status cai no seu grupo', () => {
    const r = agruparConversas([
      { id: '1', status: 'ia' },
      { id: '2', status: 'aguardando' },
      { id: '3', status: 'ativa' },
      { id: '4', status: 'encerrada', atualizado: HOJE },
    ], { agora: HOJE });

    assert.deepEqual(g(r, 'ia').conversas.map(c => c.id),         ['1']);
    assert.deepEqual(g(r, 'aguardando').conversas.map(c => c.id), ['2']);
    assert.deepEqual(g(r, 'ativa').conversas.map(c => c.id),      ['3']);
    assert.deepEqual(g(r, 'encerrada').conversas.map(c => c.id),  ['4']);
  });

  test('aguardando de fila FECHADA vira "fora de hora", não fica em aguardando', () => {
    // O SLA de quem espera numa fila fechada não está correndo contra ninguém.
    // Deixar na mesma pilha faz o cronômetro vermelho mentir a noite inteira.
    const r = agruparConversas(
      [{ id: '1', status: 'aguardando', fila_id: 'f1' },
       { id: '2', status: 'aguardando', fila_id: 'f2' }],
      { filasFechadas: new Set(['f1']), agora: HOJE });

    assert.deepEqual(g(r, 'fora_hora').conversas.map(c => c.id),  ['1']);
    assert.deepEqual(g(r, 'aguardando').conversas.map(c => c.id), ['2']);
  });

  test('conversa SEM fila nunca é fora de hora', () => {
    // `fila_id` null = visível para todos (regra da FASE 5). Não há horário a
    // consultar, então declarar "fora de hora" seria inventar.
    const r = agruparConversas([{ id: '1', status: 'aguardando', fila_id: null }],
      { filasFechadas: new Set(['f1']), agora: HOJE });
    assert.deepEqual(g(r, 'aguardando').conversas.map(c => c.id), ['1']);
    assert.equal(g(r, 'fora_hora').conversas.length, 0);
  });

  test('encerrada de ontem não entra em "encerradas hoje"', () => {
    const r = agruparConversas([
      { id: 'velha', status: 'encerrada', encerrada_em: ONTEM },
      { id: 'nova',  status: 'encerrada', encerrada_em: HOJE },
    ], { agora: HOJE });
    assert.deepEqual(g(r, 'encerrada').conversas.map(c => c.id), ['nova']);
  });

  test('id duplicado colapsa — a fila vem de OUTRO endpoint e sobrepõe a lista', () => {
    // `/chat/fila` e `/chat/conversas` devolvem a mesma conversa para o admin.
    // Sem dedup ela apareceria duas vezes, e o contador do grupo mentiria.
    const r = agruparConversas([
      { id: '1', status: 'aguardando', nome: 'da lista' },
      { id: '1', status: 'aguardando', nome: 'da fila', pos_na_fila: 2 },
    ], { agora: HOJE });
    assert.equal(g(r, 'aguardando').conversas.length, 1);
    assert.equal(g(r, 'aguardando').conversas[0].pos_na_fila, 2, 'o mais completo vence');
  });

  test('aguardando ordena por quem espera HÁ MAIS TEMPO; o resto, por atividade recente', () => {
    const r = agruparConversas([
      { id: 'novo',  status: 'aguardando', aguardando_desde: HOJE - 60_000 },
      { id: 'velho', status: 'aguardando', aguardando_desde: HOJE - 900_000 },
      { id: 'a',     status: 'ativa', atualizado: HOJE - 900_000 },
      { id: 'b',     status: 'ativa', atualizado: HOJE - 60_000 },
    ], { agora: HOJE });
    assert.deepEqual(g(r, 'aguardando').conversas.map(c => c.id), ['velho', 'novo']);
    assert.deepEqual(g(r, 'ativa').conversas.map(c => c.id),      ['b', 'a']);
  });

  test('status desconhecido continua VISÍVEL — sumir da tela é pior que aparecer torto', () => {
    const r = agruparConversas([{ id: '1', status: 'inventado' }], { agora: HOJE });
    const total = r.reduce((n, grupo) => n + grupo.conversas.length, 0);
    assert.equal(total, 1);
  });

  test('devolve sempre os 5 grupos, na ordem, mesmo vazios', () => {
    const r = agruparConversas([], { agora: HOJE });
    assert.deepEqual(r.map(x => x.key), GRUPOS.map(x => x.key));
    assert.equal(r.length, 5);
  });

  test('só "Aguardando" nasce aberto', () => {
    assert.deepEqual(GRUPOS.filter(x => x.abreDefault).map(x => x.key), ['aguardando']);
  });

  test('entrada nula não quebra a tela', () => {
    assert.equal(agruparConversas(null).length, 5);
    assert.equal(agruparConversas([null, undefined, { id: 'x', status: 'ia' }]).length, 5);
  });
});
