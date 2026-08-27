# CLAUDE.md — Maxxi v2 / GoCHAT

Guia operacional para trabalhar neste repositório. Documentação detalhada (memória institucional) fica no **brain** em [brain/](brain/) — comece por [brain/systems/maxxi/overview.md](brain/systems/maxxi/overview.md) (atualizado 2026-08-22) e, para o estado do roadmap, por [brain/work/tasks/2026-08-22_plano-evolucao-status.md](brain/work/tasks/2026-08-22_plano-evolucao-status.md).

Páginas de componente dos subsistemas novos: [knowledge-hub](brain/systems/maxxi/components/knowledge-hub.md), [playbook-engine](brain/systems/maxxi/components/playbook-engine.md), [cliente-360-e-copiloto](brain/systems/maxxi/components/cliente-360-e-copiloto.md), [fila-e-sla](brain/systems/maxxi/components/fila-e-sla.md).

## O que é

**Maxxi v2** (marca **GoCHAT**) é um sistema de **atendimento omnichannel com IA para provedores de internet (ISP)**. Mensagem entra por WhatsApp/Telegram/etc. → vira conversa → um **motor de fluxo** visual executa o atendimento → a **IA (Claude) com tool calling** resolve consultas no **SGP** (ERP de ISP: boleto, conexão, chamado, planos, pré-cadastro) → se precisar, transfere para um **agente humano** com chat em tempo real (SSE).

Decisão estratégica de base do produto: [brain/strategy/decisions/2026-06-30_adotar-maxxi-base.md](brain/strategy/decisions/2026-06-30_adotar-maxxi-base.md). **Multi-tenancy é por instância** (um deploy isolado por provedor revendido), não row-level — o código é **single-tenant** (zero `company_id`) e fortemente acoplado à NetGo Internet (Natal/RN).

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node 20 + Express (ESM, `"type":"module"`) |
| Banco | PostgreSQL 16 + Knex (migrations próprias) |
| Realtime | SSE (+ Redis pub/sub opcional) |
| IA | Anthropic Claude (`@anthropic-ai/sdk`, modelo `claude-haiku-4-5-20251001`) |
| Frontend | React 19 + Vite + React Router 6 |
| Estado FE | TanStack Query (server) + Zustand (auth/chat) |
| Editor de fluxo | `@xyflow/react` v12 |
| Auth | JWT (30 dias) + bcrypt |

## Layout

```
apps/api/src/
  server.js              entrypoint (monta rotas /api/*, serve o frontend, inicia migrations+monitores)
  config/db.js           pool Knex (singleton via getDb()/db proxy)
  middlewares/           auth.js (JWT, adminMiddleware), errorHandler.js (asyncHandler, HttpError)
  migrations/versions/   001..028 — modelo de dados (rode em ordem; NUNCA ALTER TABLE solto)
  repositories/          conversaRepository.js, mensagemRepository.js (toda query de conversa/msg)
  routes/                auth, chat, webhooks (públicas) + agentes, fluxos, prompts, dashboard, filas, ... (autenticadas)
  services/
    motorFluxo.js        ★ motor de execução do fluxo (1032 LOC) — o coração
    fluxoHelpers.js      funções puras do motor (normaliza campos editor↔motor, escala NPS) + testes
    integrations.js      ★ SGP (URA/precadastro) + Evolution + getAnthropicClient
    iaTools.js           15 tools Anthropic (executarTool)
    promptService.js     resolverPrompt(slug) — compõe system prompt do banco
    supervisoraIA.js     sentimento + SLA do agente + sugestões
    filaService.js       ★ fila de atendimento HUMANO: SLA por fila, assunção, capacidade
    filasHelpers.js      ★ puro: horário, faixas de SLA, capacidade, visibilidade + testes
    cliente360.js        ★ compõe a ficha do assinante (FASE 6) — orquestra, não fala HTTP
    sgpHelpers.js        ★ puro: mapeia o payload do SGP (contrato, endereço, serviço, ONU) + testes
    sgpDb.js             ★ leitura SOMENTE-LEITURA no Postgres do SGP: sinal óptico e status da ONU
    mascarar.js          ★ puro: PII mascarada NO SERVIDOR + testes
    permissoes.js        ★ puro: o que cada agente pode ver/fazer + testes
    contextCards.js      ★ puro: os cartões do Cliente 360 + testes
    clientesHelpers.js   ★ puro: busca e vínculo da aba Clientes (histórico) + testes
    knowledge.js         ★ base de conhecimento: busca FTS, workflow, lacunas (FASE 7)
    knowledgeHelpers.js  ★ puro: workflow editorial, validade, corte do trecho + testes
    playbook.js          ★ procedimentos oficiais: injeção no prompt e rastreio (FASE 8)
    playbookHelpers.js   ★ puro: workflow, progresso, bloco do prompt + testes
    iaRuntime.js         ★ puro: hierarquia, anti-alucinação, guardrails, handoff (FASE 9)
    llmGateway.js        ★ o único lugar que fala com o LLM (§76)
    copiloto.js          ★ assistente do ATENDENTE (FASE 10) — sugere, não age
    copilotoHelpers.js   ★ puro: responder/consultar/avançar, sinais, resumo + testes
    quality.js           ★ auditoria de atendimento (FASE 11) — a IA propõe, a conta é nossa
    qualityHelpers.js    ★ puro: score ponderado, teto por violação, aderência, coaching
    analytics.js         ★ camada de LEITURA dos indicadores (FASE 12) — sem event store
    analyticsHelpers.js  ★ puro: taxa/média honestas, resolução efetiva, custo + testes
    telemetria.js        ★ tool e LLM: latência, erro e TOKENS (custo)
    log.js               ★ logs estruturados + correlation ID (AsyncLocalStorage)
    erros.js             ★ error tracking local, dedup por assinatura
    disjuntor.js         ★ puro: circuit breaker (existe UM, no SGP) + testes
    saude.js             ★ dependências e o veredito de uma frase
    inbox.js outbox.js jobs.js  ★ filas da FASE 4 (entrada durável, envio write-ahead, relógio)
    filaDb.js            reivindicação com SKIP LOCKED + lease (as 3 filas usam)
    politicaRetry.js     ★ puro: TTL/_parkedAte, backoff, expiração, destino de lease + testes
    workerFilas.js       tick de 5s: reclaim → inbox → outbox → jobs → purga
    sseManager.js        broadcast/sendToAgente
    telegram.js          envio Telegram
    canais/              ★ adapters de ENVIO por canal (evolution.js, telegram.js) + dispatcher
    webhooks/            evolution.js, meta.js, telegram.js (entrada das mensagens)
                         metaSeguranca.js — handshake/assinatura da Meta (puro, testável)
  dadosIniciais.js       ★ catálogos das FASES 5-9 (filas, categorias, playbooks, perfis)
  conhecimentoInicial.js ★ carga inicial da base (55 artigos) — conteúdo DO OPERADOR
  seed.js                admin/admin123, agente01/agente123, canais, fluxo padrão
apps/web/src/
  pages/ components/ hooks/useChat.js store/ lib/api.js lib/nodeTypes.js styles/tokens.css
```

## Como rodar

**Dev (docker-compose):**
```bash
docker-compose up -d            # postgres:5432, redis:6379, api:4000, web:3000
docker-compose exec api npm run seed   # migrations + dados iniciais
# Front http://localhost:3000  ·  API http://localhost:4000  ·  /health sempre responde
```

**Dev (sem Docker):** precisa Postgres 16 + Redis 7 + Node 20. Em `apps/api`: `cp .env.example .env`, `npm install`, `npm run seed`, `npm run dev`. Em `apps/web`: `npm install`, `npm run dev`.

**Testes:** `cd apps/api && npm test` (runner nativo `node --test`, zero deps) — **495 testes puros**, rodam em qualquer máquina sem serviço nenhum. `motorFluxo.js` **não é importável em teste** (puxa `config/db.js` → Knex no topo e as deps não ficam instaladas localmente); por isso toda lógica testável vive em **módulos puros** ao lado dele — escreva o teste primeiro (TDD):
- `fluxoHelpers.js` — resolução de campos editor↔motor + escala NPS.
- `disjuntor.js` — **o circuit breaker da FASE 13**: quando abre, quando meio-abre, e por que 4xx **não** conta como falha.
- `analyticsHelpers.js` — **as contas do Analytics da FASE 12**: taxa que devolve `null` sem base, média que descarta ausente em vez de tratar como zero, resolução aparente × efetiva e custo de tokens.
- `qualityHelpers.js` — **a aritmética da Quality AI da FASE 11**: score ponderado, teto por violação crítica, aderência ao playbook com exceção justificada, revisão humana e coaching por padrão. Errar aqui não estoura — vira injustiça silenciosa numa avaliação de gente.
- `copilotoHelpers.js` — **o miolo do Copiloto da FASE 10**: a decisão responder/consultar/avançar (§79), os sinais de comercial e suporte, e o resumo vivo.
- `iaRuntime.js` — **as regras do AI Runtime da FASE 9**: motivos de transferência estruturados, os três blocos de prompt (hierarquia/anti-alucinação/guardrails), contexto estruturado e a montagem do handoff.
- `playbookHelpers.js` — **o Playbook Engine da FASE 8**: workflow (`rascunho→teste→publicado`), qual etapa uma tool cumpre, progresso e a montagem do bloco que vai ao prompt.
- `knowledgeHelpers.js` — **o workflow editorial da FASE 7** (máquina de estados), validade e corte do trecho enviado à IA. A normalização de texto NÃO está aqui: é do Postgres, para ser idêntica à do índice.
- `mascarar.js` / `permissoes.js` / `contextCards.js` — **as decisões da FASE 6**: o que é mascarado, quem pode ver e quais cartões o painel mostra.
- `filasHelpers.js` — **as decisões das filas da FASE 5** (§FASE 5): `dentroDoHorario` (fila ou global), `nivelUrgencia` (SLA por fila), `podeAssumir` (capacidade) e `conversaVisivel` (quem enxerga o quê).
- `politicaRetry.js` — **as decisões de tempo da FASE 4** num lugar só (§130): `expirou()` (TTL de 2 h, `_parkedAte`, teto de 72 h), backoff, `expiraEm` por canal, e `destinoLease` — a regra "leitura retenta, escrita não" (§23) mora aqui.
- `fluxoValidador.js` (+`.cli.js`) — **validador estático** do grafo do fluxo: pega beco sem saída (cliente perdido), porta não conectada, nó inalcançável, aresta órfã, loop sem espera (trava). `node src/services/fluxoValidador.cli.js examples/fluxo-exemplo.json`.
- `motorLoop.js` — o loop do motor extraído como função pura (`executarLoop`). ⚠️ **Divergiu na FASE 1**: o laço real virou assíncrono na persistência (`await estados.set/delete` num `finally`, grafo congelado, `fim({manter})`). Este arquivo — e o `motorSimulador.js` que roda sobre ele — espelham o laço **pré-FASE-1**. "Espelho byte-a-byte" hoje vale só para a travessia (qual nó vem depois), não para o ciclo de vida da execução.
- `motorSimulador.js` (+`.cli.js`) — **simulador** de conversa multi-turno sobre o `executarLoop` (passo a passo, detecta concluido/travado/perdido/aguardando). `node src/services/motorSimulador.cli.js <fluxo.json> [cenario.json]`.

