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

A conversão de lista em texto numerado que hoje está **hardcoded no meio do `motorFluxo`** (caso Telegram) vira `renderizarComoTexto()`: função pura, testável, válida para qualquer provedor que não suporte um tipo.

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
| `cta` | nativo | degrada | **degrada p/ texto com link** |
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

**Entrada** — a Meta entrega um `media_id`, não uma URL pública. É preciso `GET /{media-id}` para obter a URL, e **essa URL exige o bearer token**. Por isso a rota `/api/media/:id` não pode ser um redirect: o backend busca e **repassa o binário** (stream), autenticado. É a rota que o `meta.js` já referencia e que nunca foi escrita.

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

Validar `X-Hub-Signature-256` (HMAC-SHA256 do corpo cru com `meta_app_secret`) antes de processar. Exige acesso ao **corpo bruto** da requisição — hoje o Express usa `express.json()`, então será preciso preservar o raw body na rota de webhooks (ex.: `verify` do `express.json`). Requisição com assinatura inválida é descartada com 401, sem tocar no banco.

## Fases

Cada fase é testável e deployável sozinha. **Cada uma merece seu próprio plano de implementação** — este documento é o desenho das quatro, não um plano único.

**Fase 1 — Registry de canais.** Extrai adapters de Evolution e Telegram, cria dispatcher e `renderizarComoTexto`. **Testes de caracterização primeiro**, fixando o comportamento atual de cada tipo em cada canal: Evolution e Telegram estão em produção e o refactor tem que ser **inobservável** para eles. Ao fim, tudo igual — e o agente ganha envio de mídia.

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
