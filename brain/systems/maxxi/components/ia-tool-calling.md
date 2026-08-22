---
title: IA com Tool Calling
type: component
created: 2026-06-30
last_updated: 2026-07-02
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Modelo de Dados]]", "[[SGP]]", "[[Auditoria SGP ↔ tools da IA (2026-07-02)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["IA com Tool Calling", "IA", "Claude", "tool calling", "iaTools", "promptService", "ia_responde", "ia_roteador", "prompts"]
tags: [backend, ia, anthropic, tools]
---

# IA com Tool Calling

A camada de IA do Maxxi usa **Anthropic Claude** (`claude-haiku-4-5-20251001` por padrão) com **tool use agêntico**: a IA chama ferramentas reais que consultam o [[Integração SGP|SGP]] e responde ao cliente com dados verdadeiros. É a "fase 2" que o produto já traz pronta. Três peças: o nó `ia_responde`, o nó `ia_roteador` e a composição de prompts.

## `ia_responde` — loop agêntico

Em `motorFluxo.js`, `processarIAResponde`:
- Carrega o prompt do slug (`cfg.contexto`, default `outros`) via `resolverPrompt`, compõe o `system` com o contexto do cliente identificado e regras explícitas de uso de tool (executar silenciosamente, nunca inventar contrato/CPF/protocolo).
- Roda um **loop de até 5 rounds** (`ai.messages.create` com `tools`): trata `stop_reason` `end_turn` (responde) e `tool_use` (executa as tools do bloco, anexa `tool_result`, continua).
- Histórico por nó (`_ia_hist_<id>`, **`.slice(-50)`** mensagens ≈ 25 trocas); `max_turnos` default 6 antes de sair pela porta `max_turnos`. ⚠️ **Limitação:** os dados coletados vivem só nesse histórico (sliding window), não em estrutura — cadastro longo perdia cidade/plano com a janela antiga de 20. O `-50` é paliativo; melhoria estrutural (extração de campos / sumário / "cache") na pauta de [[Ambiente de testes + próximos passos (2026-06-30)]].
- Tools ativas: lista de suporte por padrão; `precadastrar_cliente` (sensível) só entra se `cfg.tools_ativas` incluir. Resultados especiais `__TRANSFERIR__`/`__ENCERRAR__` roteiam o fluxo (portas `transferir`/`resolvido`).

### Campos do nó: `contexto` × `instrução` × `tools_ativas`

São três campos com papéis distintos (fonte de confusão comum):

| Campo | O que é | Efeito |
|---|---|---|
| `contexto` | **slug** de um prompt da tabela `prompts_ia` (default `outros`) | vira a **base** do system prompt (`resolverPrompt(slug)`). Se o slug **não existir**, cai no prompt genérico de fallback |
| `instrucao` (editor: "instruções extras"; motor lê `cfg.instrucao ?? cfg.prompt`) | instrução **específica daquele nó** | é **somada por cima** da base — `montarSystemPrompt` ([[Motor de Fluxo|fluxoHelpers]]) compõe `base + "Instrução específica: {instrucao}" + dados do cliente + regras de tool` |
| `tools_ativas` | lista de nomes de tool | define **quais** tools a IA pode chamar nesse nó. A IA só chama tools que estão em `IA_TOOLS` **E** nessa lista. **O prompt NÃO registra tools** — só orienta quando/como usar |

**Armadilha real (vista no fluxo de produção):** alguns nós põem o prompt inteiro em `instrucao` e setam `contexto` para um valor que **não é um slug válido** (ex.: `"Suporte Técnico"` com espaço/maiúscula ≠ slug `suporte`). Resultado: a base vira o **genérico de fallback** e editar o prompt "Suporte técnico" na tela **não afeta o nó**. Para a tela Prompts IA ser a fonte da verdade, o `contexto` precisa bater **exatamente** com o slug e a `instrucao` ficar curta/vazia.

> Mitigação no editor: o campo **Contexto** virou um **dropdown** que puxa os slugs de `prompts_ia` (menos `regras`/`estilo`), eliminando o erro de digitação; valores legados inválidos aparecem com `⚠` pra serem trocados. A **instrução extra** salva em `cfg.prompt` (o motor lê `cfg.instrucao ?? cfg.prompt`).
>
> ⚠️ **Detalhe de arquitetura:** o painel de propriedades do editor é uma função `PropsPanel` **inline dentro de `apps/web/src/pages/FluxoEditor.jsx`** (usada na linha do `<PropsPanel .../>`). O arquivo `apps/web/src/components/fluxo/PropsPanel.jsx` é **código morto** (não é importado em lugar nenhum) — mexer nele não afeta o editor. Edite sempre o inline do `FluxoEditor`.

## Tela Prompts IA — 3 abas

`apps/web/src/pages/PromptsIA.jsx` (`GET/PUT /prompts`):
- **Prompts:** edita as linhas de `prompts_ia` (conteúdo + modelo/provedor/temperatura). `regras`/`estilo` são blocos reutilizáveis (sem modelo) injetados nos outros via placeholders. "Restaurar padrão" volta `conteudo = padrao`.
- **Catálogo:** lista **read-only** das tools (referência: nome, categoria, endpoint SGP, params, status Ativo/Requer-config). É uma lista **fixa no front** (`TOOLS_CATALOG`), espelho manual do `iaTools.js` — e só renderiza as categorias Diagnóstico/Atendimento/Financeiro, **escondendo as tools Comercial** (pré-cadastro, listar planos/vencimentos).
- **Testar Tools:** testador manual — escolhe a tool, preenche params e roda `POST /sysconfig/tools/test` (executa **de verdade** no SGP). As marcadas com ⚠️ (`criar_chamado`/`promessa_pagamento`/`precadastrar_cliente`) **gravam dados reais** — é o equivalente manual ao gate de sandbox dos [[Testes de Fluxo]].

## `ia_roteador` — classificador de intenção

`processarIARoteador` classifica a mensagem em uma rota. Detecta despedida por regex **antes** de chamar a API (economia). Claude responde `<rota>id</rota>` (XML, `max_tokens 30`); valida contra as rotas configuradas + `nao_entendeu`/`encerrar`.

## `iaTools.js` — 15 ferramentas

Definições no formato Anthropic (`input_schema`) e o executor `executarTool(name, input, ctx)`. As tools: `verificar_conexao`, `consultar_manutencao`, `criar_chamado`, `segunda_via_boleto`, `promessa_pagamento`, `historico_ocorrencias`, `status_rede`, `consultar_onu_acs` (stub ACS), `reiniciar_onu_acs` (stub ACS), `consultar_radius`, `listar_planos_ativos` (lê a tabela `planos`; **cidade vazia no cadastro = vale para todas as cidades** + multi-cidade por vírgula; cita **promoção** `valor_promocional`/`promo_meses` — "R$ X nos primeiros N meses, depois R$ Y" — e **benefícios** `beneficios` — "inclui: Globoplay, …"), `listar_vencimentos`, `precadastrar_cliente`, `transferir_para_humano`, `encerrar_atendimento`. `executarTool` prioriza `input.contrato` e cai para `ctx.cliente.contrato`. Todas formatam um texto amigável de retorno para a IA. Implementação SGP em [[Integração SGP]].

> ⚠️ **Armadilha integração ↔ tool (mesma classe do editor↔motor):** o texto de retorno de cada tool tem de ler os **campos reais** que a função de `integrations.js` devolve — as tools foram escritas depois dos nós e algumas divergiram. Caso corrigido: `segunda_via_boleto` lia `r.link`/`r.pix`/`r.valor` (o retorno traz `link_cobranca`/`pix_copia_cola`/`valor_cobrado`) e **sempre** dizia "não encontrei boleto"; fix extraiu `formatarBoletoIA` para **`iaToolsHelpers.js`** (módulo puro testável, mesma ideia do `fluxoHelpers`, porque `iaTools.js` puxa knex e não roda em teste). Ainda abertos nesse eixo (`historico_ocorrencias`, `criar_chamado` extras, nó `promessa_pagamento`): ver [[Auditoria SGP ↔ tools da IA (2026-07-02)]].

## `promptService.js` — composição de prompts

`resolverPrompt(slug, clienteCtx)` carrega em paralelo o prompt do slug + `regras` + `estilo` + planos + tipos de ocorrência (cache 3 min) e substitui os placeholders `[REGRAS]`, `[ESTILO]`, `[PLANOS]`, `[TIPOS_OCORRENCIA]`, injetando o contexto do cliente ao final. Retorna `{system, modelo, provedor, temperatura}`.

Os prompts são **editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA). Os 8 slugs seed (migration 005): `regras`, `estilo`, `roteador`, `financeiro`, `suporte`, `comercial`, `faq`, `outros` — escritos com passos rígidos por setor e **fortemente acoplados à NetGo** (Natal/RN, fibra, horários, planos). Revender para outro provedor exige reescrever esses prompts por instância.

Atenção: há **dois mecanismos de cache** — `promptService` (TTL 3 min) e `integrations.invalidateConfigCache`. Editar um prompt invalida só o de `integrations`, então o motor pode servir prompt desatualizado por até 3 min.

## O que as FASES 7 a 9 acrescentaram

O laço agêntico **não foi reescrito** — a regra da FASE 9 é "evoluir, não reescrever". O
que entrou por cima:

**Tools novas**
- `buscar_conhecimento` (FASE 7) — consulta o [[Knowledge Hub]]. Está no `TOOLS_PADRAO`
  porque o custo de NÃO consultar é a IA inventar procedimento. Quando não acha, a
  resposta da tool instrui a IA a dizer que vai confirmar.
- `concluir_etapa_playbook` (FASE 8) — marca etapa **conversacional** do
  [[Playbook Engine|procedimento]]. **Some da lista quando não há playbook ativo**: tool
  inútil compete com a tool certa.

**Três blocos de prompt que nenhum nó desliga** (`iaRuntime.js`, FASE 9), injetados em
TODA execução e posicionados **por último** — a posição de maior aderência num system
prompt longo:

1. **Hierarquia de confiança (§67)** — dado vivo de tool **vence** documento. Sem ela o
   modelo responde "seu plano é 300 mega" a partir de um artigo antigo quando o ERP
   acabou de dizer 500.
2. **O que não se inventa (§68)** — lista **nominal**: preço, protocolo, PIX, cobertura,
   prazo, sinal, manutenção, agendamento. "Não invente nada" é fácil de contornar;
   "não invente prazo" não é.
3. **Guardrails de campo (§75)** — não orientar o cliente a abrir ONU, mexer em fibra,
   olhar a ponta de um conector, subir em poste ou tocar rede elétrica, **mesmo que ele
   peça**. Não é conformidade de papel: quem olha uma fibra energizada perde visão.

**Perfis de IA** (`ia_perfis`) juntam prompt + procedimento + tools + limites. A config do
**nó vence a do perfil** — o nó é mais específico, e quem o configurou estava olhando
aquele ramo.

**Desfecho estruturado** (`ia_execucoes`): estourar turnos **não é "resolvido"**, é
desistência — e o relatório precisa saber a diferença. O motivo de transferência é
**enum** (`normalizarMotivo`), senão "cliente nervoso"/"está bravo"/"furioso" viram três
motivos e nada soma.

**LLM Gateway** (`llmGateway.js`) — ponto único de chamada ao modelo, com erro
normalizado. **Não tem `embed`**, de propósito: a Anthropic não oferece e a busca é
full-text. ⚠️ Ainda **não é o único caminho**: `motorFluxo` e `supervisoraIA` seguem em
`getAnthropicClient` (migrar o laço seria reescrever). **Chamada NOVA nasce no gateway** —
foi assim com o Copiloto.

## See Also

- [[Motor de Fluxo]] · [[Integração SGP]] · [[SGP]]
