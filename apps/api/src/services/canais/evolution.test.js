import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { criarAdapterEvolution } from './evolution.js';

// CARACTERIZAÇÃO do ramo `else` do switch de motorFluxo.enviarResposta.
function fakes() {
  const chamadas = [];
  const reg = nome => (...args) => { chamadas.push([nome, ...args]); };
  return {
    chamadas,
    transportes: {
      evolutionEnviarTexto:   reg('texto'),
      evolutionEnviarBotoes:  reg('botoes'),
      evolutionEnviarLista:   reg('lista'),
      evolutionEnviarCTA:     reg('cta'),
      evolutionEnviarImagem:  reg('imagem'),
      evolutionEnviarAudio:   reg('audio'),
      evolutionEnviarArquivo: reg('arquivo'),
    },
  };
}
const dest = { numero: '5511999', instancia: 'netgo' };

test('texto envia com (instancia, numero, texto)', async () => {
  const f = fakes();
  await criarAdapterEvolution(f.transportes).texto(dest, { texto: 'oi' });
  assert.deepEqual(f.chamadas, [['texto', 'netgo', '5511999', 'oi']]);
});

test('SEM instancia, nada é enviado (guard herdado do motor)', async () => {
  const f = fakes();
  const a = criarAdapterEvolution(f.transportes);
  const semInst = { numero: '5511999', instancia: null };
  await a.texto(semInst,  { texto: 'oi' });
  await a.imagem(semInst, { url: 'http://i' });
  assert.deepEqual(f.chamadas, [], 'o motor faz `if (!instancia) return` antes do switch');
});

test('botoes só envia quando há botões', async () => {
  const f = fakes();
  const a = criarAdapterEvolution(f.transportes);
  await a.botoes(dest, { botoes: [] });
  assert.deepEqual(f.chamadas, []);
  await a.botoes(dest, { botoes: [{ id: 'a', label: 'A' }] });
  assert.equal(f.chamadas.length, 1);
});

test('lista só envia quando há itens — e NÃO faz parse de string JSON', async () => {
  const f = fakes();
  const a = criarAdapterEvolution(f.transportes);
  // Assimetria herdada: o Telegram faz JSON.parse aqui, o Evolution não.
  // Uma string tem .length, então o guard `resp.itens?.length` PASSA e a
  // string crua é repassada. Fixado como está — corrigir é mudança de
  // comportamento, fora do escopo do refactor.
  await a.lista(dest, { itens: '[{"id":"x"}]' });
  assert.equal(f.chamadas.length, 1);
  assert.equal(f.chamadas[0][3].itens, '[{"id":"x"}]');
});

test('lista sem itens não envia', async () => {
  const f = fakes();
  await criarAdapterEvolution(f.transportes).lista(dest, { itens: [] });
  assert.deepEqual(f.chamadas, []);
});

test('cta envia sempre, sem guard', async () => {
  const f = fakes();
  await criarAdapterEvolution(f.transportes).cta(dest, { corpo: '', url: '' });
  assert.equal(f.chamadas.length, 1, 'o switch não guarda o cta');
});

test('imagem, audio e arquivo exigem url', async () => {
  const f = fakes();
  const a = criarAdapterEvolution(f.transportes);
  await a.imagem(dest,  {});
  await a.audio(dest,   {});
  await a.arquivo(dest, {});
  assert.deepEqual(f.chamadas, []);
  await a.imagem(dest,  { url: 'u' });
  await a.audio(dest,   { url: 'u' });
  await a.arquivo(dest, { url: 'u', filename: 'f.pdf' });
  assert.deepEqual(f.chamadas.map(c => c[0]), ['imagem', 'audio', 'arquivo']);
});

test('localizacao NÃO é implementada — hoje é descartada em silêncio', async () => {
  // O switch da Evolution não tem case 'localizacao', embora o motor gere esse
  // tipo. Preservado: corrigir é melhoria de comportamento, não refactor.
  assert.equal(criarAdapterEvolution(fakes().transportes).localizacao, undefined);
});
