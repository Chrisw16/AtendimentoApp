---
title: Provedor e modelo de IA globais — escolher qualidade × preço
type: task
created: 2026-09-05
last_updated: 2026-09-05
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/telas/configuracao"]
related: ["[[IA e Tool Calling]]", "[[FASE 9 — AI Runtime V1]]", "[[Configurações]]"]
aliases: ["provedor de IA", "modelo global", "llmGateway", "qualidade x preço", "OpenAI", "DeepSeek", "Gemini"]
tags: [work, task, ia, configuracao, pendente]
---

# Provedor e modelo de IA globais

> **Entregue em 2026-09-06.** Este é o levantamento da véspera; o registro da
> entrega, com o que a revisão e a verificação das APIs mudaram, está em
> [[2026-09-06_provedor-e-modelo-de-ia]].

**Pedido pelo operador em 2026-09-05.** Ainda **não implementado** — esta página
existe para o pedido não se perder e para registrar o que já foi levantado.

## O pedido

Poder escolher, **em Configurações**, qual IA o sistema usa (Claude, ChatGPT,
DeepSeek, Gemini) e qual modelo — para trocar qualidade por preço sem editar
código. Hoje a escolha existe por nó, e o operador quer um padrão global.

## O que já se sabe do código (levantado, não verificado a fundo)

- **A coluna já existe**: `prompts_ia` tem `provedor`, `modelo` e `temperatura`
  desde a migration 005, e `resolverPrompt` devolve os três. A tela Prompts IA
  já os edita para 6 slugs (`SLUGS_COM_MODELO`).
- ⚠️ **`provedor` e `temperatura` são lidos e IGNORADOS.**
  `processarIAResponde` desestrutura `{ modelo, provedor, temperatura }` e só
  usa `modelo`; `messages.create` não recebe `temperature`, e nada olha
  `provedor`. É a mesma família do `agentes.permissoes` que existia sem leitor
  — configuração que a tela mostra e o backend não honra.
- **O modelo é cravado em vários lugares** como fallback:
  `'claude-haiku-4-5-20251001'` aparece no motor, no `llmGateway`, na
  `supervisoraIA` e nos seeds de prompt.
- **`llmGateway.js` é o único lugar que a FASE 9 criou para falar com o LLM**,
  e a doc já declara o teto: `motorFluxo` e `supervisoraIA` seguem em
  `getAnthropicClient`, e **chamada nova nasce no gateway**. Um provedor
  configurável tem casa natural ali.
- **A credencial já mora no banco** (`sistema_kv`, cifrada quando há
  `KV_SECRET`): `anthropic_api_key` e `openai_api_key` já são campos da tela.
  ⚠️ **`openai_api_key` nunca foi lida por linha nenhuma de código** — a doc já
  registra isso desde a FASE 7.
- **A telemetria de custo (FASE 12) já é por modelo**: `precos_llm` no
  `sistema_kv` e `custoDeTokens`. **Modelo sem preço deixa o custo `null`** —
  então cada modelo novo oferecido precisa de preço cadastrado, senão o
  Analytics passa a dizer "não sei" em vez de mentir (que é o certo, mas o
  operador precisa saber por quê).

## Perguntas em aberto (a responder com o operador antes de desenhar)

1. **Precedência.** Global < perfil < nó? O CLAUDE.md já fixa que *"a config do
   NÓ vence a do PERFIL"*, e o painel do `ia_responde` já mostra herança com
   origem (`herancaIaResponde`). O global entraria como o degrau mais baixo.
2. **Tool calling não é igual entre provedores.** O produto inteiro depende de
   tool use com 18 ferramentas, do laço agêntico e de `stop_reason`. DeepSeek e
   Gemini têm formatos próprios; oferecer um modelo que não suporta bem tool
   calling é oferecer um atendimento que não consulta o SGP. **Um adapter por
   provedor** (mesmo padrão de `services/canais/`) é o desenho provável.
3. **O que fazer com modelo trocado no meio de uma conversa viva.** O grafo do
   fluxo é congelado por conversa (`estado._grafo`); o modelo não é.
4. **Preço por modelo** precisa vir junto, senão o `custo_por_resolvido` some.

## Tetos já visíveis

- Trocar de provedor **não** é trocar uma string: é o laço agêntico inteiro
  (`stop_reason`, `tool_use`, `tool_result`) que muda de forma.
- Sem preço cadastrado, o Analytics devolve `null` — comportamento correto e já
  implementado, mas que parece "quebrado" para quem não sabe.
