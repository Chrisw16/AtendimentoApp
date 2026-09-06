import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  paraOpenAI, deOpenAI, resolverModelo, provedorDe, flagsDoModelo,
  PROVEDORES, CATALOGO, PADRAO, PRECOS_REFERENCIA,
} from './llmHelpers.js';

// ── O que o motor de fato produz ──────────────────────────────────
const TOOLS = [
  { name: 'verificar_conexao', description: 'Verifica.', input_schema: { type: 'object', properties: { contrato: { type: 'string' } }, required: ['contrato'] } },
  { name: 'status_rede',       description: 'Rede.',     input_schema: { type: 'object', properties: {} } },
];

describe('paraOpenAI — o pedido do motor no formato compat', () => {
  test('system vira a primeira mensagem role:system', () => {
    const r = paraOpenAI({ system: 'Você é a Natália.', messages: [{ role: 'user', content: 'oi' }] });
    assert.deepEqual(r.messages[0], { role: 'system', content: 'Você é a Natália.' });
    assert.deepEqual(r.messages[1], { role: 'user', content: 'oi' });
  });

  test('sem system não inventa mensagem vazia', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'oi' }] });
    assert.equal(r.messages[0].role, 'user');
  });

  test('tools: input_schema vira parameters dentro de function', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], tools: TOOLS });
    assert.deepEqual(r.tools[0], {
      type: 'function',
      function: { name: 'verificar_conexao', description: 'Verifica.', parameters: TOOLS[0].input_schema },
    });
    assert.equal(r.tools.length, 2);
  });

  test('sem tools não manda `tools: []` — alguns provedores recusam array vazio', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], tools: [] });
    assert.equal('tools' in r, false);
  });

  test('assistant com texto E tool_use no mesmo turno vira content + tool_calls', () => {
    // É exatamente o que a Anthropic devolve e o motor guarda em loopMessages:
    // `{role:'assistant', content: res.content}`.
    const r = paraOpenAI({ messages: [
      { role: 'user', content: 'minha internet caiu' },
      { role: 'assistant', content: [
        { type: 'text', text: 'Vou verificar.' },
        { type: 'tool_use', id: 'toolu_1', name: 'verificar_conexao', input: { contrato: '25438' } },
      ] },
    ] });
    const a = r.messages[1];
    assert.equal(a.role, 'assistant');
    assert.equal(a.content, 'Vou verificar.');
    assert.deepEqual(a.tool_calls, [{
      id: 'toolu_1', type: 'function',
      function: { name: 'verificar_conexao', arguments: JSON.stringify({ contrato: '25438' }) },
    }]);
  });

  test('assistant só com tool_use manda content null, não string vazia', () => {
    const r = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'status_rede', input: {} }] },
    ] });
    assert.equal(r.messages[1].content, null);
  });

  test('user com tool_result vira UM role:tool por resultado — e nada mais', () => {
    // A OpenAI exige um `role:'tool'` por tool_call_id, imediatamente depois do
    // assistant. O motor manda todos os resultados num único `user` com array.
    const r = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [
        { type: 'tool_use', id: 't1', name: 'status_rede', input: {} },
        { type: 'tool_use', id: 't2', name: 'verificar_conexao', input: { contrato: '1' } },
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: '🟢 Rede ok' },
        { type: 'tool_result', tool_use_id: 't2', content: 'Online' },
      ] },
    ] });
    assert.deepEqual(r.messages.slice(2), [
      { role: 'tool', tool_call_id: 't1', content: '🟢 Rede ok' },
      { role: 'tool', tool_call_id: 't2', content: 'Online' },
    ]);
  });

  test('tool_result com content em array (blocos de texto) vira string', () => {
    const r = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'a', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: [{ type: 'text', text: 'A' }, { type: 'text', text: 'B' }] }] },
    ] });
    assert.equal(r.messages[2].content, 'A\nB');
  });

  test('user com texto e tool_result misturados: tool primeiro, texto depois', () => {
    const r = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'a', input: {} }] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: 'ok' },
        { type: 'text', text: 'e agora?' },
      ] },
    ] });
    assert.equal(r.messages[2].role, 'tool');
    assert.deepEqual(r.messages[3], { role: 'user', content: 'e agora?' });
  });

  test('OpenAI: max tokens vai como `max_completion_tokens` — GPT-5.x devolve 400 para `max_tokens`', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'gpt-x', temperatura: 0.2, maxTokens: 512, provedor: 'openai' });
    assert.equal(r.model, 'gpt-x');
    assert.equal(r.temperature, 0.2);
    assert.equal(r.max_completion_tokens, 512);
    assert.equal('max_tokens' in r, false);
  });

  test('DeepSeek: só documenta `max_tokens`, e o thinking vem DESLIGADO', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'deepseek-v4-flash', maxTokens: 512, provedor: 'deepseek' });
    assert.equal(r.max_tokens, 512);
    assert.equal('max_completion_tokens' in r, false);
    assert.deepEqual(r.thinking, { type: 'disabled' });
  });

  test('modelo que rejeita temperatura (GPT-5.x, Sonnet 5) não a recebe — mesmo com valor', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'gpt-5.4-mini', temperatura: 0.2, provedor: 'openai' });
    assert.equal('temperature' in r, false);
  });

  test('GPT-5.4+ com tools manda `reasoning_effort: none` — sem isso é 400 mesmo sem pedir raciocínio', () => {
    const com = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'gpt-5.6-terra', tools: TOOLS, provedor: 'openai' });
    assert.equal(com.reasoning_effort, 'none');
    const sem = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'gpt-4.1-mini', tools: TOOLS, provedor: 'openai' });
    assert.equal('reasoning_effort' in sem, false, 'GPT-4.1 não conhece o parâmetro');
    const semTools = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'gpt-5.6-terra', provedor: 'openai' });
    assert.equal('reasoning_effort' in semTools, false, 'sem tools o padrão do modelo pode ficar');
  });

  test('modelo desconhecido não ganha restrição — a tela é texto livre', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'modelo-de-amanha', temperatura: 0.5, tools: TOOLS, provedor: 'openai' });
    assert.equal(r.temperature, 0.5);
    assert.equal('reasoning_effort' in r, false);
  });

  test('temperatura null não vira `temperature: null` — modelos de raciocínio rejeitam o campo', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], modelo: 'o-x', temperatura: null });
    assert.equal('temperature' in r, false);
  });
});