**Testes de integração** (`apps/api/tests/integracao/`, `npm run test:integracao`) — **278 testes**, provam o que só o banco/Redis provam: dedup por `external_id`, SSE cruzando instâncias, migrations replay-safe, os **critérios de aceite do motor persistente** (§14), os **14 critérios da FASE 4** (`fase4-filas.test.js`) os **critérios da FASE 5** (`fase5-filas-atendimento.test.js`: claim atômico de duas assunções simultâneas, supervisor tomando conversa, Flow Execution sobrevivendo à troca de fila) e os da **FASE 6** (`fase6-cliente360.test.js`: PII mascarada no payload, SGP fora do ar não derruba o painel, histórico não vaza entre clientes sem telefone). É o único lugar onde o `motorFluxo.js` roda de verdade num teste (`DATABASE_URL` está posta, então ele importa). **Não há Docker nesta máquina**; o Postgres é nativo (`brew install postgresql@16`). Eles se **pulam** sem as envs, então `npm test` segue verde em qualquer lugar:
```bash
DATABASE_URL_TEST='postgres://maxxi:maxxi_dev_pass@127.0.0.1:5432/maxxi_v2_test' \
REDIS_URL_TEST='redis://127.0.0.1:6380' npm run test:integracao
```
⚠️ O banco de teste é **truncado** a cada rodada — aponte só para um descartável. Detalhe em [brain/work/tasks/2026-08-21_fase-0-baseline.md](brain/work/tasks/2026-08-21_fase-0-baseline.md).

**Testar fluxo no app** (tela Fluxos → botão "Testar fluxo" → `TesteFluxoModal`): `POST /fluxos/:id/validar` (relatório estático), `/simular` (roteirizado) e `/simular-real` (roda o motor de verdade com SGP+IA em **modo sandbox** — `processarConversa(c,msg,{fluxo,estados,enviar,sandbox})`; em sandbox, reads são reais mas tudo que grava é simulado, inclusive as tools de IA via gate no `executarTool`). **Link público de teste** `/teste/<token>` (rota pública `chat-teste`, sem login, sandbox, revogável; coluna `fluxos.share_token`).

Detalhe em [brain/systems/maxxi/components/testes-de-fluxo.md](brain/systems/maxxi/components/testes-de-fluxo.md). Próximos passos abertos (memória/janela da IA, pré-cadastro real) em [brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md](brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md).

**Saúde e shutdown:** `/api/*` inteiro devolve **503 enquanto o app não está pronto** — sem isso, um webhook que chega antes das migrations pega `42P01` e a mensagem do cliente se perde num 500. `/health` é **liveness** (responde sempre, `2.0.0` fixo — não serve como sonda de deploy). `/health/ready` é **readiness**: 503 até as migrations terminarem e 503 **permanente** se falharem — é para onde o `HEALTHCHECK` do Dockerfile aponta. Ela é registrada **antes** do bloco de frontend estático de propósito: o catch-all `app.get('*')` casaria a rota e a requisição **penduraria** em vez de dar 503. `SIGTERM`/`SIGINT` saem do balanceador, derrubam os clientes SSE (senão `server.close()` nunca resolve — o ping de 25 s segura o socket), drenam a fila de turnos com teto de 8 s (`docker stop` manda SIGKILL aos 10 s) e fecham o pool.

**Produção (Coolify):** o **Dockerfile raiz** é multi-stage — builda `apps/web` e copia `dist` para `apps/api/apps/web/dist`; a API serve frontend + API no **mesmo container** (porta 4000). Migrations rodam em background no boot. Runbook: [brain/systems/maxxi/runbooks/](brain/systems/maxxi/runbooks/). Webhook Evolution de produção: `https://gochat.netgo.net.br/api/webhooks/evolution`.

## Convenções e regras (não-óbvias — leia antes de mexer)

