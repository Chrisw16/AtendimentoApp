import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  dentroDoHorario, nivelUrgencia, podeAssumir, conversaVisivel, SLA_PADRAO,
} from './filasHelpers.js';

// Um horário local conhecido: 2026-08-22 é um SÁBADO (dia 6).
const SAB_10H = new Date(2026, 7, 22, 10, 0).getTime();
const SAB_20H = new Date(2026, 7, 22, 20, 0).getTime();

describe('dentroDoHorario', () => {
  test('sem config, sem restrição — null NUNCA significa fechado', () => {
    assert.equal(dentroDoHorario(null, SAB_20H), true);
    assert.equal(dentroDoHorario(undefined, SAB_20H), true);
    assert.equal(dentroDoHorario({}, SAB_20H), true);
  });

  test('ativo:false é o mesmo que não ter horário', () => {
    assert.equal(dentroDoHorario({ ativo: false, dias: [1], inicio: '08:00', fim: '09:00' }, SAB_20H), true);
  });

  test('dentro e fora da janela do dia', () => {
    const h = { ativo: true, dias: [6], inicio: '08:00', fim: '18:00' };
    assert.equal(dentroDoHorario(h, SAB_10H), true);
    assert.equal(dentroDoHorario(h, SAB_20H), false);
  });

  test('dia de semana que não está na lista fecha mesmo no meio do expediente', () => {
    assert.equal(dentroDoHorario({ ativo: true, dias: [1, 2, 3, 4, 5], inicio: '08:00', fim: '18:00' }, SAB_10H), false);
  });

  test('aceita jsonb que volta como string (o KV faz isso)', () => {
    assert.equal(dentroDoHorario(JSON.stringify({ ativo: true, dias: [6], inicio: '08:00', fim: '18:00' }), SAB_10H), true);
  });

  test('JSON quebrado não fecha a fila — degrada para "sem restrição"', () => {
    assert.equal(dentroDoHorario('{isso não é json', SAB_20H), true);
  });
});

describe('nivelUrgencia', () => {
  const agora = Date.parse('2026-08-22T12:00:00Z');
  const haMin = (m) => new Date(agora - m * 60_000).toISOString();

  test('sem aguardando_desde é "ia" (ninguém está esperando humano)', () => {
    assert.equal(nivelUrgencia(null, 0, null, agora).nivel, 'ia');
    assert.equal(nivelUrgencia('data ruim', 0, null, agora).nivel, 'ia');
  });

  test('as faixas padrão continuam 5 e 15 minutos', () => {
    assert.equal(SLA_PADRAO.atencao_min, 5);
    assert.equal(SLA_PADRAO.critico_min, 15);
    assert.equal(nivelUrgencia(haMin(1), 0, null, agora).nivel, 'ok');
    assert.equal(nivelUrgencia(haMin(6), 0, null, agora).nivel, 'atencao');
    assert.equal(nivelUrgencia(haMin(20), 0, null, agora).nivel, 'critico');
  });

  test('o SLA da FILA manda — 1/2 min torna crítico o que era "ok"', () => {
    const sla = { atencao_min: 1, critico_min: 2 };
    assert.equal(nivelUrgencia(haMin(3), 0, sla, agora).nivel, 'critico');
    assert.equal(nivelUrgencia(haMin(1), 0, sla, agora).nivel, 'atencao');
  });

  test('SLA inválido cai no padrão em vez de virar 0 (tudo crítico)', () => {
    assert.equal(nivelUrgencia(haMin(3), 0, { atencao_min: 0, critico_min: null }, agora).nivel, 'ok');
  });

  test('prioridade atropela o relógio', () => {
    assert.equal(nivelUrgencia(haMin(0), 2, null, agora).nivel, 'critico');
    assert.equal(nivelUrgencia(haMin(0), 1, null, agora).nivel, 'atencao');
  });

  test('minutos/segundos nunca são negativos (relógio do banco à frente)', () => {
    const futuro = new Date(agora + 60_000).toISOString();
    assert.equal(nivelUrgencia(futuro, 0, null, agora).segundos, 0);
  });
});

describe('podeAssumir — capacidade simultânea', () => {
  test('capacidade não configurada é ilimitada (é o de hoje)', () => {
    assert.equal(podeAssumir(null, 99), true);
    assert.equal(podeAssumir(0, 99), true);
    assert.equal(podeAssumir(-1, 99), true);
    assert.equal(podeAssumir('abc', 99), true);
  });

  test('barra exatamente ao encostar no teto', () => {
    assert.equal(podeAssumir(3, 2), true);
    assert.equal(podeAssumir(3, 3), false);
    assert.equal(podeAssumir(3, 4), false);
  });
});

describe('conversaVisivel', () => {
  const F1 = '11111111-1111-1111-1111-111111111111';
  const F2 = '22222222-2222-2222-2222-222222222222';

  test('admin vê tudo', () => {
    assert.equal(conversaVisivel({ fila_id: F2 }, { role: 'admin', filaIds: [F1] }), true);
  });

  test('CRITÉRIO: agente sem fila nenhuma segue vendo tudo (nada quebra ao migrar)', () => {
    assert.equal(conversaVisivel({ fila_id: F1 }, { role: 'agente', filaIds: [] }), true);
    assert.equal(conversaVisivel({ fila_id: F1 }, { role: 'agente' }), true);
  });

  test('conversa sem fila é de todo mundo', () => {
    assert.equal(conversaVisivel({ fila_id: null }, { role: 'agente', filaIds: [F1] }), true);
  });

  test('com filas, só as suas', () => {
    assert.equal(conversaVisivel({ fila_id: F1 }, { role: 'agente', filaIds: [F1] }), true);
    assert.equal(conversaVisivel({ fila_id: F2 }, { role: 'agente', filaIds: [F1] }), false);
  });

  test('sem agente, nada é visível', () => {
    assert.equal(conversaVisivel({ fila_id: null }, null), false);
  });
});
