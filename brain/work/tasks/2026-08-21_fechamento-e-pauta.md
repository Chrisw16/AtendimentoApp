---
title: Fechamento 2026-08-21 + pauta
type: task
created: 2026-08-21
last_updated: 2026-08-21
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/testes-de-fluxo", "systems/maxxi/components/motor-fluxo", "work/bugs/2026-06-30_auditoria-profunda"]
related: ["[[Testes de Fluxo]]", "[[Motor de Fluxo]]", "[[Auditoria profunda (2026-06-30)]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["Fechamento 2026-08-21", "pauta de amanhã", "próximos passos"]
tags: [work, task, pauta, retomada]
---

# Fechamento 2026-08-21 + pauta

Sessão de retomada depois de ~7 semanas parado. Resumo do que mudou e por onde continuar.

## O que foi feito

1. **Os 4 críticos da auditoria** — race de estado do fluxo (`filaPorChave.js`, fila FIFO por conversa), `sgp_url` que não salvava, Canais que apagava credenciais, dedup de webhook (migration 008 + `onConflict`).
2. **Bug que quase entrou junto** — religar o Redis (`redis`→`ioredis`) expôs que `broadcast()` entrega local **e** publica, e o subscriber do mesmo processo recebia o próprio anúncio: toda mensagem apareceria **duplicada** na tela do agente. Resolvido com `INSTANCIA_ID` + `ehEcoProprio()`.
3. **Revisão de código** — 3 bugs novos: `JWT_SECRET` com fallback versionado no repo, busca de clientes morta (`useState` no lugar de `useEffect`), NPS por escala (faixas viviam em dois lugares → nota 5 numa escala de 5 era promotora no fluxo e detratora no relatório).
4. **Reconciliação do harness** — a branch `worktree-ambiente-testes-fluxo` (51 commits) estava parada e **era o que rodava em produção**. Seus ~880 linhas de teste nunca tinham sido executadas: rodaram pela 1ª vez, 128/128. Mergeada no `main`; suíte foi de 21 → **148 testes**.
5. **Coolify migrado** da branch para o `main`.
6. **Fluxo novo** `examples/fluxo-netgo-v2.json` (híbrido menu+IA, validador 0/0), testado em conversa real — o que revelou os dois itens de config abaixo.

## Não confirmado (primeiro item da pauta)

- **As migrations 008 e 009 nunca foram confirmadas rodando.** O deploy aconteceu (a produção roda o v2), mas o log de boot não foi lido. A 008 **apaga linhas** (duplicatas de `external_id`) e imprime quantas achou. **Conferir no log do Coolify.**

## Pauta

1. **Ler o log de boot** e confirmar 008/009 aplicadas limpas (acima).
2. **Rodar um atendimento real pelo WhatsApp** ponta-a-ponta — a fronteira que nunca foi cruzada; o dashboard segue zerado.
3. **PropsPanel dos nós de SGP** (`consultar_cliente`, `consultar_boleto`, `verificar_status`, `promessa_pagamento`, `listar_planos`): hoje são inconfiguráveis pela tela. O mais urgente é `consultar_cliente.pergunta` — sem ela **o cliente nunca é perguntado pelo CPF**.
4. **Alinhar simulador↔motor** no `consultar_cliente` (`cfg.mensagem` vs `cfg.pergunta`) — ver [[Testes de Fluxo]] → "Divergências conhecidas". Com teste fixando o nome do campo.
5. **Consertar os 10 avisos do fluxo antigo** (`Atendimento NetGo — Principal`) ou aposentá-lo em favor do v2.
6. **Mismatches editor↔motor que sobraram**: `gatilho_keyword` (filtro inerte), `aguardar_resposta` (timeout — precisa scheduler), `condicao_multipla` (sem editor), portas mortas.
7. **Segurança**: mass-assignment em `ocorrencias`/`ordens`/`tarefas`, mascarar `GET /sysconfig`.
8. **Reprodutibilidade do build**: não há lock file versionado e o Dockerfile usa `npm install`, não `npm ci` — dois deploys do mesmo commit podem gerar artefatos diferentes.

## Continuação (mesma data, sessão seguinte)

Entrou um pedido novo — **WhatsApp API Oficial** — que interrompeu esta pauta e revelou uma vulnerabilidade viva em produção. Estado, 4 fases e 13 pendências em [[WhatsApp API Oficial — estado e pendências]].

Dois itens desta pauta ganharam urgência por causa dele:
- **Item 1 (ler o log de boot)** virou parte de um problema maior: o **deploy automático do Coolify não está funcionando** — webhook entrega 200 e nada sobe. Enquanto isso não se resolve, nada desta pauta chega à produção.
- **Segurança (item 7)** deixou de ser preventiva: `GET /api/webhooks/meta` refletia HTML sem autenticação, e `GET /api/sysconfig/:chave` lia qualquer chave. Ambos corrigidos, **aguardando deploy**.

## Decisões da sessão

- **Branch `dev`** (21 commits, WhatsApp QR Code, de outro programador) fica **de lado** por ora — não está no `main` nem nunca foi deployada.
- **Objetivo declarado**: colocar em produção na NetGo.
- Migrations da branch renumeradas 008/009/010 → **011/012/013**; a sequência tem um buraco no 010 de propósito (as originais já constam no `_migrations` de produção).

## See Also

- [[Testes de Fluxo]] · [[Motor de Fluxo]] · [[Auditoria profunda (2026-06-30)]]