- **`JWT_SECRET` é obrigatória em produção.** Não existe mais fallback fixo no código (havia um, versionado no repo). Sem a env: em `NODE_ENV=production` o boot **falha**; fora disso, gera um segredo **aleatório por boot** (sessões caem no restart). Ver `middlewares/auth.js` → `resolverSegredo`.
- **As faixas do NPS têm fonte única:** `agregarNps`/`avaliarNps` em `fluxoHelpers.js`. O dashboard **não** classifica em SQL (era assim, e divergia do motor). `satisfacao.escala` (migration 009) guarda a escala de cada resposta; linhas antigas = 10.
- **Credenciais de integração vivem no BANCO (`sistema_kv`), não em env.** SGP, Evolution, Anthropic, OpenAI, Telegram são configurados pela tela admin (**Configurações** / **Canais**) e gravados em `sistema_kv`. Só **infra** vem de env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `META_VERIFY_TOKEN`, `ERP_URL`/`ERP_API_KEY` — mais as da FASE 3: `KV_SECRET` (cripto em repouso), `META_APP_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, `EVOLUTION_WEBHOOK_TOKEN` (assinatura de webhook).
  - **Segredo nunca volta pelo GET** (FASE 3, §117): `CHAVES_SECRETAS` em `services/kvSeguro.js` lista as 6 credenciais reais; `GET /sysconfig` e `GET /sysconfig/:chave` devolvem `••••••••1234`. **O PUT ignora valor que contém `•`** — a tela manda o form inteiro a cada save, então sem isso salvar sem tocar no campo trocaria a credencial por uma máscara, e a tela seguiria mostrando máscara depois (o estrago só apareceria num 403 do SGP).
  - **Cripto em repouso é OPORTUNISTA.** Com `KV_SECRET` no ambiente, credencial re-salva pela tela grava `enc:v1:...`; sem ela, grava em texto plano como sempre. Não há migration que cifre nada — de propósito: exigiria a env já setada no deploy, e sem ela as credenciais de produção ficariam ilegíveis. Ativação é gradual: setar a env e re-salvar. **Leia sempre por `lerValorKV`**, que decifra ANTES de parsear (o `try { JSON.parse } catch { cru }` antigo fazia o ciphertext virar "o valor"). A coluna é `jsonb`, então o ciphertext vai serializado — `enc:v1:` cru não é JSON válido. Muitas vars do `.env.example` (IMAP/SMTP/ASTERISK/VAPID/META_ACCESS_TOKEN) **não são lidas pelo código** — são aspiracionais.
- **Migrations:** cada mudança de schema é um arquivo novo em `apps/api/src/migrations/versions/NNN_nome.js` com `up(db)`/`down(db)`. Runner próprio (tabela `_migrations`, transacional, ordenado por nome). Nunca rode `ALTER TABLE` direto. **Escreva idempotente** (`hasColumn`/`IF NOT EXISTS`) — o rastreamento é **por nome de arquivo**, então renomear uma migration já aplicada faz ela rodar de novo. ✅ **As 28 são replay-safe, e há teste travando isso** (`tests/integracao/migrations-replay.test.js`). `001` e `002` não eram — usavam `createTableIfNotExists`, deprecado no knex, que emite o `CREATE TABLE IF NOT EXISTS` mas dispara `ADD CONSTRAINT`/`CREATE INDEX` incondicionalmente; corrigidas em 2026-08-21 com um helper local `criarTabela()` + guarda `hasTable`. **Nunca use `createTableIfNotExists`** — migration que falha no boot pula os monitores de SLA e da supervisora. A sequência tem um buraco no **010** de propósito: 011/012/013 foram renumeradas na reconciliação de 2026-08-21 e as originais (008/009/010) já constam no `_migrations` de produção.
- **Estado do fluxo é PERSISTENTE** (`flow_executions`, migration 014 — FASE 1, 2026-08-21). `estadoStore.js` tem a cara de um `Map` (`get/set/delete`) mas é assíncrono e grava no banco; o sandbox continua injetando um `Map` puro por `opts.estados`, e `await` sobre valor síncrono é idêntico — **um só caminho de código**. Regras não-óbvias:
  - Uma linha por conversa **viva**; some quando a execução acaba. Por isso o **grafo do fluxo mora dentro do blob** (`estado._grafo`, congelado ao nascer): fixa a versão E impede que ativar outro fluxo sequestre conversa em andamento. `opts.fluxo` tem **precedência absoluta** (é o que faz "Testar fluxo" exercitar o rascunho).
  - A gravação é **uma só, num `finally` no fim do turno**. Não volte a gravar só no `aguardar_input`: tudo que a travessia acumula (ficha do SGP, contadores da IA, `salvar_dado`) se perderia num crash antes da pausa.
  - O guard de sandbox é **`opts.sandbox`**, nunca `opts.estados` — era a presença de `estados` que desligava o `filaPorChave`; injetar um store ali mata a serialização em silêncio e a race de 2026-08-21 volta.
  - `transferir_agente` **não apaga mais o estado**: grava `_retomarNo` (destino da porta `transferido`) e o `devolver-ia` retoma dali. Sem essa porta ligada no fluxo, encerra como sempre encerrou.
  - **TTL de 2 h aplicado na leitura.** Enquanto o estado era um `Map`, o restart era a expiração de fato. Sem TTL, cliente que abandona o menu e volta semanas depois tem o "bom dia" lido como resposta ao menu antigo, e cai no 3º fallback do `encontrarProximo` (primeira aresta qualquer).
  - Inspeção: `SELECT conversa_id, estado->>'noAtual' FROM flow_executions`.
  - ~~⚠️ Estado é durável, envio não~~ → **fechado na FASE 4**: `enviarResposta` grava a intenção no `outbox` antes de despachar, e o worker entrega o que ficou `pendente`.
  - ⚠️ **Teto:** concorrência **entre processos** não é resolvida. `filaPorChave` serializa dentro de um processo; multi-worker exige lock distribuído por conversa.
- **Entrada, saída e relógio passam por FILA NO BANCO** (`inbox`/`outbox`/`jobs`, migration 016 — FASE 4). Regras não-óbvias:
  - **O webhook só PERSISTE**: `routes/webhooks.js` grava o payload cru no `inbox` (após checar assinatura) e responde 200; o `handle*` roda no worker. A dedup é `sha256(canal:corpo_cru)`, **não** `external_id` — a Meta manda N mensagens num POST e `connection.update` não tem id. A dedup por `external_id` do `mensagemRepository` **continua**: uma impede reprocessar o payload, a outra impede gravar a mensagem.
  - **Latência não mudou**: `inbox.receber` cutuca `processarPendentes()` sem `await`. O tick de 5 s do `workerFilas` é rede de segurança, não o caminho normal.
  - **Os `handle*` agora esperam o motor** (`await processarConversa`) — é isso que faz a entrada só virar `ok` depois do turno. Eles aceitam `{reprocessando}`: sem essa flag o replay é **no-op**, porque todo caminho de dedup aborta antes do motor. Quem passa `true` é o worker quando `tentativas > 1`.
  - **Outbox é write-ahead**: grava a linha → **reivindica** → envia inline (mesma latência) → marca `enviada`. Nunca volte a "gravar só quando o envio falhar": morte de processo **não lança exceção**, que é o sintoma inteiro. E **o envio inline precisa reivindicar**: sem isso o tick que cai durante o POST ao provedor pega a mesma linha e entrega a mensagem **duas vezes** (as duas terminam em `enviada`, então o banco não denuncia). Quem recupera a linha do processo morto é o reclaim de lease, não o tick seguinte.
  - **Entrega é at-least-once.** Crash entre o envio bem-sucedido e o `UPDATE ... 'enviada'` faz o worker reenviar. Não há chave de idempotência de envio — quando houver (§23), é aqui que entra.
  - **Não-entrega marca a MENSAGEM, não só a fila.** `enviarResposta` persiste e faz broadcast **antes** de despachar; sem `mensagens.meta.entrega`, a tela do agente diria "enviada" para o que a Evolution descartou.
  - **Ordem por conversa**: só sai inline quem é a saída viva mais antiga da conversa; havendo anterior em `pendente`/`processando`, a próxima espera o worker. Sem isso, uma resposta que falha seguida de outra que passa entrega **o menu antes da saudação**.
  - **`tentativas` conta na REIVINDICAÇÃO**, não na falha (SIGKILL não passa pelo `catch`). Reclaim de lease (2 min) devolve outbox para `pendente` e inbox/jobs para **`falha`** — reprocessar turno é escrita, e escrita não retenta sozinha (§23). **O dreno do SIGTERM usa a mesma política** (`destinoLease`): devolver tudo a `pendente` re-executaria no próximo boot um turno que pode ter aberto chamado no SGP.
  - **O lote de cada fila roda em PARALELO** (`Promise.all`): são conversas distintas, e a serialização por conversa já existe rio abaixo (`filaPorChave`). Sequencial, uma rajada de 10 webhooks faria o 10º cliente esperar 9 turnos de IA.
  - **`estado.aguardandoTimer` é separado de `estado.aguardando`.** `aguardando` é o único mecanismo de retomada do motor e não distingue quem acordou o fluxo. A mensagem sintética do timer tem `tipo:'timer'` (nem `'sistema'`, que faz o `ia_responde` pausar por outro motivo, nem `'texto'` vazio, que a Anthropic recusa). `limparEspera()` zera `_parkedAte` — sem isso o TTL de 2 h nunca volta a valer.
  - **Só o motor passa pelo outbox.** `chat.js` (agente humano digitando) envia direto; a durabilidade e a ordem valem para o que a automação manda.
  - **Purga: 7 dias para o que deu certo, 30 para a DLQ.** `inbox.payload` é o webhook CRU (telefone, texto do cliente) — DLQ eterna é PII eterna. A listagem de `/api/filas/:tabela` **omite `payload`**; ele só sai em `/api/filas/:tabela/:id` (admin, auditado).
  - Inspeção: `SELECT status, count(*) FROM inbox GROUP BY 1` (idem outbox/jobs), ou `GET /api/filas`.
- **Atendimento humano passa por FILA DE GENTE** (`filas`/`agentes_filas`, migration 017 — FASE 5). Regras não-óbvias:
  - **`/api/atendimento`, não `/api/filas`** — aquela é a de mensageria (FASE 4). Nomes iguais, domínios opostos.
  - **"Equipe" e "fila" são a MESMA tabela.** O plano pedia as duas; um provedor com 6 agentes não tem equipe que não seja fila, e a indireção não respondia pergunta nenhuma do produto. Quem precisar põe `equipe_id` em `filas` depois.
  - **Agente sem fila nenhuma vê TUDO** (`filasHelpers.conversaVisivel`). É o que faz a migration não esvaziar a tela de todo mundo até alguém montar as filas. Mesma lógica no `assumir-proximo`: sem fila escolhida, ele puxa das filas do agente **e** das conversas sem fila.
  - **`agentes.capacidade = 0` é ILIMITADO**, e é o default da coluna — default 5 faria a migration passar a recusar assunção para quem nunca configurou nada.
  - **Fila apagada não leva a conversa** (`ON DELETE SET NULL`): a conversa volta a ser "sem fila", visível para todos.
  - **`filas.horario` null herda o global (`sistema_kv.horario`); `{ativo:false}` NÃO.** `null` = sem configuração, `{ativo:false}` = "esta fila não fecha". Por isso o motor usa `??` e não `||`.
  - **Transferir para FILA ≠ transferir para AGENTE.** Para a fila zera `agente_id`, volta a `aguardando` e **reinicia** `aguardando_desde` — herdar o relógio faria o SLA da fila nova nascer estourado.
  - **`assumir` é UPDATE CONDICIONAL.** Era incondicional: dois agentes clicando na mesma conversa ficavam os dois lá dentro. Quem pode tomar conversa alheia é o admin e o **supervisor da fila dela** (`agentes_filas.supervisor`) — é o que dá função à flag. A regra mora em `filaService.assumirConversa`, não na rota, para ser testável contra Postgres.
  - **`assumirProxima` usa `FOR UPDATE SKIP LOCKED`** (mesmo padrão do `filaDb.js`): dois cliques simultâneos entregam conversas **diferentes**.
  - **O nó `transferir_agente` grava o SLUG em `cfg.fila`** — por isso o slug não é editável depois de criado. Slug inexistente não engole a transferência: enfileira sem fila e loga. A porta `sem_agente` seguiu FORA de propósito (o horário por fila cobre o caso real, e porta estática nova acusaria erro em todo fluxo existente).
  - Inspeção: `SELECT f.nome, count(*) FROM conversas c JOIN filas f ON f.id=c.fila_id WHERE c.status='aguardando' GROUP BY 1`, ou `GET /api/atendimento/filas`.
- **O painel do assinante (Cliente 360) NÃO tem integração própria** (FASE 6). Regras não-óbvias:
  - **Mascarar é NÃO ENVIAR.** `mascarar.js` roda no servidor, na borda da API. Esconder no CSS ou num `slice()` do React deixa o CPF inteiro chegar ao navegador, ao DevTools e a qualquer print — a tela mente, o payload não. `mascararPII` **não desce em aninhado** de propósito: recursivo esconderia campos que ninguém revisou e daria falsa cobertura.
  - **`agentes.permissoes` finalmente decide algo** (`services/permissoes.js`). Ele existe desde a 001 e **nada nunca leu** — o admin marcava caixas e todo mundo seguia podendo tudo. Permissões antigas valem **por omissão** (negar tudo trancaria todo agente já cadastrado no primeiro deploy); só `ver_dados_completos` é **negada por omissão**, porque é capacidade nova. Capacidade **desconhecida NEGA** — typo fecha a porta. Há **teste de contrato** entre `PERMISSOES_LABELS` (tela de Agentes) e `CAPACIDADES` (backend).
  - **Toda ação passa por `executarTool`**, nunca por chamada direta ao SGP — é a regra do plano ("não criar integrações paralelas"). Cada ação declara uma **allowlist `campos`**: repassar `req.body` inteiro deixava o cliente mandar `contrato`/`cpfcnpj`, que a tool prefere ao contexto, e puxar dado de **outro assinante** pela conversa deste. O contrato pedido é validado por `contratosPermitidos(conversa)`.
  - ⚠️ **A identificação do cliente é PERSISTIDA na linha da conversa** (`conversas.cpf`/`contrato_id`), não só no blob do fluxo. O `consultar_cliente` gravava apenas em `estado.contexto.cliente` — e esse blob é **apagado** quando a conversa vai para um humano sem a porta `transferido` ligada. Resultado em produção (visto em 2026-08-22): a IA identificava o assinante, a conversa ia para a fila, e o painel abria **sem contrato** enquanto a 2ª via respondia *"CPF/CNPJ inválido"* — exatamente no momento em que o Cliente 360 existe para ajudar. As colunas existem desde a migration 001 e nunca eram escritas.
  - **O painel nunca derruba o atendimento**: cada bloco é isolado, falha vira `null` + aviso VISÍVEL na tela. Sem o aviso o agente lê "sem débito" quando a verdade é "não sei".
  - **Diagnóstico é opt-in** (`?diagnostico=1`): são 2 chamadas ao SGP e o painel precisa abrir rápido.
  - **Cartão sem ação sugerida é ruído** e empurra para baixo o que importava; há teste exigindo `titulo`+`severidade`+`acao`. Risco de churn exige **combinação** de sinais, e `suspenso` **não** é "sem contrato ativo".
  - **O painel completo é DRAWER, e é ele que paga o caro** (`PainelSGP.jsx`, 2026-08-22). A lateral é o resumo que o agente lê sem clicar; fibra e faturas só saem no clique que abre o drawer. Fossem na ficha, cada troca de conversa pagaria 2 idas ao SGP por dado que ninguém olhou.
  - **O `consultacliente` sempre devolveu endereço, serviço, WiFi e Central do Assinante** — o código lia 8 campos e descartava o resto. A dívida da FASE 6 ("o endpoint não devolve endereço") estava **baseada em premissa errada**. Todo o mapeamento virou `sgpHelpers.mapearRespostaCliente` (puro, testado com o payload real da coleção oficial); `integrations.js` só faz o HTTP.
  - ⚠️ **`"None"` do Python chega como STRING** (`servico_vlan: "None"`), e contato ora é string ora é objeto `{contato,tipoContato,inscricoes}` — o objeto cru no JSX matou o painel inteiro (React #31). `limpo()`/`textoContato()` tratam os dois **na origem**; guarda secundária no `InfoRow`.
  - **A ONU tem DUAS fontes, de propósito:** topologia (OLT/slot/PON/VLAN/CTO) da API FTTH `/api/fttx/onu/list/?contrato=`, e sinal (Rx/Tx, online, uptime, última queda) do **`sgpDb.js`** — leitura direta no Postgres do SGP, que já era o caminho do `consultar_onu_acs`. Uma fora do ar não apaga a outra.
  - **`GET /:id/faturas` é LEITURA, não ação.** Usa a mesma `segundaViaBoleto` da tool; o que muda é o formato — a tool devolve texto pronto pro cliente, o painel precisa de PIX, linha digitável e PDF **separados** pra virar botão. A ação `segunda_via_boleto` continua sendo o caminho de MANDAR o boleto.
  - **Seletor de contrato não custa request:** a ficha já traz os 8 contratos inteiros. A rota `/acao` sempre aceitou e validou `contrato` (`contratosPermitidos`) — faltava só a UI.
  - ⚠️ **Senha de PPPoE e da Central aparecem para TODO agente** (decisão do operador, 2026-08-22), atrás do olhinho. Para trancar, é pôr o bloco atrás de `pode(agente,'ver_dados_completos')` em `mapearContrato`/no componente.
  - ⚠️ **Em flex column, todo filho ENCOLHE por padrão** — e com `overflow:hidden` no cartão o conteúdo é **decepado**, não rolado. Foi assim que o painel completo nasceu quebrado (cartões virando frestas). `.scroll > * { flex-shrink: 0 }` é uma regra para todos, não cinco esquecíveis.
  - **A lateral manda boleto e PIX pro cliente** (`enviarBoleto`/`enviarPix`). O **PIX vai em DUAS mensagens**: no WhatsApp copiar seleciona a mensagem inteira, então código junto com texto explicativo é código que não cola. A segunda mensagem é o copia-e-cola nu.
  - **As faturas só são buscadas se `titulos_abertos > 0` E a seção Financeiro está aberta.** O contador vem de graça na ficha — cliente sem débito não gera ida ao SGP. A `queryKey` é a mesma do drawer, então abrir o painel depois não busca de novo.
  - ⚠️ **O número e a lista TÊM que falar do mesmo universo.** O resumo do Financeiro soma os títulos de **todos** os contratos do CPF (`contratos.reduce`), e a lista pedia boleto só do contrato **selecionado**: o painel exibia *"16 títulos em aberto · R$ 795,18"* e, uma linha abaixo, *"nenhum boleto em aberto"* — os 16 estavam em **outros** contratos do mesmo cliente (visto em produção, 2026-08-22). Hoje `GET /:id/faturas` **sem `?contrato=`** consulta todos os contratos com `titulos_abertos > 0` (teto de 6, e o corpo devolve `limitado: true` — corte silencioso lê como "é tudo"), e cada boleto sai com o `contrato` a que pertence.
  - **`mesclarFaturas` separa FALHA de AUSÊNCIA** (`sgpHelpers.js`, puro e testado): contrato quitado devolve `sem_boleto`, SGP fora devolve erro. Tratar igual faz *"não sei"* virar *"não tem"* — a assinatura de defeito desta casa. As falhas sobem em `falhas[]` e viram aviso VISÍVEL na tela.
  - **Título em aberto ≠ boleto emitido.** Quando o SGP conta N títulos e não devolve boleto nenhum, o painel diz isso com todas as letras em vez de exibir "nenhum boleto" ao lado de um contador diferente de zero.
  - Sonda/inspeção: `GET /api/cliente360/capacidades` (o que ESTE agente pode).
- **A base de conhecimento busca com FULL-TEXT NATIVO, não com embeddings** (`knowledge`*, migration 018 — FASE 7). Regras não-óbvias:
  - **pgvector foi descartado com a licença do próprio plano** (§54, "salvo melhor justificativa técnica após inspeção"): a extensão **não existe** neste Postgres (exigiria trocar a imagem do banco de produção), a Anthropic **não tem embeddings** e `openai_api_key` é uma chave que **nenhuma linha do código lê**. A recuperação inteira mora em `knowledge.buscar()` — havendo pgvector e uma fonte de embeddings, o ranqueamento vira híbrido **ali dentro**, sem que a tool ou a tela mudem.
  - **Acento e hífen são os dois assassinos silenciosos da busca em português.** O dicionário não remove acento (`conexão`→`conexã` vs `conexao`→`conexa`) e `Wi-Fi` (`wi-f`/`wi`/`fi`) nunca casa com `wifi` (`wif`) — e "wifi" é *a* palavra do suporte de ISP. Os dois são resolvidos por **`knowledge_norm()`**, função **IMMUTABLE** criada na migration (coluna gerada só aceita imutável, e `unaccent` não é), que tira acento e **indexa as duas formas** do texto com hífen. A MESMA função normaliza a consulta — simetria por construção.
  - **`websearch_to_tsquery`, nunca `to_tsquery`**: o cliente escreve `???`, aspas soltas e `-`, e o segundo lança erro de sintaxe, derrubando a resposta.
  - **A coluna `busca` é GERADA**, não mantida por trigger — artigo editado nunca fica com índice velho.
  - **A chave de lacuna usa o MESMO pipeline da busca** (`knowledge_norm` + stemmer), e é isso que faz variações da mesma pergunta virarem **uma linha com contador**. Uma normalização em JS foi escrita e descartada: sem stemming, "troco" e "trocar" seriam duas lacunas de 1 ocorrência e o painel de recorrentes ficaria vazio.
  - **Workflow (§52) é obrigatório**: rascunho **não** vai direto a publicado, editar artigo publicado devolve **409** (mova para revisão antes — §53), e `status` fica **fora** da allowlist do PUT porque publicar é transição, não campo de formulário. Publicar congela `knowledge_versoes`.
  - **Revisão vencida marca, não remove** — sumir deixaria a IA sem resposta por uma data esquecida. **Lacuna resolvida que reaparece é reaberta.**
  - **No sandbox a tool LÊ mas não ESCREVE**: rodada de teste não infla contador de lacuna nem suja o rastreamento de uso.
  - **A busca faz E primeiro e OU só se o E não achar nada.** `websearch_to_tsquery` faz **E** entre todos os termos, e a IA passa a fala do cliente inteira: *"o cliente disse que achou caro"* vira `client & diss & car`, e "disse" — que não está em artigo nenhum — derrubava a busca com o artigo certo bem ali. Achado com a carga real de conhecimento (024). A segunda consulta só roda quando a primeira volta vazia: precisão quando dá, recall quando precisa.
  - **A carga inicial (024) é conteúdo DO OPERADOR, não do repositório.** É a única migration que insere texto editorial, e só existe porque o operador forneceu. Os **esqueletos** ("preencher com as regras oficiais": fidelidade, cancelamento, instalação, manuais) entram como **rascunho** com aviso no topo — publicar um faria a IA responder *"Existe fidelidade? Qual o período?"* como se fosse a política. Há teste garantindo que a busca **nunca** devolve esqueleto.
  - ⚠️ **O knex conta `?` como placeholder dentro de comentário SQL** — um `"? IS NULL"` num comentário custou um "Expected 7 bindings, saw 8".
  - Inspeção: `SELECT status, count(*) FROM knowledge_artigos GROUP BY 1`; lacunas em `GET /api/knowledge/gaps`.
- **Playbook: a etapa é provada pela TOOL, não pelo relato da IA** (`playbook*`, migration 019 — FASE 8). Regras não-óbvias:
  - Cada etapa declara as `tools` que a **evidenciam**; rodou a tool, cumpriu a etapa. Pedir para a IA se auto-reportar não serve, porque a **Quality AI (FASE 11) não pode auditar acreditando no que o próprio modelo disse ter feito**. Etapas conversacionais ("tratar objeções") não têm tool que as prove e usam `concluir_etapa_playbook` — **dois mecanismos porque são dois tipos de etapa**.
  - **O workflow é `rascunho → teste → publicado → arquivado`** — o Knowledge usa `revisão` no meio. Procedimento se valida **rodando**, texto se valida **lendo**; unificar obrigaria uma das máquinas a mentir.
  - **O snapshot de versão é o playbook INTEIRO, com etapas** (§64): guardar só o número faria a auditoria de um atendimento antigo ver o procedimento de hoje. **Playbook sem etapas não publica**, e **editar publicado dá 409**.
  - **O bloco é reinjetado no prompt A CADA TURNO**, com `[x]` nas etapas cumpridas e "← VOCÊ ESTÁ AQUI" na próxima. Injetar só na primeira passagem faz a IA esquecer o roteiro no segundo turno — quando ela improvisa. Etapa cumprida **continua visível**: sumir com ela faz a IA repetir a pergunta.
  - **As exceções (§61) vão no prompt** — sem elas o playbook vira checklist burro e a IA testa remotamente um cabo que o cliente já disse estar rompido. O prompt também **proíbe recitar as etapas ao cliente**.
  - **`opcional` nunca é a próxima etapa; `condicional` não impede concluir.** Exigir condicional sempre transformaria toda exceção em pendência eterna.
  - **Uma execução viva por (conversa, playbook)** — quem volta continua de onde parou. **No sandbox não há execução**, mas a tool responde "simulado" (não responder faria a IA tentar de novo).
  - `concluir_etapa_playbook` **some da lista de tools quando não há playbook ativo** — tool inútil compete com a tool certa.
  - Inspeção: `GET /api/playbooks/execucao/:conversaId` (etapas, foco, pendências).
- **A IA tem regras de casa que nenhum nó desliga** (`iaRuntime.js`, migration 020 — FASE 9). Regras não-óbvias:
  - **Três blocos entram em TODA execução do `ia_responde`**: hierarquia de confiança (§67 — dado vivo de tool **vence** documento), o que não se inventa (§68) e os guardrails de campo (§75). São regra da casa, não config de nó — um nó esquecido não pode virar orientação perigosa. Vão **por último** no system prompt, a posição de maior aderência.
  - **A lista do §68 é NOMINAL** (preço, protocolo, PIX, cobertura, prazo, sinal, manutenção, agendamento): "não invente nada" é fácil de contornar, "não invente prazo" não é.
  - **Os guardrails não são papel.** Cliente que olha a ponta de uma fibra perde visão; o bloco diz que **nem o cliente pedindo** libera orientar abrir ONU, mexer em fibra, subir em poste ou tocar rede elétrica.
  - **Motivo de transferência é ENUM** (§73), nunca texto livre: a IA escreve "cliente nervoso"/"está bravo"/"furioso" e `normalizarMotivo` colapsa nos mesmos valores — sem isso nada soma no relatório. **"Irritado + quero atendente" é `customer_frustrated`**, não pedido de rotina: é escalada. E **o motivo vira PRIORIDADE na fila da FASE 5** (frustrado/sensível = 2, que o `calcularUrgencia` lê como crítico).
  - **§71: estourar turnos NÃO é "resolvido"** — é desistência, e `ia_execucoes` grava a diferença. Contar max_turnos como sucesso mente sobre a operação.
  - **A config do NÓ vence a do PERFIL** (`cfg.perfil`): o nó é mais específico. Perfil inativo/inexistente não derruba o turno, só loga.
  - **O handoff (§74) não carrega CPF nem telefone** — a FASE 6 tirou PII do payload do agente e duplicá-la aqui abriria a porta dos fundos.
  - **`llmGateway.js` não tem `embed`**, de propósito: a Anthropic não oferece e a FASE 7 usa full-text. Método que ninguém chama parece capacidade e não é. ⚠️ O gateway **ainda não é o único caminho**: `motorFluxo`/`supervisoraIA` seguem em `getAnthropicClient` (migrar seria reescrever o laço, o oposto da regra da fase) — chamada NOVA nasce no gateway.
  - Inspeção: `GET /api/ia/execucoes?dias=7` (desfechos e motivos agregados), `GET /api/ia/handoff/:conversaId`.
- **O Copiloto sugere, não age** (`copiloto*`, migration 021 — FASE 10). Regras não-óbvias:
  - **O painel NÃO chama o modelo.** A decisão "responder / consultar / avançar procedimento" (§79) é determinística (`decidirProximaAcao`) porque é lida a cada conversa aberta — gastar uma chamada de IA para dizer "identifique o cliente primeiro" seria caro, lento e variável. O modelo só entra quando o atendente pede um TEXTO.
  - **A ordem das checagens é a urgência operacional**: cliente não identificado → consultar; manutenção ativa → responder com a previsão e **não** abrir chamado; caso técnico sem diagnóstico → verificar conexão antes; playbook pendente → avançar; só então responder.
  - **A execução de tool reusa `POST /api/cliente360/:id/acao`** — allowlist, permissão e auditoria já moram lá; um segundo caminho para o mesmo poder ficaria sem alguma delas.
  - **O resumo vivo é montado de FATOS, não gerado** — quem assume a conversa quer dados, e prosa gerada varia a cada leitura.
  - **Os sinais vêm da ÚLTIMA fala do cliente**, não da conversa toda. E os padrões usam **proximidade, não adjacência**: ninguém escreve "cabo rompido", escreve "o cabo tá rompido" — a primeira versão exigia as palavras coladas e perdia o relato mais comum.
  - **`aproveitamento = (enviada + editada) / gerada`**; sem sugestão gerada ele é **`null`, não zero** (zero diria "não serve", null diz "ninguém usou"). **Só a sugestão EDITADA guarda texto** — é ela que ensina o erro; as outras seriam ruído com PII.
  - **Falha do modelo → 503 com texto explicativo**: o atendente precisa saber que pode seguir digitando, não que o chat quebrou.
  - Inspeção: `GET /api/copiloto/metricas?dias=7`.
- **⚠️ O `seed` NÃO roda no deploy — só as migrations.** Foi assim que filas (F5), categorias de conhecimento (F7), playbooks (F8) e perfis de IA (F9) foram entregues e **nunca existiram em produção**: as telas abriam vazias e nada acusava, que é o pior tipo de defeito. Desde 2026-08-22 esses catálogos moram em `src/dadosIniciais.js` e são semeados pela **migration 022**, que roda no boot (há precedente: a 005 semeia `prompts_ia`). **Ao entregar catálogo novo, semeie por migration** — `seed.js` só atende quem sobe o ambiente do zero.
  - A 022 **não** cria usuário, canal, fluxo nem artigo de conhecimento. Artigo semeado viraria "política da casa" que ninguém escreveu.
  - `onConflict(...).ignore()` em tudo: o que o operador editou **não** é desfeito pelo deploy seguinte. O outro lado da moeda: catálogo **apagado** volta no próximo boot — para tirar de vez, **arquive**, não apague.
  - ⚠️ **Nunca rode o `seed.js` completo num ambiente que já atende.** Ele insere um fluxo legado com `ativo: true`, e o motor escolhe o fluxo com `where({ativo:true}).first()` **sem `ORDER BY`** — o Postgres poderia entregar ESSE para toda conversa nova. Desde 2026-08-22 há guarda (`jaTemFluxoAtivo`), mas a regra continua: catálogo por migration, `seed` só em ambiente novo.
- **A Quality AI audita o que foi FEITO, não o que foi dito** (`quality*`, migration 023 — FASE 11). Regras não-óbvias:
  - **§90: a conversa sozinha não basta.** Auditar lendo só o texto premiaria quem escreve bonito e puniria quem resolveu rápido. A evidência inclui tools executadas, procedimento esperado, desfecho estruturado e tempos.
  - **A IA propõe, a aritmética é NOSSA.** O modelo dá nota e justificativa por critério; média ponderada, teto e score final são calculados em `qualityHelpers.js`. Nota que o modelo soma é nota que ninguém consegue conferir.
  - **Violação crítica é TETO (40), não desconto** — subtrair deixaria um atendimento com promessa indevida passando com nota alta. **Penalizar sem justificativa não vale** (§97), e a avaliação inválida é **descartada**, não contada como zero. **Critério não avaliado sai da conta** dos dois lados.
  - **Exceção justificada não conta contra** (§95/§61) — punir quem pulou teste remoto de cabo rompido ensina a seguir o roteiro contra o bom senso.
  - **§98: o humano manda e o `ai_score` não some.** A divergência é o que calibra o scorecard, e a revisão **exige justificativa**.
  - **Coaching por padrão, não ranking** (§99): tropeço isolado não vira ponto de melhoria, e a lista por agente mostra **a contagem junto** — média de 2 auditorias não é média.
  - **Scorecards nascem DESLIGADOS**: auditar custa uma chamada de IA por conversa encerrada.
  - **A auditoria é JOB** agendado em `conversaRepo.encerrar` (único ponto por onde todo encerramento passa), com 1 min de atraso. **Sem scorecard ativo o job é no-op**, senão toda conversa encerrada entupiria a DLQ. E como `encerrar` zera `agente_id`, o agente é recuperado da última mensagem dele — sem isso **toda auditoria automática ficaria sem dono**.
  - Inspeção: `GET /api/quality/painel?dias=30`.
- **Analytics NÃO tem event store — tem camada de leitura** (migration 025 — FASE 12). Regras não-óbvias:
  - **21 dos 24 eventos do §100 já tinham casa tipada** (`ia_execucoes`, `playbook_execucoes`, `knowledge_uso`, `copiloto_eventos`, `quality_auditorias`, `satisfacao`, colunas de `conversas`). Um `(tipo, payload jsonb)` por cima criaria duas verdades para o mesmo fato, nasceria vazio e trocaria enum indexado por `payload->>'campo'`. O que faltava era LEITURA: as views **`conversa_fatos`** e **`nps_unificado`**.
  - ⚠️ **O KPI "resolução IA" do dashboard era ~100% POR CONSTRUÇÃO.** Ele contava `status='encerrada' AND agente_id IS NULL` — e `conversaRepo.encerrar` **zera** o `agente_id`. O sinal honesto é `EXISTS (mensagens WHERE origem='agente')`, e a definição agora mora **na view**, usada pelos dois — senão Dashboard e Analytics divergiriam.
  - **Nenhum número sem contexto**: taxa vem com a base, qualidade vem com a **cobertura**, custo vem com `precos_configurados`. **Sem base, taxa é `null`, não zero.** **Modelo sem preço deixa o custo `null`** — custo zerado vira "a IA é de graça".
  - **Resolução aparente e efetiva aparecem JUNTAS**: aparente é "encerrou sem humano"; efetiva exige `desfecho='resolvido'` **e** sem recontato na janela. Só a primeira seria propaganda.
  - **`PARTITION BY COALESCE(telefone, id::text)`** na window de recontato — com `PARTITION BY telefone` todos os NULL caem na mesma partição e conversa de widget vira recontato de todas as outras (a armadilha da FASE 6, em window function).
  - **`DROP VIEW` + `CREATE VIEW`**, nunca `CREATE OR REPLACE` (falha quando a lista de colunas muda).
  - **Dois pontos de instrumentação e só dois**: `executarTool` e `getAnthropicClient` (envelopa `messages.create`, cobrindo os 5 call sites e fechando o custo da dívida da FASE 9). **`executarTool` devolve TEXTO mesmo quando falha** — sem olhar o conteúdo, a taxa de sucesso ficaria verde para sempre. Telemetria é fire-and-forget e **não grava em sandbox**.
  - Inspeção: `GET /api/analytics/executivo?dias=30`.
- **Observabilidade: log estruturado, correlation ID e UM disjuntor** (migration 026 — FASE 13). Regras não-óbvias:
  - **O `console` é substituído no boot** (`instalarLogEstruturado`), então os ~200 `console.*` existentes viram JSON com contexto **sem nenhuma edição** — e o prefixo `[Motor]`/`[SGP]` vira campo. `pino` foi recusado: substituiria 40 linhas e obrigaria a tocar os 200 call sites, sem dar contexto nem redação.
  - **O correlation ID do webhook morre no 200** — o turno roda no worker. A âncora durável é o **`inbox.id`**, e o `AsyncLocalStorage` leva o contexto por toda a cadeia de `await` sem edição.
  - **`redigirTexto` é o último passo do log** (CPF, telefone, e-mail, `token=`, `Bearer`). O `[SGP] consultacliente` já imprimiu CPF completo, e o `sgpGet` põe o **token na query string**. ⚠️ A regra do CLAUDE.md ("nunca despeje `params`/resposta crua") **continua valendo** — isto é cinto de segurança, não licença. A regra do `Bearer` roda **antes** da de `chave=valor`, senão esta captura a palavra "Bearer" e preserva o token.
  - **`/health/dependencies` responde SEMPRE 200** (veredito no corpo), é **admin** e é **passivo** (lê a telemetria, não faz ping). 503 ali seria convite para pendurar sonda, e o §133 diz que SGP fora é **degradado**, não morto. `/health/ready` segue intocado.
  - **O sinal honesto de saúde é a profundidade e a IDADE da fila**, não `SELECT 1`.
  - **Existe UM disjuntor, e é o do SGP**: timeout de 8–12 s dentro do turno do cliente. Anthropic não (429 pede backoff), Evolution não (**o outbox já é o disjuntor**), Redis não (reconecta), Postgres não (banco fora = sistema fora). **4xx não conta como falha** — o serviço está de pé.
  - **`erros_app` deduplica por assinatura**: 10 mil ocorrências viram 1 linha com contador; sem isso a tabela vira log e ninguém lê. Erro marcado "visto" que **volta é reaberto**.
  - ⚠️ **`inbox` usa `recebido_em`; `outbox` e `jobs` usam `criado_em`.** Escrever o nome errado faz o Postgres recusar a query inteira — e um `catch` genérico devolveria "fila normal" enquanto a DLQ enche.
  - Inspeção: `GET /health/dependencies`, `GET /api/monitor/saude`, `GET /api/monitor/erros`.
- **O produto NÃO é um ERP — o ERP é o SGP** (migrations 027/028, 2026-08-26). Saíram **Ocorrências**, **Ordens de Serviço** e **Monitor de Rede**; a aba **Clientes** virou o histórico de contato. Regras não-óbvias:
  - **O que morreu era um ERP em miniatura ao lado do SGP**: o mesmo chamado existia nas duas bases e nada as conciliava. A IA sempre abriu chamado no SGP (`criar_chamado` → `/api/ura/chamado/`) e leu histórico de lá (`historico_ocorrencias`) — **nenhuma tool, nenhum nó do motor e nenhum catálogo do editor tocava essas quatro tabelas**. A remoção não mudou uma linha do que a IA sabe fazer.
  - ⚠️ **`routes/monitor.js` são DOIS domínios no mesmo arquivo.** Saíram só `GET /status` e `POST /ping` (Monitor de Rede); `GET /erros`, `PUT /erros/:id` e `GET /saude` **ficam** — são a tela **Saúde do Sistema** (FASE 13). Apagar o arquivo derrubaria a observabilidade inteira.
  - O `POST /ping` levava junto o **último `createTableIfNotExists` do código** — DDL em runtime numa rota de admin. Enquanto ele existisse, a 027 dropava `equipamentos_rede` e o primeiro POST a ressuscitaria vazia.
  - **`notas`, `zonas_cobertura` e `consultas_cobertura` NÃO saíram**, apesar de nascerem nas mesmas 001/002: `notas` é das notas internas da conversa (`routes/chat.js`) e Cobertura continua no produto. A única rota que citava `notas` fora do chat era `POST /ocorrencias/:id/notas`, que **sempre falhou** (inseria `conversa_id: null` numa coluna `notNullable`).
  - **Clientes NÃO ganhou tabela — ganhou a view `clientes_contato`** (028). Os fatos ("quem falou com a gente, quando, e qual CPF/contrato reconhecemos") já moram em `conversas` desde a 001, e `cpf`/`contrato_id` passaram a ser escritos na FASE 6. Tabela nova seria **segunda verdade** para o mesmo fato: exigiria backfill, exigiria um segundo escritor sincronizado com o motor, e nasceria vazia. Mesmo argumento com que a FASE 12 recusou um event store — o que faltava era **leitura**.
  - **O vínculo não é copiado, é agregado**: `(array_agg(x ORDER BY criado_em DESC) FILTER (WHERE x IS NOT NULL))[1]` = "o último valor que conhecemos". É o que faz o telefone que volta meses depois já aparecer com o CPF que a IA identificou lá atrás, sem nada precisar carregar o dado adiante.
  - ⚠️ **`COALESCE(telefone, id::text)` de novo.** Terceira aparição da mesma armadilha (FASE 6, window de recontato da 025, agora aqui): com `GROUP BY telefone` puro, **toda conversa de widget** (telefone NULL) cai num grupo só e vira "um cliente".
  - **A rota antiga não agrupava nada**: o fallback fazia `groupBy(['id', ...])` — com o `id` dentro, cinco conversas do mesmo cliente viravam cinco "clientes" na lista.
  - **A busca ao vivo no SGP saiu de propósito.** Consultar o ERP por CPF arbitrário é o que o Cliente 360 faz **dentro de uma conversa**, com `contratosPermitidos` limitando o contrato. Um segundo caminho ao SGP sem essa allowlist é a "integração paralela" que a FASE 6 proibiu.
  - **`chave` nunca sai no payload.** Ela é o telefone cru; devolvê-la como identificador entregaria, na chave da lista, o mesmo dado que o `mascararTelefone` acabou de esconder uma coluna ao lado. O id exposto é `ultima_conversa_id` (uuid), que é o que o Cliente 360 já sabe receber.
  - **"Identificado" é ter vínculo com o SGP, não ter nome** (`clientesHelpers.estaIdentificado`). O cliente diz o nome dele no primeiro "oi"; prometer ficha do assinante onde não há vínculo é prometer o que não temos.
  - ⚠️ **`ultima_mensagem` é a FALA CRUA do cliente** (`mensagemRepository` guarda `texto.slice(0,120)`, inbound incluído) — o preview passa por **`redigirTexto`** antes de sair. `mascararPII` é por CAMPO e não alcança texto livre: sem isso, "meu CPF é 111.444.777-35" apareceria por extenso duas linhas abaixo do mesmo CPF mascarado, na mesma tela, para agente sem `ver_dados_completos`.
  - **A linha do tempo respeita a fila** (`conversaVisivel` + `filasDoAgente`, como a lista do `chat.js`). Sem isso a aba seria porta lateral para o que a FASE 5 restringiu. ⚠️ **Teto: a LISTA não filtra por fila** — a view agrega sem saber quem pergunta, e filtrar depois daria contagem que não bate com o que se vê. Hoje não morde (agente sem fila vê tudo, e a operação não tem filas montadas); vira problema no dia que houver fila de verdade.
  - ⚠️ **`count(*)` é `bigint` e o node-pg devolve bigint como STRING.** `c.conversas !== 1` é sempre verdadeiro (`'1' !== 1`) — todo contato de uma conversa só lia **"1 conversas"**. Não há `setTypeParser` em lugar nenhum do repo: compare com `Number(...)`.
  - **Tetos assumidos:** a view agrega `conversas` inteira a cada request (vira MATERIALIZED VIEW ou tabela quando crescer); `conversas.cpf` só é escrito pelo nó `consultar_cliente`, então fluxo que colete CPF por `salvar_dado` não persiste o vínculo; contatos **não** são mesclados por CPF entre telefones diferentes; e o `down()` da 027 recria **estrutura, não dados**.
  - Inspeção: `SELECT * FROM clientes_contato ORDER BY ultimo_contato DESC LIMIT 20`.
- ⚠️ **`agentes.permissoes` NUNCA chegava ao middleware** — corrigido em 2026-08-26. O `signToken` de `routes/auth.js` montava `{id, login, nome, role}` e parava aí; `authMiddleware` faz `req.agente = payload`, então `pode()` lia `permissoes: undefined` para todo mundo e caía nos padrões de `CAPACIDADES`. Efeito: `ver_dados_completos` (padrão `false`) **nunca** era concedida, nem com a caixa marcada na tela de Agentes, e desmarcar qualquer outra não fazia nada. A afirmação da FASE 6 de que as permissões "finalmente decidem algo" era **falsa desde o primeiro dia** — o payload não chegava. Blob legado não muda de comportamento (chave ausente cai no padrão, como já caía); o que passa a valer é o admin que **desmarcou** algo. Token antigo (30 dias) segue nos padrões até o próximo login.
- ⚠️ **O knex conta `?` como placeholder DENTRO de comentário SQL — e isso derrubou o `/api/dashboard/kpis` em produção.** Um comentário que terminava em *"nesta conversa?"* fazia o Postgres devolver `42P18 could not determine data type of parameter $1`, e o painel inteiro parava. Já era regra conhecida (§Knowledge, "custou um Expected 7 bindings, saw 8") e mordeu de novo — agora há **teste travando** (`tests/sql-comentario-interrogacao.test.js`, varre `src/` por linha começando em `--` que contenha `?`). **Nunca termine comentário SQL com pergunta.**
- **Helper chamado é helper importado** (`tests/imports-de-rota.test.js`). Em ESM, `auditar(...)` sem o `import` **não** quebra no boot nem no `node --check` — estoura `ReferenceError` no primeiro clique. Foi assim que `assumir`/`devolver-ia`/`encerrar` responderam 500 em produção desde a FASE 3 até a FASE 5 achar. A mesma guarda barra `import * as` sobre um repositório (o namespace não tem os métodos do objeto exportado).
- **Catálogo de nós tem duas faces:** `apps/web/src/lib/nodeTypes.js` (visual, ~32 tipos) deve espelhar o `switch` de `processarNo` em `motorFluxo.js` (backend). Ao adicionar um nó, atualize os dois + o painel de propriedades **dentro de `FluxoEditor.jsx`** (`components/fluxo/PropsPanel.jsx` era arquivo morto e foi removido na FASE 2). Há **teste de contrato** entre `nodeTypes.js`, o `NOS` do validador e o `switch` do motor — ele falha quando a divergência cresce. **Cuidado com o nome dos campos:** o `PropsPanel` historicamente salvou campos com nomes que o motor não lia (`botao`/`secao`/`instrucao`/`tipo`), então a config era ignorada na execução. Hoje `fluxoHelpers.js` normaliza esses casos (lê o nome do editor com fallback pro antigo) — mas **a regra é manter os nomes iguais nas duas faces**; o helper é rede de segurança, não desculpa pra divergir.
- **Envio por canal passa pelo registry `services/canais/`**, nunca por `if (canal === ...)`. Cada provedor é um adapter com **um método por tipo de mensagem** (`texto`, `botoes`, `lista`, `cta`, `imagem`, `audio`, `arquivo`); o dispatcher resolve por `conversas.canal`. Regras não-óbvias: **a degradação mora dentro do adapter** (o Telegram degrada `lista`→**botões** com ≤8 itens, não para texto); tipo não implementado usa o método **`padrao`**, que **só o Telegram tem** — a Evolution não tem de propósito, porque hoje ela descarta tipos desconhecidos (inclusive `localizacao`) em silêncio, e um fallback genérico mudaria isso. Os adapters recebem os transportes por **injeção** para serem testáveis sem rede.
- **`enviarResposta` faz muito mais que enviar:** guarda de `resp.texto` vazio, persistência da mensagem, broadcast SSE e guarda de `chatId` acontecem **antes** do despacho. Ao mexer ali, só o trecho de despacho pertence ao registry. O `chat.js` ainda tem o `if/else` antigo (só texto) — migra quando precisar tratar `whatsapp_oficial`.
- **Prompts da IA são editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA: abas Prompts/Catálogo/Testar Tools). Placeholders `[REGRAS]/[ESTILO]/[PLANOS]/[TIPOS_OCORRENCIA]` resolvidos por `promptService`. Cuidado: há **dois caches** (`integrations.invalidateConfigCache` e `promptService` TTL 3min) — editar prompt invalida só um.
- **Nó `IA Responde` tem 4 campos com papéis distintos** (o 4º nasceu na FASE 9):
  - `perfil` = **pacote** (prompt + procedimento + tools + limites). O que for configurado no NÓ **vence** o perfil.
  - `instrucao` ("Ajuste deste nó") = nuance **daquele ramo**. Entra DEPOIS do prompt base, rotulada como `Instrução específica:` — **não** é lugar de identidade, tom ou regra geral, que pertencem ao prompt da aba Prompts IA. Pôr persona aqui duplica o que o prompt base já diz e faz a identidade chegar como adendo; a tela avisa quando detecta isso.
- **`cfg.tools_ativas` SUBSTITUI a lista padrão — e é assim que a base de conhecimento morre em silêncio** (medido no link público de produção, 2026-08-27). Todo nó `ia_responde` escrito antes da FASE 7/8 tem uma lista explícita, e ela ganha do `TOOLS_PADRAO` inteiro: `buscar_conhecimento` nunca chegava ao modelo e a IA improvisava procedimento com os 55 artigos da 024 intactos. Perguntada, ela listou as 8 tools que de fato tinha. Hoje **memória e base de conhecimento são incondicionais** (`TOOLS_SEMPRE_ATIVAS` em `fluxoHelpers.js`, aplicadas por `filtrarTools`) — pelo mesmo motivo que os três blocos do §67/§68/§75 não são config de nó: **nó esquecido não pode virar IA que inventa**. `concluir_etapa_playbook` segue condicionada ao procedimento ativo (tool que só sabe dizer "não há procedimento" compete com a tool certa).
- ⚠️ **Playbook e perfil continuam sendo decisão do operador, e por isso continuam DESLIGADOS até alguém ligar.** `pb` só existe com `cfg.playbook` **ou** `perfil.playbook_slug` no nó; os perfis `suporte`/`comercial` da migration 022 já apontam para os playbooks certos, mas os playbooks **nascem em rascunho** (§60/§62) e `carregar()` só lê `publicado`. São dois passos na tela, não uma linha de código: publicar o playbook e pôr o `perfil` no nó.
- **A ordem de chamar `salvar_dado` não podia morar só dentro da ficha.** `montarFichaColetada` devolvia `''` sem dados coletados — ou seja, a instrução de salvar só aparecia **depois** de a IA já ter salvo algo. No primeiro dado, que é quando importa, o prompt não dizia nada: medido em 12 turnos de produção, ela respondeu *"Perfeito, já anotei"* e *"Já guardei o endereço"* com `estado.contexto` **vazio** — a memória estruturada existia e nunca era exercitada. Hoje o bloco vazio vira só a ordem, com todas as letras de que dizer que anotou **não** guarda nada.
- **(histórico) Nó `IA Responde` tem 3 campos com papéis distintos:** `contexto` = **slug** do prompt da tela (vira a base; slug inexistente → fallback genérico — o `contexto` precisa bater **exato**, ex. `suporte` não `"Suporte Técnico"`); `instrucao`/"instruções extras" = texto somado por cima da base; `tools_ativas` = **quais** tools a IA pode chamar (o prompt não registra tool, só orienta). Detalhe em [brain/systems/maxxi/components/ia-tool-calling.md](brain/systems/maxxi/components/ia-tool-calling.md).
- **Acoplamento NetGo:** POP/portador/`nas_id=53` (`RTR_BNG_NETGO_02`) e textos estão hardcoded em `integrations.js` e nos prompts seed. A API do SGP tem `list` de NAS/POP/portador/plano p/ de-hardcodar por instância. **Estudo completo da API do SGP (237 endpoints, 13 módulos)** em [brain/domains/sgp-api/overview.md](brain/domains/sgp-api/overview.md). Qualquer revenda exige parametrizar isso.
- **Planos comerciais (Configurações → Planos, tabela `planos`):** alimentam a tool `listar_planos_ativos`. `cidade` vazia = vale p/ **todas** (multi-cidade por vírgula); `valor` = preço normal + `valor_promocional`/`promo_meses` = promoção dos primeiros meses; `beneficios` = texto (um por linha). Migrations 008/009.
- **Memória da IA (estruturada, 2026-07-01):** o `ia_responde` guarda o que a IA coleta como **variável de fluxo** — a tool `salvar_dado` grava em `ctx.estado.contexto[campo]` e `montarFichaColetada` reinjeta o bloco `## DADOS JÁ COLETADOS` no system prompt **todo turno**, então cadastro longo não re-pergunta. O histórico cru (`.slice(-50)`) segue só pro tom. Nó de cadastro precisa de `max_turns≈25`. Detalhe em [brain/systems/maxxi/components/memoria-estruturada-ia.md](brain/systems/maxxi/components/memoria-estruturada-ia.md). Toda conversa de produção nasce com `protocolo`; no sandbox o protocolo é fabricado (`AAAAMMDD-TESTE`). **⏳ PENDENTE:** validar a memória numa **conversa real com a IA** (até 2026-07-01 só foi validado o pré-cadastro isolado no Testar Tools).
- **Pré-cadastro real (SGP):** `precadastrarCliente` grava em **modo lead** (`precadastro_ativar=0`; o SGP só exige `nome`+`logradouro`) — a equipe monta o contrato. Endpoint de planos correto é `/api/precadastro/plano/list` (o antigo `/api/ura/planos/` dava 404); `datanasc` normalizado p/ `AAAA-MM-DD`; `nas_id=53`. Detalhe em [brain/systems/maxxi/components/precadastro-real.md](brain/systems/maxxi/components/precadastro-real.md). ✅ **Logs de PII removidos em 2026-08-21** (FASE 0): eram 6, não 3 — o pior era `[SGP] consultacliente`, que imprimia o **CPF completo** a cada consulta. Em cada sítio saiu o dado e ficou o diagnóstico (contagem de contratos, nomes de campos, protocolo). Ao mexer em log de integração, **nunca despeje `params`/`tu.input`/resposta crua** — todos carregam ficha do assinante.

