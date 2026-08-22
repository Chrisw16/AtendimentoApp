---
title: FASE 5 — Equipes, Filas e Human Handoff
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/motor-fluxo"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 4 — Inbox, Outbox e Jobs]]", "[[FASE 3 — Segurança e governança base]]", "[[Motor de Fluxo]]"]
aliases: ["FASE 5", "filas de atendimento", "equipes", "human handoff", "assumir próximo", "capacidade simultânea", "SLA por fila"]
tags: [work, task, fase-5, plano-evolucao, atendimento, filas]
---

# FASE 5 — Equipes, Filas e Human Handoff

**Estado: implementada (2026-08-22).** Migration **017**, 4 arquivos novos,
**+1 tabela de decisão pura** (`filasHelpers.js`). Suítes: **273 puros · 109 de
integração**.

## A decisão que muda o desenho: equipe É fila

O plano pedia "tabelas de equipes" **e** "tabelas de filas" **e** a associação
agente→equipe→fila. Foram colapsadas numa tabela só.

Um provedor com 6 agentes não tem equipe que não seja também fila: "Suporte" é
o grupo de gente E o balde de conversas. A indireção só existiria para
responder uma pergunta que o produto não faz. Quem precisar depois põe
`equipe_id` em `filas` — o caminho fica aberto e nada precisa ser desfeito.

O que sobrou: `filas` + `agentes_filas` (N:N, com flag `supervisor`).

## O que foi entregue

| Item do plano | Onde |
|---|---|
| tabelas de equipes/filas | migration 017 — `filas` (colapsada) |
| associação agente/fila | `agentes_filas` (PK composta, `supervisor`) |
| SLA | `filas.sla_atencao_min` / `sla_critico_min` — o monitor lê por fila |
| capacidade simultânea | `agentes.capacidade` (0 = ilimitado) |
| assunção manual | `filaService.assumirConversa` — agora **com guarda de posse** |
| `Assumir próximo` | `POST /api/atendimento/assumir-proximo` + botão "Próxima" no chat |
| transferência entre filas | `POST /api/chat/conversas/:id/transferir-fila` |
| horário por fila | `filas.horario` (null = herda o global do `sistema_kv`) |
| nó `Transferir para Fila` | `cfg.fila` deixou de ser inerte — grava `conversas.fila_id` |
| preservar contexto/Flow Execution | trocar de fila **não** toca em `flow_executions` (tem teste) |

## O P0 que a fase achou de brinde

`routes/chat.js` chamava `auditar(...)` e `ipDe(...)` **sem importar o módulo**
— erro introduzido na FASE 3. Em ESM isso não quebra no boot nem no
`node --check`: estoura `ReferenceError` na **primeira chamada**. Ou seja,
`assumir`, `devolver-ia` e `encerrar` respondiam **500 em produção** desde a
FASE 3 — o handoff humano inteiro, justamente a área desta fase.

Ficou a guarda: `tests/imports-de-rota.test.js`, que falha se alguém chamar
`auditar`/`ipDe`/`broadcast`/`getDb` sem importar, e se algum arquivo fizer
`import * as` sobre um repositório (o mesmo erro em outra roupa — apareceu de
novo, em `filasAtendimento.js`, antes do merge). Foi verificada reintroduzindo
os dois defeitos: a guarda pega os dois.

## Regras não-óbvias que ficam

- **`/api/atendimento`, não `/api/filas`.** Aquela rota já é das filas de
  mensageria (inbox/outbox/jobs, FASE 4). Mesmo nome, domínios opostos.
- **Agente sem fila nenhuma vê TUDO.** É o que preserva o comportamento atual
  ao subir a migration: sem essa regra, a tela de todo agente esvaziaria até
  alguém montar as filas. Mora em `filasHelpers.conversaVisivel`.
- **`capacidade = 0` é ilimitado**, e é o default da coluna. Default 5 faria a
  migration passar a **recusar** assunção para quem nunca configurou nada.
- **Fila apagada não leva a conversa junto** (`ON DELETE SET NULL`): ela volta a
  ser "sem fila", visível para todos. Sumir da tela por causa de um clique no
  admin seria o degradar errado.
