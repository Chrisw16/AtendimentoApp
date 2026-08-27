import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, camposIaResponde, agregarNps, normalizarNomeCampo, montarFichaColetada, CAMPOS_RESERVADOS, normalizarData, normalizarEscolha, filtrarTools } from './fluxoHelpers.js';

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

test('montarFichaColetada não lista nada quando não há dados coletados', () => {
  // Deixou de devolver '' em 2026-08-27: sem dados, o bloco vira só a ORDEM de
  // usar salvar_dado — ver o teste do buraco de bootstrap mais abaixo.
  assert.doesNotMatch(montarFichaColetada({ cliente: {}, _ia_hist_n1: [] }), /:/);
});

// ── normalizarData ──────────────────────────────────────────────
test('normalizarData converte DD/MM/AAAA para AAAA-MM-DD', () => {
  assert.equal(normalizarData('09/05/2004'), '2004-05-09');
});

test('normalizarData aceita dígitos únicos e separadores variados', () => {
  assert.equal(normalizarData('9/5/2004'), '2004-05-09');
  assert.equal(normalizarData('09-05-2004'), '2004-05-09');
});

test('normalizarData mantém AAAA-MM-DD já correto', () => {
  assert.equal(normalizarData('2004-05-09'), '2004-05-09');
});

test('normalizarData expande ano de 2 dígitos com pivô 30', () => {
  assert.equal(normalizarData('09/05/04'), '2004-05-09');
  assert.equal(normalizarData('09/05/95'), '1995-05-09');
});

