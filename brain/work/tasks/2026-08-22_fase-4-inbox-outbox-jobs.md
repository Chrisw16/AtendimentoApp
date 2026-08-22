---
title: FASE 4 — Inbox, Outbox e Jobs
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/canais-e-webhooks", "systems/maxxi/components/motor-fluxo"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[Canais e Webhooks]]", "[[Motor de Fluxo]]"]
aliases: ["FASE 4", "Inbox", "Outbox", "Jobs", "scheduler", "aguardar_tempo"]
tags: [work, task, fase-4, plano-evolucao, resiliencia, jobs]
---

# FASE 4 — Inbox, Outbox e Jobs

**Estado: desenhada, não implementada.** Design v2 em
[`docs/superpowers/specs/2026-08-22-fase-4-inbox-outbox-jobs-design.md`](../../../docs/superpowers/specs/2026-08-22-fase-4-inbox-outbox-jobs-design.md),
commit `9bbbfb3`.

Fecha três tetos que a FASE 1 assumiu por escrito: gatilho perdido, envio não
durável e `aguardar_tempo` simulado.

## Decisões tomadas

| # | Decisão | Motivo curto |
|---|---|---|
| D1 | **Jobs em tabela no Postgres**, não BullMQ | o Redis é **opcional** neste deploy e degrada em silêncio; job que vive só nele some sem ninguém ver. Ressalva declarada: o §7.2 lista "jobs" como uso do Redis — esta decisão contraria essa linha e se apoia na seguinte. |
| D2 | **Outbox write-ahead** | persiste `pendente` → envia **inline** → marca `enviada`. Mantém latência e ordem de hoje, e fecha a janela de morte de processo. |
| D3 | **Dedup por `sha256(canal:corpo_cru)`** | a Meta entrega N mensagens num POST e `connection.update` não tem id — `external_id` como chave não modela os canais. |
| D4 | **Inbox intercepta o ingest** | valida → persiste → 200 → worker processa. |
| D5 | **`_parkedAte` com teto de 72 h** | decidido por agente decisor. Execução parada em timer é categoria oposta à do abandono que o TTL de 2 h existe para pegar. |

## O que a revisão adversarial derrubou

Três agentes revisaram (decisor, contra o plano, contra o código). A v1 **mudou
de forma**. Vale registrar porque dois dos erros eram de raciocínio, não de
digitação:

- **"Outbox só na falha" não fechava o próprio sintoma.** A spec abria dizendo
  "estado é durável, envio não — morte entre gravar e enviar deixa o cliente sem
  ver o menu", e duas seções depois decidia gravar no outbox **só quando o envio
  estourasse**. Morte de processo não estoura. Eu escrevi as duas coisas e não
  as li juntas — o mesmo erro da spec do WhatsApp Oficial, que também se
  contradizia e também só apareceu quando um revisor leu as duas afirmações lado
  a lado.
- **Justificativa factualmente errada.** Eu afirmei que "um turno de IA de 10 s
  segura a resposta do webhook". Os três handlers já fazem
  `processarConversa(...).catch(...)` **sem `await`**. O ganho do Inbox é
  durabilidade, não latência — e justificativa errada vira critério de aceite
  errado.
- **"O job vira no-op se o cliente respondeu"** estava metade certo. No outro
  ramo, o job sintético caía no consumo do `aguardar_resposta` e gravava
  **resposta vazia como se fosse do cliente**. Corrupção, não no-op.
- **`SKIP LOCKED` não protege contra SIGKILL** — faltava lease e reclaim; linha
  `processando` ficaria presa para sempre.
- **Sem critérios de aceite**, que o §153 exige. Agora são 14.

## Três armadilhas do motor, com evidência

1. **`aguardando` não distingue timer de cliente.** É o único mecanismo de
   retomada (`motorFluxo.js:230/251/278`). Reusá-lo faz a mensagem do cliente ser
   consumida como se fosse o timer; não reusá-lo faz o cliente que fala agendar
   um **segundo job**. Daí `estado.aguardandoTimer`, separado.
2. **TTL de 2 h mata espera longa.** `_parkedAte` com teto duro de 72 h, decisão
   em função **pura** (`expirou`), testável sem Postgres. O handler limpa
   `_parkedAte` ao retomar, senão o TTL normal nunca volta a valer.
3. **Mensagem fabricada quebra o `ia_responde`** nos dois tipos possíveis:
   `'sistema'` faz o nó pausar (`motorFluxo.js:677`), e `'texto'` vazio esvazia
   `messages` e a Anthropic recusa. Daí o tipo próprio **`'timer'`**.

## Tetos declarados

- **`aguardar_tempo → ia_responde` não é suportado.** A IA falar sozinha depois
  de um timer é geração proativa sem turno do cliente — feature do AI Runtime
  (FASE 9), não consequência de um job. `aguardar_tempo → enviar_texto`, que é o
  follow-up comum, funciona.
- **Reclaim de escrita vai direto para DLQ**, não retenta. Retry automático de
  escrita exige chave de idempotência nas tools (§23), e o Tool Registry da
  FASE 2 é mínimo de propósito — sem `idempotency_strategy`. É o teto mais
  importante desta fase.
- **Descarte silencioso vira visível, não vira envio.** O dispatcher passa a
  devolver `{despachado, motivo}` e o outbox marca `nao_suportada`. A Evolution
  continua não enviando `localizacao`; só para de mentir que enviou.

## Próximo passo

Implementar. A spec tem 14 critérios de aceite; a ordem natural é migration 016
→ módulo puro de política de retry/expiração (com teste) → inbox → outbox →
jobs → nós do motor → worker → shutdown.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[Canais e Webhooks]]
