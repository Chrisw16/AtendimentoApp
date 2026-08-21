# WhatsApp API Oficial (Meta Cloud API) como canal

**Data:** 2026-08-21 · **Status:** aprovado, não implementado

## Problema

O chat precisa atender também pela **API Oficial do WhatsApp** (Meta Cloud API), **convivendo** com a Evolution (QR Code) já em produção.

Hoje existe só a **entrada**: `services/webhooks/meta.js` (151 linhas) recebe o webhook, cria conversa/mensagem e aciona o motor. Falta todo o resto:

1. **Nenhuma saída.** `integrations.js` não tem uma linha de código Meta. O despacho por canal ignora Meta em dois lugares — `motorFluxo.enviarResposta` (`if telegram … else Evolution`) e `chat.js:103` (`whatsapp` → Evolution, `telegram` → Telegram).
2. **Colisão de identidade de canal.** `meta.js:33` grava `canal = 'whatsapp'` — o mesmo valor da Evolution. Mensagem que entra pela Meta gera conversa indistinguível, e qualquer resposta sai pela Evolution: **o cliente nunca recebe**. Pior, `porTelefoneCanal(telefone, 'whatsapp')` mistura conversas dos dois provedores para o mesmo número.
3. **Mídia de entrada quebrada.** `extrairConteudo` monta URLs `/api/media/<id>`, mas **essa rota não existe** — toda mídia recebida vira link morto no painel.
4. **Webhook sem validação de assinatura.** Não há checagem de `X-Hub-Signature-256`. A rota é pública: qualquer um que descubra a URL injeta mensagem falsa, dispara a IA e gasta tokens da Anthropic.

Há ainda um problema pré-existente que este trabalho atravessa: **o despacho por canal está duplicado e já divergiu**. O motor trata 8 tipos de mensagem; o `chat.js` importa apenas `evolutionEnviarTexto` e `tgEnviarTexto` — ou seja, **o agente humano só consegue enviar texto**, em qualquer canal.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Evolution × Oficial | **Convivem** — os dois ativos ao mesmo tempo |
| Tipos de mensagem | **Todos, incluindo mídia** (8 tipos) |
| Fora da janela de 24h | **Precisa de templates** |
| Tela de templates | **Sim**, com envio **individual**; disparo em massa fica fora |
| Assinatura do webhook | **Entra junto**, não depois |
| Abordagem | **Registry de adapters** (não estender o `if/else`) |

## Arquitetura: registry de canais

Cada provedor vira um módulo em `apps/api/src/services/canais/`, expondo **um método por tipo de mensagem**:

```js
// canais/meta.js
export default {
  id: 'whatsapp_oficial',
  rotulo: 'WhatsApp (API Oficial)',
  async texto(destino, resp)  { … },
  async botoes(destino, resp) { … },
  async lista(destino, resp)  { … },
  // imagem, audio, arquivo, cta, localizacao
};
```

`destino` deriva da conversa: `{ numero, instancia, conversa }`. Evolution usa `instancia`; Telegram só `numero`; Meta usa o `phone_number_id` da config.

O dispatcher resolve o adapter por `conversas.canal` e centraliza a **degradação**:

```js
// canais/index.js
export async function enviarPorCanal(conversa, resp) {
  const adapter = ADAPTERS[conversa.canal] ?? ADAPTERS.whatsapp;
  const enviar  = adapter[resp.tipo];
  if (enviar) return enviar(destinoDe(conversa), resp);
  return adapter.texto(destinoDe(conversa), { texto: renderizarComoTexto(resp) });
}
```

**A degradação mora em cada adapter, não numa função genérica.** A ideia original (`renderizarComoTexto` central) não expressa o comportamento real: o Telegram degrada `lista → BOTÕES` quando há ≤8 itens, e só vira texto numerado acima disso. É degradação tipo→tipo. Cada adapter carrega as próprias esquisitices; o dispatcher fica burro.

Quando o adapter não implementa um tipo, o dispatcher usa o método `padrao` — que **só o Telegram tem** (era o `default:` do switch). A Evolution não tem `padrao` de propósito: hoje ela descarta tipos desconhecidos, **incluindo `localizacao`**, em silêncio. Um fallback genérico para texto faria a Evolution passar a enviar localização — mudança observável.

**Sobre o fallback `?? ADAPTERS.whatsapp`:** canal desconhecido cai na Evolution. Isso **preserva deliberadamente o comportamento de hoje** (o `else` do motor manda tudo que não é Telegram para a Evolution) e mantém o refactor da Fase 1 inobservável. Vale registrar que é um comportamento herdado e discutível: os canais `widget`, `email`, `voip` e `sms` existem no catálogo da tela de Canais e cairiam aqui. Nenhum deles está em uso — mas se algum entrar, precisa de adapter próprio, não do fallback.

