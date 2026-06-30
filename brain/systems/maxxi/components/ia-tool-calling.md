---
title: IA com Tool Calling
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Modelo de Dados]]", "[[SGP]]"]
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

## `promptService.js` — composição de prompts

`resolverPrompt(slug, clienteCtx)` carrega em paralelo o prompt do slug + `regras` + `estilo` + planos + tipos de ocorrência (cache 3 min) e substitui os placeholders `[REGRAS]`, `[ESTILO]`, `[PLANOS]`, `[TIPOS_OCORRENCIA]`, injetando o contexto do cliente ao final. Retorna `{system, modelo, provedor, temperatura}`.

Os prompts são **editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA). Os 8 slugs seed (migration 005): `regras`, `estilo`, `roteador`, `financeiro`, `suporte`, `comercial`, `faq`, `outros` — escritos com passos rígidos por setor e **fortemente acoplados à NetGo** (Natal/RN, fibra, horários, planos). Revender para outro provedor exige reescrever esses prompts por instância.

Atenção: há **dois mecanismos de cache** — `promptService` (TTL 3 min) e `integrations.invalidateConfigCache`. Editar um prompt invalida só o de `integrations`, então o motor pode servir prompt desatualizado por até 3 min.

## See Also

- [[Motor de Fluxo]] · [[Integração SGP]] · [[SGP]]
