import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarManutencoes, manutencoesAtivas, manutencaoParaCliente, parseDataSgp, montarBodyChamado,
} from './sgpHelpers.js';

const AGORA = new Date(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00 (local)

const ativaNoPop1 = {
  descricao: 'Rompimento de fibra', ativa: 1, status: 1,
  data_inicial: '2026-07-02 10:00:00', data_final: '2026-07-02 14:00:00',
  pops: [{ id: 1, cidade: 'Macaíba' }], mensagem_central: 'Rompimento na região',
};

// ── normalizarManutencoes: sem fabricação de positivo ──────────────
test('normalizarManutencoes aceita array direto', () => {
  assert.deepEqual(normalizarManutencoes([ativaNoPop1]), [ativaNoPop1]);
});
test('normalizarManutencoes lê {manutencoes}, {data}, {results}', () => {
  assert.equal(normalizarManutencoes({ manutencoes: [ativaNoPop1] }).length, 1);
  assert.equal(normalizarManutencoes({ data: [ativaNoPop1] }).length, 1);
  assert.equal(normalizarManutencoes({ results: [ativaNoPop1] }).length, 1);
});
test('normalizarManutencoes NÃO fabrica positivo de campo truthy (bug antigo)', () => {
  // {manutencao: []} tinha [] truthy → o código antigo inventava {ativa:true}
  assert.deepEqual(normalizarManutencoes({ manutencao: [] }), []);
  assert.deepEqual(normalizarManutencoes({ em_manutencao: {} }), []);
  assert.deepEqual(normalizarManutencoes(null), []);
});

// ── manutencoesAtivas: ativa + status + janela ─────────────────────
test('manutencoesAtivas inclui manutenção ativa dentro da janela (ativa=1 inteiro)', () => {
  assert.equal(manutencoesAtivas({ manutencoes: [ativaNoPop1] }, AGORA).length, 1);
});
test('manutencoesAtivas exclui status Resolvido (4)', () => {
  const m = { ...ativaNoPop1, status: 4 };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui ativa=0', () => {
  const m = { ...ativaNoPop1, ativa: 0 };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui manutenção já terminada (data_final no passado)', () => {
  const m = { ...ativaNoPop1, data_inicial: '2026-07-01 08:00:00', data_final: '2026-07-01 12:00:00' };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas exclui manutenção agendada p/ o futuro (data_inicial > agora)', () => {
  const m = { ...ativaNoPop1, data_inicial: '2026-07-03 10:00:00', data_final: '2026-07-03 14:00:00' };
  assert.equal(manutencoesAtivas([m], AGORA).length, 0);
});
test('manutencoesAtivas sem datas conta pela flag ativa+status', () => {
  const m = { descricao: 'x', ativa: 1, status: 1, pops: [{ id: 1 }] };
  assert.equal(manutencoesAtivas([m], AGORA).length, 1);
});

// ── manutencaoParaCliente: escopo por POP + fail-safe ──────────────
test('manutencaoParaCliente: ativa no POP do cliente → ativa:true', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, true);
  assert.equal(r.itens.length, 1);
});
test('manutencaoParaCliente: ativa em OUTRO POP → ativa:false (escopo)', () => {
  const m = { ...ativaNoPop1, pops: [{ id: 9, cidade: 'Natal' }] };
  const r = manutencaoParaCliente([m], { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: registro sem pops → ativa:false (fail-safe)', () => {
  const m = { ...ativaNoPop1, pops: [] };
  const r = manutencaoParaCliente([m], { popId: 1, cidade: 'Macaíba' }, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: cliente sem popId nem cidade → ativa:false (fail-safe)', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, {}, AGORA);
  assert.equal(r.ativa, false);
});
test('manutencaoParaCliente: casa por cidade quando não tem popId', () => {
  const r = manutencaoParaCliente({ manutencoes: [ativaNoPop1] }, { cidade: 'macaíba' }, AGORA);
  assert.equal(r.ativa, true);
});
test('manutencaoParaCliente: resposta em formato inesperado → ativa:false', () => {
  const r = manutencaoParaCliente({ manutencao: [] }, { popId: 1 }, AGORA);
  assert.equal(r.ativa, false);
});

// ── parseDataSgp ───────────────────────────────────────────────────
test('parseDataSgp lê "AAAA-MM-DD HH:MM:SS"', () => {
  assert.deepEqual(parseDataSgp('2026-07-02 14:30:00'), new Date(2026, 6, 2, 14, 30, 0));
});
test('parseDataSgp lê "AAAA-MM-DD" (sem hora)', () => {
  assert.deepEqual(parseDataSgp('2026-07-02'), new Date(2026, 6, 2, 0, 0, 0));
});
test('parseDataSgp devolve null p/ lixo/vazio', () => {
  assert.equal(parseDataSgp(''), null);
  assert.equal(parseDataSgp('amanhã'), null);
  assert.equal(parseDataSgp(null), null);
});

// ── montarBodyChamado: repassa extras suportados pela doc SGP ───────
test('montarBodyChamado inclui contato_nome/telefone/observacao/usuario quando presentes', () => {
  const body = montarBodyChamado(30987, 200, 'internet caiu', {
    contato_nome: 'Fulano', contato_telefone: '84999999999', observacao: 'obs', usuario: 'ia_natalia',
  });
  assert.equal(body.contrato, 30987);
  assert.equal(body.ocorrenciatipo, 200);
  assert.equal(body.conteudo, 'internet caiu');
  assert.equal(body.contato_nome, 'Fulano');
  assert.equal(body.contato_telefone, '84999999999');
  assert.equal(body.observacao, 'obs');
  assert.equal(body.usuario, 'ia_natalia');
});
test('montarBodyChamado omite extras vazios e aplica defaults (tipo 5, conteúdo padrão)', () => {
  const body = montarBodyChamado(30987, null, '', {});
  assert.equal(body.ocorrenciatipo, 5);
  assert.equal(typeof body.conteudo, 'string');
  assert.ok(body.conteudo.length > 0);
  assert.ok(!('contato_nome' in body));
  assert.ok(!('usuario' in body));
});
