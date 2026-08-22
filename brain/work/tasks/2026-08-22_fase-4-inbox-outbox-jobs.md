---
title: FASE 4 — Inbox, Outbox e Jobs
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/canais-e-webhooks", "systems/maxxi/components/motor-fluxo"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[Canais e Webhooks]]", "[[Motor de Fluxo]]"]
aliases: ["FASE 4", "Inbox", "Outbox", "Jobs", "scheduler", "aguardar_tempo", "politicaRetry", "workerFilas"]
tags: [work, task, fase-4, plano-evolucao, resiliencia, jobs]
---

# FASE 4 — Inbox, Outbox e Jobs

**Estado: implementada (2026-08-22).** Design v2 em
[`docs/superpowers/specs/2026-08-22-fase-4-inbox-outbox-jobs-design.md`](../../../docs/superpowers/specs/2026-08-22-fase-4-inbox-outbox-jobs-design.md).
Fecha os três tetos que a FASE 1 assumiu por escrito: gatilho perdido, envio não
durável e `aguardar_tempo` simulado.

Suítes: **249 testes puros** e **82 de integração** (30 novos, um por critério de
aceite mais as bordas de lease, ordem, replay e dreno).

## O que virou fato

| Peça | Arquivo | O que faz |
|---|---|---|
| Schema | `migrations/versions/016_inbox_outbox_jobs.js` | `inbox`, `outbox`, `jobs` |
| Política de tempo | `services/politicaRetry.js` (+ teste puro) | TTL/`_parkedAte`, backoff, expiração, destino de lease |
| Reivindicação | `services/filaDb.js` | `FOR UPDATE SKIP LOCKED`, lease, reclaim, liberar |
| Entrada | `services/inbox.js` | persiste o payload cru → cutuca → worker roda o `handle*` |
| Saída | `services/outbox.js` | write-ahead, ordem por conversa, `nao_suportada` |
| Relógio | `services/jobs.js` | `flow_resume` / `wait_timeout` |
| Tique-taque | `services/workerFilas.js` | reclaim → inbox → outbox → jobs → purga |
| DLQ operável | `routes/filas.js` (`/api/filas`) | inspeção + reprocessamento (admin, auditado) |
| Motor | `motorFluxo.js` | `aguardar_tempo` para de verdade, `aguardar_resposta` com timeout, `retomarTimer` |

## Decisões que sobreviveram à revisão (3 agentes)

| # | Decisão | Motivo |
|---|---|---|
| D1 | Jobs em **tabela no Postgres**, não BullMQ | o Redis é opcional neste deploy e degrada em silêncio; `flow_resume` é estado de conversa (§7.2) |
| D2 | Outbox **write-ahead** | morte de processo não lança exceção — "outbox só na falha" não fechava o próprio sintoma |
| D3 | Dedup por `sha256(canal:corpo_cru)` | a Meta entrega N mensagens num POST e `connection.update` não tem id |
| D4 | Inbox intercepta o ingest, com **cutucada inline** | durabilidade sem perder latência: o tick de 5 s é rede de segurança, não caminho normal |
| D5 | `_parkedAte` com teto de 72 h | espera em timer é a categoria oposta do abandono que o TTL de 2 h pega |

## O que a revisão do PLANO derrubou antes de virar código

Um agente revisor leu o plano contra o mestre e o código, e oito pontos mudaram.
Os três que eram erro de raciocínio, não de digitação:

1. **O Inbox não fechava o próprio sintoma.** Com "os `handle*` não mudam", o
   `processarConversa` seguia fire-and-forget: a entrada virava `ok` com o turno
   ainda solto. Pior, o replay era **no-op** — `porExternalId` e o
   `if (!mensagem) return` abortam na segunda passada, justamente o turno que se
   quer recuperar. Correção: os handlers passaram a **esperar** o motor e a
   aceitar `{reprocessando}`, que recupera a mensagem existente em vez de sair.
2. **`jobs.chave` UNIQUE sem `merge` dispararia o timer uma vez só.** Job `ok`
   deixa a chave ocupada; o segundo `aguardar_tempo` do mesmo `conversa:no`
   (loop, nova execução) simplesmente não inseria. Virou upsert.
3. **Portas novas como estáticas quebrariam todo fluxo existente.**
   `timeout`/`max_tentativas` acusariam `porta_nao_conectada` em fluxos que
   ninguém tocou, inclusive o `fluxo-netgo-v2.json` ("0/0"). São **dinâmicas**:
   só existem quando `cfg.timeout > 0`.

Também vieram de lá: `expirou()` precisa do blob **parseado** (o `estadoStore`
media a idade antes de parsear), `tentativas` conta na **reivindicação** (SIGKILL
não passa pelo `catch`, e sem isso um payload venenoso roda para sempre), o
worker sobe só com migration **OK** (no `finally` ele marteleria tabela
inexistente a cada 5 s), e a rota de DLQ precisava de allowlist de tabela.

## O que a revisão do CÓDIGO derrubou (depois de pronto)

Um segundo agente revisou a implementação contra a spec e o banco. Dois
**críticos**, os dois invisíveis em teste até serem procurados:

