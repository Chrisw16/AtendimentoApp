/**
 * canais/index.js — dispatcher de envio por canal.
 *
 * Substitui APENAS o `switch` de despacho que vivia em
 * `motorFluxo.enviarResposta`. Persistência da mensagem, broadcast SSE e os
 * guards de `resp.texto`/`chatId` continuam no motor: `enviarResposta` faz
 * bem mais do que enviar, e mover isso mudaria comportamento.
 *
 * Regra de resolução:
 *  - canal → adapter; canal desconhecido cai na Evolution, reproduzindo o
 *    `else` genérico do motor;
 *  - tipo → método do adapter; se o adapter não implementa o tipo, usa o
 *    método `padrao` — que SÓ o Telegram tem (era o `default:` do switch).
 *    A Evolution não tem `padrao` de propósito: hoje ela descarta tipos
 *    desconhecidos (inclusive `localizacao`) em silêncio.
 */
export function criarDispatcher(adapters, canalPadrao = 'whatsapp') {
  return async function enviarPorCanal(canal, destino, resp) {
    const adapter = adapters[canal] ?? adapters[canalPadrao];
    if (!adapter) return;
    const metodo = adapter[resp.tipo] ?? adapter.padrao;
    if (!metodo) return;
    return metodo(destino, resp);
  };
}

/** Constrói os adapters reais, importando os transportes sob demanda
 *  (o motor já fazia `await import('./telegram.js')` dentro do envio). */
export async function adaptersPadrao() {
  const [{ criarAdapterTelegram }, { criarAdapterEvolution }, tg, integ] = await Promise.all([
    import('./telegram.js'),
    import('./evolution.js'),
    import('../telegram.js'),
    import('../integrations.js'),
  ]);
  return {
    telegram:  criarAdapterTelegram(tg),
    whatsapp:  criarAdapterEvolution(integ),
  };
}

// Instância única, montada na primeira chamada (os `import()` já são cacheados
// pelo Node; isto evita recriar os objetos de adapter a cada mensagem).
let _enviar = null;
export async function enviarPorCanal(canal, destino, resp) {
  if (!_enviar) _enviar = criarDispatcher(await adaptersPadrao());
  return _enviar(canal, destino, resp);
}
