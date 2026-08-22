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

Design **v2** — a v1 foi revisada por dois agentes (um contra o Plano Mestre,
outro contra o código) e **encolheu**. O que segue já é o desenho corrigido.
Referência: [Plano Mestre §8–14 e PARTE XXI/FASE 1](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md).

## O problema real

`estadosExecucao` é um `Map` em memória em [motorFluxo.js:24](../../../apps/api/src/services/motorFluxo.js#L24).
Restart/deploy = toda conversa em andamento volta ao nó de início, em silêncio.
`transferir_agente` e `encerrar` fazem `estados.delete()`, então voltar do humano
para a IA também recomeça o fluxo do zero.

## Schema — uma tabela, três colunas

```sql
flow_executions
  conversa_id    uuid PRIMARY KEY → conversas(id) ON DELETE CASCADE
  estado         jsonb NOT NULL
  atualizado_em  timestamptz DEFAULT now()
```

O blob `estado` é **o mesmo objeto que o motor já usa**
(`{noAtual, contexto, historico, aguardando}`), acrescido de dois campos
internos: `_grafo` (o snapshot congelado do fluxo) e `_retomarNo`.

Inspecionável com `SELECT conversa_id, estado->>'noAtual' FROM flow_executions`
— o critério §14 não pede coluna, pede que dê para olhar.

### O que a revisão cortou, e por quê

| Cortado | Motivo |
|---|---|
| tabela `fluxo_snapshots` + `fluxos.versao` + backfill | a linha é apagada quando a conversa acaba, então N = conversas **vivas** (dezenas). O grafo dentro da execução resolve fixação de versão **e** troca de fluxo ativo, sem tabela, sem versionamento, sem backfill. |
| coluna `revisao` (lock otimista) | `filaPorChave` já serializa por conversa dentro do processo e a linha é única por conversa. Detector para um evento impossível no deploy atual. Vira `ponytail:` no store. |
| colunas `status`/`concluida_em`/`ultimo_erro` | a linha é apagada ao concluir — seriam 4 campos que nunca existem em disco. |
| `no_atual` GENERATED STORED | `estado->>'noAtual'` no SELECT faz o mesmo com zero DDL. |

## Os 8 trabalhos

### 1–2. Store assíncrono + persistência

`estadoStore.js` com `get/set/delete` assíncronos, devolvendo **o blob cru**
(mesmo formato do `Map`) — se devolvesse um envelope `{estado, revisao}`, as duas
rotas de sandbox que injetam `new Map()` quebrariam. O sandbox segue com `Map`
puro; `await` sobre valor síncrono é idêntico, então **um só caminho de código**.

São **8** call sites, não 5: `get` 62/126, `set` 105, `delete` 111/116/545/601,
mais `limparEstado` (export morto, sem chamador — **apagado**).

**O `set` sai do único ponto de pausa e vai para o fim do turno.** Hoje só grava
em `aguardar_input`; tudo que a travessia acumula (`_cpf_tentativas`, ficha do
SGP, contadores da IA, `salvar_dado`) some se o processo morrer antes da pausa.

**Guard de sandbox passa a ser `opts.sandbox`, não `opts.estados`**
([motorFluxo.js:38](../../../apps/api/src/services/motorFluxo.js#L38)) — hoje a
presença de `estados` é o que desliga a fila por conversa; injetar o store por
`opts.estados` mataria o `filaPorChave` em silêncio e a race de 2026-08-21
voltaria. Os dois chamadores de sandbox já passam `sandbox: true`, então é seguro.

### 3. Versão fixa por conversa — snapshot no `_grafo`

Ao nascer, a execução congela `fluxo.dados` em `estado._grafo` e o `fluxo.id` em
`estado._fluxoId`. Enquanto a execução vive, o motor **não relê**
`db('fluxos').where({ativo:true})`.

Isso cobre dois casos, não um: publicar a v14 **e** trocar o fluxo ativo
(`POST /fluxos/:id/ativar` desativa todos e ativa outro — hoje uma conversa viva
passa a rodar contra um grafo com outros ids de nó e morre em "Nó não encontrado").

`opts.fluxo` mantém **precedência absoluta** — é o que faz o botão "Testar fluxo"
exercitar o rascunho, não a versão publicada.

### 4. Retomar após restart

Cai de graça do store. O que precisa de teste é `aguardando_input` → processo
novo → mensagem chega → continua no mesmo nó, com o `contexto` intacto.

### 5. Humano → IA

`transferir_agente` para de apagar o estado. Grava
`_retomarNo = encontrarProximo(no.id, 'transferido', edges)` — porta que **já
existe** em `nodeTypes.js:215`, configurável na tela hoje, sem mexer no editor.
Sem essa aresta, mantém o comportamento atual (apaga e encerra).

O `fim()` do laço ganha um flag: `fim({manter:true})` não apaga. Sem isso, tirar
o `delete` do nó não muda nada — o laço apaga três linhas depois.

`POST /chat/conversas/:id/devolver-ia` retoma em `_retomarNo` rodando o motor com
uma mensagem sintética vazia. Guarda necessária: `ia_responde` com texto vazio
monta `messages: []`, a Anthropic recusa e o `catch` devolve a conversa ao humano
num laço. Então **`ia_responde` com mensagem vazia pausa** em vez de chamar a API.

`conversaRepo.encerrar` passa a apagar a execução — hoje `limparEstado` não tem
chamador e o encerramento pelo painel deixaria linha órfã (em memória isso se
curava no restart; em tabela, não).

### 6. Protocolo concorrente — e a causa real

`_gerarProtocolo` faz `COUNT(*)+1` com `protocolo unique`: dois `criar()`
simultâneos colidem. Retry no **23505 filtrado pela constraint do protocolo**
(23505 de outra unique não deve consumir tentativa).

Mas a causa está um nível acima: os 3 webhooks fazem check-then-act
(`porTelefoneCanal` → `criar`) sem unique em `(telefone, canal)` — duas mensagens
simultâneas de um número novo criam **duas conversas**, cada uma com sua execução.
Corrigir só o protocolo faria as duas nascerem com sucesso. Entra
`conversaRepo.obterOuCriar()`, usado pelos 3 webhooks (que hoje duplicam o mesmo
check-then-act), sobre um **índice único parcial** `(telefone, canal) WHERE status
<> 'encerrada'`.

### 7. Migrations bloqueando readiness

`/health` (liveness) segue respondendo sempre. Novo `/health/ready`: 503 enquanto
as migrations não terminam, 503 permanente se falharem.

Detalhe que faz diferença: a rota tem de ser registrada **antes** do bloco
estático — o catch-all `app.get('*')` casa `/health/ready`, a condição
`!req.path.startsWith('/health')` é falsa e **nada é respondido** (a requisição
pendura, e o healthcheck estoura em timeout em vez de 503).

`HEALTHCHECK` do Dockerfile passa a apontar para `/health/ready` com
`--start-period` folgado, senão migration lenta reprova o deploy.

### 8. Graceful shutdown

`SIGTERM`/`SIGINT`: marca não-pronto (o balanceador para de rotear), **derruba os
clientes SSE** (senão `server.close()` nunca resolve — o ping de 25 s mantém o
socket vivo), espera a fila por conversa drenar com teto de **8 s** (`docker stop`
manda SIGKILL em 10 s), fecha o pool do Knex e sai. `filaConversa` precisa ser
exportada do motor — hoje é privada.

## Tetos assumidos (explícitos, com `ponytail:` no código)

- **Concorrência entre processos** não é resolvida: `filaPorChave` serializa
  dentro de um processo. Multi-worker exige lock distribuído (Redis) por conversa.
- **Morte no meio do turno perde o gatilho**: a mensagem já foi persistida e
  deduplicada por `external_id`, então a reentrega da Evolution é descartada e o
  motor nunca roda para ela. Estado persistido, gatilho perdido. A varredura de
  boot que fecha isso é o **Inbox da FASE 4** (§125), não desta fase.
- **PII no blob**: o `estado` carrega CPF, contratos do SGP, PIX copia-e-cola e
  até 50 mensagens de histórico da IA. Passa a viver em tabela sem retenção nem
  redaction. É o mesmo banco que já guarda telefone e texto cru das mensagens, mas
  merece política de retenção — §116, **FASE 3/12**.
- **`motorLoop.js`/`motorSimulador.js`** são espelhos dormentes do laço. Os
  `await` desta fase **não** entram lá; o comentário "espelho byte-a-byte" passa a
  ser falso e é corrigido no arquivo. Religar o espelho não é escopo daqui.

## Critérios de aceite (§14)

- [ ] restart não reinicia conversa em andamento
- [ ] deploy não perde contexto
- [ ] duas mensagens simultâneas não causam salto de nó
- [ ] conversa vai para humano e volta ao fluxo
- [ ] nova versão do fluxo não altera execução já iniciada
- [ ] estado inspecionável no banco
- [ ] testes de integração cobrem persistência e retomada