1. **Entrega em dobro.** O envio inline não reivindicava a linha: ela nascia
   `pendente` e o tick de 5 s que caísse durante o POST ao provedor pegava a
   MESMA linha e mandava a mensagem de novo. As duas entregas terminam em
   `enviada`, então o banco não denuncia. Janela = duração do POST
   (100–500 ms) a cada 5 s. Correção: `registrar` reivindica antes de devolver
   ao motor; se o worker chegar primeiro, quem entrega é ele. O critério de
   aceite nº 5 passava **por acidente** — a linha nunca era reivindicada.
2. **O dreno do SIGTERM violava a própria política.** `liberar` devolvia tudo a
   `pendente`, inclusive `inbox`/`jobs`, cujo `destinoLease` é `falha`
   justamente porque re-executar turno abre um segundo chamado no SGP.

E mais: o lote do inbox rodava **sequencial** (o 10º cliente de uma rajada
esperaria 9 turnos de IA — regressão que o modelo antigo não tinha);
`cancelarTimer` era fire-and-forget e podia apagar o job **recém-agendado** numa
repergunta; o contador de tentativas era **um só para o fluxo inteiro**;
`nao_suportada` corrigia o banco e deixava a **tela** mentindo; e a DLQ guardaria
PII para sempre.

## Armadilhas novas (para quem mexer nisto depois)

- **`estado.aguardandoTimer` é campo separado de `estado.aguardando`, e tem de
  continuar sendo.** `aguardando` é o único mecanismo de retomada do motor e não
  distingue quem acordou o fluxo: reusá-lo faz a mensagem do cliente ser
  consumida como se fosse o timer; não usar campo nenhum faz o cliente que fala
  agendar um **segundo job**.
- **A mensagem sintética do timer tem `tipo:'timer'`, nem `'sistema'` nem
  `'texto'`.** `'sistema'` faz o `ia_responde` pausar (e é o que a devolução de
  agente usa), `'texto'` vazio esvazia `messages` e a Anthropic recusa.
- **`limparEspera()` zera `_parkedAte`.** Sem isso o TTL normal de 2 h nunca
  volta a valer para aquela execução e ela vive até o teto de 72 h.
- **`tentativas > 1` no inbox significa REPLAY.** É o que o worker passa como
  `{reprocessando:true}` para o handler. Por isso a rota de reprocessamento
  **não zera** `tentativas` no inbox/jobs (zera só no outbox, onde o contador é
  orçamento de retry).
- **Só o motor passa pelo outbox.** `chat.js` (mensagem digitada por agente
  humano) continua enviando direto — a ordem por conversa e a durabilidade valem
  para o que a automação manda, não para o que o agente digita.
- **Purga: 7 dias para o que deu certo, 30 para a DLQ.** DLQ eterna é PII
  eterna — `inbox.payload` é o webhook cru.
- **O envio inline reivindica a linha.** Não "otimize" isso de volta: é o que
  impede a entrega em dobro quando o tick cai no meio do POST ao provedor.

## Tetos declarados (não são bugs — são escolhas)

- **Reclaim de escrita vai direto para DLQ, não retenta.** Retry automático de
  turno exige chave de idempotência nas tools (§23) e o Tool Registry da FASE 2
  é mínimo de propósito. É o teto mais importante desta fase.
- **Reprocessar entrada da Meta em lote re-executa o turno das mensagens que já
  tinham sido respondidas.** A entrada do inbox é o POST inteiro. Por isso o
  reprocessamento é manual e auditado.
- **`aguardar_tempo → ia_responde` não é suportado.** IA falar sozinha depois de
  um timer é geração proativa — AI Runtime (FASE 9). `→ enviar_texto` funciona.
- **Concorrência entre PROCESSOS segue sem resolver** para o motor. `filaDb`
  serializa as filas entre containers (SKIP LOCKED), mas `filaPorChave` continua
  sendo por processo: dois workers na mesma conversa exigem lock distribuído.
- **`inbox.payload` guarda o webhook cru, com PII** (telefone, nome, texto do
  cliente). Mitigação: purga de 7 dias (30 na DLQ) e listagem sem `payload`.
  Quem precisar de retenção menor mexe em `RETENCAO_DIAS`/`RETENCAO_DLQ_DIAS`.
- **A entrega é at-least-once.** Crash entre o envio aceito pelo provedor e o
  `UPDATE ... 'enviada'` faz o worker reenviar. Fechar isso exige chave de
  idempotência de envio, que nenhum adapter tem hoje.
- **Os webhooks só exigem token se a env estiver configurada** — sem ela,
  qualquer um POSTa e agora isso **grava** linha no `inbox` (antes o payload era
  descartado depois de processado). Configurar `EVOLUTION_WEBHOOK_TOKEN` /
  `TELEGRAM_WEBHOOK_SECRET` / `META_APP_SECRET` deixou de ser opcional na
  prática.

## Próximo passo

FASE 5. E, antes de qualquer coisa: **o Coolify segue sem deployar desde 21/08
20:06 UTC** — nada disto protege ninguém em produção enquanto isso não destravar.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[Canais e Webhooks]] · [[Motor de Fluxo]]