## Montando um fluxo (aprendido na prática)

Fluxo de referência pronto e validado: [apps/api/examples/fluxo-netgo-v2.json](apps/api/examples/fluxo-netgo-v2.json) (híbrido menu+IA, 14 nós, validador 0/0). Importável pelo botão **📂 Importar** do editor — o importador aceita `{nome, nodes, edges}` com `posX`/`posY`; formato salvo: `{id, tipo, config, posX, posY}` + `{from, to, port}`.

- **`max_turnos` do `ia_responde` conta cada troca cliente↔IA** (default **6**, campo `cfg.max_turnos`). Estourar avança pela porta `max_turnos` e **encerra o atendimento no meio**. Cadastro comercial precisa de **~25** (a janela de histórico é 50 msgs ≈ 25 trocas — configurar abaixo disso é incoerente); suporte com diagnóstico, ~12.
- **`aguardar_tempo` PARA de verdade** (FASE 4): agenda um job e retoma pela porta `saida`. Dois cuidados: `aguardar_tempo → ia_responde` **não é suportado** (a IA pausa em `tipo:'timer'` — use `→ enviar_texto`), e no sandbox ("Testar fluxo") ele continua avançando na hora, senão a tela nunca responderia.
- **`aguardar_resposta` só ganha timeout se você configurar `timeout` (segundos)**; aí aparecem as portas `timeout` e — se `max_tentativas > 0` — `max_tentativas`. Com `timeout: 0` (o default) ele espera para sempre, como sempre esperou.
- **`transferir_agente` não manda mensagem nenhuma** ao transferir (`Respostas geradas: 0`). Sempre coloque um `enviar_texto` antes, senão a conversa morre na cara do cliente.
- ⚠️ **No WhatsApp o cliente DIGITA, ele não clica.** A comparação de resposta de menu era igualdade exata em minúsculas contra o rótulo — então `quero conhecer` **não** casava com `🆕 Quero conhecer! 😊`, caía na porta `saida` e, com ela solta, no fallback de primeira aresta: o interessado ia parar no ramo de "já sou cliente", errava o CPF três vezes e era transferido (medido em produção, 2026-08-27). Hoje os dois lados passam por `normalizarEscolha` (`fluxoHelpers.js`): NFKD tira acento e resolve `2ª`→`2a`, e o resto vira espaço — some emoji, pontuação e caixa. **Rótulo só de emoji normaliza para `''` e nunca casa**, senão qualquer entrada sem letra casaria com ele. Vale para `enviar_botoes` e `enviar_lista`.
- **Ligue SEMPRE a porta `saida` dos menus** (`enviar_botoes`/`enviar_lista`) — é o fallback de quando o cliente digita algo fora das opções. Solta, o motor cai no 3º fallback do `encontrarProximo` (**primeira aresta qualquer**) e manda o cliente para um ramo arbitrário, em silêncio.
- **`cfg.tools_ativas` no `ia_responde`** define as tools por ramo. Sem ele vale uma lista padrão de suporte; `precadastrar_cliente` fica de fora de propósito e precisa ser ativada explicitamente (só no ramo comercial).
- **Rode o validador antes de ativar**: alvo é 0 erros **e** 0 avisos.

