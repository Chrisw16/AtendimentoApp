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

## 3. Função nativa no app (tela Fluxos)

Botão **"Testar fluxo"** no card de cada fluxo abre o `TesteFluxoModal` (`apps/web/src/components/fluxo/`), com duas abas:

- **Validação** → `POST /fluxos/:id/validar` (roda o `fluxoValidador` no fluxo do banco e mostra o relatório).
- **Simulação**, em dois modos:
  - **Roteiro** → `POST /fluxos/:id/simular` (o `motorSimulador`; você dá as mensagens + decisões por nó; sem custo de IA).
  - **Conversa real** → `POST /fluxos/:id/simular-real`: roda o **motor de verdade** (`processarConversa`) com **SGP e IA reais**, em **modo sandbox**.

### Modo sandbox (a "simulação real")

`processarConversa(conversa, msg, opts)` ganhou `opts` opcionais (defaults = produção byte-idêntica): `fluxo` (testa um fluxo específico), `estados` (Map isolado), `enviar` (captura respostas em vez de mandar no WhatsApp) e `sandbox`. Com `sandbox:true`: SGP/IA **leem de verdade**, mas tudo que **grava** é simulado — nós `abrir_chamado`/`promessa_pagamento`/`transferir_agente`/`nota_interna`/`nps_inline`/`encerrar` e as tools de IA `criar_chamado`/`promessa_pagamento`/`precadastrar_cliente`/`reiniciar_onu_acs` (gate em `executarTool`). A rota é **resumível** por turno (`{mensagem, estado}` → `{respostas, estado, status}`), então o chat sandbox mantém a conversa entre mensagens sem estado no servidor.

## 4. Link público de teste (`/teste/<token>`)

Para compartilhar o chat de teste com pessoas **sem login**: botão "Testar fluxo" → Conversa real → **"🔗 Link público de teste"** gera `…/teste/<token>` (token revogável por fluxo).

- Backend: coluna `fluxos.share_token` (migration 013); rota **pública** `GET/POST /api/chat-teste/:token` (`apps/api/src/routes/chatTeste.js`, fora do auth, rate-limit 60/5min) que roda o mesmo **sandbox**; admin `POST /fluxos/:id/compartilhar` (gera/regenera) e `DELETE` (revoga).
- Frontend: página standalone `pages/ChatTeste.jsx` na rota `/teste/:token` (fora do `PrivateRoute`), reusa o `BotBubble` exportado do `TesteFluxoModal`.
- **Stateless** (estado vive no cliente) → aguenta vários testadores ao mesmo tempo.
- ⚠️ Modo escolhido: **Real** — IA gasta tokens por uso e, em fluxos com `consultar_cliente`, o testador veria dado real. Seguro para o fluxo **comercial** (leads, sem PII de cliente existente).

## Divergências conhecidas simulador ↔ motor

O simulador é fiel no **roteamento** (usa o `executarLoop` real e o `encontrarProximo` idêntico), mas **não** no texto de alguns nós — ele reimplementa o "que mensagem sai" em `executorFiel`. Onde as duas leituras discordam, a aba Simulação dá **falso positivo de confiança**:

| Nó | Simulador lê | Motor lê | Efeito |
|---|---|---|---|
| `consultar_cliente` | `cfg.mensagem`, com default embutido `'Informe seu CPF:'` | `cfg.pergunta` | A simulação mostra a pergunta do CPF **mesmo quando o motor real não mandaria nada**. Some-se a isto que `consultar_cliente` **não tem bloco no PropsPanel**: hoje ninguém consegue setar `pergunta` pela tela, então em produção o nó fica em silêncio esperando o CPF. |

Regra ao mexer: o simulador **espelha** o motor; qualquer nome de campo lido lá tem que ser o mesmo que o `processarNo` lê. Vale um teste em `motorSimulador.test.js` fixando o nome do campo.

## Limitações / próximos passos

- O `motorSimulador` (modo Roteiro) **não roda** o `processarNo` real — roteiriza as decisões. Quem roda o motor real é o modo **Conversa real** (sandbox). Religar o `motorLoop` no `processarConversa` para remover a duplicação do loop segue **deferido** (precisa Docker pra validar).
- Toda a integração (rotas Express + React + dry-run do motor) foi escrita mas **não rodada** neste ambiente (sem `node_modules`/banco) — validar via `docker-compose`.
- Faltam: modo "validar todos os fluxos do banco" e badge de lint no editor (candidatos a partir do `fluxoValidador`).

## See Also

- [[Motor de Fluxo]] · [[Catálogo de Nós]] · [[Auditoria profunda (2026-06-30)]]
