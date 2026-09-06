---
title: Provedor e modelo de IA configuráveis — qualidade × preço sem editar código
type: task
created: 2026-09-06
last_updated: 2026-09-06
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/telas/configuracao"]
related: ["[[IA e Tool Calling]]", "[[FASE 9 — AI Runtime V1]]", "[[FASE 12 — Analytics]]", "[[Configurações]]"]
aliases: ["provedor de IA", "modelo global", "llm/", "gerar()", "openaiCompat", "migration 031", "temperatura honrada"]
tags: [work, task, ia, configuracao, provedores]
---

# Provedor e modelo de IA configuráveis

**2026-09-06.** Pedido do operador: escolher em Configurações qual IA atende
(Claude, ChatGPT, DeepSeek, Gemini — e gratuitos como Llama e Qwen) e qual
modelo, para trocar **qualidade por preço** sem deploy. Decisões tomadas com
ele na véspera: todos os provedores; `temperatura` passa a valer; falha
honesta, sem cair para outro provedor em silêncio.

## O ponto de partida, medido

**Seis pontos falavam com o modelo, todos em Anthropic**, por
`getAnthropicClient().messages.create` (motor ×2, supervisora ×2) ou pelo
`llmGateway` (copiloto, quality). `prompts_ia` já tinha `provedor`, `modelo`
e `temperatura` desde a 005, `resolverPrompt` devolvia os três, e o motor **usava
só `modelo`** — `provedor` e `temperatura` eram configuração que a tela mostra
e o backend não honra, a família do `agentes.permissoes`. `openai_api_key` era
campo de tela que nenhuma linha lia, e o pacote `openai` estava instalado desde
o início sem nunca ter sido importado.

## A decisão central: a língua franca é o formato da Anthropic

O laço agêntico do motor lê `stop_reason`, itera `content[]` por `type` e
monta o turno seguinte com `tool_result`. É o formato de blocos da Anthropic, e
é o mais rico entre os provedores. **Os adapters traduzem nas duas pontas e o
motor não muda uma linha** — trocar de provedor não podia ser reescrever o
coração do produto, que acabou de ganhar o modo recepção.

`services/llm/` espelha `services/canais/`: `index.js` (o funil `gerar()`:
precedência, credencial, telemetria, erro normalizado), `anthropic.js`,
`openaiCompat.js` e `llmHelpers.js` (puro: tradução, precedência, catálogo).
**Um adapter OpenAI-compatible cobre cinco provedores** — o que muda é
`baseURL`, chave, o nome do parâmetro de max tokens e um corpo extra.

## O que a revisão do design virou do avesso

1. ⚠️ **A precedência tinha um furo estrutural.** A 005 gravou
   `anthropic`/`claude-haiku-4-5` em TODAS as linhas de `prompts_ia` e pôs esses
   valores como DEFAULT das colunas — não por escolha do operador, porque o seed
   precisava de um valor. Com `prompt → global → padrão`, cada linha pareceria
   um override e **a configuração global nunca seria alcançada**: a tela de
   Configurações seria decorativa. A primeira implementação resolveu com uma
   regra ("par igual ao padrão não conta") que funciona e ninguém lembraria em
   seis meses. A **migration 031** faz o honesto: anula o par do seed (`where`
   exato — o que o operador tiver escolhido fica) e tira o default das colunas.
   **NULL = herança; valor = escolha.** `resolverPrompt` devolve o valor cru. A
   regra ficou como cinto de segurança para a 005 rodar de novo numa instalação
   nova.
2. ⚠️ **`invalidarCachePrompts()` não tinha chamador nenhum no repo.** O PUT de
   prompts invalidava só o cache de `integrations`; trocar provedor num prompt
   demoraria até 3 minutos para valer, e o operador que testasse logo depois de
   salvar veria o modelo antigo responder e concluiria "não pegou".
3. ⚠️ **PII vai para o provedor escolhido.** O system prompt carrega CPF, nome e
   contrato; a ficha coletada; o retorno de `identificar_cliente`. Um modelo
   gratuito do OpenRouter é um terceiro cujos termos permitem treino. Decisão do
   operador, não de código — por isso está **escrito na tela**, ao lado do
   seletor.
4. **Três buracos de telemetria:** "chave não configurada" lançava antes de
   registrar (Saúde dizia "IA ok" com todo turno caindo para humano); a
   mensagem do provedor morria no `console` (vai para `erros_app`, dedup por
   assinatura); e tokens NULL viravam custo **zero** com preço configurado —
   "a IA é de graça". Chamadas sem tokens = custo `null`.