- **O 200 do webhook NUNCA esperou o turno de IA.** Antes da FASE 4 os handlers faziam `processarConversa(...).catch(...)` sem `await`; hoje a rota nem chama o handler — ela grava no `inbox` e responde. Não repita a afirmação de que "o turno de IA segura a resposta do webhook": é falsa e já contaminou uma spec. O ganho do Inbox foi **durabilidade**, não latência.
- **`estado.aguardando` não distingue quem acordou o fluxo** — por isso a FASE 4 criou `aguardandoTimer` e o `tipo:'timer'`. Ao adicionar OUTRA forma de retomada (SLA, callback de provedor), repita o padrão: campo próprio + tipo próprio. `'sistema'` faz o `ia_responde` pausar e `'texto'` vazio faz a Anthropic recusar — os dois já foram bugs.
- **Todo efeito colateral novo do motor precisa do gate `if (!ctx.sandbox)`**. O sandbox usa ids `sandbox:<uuid>`/`share:<uuid>`, que não são uuid — `estadoStore` tem guarda (`ehUuid`), `agendarTimer` e o outbox também; tabela nova não terá.

## Armadilhas conhecidas (bugs/dívidas — ver [brain/work/](brain/work/))

- **Conversa duplicada e protocolo colidindo — corrigidos na FASE 1 (migration 014).** Os 3 webhooks faziam check-then-act (`porTelefoneCanal` → `criar`): duas mensagens simultâneas de um número novo criavam **duas conversas**. Agora todos passam por **`conversaRepo.obterOuCriar`** (devolve `{conversa, nova}` — só quem criou emite `nova_conversa` no SSE) sobre uma **unique parcial** `conversas(telefone, canal) WHERE status <> 'encerrada'`. O protocolo era `COUNT(*) do dia + 1`: retry na aplicação **não converge** (medido: 8 chamadas concorrentes ainda colidiam na 5ª tentativa); virou a tabela `protocolo_seq` com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, atômico por construção. ⚠️ Mesma armadilha da 008: o `down()` da 014 derruba índice usado por `onConflict` — **não rode em produção**.
- **Os 4 críticos da auditoria foram corrigidos em 2026-08-21** (race de estado do fluxo → `filaPorChave.js`; `sgp_url` não salvava; Canais apagava config; dedup de webhook → migration 008 + `onConflict`). ✅ **Validados contra Postgres real em 2026-08-21** (FASE 0) — 6 testes, incluindo o caso concorrente. ⚠️ Descoberta: `onConflict('external_id')` é **incondicional**, então sem o índice único da 008 o Postgres recusa **todo** insert de mensagem, não só duplicatas — o `down()` da 008 derruba a ingestão inteira, **nunca rode em produção**. O lado bom: uma instância que armazena mensagens prova por comportamento que a 008 aplicou.
- **Mismatches editor↔motor — maioria fechada na FASE 2 (2026-08-22)**, travada por `tests/contrato-catalogos.test.js` (importa `nodeTypes.js` direto do `apps/web` — JS puro — e compara com o `NOS` do validador e o `switch` do motor): dois bugs **ativos** no `ia_responde` corrigidos (tela gravava `prompt`/`max_turns`, motor preferia `instrucao`/`max_turnos` em direções **contrárias** — editar instrução não tinha efeito, e encostar em "máx. turnos" derrubava cadastro de 25→5; fonte única agora em `camposIaResponde` de `fluxoHelpers.js`); escala do NPS configurável; defaults de tools alinhados (`TOOLS_PADRAO` em `fluxoHelpers.js` = `IA_TOOLS_DEFAULT` em `nodeTypes.js`); portas mortas removidas da paleta (`sem_localizacao`/`erro`, `sem_agente`) e `abrir_chamado`/`enviar_email` alinhados ao que o motor emite; 5 stubs órfãos do provedor de inspiração deletados. **Ainda abertos:** `gatilho_keyword` (filtro inerte), campos inertes da tela (`enviar_cta.rodape`, `alias`, `ia_menu_ativo`, `transferir_agente.motivo`), e o nó `listar_planos` (SGP) vs tool `listar_planos_ativos` (tabela local): **mesma pergunta, duas respostas**.
- ~~`sseManager.js` importa `redis` mas o pacote é `ioredis`~~ → **corrigido (2026-08-21)**: migrado para a API do `ioredis`. ✅ **Conexão real validada em 2026-08-21** (FASE 0): broadcast cruza instâncias, `sendToAgente` respeita o destinatário e `ehEcoProprio` impede a entrega dupla.
- **⚠️ Sonda de deploy: use uma ROTA que só existe no código novo, não o `last-modified`.** Medido em 2026-08-22: o push das 04:17 UTC (FASE 4) **deployou** às ~04:26 (≈9 min), e o `last-modified` de `GET /` **não se moveu** — seguiu marcando 03:31. Ou seja, a sonda que esta doc recomendava dá falso negativo. O que respondeu a verdade foi `GET /api/filas`: **404 = código antigo, 401 = código novo no ar** (a rota existe e exige token). Ao entregar uma fase, escolha uma rota nova dela e sonde por status.
- **⚠️ Sonde N vezes e exija que TODAS concordem** (medido na FASE 5, 2026-08-22): durante o rollout a mesma URL devolveu `404 401 404` em três requisições seguidas — **duas versões atendendo ao mesmo tempo** atrás do balanceador. Uma requisição só declara entregue uma fase que metade dos clientes ainda não recebeu. `for i in $(seq 6); do curl -s -o /dev/null -w '%{http_code} ' URL; done` e só aceite se as 6 baterem. Pela mesma razão, um laço que para "no primeiro código diferente de 404" dá **falso positivo** — ele casa com o container novo enquanto o velho segue no ar.
- **⚠️ Build do frontend morrendo SEM MENSAGEM = OOM killer, não erro de código** (2026-08-22). O log do Coolify para logo depois de `✓ N modules transformed.` e não imprime erro nenhum. **O silêncio é o diagnóstico:** quando o próprio V8 estoura o heap ele cospe um stack dump de 40 linhas; nada impresso é `SIGKILL` do cgroup. O `Dockerfile` fixa `NODE_OPTIONS=--max-old-space-size=512` no stage do frontend — sem teto, o V8 cresce até o que a máquina tiver (~620 MB de RSS medidos, embora **256 MB bastem** para este bundle) e o kernel mata. Antes de suspeitar do seu código, reproduza o container: copie só `package*.json`, `index.html`, `vite.config.js` e `src` para um diretório limpo, `npm install --legacy-peer-deps` e `npm run build`. Se passar aí, o problema é da máquina, não do commit.
  - ⚠️ **`apps/web/package-lock.json` NÃO está versionado** — o container resolve os `^` do zero a cada invalidação de cache. Enquanto a camada do `npm install` estiver `CACHED` isso não morde, mas o dia que ela invalidar o build pode trazer dependência nova sem nenhum commit nosso.
