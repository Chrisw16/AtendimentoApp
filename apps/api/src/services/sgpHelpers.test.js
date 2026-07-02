import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarManutencoes, manutencoesAtivas, manutencaoParaCliente, parseDataSgp, montarBodyChamado, classificarSinal, formatarDiagnosticoOnu,
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

// ── classificarSinal ───────────────────────────────────────────────
test('classificarSinal: -20 e -25 (fronteira) são bom', () => {
  assert.equal(classificarSinal(-20).nivel, 'bom');
  assert.equal(classificarSinal(-25).nivel, 'bom');
});
test('classificarSinal: -26 e -27 (fronteira) são atenção', () => {
  assert.equal(classificarSinal(-26).nivel, 'atencao');
  assert.equal(classificarSinal(-27).nivel, 'atencao');
});
test('classificarSinal: -27.5 e -28 (fronteira) são ruim', () => {
  assert.equal(classificarSinal(-27.5).nivel, 'ruim');
  assert.equal(classificarSinal(-28).nivel, 'ruim');
});
test('classificarSinal: -28.5 é crítico', () => {
  assert.equal(classificarSinal(-28.5).nivel, 'critico');
});
test('classificarSinal: valor nulo/inválido é desconhecido', () => {
  assert.equal(classificarSinal(null).nivel, 'desconhecido');
  assert.equal(classificarSinal('x').nivel, 'desconhecido');
});

// ── formatarDiagnosticoOnu ─────────────────────────────────────────
const AGORA_ONU = new Date(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00

test('formatarDiagnosticoOnu: row nulo → fail-safe, sem "Rx"', () => {
  const msg = formatarDiagnosticoOnu(null, AGORA_ONU);
  assert.match(msg, /não consegui ler/i);
  assert.doesNotMatch(msg, /Rx/);
});
test('formatarDiagnosticoOnu: leitura fresca + online mostra rx, "bom", ONLINE e uptime', () => {
  const row = { rx_dbm: -20.97, tx_dbm: 2.06, sinal_lido_em: '2026-07-02 07:25:37',
    online: true, uptime_segundos: 10800, ultima_queda_motivo: null };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /-20\.97/);
  assert.match(msg, /bom/);
  assert.match(msg, /ONLINE/);
  assert.match(msg, /3h/);
  assert.match(msg, /hoje/);
});
test('formatarDiagnosticoOnu: leitura antiga (>7 dias) avisa desatualizada', () => {
  const row = { rx_dbm: -21, tx_dbm: 2, sinal_lido_em: '2026-06-01 10:00:00', online: true, uptime_segundos: 600 };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /dias/);
  assert.match(msg, /desatualizad/i);
});
test('formatarDiagnosticoOnu: offline mostra OFFLINE e o motivo da queda', () => {
  const row = { rx_dbm: -35, tx_dbm: 2, sinal_lido_em: '2026-07-02 07:00:00',
    online: false, uptime_segundos: null, ultima_queda_motivo: 'Lost-Carrier' };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /OFFLINE/);
  assert.match(msg, /Lost-Carrier/);
  assert.match(msg, /crítico/);
});
