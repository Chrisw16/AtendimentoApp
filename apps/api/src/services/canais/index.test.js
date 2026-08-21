import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { criarDispatcher } from './index.js';

function adapterFalso(id, metodos = []) {
  const chamadas = [];
  const a = { id, chamadas };
  for (const m of metodos) a[m] = async (d, r) => { chamadas.push([m, d, r]); };
  return a;
}
const dest = { numero: '55', instancia: 'inst' };

test('roteia para o adapter do canal da conversa', async () => {
  const tg  = adapterFalso('telegram', ['texto']);
  const evo = adapterFalso('whatsapp', ['texto']);
  const enviar = criarDispatcher({ telegram: tg, whatsapp: evo });

  await enviar('telegram', dest, { tipo: 'texto', texto: 'oi' });
  assert.equal(tg.chamadas.length, 1);
  assert.equal(evo.chamadas.length, 0);
});

test('canal desconhecido cai na Evolution (preserva o `else` do motor)', async () => {
  const evo = adapterFalso('whatsapp', ['texto']);
  const enviar = criarDispatcher({ whatsapp: evo });
  await enviar('canal_que_nao_existe', dest, { tipo: 'texto', texto: 'oi' });
  assert.equal(evo.chamadas.length, 1);
});

test('tipo sem método usa `padrao` quando o adapter tem um (caso Telegram)', async () => {
  const tg = adapterFalso('telegram', ['texto', 'padrao']);
  const enviar = criarDispatcher({ telegram: tg });
  await enviar('telegram', dest, { tipo: 'audio', url: 'u', texto: 'legenda' });
  assert.equal(tg.chamadas[0][0], 'padrao');
});

test('tipo sem método e SEM `padrao` não envia nada (caso Evolution)', async () => {
  // Crítico: um fallback genérico para texto faria a Evolution passar a enviar
  // `localizacao`, que hoje ela descarta. Isso seria mudança observável.
  const evo = adapterFalso('whatsapp', ['texto']);
  const enviar = criarDispatcher({ whatsapp: evo });
  await enviar('whatsapp', dest, { tipo: 'localizacao', lat: 1, lng: 2 });
  assert.deepEqual(evo.chamadas, []);
});

test('propaga erro do adapter para quem chamou tratar', async () => {
  const quebrado = { id: 'x', texto: async () => { throw new Error('provedor fora'); } };
  const enviar = criarDispatcher({ whatsapp: quebrado });
  await assert.rejects(enviar('whatsapp', dest, { tipo: 'texto', texto: 'oi' }), /provedor fora/);
});