- ~~**O deploy automático do Coolify é INTERMITENTE**~~ → **causa encontrada e corrigida em 2026-08-26.** Não era intermitência: **o webhook NUNCA funcionou**, em nenhuma das 13 aplicações desta VPS. O Coolify valida a assinatura **incondicionalmente** (`app/Http/Controllers/Webhook/Github.php`):
  ```php
  $webhook_secret = data_get($application, 'manual_webhook_secret_github');  // era NULL
  $hmac = hash_hmac('sha256', $request->getContent(), $webhook_secret);      // gera hash mesmo com chave nula
  if (! hash_equals($x_hub_signature_256, $hmac) && ! isDev()) → 'Invalid signature.'
  ```
  Não existe `if (!$secret) então pule`. Com a coluna `applications.manual_webhook_secret_github` **NULL** no Coolify e o webhook do GitHub **sem secret**, ele comparava string vazia contra um hash de 64 caracteres — sempre diferente. Conserto: um secret igual dos dois lados (a coluna é **texto plano**; só `http_basic_auth_password` tem cast `encrypted`).
  - ⚠️ **O Coolify responde 200 mesmo recusando**, e põe o motivo no *corpo*. Por isso o GitHub mostrava `last_response: 200 OK` e tudo verde: os dois lados reportando sucesso de uma entrega recusada. **Ler o status engana; só o corpo conta a verdade** — e a listagem de entregas do GitHub não mostra corpo, tem que abrir a entrega.
  - Diagnóstico em um comando: `gh api repos/Chrisw16/AtendimentoApp/hooks/611298182/deliveries/<id> --jq '.response.payload'`. Antes: `{"status":"failed","message":"Invalid signature."}`. Depois: `{"status":"success","message":"Deployment queued."}`.
  - **A afirmação anterior desta doc — "das 3 entregas de 21/08, a #1 virou deploy" — estava errada.** Nenhuma virou; aquele deploy veio de outra origem (redeploy manual). Serve de lição: correlacionar "pushei" com "apareceu no ar" sem ler o log do webhook produz causa inventada.
  - ⚠️ **As outras 12 aplicações da VPS seguem com `manual_webhook_secret_github` NULL** — mesmo defeito, não corrigido. Cada uma precisa do seu par (Coolify + webhook do repo).
  - **A URL do webhook continua `http://` puro em IP cru** (`72.60.53.164:8000`, `insecure_ssl=1`): o Coolify não tem FQDN próprio (`instance_settings.fqdn` vazio). O **secret não trafega** — só o HMAC — então o risco remanescente é a leitura do payload em trânsito, não roubo da credencial. Para fechar, dar domínio com TLS ao Coolify.
  - **Continua valendo:** confirme entrega com **sonda de rota**, N vezes, todas concordando (ver a armadilha acima). Medido de novo em 2026-08-26: `404 401 404 401 404 401` durante o rollout, e só a rodada seguinte fechou `404 × 6`.
