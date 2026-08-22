---
title: FASE 12 — Conversation Events + Analytics
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/modelo-de-dados"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 11 — Quality AI V1]]", "[[Modelo de Dados]]"]
aliases: ["FASE 12", "Analytics", "indicadores", "event store", "telemetria", "custo de IA", "resolução efetiva"]
tags: [work, task, fase-12, plano-evolucao, analytics, metricas]
---

# FASE 12 — Conversation Events + Analytics

**Estado: implementada (2026-08-22).** Migration **025**. Suítes: **456 puros ·
252 de integração**. Design revisado por agente especialista contra o plano
antes de codar.

## A decisão da fase: NÃO existe event store

O §100 lista 24 eventos de conversa. Levantados um a um contra o schema,
**21 já tinham casa** — e casa **tipada**, com coluna real, enum normalizado e
índice: `flow_executions`, `ia_execucoes`, `playbook_execucoes`,
`knowledge_uso`, `copiloto_eventos`, `quality_auditorias`, `satisfacao` e as
próprias colunas de `conversas`.

Um `conversation_events (tipo, payload jsonb)` por cima disso:

- criaria **duas verdades para o mesmo fato** — e no dia em que discordassem,
  ninguém saberia qual está certa;
- **nasceria vazio**: todo número anterior à fase seria zero, enquanto ler as
  tabelas existentes dá histórico desde a FASE 7;
- trocaria enum indexado por `payload->>'motivo'`, perdendo tipo, FK e índice;
- e o §150 já barra infra de evento sem necessidade demonstrada.

**O que faltava era LEITURA.** A fase entregou duas views e uma camada de
agregação. As três lacunas reais não pediam store genérico — pediam
armazenamento no lugar certo.

## O defeito que a fase consertou antes de medir qualquer coisa

`conversaRepo.encerrar()` grava `agente_id: null`. E o dashboard contava
`status = 'encerrada' AND agente_id IS NULL` como **"resolvido só pela IA"**.

Ou seja: **toda conversa encerrada entrava nessa conta**, e o KPI de resolução
por IA dava ~100% **por construção** — inclusive as atendidas por humano do
começo ao fim. Um indicador que só sabe dizer "sim".

O sinal honesto é `EXISTS (mensagens WHERE origem = 'agente')`: humano que de
fato **falou**. A definição agora mora num lugar só (a view `conversa_fatos`) e
o dashboard passou a usá-la — senão Dashboard e Analytics mostrariam dois
"resolução IA" diferentes, a mesma classe de divergência que o projeto já matou
nas faixas de NPS e no catálogo de portas.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| event store/telemetria | **camada de leitura** + `telemetria` (tool e LLM) |
| indicadores executivos (§101) | `analytics.executivo` |
| resolução aparente × efetiva (§102) | `classificarResolucao` — puro |
| FCR/recontato (§103) | janela configurável em `analytics_config` |
| IA (§104) e Tools (§105) | `analytics.iaETools` — latência, erro, **tokens e custo** |
| custo evitado (§108) | `custoEvitado` — sempre rotulado estimativa |
| Copiloto (§109) | já existia em `/api/copiloto/metricas` |
| Knowledge (§110) | `analytics.conhecimento` |
| filas e agentes (§111) | `analytics.filas` |
| NPS unificado (§112) | view `nps_unificado` + `agregarNps` |

## Regras não-óbvias que ficam

- **Nenhum número sem contexto.** Taxa vem com a base, nota de qualidade vem com
  a **cobertura** ("3 de 40 auditados"), custo vem com `precos_configurados`.
  Indicador sem denominador é a forma mais fácil de mentir com dado verdadeiro.
- **Aparente e efetiva aparecem JUNTAS.** Aparente é "encerrou sem humano";
  efetiva exige que a IA tenha declarado `resolvido` **e** que o cliente não
  tenha voltado na janela. Mostrar só a primeira seria propaganda — contar como
  sucesso quem voltou em duas horas é medir o próprio fracasso como vitória.
- **Sem base, taxa é `null`, não zero.** `0%` diria "nenhum resolvido"; `null`
  diz "não houve atendimento".
