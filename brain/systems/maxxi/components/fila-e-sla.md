---
title: Fila e SLA
type: component
created: 2026-06-30
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Supervisora IA]]", "[[Realtime SSE]]", "[[API Backend Maxxi]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Fila e SLA", "filaService", "fila", "filas de atendimento", "SLA", "urgência", "agente fantasma", "assumir próximo", "capacidade"]
tags: [backend, fila, sla]
---

# Fila e SLA

`apps/api/src/services/filaService.js` gerencia a fila de espera por agente humano e
`filasHelpers.js` (puro) guarda as decisões. Conversas entram com `status = 'aguardando'`
e `aguardando_desde` setado (pelo nó `transferir_agente` do [[Motor de Fluxo]] ou por ação
manual). Desde a **FASE 5** existem filas de verdade — ver [[FASE 5 — Equipes, Filas e Human Handoff]].

> ⚠️ **Não confundir com `/api/filas`**, que é a fila de MENSAGERIA da FASE 4
> (`inbox`/`outbox`/`jobs`). A fila de **gente** vive em `/api/atendimento/filas`.

## Filas (FASE 5)

Tabelas `filas` + `agentes_filas` (migration 017). **"Equipe" e "fila" são a mesma
tabela**: num provedor de 6 agentes não existe equipe que não seja fila, e a indireção não
respondia nenhuma pergunta do produto.

Cada fila tem **SLA próprio** (`sla_atencao_min`/`sla_critico_min`) e **horário próprio**
(`horario` jsonb). `null` no horário **herda o global** do `sistema_kv`; `{ativo:false}`
**não** — é a escolha "esta fila não fecha". Por isso o motor usa `??` e não `||`.

Regras que preservam a operação existente:

- **Agente sem fila nenhuma vê TUDO.** Sem isso, a migration esvaziaria a tela de todo
  agente até alguém montar as filas.
- **`agentes.capacidade = 0` é ilimitado**, e é o default — default 5 faria a migration
  passar a recusar assunção para quem nunca configurou nada.
- **Fila apagada não leva a conversa junto** (`ON DELETE SET NULL`): ela volta a ser "sem
  fila", visível para todos.
- **Transferir para FILA ≠ transferir para AGENTE**: para a fila zera `agente_id`, volta a
  `aguardando` e **reinicia** `aguardando_desde` — herdar o relógio faria o SLA da fila
  nova nascer estourado.

## Assunção

- **`assumir` é UPDATE condicional.** Era incondicional: dois agentes clicando na mesma
  conversa ficavam os dois lá dentro, e o segundo sequestrava a do primeiro em silêncio.
  Quem pode tomar conversa alheia é o admin e o **supervisor da fila dela**
  (`agentes_filas.supervisor`) — é o que dá função à flag.
- **"Assumir próximo" usa `FOR UPDATE SKIP LOCKED`**: dois cliques simultâneos entregam
  conversas **diferentes**.
- A regra mora em `filaService.assumirConversa`, não na rota, para ser testável contra
  Postgres sem subir HTTP.

## Prioridade vinda da IA (FASE 9)

Quando a IA transfere, o **motivo estruturado** vira prioridade: `customer_frustrated` e
`sensitive_case` entram como **2**, que o `calcularUrgencia` já lê como crítico. Sem isso,
quem chega escalado espera atrás de quem quer 2ª via.

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
