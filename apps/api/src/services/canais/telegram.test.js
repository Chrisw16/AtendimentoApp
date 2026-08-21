import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { criarAdapterTelegram } from './telegram.js';

// CARACTERIZAÇÃO: fixa o comportamento que hoje vive no switch do
// motorFluxo.enviarResposta. O refactor não pode mudar nada disto.
function fakes() {
  const chamadas = [];
  return {
    chamadas,
    transportes: {
      tgEnviarTexto:  (chatId, texto)          => { chamadas.push(['texto', chatId, texto]); },
      tgEnviarBotoes: (chatId, texto, botoes)  => { chamadas.push(['botoes', chatId, texto, botoes]); },
      tgEnviarImagem: (chatId, url, legenda)   => { chamadas.push(['imagem', chatId, url, legenda]); },
    },
  };
}
const dest = { numero: '55999', instancia: null };

test('texto: envia quando há texto', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).texto(dest, { tipo: 'texto', texto: 'oi' });
  assert.deepEqual(f.chamadas, [['texto', '55999', 'oi']]);
});

test('texto: NÃO envia quando vazio', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).texto(dest, { tipo: 'texto', texto: '' });
  assert.deepEqual(f.chamadas, []);
});

test('botoes: corpo cai para resp.texto e depois para string vazia', async () => {
  const f = fakes();
  const a = criarAdapterTelegram(f.transportes);
  await a.botoes(dest, { botoes: [{ id: 'a', label: 'A' }], texto: 'via texto' });
  assert.equal(f.chamadas[0][2], 'via texto');
});

test('botoes: sem botões não envia nada', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).botoes(dest, { botoes: [], corpo: 'x' });
  assert.deepEqual(f.chamadas, []);
});

// ── lista: a degradação é tipo→tipo, não tipo→texto ────────────────
test('lista com até 8 itens vira BOTÕES (não texto)', async () => {
  const f = fakes();
  const itens = [{ id: 'i1', titulo: 'Um' }, { id: 'i2', titulo: 'Dois' }];
  await criarAdapterTelegram(f.transportes).lista(dest, { corpo: 'Escolha', itens });
  assert.equal(f.chamadas[0][0], 'botoes');
  assert.equal(f.chamadas[0][2], 'Escolha');
  assert.deepEqual(f.chamadas[0][3], [{ id: 'i1', label: 'Um' }, { id: 'i2', label: 'Dois' }]);
});

test('lista: item sem titulo usa o id como label', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).lista(dest, { itens: [{ id: 'so_id' }] });
  assert.deepEqual(f.chamadas[0][3], [{ id: 'so_id', label: 'so_id' }]);
});

test('lista com mais de 8 itens vira TEXTO numerado, cortado em 10', async () => {
  const f = fakes();
  const itens = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, titulo: `Item ${i}` }));
  await criarAdapterTelegram(f.transportes).lista(dest, { corpo: 'Menu', itens });
  assert.equal(f.chamadas[0][0], 'texto');
  const texto = f.chamadas[0][2];
  assert.match(texto, /^Menu\n\n/);
  assert.match(texto, /1️⃣ Item 0/);
  assert.match(texto, /🔟 Item 9/);
  assert.doesNotMatch(texto, /Item 10/, 'corta em 10 itens');
  assert.match(texto, /Digite o \*número\* da opção:$/);
});

test('lista vazia envia só o corpo como texto', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).lista(dest, { corpo: 'Só o corpo', itens: [] });
  assert.deepEqual(f.chamadas, [['texto', '55999', 'Só o corpo']]);
});

test('lista vazia e sem corpo não envia nada', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).lista(dest, { itens: [] });
  assert.deepEqual(f.chamadas, []);
});

test('lista aceita itens como string JSON (o Evolution NÃO faz isso)', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).lista(dest, { itens: '[{"id":"x","titulo":"X"}]' });
  assert.equal(f.chamadas[0][0], 'botoes');
  assert.deepEqual(f.chamadas[0][3], [{ id: 'x', label: 'X' }]);
});

test('lista com itens em JSON inválido não quebra', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).lista(dest, { itens: '{isso não é json', corpo: 'C' });
  assert.deepEqual(f.chamadas, [['texto', '55999', 'C']]);
});

test('cta vira texto com markdown de link', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).cta(dest, { corpo: 'Veja', label: 'Abrir', url: 'http://x' });
  assert.equal(f.chamadas[0][2], 'Veja\n\n🔗 [Abrir](http://x)');
});

test('cta sem label usa "Acessar"', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).cta(dest, { corpo: 'Veja', url: 'http://x' });
  assert.match(f.chamadas[0][2], /\[Acessar\]/);
});

test('imagem envia url e legenda', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).imagem(dest, { url: 'http://i', legenda: 'leg' });
  assert.deepEqual(f.chamadas, [['imagem', '55999', 'http://i', 'leg']]);
});

test('tipos sem método (audio/arquivo/localizacao) não têm implementação própria', () => {
  const a = criarAdapterTelegram(fakes().transportes);
  assert.equal(a.audio,       undefined);
  assert.equal(a.arquivo,     undefined);
  assert.equal(a.localizacao, undefined);
});

test('padrao envia resp.texto — reproduz o `default:` do switch', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).padrao(dest, { tipo: 'audio', url: 'u', texto: 'legenda' });
  assert.deepEqual(f.chamadas, [['texto', '55999', 'legenda']]);
});

test('padrao sem texto não envia nada', async () => {
  const f = fakes();
  await criarAdapterTelegram(f.transportes).padrao(dest, { tipo: 'localizacao', lat: 1 });
  assert.deepEqual(f.chamadas, []);
});