test('normalizarData devolve vazio p/ vazio e passa adiante o irreconhecível', () => {
  assert.equal(normalizarData(''), '');
  assert.equal(normalizarData('sei lá'), 'sei lá');
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

// ── CAMPOS_RESERVADOS ───────────────────────────────────────────
test('CAMPOS_RESERVADOS contém os objetos aninhados do contexto', () => {
  for (const k of ['cliente', 'boleto', 'chamado', 'promessa', 'planos']) {
    assert.ok(CAMPOS_RESERVADOS.has(k), `esperava ${k} reservado`);
  }
});

test('montarFichaColetada ignora chaves reservadas mesmo se escalares', () => {
  const bloco = montarFichaColetada({ cliente: 'Fulano', cidade: 'Natal' });
  assert.match(bloco, /cidade: Natal/);
  // `/cliente/` cru também casava com a ordem de chamar salvar_dado, que fala
  // "o cliente informar" — o que a chave reservada não pode virar é uma LINHA.
  assert.doesNotMatch(bloco, /^cliente: /m);
});

// ── ia_responde: os dois campos com alias que resolviam em direções contrárias ──
//
// Bug vivo até 2026-08-21: a tela gravava `prompt` e `max_turns`, o motor lia
// `instrucao ?? prompt` (o ANTIGO vencia — editar a instrução não tinha efeito)
// e `max_turns || max_turnos` (o NOVO vencia — encostar no campo derrubava a
// janela de 25 turnos do fluxo de cadastro para o default 5 da tela).
test('camposIaResponde: o valor da TELA vence, sempre', () => {
  const r = camposIaResponde({ instrucao: 'nova', prompt: 'antiga', max_turnos: 25, max_turns: 5 });
  assert.equal(r.instrucao, 'nova', 'a instrução antiga venceu a que está na tela');
  assert.equal(r.maxTurnos, 25, 'o max_turns legado derrubou o max_turnos configurado');
});

test('camposIaResponde: fluxo salvo só com os nomes antigos continua funcionando', () => {
  const r = camposIaResponde({ prompt: 'só a antiga', max_turns: 12 });
  assert.equal(r.instrucao, 'só a antiga');
  assert.equal(r.maxTurnos, 12);
});

test('camposIaResponde: sem nada configurado, o default é 6 (o do motor, não o 5 da tela)', () => {
  assert.equal(camposIaResponde({}).maxTurnos, 6);
  assert.equal(camposIaResponde({}).instrucao, undefined);
});

test('camposIaResponde: instrução vazia na tela apaga a antiga (string vazia é escolha)', () => {
  // `??` e não `||`: apagar o campo tem de valer, senão o texto antigo ressuscita.
  assert.equal(camposIaResponde({ instrucao: '', prompt: 'antiga' }).instrucao, '');
});

test('camposIaResponde: max_turnos inválido cai no default em vez de virar NaN', () => {
  assert.equal(camposIaResponde({ max_turnos: 'abc' }).maxTurnos, 6);
  assert.equal(camposIaResponde({ max_turnos: 0 }).maxTurnos, 6);
});

// ── normalizarEscolha ───────────────────────────────────────────
// 2026-08-27, medido no link público de produção: digitar "Quero conhecer"
// (sem os emojis do rótulo) caiu no ramo do "Já sou cliente" — a comparação era
// igualdade exata em minúsculas. No WhatsApp o cliente DIGITA, não clica.
test('normalizarEscolha faz o texto digitado casar com o rótulo do botão', () => {
  assert.equal(normalizarEscolha('🆕 Quero conhecer! 😊'), normalizarEscolha('quero conhecer'));
  assert.equal(normalizarEscolha('✅ Já sou cliente'),      normalizarEscolha('ja sou cliente'));
  assert.equal(normalizarEscolha(' 2ª VIA  de Boleto '),    normalizarEscolha('2a via de boleto'));
});

test('normalizarEscolha não colapsa opções diferentes nem casa vazio com emoji puro', () => {
  assert.notEqual(normalizarEscolha('Suporte'), normalizarEscolha('Comercial'));
  assert.notEqual(normalizarEscolha('plano 600'), normalizarEscolha('plano 850'));
  assert.equal(normalizarEscolha('🔥🔥'), '');   // rótulo só de emoji vira vazio…
  assert.equal(normalizarEscolha(''), '');       // …e quem casa vazio é filtrado por quem chama
});

// ── filtrarTools ────────────────────────────────────────────────
// 2026-08-27: os nós `ia_responde` de produção têm `tools_ativas` explícito,
// escrito ANTES da FASE 7/8 — a lista substitui TOOLS_PADRAO inteiro, então
// `buscar_conhecimento` nunca chegou ao modelo e ela improvisava procedimento.
// Perguntada, ela listou as 8 tools que tinha; a base não estava entre elas.
const TOOLS_FAKE = [
  { name: 'salvar_dado',             description: 'd', input_schema: {}, is_write: true },
  { name: 'buscar_conhecimento',     description: 'd', input_schema: {} },
  { name: 'concluir_etapa_playbook', description: 'd', input_schema: {} },
  { name: 'listar_planos_ativos',    description: 'd', input_schema: {} },
  { name: 'criar_chamado',           description: 'd', input_schema: {} },
];

test('filtrarTools mantém a base de conhecimento mesmo com tools_ativas que a omite', () => {
  const nomes = filtrarTools(TOOLS_FAKE, ['listar_planos_ativos']).map(t => t.name);
  assert.ok(nomes.includes('buscar_conhecimento'), 'a base não pode ser desligada por config de nó');
  assert.ok(nomes.includes('salvar_dado'), 'memória idem');
  assert.ok(!nomes.includes('criar_chamado'), 'o que o nó não pediu continua fora');
});

test('filtrarTools só oferece concluir_etapa_playbook quando há procedimento ativo', () => {
  const sem = filtrarTools(TOOLS_FAKE, ['concluir_etapa_playbook']).map(t => t.name);
  const com = filtrarTools(TOOLS_FAKE, ['concluir_etapa_playbook'], { playbookAtivo: true }).map(t => t.name);
  assert.ok(!sem.includes('concluir_etapa_playbook'));
  assert.ok(com.includes('concluir_etapa_playbook'));
});

test('filtrarTools devolve só os campos que a API da Anthropic aceita', () => {
  const [t] = filtrarTools(TOOLS_FAKE, ['salvar_dado']);
  assert.deepEqual(Object.keys(t).sort(), ['description', 'input_schema', 'name']);
});

// ── montarFichaColetada: o buraco de bootstrap ──────────────────
// A instrução de usar `salvar_dado` só existia DENTRO do bloco de dados já
// coletados — ou seja, aparecia depois de a IA já ter salvo algo. No primeiro
// dado, que é justamente quando importa, o prompt não dizia nada. Medido em
// produção: 12 turnos, ela respondeu "já anotei" e `contexto` ficou vazio.
test('montarFichaColetada manda salvar mesmo quando nada foi coletado ainda', () => {
  const bloco = montarFichaColetada({ cliente: {}, _ia_hist_n1: [] });
  assert.match(bloco, /salvar_dado/);
  assert.doesNotMatch(bloco, /DADOS JÁ COLETADOS/, 'sem dados não existe lista para exibir');
});
