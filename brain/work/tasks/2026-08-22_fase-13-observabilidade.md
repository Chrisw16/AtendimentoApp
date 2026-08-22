---
title: FASE 13 — Observabilidade e hardening
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/runbooks/backup-e-restore", "systems/maxxi/components/auth-e-seguranca"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 12 — Conversation Events + Analytics]]", "[[Backup e Restore]]"]
aliases: ["FASE 13", "observabilidade", "logs estruturados", "correlation ID", "circuit breaker", "saúde do sistema", "CI"]
tags: [work, task, fase-13, plano-evolucao, observabilidade, operacao]
---

# FASE 13 — Observabilidade e hardening

**Estado: implementada (2026-08-22).** Migration **026**. Suítes: **472 puros ·
267 de integração**. **Última fase do Plano de Evolução V1.0.** Design revisado
por agente especialista contra o plano antes de codar.

## Logs estruturados sem reescrever 200 chamadas

O truque: em vez de trocar o logger em cada arquivo, **substitui-se o `console`
uma vez no boot**. Os prefixos que já existiam (`[Motor]`, `[SGP]`, `[Inbox]`)
viram **campo** por regex, sem tocar em nenhum call site.

**Por que não `pino`:** substituiria ~40 linhas de formatação e **não** daria
nem a propagação de contexto (precisaria de `AsyncLocalStorage` do mesmo jeito)
nem a redação de PII em texto livre — e para colher qualquer benefício seria
preciso reescrever os ~200 call sites. Dependência no caminho de boot de um
sistema onde o log é o que se lê no Coolify.

## Correlation ID: o `inbox.id` é a âncora

O `x-request-id` do webhook **morre no 200** — o turno roda depois, no worker. A
âncora durável é a **linha do `inbox`**: já é UUID, já existe e já sobrevive a
morte de processo.

E a travessia é de graça: `AsyncLocalStorage` segue a cadeia de `await`, então
`handle* → motor → tool → SGP → outbox` herdam o contexto **sem uma única
edição**. É isso que tornou o §137 barato aqui.

## PII no log — a rede que faltava

`redigirTexto` (em `mascarar.js`, reuso e não módulo novo) é o **último passo**
do formatador, de onde nenhum call site escapa: CPF/CNPJ, telefone, e-mail,
`token=`, `app=` e `Bearer`.

Motivadores concretos, todos reais: o `[SGP] consultacliente` **já imprimiu CPF
completo**; o `sgpPost` embute 400 caracteres do corpo de erro do SGP (que é
ficha de assinante) na mensagem do `Error` — agora redigido **na origem**; e o
`sgpGet` põe o **token na query string**, então logar a URL vazava credencial.

Ordem importa: a regra do `Bearer` roda **antes** da de `chave=valor`, senão
esta captura a palavra "Bearer" e deixa o token inteiro logo depois — trocando a
etiqueta e preservando o segredo. Foi pego pelo teste.

## `/health/dependencies` — três decisões que a tornam segura

1. **Sempre 200**, veredito no corpo. 503 aqui é convite para alguém pendurar
   uma sonda — e o §133 diz que SGP fora é modo **degradado** (o chat humano
   segue); um readiness que reprova por SGP mataria um container que estava
   atendendo. `/health/ready` e o `HEALTHCHECK` ficaram **intocados**.
2. **Admin.** É o backend da tela de Saúde, não sonda pública: endpoint aberto
   que toca SGP/Anthropic é DoS pago por nós.
3. **Passivo por default**, com cache de 20 s. O status vem do tráfego **real**
   (telemetria da FASE 12), não de ping. *"O SGP respondeu 500 para o cliente"*
   é mais verdadeiro que *"a URL de health respondeu"*.

**E o sinal mais honesto de "o sistema está atendendo" não é ping em provedor —
é a profundidade e a IDADE da fila.** Inbox com 40 pendentes há 4 minutos diz
mais que qualquer `SELECT 1`.

## Circuit breaker: um só, e no SGP

O critério não é "é externo", é *falha lenta + chamador no caminho quente +
degradação já prevista*. Os timeouts do SGP são de 8–12 s e o motor os aguarda
**dentro do turno do cliente**: com o ERP fora, cada turno gasta 12 s antes de
falhar e o lote paralelo do inbox enche.

**Onde NÃO vale:** Anthropic (429 pede backoff, não interrupção — um disjuntor
transformaria um pico de rate limit em "a IA está desligada" por um minuto);
Evolution (**o `outbox` já é o disjuntor** — retry, backoff, expiração e DLQ; um
breaker por cima seria uma segunda política de reenvio para conciliar às 3 da
manhã); Redis (reconecta sozinho); Postgres (banco fora = sistema fora).

