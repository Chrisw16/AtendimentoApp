---
title: Realtime SSE
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Canais e Webhooks]]", "[[Fila e SLA]]", "[[Supervisora IA]]", "[[Frontend Maxxi]]", "[[Achados de código (2026-06-30)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["sseManager", "SSE", "realtime", "Redis pub/sub", "broadcast"]
tags: [backend, realtime, sse, redis]
---

# Realtime SSE

`apps/api/src/services/sseManager.js` entrega eventos em tempo real ao painel via **Server-Sent Events**. A conexão é aberta pelo frontend em `GET /api/chat/sse` (rota em `chat.js`, autenticada por token na query string), com `ping` a cada 25s e cleanup no `close`.

## API

- `localClients: Map<agenteId, Set<res>>` — conexões abertas por agente.
- `addClient` / `removeClient` — registro/baixa.
- `broadcast(event, data)` — envia a todos os agentes conectados.
- `sendToAgente(agenteId, event, data)` — envia a um agente específico.

Eventos emitidos pelo sistema: `nova_conversa`, `mensagem`, `conversa_atualizada`, `mensagem_atualizada`, `mensagem_removida`, `modo_alterado`, `sla_critico`, `agente_fantasma`, `supervisora_alerta`, `supervisora_sugestao`, `nota_criada`. O `useChat` no [[Frontend Maxxi|frontend]] reconecta em 3s no erro.

## Redis pub/sub (multi-processo) — bug conhecido

O design prevê Redis pub/sub (canal `maxxi:sse`) para que o broadcast cruze processos/instâncias. **Mas o código faz `import('redis')` (node-redis) enquanto o `package.json` declara `ioredis`** — o import provavelmente falha e o sistema cai sempre em **modo local** (só o processo atual recebe). Consequências: com múltiplos workers ou instâncias, eventos não se propagam; e, somado ao [[Motor de Fluxo|estado de fluxo em memória]], reforça que o Maxxi hoje assume **um único processo por instância**. Detalhe em [[Achados de código (2026-06-30)]].

## See Also

- [[Canais e Webhooks]] · [[Fila e SLA]] · [[Supervisora IA]] · [[Frontend Maxxi]]
