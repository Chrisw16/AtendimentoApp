---
title: Plano de Evolução V1.0 — status consolidado
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: active
priority: p1
knowledge_refs: ["systems/maxxi/overview"]
related: ["[[FASE 4 — Inbox, Outbox e Jobs]]", "[[FASE 0 — Reconciliação e linha de base]]", "[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]]", "[[FASE 3 — Segurança e governança base]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["status do plano", "onde estamos", "roadmap V1.0", "progresso das fases"]
tags: [work, task, plano-evolucao, status, roadmap]
---

# Plano de Evolução V1.0 — status consolidado

Rastreador único de [docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md)
(2579 linhas, 26 partes, 13 fases). Cada fase tem sua própria página com o
detalhe; aqui fica só o quadro.

## Placar

**5 de 13 fases entregues.** As 4 primeiras mergeadas no `main`; a FASE 4 fechada em 2026-08-22.

| Fase | Título | Estado | Página |
|:---:|---|---|---|
| 0 | Reconciliação e linha de base | ✅ | [[FASE 0 — Reconciliação e linha de base]] |
| 1 | Fundação crítica / P0 | ✅ | [[FASE 1 — Fundação crítica / P0 (motor persistente)]] |
| 2 | Registry Foundation | ✅ | [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] |
| 3 | Segurança e governança base | ✅ | [[FASE 3 — Segurança e governança base]] |
| 4 | Inbox, Outbox e Jobs | ✅ | [[FASE 4 — Inbox, Outbox e Jobs]] |
| 5 | Equipes, Filas e Human Handoff | ⬜ | — |
| 6 | Cliente 360 | ⬜ | — |
| 7 | Knowledge Hub | ⬜ | — |
| 8 | Playbook Engine | ⬜ | — |
| 9 | AI Runtime V1 | ⬜ | — |
| 10 | Copilot V1 | ⬜ | — |
| 11 | Quality AI V1 | ⬜ | — |
| 12 | Conversation Events + Analytics | ⬜ | — |
| 13 | Observabilidade e hardening | ⬜ | — |

Suítes ao fechar a FASE 4: **249 testes puros · 82 de integração**.
Migrations: **16** (014 `flow_executions`, 015 `audit_log`, 016 `inbox`/`outbox`/`jobs`).

## ⚠️ O placar mede o `main`, não a produção

**O Coolify não deploya desde 21/08 20:06 UTC.** Houve pelo menos 4 pushes
depois disso, todos com webhook devolvendo 200, e a produção não se moveu.

Consequência direta: **nada das FASES 1 a 4 está no ar.** A conversa em
produção ainda morre no restart, a credencial ainda sai em texto plano no
`GET /sysconfig` e o XSS do handshake da Meta segue aberto. O trabalho está
feito e não está entregue — a distinção importa.

Sonda certa para "o que está no ar": `last-modified` de `GET /`.
`/health` devolve `2.0.0` fixo e é inútil para isso.

## Dívida que cada fase deixou explícita

Não são esquecimentos — foram decisões registradas com o motivo.

| Origem | Teto assumido | Fecha em |
|---|---|---|
| FASE 1 | Concorrência **entre processos** não resolvida (`filaPorChave` é intra-processo) | lock distribuído, quando houver multi-worker |
| ~~FASE 1~~ | ~~Morte no meio do turno perde o gatilho~~ | ✅ FASE 4 (`inbox`, §125) |
| FASE 1 | Estado é durável, **envio não** — pode ficar "aguardando menu" com o cliente sem ter visto o menu | **FASE 4** (Outbox, §126) |
| FASE 1 | `estado` carrega PII (CPF, contratos, PIX, 50 msgs) sem retenção | política de retenção, §116 |
| FASE 1 | Dreno de 8 s pode cortar turno longo de IA | subir junto com `stop_grace_period` |
| FASE 2 | Portas divergentes entre catálogo e motor (`enviar_email`) — **documentadas**, não renomeadas | exige mapa de migração |
| FASE 2 | Tool Registry **mínimo**: só `allowed_in_sandbox` | campos de risco/permissão na FASE 5+ |
| FASE 3 | Permissões granulares + Supervisor | **FASE 5** (sem equipes não há o que supervisionar) |
| FASE 3 | Mascarar CPF/telefone na UI | **FASE 6** (Cliente 360 redesenha as telas) |
| FASE 3 | Access/refresh token — encurtar TTL hoje desloga todo mundo | sessão dedicada a auth |
| FASE 3 | Cripto: chave mestra vive no env do **mesmo** container | protege contra dump de banco, não contra shell |

## FASE 4 — entregue (2026-08-22)

Detalhe em [[FASE 4 — Inbox, Outbox e Jobs]]. Os 14 critérios de aceite viraram
teste (`tests/integracao/fase4-filas.test.js`, 30 casos).

O que fechou: **gatilho perdido** (`inbox` guarda o payload cru e o worker roda
o `handle*` esperando o turno), **envio não durável** (`outbox` write-ahead, com
ordem por conversa) e **`aguardar_tempo` simulado** (job `flow_resume`, campo
`aguardandoTimer` e mensagem `tipo:'timer'`). De quebra, `aguardar_resposta`
ganhou `timeout`/`max_tentativas` e o descarte silencioso do dispatcher virou
`nao_suportada` visível.

Duas revisões adversariais entraram no resultado. A do PLANO, antes de
codificar, derrubou o Inbox que não fechava o próprio sintoma, o `jobs.chave`
sem `merge` (o timer dispararia uma vez só) e as portas novas como estáticas
(acusariam erro em todo fluxo existente). A do CÓDIGO, depois de pronto, pegou
dois críticos: o **envio inline não reivindicava a linha** — o tick que caísse
durante o POST entregava a mensagem duas vezes, e o critério de aceite passava
por acidente — e o **dreno do SIGTERM devolvia tudo a `pendente`**, violando a
própria regra de que turno de motor não se re-executa sozinho.

Tetos que ficam: reclaim de escrita vai para DLQ em vez de retentar (falta
idempotência de tool, §23); reprocessar entrada da Meta em lote re-executa turno
de mensagem já respondida; `aguardar_tempo → ia_responde` não é suportado (é AI
Runtime, FASE 9); `inbox.payload` guarda PII com purga de 7 dias.

## See Also

- [[FASE 0 — Reconciliação e linha de base]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] · [[FASE 3 — Segurança e governança base]]
