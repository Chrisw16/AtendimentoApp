/**
 * filaPorChave.js — serialização de tarefas assíncronas por chave.
 *
 * Existe por causa da race do motor de fluxo: `processarConversa` lê o estado
 * da conversa, faz vários `await` (SGP/IA) e só então grava de volta. Duas
 * mensagens seguidas do mesmo cliente intercalavam nessa janela e corrompiam
 * o estado (saltos de nó, resposta duplicada).
 *
 * Tarefas da MESMA chave rodam uma de cada vez, em ordem FIFO.
 * Chaves diferentes (conversas diferentes) seguem em paralelo.
 */
export function criarFilaPorChave() {
  // chave → promessa da última tarefa enfileirada (a "cauda" da fila)
  const filas = new Map();

  function executar(chave, tarefa) {
    const anterior = filas.get(chave) || Promise.resolve();

    const correr = async () => {
      try {
        return await tarefa();
      } finally {
        // Só limpa se ninguém entrou na fila depois desta tarefa.
        if (filas.get(chave) === cauda) filas.delete(chave);
      }
    };

    // `correr` nos dois ramos: um erro anterior não pode travar a fila.
    const atual = anterior.then(correr, correr);

    // A cauda absorve erros — quem espera é o chamador, via `atual`.
    const cauda = atual.catch(() => {});
    filas.set(chave, cauda);

    return atual;
  }

  /** Quantidade de chaves com tarefa em voo — usado em teste e diagnóstico. */
  executar.tamanho = () => filas.size;

  return executar;
}
