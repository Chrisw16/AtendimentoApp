---
title: Ambiente de testes + próximos passos (2026-06-30)
type: task
created: 2026-06-30
last_updated: 2026-06-30
status: active
priority: p1
related: ["[[Testes de Fluxo]]", "[[IA com Tool Calling]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["Ambiente de testes + próximos passos (2026-06-30)", "próximos passos", "pauta de amanhã", "agenda", "janela da IA", "pré-cadastro real"]
tags: [work, task, ia, testes, planos, agenda]
---

# Ambiente de testes + próximos passos (2026-06-30)

Sessão longa (Christian testando em produção via Coolify e iterando o produto). Tudo na branch **`worktree-ambiente-testes-fluxo`** (ainda **não mesclada na main** — Christian decide o merge quando estiver 100%). Validado por build do Vite + `node --check` + 77 testes; **um smoke test rodou o motor real em sandbox** (deps instaladas na worktree). Repo é **privado**; o Coolify deploya essa branch (auth GitHub já resolvida).

## O que foi feito hoje (resumo)

1. **Validador estático de fluxo** (`fluxoValidador.js` + CLI) — beco sem saída, porta solta, nó inalcançável, aresta órfã, loop sem espera, sem entrada.
2. **Simulador de conversa** (`motorLoop.js` = loop real extraído + `motorSimulador.js` + CLI) — roda conversas multi-turno, classifica concluido/travado/perdido/aguardando.
3. **Função nativa no app** — botão "Testar fluxo" → `TesteFluxoModal` (aba Validação + Simulação: Roteiro e **Conversa real**).
4. **Sandbox dry-run no motor** — `processarConversa(c, msg, {fluxo, estados, enviar, sandbox})`; em sandbox SGP/IA **leem de verdade** mas escritas são simuladas (nós + tools de IA via gate no `executarTool`).
5. **Chat estilo WhatsApp** no teste — botões/listas clicáveis, `*negrito*`/`` `mono` ``, bolhas.
6. **Dropdown de contexto** no nó IA Responde (painel inline do `FluxoEditor.jsx`; o `components/fluxo/PropsPanel.jsx` é código morto).
7. **Prompt comercial** completo (ver [[Prompt Comercial (Netzinha)]]).
8. **Planos**: cidade vazia = vale p/ todas (+ multi-cidade por vírgula); **promoção** (migration 008: `valor_promocional` + `promo_meses`); **benefícios** (migration 009: `beneficios`). A tool `listar_planos_ativos` cita tudo.
9. **Link público de teste** `/teste/<token>` (migration 010: `fluxos.share_token`) — abre só o chat, sem login, sandbox, revogável, rate-limit. Modo escolhido: **Real + token revogável**.
10. **Fixes** do teste comercial: histórico da IA 20→50 msgs; protocolo no sandbox.

Migrations pendentes (rodam no próximo Redeploy): **008, 009, 010**.

## ▶ PAUTA DE AMANHÃ

### 1. Memória/janela da IA (começar por aqui)
**Problema:** o `ia_responde` guarda o histórico por nó num **sliding window** (`_ia_hist_<id>`, agora `.slice(-50)`). Os dados coletados vivem **só no histórico de chat**, não em estrutura. Cadastro longo → dados do começo (cidade/plano) saem da janela → a IA re-pergunta. O `-50` é paliativo. Christian sugeriu **"um cache para a IA"**.

**Direções pra discutir (sem decisão ainda):**
- **(a) Extração estruturada de campos** — conforme a IA coleta, gravar em `ctx.estado.contexto` (via uma tool tipo `salvar_dado` ou parsing). A IA relê do contexto, não depende do histórico bruto. **Mais robusto.**
- **(b) Compactação/sumário (o "cache")** — quando o histórico cresce, resumir os turnos antigos num bloco curto ("dados já coletados: …"). É o "cache de memória" que o Christian mencionou.
- **(c) Janela maior/ilimitada** — simples, mas custa tokens e cresce sem fim.
- **(d) Prompt caching da Anthropic** — reduz **custo** (cacheia o prefixo do prompt), mas **não resolve o esquecimento**. Bom combinar com (a)/(b).
- **(e) Persistir o estado** — hoje `estadosExecucao` é Map em memória (perde no restart). Relaciona com a melhoria nº1 do [[Motor de Fluxo]].

Recomendação inicial a defender: **(a) + (b)** — estruturar os campos coletados e/ou sumarizar; (d) por cima pra custo.

### 2. Pré-cadastro REAL (tirar do sandbox)
Christian quer **testar de verdade** (criar cadastro no SGP), não simulado. Opções:
- Testar a tool isolada em **Prompts IA → Testar Tools → Pré-Cadastro** (chama o SGP real).
- Testar o fluxo via **WhatsApp de produção** (não-sandbox).
- (eventual) um **toggle "executar de verdade"** no chat de teste que desliga o gate de sandbox — cria registros reais. Decidir amanhã.
- A função `precadastrarCliente` (integrations.js) já está correta (POST `/api/precadastro/F`). Se der erro no teste real, depurar credencial/endpoint/campos do SGP.

## See Also

- [[Testes de Fluxo]] · [[IA com Tool Calling]] · [[Prompt Comercial (Netzinha)]]