Depois disso `motorFluxo.enviarResposta` e `chat.js` viram uma chamada cada. Some a duplicação e **o agente passa a enviar mídia em qualquer canal**.

### Mapa de tipos por provedor

| Tipo | Evolution | Telegram | Meta (Cloud API) |
|---|---|---|---|
| `texto` | nativo | nativo | nativo |
| `botoes` | nativo | nativo | `interactive/button` — **máx. 3** |
| `lista` | nativo | degrada p/ texto | `interactive/list` — **máx. 10 linhas** |
| `imagem` | nativo | nativo | nativo |
| `audio` | nativo | degrada | nativo |
| `arquivo` | nativo | degrada | nativo (`document`) |
| `cta` | nativo | degrada | **nativo** (`interactive/cta_url`, 1 botão) |
| `localizacao` | nativo | degrada | nativo |

> Os limites de 3 botões e 10 linhas são da Cloud API e devem ser **reconfirmados na documentação vigente da Meta** na hora de implementar. O `saudacao` do fluxo v2 tem exatamente 3 botões — passa raspando, e o validador de fluxo deveria futuramente alertar sobre isso por canal.

## Identidade do canal

`meta.js` passa a gravar `canal: 'whatsapp_oficial'`. Isso resolve a colisão e faz o dispatcher escolher o adapter certo sem lógica extra.

**Risco a tratar:** todo lugar que compara `canal === 'whatsapp'` precisa ser auditado — dashboard "por canal", filtros de Histórico, `porTelefoneCanal`. Conversas antigas permanecem em `'whatsapp'` (Evolution), o que é correto.

## Credenciais

No `sistema_kv`, seguindo a convenção do projeto (credenciais no banco, não em env), adicionadas a `CHAVES_PUBLICAS` em `routes/sysconfig.js`:

- `meta_access_token` — token permanente de system user
- `meta_phone_number_id` — remetente
- `meta_waba_id` — conta de negócio, usada para listar templates
- `meta_app_secret` — validação de assinatura do webhook

`META_VERIFY_TOKEN` continua em env (já é assim hoje, usado no handshake de verificação).

## Mídia

**Entrada — baixar no ingest, não fazer proxy sob demanda.** A Meta entrega um `media_id`; é preciso `GET /{media-id}` para obter a URL, que **exige o bearer token**. Dois prazos matam o proxy sob demanda: a **URL expira em ~5 minutos** e o **`media_id` de webhook vale 7 dias** — ou seja, toda mídia antiga voltaria a ser link morto. Então o `handleMeta` **baixa e guarda** no ingest, com id interno opaco, e `/api/media/:id` serve do nosso lado.

Requisitos de segurança da rota (levantados em revisão, todos ausentes da versão original):
- **Autenticação**: `<img src>` e `<audio src>` **não mandam header `Authorization`** — `authMiddleware` puro quebraria toda mídia no painel. Usar token curto assinado específico de mídia, não o JWT de 30 dias na query.
- **Ownership check**: o id interno tem que pertencer a uma mensagem de uma conversa.
- **Allowlist de MIME na saída** e `Content-Disposition: attachment` para o que não for imagem/áudio/vídeo. Sem isso, um `document` com `mime_type: text/html` vira XSS armazenado na origem do painel — e com a CSP desligada e o JWT em localStorage, isso termina em `GET /api/sysconfig`.
- **Validação estrita do id** (`^\d+$`) antes de compor qualquer URL da Graph, e allowlist de host no fetch autenticado: o Express decodifica `%2F`, então um id malicioso vira outro endpoint da Graph chamado com o nosso token.
- **Cap de tamanho** (documento na Meta vai a 100 MB) e rate limit.

**Saída** — a Fase 2 implementa **apenas link público**, que cobre os casos do fluxo (as URLs de mídia hoje vêm do próprio sistema). Upload de binário para a Meta fica **explicitamente fora desta entrega**; se aparecer necessidade de enviar arquivo local, vira item novo.

## Janela de 24 horas

Helper puro `janelaAberta(conversa)`, decidido pela última mensagem do cliente. Fora da janela a Meta **rejeita** texto livre — só passa template.

**Falha visível, não silenciosa:** a tentativa fora da janela grava uma **nota de sistema na conversa** ("não enviada — janela de 24h fechada") além do log, para o agente enxergar. Esta decisão é deliberada: o sistema já tem histórico de falhar em silêncio (`transferir_agente` sem mensagem, config de nó ignorada), e uma mensagem que não chega ao cliente é exatamente o tipo de falha que não pode ficar só no log.

