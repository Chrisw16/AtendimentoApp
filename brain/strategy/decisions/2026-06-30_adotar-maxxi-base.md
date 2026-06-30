---
title: Adotar o Maxxi v2 como base
type: decision
created: 2026-06-30
last_updated: 2026-06-30
status: active
decision_date: 2026-06-30
stakeholders: ["[[Christian]]"]
impact: critical
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["2026-06-30_decisao-base-maxxi"]
aliases: ["Adotar o Maxxi v2 como base", "decisão base Maxxi", "Maxxi vs Atendechat", "multi-tenancy por instância"]
tags: [estrategia, produto, decisao]
---

# Adotar o Maxxi v2 como base

Em 2026-06-30 o usuário decidiu adotar o **[[Maxxi v2 / GoCHAT — Visão geral|Maxxi v2 (GoCHAT)]]** como base do produto de atendimento para ISP, parando de evoluir o **Atendechat (netgo-chat)** como base. O Atendechat vira referência de domínio e features; nada nele precisa ser desfeito.

## Contexto

A pergunta original era "melhorar o editor de fluxo do Atendechat, inspirado no GoCHAT". Ao auditar o GoCHAT, descobriu-se que ele não é um protótipo de telas, mas um **sistema de atendimento omnichannel quase completo**, sob medida para ISP, melhor construído que o Atendechat, e já contendo o que se ia construir (editor de fluxo rico + nós SGP + IA com tool calling — a "fase 2").

## Comparação

| Dimensão | Atendechat | Maxxi v2 |
|---|---|---|
| Origem | codatendechat herdado, dívida técnica pesada (SQLi, IDOR, cross-tenant) | reescrito do zero, arquitetura limpa, migrations formais |
| Stack | React 17/CRA, Sequelize | React 19/Vite, Knex |
| Motor de fluxo | monolítico/frágil, ~11 nós | `motorFluxo.js` limpo, ~30 nós |
| IA | nó OpenAI cosmético | tool calling agêntico (Claude) + 15 tools SGP |
| Multi-tenant | row-level (SaaS white-label) | single-tenant (só NetGo) |

## Decisão

Maxxi como base **+ isolamento por instância**. Como o objetivo é revender para outros provedores e o Maxxi é single-tenant, "multi-tenant" passa a significar **deploy isolado por cliente** (via Coolify) em vez de row-level. Isso torna o Maxxi utilizável como está, sem o atoleiro de refatorar tenancy. Evolui para row-level só se a escala pedir. O modelo é viável porque as [[Maxxi v2 / GoCHAT — Visão geral|credenciais de integração ficam no banco]] de cada instância, não no código.

## Consequências

- Nova base ganha brain e CLAUDE.md próprios (este repositório).
- O acoplamento à NetGo (IDs de plano/POP/portador, prompts, textos hardcoded) precisará ser parametrizado por instância antes de revender — ver [[Integração SGP]].
- Primeiro passo recomendado: **validar rodando** o atendimento ponta a ponta (o laudo foi estático).
- Decisão pendente associada: tornar o repositório privado para versionar o brain junto do código.

## See Also

- [[Maxxi v2 / GoCHAT — Visão geral]]
- [[Achados de código (2026-06-30)]]
