---
title: Fila e SLA
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Supervisora IA]]", "[[Realtime SSE]]", "[[API Backend Maxxi]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["filaService", "fila", "SLA", "urgência", "agente fantasma"]
tags: [backend, fila, sla]
---

# Fila e SLA

`apps/api/src/services/filaService.js` (~130 LOC) gerencia a fila de espera por agente humano, calcula urgência e dispara alertas de SLA. Conversas entram na fila com `status = 'aguardando'` e `aguardando_desde` setado (pelo nó `transferir_agente` do [[Motor de Fluxo]] ou por ação manual).

## Urgência e fila

- `calcularUrgencia(aguardandoDesde, prioridade)` → níveis `ia` / `ok` / `atencao` / `critico`. Crítico quando `prioridade ≥ 2` ou espera `≥ 15 min`; atenção em `≥ 5 min` ou `prioridade ≥ 1`. Usado também na listagem de conversas (`chat.js` enriquece cada conversa com `urgencia`).
- `getPosicaoNaFila`, `getTotalNaFila`, `getTempoMedioEspera` — ordena por `prioridade DESC, aguardando_desde ASC`.
- `detectarPalavrasCriticas` — lista de gatilhos (procon, advogado, cancelar...).

## Monitor de SLA

`iniciarMonitorSLA` (iniciado no boot, roda a cada **60s**) emite dois tipos de alerta via [[Realtime SSE|broadcast]], com deduplicação (`Set` + TTL):
- `sla_critico` — conversa aguardando em nível crítico.
- `agente_fantasma` — agente assumiu (`assumido_em`) mas não enviou a primeira resposta (`primeira_msg_agente_em` nulo) em 5 min.

O frontend (`useChat`) transforma esses eventos em toasts. Complementa o monitor da [[Supervisora IA]] (que cuida da demora **após** a primeira resposta).

## See Also

- [[Supervisora IA]] · [[Realtime SSE]]