## Templates

- **Listagem** direto da Meta (`GET /{waba_id}/message_templates`) — a tela reflete o que está realmente aprovado, sem cadastro duplicado do nosso lado.
- **Envio individual**: `enviarTemplate(destino, { nome, idioma, variaveis })` no adapter.
- **UI**: aba dentro do card *WhatsApp (API Oficial)* na tela de Canais (o template só existe no contexto desse canal). Mostra nome, idioma, status de aprovação, corpo com as variáveis e campos para preenchê-las.

**Fora de escopo — disparo em massa.** Exige controle de opt-out, respeito aos limites de envio e monitoramento de qualidade: a Meta rebaixa e pode **banir o número** por acúmulo de bloqueios e denúncias. Para um provedor, perder o WhatsApp é dano sério. Se for necessário, vira frente própria com essas proteções.

## Segurança do webhook

Validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com `meta_app_secret`) antes de processar.

**Parser escopado, não `verify` global.** `server.js:42` monta `express.json({ limit: '10mb' })` app-wide; um `verify` ali copiaria o Buffer de **toda** requisição da API. O correto é montar `express.raw()` apenas no path da Meta, antes do parser global — o body-parser marca `req._body`, então o `express.json` global pula a rota e Evolution/Telegram ficam intactos.

Demais requisitos: comparação **timing-safe** (`timingSafeEqual` **lança** com buffers de tamanhos diferentes, então precisa de guarda), parse do JSON **depois** da validação, e **fail-closed** — sem `meta_app_secret` configurado a rota recusa, nunca libera.

> **Já corrigido em 2026-08-21, fora desta feature:** o handshake `GET /api/webhooks/meta` era um refletor de HTML não autenticado (`res.send(challenge)` + `META_VERIFY_TOKEN` indefinida fazendo `undefined === undefined` passar). Confirmado ao vivo na produção e fechado no commit `f8ed98f` (`verificarHandshake`, fail-closed, `text/plain`). Junto foi fechada a leitura irrestrita do `sistema_kv` em `GET /api/sysconfig/:chave`.

## Fases

Cada fase é testável e deployável sozinha. **Cada uma merece seu próprio plano de implementação** — este documento é o desenho das quatro, não um plano único.

**Fase 1 — Registry de canais.** ✅ **IMPLEMENTADA.** Extrai os adapters de Evolution e Telegram para `services/canais/`, com dispatcher. **Testes de caracterização primeiro** (30 testes), fixando o comportamento atual de cada tipo em cada canal.

**Estritamente inobservável.** A versão original desta spec dizia "tudo igual — e o agente ganha envio de mídia", o que é contraditório: ganhar mídia É observável. Além disso o refactor **não conseguiria** entregar isso — o botão de anexo do painel (`ConversaView.jsx:97`) não tem `onClick`, então falta o upload inteiro. Mídia do agente é feature própria, fora daqui.

Escopo real da fase: **só o `switch` de `motorFluxo.enviarResposta`**. Persistência, broadcast e os guards de `resp.texto`/`chatId` ficam onde estão — `enviarResposta` faz muito mais que enviar. O `chat.js` **não é tocado**: ele só envia texto, então o dispatcher não ganharia nada ali hoje, e ele não tem `else` (o motor tem), o que tornaria a unificação observável. Ele migra na Fase 2, quando precisar tratar `whatsapp_oficial` — hoje uma conversa desse canal cairia fora dos dois ramos dele e a mensagem sumiria em silêncio, com 201 e bolha no painel.

**Fase 2 — Canal Meta.** Adapter com os 8 tipos, credenciais no `sistema_kv`, card na tela de Canais, `meta.js` gravando `whatsapp_oficial`, validação de assinatura, rota `/api/media/:id`. Ao fim, um atendimento completo roda pela API Oficial.

**Fase 3 — Janela de 24h.** `janelaAberta` + recusa visível.

**Fase 4 — Templates.** Listagem, envio individual, aba no card do canal.

## Testes

Seguindo a convenção do projeto (runner nativo `node --test`, lógica testável em módulos puros ao lado dos que abrem socket):

- `renderizarComoTexto` — puro, TDD. Cada tipo degradado (lista numerada, cta com link, arquivo com nome).
- `janelaAberta` — puro, TDD. Dentro, fora, fronteira exata, conversa sem mensagem do cliente.
- Caracterização do despacho por canal antes do refactor da Fase 1.
- Montagem do payload da Graph API por tipo — puro, TDD (o `fetch` fica isolado num helper de transporte, como `sgpPost`).
- Validação de assinatura — puro, TDD: assinatura válida, inválida, ausente, corpo adulterado.