**4xx não conta como falha**: é o SGP dizendo "esse contrato não existe" — o
serviço está de pé, e abrir o disjuntor tiraria do ar uma integração saudável.

## Error tracking: dedup é o que o torna viável

`erros_app` com `fingerprint` único = `sha256(nome + mensagem NORMALIZADA +
primeiro frame nosso)`. **10 mil ocorrências do mesmo defeito viram UMA linha**
com contador. Sem isso a tabela vira log e ninguém lê — o mesmo que não existir.

"Normalizada" = números e UUIDs viram `#`. Sem `\b` à direita, de propósito:
*"falhou 3x"* e *"falhou 5x"* são o mesmo defeito, e a borda de palavra não casa
entre dígito e letra.

**Erro marcado como "visto" que volta é reaberto** — erro que reaparece é erro
que não foi resolvido.

Sentry SaaS ficou fora: serviço externo e o payload de erro carrega PII.

## Tela Saúde do Sistema (§140)

Para operador **não-técnico**: um veredito de uma frase no topo, cartões que
dizem **o estado, o que significa e o que fazer**, e cor **nunca** como único
sinal (o rótulo textual vem junto). Nada de stack trace, connection string ou
payload.

## O defeito que os testes pegaram

A query de profundidade de fila usava `criado_em` para as três tabelas — mas
**`inbox` usa `recebido_em`**. O Postgres recusava a query inteira, o
`seguro()` devolvia lista vazia **em silêncio**, e a tela diria *"fila normal"*
enquanto a DLQ enchia. Exatamente o tipo de defeito que uma tela de saúde não
pode ter.

## Também entregue

- **CI** (`.github/workflows/ci.yml`): testes puros, integração com Postgres e
  Redis do próprio runner, build do painel e o validador de fluxo.
  ⚠️ **Sem lint, deliberadamente** (divergência explícita do §146): eslint
  significaria dependência nova e centenas de avisos herdados — um sinal
  vermelho permanente que ninguém lê. O valor dele aqui já está coberto por
  `imports-de-rota.test.js` e `contrato-catalogos.test.js`.
- **`scripts/carga.js`** (§147), zero dependências. O número que importa não é a
  latência do webhook (ele só persiste) — é a **taxa de drenagem do inbox**.
- **Runbook de backup/restore** ([[Backup e Restore]]) com as duas armadilhas
  próprias deste sistema: o dump **contém credenciais e PII**, e sem a mesma
  `KV_SECRET` as credenciais voltam **ilegíveis**.
- **Handlers de `unhandledRejection`/`uncaughtException`** — não existia nenhum:
  uma promessa rejeitada derrubava o processo em silêncio.

## Tetos assumidos

- **Sem OpenTelemetry/Prometheus/Grafana**: um container, um processo, e não há
  scraper. O `snapshot` serializa em ~15 linhas no dia em que houver.
- **Sem série temporal de métricas** — tendência é FASE 12 (Analytics).
- **Sem alerta ativo** (push/e-mail/Telegram): o §140 pede tela, não alerta.
- **Retenção de log**: o Coolify guarda o log do container e ele **se perde no
  redeploy**. O que precisa durar (erros, filas, auditoria) está em tabela.
- **Correlação entre turnos separados por timer** não vira coluna indexada.
- **O drill de restore nunca foi executado** — a tabela no runbook está vazia de
  propósito, esperando a primeira data.

## Arquivos

Novos: `migrations/versions/026_observabilidade.js`, `services/log.js`,
`services/erros.js`, `services/disjuntor.js` (+`.test.js`), `services/saude.js`,
`tests/integracao/fase13-observabilidade.test.js`, `.github/workflows/ci.yml`,
`scripts/carga.js`, `brain/.../runbooks/backup-e-restore.md`,
`apps/web/src/pages/Saude.jsx` (+`.module.css`).

Tocados: `services/mascarar.js` (`redigirTexto`), `services/integrations.js`
(disjuntor nos 3 helpers + redação na origem), `services/inbox.js` e
`services/jobs.js` (escopo de correlação), `services/motorFluxo.js`,
`middlewares/errorHandler.js`, `routes/monitor.js`, `server.js`, `apps/web`.

## Sonda de deploy desta fase

`GET /health/live` — **404 = antigo, 200 = FASE 13 no ar** (é a única sonda
pública das fases; as outras exigiam token).

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[Backup e Restore]] · [[FASE 12 — Conversation Events + Analytics]]
