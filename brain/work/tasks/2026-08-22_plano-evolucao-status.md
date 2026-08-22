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

**4 de 13 fases entregues.** Todas mergeadas no `main` e enviadas ao GitHub.

| Fase | Título | Estado | Página |
|:---:|---|---|---|
| 0 | Reconciliação e linha de base | ✅ | [[FASE 0 — Reconciliação e linha de base]] |
| 1 | Fundação crítica / P0 | ✅ | [[FASE 1 — Fundação crítica / P0 (motor persistente)]] |
| 2 | Registry Foundation | ✅ | [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] |
| 3 | Segurança e governança base | ✅ | [[FASE 3 — Segurança e governança base]] |
| 4 | Inbox, Outbox e Jobs | 🔵 desenhada (v2, revisada) | [[FASE 4 — Inbox, Outbox e Jobs]] |
| 5 | Equipes, Filas e Human Handoff | ⬜ | — |
| 6 | Cliente 360 | ⬜ | — |
| 7 | Knowledge Hub | ⬜ | — |
| 8 | Playbook Engine | ⬜ | — |
| 9 | AI Runtime V1 | ⬜ | — |
| 10 | Copilot V1 | ⬜ | — |
| 11 | Quality AI V1 | ⬜ | — |
| 12 | Conversation Events + Analytics | ⬜ | — |
| 13 | Observabilidade e hardening | ⬜ | — |

Suítes ao fechar a FASE 3: **227 testes puros · 54 de integração**.
Migrations: **15** (014 `flow_executions`, 015 `audit_log`).

## ⚠️ O placar mede o `main`, não a produção

**O Coolify não deploya desde 21/08 20:06 UTC.** Houve pelo menos 4 pushes
depois disso, todos com webhook devolvendo 200, e a produção não se moveu.

Consequência direta: **nada das FASES 1, 2 e 3 está no ar.** A conversa em
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
| FASE 1 | Morte no meio do turno perde o **gatilho**: mensagem já deduplicada, motor nunca roda | **FASE 4** (Inbox, §125) |
| FASE 1 | Estado é durável, **envio não** — pode ficar "aguardando menu" com o cliente sem ter visto o menu | **FASE 4** (Outbox, §126) |
| FASE 1 | `estado` carrega PII (CPF, contratos, PIX, 50 msgs) sem retenção | política de retenção, §116 |
| FASE 1 | Dreno de 8 s pode cortar turno longo de IA | subir junto com `stop_grace_period` |
| FASE 2 | Portas divergentes entre catálogo e motor (`enviar_email`) — **documentadas**, não renomeadas | exige mapa de migração |
| FASE 2 | Tool Registry **mínimo**: só `allowed_in_sandbox` | campos de risco/permissão na FASE 5+ |
| FASE 3 | Permissões granulares + Supervisor | **FASE 5** (sem equipes não há o que supervisionar) |
| FASE 3 | Mascarar CPF/telefone na UI | **FASE 6** (Cliente 360 redesenha as telas) |
| FASE 3 | Access/refresh token — encurtar TTL hoje desloga todo mundo | sessão dedicada a auth |
| FASE 3 | Cripto: chave mestra vive no env do **mesmo** container | protege contra dump de banco, não contra shell |

## FASE 4 — desenhada e revisada, pronta para implementar

Design **v2** em [[FASE 4 — Inbox, Outbox e Jobs]] (spec: `docs/superpowers/specs/2026-08-22-fase-4-inbox-outbox-jobs-design.md`).

Revisada por três agentes — um decisor, um contra o Plano Mestre, um contra o
código. **A v1 mudou de forma**, e dois dos erros eram de raciocínio:

- "Outbox só na falha" **não fechava o próprio sintoma** que a spec abria —
  morte de processo não lança exceção. Virou **write-ahead**.
- A justificativa do Inbox estava **factualmente errada** ("webhook lento por
  causa do turno de IA"): os handlers já são fire-and-forget. O ganho é
  durabilidade.

A decisão que estava aberta foi tomada: **`_parkedAte` com teto de 72 h**, para
que execução parada em timer não morra no TTL de 2 h — que existe para pegar
abandono, categoria oposta.

**14 critérios de aceite** definidos. Ordem de implementação sugerida: migration
016 → módulo puro de retry/expiração → inbox → outbox → jobs → nós do motor →
worker → shutdown.

## See Also

- [[FASE 0 — Reconciliação e linha de base]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] · [[FASE 3 — Segurança e governança base]]