## Riscos

| Risco | Mitigação |
|---|---|
| Refactor da Fase 1 quebra Evolution/Telegram em produção | Testes de caracterização antes de mover código |
| `canal === 'whatsapp'` espalhado quebra ao introduzir `whatsapp_oficial` | Auditar todas as ocorrências antes da Fase 2 |
| Limites da Cloud API (3 botões, 10 linhas) mudarem | Reconfirmar na doc vigente; validador de fluxo alertar por canal (futuro) |
| Número banido por template mal usado | Envio em massa fora de escopo; envio individual apenas |

## Pendências levantadas em revisão (a resolver antes da Fase 2)

Achados de três revisões (arquitetura contra o código, segurança, e verificação da doc da Meta) que ainda não estão resolvidos no desenho:

- **`Canais.jsx` não renderiza a partir do banco.** `Canais.jsx:216` itera o catálogo hardcoded `CANAL_META` e só busca a linha correspondente. Uma linha `canais.tipo='whatsapp_oficial'` no seed **não aparece na tela**. As Fases 2 e 4 exigem editar `CANAL_META` — a spec original não dizia isso.
- **Já existe UI de credenciais Meta, inerte.** O card `whatsapp` (`Canais.jsx:11-22`) tem `provider: ['meta','evolution']`, `phone_number_id` e `access_token`, gravando em `canais.config` — e **nada lê esses campos**. Decidir: remover (evitando duas fontes de verdade) ou usar. Ainda: `routes/canais.js` PUT **não chama** `invalidateConfigCache()`, ao contrário de `sysconfig.js`.
- **Segredos no `sysconfig`.** Adicionar `meta_access_token`/`meta_app_secret` a `CHAVES_PUBLICAS` amplia a exposição do `GET /api/sysconfig`, que devolve tudo em texto plano. Recomendação: conjunto `CHAVES_SECRETAS` com semântica *write-only* (GET devolve `{configurado, preview}`), estendido aos segredos que já estão lá.
- **Vocabulário de tipos inconsistente.** A entrada gera `tipo: 'doc'` (`meta.js`) e a saída usa `'arquivo'` (`motorFluxo.js`); `ConversaView` só renderiza `imagem` e `audio`, então `video` e `doc` aparecem como texto. O registry keyed por `resp.tipo` herda essa inconsistência — definir vocabulário canônico.
- **Truncar rótulo de botão quebra o menu.** Título de botão na Meta é **20 chars e precisa ser único**. O motor casa a resposta comparando o texto de volta com o `label` (`motorFluxo.js:175`), então truncar faria o match falhar e cair na porta `saida` em silêncio. Decidir entre rejeitar na validação de fluxo ou casar por `id`.
- **Conversas Meta antigas.** Conversas criadas pelo `meta.js` **antes** da mudança ficam rotuladas `'whatsapp'` e passariam a responder pela Evolution para sempre. Verificar o banco de produção e, se houver, fazer backfill.
- **Sandbox.** O canal `sandbox` (`fluxos.js`, `chatTeste.js`) hoje só é seguro porque `opts.enviar` intercepta antes do dispatcher. A nota de sistema da Fase 3 não pode gravar em conversa fabricada (id `sandbox:*`, sem FK).
- **Envio de template precisa de autorização.** `canaisRouter` só tem `adminMiddleware` no `PUT`; sem isso, qualquer agente dispararia template para qualquer número. Exigir destino de conversa existente, rate limit por agente e auditoria de quem disparou.
- **Webhook responde depois de processar.** `webhooks.js` faz `await handleMeta(req.body)` antes do 200; a Meta penaliza webhook lento. Padrão é responder 200 e processar em seguida.

## Contexto de custo (verificado na doc da Meta)

**A partir de 1º de outubro de 2026, mensagens de sessão passam a ser cobradas.** Hoje as mensagens livres dentro da janela de 24h são gratuitas. Isso incide direto no dimensionamento do fluxo: o nó comercial usa `max_turnos: 25`, ou seja até 25 idas e voltas por cadastro — que hoje custam só tokens da Anthropic e passarão a custar também WhatsApp. Vale reconfirmar com a Meta, por envolver preço.

Também: a versão da Graph API deve ser **fixada explicitamente na URL** — quando uma versão expira a Meta não retorna erro, redireciona em silêncio para uma mais antiga e o comportamento muda sem aviso.
