---
title: Testes de Fluxo
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Motor de Fluxo]]", "[[Catálogo de Nós]]", "[[Auditoria profunda (2026-06-30)]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["2026-06-30_estudo-codigo-maxxi", "2026-06-30_motor-fluxo-catalogo"]
aliases: ["Testes de Fluxo", "validador de fluxo", "fluxoValidador", "simulador de conversa", "motorSimulador", "motorLoop", "ambiente de testes", "ambiente de testes de fluxo"]
tags: [backend, fluxo, testes, qa, ferramenta]
---

# Testes de Fluxo

Ambiente de testes do [[Motor de Fluxo]] para responder, **sem subir banco/IA/WhatsApp**, três perguntas: o atendimento **funciona passo a passo**? **trava**? **perde o cliente** num beco sem atendimento? São duas ferramentas complementares — uma olha o **grafo** (estática), a outra **executa** um caminho (dinâmica). Vivem em `apps/api/src/services/` e rodam no runner nativo (`cd apps/api && npm test`). Nasceram da [[Auditoria profunda (2026-06-30)]].

> **Por que são puras (sem importar o motor):** `motorFluxo.js` importa `config/db.js` (knex) no topo, e as deps não ficam instaladas localmente (o projeto roda via Docker) — então **o motor não é importável em teste**. A lógica testável foi isolada em módulos puros que só dependem de outros puros ([[Motor de Fluxo|fluxoHelpers]]).

## 1. Validador estático — `fluxoValidador.js`

Analisa o **grafo** do fluxo (sem executar) e aponta problemas. A peça central é o catálogo `NOS`: para cada tipo de nó, **quais portas o motor pode emitir** (extraído do `switch` de `processarNo`), incluindo portas dinâmicas (menus/ramos/rotas) e **fallbacks implícitos** que o editor esquece (`saida` dos menus, `default` da condição múltipla, `nao_entendeu`/`encerrar` do roteador). Códigos:

| Código | Nível | O que é |
|---|---|---|
| `sem_entrada` | erro | fluxo sem nó `inicio`/`gatilho_keyword` — não arranca |
| `beco_sem_saida` | erro | nó alcançável, não-terminal, **sem nenhuma aresta** → o motor encerra em silêncio, cliente largado |
| `porta_nao_conectada` | aviso | porta que o motor emite mas o editor não ligou → cai no fallback do `encontrarProximo` e pode **mandar pro ramo errado** |
| `no_inalcancavel` | aviso | nó nunca atingido a partir do início (código morto) |
| `aresta_orfa` | aviso | aresta saindo de porta que o motor **nunca emite** (ex.: `transferido`/`sem_agente`) — conexão inerte |
| `loop_sem_espera` | aviso | ciclo só de nós instantâneos → estoura o teto de 15 iterações e trava |

CLI (exit 1 se houver erro — serve em CI):
```
node src/services/fluxoValidador.cli.js examples/fluxo-exemplo.json
```

**Nuance importante:** o `encontrarProximo` do motor tem 3 fallbacks (porta exata → `saida` → **1ª aresta qualquer**). Por isso um ramo não-ligado **não perde** o cliente — ele o manda pro nó errado (por isso é `aviso`, não `erro`). Só vira beco de verdade quem tem **zero arestas**.

## 2. Simulador de conversa — `motorSimulador.js` (+ `motorLoop.js`)

Executa uma conversa **multi-turno** sobre o **loop real** do motor, extraído em `motorLoop.js`.

- **`motorLoop.js` — `executarLoop(ctx, {processarNo, encontrarProximo, onPasso})`:** o laço do `processarConversa` como função pura (teto de 15, `aguardar`/`avancar`/`fim`, `encontrarProximo` **cópia byte-a-byte** do motor). Classifica o desfecho: `concluido` · `aguardando` · `perdido` (porta sem aresta num nó não-terminal) · `travado` (teto) · `erro`. É um **espelho fiel, pronto pra religar** no `processarConversa` e apagar o loop duplicado — religamento **deferido** porque precisa rodar via Docker pra validar.
- **`motorSimulador.js` — `simularConversa(fluxo, {turnos, decisoes, contextoInicial})`:** dá um executor de nó **fiel** aos determinísticos (mensagens, menus com casamento real, NPS reusando o `avaliarNps` real) e **roteiriza** os de IO/IA/SGP (você diz qual porta cada `consultar_cliente`/`ia_responde`/`condicao` toma). Devolve `{status, trilha, transcript, turnos}`.

CLI (passo a passo cliente⇄bot + veredito; exit 1 se travar/perder):
```
node src/services/motorSimulador.cli.js examples/fluxo-exemplo.json examples/cenario-exemplo.json
```

## Validador × Simulador

O **validador** prova propriedades sobre **todos** os caminhos do grafo de uma vez (bom pra "nenhum beco existe"). O **simulador** prova um **caminho concreto** que você roteiriza (bom pra "o cenário 2ª-via-de-boleto conclui certinho"). Use os dois: o validador como rede ampla, o simulador para cenários de regressão.

## Limitações / próximos passos

- O simulador **não roda** o `processarNo` real (o motor não importa em teste aqui) — roteiriza as decisões de IO/IA/SGP. Para rodar o motor de verdade com SGP/IA mockados, é preciso **religar o `motorLoop` no `processarConversa`** (deferido) e/ou instalar deps + injetar serviços.
- Não há ainda um modo "validar todos os fluxos do banco" (precisa de DB) nem badge de lint no editor — candidatos naturais a partir do `fluxoValidador`.

## See Also

- [[Motor de Fluxo]] · [[Catálogo de Nós]] · [[Auditoria profunda (2026-06-30)]]