describe('deOpenAI — a resposta compat no formato que o motor lê', () => {
  const resp = (message, finish_reason = 'stop', usage = { prompt_tokens: 10, completion_tokens: 5 }) => ({
    choices: [{ message, finish_reason }], usage,
  });

  test('texto simples vira bloco text + end_turn', () => {
    const r = deOpenAI(resp({ role: 'assistant', content: 'Olá!' }));
    assert.deepEqual(r.content, [{ type: 'text', text: 'Olá!' }]);
    assert.equal(r.stop_reason, 'end_turn');
  });

  test('tool_calls viram blocos tool_use com input PARSEADO e stop_reason tool_use', () => {
    const r = deOpenAI(resp({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'verificar_conexao', arguments: '{"contrato":"25438"}' } }],
    }, 'tool_calls'));
    assert.equal(r.stop_reason, 'tool_use');
    assert.deepEqual(r.content, [{ type: 'tool_use', id: 'call_1', name: 'verificar_conexao', input: { contrato: '25438' } }]);
  });

  test('texto junto de tool_calls: os dois blocos, texto primeiro', () => {
    // O motor empilha o texto que vem junto do tool_use (senão "posso
    // finalizar?" se perde e a conversa trava). A tradução tem de preservar.
    const r = deOpenAI(resp({
      role: 'assistant', content: 'Deixa eu ver.',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'status_rede', arguments: '{}' } }],
    }, 'tool_calls'));
    assert.equal(r.content[0].type, 'text');
    assert.equal(r.content[1].type, 'tool_use');
  });

  test('arguments MALFORMADO não derruba o turno — vira input vazio', () => {
    // Modelo pequeno manda JSON quebrado. Um throw aqui mata o atendimento; um
    // `{}` faz o executarTool responder o que responderia a uma chamada sem
    // argumentos, e o modelo tenta de novo.
    const r = deOpenAI(resp({
      role: 'assistant', content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'a', arguments: '{"contrato": 25' } }],
    }, 'tool_calls'));
    assert.deepEqual(r.content[0].input, {});
  });

  test('finish_reason: tool_calls mesmo sem tool_calls no corpo cai para end_turn', () => {
    const r = deOpenAI(resp({ role: 'assistant', content: 'x' }, 'tool_calls'));
    assert.equal(r.stop_reason, 'end_turn');
  });

  test('length vira max_tokens; content_filter e desconhecidos viram end_turn', () => {
    assert.equal(deOpenAI(resp({ content: 'x' }, 'length')).stop_reason, 'max_tokens');
    assert.equal(deOpenAI(resp({ content: 'x' }, 'content_filter')).stop_reason, 'end_turn');
    assert.equal(deOpenAI(resp({ content: 'x' }, 'sei_la')).stop_reason, 'end_turn');
  });

  test('usage traduzida para os nomes da Anthropic — é o que a telemetria lê', () => {
    const r = deOpenAI(resp({ content: 'x' }, 'stop', { prompt_tokens: 100, completion_tokens: 20 }));
    assert.deepEqual(r.usage, { input_tokens: 100, output_tokens: 20 });
  });

  test('usage ausente vira null nos dois campos, não NaN nem 0', () => {
    // Zero diria "custou nada"; null diz "não sei" — a distinção desta casa.
    const r = deOpenAI({ choices: [{ message: { content: 'x' }, finish_reason: 'stop' }] });
    assert.deepEqual(r.usage, { input_tokens: null, output_tokens: null });
  });

  test('resposta sem choices é erro claro, não TypeError num undefined', () => {
    assert.throws(() => deOpenAI({}), /sem choices/i);
    assert.throws(() => deOpenAI(null), /sem choices/i);
  });

  test('a resposta traduzida tem o contrato que o laço do motor usa', () => {
    const r = deOpenAI(resp({ content: 'x' }));
    assert.ok('stop_reason' in r && Array.isArray(r.content) && 'usage' in r);
  });
});

