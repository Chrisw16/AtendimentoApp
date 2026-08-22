---
title: Plano de Evolução V1.0 — status consolidado
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: active
priority: p1
knowledge_refs: ["systems/maxxi/overview"]
related: ["[[FASE 5 — Equipes, Filas e Human Handoff]]", "[[FASE 4 — Inbox, Outbox e Jobs]]", "[[FASE 0 — Reconciliação e linha de base]]", "[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]]", "[[FASE 3 — Segurança e governança base]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["status do plano", "onde estamos", "roadmap V1.0", "progresso das fases"]
tags: [work, task, plano-evolucao, status, roadmap]
---

# Plano de Evolução V1.0 — status consolidado

Rastreador único de [docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md)
(2579 linhas, 26 partes, 13 fases). Cada fase tem sua própria página com o
detalhe; aqui fica só o quadro.

## Placar

**6 de 13 fases entregues e EM PRODUÇÃO.** A FASE 5 foi confirmada no ar em
2026-08-22 14:04 UTC — `GET /api/atendimento/filas` devolvendo 401 em 12 de 12
requisições, e `/health/ready` em 200 (migrations até a 017 aplicadas).

| Fase | Título | Estado | Página |
|:---:|---|---|---|
| 0 | Reconciliação e linha de base | ✅ | [[FASE 0 — Reconciliação e linha de base]] |
| 1 | Fundação crítica / P0 | ✅ | [[FASE 1 — Fundação crítica / P0 (motor persistente)]] |
| 2 | Registry Foundation | ✅ | [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] |
| 3 | Segurança e governança base | ✅ | [[FASE 3 — Segurança e governança base]] |
| 4 | Inbox, Outbox e Jobs | ✅ | [[FASE 4 — Inbox, Outbox e Jobs]] |
| 5 | Equipes, Filas e Human Handoff | ✅ | [[FASE 5 — Equipes, Filas e Human Handoff]] |
| 6 | Cliente 360 | ⬜ | — |
| 7 | Knowledge Hub | ⬜ | — |
| 8 | Playbook Engine | ⬜ | — |
| 9 | AI Runtime V1 | ⬜ | — |
| 10 | Copilot V1 | ⬜ | — |
| 11 | Quality AI V1 | ⬜ | — |
| 12 | Conversation Events + Analytics | ⬜ | — |
| 13 | Observabilidade e hardening | ⬜ | — |

Suítes ao fechar a FASE 5: **273 testes puros · 109 de integração**.
Migrations: **16 arquivos, até a 017** (014 `flow_executions`, 015 `audit_log`,
016 `inbox`/`outbox`/`jobs`, 017 `filas`/`agentes_filas`).

## ✅ O placar e a produção voltaram a bater (2026-08-22 04:26 UTC)

O push da FASE 4 (04:17 UTC) **deployou** em ~9 min. Confirmado por sonda de
rota: `GET /api/filas` → **401** (rota nascida na FASE 4) e `/health/ready` →
**200**, que também prova as migrations até a **016** aplicadas em produção.
As FASES 1 a 4 estão no ar.

**Uma requisição só não confirma nada** (aprendido na FASE 5): durante o
rollout a mesma URL devolveu `404 401 404` em três chamadas seguidas — duas
versões atendendo ao mesmo tempo atrás do balanceador. Sonde 6+ vezes e só
aceite se todas concordarem; um laço que para no primeiro status diferente do
antigo dá falso positivo.

**A sonda que esta doc recomendava estava errada.** O `last-modified` de
`GET /` NÃO se moveu com esse deploy (seguiu em 03:31) — dá falso negativo, e
foi provavelmente o que sustentou o diagnóstico de "o Coolify não deploya" de
21/08. A sonda confiável é uma **rota que só existe no código novo**: 404 =
antigo, 401/200 = novo. `/health` devolve `2.0.0` fixo e nunca serviu.

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
| ~~FASE 3~~ | ~~Permissões granulares + Supervisor~~ | ✅ FASE 5 (`agentes_filas.supervisor` toma conversa alheia da própria fila) |
| FASE 5 | Capacidade checada **fora** de transação: dois cliques do mesmo agente estouram o teto em 1 | `SELECT ... FOR UPDATE` no agente, se doer |
| FASE 5 | SSE não é filtrado por fila — o evento vai para todos | filtro por assinatura de fila no `sseManager` |
| FASE 5 | Sem distribuição automática (round-robin/push): o agente **puxa** | roteamento ativo, se o volume exigir |
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

## FASE 5 — entregue (2026-08-22)

Detalhe em [[FASE 5 — Equipes, Filas e Human Handoff]]. **"Equipe" e "fila"
viraram a mesma tabela**: o plano pedia as duas mais a associação
agente→equipe→fila, e a indireção não respondia nenhuma pergunta do produto
num provedor de 6 agentes. `equipe_id` em `filas` continua possível depois.

O que fechou: SLA e horário **por fila**, capacidade simultânea por agente,
"assumir próximo" com claim atômico (`SKIP LOCKED`), transferência entre filas
preservando a Flow Execution, e o nó `transferir_agente` finalmente **lendo**
`cfg.fila` — era campo de texto livre que o motor nunca leu.

De brinde, um **P0 em produção**: `routes/chat.js` chamava `auditar`/`ipDe` sem
importar desde a FASE 3, então `assumir`, `devolver-ia` e `encerrar` devolviam
500 — o handoff humano inteiro. Em ESM isso não aparece no boot nem no
`node --check`. Ficou a guarda `tests/imports-de-rota.test.js`, verificada
reintroduzindo o defeito.

## See Also

- [[FASE 0 — Reconciliação e linha de base]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] · [[FASE 3 — Segurança e governança base]]
