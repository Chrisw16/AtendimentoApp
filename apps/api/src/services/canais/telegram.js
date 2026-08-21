/**
 * canais/telegram.js — adapter do Telegram.
 *
 * Extraído byte-a-byte do `switch` que vivia em `motorFluxo.enviarResposta`.
 * Recebe os transportes por injeção para ser testável sem rede: o módulo
 * `services/telegram.js` puxa `integrations.js` → `getKV` → banco.
 *
 * A degradação aqui é tipo→tipo, não tipo→texto: o Telegram não tem lista
 * nativa, e uma lista curta vira BOTÕES (não texto numerado). Por isso a
 * degradação mora no adapter, e não numa função genérica do dispatcher.
 */
export function criarAdapterTelegram({ tgEnviarTexto, tgEnviarBotoes, tgEnviarImagem }) {
  return {
    id: 'telegram',
    rotulo: 'Telegram',

    async texto({ numero }, resp) {
      if (resp.texto) await tgEnviarTexto(numero, resp.texto);
    },

    async botoes({ numero }, resp) {
      if (resp.botoes?.length) {
        await tgEnviarBotoes(numero, resp.corpo || resp.texto || '', resp.botoes);
      }
    },

    async lista({ numero }, resp) {
      let itens = resp.itens || [];
      // Pode vir como string JSON. (O adapter da Evolution NÃO faz isso — a
      // assimetria é herdada e está fixada em teste.)
      if (typeof itens === 'string') { try { itens = JSON.parse(itens); } catch { itens = []; } }
      if (!Array.isArray(itens)) itens = [];

      if (!itens.length) {
        // Sem itens: manda só o corpo para não travar a conversa.
        if (resp.corpo) await tgEnviarTexto(numero, resp.corpo);
        return;
      }

      if (itens.length <= 8) {
        const botoes = itens.map(it => ({ id: it.id, label: it.titulo || it.id }));
        await tgEnviarBotoes(numero, resp.corpo || 'Selecione uma opção:', botoes);
        return;
      }

      const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
      const linhas = itens.slice(0, 10)
        .map((it, i) => `${emojis[i] || `${i + 1}.`} ${it.titulo || it.id}`)
        .join('\n');
      await tgEnviarTexto(
        numero,
        `${resp.corpo || 'Selecione uma opção:'}\n\n${linhas}\n\nDigite o *número* da opção:`
      );
    },

    async cta({ numero }, resp) {
      if (resp.corpo) {
        await tgEnviarTexto(numero, `${resp.corpo}\n\n🔗 [${resp.label || 'Acessar'}](${resp.url})`);
      }
    },

    async imagem({ numero }, resp) {
      if (resp.url) await tgEnviarImagem(numero, resp.url, resp.legenda);
    },

    // `padrao` reproduz o `default:` do switch: tipos não implementados
    // (audio, arquivo, localizacao, desconhecidos) viram texto SE houver
    // `resp.texto`. A Evolution não tem equivalente — lá esses tipos somem.
    async padrao({ numero }, resp) {
      if (resp.texto) await tgEnviarTexto(numero, resp.texto);
    },
  };
}
