---
title: FASE 1 — Fundação crítica / P0 (motor persistente)
type: task
created: 2026-08-21
last_updated: 2026-08-21
status: active
priority: p0
knowledge_refs: ["systems/maxxi/components/motor-fluxo"]
related: ["[[FASE 0 — Reconciliação e linha de base]]", "[[Motor de Fluxo]]"]
tags: [work, task, fase-1, plano-evolucao, motor, persistencia]
---

# FASE 1 — Fundação crítica / P0

Design aprovado antes de codar. Referência: [Plano Mestre §8–14 e PARTE XXI/FASE 1](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md).

## O problema real

`estadosExecucao` é um `Map` em memória em [motorFluxo.js:24](../../../apps/api/src/services/motorFluxo.js#L24).
Restart/deploy = toda conversa em andamento volta ao nó de início, em silêncio.
`transferir_agente` e `encerrar` fazem `estados.delete()`, então voltar do humano
para a IA também recomeça o fluxo do zero.

## Os 8 trabalhos e a decisão de cada um

### 1. Persistência — `flow_executions` (migration 014)

Uma linha por conversa **viva**. O blob `estado` jsonb continua sendo o mesmo
objeto que o motor já usa (`{noAtual, contexto, historico, aguardando}`) — não se
inventa modelo novo, persiste-se o que existe.

```
id            uuid pk
conversa_id   uuid unique  → conversas(id) on delete cascade
fluxo_id      uuid
fluxo_versao  int
status        text  running|aguardando_input|aguardando_humano|concluida|falhou
estado        jsonb
retomar_no    text   (nó onde a automação recomeça quando o humano devolver)
revisao       int default 0
ultimo_erro   text
criado_em / atualizado_em / concluida_em
no_atual      text GENERATED ALWAYS AS (estado->>'noAtual') STORED
```

`no_atual` é **coluna gerada do Postgres** — atende "estado pode ser inspecionado
no banco" sem uma linha de código de app e sem risco de divergir do blob.

Concluída/falhou **não vira linha morta**: a linha é apagada (o motor já apaga
hoje via `estados.delete`). Histórico de execução é FASE 12 (Conversation Events),
não se antecipa aqui.

### 2. Store assíncrono com a mesma cara de `Map`

`estadoStore.js` expõe `get/set/delete` assíncronos. O motor passa a `await`
nos 5 pontos de uso. O sandbox continua injetando um `Map` puro — `await` sobre
valor síncrono funciona igual, então **um só caminho de código**.

### 3. Versão fixa por conversa — snapshot deduplicado

`fluxos.versao` já existe (default 1) e nunca foi incrementado. Passa a
incrementar no `PUT /fluxos/:id` quando `dados` muda.

`fluxo_snapshots(fluxo_id, versao, dados jsonb)` — PK composta, gravado com
`onConflict().ignore()`. **Uma cópia por versão**, não por conversa (uma cópia por
conversa custaria ~50 KB × N conversas).

A execução guarda `fluxo_id + fluxo_versao` e lê o grafo do snapshot. Publicar a
v14 não mexe em quem está na v13.

### 4. Retomar após restart

Cai de graça: o estado vem do banco. O que precisa de teste é o caminho
`aguardando_input` → processo novo → mensagem chega → continua no mesmo nó.

### 5. `aguardando_humano` + retorno para IA

`transferir_agente` **para de apagar o estado**: grava `status='aguardando_humano'`
e `retomar_no` = destino da porta `retorno` (se houver; sem ela o comportamento
antigo de encerrar é mantido).

`POST /chat/conversas/:id/devolver-ia` (já existe) passa a retomar: `noAtual =
retomar_no`, status `running`, e roda o motor. Sem `retomar_no`, degrada para o
comportamento de hoje.

### 6. Protocolo concorrente

`_gerarProtocolo` faz `COUNT(*)+1` e `protocolo` é `unique` — dois `criar()`
simultâneos colidem e o segundo estoura. Correção: **retry no 23505**
(unique_violation), 5 tentativas. Sem tabela de sequência, sem schema novo.

### 7. Migrations bloqueando readiness

Hoje a falha de migration só imprime no console e o app parece saudável.
`/health` (liveness) continua respondendo sempre. Novo `/health/ready`: 503
enquanto as migrations não terminarem, 503 permanente se falharem. Healthcheck
do Coolify aponta para `/health/ready`.

### 8. Graceful shutdown

`SIGTERM`/`SIGINT`: para de aceitar conexões, espera a fila por conversa drenar
(teto de 15 s), fecha o pool do Knex, sai. Sem isso, deploy corta conversa no meio
de um `await` de SGP/IA.

## Ceiling assumido (explícito)

Concorrência **entre processos** não é resolvida: `filaPorChave` serializa dentro
de um processo, e `revisao` é **detector**, não resolvedor — em conflito o turno
é abandonado com log alto, nunca aplicado por cima. Com um container só (o deploy
de hoje) isso nunca dispara. Multi-worker de verdade exige lock distribuído
(Redis) por conversa — fora do escopo desta fase, marcado com `ponytail:` no
código.

## Critérios de aceite (do plano §14)

- [ ] restart não reinicia conversa em andamento
- [ ] deploy não perde contexto
- [ ] duas mensagens simultâneas não causam salto de nó
- [ ] conversa vai para humano e volta ao fluxo
- [ ] nova versão do fluxo não altera execução já iniciada
- [ ] estado inspecionável no banco
- [ ] testes de integração cobrem persistência e retomada