- **Modelo sem preço configurado deixa o custo `null`.** Custo zerado somado no
  relatório vira "a IA é de graça" — a mentira mais cara possível.
- **`media` descarta `null`, não trata como zero.** `Number(null)` é 0 e é
  finito; o filtro ingênuo puxava a média para baixo. Numa média de duração,
  ausente é "não sei", nunca "durou zero". Foi pego pelo próprio teste.
- **`PARTITION BY COALESCE(telefone, id::text)`** na window de recontato: com
  `PARTITION BY telefone`, todos os NULL caem na mesma partição e **toda
  conversa de widget vira recontato de todas as outras** — a mesma armadilha do
  vazamento de histórico da FASE 6, agora em window function.
- **`DROP VIEW` + `CREATE VIEW`, nunca `CREATE OR REPLACE`**: o segundo falha
  quando a lista de colunas muda, e migration que falha no boot pula os
  monitores.
- **A telemetria nunca derruba atendimento**: insert fire-and-forget, e
  **sandbox não grava** — "Testar fluxo" poluiria custo e taxa de erro.
- **`executarTool` devolve TEXTO mesmo quando falha.** Sem olhar o conteúdo, a
  taxa de sucesso das tools ficaria **verde para sempre** — e métrica sempre
  verde é pior que métrica ausente.
- **Dois pontos de instrumentação, e só dois**: `executarTool` (funil de todas
  as tools) e `getAnthropicClient` (funil dos 5 call sites de LLM). Instrumentar
  no factory **fecha, para efeito de custo, a dívida da FASE 9** — o gateway não
  virou o único caminho, mas o custo agora é contado igual em todos.
- **`encerrada_em` é gravada no ponto único** (`conversaRepo.encerrar`).
  `atualizado` é bombardeado por `incrementarNaoLidas` e o `audit_log` só
  registra o encerramento humano.
- **NPS: as duas tabelas entram.** O `getNPS` antigo usava "tabela com dados
  vence" — com dado nas duas, metade das respostas sumia em silêncio. As
  **faixas continuam em `agregarNps`**: a view não classifica.

## Tetos assumidos

- **`flow_node_entered`/`_finished` ficaram de fora**: uma linha por nó
  atravessado, por conversa, e nenhum indicador do §101–§112 depende disso.
- **Conversão comercial não existe** — a venda fecha no SGP, não aqui. O funil
  vai até o pré-cadastro e o rótulo diz isso; inventar "conversão =
  pré-cadastro" seria mentir num número de diretoria.
- **Motivo de perda cobre só o auditado** (`quality_auditorias.oportunidades`).
- **Sem materialized view**: volume de provedor de 6 agentes não justifica. O
  upgrade é trocar `CREATE VIEW` por `MATERIALIZED` + refresh no `workerFilas`.
- **Backfill de `encerrada_em` é aproximação** (`MAX(mensagens.criado_em)`) —
  não é dado observado.
- **`assumido_em` é zerado na transferência para fila**: o §111 mede a
  **última** assunção, não a primeira.
- **Sem exportação CSV/PDF e sem drill-down por conversa** — não estão no plano.
- **`analytics_config` precisa de tela.** Hoje os custos unitários só se
  configuram pela API/banco; a tela cobra o mesmo defeito das categorias da
  FASE 7 se ninguém fizer.

## Arquivos

Novos: `migrations/versions/025_analytics.js`, `services/analyticsHelpers.js`
(+`.test.js`), `services/analytics.js`, `services/telemetria.js`,
`routes/analytics.js`, `tests/integracao/fase12-analytics.test.js`,
`apps/web/src/pages/Analytics.jsx` (+`.module.css`).

Tocados: `services/iaTools.js` (mede toda tool), `services/integrations.js`
(envelopa `messages.create` — tokens e custo), `services/llmGateway.js`,
`services/copiloto.js`, `services/quality.js`, `services/motorFluxo.js`
(origem/conversa na chamada), `repositories/conversaRepository.js`
(`encerrada_em`), `routes/dashboard.js` (**KPI corrigido**), `server.js`.

## Sonda de deploy desta fase

`GET /api/analytics/executivo` — **404 = antigo, 401 = FASE 12 no ar**.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 11 — Quality AI V1]] · [[Modelo de Dados]]