5. `getAnthropicClient` **saiu**: virou envelope com zero chamadores, e um
   cliente exportado que alguém importasse amanhã pinaria a Anthropic fora da
   precedência e da conta de custo.
6. ⚠️ **O PUT de prompts usava `??`**: mandar `null` para "herdar" gravava o
   valor antigo em silêncio — a opção da tela não faria nada. Campo presente
   vence, mesmo nulo; ausente mantém.

## O que a verificação das APIs mudou no adapter (docs oficiais, 2026-09-06)

- ⚠️ **Nunca reconstruir a mensagem do assistant.** O Gemini 3 põe
  `thought_signature` dentro de `tool_calls` e o DeepSeek põe
  `reasoning_content` na mensagem — campos que o SDK não tipa e que PRECISAM
  voltar no turno seguinte, senão 400. A primeira tradução reconstruía. Hoje
  `deOpenAI` guarda a mensagem crua nos blocos (Symbol não-enumerável, sobrevive
  ao `{role:'assistant', content: res.content}` do motor) e `paraOpenAI` a ecoa
  byte a byte.
- ⚠️ **`max_tokens` dá 400 nos GPT-5.x** — exigem `max_completion_tokens`. O
  DeepSeek só documenta `max_tokens`. Virou campo por provedor.
- ⚠️ **GPT-5.4+ só aceita `tools` com `reasoning_effort: 'none'`** — e o 5.6
  nasce em `medium`, então mandar `tools` já basta para o 400. O catálogo marca
  e o adapter manda `none`.
- ⚠️ **Sonnet 5, Opus 5, Fable 5.1 e GPT-5.x rejeitam `temperature`** ≠ padrão.
  O catálogo marca `semTemperatura` e os dois adapters omitem o campo. **Haiku
  4.5 é o único da linha atual da Anthropic que aceita** — e pode ser aposentado
  a partir de 15/10/2026.
- **DeepSeek V4 nasce com thinking ligado** (latência e output num WhatsApp):
  desligado por corpo extra do provedor.
- **Gemini recusa `type:'object'` com `properties:{}`** — três tools do produto
  são assim. `parameters` é omitido quando não há propriedades.
- **OpenRouter devolve HTTP 200 com erro no corpo** (`choices[].error`) e 404
  quando o modelo existe mas não suporta tool calling. Os dois tratados; a
  mensagem do provedor entra no erro, senão "não encontrado" mentiria.
- **Ids retirados**, fora do catálogo de propósito: `deepseek-chat`/`-reasoner`
  (24/07/2026), os Llama e Qwen do Groq (16/08/2026), `gpt-4o-mini` (que a tela
  Prompts IA oferecia hardcoded). **Não existe nenhum Llama nem Qwen gratuito
  hoje**; os grátis do OpenRouter são GLM 5.2 e MiniMax M3, com 50 req/dia sem
  créditos — servem para testar, não para atender.

## Catálogo, preços e a tela

O campo de modelo é **texto livre com sugestões**, não `select` fechado —
provedor lança modelo toda semana. O catálogo (2–4 por provedor, com preço em
USD/1M e uma nota honesta) vem da API por `GET /sysconfig/ia/catalogo`: uma
fonte só, em vez da lista que cada tela tinha. Os preços têm **data de
referência** (`precos_llm_referencia`): Gemini 3.x dobra em 01/01/2027,
DeepSeek varia 2x por horário. A 031 semeia só as chaves ausentes.

**Temperaturas gravadas** (todas rodavam a 1.0, o default da Anthropic):
roteador 0.10 → **0.40 pela 031** (era classificador, virou recepção); suporte e
financeiro 0.20; outros 0.40; comercial 0.60. Passam a valer.

## Tetos declarados

- **Nenhum provedor além da Anthropic foi exercitado contra a API real.** A
  tradução está testada contra os formatos documentados; a conversa de ponta a
  ponta com OpenAI/DeepSeek/Gemini/Groq/OpenRouter só se prova com chave
  configurada — e o botão **Testar** em Configurações existe para isso.
- Gemini pela via compatível é **beta declarada** pelo Google; tool_choice só
  automático.
- Trocar o modelo de uma conversa viva vale no turno seguinte (o grafo é
  congelado por conversa; o modelo não).
- `precos_llm` é chaveado só por id de modelo: dois provedores com o mesmo id
  somariam no mesmo preço (raro; ids costumam diferir).
- Link público de teste: mesma exposição de PII, e visitante anônimo gasta cota
  do provedor global.

## Suítes

**635 testes puros** (eram 589) e **306 de integração** (eram 297).