describe('resolverModelo — a precedência prompt → global → padrão', () => {
  const GLOBAL = { provedor: 'deepseek', modelo: 'deepseek-chat' };
  const PADRAO = { provedor: 'anthropic', modelo: 'claude-haiku-4-5-20251001' };

  test('prompt com par completo vence tudo', () => {
    assert.deepEqual(resolverModelo({ provedor: 'openai', modelo: 'gpt-x' }, GLOBAL, PADRAO), { provedor: 'openai', modelo: 'gpt-x', origem: 'prompt' });
  });

  test('prompt vazio herda o global', () => {
    assert.deepEqual(resolverModelo({}, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
    assert.deepEqual(resolverModelo(null, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
    assert.deepEqual(resolverModelo({ provedor: '', modelo: '' }, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
  });

  test('sem global também, cai no padrão do código', () => {
    assert.deepEqual(resolverModelo({}, {}, PADRAO), { ...PADRAO, origem: 'padrao' });
    assert.deepEqual(resolverModelo({}, null, PADRAO), { ...PADRAO, origem: 'padrao' });
  });

  test('par INCOERENTE (só provedor ou só modelo) herda os DOIS — não mistura', () => {
    // Provedor de um lugar com modelo de outro é chamar a OpenAI com
    // `claude-haiku`. Herdar os dois é o único jeito de o par fazer sentido.
    assert.deepEqual(resolverModelo({ provedor: 'openai' }, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
    assert.deepEqual(resolverModelo({ modelo: 'gpt-x' }, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
  });

  test('global incoerente também é ignorado inteiro', () => {
    assert.deepEqual(resolverModelo({}, { provedor: 'openai' }, PADRAO), { ...PADRAO, origem: 'padrao' });
  });

  test('provedor desconhecido no prompt não é honrado — cai no global', () => {
    // Typo no banco não pode virar chamada a um adapter que não existe.
    assert.deepEqual(resolverModelo({ provedor: 'opnai', modelo: 'gpt-x' }, GLOBAL, PADRAO), { ...GLOBAL, origem: 'global' });
  });

  test('o par padrão gravado num prompt É override — quem limpa o legado do seed é a migration 031', () => {
    // Operador com o global em DeepSeek que crava Haiku só no `suporte` precisa
    // que o motor obedeça. A versão anterior ignorava este par e a tela mentia.
    assert.deepEqual(resolverModelo(PADRAO, GLOBAL, PADRAO), { ...PADRAO, origem: 'prompt' });
  });
});

describe('provedorDe / PROVEDORES — o catálogo de adapters', () => {
  test('todo provedor tem adapter, chave de credencial e baseURL quando compat', () => {
    for (const [id, p] of Object.entries(PROVEDORES)) {
      assert.ok(p.nome, id);
      assert.ok(['anthropic', 'openai_compat'].includes(p.adapter), `${id}: adapter ${p.adapter}`);
      assert.match(p.chave, /_api_key$/, `${id}: chave ${p.chave}`);
      if (p.adapter === 'openai_compat' && id !== 'openai') assert.match(p.baseURL, /^https:\/\//, `${id} sem baseURL`);
    }
  });

  test('anthropic e openai são os dois primeiros — são os maduros', () => {
    assert.deepEqual(Object.keys(PROVEDORES).slice(0, 2), ['anthropic', 'openai']);
  });

  test('provedorDe devolve null para id desconhecido, nunca um adapter por acidente', () => {
    assert.equal(provedorDe('opnai'), null);
    assert.equal(provedorDe(''), null);
    assert.equal(provedorDe(null), null);
    assert.equal(provedorDe('deepseek')?.adapter, 'openai_compat');
  });
});

describe('paraOpenAI — schema sem propriedades (Gemini recusa `properties: {}`)', () => {
  test('tool sem propriedades sai SEM `parameters`', () => {
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], tools: [
      { name: 'status_rede', description: 'Rede.', input_schema: { type: 'object', properties: {} } },
    ] });
    assert.equal('parameters' in r.tools[0].function, false);
    assert.equal(r.tools[0].function.name, 'status_rede');
  });

  test('tool com propriedades mantém o schema inteiro', () => {
    const schema = { type: 'object', properties: { contrato: { type: 'string' } }, required: ['contrato'] };
    const r = paraOpenAI({ messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'a', description: 'b', input_schema: schema }] });
    assert.deepEqual(r.tools[0].function.parameters, schema);
  });
});


describe('o eco da mensagem crua — Gemini thought_signature, DeepSeek reasoning_content', () => {
  test('deOpenAI guarda a mensagem crua nos blocos, e paraOpenAI a ecoa byte a byte', () => {
    const cru = {
      role: 'assistant', content: null, reasoning_content: 'pensei nisto',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'status_rede', arguments: '{}' }, extra_content: { google: { thought_signature: 'abc' } } }],
    };
    const r = deOpenAI({ choices: [{ message: cru, finish_reason: 'tool_calls' }] });
    // O motor faz `{role:'assistant', content: res.content}` — mesma referência.
    const pedido = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: r.content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'c1', content: 'ok' }] },
    ], provedor: 'gemini' });
    assert.deepEqual(pedido.messages[1], cru, 'a mensagem foi RECONSTRUÍDA em vez de ecoada');
    assert.equal(pedido.messages[2].role, 'tool');
  });

  test('a mensagem crua não vaza em JSON', () => {
    const r = deOpenAI({ choices: [{ message: { content: 'oi', reasoning_content: 'segredo' }, finish_reason: 'stop' }] });
    assert.ok(!JSON.stringify(r.content).includes('segredo'));
  });

  test('assistant montado pela Anthropic (sem eco) continua sendo reconstruído', () => {
    const pedido = paraOpenAI({ messages: [
      { role: 'user', content: 'x' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'a', input: {} }] },
    ] });
    assert.equal(pedido.messages[1].tool_calls[0].id, 't1');
  });
});

