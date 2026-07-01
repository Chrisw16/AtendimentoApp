import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, normalizarNomeCampo, montarFichaColetada } from './fluxoHelpers.js';

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

// ── normalizarNomeCampo ─────────────────────────────────────────
test('normalizarNomeCampo remove acentos e minusculiza', () => {
  assert.equal(normalizarNomeCampo('Endereço'), 'endereco');
});

test('normalizarNomeCampo troca espaços por _', () => {
  assert.equal(normalizarNomeCampo('Data Nasc'), 'data_nasc');
});

test('normalizarNomeCampo mantém nome já simples', () => {
  assert.equal(normalizarNomeCampo('cidade'), 'cidade');
});

test('normalizarNomeCampo colapsa não-alfanuméricos e apara as bordas', () => {
  assert.equal(normalizarNomeCampo('CPF/CNPJ '), 'cpf_cnpj');
});

test('normalizarNomeCampo devolve string vazia para entrada vazia', () => {
  assert.equal(normalizarNomeCampo(''), '');
});

// ── montarFichaColetada ─────────────────────────────────────────
test('montarFichaColetada lista escalares flat e ignora objetos/internos/vazios', () => {
  const bloco = montarFichaColetada({
    cidade: 'Natal',
    plano: '450M',
    cliente: { nome: 'Fulano' },   // objeto → ignora
    _ia_turnos_n1: 3,              // interno → ignora
    _ia_hist_n1: [],              // interno → ignora
    obs: '',                      // vazio → ignora
  });
  assert.match(bloco, /cidade: Natal/);
  assert.match(bloco, /plano: 450M/);
  assert.match(bloco, /NUNCA/);
  assert.doesNotMatch(bloco, /Fulano/);
  assert.doesNotMatch(bloco, /_ia_turnos/);
  assert.doesNotMatch(bloco, /obs:/);
});

test('montarFichaColetada devolve string vazia quando não há dados coletados', () => {
  assert.equal(montarFichaColetada({ cliente: {}, _ia_hist_n1: [] }), '');
});

// ── montarSystemPrompt: ficha ───────────────────────────────────
test('montarSystemPrompt injeta o bloco da ficha quando fornecido', () => {
  const s = montarSystemPrompt({ systemBase: 'Base', ficha: '## DADOS JÁ COLETADOS\ncidade: Natal' });
  assert.match(s, /DADOS JÁ COLETADOS/);
  assert.match(s, /cidade: Natal/);
});

test('montarSystemPrompt sem ficha não inclui o bloco de memória', () => {
  const s = montarSystemPrompt({ systemBase: 'Base' });
  assert.doesNotMatch(s, /DADOS JÁ COLETADOS/);
});