- **`horario` null herda o global; `{ativo:false}` NÃO.** `null` é ausência de
  configuração, `{ativo:false}` é a escolha "esta fila não fecha". Por isso o
  motor usa `??` e não `||`.
- **Transferir para FILA ≠ transferir para AGENTE.** Para a fila é abrir mão da
  conversa: zera `agente_id`, volta a `aguardando` e **reinicia**
  `aguardando_desde` — herdar o relógio antigo faria o SLA da fila nova nascer
  estourado.
- **`assumir` virou UPDATE condicional.** Era incondicional: dois agentes
  clicando na mesma conversa ficavam os dois lá, e o segundo sequestrava a do
  primeiro em silêncio. A corrida é resolvida pelo banco, não por um `if`.
- **`supervisor` decide alguma coisa.** É quem, além do admin, pode tomar
  conversa alheia **da sua fila**. Flag que não decide nada é pior que flag
  nenhuma, porque parece um controle.
- **`cfg.fila` guarda o SLUG.** Por isso o slug não é editável depois de criado:
  mudá-lo quebraria fluxo montado. Slug inexistente **não engole** a
  transferência — enfileira sem fila e loga.
- **`assumirProxima` usa `FOR UPDATE SKIP LOCKED`**, o mesmo padrão do
  `filaDb.js`: dois agentes clicando junto recebem conversas **diferentes**.

## Tetos assumidos

- **`sem_agente` ficou de fora.** O `nodeTypes.js` prometia essa porta para a
  FASE 5; o horário por fila cobre o caso real ("ninguém atende de madrugada"),
  e uma porta estática nova obrigaria **todo** fluxo existente a ligá-la.
- **Capacidade é checada antes do claim**, fora de transação: dois cliques
  simultâneos do MESMO agente podem estourar o teto em 1. O que o claim atômico
  protege é o estrago de verdade — dois agentes na mesma conversa.
- **O SSE não é filtrado por fila.** `conversa_atualizada` continua indo para
  todos os agentes conectados; a fila filtra a LISTA, não o evento.
- **Membros só são salvos ao editar**, não ao criar a fila (a fila precisa
  existir para ter membro). A tela avisa.
- **Sem fuso por fila.** `dentroDoHorario` usa o relógio do servidor e não cruza
  a meia-noite — é exatamente o que o motor já fazia.
- **A fila não roteia sozinha.** Não há distribuição automática (round-robin,
  push para o agente mais livre): o agente puxa. "Assumir próximo" é o botão.

## Arquivos

Novos: `migrations/versions/017_filas_atendimento.js`,
`services/filasHelpers.js` (+`.test.js`), `routes/filasAtendimento.js`,
`apps/web/src/pages/Filas.jsx` (+`.module.css`),
`tests/integracao/fase5-filas-atendimento.test.js`, `tests/imports-de-rota.test.js`.

Tocados: `services/filaService.js` (SLA por fila + assunção),
`services/motorFluxo.js` (`resolverFila`, `verificarHorario` por fila),
`routes/chat.js` (guarda de posse, capacidade, transferir-fila, `/fila`
filtrada), `repositories/conversaRepository.js` (`fila_nome`), `server.js`,
`seed.js`, `apps/web` (App, Sidebar, api, useChat, ConversaList, ConversaInfo,
FluxoEditor, nodeTypes).

## Sonda de deploy desta fase

`GET /api/atendimento/filas` — **404 = código antigo, 401 = FASE 5 no ar**.
✅ Confirmado em **2026-08-22 14:04 UTC**, 401 em 12 de 12 requisições.

⚠️ **Uma requisição não basta.** No meio do rollout a mesma URL devolveu
`404 401 404` em três chamadas seguidas: duas versões atendendo atrás do
balanceador. Sonde 6+ vezes e exija unanimidade — e não use um laço que para no
primeiro status diferente do antigo, porque ele casa com o container novo
enquanto o velho segue servindo clientes.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 4 — Inbox, Outbox e Jobs]] · [[Motor de Fluxo]]
