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
/**
 * Sentinela de "não despachei, e o motivo é este".
 *
 * FASE 4: os returns silenciosos daqui e dos adapters (sem adapter, sem método
 * para o tipo, sem instância) faziam a mensagem ser persistida e broadcastada —
 * a tela dizia ENVIADA e o cliente nunca recebia. O caso vivo é
 * `tipo:'localizacao'` na Evolution, que ela não implementa de propósito.
 * Continuam não enviando; param de mentir que enviaram (o outbox marca
 * `nao_suportada`).
 */
export const NAO = (motivo) => ({ despachado: false, motivo });

export function criarDispatcher(adapters, canalPadrao = 'whatsapp') {
  return async function enviarPorCanal(canal, destino, resp) {
    const adapter = adapters[canal] ?? adapters[canalPadrao];
    if (!adapter) return NAO('sem_adapter');
    const metodo = adapter[resp.tipo] ?? adapter.padrao;
    if (!metodo) return NAO(`tipo_nao_suportado:${resp.tipo}`);
    const r = await metodo(destino, resp);
    // O retorno do provedor segue vivo em `retorno`: é de lá que sai o
    // `external_id` que o §126 pede.
    return (r && r.despachado === false) ? r : { despachado: true, retorno: r };
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
