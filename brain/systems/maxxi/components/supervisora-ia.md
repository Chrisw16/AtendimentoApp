---
title: Supervisora IA
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Fila e SLA]]", "[[Realtime SSE]]", "[[Canais e Webhooks]]", "[[IA com Tool Calling]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["supervisoraIA", "supervisora", "sentimento", "sugestão de resposta"]
tags: [backend, ia, sentimento, sla, supervisora]
---

# Supervisora IA

`apps/api/src/services/supervisoraIA.js` (~283 LOC) é uma camada de IA que assiste o **agente humano** (diferente da [[IA com Tool Calling|IA que atende o cliente]]). Faz análise de sentimento, detecta demora do agente e gera sugestões de resposta. Atua em conversas com `status = 'ativa'` (já com agente).

## Análise de sentimento

- **Instantânea (sem IA):** `analisarMensagemInstantaneo` classifica por listas de palavras-chave (`PALAVRAS_FRUSTRACAO`, `PALAVRAS_ESCALADA`) + sinais de urgência (CAPS, `!!`). Níveis: `positivo`, `neutro`, `atencao`, `frustrado`, `critico`. Chamada a cada mensagem de cliente em conversa com agente (via [[Canais e Webhooks|webhook]]).
- **Profunda (com Claude, ao encerrar):** `analisarConversaEncerrada` pede ao Claude Haiku um `<sentimento>/<topico>/<resumo>` (XML) e grava em `conversas`. **Atenção:** esta função parece não ser chamada pela rota de encerramento (`chat.js` a importa mas não a invoca) — a verificar rodando.

## Alertas e sugestões (via SSE)

`processarMensagemCliente`: salva o `sentimento` no banco e, se `frustrado`/`critico`, envia `supervisora_alerta` ao agente e `supervisora_alerta_supervisor` em broadcast, além de gerar uma **sugestão de resposta** empática via Claude (`_gerarSugestaoResposta`, evento `supervisora_sugestao`). No frontend, o componente `SupervisoraIA.jsx` ouve esses eventos (propagados por `useChat` como `CustomEvent` no `window`) e mostra alertas + botão "copiar sugestão".

## Detecção de demora (SLA do agente)

`verificarDemoraAgente` alerta quando o agente assumiu mas não responde: **5 min** (atenção) e **15 min** (crítica). O monitor próprio (`iniciarMonitorSupervisora`, a cada 2 min, iniciado no boot) varre conversas ativas com agente e dispara os alertas. Complementa o monitor de fila em [[Fila e SLA]].

## See Also

- [[Fila e SLA]] · [[Realtime SSE]] · [[Canais e Webhooks]]
