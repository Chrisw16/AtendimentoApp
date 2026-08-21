import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, agregarNps } from './fluxoHelpers.js';

test('resolverTipoChamado mapeia tipo "tecnico" para 200 (Reparo)', () => {
  assert.equal(resolverTipoChamado({ tipo: 'tecnico' }), 200);
});

test('resolverTipoChamado mapeia tipo "financeiro" para 22 (ProbFatura)', () => {
  assert.equal(resolverTipoChamado({ tipo: 'financeiro' }), 22);
});

test('resolverTipoChamado mapeia tipo "comercial" para 5 (Outros)', () => {
  assert.equal(resolverTipoChamado({ tipo: 'comercial' }), 5);
});

test('resolverTipoChamado respeita tipo_id numérico explícito como override', () => {
  assert.equal(resolverTipoChamado({ tipo_id: 13 }), 13);
});

test('resolverTipoChamado usa 5 (Outros) como default quando nada é informado', () => {
  assert.equal(resolverTipoChamado({}), 5);
});

// ── avaliarNps ──────────────────────────────────────────────────
test('avaliarNps escala 5: nota 5 é promotor', () => {
  assert.deepEqual(avaliarNps('5', '5'), { valida: true, porta: 'promotor' });
});

test('avaliarNps escala 5: nota 3 é neutro', () => {
  assert.deepEqual(avaliarNps('3', '5'), { valida: true, porta: 'neutro' });
});

test('avaliarNps escala 5: nota 2 é detrator', () => {
  assert.deepEqual(avaliarNps('2', '5'), { valida: true, porta: 'detrator' });
});

test('avaliarNps escala 5: nota 6 é inválida (fora do range)', () => {
  assert.equal(avaliarNps('6', '5').valida, false);
});

test('avaliarNps escala 10: nota 9 é promotor', () => {
  assert.deepEqual(avaliarNps('9', '10'), { valida: true, porta: 'promotor' });
});

test('avaliarNps escala 10: nota 7 é neutro', () => {
  assert.deepEqual(avaliarNps('7', '10'), { valida: true, porta: 'neutro' });
});

test('avaliarNps escala 10: nota 5 é detrator', () => {
  assert.deepEqual(avaliarNps('5', '10'), { valida: true, porta: 'detrator' });
});

test('avaliarNps sem escala definida assume 0-10', () => {
  assert.deepEqual(avaliarNps('9'), { valida: true, porta: 'promotor' });
});

test('avaliarNps com texto não numérico é inválido', () => {
  assert.equal(avaliarNps('oi', '10').valida, false);
});

// ── montarSystemPrompt ──────────────────────────────────────────
test('montarSystemPrompt inclui a instrução específica quando há base + instrução', () => {
  const out = montarSystemPrompt({ systemBase: 'Você é a assistente.', instrucao: 'Foque em conexão.' });
  assert.match(out, /Instrução específica: Foque em conexão\./);
  assert.match(out, /Você é a assistente\./);
});

test('montarSystemPrompt usa a instrução como base quando não há systemBase', () => {
  const out = montarSystemPrompt({ instrucao: 'Seja breve.' });
  assert.match(out, /Seja breve\./);
  assert.doesNotMatch(out, /Instrução específica:/); // sem base, não duplica
});

test('montarSystemPrompt inclui os dados do cliente quando fornecidos', () => {
  const out = montarSystemPrompt({ systemBase: 'X', ctxCliente: 'cliente.nome: Ana' });
  assert.match(out, /Dados do cliente identificado/);
  assert.match(out, /cliente\.nome: Ana/);
});

test('montarSystemPrompt anexa as regras de tool', () => {
  const out = montarSystemPrompt({ systemBase: 'X', regrasTools: 'REGRAS DE FERRAMENTAS' });
  assert.match(out, /REGRAS DE FERRAMENTAS/);
});

// ── camposLista ─────────────────────────────────────────────────
test('camposLista lê botao/secao salvos pelo editor', () => {
  assert.deepEqual(
    camposLista({ botao: 'Ver opções', secao: 'Planos' }),
    { label_botao: 'Ver opções', titulo_secao: 'Planos' },
  );
});

test('camposLista faz fallback para label_botao/titulo_secao (fluxos antigos)', () => {
  assert.deepEqual(
    camposLista({ label_botao: 'X', titulo_secao: 'Y' }),
    { label_botao: 'X', titulo_secao: 'Y' },
  );
});

test('camposLista retorna strings vazias quando nada está configurado', () => {
  assert.deepEqual(camposLista({}), { label_botao: '', titulo_secao: '' });
});

// ── agregarNps ────────────────────────────────────────────────────
// As faixas do NPS viviam em DOIS lugares: avaliarNps (JS, ciente da escala) e
// o SQL do dashboard (0-10 fixo). Por isso divergiam — nota 5 numa escala de 5
// era promotor no fluxo e detrator no relatório. Agora há uma fonte só.
test('agregarNps conta nota máxima da escala 5 como promotor (era detrator no dashboard)', () => {
  const r = agregarNps([{ nota: 5, escala: '5' }]);
  assert.equal(r.promotores, 1);
  assert.equal(r.detratores, 0);
  assert.equal(r.score, 100);
});

test('agregarNps mantém a escala 10 clássica', () => {
  const r = agregarNps([{ nota: 9, escala: '10' }, { nota: 5, escala: '10' }]);
  assert.equal(r.promotores, 1);
  assert.equal(r.detratores, 1);
  assert.equal(r.score, 0);
});

test('agregarNps soma escalas diferentes na mesma janela', () => {
  const r = agregarNps([
    { nota: 5,  escala: '5'  },   // promotor
    { nota: 10, escala: '10' },   // promotor
    { nota: 1,  escala: '5'  },   // detrator
    { nota: 3,  escala: '5'  },   // neutro
  ]);
  assert.deepEqual(
    { total: r.total, p: r.promotores, n: r.neutros, d: r.detratores },
    { total: 4, p: 2, n: 1, d: 1 }
  );
  assert.equal(r.score, 25);      // (2-1)/4 = 25%
});

test('agregarNps ignora nota inválida em vez de contá-la como detrator', () => {
  const r = agregarNps([{ nota: 99, escala: '10' }, { nota: 9, escala: '10' }]);
  assert.equal(r.total, 1);
  assert.equal(r.promotores, 1);
});

test('agregarNps sem respostas devolve score nulo (não zero)', () => {
  const r = agregarNps([]);
  assert.equal(r.total, 0);
  assert.equal(r.score, null, 'zero respostas não é "NPS 0"');
});

test('agregarNps trata escala ausente como 0-10 (linhas antigas)', () => {
  const r = agregarNps([{ nota: 9 }]);
  assert.equal(r.promotores, 1);
});