- ~~`GET /api/webhooks/meta` refletia HTML arbitrário sem autenticação~~ → **corrigido (2026-08-21, commit `f8ed98f`)**. A rota comparava `token === process.env.META_VERIFY_TOKEN`; com a env ausente, `undefined === undefined` passava, e `res.send(challenge)` responde `text/html`. Confirmado ao vivo na produção. Somado à CSP desligada + JWT em `localStorage` + `GET /api/sysconfig` em texto plano, a cadeia terminava em roubo de sessão de admin. Agora `verificarHandshake` é **fail-closed**, compara em tempo constante e responde `text/plain`. **Mitigação sem deploy: definir `META_VERIFY_TOKEN` no ambiente.**
- ~~`GET /api/sysconfig/:chave` lia qualquer chave do `sistema_kv`~~ → **corrigido (2026-08-21)**: a allowlist `CHAVES_PUBLICAS` governava só o `PUT` e o GET agregado.
- ~~`GET /api/sysconfig` retorna API keys em texto plano~~ → **corrigido na FASE 3 (2026-08-22)**: mascarado nas duas rotas de GET, e cifrado em repouso quando há `KV_SECRET`. Ver a regra de credenciais acima.
- ~~Nós de SGP sem bloco no PropsPanel / "o cliente nunca é perguntado pelo CPF"~~ → **a armadilha descrevia um ARQUIVO MORTO** (descoberto na FASE 2): `components/fluxo/PropsPanel.jsx` não era importado por ninguém — o painel vivo mora **dentro** de [FluxoEditor.jsx](apps/web/src/pages/FluxoEditor.jsx) (`PropsPanel`, ~linha 320) e sempre teve campo para `consultar_cliente.pergunta`. Os dois arquivos mortos (`PropsPanel.jsx`, `FlowNode.jsx`) foram removidos em 2026-08-22. **Regra que fica: o painel de propriedades e o nó visual são os de `FluxoEditor.jsx`** — não crie/edite versões em `components/fluxo/`.
- ~~Simulador diverge do motor no `consultar_cliente`~~ → **corrigido (FASE 2)**: o simulador agora espelha o motor (`cfg.pergunta`, sem default inventado; sem ela, silêncio — como a produção). Teste em `motorSimulador.test.js`.
- ~~Mass-assignment em PUT de `ocorrencias`/`ordens`/`tarefas`; `tarefas` sem ownership-check~~ → **corrigido na FASE 3 (2026-08-22)**: allowlist de colunas por rota e ownership em `tarefas` (dono ou admin). `ocorrencias` e `ordens` **deixaram de existir** em 2026-08-26 (migration 027).
- `Tarefas.jsx` e `Financeiro.jsx` existem mas **não têm rota** em `App.jsx`. ~~`Clientes.jsx` tem `useDebounce` quebrado~~ → **corrigido (2026-08-21)**: usava `useState` no lugar de `useEffect`, então o valor debounced nunca mudava e a busca de clientes não funcionava.
- Meta gera mídia em `/api/media/:id` mas **não há rota `/api/media`** montada.
- Resíduos do provedor de inspiração ("CITmax") em `seed.js` e na tool `status_rede`. Fluxo padrão do seed é legado e não roda no motor atual.

