import { test } from 'node:test';
import assert    from 'node:assert/strict';
import { criarFilaPorChave } from './filaPorChave.js';

// Simula o padrão do motor: lê estado → await (SGP/IA) → grava estado.
// É exatamente esse read-modify-write que a race corrompe.
function criarEstadoCompartilhado() {
  const mapa = new Map();
  return {
    mapa,
    async incrementar(chave) {
      const atual = mapa.get(chave) || 0;
      await new Promise(r => setTimeout(r, 5)); // janela da race (await SGP/IA)
      mapa.set(chave, atual + 1);
    },
  };
}

test('sem serialização o read-modify-write se perde (reproduz a race)', async () => {
  const estado = criarEstadoCompartilhado();

  await Promise.all([estado.incrementar('conv-1'), estado.incrementar('conv-1')]);

  // Duas mensagens intercalam: ambas leem 0, ambas gravam 1.
  assert.equal(estado.mapa.get('conv-1'), 1, 'a race deveria perder um incremento');
});

test('serializa tarefas da mesma chave (corrige a race)', async () => {
  const executar = criarFilaPorChave();
  const estado   = criarEstadoCompartilhado();

  await Promise.all([
    executar('conv-1', () => estado.incrementar('conv-1')),
    executar('conv-1', () => estado.incrementar('conv-1')),
  ]);

  assert.equal(estado.mapa.get('conv-1'), 2);
});

test('chaves diferentes executam em paralelo', async () => {
  const executar = criarFilaPorChave();
  let emVoo = 0, maxEmVoo = 0;

  const tarefa = async () => {
    emVoo++;
    maxEmVoo = Math.max(maxEmVoo, emVoo);
    await new Promise(r => setTimeout(r, 10));
    emVoo--;
  };

  await Promise.all([executar('conv-1', tarefa), executar('conv-2', tarefa)]);

  assert.equal(maxEmVoo, 2, 'conversas distintas não devem bloquear uma à outra');
});

test('preserva a ordem FIFO dentro da mesma chave', async () => {
  const executar = criarFilaPorChave();
  const ordem    = [];

  await Promise.all([
    executar('conv-1', async () => { await new Promise(r => setTimeout(r, 15)); ordem.push('primeira'); }),
    executar('conv-1', async () => { ordem.push('segunda'); }),
    executar('conv-1', async () => { ordem.push('terceira'); }),
  ]);

  assert.deepEqual(ordem, ['primeira', 'segunda', 'terceira']);
});

test('uma tarefa que falha não trava as seguintes', async () => {
  const executar = criarFilaPorChave();
  let rodou = false;

  const falha = executar('conv-1', async () => { throw new Error('SGP fora do ar'); });
  await assert.rejects(falha, /SGP fora do ar/);

  await executar('conv-1', async () => { rodou = true; });
  assert.equal(rodou, true, 'a fila da conversa deve continuar viva após um erro');
});

test('propaga o retorno da tarefa para quem chamou', async () => {
  const executar = criarFilaPorChave();
  const valor    = await executar('conv-1', async () => 'protocolo-123');
  assert.equal(valor, 'protocolo-123');
});

test('libera a chave quando a fila esvazia (não vaza memória)', async () => {
  const executar = criarFilaPorChave();

  await executar('conv-1', async () => {});
  assert.equal(executar.tamanho(), 0, 'chave drenada deve ser removida do mapa');

  const emAndamento = executar('conv-2', () => new Promise(r => setTimeout(r, 10)));
  assert.equal(executar.tamanho(), 1, 'chave com tarefa em voo deve estar no mapa');
  await emAndamento;
  assert.equal(executar.tamanho(), 0);
});
