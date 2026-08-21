/**
 * canais/evolution.js — adapter da Evolution API (WhatsApp via QR Code).
 *
 * Extraído byte-a-byte do ramo `else` do switch de `motorFluxo.enviarResposta`,
 * incluindo as assimetrias em relação ao Telegram (documentadas nos testes):
 *  - o guard `if (!instancia) return`, que aborta o envio;
 *  - `lista` NÃO faz parse de itens em string JSON (o Telegram faz);
 *  - `cta` não tem guard nenhum;
 *  - não existe `localizacao`: o tipo é descartado em silêncio;
 *  - não existe `default`: tipo desconhecido não envia nada.
 */
export function criarAdapterEvolution(t) {
  // Todo método aborta sem instância — era um `return` antes do switch.
  const comInstancia = (fn) => async (destino, resp) => {
    if (!destino.instancia) return;
    return fn(destino, resp);
  };

  return {
    id: 'whatsapp',
    rotulo: 'WhatsApp (Evolution)',

    texto:   comInstancia(({ instancia, numero }, r) => t.evolutionEnviarTexto(instancia, numero, r.texto)),
    cta:     comInstancia(({ instancia, numero }, r) => t.evolutionEnviarCTA(instancia, numero, r)),

    botoes:  comInstancia(({ instancia, numero }, r) =>
      r.botoes?.length ? t.evolutionEnviarBotoes(instancia, numero, r) : undefined),

    lista:   comInstancia(({ instancia, numero }, r) =>
      r.itens?.length ? t.evolutionEnviarLista(instancia, numero, r) : undefined),

    imagem:  comInstancia(({ instancia, numero }, r) =>
      r.url ? t.evolutionEnviarImagem(instancia, numero, r) : undefined),

    audio:   comInstancia(({ instancia, numero }, r) =>
      r.url ? t.evolutionEnviarAudio(instancia, numero, r) : undefined),

    arquivo: comInstancia(({ instancia, numero }, r) =>
      r.url ? t.evolutionEnviarArquivo(instancia, numero, r) : undefined),

    // sem `localizacao`: preserva o descarte silencioso de hoje.
  };
}