## Design system

Tema **LIGHT** (atual): branco predominante, acentos **navy `#2050B8`** + **laranja `#E8572A`**. Fontes Plus Jakarta Sans (corpo), JetBrains Mono (código), Syne (display). Tokens em [apps/web/src/styles/tokens.css](apps/web/src/styles/tokens.css). (O README descreve um tema escuro `#00E5A0` **antigo/desatualizado** — `#00E5A0` hoje só aparece nas cores de nó do editor de fluxo.)

## Plano de Evolução V1.0

O produto é guiado por dois documentos versionados em [docs/ers/](docs/ers/):
**ERS-GoCHAT-v1.0.md** (AS-IS reconstruído do código) e
**GoCHAT_Plano_Evolucao_V1_Completo.md** (TO-BE aprovado, **13 fases**). Cada fase
tem um registro em [brain/work/tasks/](brain/work/tasks/) com o que virou fato, o
que divergiu e os tetos assumidos.

| Fase | Estado |
|---|---|
| **0** — Reconciliação e linha de base | ✅ 2026-08-21 |
| **1** — Fundação crítica / P0 (motor persistente) | ✅ 2026-08-21 |
| **2** — Registry Foundation | ✅ 2026-08-22 |
| **3** — Segurança e governança base | ✅ 2026-08-22 |
| **4** — Inbox, Outbox e Jobs | ✅ 2026-08-22 |
| **5** — Equipes, Filas e Human Handoff | ✅ 2026-08-22 |
| **6** — Cliente 360 | ✅ 2026-08-22 |
| **7** — Knowledge Hub | ✅ 2026-08-22 |
| **8** — Playbook Engine | ✅ 2026-08-22 |
| **9** — AI Runtime V1 | ✅ 2026-08-22 |
| **10** — Copiloto V1 | ✅ 2026-08-22 |
| **11** — Quality AI V1 | ✅ 2026-08-22 |
| **12** — Conversation Events + Analytics | ✅ 2026-08-22 |
| **13** — Observabilidade e hardening | ✅ 2026-08-22 |

## Estado do produto (2026-08-26)

**Escopo enxugado em 2026-08-26:** saíram **Ocorrências**, **Ordens de Serviço** e **Monitor de Rede** — GoCHAT é atendimento, o ERP é o SGP. A aba **Clientes** virou o **histórico de contato** (view `clientes_contato`, migration 028). Detalhe nas regras não-óbvias acima e em [brain/work/tasks/2026-08-26_remocao-erp-e-clientes-historico.md](brain/work/tasks/2026-08-26_remocao-erp-e-clientes-historico.md).

**Está EM PRODUÇÃO**, em VPS via Coolify: `https://gochat.netgo.net.br`. O SGP responde de verdade e a IA comercial roda com tool calling — pré-cadastro, `listar_planos_ativos` e `salvar_dado` exercitados em conversa real.

### Plano de Evolução V1.0 — ✅ 13 de 13 fases entregues

| Fase | Estado |
|---|---|
| **0** — Reconciliação e linha de base | ✅ mergeada |
| **1** — Flow Engine persistente (P0) | ✅ mergeada |
| **2** — Registry Foundation | ✅ mergeada |
| **3** — Segurança e governança base | ✅ mergeada |
| **4** — Inbox, Outbox e Jobs | ✅ mergeada |
| **5** — Equipes, Filas e Human Handoff | ✅ mergeada |
| **6** — Cliente 360 | ✅ mergeada |
| **7** — Knowledge Hub | ✅ mergeada |
| **8** — Playbook Engine | ✅ mergeada |
| **9** — AI Runtime V1 | ✅ mergeada |
| **10** — Copiloto V1 | ✅ mergeada |
| **11** — Quality AI V1 | ✅ mergeada |
| **12** — Conversation Events + Analytics | ✅ mergeada |
| **13** — Observabilidade e hardening | ✅ implementada (2026-08-22) |

O que mudou de estrutural: **conversa sobrevive a restart e deploy** (`flow_executions`, versão do fluxo congelada por conversa), **credencial não sai mais em texto plano** e há cripto em repouso oportunista, **`/health/ready` bloqueia até as migrations terminarem**, há **graceful shutdown**, **mensagem que entra é durável, envio é write-ahead e `aguardar_tempo` espera de verdade** (`inbox`/`outbox`/`jobs`), **o atendimento humano tem filas de verdade** — SLA e horário por fila, capacidade por agente, "assumir próximo" atômico e transferência entre filas sem perder a Flow Execution — e agora **a lateral do chat virou o Cliente 360**: ficha do assinante, Context Cards, diagnóstico por tool, com **PII mascarada no servidor** e permissões que finalmente decidem alguma coisa — e a IA passou a **consultar uma base de conhecimento** em vez de inventar procedimento, com workflow editorial, versionamento e registro de lacunas — e a seguir **procedimentos oficiais (playbooks)** entram no prompt a cada turno, com a etapa dada por cumprida pela **ferramenta que a evidencia**, não pelo que o modelo diz ter feito — e a IA ganhou **regras de casa que nenhum nó desliga**: hierarquia de confiança, lista nominal do que não se inventa, guardrails de segurança de campo, motivo de transferência estruturado e **handoff** que diz ao humano o que já foi tentado — e o atendente ganhou um **copiloto** que decide se a hora é de responder, consultar ou avançar o procedimento, em vez de sempre escrever um parágrafo — e o atendimento encerrado passa por **auditoria com evidência**, nota revisável por humano e coaching por padrão — e os **indicadores** deixaram de mentir: a "resolução IA" era ~100% por construção. Por fim, **log estruturado com correlation ID que atravessa webhook → worker → motor → SGP**, PII redigida no log, disjuntor no SGP, error tracking com deduplicação e uma tela de **Saúde do Sistema** para operador não-técnico. Suítes: **495 testes puros + 278 de integração** contra Postgres e Redis reais, mais **CI no GitHub Actions**.

Detalhe por fase em [brain/work/tasks/](brain/work/tasks/); plano completo em [docs/ers/](docs/ers/).

### ✅ O `main` ESTÁ em produção (FASE 5 confirmada em 2026-08-22 14:04 UTC)

Confirmado por sonda de rota repetida: `GET /api/atendimento/filas` responde **401 em 12 de 12 requisições** (a rota nasceu na FASE 5) e `/health/ready` responde **200** — o que também prova que as migrations até a **017** rodaram no banco de produção. As FASES 1 a 5 estão no ar, o XSS do handshake da Meta incluído.

O deploy levou ~10 min depois do push, passou por uma janela de **rollout parcial** (404 e 401 alternando na mesma URL) e **não mexeu no `last-modified` de `GET /`** — não confie nessa sonda, nem numa única requisição (ver as armadilhas acima).

Pendências de produto: rodar um atendimento real pelo WhatsApp (volume segue ~zero); destravar o deploy; parametrizar o acoplamento NetGo para revenda.

> **Branch `dev`** tem 21 commits (WhatsApp via QR Code, de outro programador) que **não estão no `main`** e nunca foram deployados. Decisão de 2026-08-21: deixar de lado por ora.
