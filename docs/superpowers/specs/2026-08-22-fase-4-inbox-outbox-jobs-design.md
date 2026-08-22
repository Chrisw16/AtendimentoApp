# FASE 4 — Inbox, Outbox e Jobs

Referência: [Plano Mestre PARTE XVI (§125–133) e PARTE XXI/FASE 4](../../ers/GoCHAT_Plano_Evolucao_V1_Completo.md).

> **Design v2.** A v1 foi revisada por três agentes — um decisor, um contra o plano,
> um contra o código — e **mudou de forma**. O que segue já é o desenho corrigido;
> a seção final registra o que caiu e por quê, porque dois dos erros eram meus e
> valem mais registrados que apagados.

## O problema, em três sintomas que já existem

Os três estão registrados como teto assumido pela FASE 1 — não são hipóteses:

1. **Gatilho perdido.** Se o processo morre no meio do turno, a mensagem já foi
   persistida e deduplicada por `external_id`. A reentrega da Evolution é
   descartada e **o motor nunca roda para ela**.
2. **Estado é durável, envio não.** O `finally` grava o estado e só então envia.
   Morte entre as duas coisas deixa o banco dizendo "aguardando resposta do menu"
   com o cliente **nunca tendo visto o menu**.
3. **`aguardar_tempo` é mentira.** [motorFluxo.js:316](../../../apps/api/src/services/motorFluxo.js#L316)
   avança na hora e loga `(simulado)`. `aguardar_resposta` ignora `timeout` e
   `max_tentativas`.

**Correção da v1:** ela justificava o Inbox dizendo que "um turno de IA de 10 s
segura a resposta do webhook". **É falso.** Os três handlers já fazem
`processarConversa(...).catch(...)` sem `await`
([evolution.js:88](../../../apps/api/src/services/webhooks/evolution.js#L88),
[meta.js:75](../../../apps/api/src/services/webhooks/meta.js#L75),
[telegram.js:87](../../../apps/api/src/services/webhooks/telegram.js#L87)). O 200
só espera inserts. **O ganho do Inbox é durabilidade, não latência** — e o critério
de aceite tem de refletir isso, senão medimos a coisa errada.

## Decisões de arquitetura

### D1 — Jobs em tabela no Postgres, não BullMQ

O plano permite (§127: *"salvo justificativa melhor após avaliação"*).

- **§7.2**: *"Redis não deve ser a única fonte da verdade para o estado de uma
  conversa."* Um job `flow_resume` **é** estado de conversa.
- **O Redis é opcional aqui.** Sem `REDIS_URL`, `sseManager` degrada em silêncio.
  Job que vive só nele desaparece sem ninguém notar.
- **Inbox e Outbox precisam do Postgres de qualquer forma.**

**Ressalva honesta:** o §7.2 lista "jobs" entre os usos legítimos do Redis. Esta
decisão **contraria essa linha** e se apoia na seguinte. Não é leitura seletiva —
é escolha declarada, porque `flow_resume` carrega retomada de conversa, não
trabalho descartável.

### D2 — Outbox é **write-ahead**, não só rede de falha

**A v1 dizia "outbox só na falha". Estava errado e foi derrubado:** morte de
processo **não lança exceção**, então nada seria gravado e o sintoma nº 2
continuaria idêntico depois da fase inteira. O §126 pede persistir *"antes do
envio"* — e é por isso.

O desenho correto mantém a latência sem abrir mão da durabilidade:

```
persiste linha 'pendente'  →  envia INLINE (como hoje)  →  marca 'enviada'
```

O envio continua síncrono no turno; o outbox é um **log de intenção**. Morte
entre persistir e enviar deixa linha `pendente` que o worker recupera. Falha de
transporte marca `falha` com backoff. Não há "todo envio passa pelo worker".

**Ordem por conversa (achado da revisão):** `enviarResposta` engole o erro e o
laço continua ([motorFluxo.js:1027](../../../apps/api/src/services/motorFluxo.js#L1027)),
então uma resposta que falha seguida de outra que passa entregaria **o menu antes
da saudação**. Regra: o worker só envia a linha `pendente` **mais antiga de cada
conversa**; havendo linha pendente anterior, a seguinte não sai inline — vai para
o outbox e espera a vez.

**Descarte silencioso (achado da revisão):** três caminhos retornam sem lançar e
nunca chegariam ao outbox — [canais/index.js:22](../../../apps/api/src/services/canais/index.js#L22)
(sem adapter), [:24](../../../apps/api/src/services/canais/index.js#L24) (sem
método) e [canais/evolution.js:16](../../../apps/api/src/services/canais/evolution.js#L16)
(sem instância). Caso vivo: o motor gera `tipo:'localizacao'` e a Evolution não o
implementa **de propósito**; a mensagem é persistida e broadcastada, a tela diz
enviada e o cliente nunca recebe. O dispatcher passa a devolver
`{despachado:boolean, motivo}` e o outbox marca `nao_suportada` — **visível**, em
vez de silenciosa. Isso não faz a Evolution passar a enviar `localizacao`; só
para de mentir que enviou.

### D3 — Inbox deduplica por **hash do corpo**, não por `external_id`

A v1 propunha `UNIQUE (canal, external_id)`. **Não modela a realidade dos canais:**

- a Meta entrega **N mensagens numa requisição** — `meta.js` itera
  `value.messages[]` e `value.statuses[]` no mesmo `change`;
- `messages.update` da Evolution é um **array** sem id único, e
  `connection.update` **não tem id nenhum** — os dois violariam `NOT NULL`;
- extrair o id na rota exigiria conhecimento de canal duplicado em três lugares
  (`body.data.message.key.id`, `tg-${message_id}` ou `cb-${id}`, `msg.id` dentro
  do laço) — e a spec prometia "os `handle*` não mudam".

Chave: `dedup_hash = sha256(canal || ':' || corpo_cru)`. Reentrega de webhook é
byte-idêntica por definição — é o mesmo payload reenviado. Funciona para lote,
para evento sem id, e **sem a rota conhecer o formato do canal**.

A dedup por `external_id` do `mensagemRepository` **continua**. As duas camadas
protegem coisas diferentes: o hash impede reprocessar o *payload*, a outra impede
gravar a *mensagem*. Remover uma "porque a outra cobre" é como o TOCTOU nasceu.

## Schema (migration 016)

```
inbox
  id              uuid PK
  canal           varchar NOT NULL
  dedup_hash      varchar NOT NULL          -- sha256(canal:corpo_cru)
  payload         jsonb   NOT NULL
  status          varchar NOT NULL          -- pendente|processando|ok|falha
  tentativas      int     NOT NULL DEFAULT 0
  reivindicado_em timestamptz               -- lease; NULL = livre
  recebido_em     timestamptz DEFAULT now()
  processado_em   timestamptz
  ultimo_erro     text
  UNIQUE (dedup_hash)

outbox
  id                    uuid PK
  conversa_id           uuid REFERENCES conversas(id) ON DELETE CASCADE
  canal                 varchar NOT NULL
  payload               jsonb   NOT NULL
  status                varchar NOT NULL     -- pendente|enviada|falha|expirada|nao_suportada
  tentativas            int     NOT NULL DEFAULT 0
  proxima_tentativa_em  timestamptz NOT NULL DEFAULT now()
  expira_em             timestamptz NOT NULL
  external_id           varchar              -- id devolvido pelo provedor (§126)
  reivindicado_em       timestamptz
  ultimo_erro           text
  criado_em             timestamptz DEFAULT now()

jobs
  id              uuid PK
  tipo            varchar NOT NULL           -- flow_resume | wait_timeout
  chave           varchar UNIQUE             -- 'conversa:no' — impede job duplicado
  payload         jsonb   NOT NULL
  executar_em     timestamptz NOT NULL
  status          varchar NOT NULL
  tentativas      int     NOT NULL DEFAULT 0
  reivindicado_em timestamptz
  ultimo_erro     text
  criado_em       timestamptz DEFAULT now()
```

Índices: `inbox(status, recebido_em)`, `outbox(status, proxima_tentativa_em)`,
`outbox(conversa_id, criado_em)` (ordem por conversa), `jobs(status, executar_em)`.

**Política de expiração (§ FASE 4, item 9):** `expira_em = criado_em + 6 h` como
padrão global, e **24 h** no canal Meta, casando com a janela de sessão dela.
Mensagem de atendimento entregue horas depois é pior que não entregue.

## Reivindicação, lease e recuperação

`FOR UPDATE SKIP LOCKED` protege contra ticks sobrepostos — **não contra
SIGKILL**. Linha marcada `processando` cujo worker morreu ficaria presa para
sempre, que é o sintoma nº 1 de volta com outro nome.

Por isso `reivindicado_em`: o *reclaim* devolve a `pendente` o que passou do lease
(2 min). E aqui há um teto que precisa ser dito:

> **Reprocessar uma entrada do inbox re-executa o turno do motor.** Se a morte
> ocorreu depois de `criar_chamado` e antes do commit final, o retry **abre um
> segundo chamado no SGP** — o §23 proíbe exatamente isso.
>
> Nesta fase, o reclaim **não retenta automaticamente**: vai direto para
> `falha` com `ultimo_erro='lease expirado'`, para decisão humana. Retry
> automático de escrita exige chave de idempotência nas tools, que é trabalho do
> Tool Registry (§23) e **não está feito** — a FASE 2 entregou registry mínimo,
> sem `idempotency_strategy`, de propósito.

Leitura pode retentar livre (§130); escrita, não. Essa distinção vira o módulo
puro `politicaRetry.js`, que é o "retry central" que o §130 pede — a v1 tinha
backoff espalhado por tabela e chamava isso de central.

## `aguardar_tempo` — e as três armadilhas do motor

O nó passa a **parar** e agendar `flow_resume`. Três coisas que a v1 não viu:

**1. `aguardando` não distingue timer de cliente.** O único mecanismo de retomada
é `estado.aguardando === no.id` ([motorFluxo.js:230](../../../apps/api/src/services/motorFluxo.js#L230),
`:251`, `:278`). Se o nó de timer usar o mesmo campo, a mensagem do cliente
durante a espera é consumida como se fosse o timer. Se não usar, o cliente que
fala reentra no nó e **agenda um segundo job**.

Campo separado: `estado.aguardandoTimer = no.id`. O nó, ao ser reentrado:
- mensagem com `tipo:'timer'` e `aguardandoTimer === no.id` → limpa e avança por `saida`;
- qualquer outra mensagem com `aguardandoTimer` setado → **não reagenda**, segue parado.

**2. O TTL de 2 h mata a espera longa.** Decidido pelo agente decisor: o
`estadoStore` passa a respeitar `_parkedAte`, com **teto duro de 72 h** para o
caso de blob imortal (o store não tem reaper — está declarado como `ponytail:`).
A decisão em `expirou(atualizadoEm, estado, agora)`, função **pura**, testável sem
Postgres. O handler do job **limpa `_parkedAte`** ao retomar, senão o TTL normal
nunca volta a valer.

**3. Mensagem fabricada quebra o `ia_responde`.** `{tipo:'sistema'}` faz o nó
pausar ([motorFluxo.js:677](../../../apps/api/src/services/motorFluxo.js#L677));
`{tipo:'texto', texto:''}` esvazia `messages` e a Anthropic recusa. Daí o tipo
próprio **`'timer'`**.

> **Teto declarado:** `aguardar_tempo → ia_responde` **não é suportado nesta
> fase**. A IA falar sozinha após um timer é geração proativa sem turno do
> cliente — feature do AI Runtime (FASE 9), não consequência de um job. O
> `ia_responde` trata `'timer'` como trata `'sistema'`: pausa. `aguardar_tempo →
> enviar_texto`, que é o follow-up comum, funciona.

## `aguardar_resposta` com timeout

Agenda `wait_timeout` em `now() + cfg.timeout`.

A v1 dizia "se o cliente respondeu, o job vira no-op". **Metade certa, e a outra
metade é corrupção:** se o cliente **não** respondeu, `aguardando` continua setado
e o job sintético cai em [motorFluxo.js:278](../../../apps/api/src/services/motorFluxo.js#L278),
que grava `contexto[variavel] = ''` e avança pela `saida` — **a resposta vazia
vira a resposta do cliente**.

Correto: o job carrega `tipo:'timer'`, e `aguardar_resposta` checa o tipo antes
de consumir. Timer com `aguardando === no.id` → incrementa tentativas e sai pela
porta **`timeout`** (§129 pede porta específica), ou por `max_tentativas` quando
estoura `cfg.max_tentativas` — que o sintoma nº 3 lista como quebrado e a v1
esqueceu de reparar. Cliente respondeu antes → `aguardando` já limpo → no-op.

## Sandbox

Todo efeito colateral do motor é gateado por `if (!ctx.sandbox)`
([motorFluxo.js:590](../../../apps/api/src/services/motorFluxo.js#L590), `:621`,
`:638`, `:652`). **O agendamento precisa do mesmo gate** — a v1 não mencionava.
Sem ele, `aguardar_tempo` no botão "Testar fluxo" gravaria
`jobs.payload.conversa_id = 'sandbox:<uuid>'`, que não é uuid; o `estadoStore`
tem guarda de UUID exatamente por isso, o `jobs` não teria.

No sandbox, `aguardar_tempo` mantém o comportamento atual (avança na hora): a tela
de teste precisa de resultado imediato, não de espera real.

## Worker

Um `setInterval` no idioma dos monitores existentes (`filaService`,
`supervisoraIA`). Cada tick: reclaim de leases vencidos → entradas → saídas →
timers.

**Chama `processarConversaInterno`, nunca `processarConversa`** — a mesma regra
que `retomarAutomacao` já segue ([motorFluxo.js:170](../../../apps/api/src/services/motorFluxo.js#L170)):
chamar a versão externa de dentro de uma tarefa da mesma chave enfileira atrás de
si mesma.

**Shutdown (achado da revisão):** hoje `server.js` drena só `filaConversa` e chama
`process.exit(0)`. O worker precisa entrar nesse dreno — parar de reivindicar no
SIGTERM e devolver a `pendente` o lote que reivindicou e não processou. Sem isso,
todo deploy cria linhas presas que só o reclaim de 2 min resolve.

**Auditoria (§119, DoD §153):** falha que vai para DLQ grava no `audit_log` com
`actor_type='system'` — a FASE 3 já criou o mecanismo e não custa nada usar.

## Reprocessamento de DLQ (§132)

O §132 pede *"inspeção/reprocessamento"*. A v1 entregava só inspeção.

`POST /api/jobs/:tabela/:id/reprocessar` (admin), que devolve a linha a
`pendente` e zera `tentativas`. Auditado. É o mínimo que torna a DLQ operável sem
`UPDATE` manual em produção.

## Critérios de aceite

A v1 não tinha esta seção — e o §153 exige *"critérios de aceite validados"*.

- [ ] Webhook responde 200 tendo apenas persistido; o `handle*` roda no worker.
- [ ] Reentrega byte-idêntica de um payload não produz segundo processamento.
- [ ] Entrega da Meta com 3 mensagens num único POST processa as 3.
- [ ] `connection.update` (sem id) entra no inbox sem violar constraint.
- [ ] Matar o processo entre persistir e enviar deixa linha `pendente` que o worker entrega.
- [ ] Resposta 1 falhando não deixa a resposta 2 chegar antes dela.
- [ ] `tipo` não suportado pelo canal termina em `nao_suportada`, não em silêncio.
- [ ] `aguardar_tempo` de 5 s realmente espera 5 s e retoma pela porta `saida`.
- [ ] Execução parada com `_parkedAte` futuro sobrevive a 4 h; sem ele, expira em 2 h.
- [ ] Cliente que escreve durante `aguardar_tempo` não agenda segundo job.
- [ ] `aguardar_resposta` que estoura o timeout sai pela porta `timeout` e **não** grava resposta vazia.
- [ ] Lease vencido volta para `pendente` (leitura) ou `falha` (escrita), nunca fica preso.
- [ ] Sandbox não escreve linha em `inbox`, `outbox` ou `jobs`.
- [ ] SIGTERM devolve o lote reivindicado antes de sair.

## Fora desta fase, com motivo

- **Circuit breaker (§131)** — não está na lista de trabalhos da FASE 4; a
  FASE 13 traz *"circuit breaker quando necessário"*. Verificado.
- **Modo degradado (§133)** — exceto o bullet *"canal de saída fora → Outbox
  retenta quando apropriado"*, que **é** desta fase e está coberto por D2.
- **`send_message` e `tool_retry` como tipos de job (§127)** — o envio é
  write-ahead com worker, o que cobre `send_message` sem um tipo próprio;
  `tool_retry` depende de idempotência de tool, que o Tool Registry ainda não
  tem. Registrado, não feito.
- **`sla_check`, `quality_audit`, `conversation_summary`, `knowledge_index`,
  `followup`** — pertencem às fases que os criam. Esta entrega o **mecanismo**.
- **Idempotência de tools de escrita (§23)** — pré-requisito para retry
  automático de inbox. Fica como o teto mais importante desta fase.

## O que a revisão derrubou

| Da v1 | Por que caiu |
|---|---|
| "Outbox só na falha" | morte de processo não lança exceção — não fechava o sintoma que a própria spec abria |
| `UNIQUE (canal, external_id)` | Meta entrega lote; `connection.update` não tem id |
| "webhook lento por causa do turno de IA" | **factualmente errado**: os handlers já são fire-and-forget |
| "job vira no-op se o cliente respondeu" | metade certa; o outro ramo gravava resposta vazia como se fosse do cliente |
| ausência de lease/reclaim | `SKIP LOCKED` não protege contra SIGKILL |
| sem critérios de aceite | §153 os exige |