describe('deOpenAI — erro dentro de um HTTP 200 (OpenRouter)', () => {
  test('choices[0].error vira exceção com status, não conversa muda', () => {
    assert.throws(
      () => deOpenAI({ choices: [{ error: { code: 429, message: 'Rate limited upstream' } }] }),
      (e) => e.status === 429 && /Rate limited/.test(e.message),
    );
  });
});

describe('CATALOGO — o que a tela vai mostrar', () => {
  test('todo modelo tem id, nome, preço (in/out) e uma nota honesta', () => {
    for (const [prov, lista] of Object.entries(CATALOGO)) {
      assert.ok(PROVEDORES[prov], `catálogo de provedor inexistente: ${prov}`);
      assert.ok(lista.length >= 2, `${prov}: menos de 2 sugestões`);
      for (const m of lista) {
        assert.ok(m.id && m.nome && m.nota, `${prov}/${m.id}: incompleto`);
        assert.ok(Number.isFinite(m.preco?.in) && Number.isFinite(m.preco?.out), `${prov}/${m.id}: sem preço`);
      }
    }
  });

  test('nenhum id RETIRADO está no catálogo', () => {
    // deepseek-chat/reasoner (24/07/2026), Llama e Qwen do Groq (16/08/2026).
    const ids = Object.values(CATALOGO).flat().map(m => m.id);
    for (const morto of ['deepseek-chat', 'deepseek-reasoner', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'qwen/qwen3-32b', 'gpt-4o-mini']) {
      assert.ok(!ids.includes(morto), `${morto} foi retirado pelo provedor`);
    }
  });

  test('o padrão do produto está no catálogo, com preço', () => {
    const m = CATALOGO.anthropic.find(x => x.id === PADRAO.modelo);
    assert.ok(m && m.preco.in === 1 && m.preco.out === 5);
  });

  test('a referência de preços é uma data', () => {
    assert.match(PRECOS_REFERENCIA, /^\d{4}-\d{2}-\d{2}$/);
  });

  test('flagsDoModelo: conhecido devolve as restrições, desconhecido devolve nenhuma', () => {
    assert.deepEqual(flagsDoModelo('anthropic', 'claude-sonnet-5'), { semTemperatura: true, reasoningNone: false, thinking: false });
    assert.deepEqual(flagsDoModelo('anthropic', 'claude-haiku-4-5-20251001'), { semTemperatura: false, reasoningNone: false, thinking: false });
    assert.deepEqual(flagsDoModelo('anthropic', 'claude-opus-5'), { semTemperatura: true, reasoningNone: false, thinking: true });
    assert.deepEqual(flagsDoModelo('openai', 'gpt-5.6-terra'), { semTemperatura: true, reasoningNone: true, thinking: false });
    assert.deepEqual(flagsDoModelo('xyz', 'nada'), { semTemperatura: false, reasoningNone: false, thinking: false });
  });

  test('Anthropic: a regra de temperatura é por FAMÍLIA — modelo 4.7+ digitado à mão não a recebe', () => {
    // "Models released after Claude Opus 4.6 do not support setting temperature"
    // (400). Fora do catálogo, `claude-opus-4-8` quebraria 100% dos turnos.
    for (const m of ['claude-opus-4-8', 'claude-opus-4-7', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-haiku-6']) {
      assert.equal(flagsDoModelo('anthropic', m).semTemperatura, true, m);
    }
    for (const m of ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6', 'claude-sonnet-4-5-20250929']) {
      assert.equal(flagsDoModelo('anthropic', m).semTemperatura, false, m);
    }
  });

  test('Fable 5.1 não está no catálogo — thinking sempre ligado e US$ 10/50 não é modelo de atendimento', () => {
    assert.ok(!CATALOGO.anthropic.some(m => m.id === 'claude-fable-5-1'));
  });
});
