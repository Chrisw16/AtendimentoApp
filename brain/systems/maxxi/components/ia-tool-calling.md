---
title: IA com Tool Calling
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Modelo de Dados]]", "[[SGP]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["IA", "Claude", "tool calling", "iaTools", "promptService", "ia_responde", "ia_roteador", "prompts"]
tags: [backend, ia, anthropic, tools]
---

# IA com Tool Calling

A camada de IA do Maxxi usa **Anthropic Claude** (`claude-haiku-4-5-20251001` por padrão) com **tool use agêntico**: a IA chama ferramentas reais que consultam o [[Integração SGP|SGP]] e responde ao cliente com dados verdadeiros. É a "fase 2" que o produto já traz pronta. Três peças: o nó `ia_responde`, o nó `ia_roteador` e a composição de prompts.

## `ia_responde` — loop agêntico

Em `motorFluxo.js`, `processarIAResponde`:
- Carrega o prompt do slug (`cfg.contexto`, default `outros`) via `resolverPrompt`, compõe o `system` com o contexto do cliente identificado e regras explícitas de uso de tool (executar silenciosamente, nunca inventar contrato/CPF/protocolo).
- Roda um **loop de até 5 rounds** (`ai.messages.create` com `tools`): trata `stop_reason` `end_turn` (responde) e `tool_use` (executa as tools do bloco, anexa `tool_result`, continua).
- Histórico por nó (`_ia_hist_<id>`, últimos 20 turns); `max_turnos` default 6 antes de sair pela porta `max_turnos`.
- Tools ativas: lista de suporte por padrão; `precadastrar_cliente` (sensível) só entra se `cfg.tools_ativas` incluir. Resultados especiais `__TRANSFERIR__`/`__ENCERRAR__` roteiam o fluxo (portas `transferir`/`resolvido`).

## `ia_roteador` — classificador de intenção

`processarIARoteador` classifica a mensagem em uma rota. Detecta despedida por regex **antes** de chamar a API (economia). Claude responde `<rota>id</rota>` (XML, `max_tokens 30`); valida contra as rotas configuradas + `nao_entendeu`/`encerrar`.

## `iaTools.js` — 15 ferramentas

Definições no formato Anthropic (`input_schema`) e o executor `executarTool(name, input, ctx)`. As tools: `verificar_conexao`, `consultar_manutencao`, `criar_chamado`, `segunda_via_boleto`, `promessa_pagamento`, `historico_ocorrencias`, `status_rede`, `consultar_onu_acs` (stub ACS), `reiniciar_onu_acs` (stub ACS), `consultar_radius`, `listar_planos_ativos` (lê a tabela `planos`), `listar_vencimentos`, `precadastrar_cliente`, `transferir_para_humano`, `encerrar_atendimento`. `executarTool` prioriza `input.contrato` e cai para `ctx.cliente.contrato`. Todas formatam um texto amigável de retorno para a IA. Implementação SGP em [[Integração SGP]].

## `promptService.js` — composição de prompts

`resolverPrompt(slug, clienteCtx)` carrega em paralelo o prompt do slug + `regras` + `estilo` + planos + tipos de ocorrência (cache 3 min) e substitui os placeholders `[REGRAS]`, `[ESTILO]`, `[PLANOS]`, `[TIPOS_OCORRENCIA]`, injetando o contexto do cliente ao final. Retorna `{system, modelo, provedor, temperatura}`.

Os prompts são **editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA). Os 8 slugs seed (migration 005): `regras`, `estilo`, `roteador`, `financeiro`, `suporte`, `comercial`, `faq`, `outros` — escritos com passos rígidos por setor e **fortemente acoplados à NetGo** (Natal/RN, fibra, horários, planos). Revender para outro provedor exige reescrever esses prompts por instância.

Atenção: há **dois mecanismos de cache** — `promptService` (TTL 3 min) e `integrations.invalidateConfigCache`. Editar um prompt invalida só o de `integrations`, então o motor pode servir prompt desatualizado por até 3 min.

## See Also

- [[Motor de Fluxo]] · [[Integração SGP]] · [[SGP]]
