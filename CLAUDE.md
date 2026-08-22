# CLAUDE.md — Maxxi v2 / GoCHAT

Guia operacional para trabalhar neste repositório. Documentação detalhada (memória institucional) fica no **brain** em [brain/](brain/) — comece por [brain/systems/maxxi/overview.md](brain/systems/maxxi/overview.md).

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
  migrations/versions/   001..016 — modelo de dados (rode em ordem; NUNCA ALTER TABLE solto)
  repositories/          conversaRepository.js, mensagemRepository.js (toda query de conversa/msg)
  routes/                auth, chat, webhooks (públicas) + agentes, fluxos, prompts, dashboard, filas, ... (autenticadas)
  services/
    motorFluxo.js        ★ motor de execução do fluxo (1032 LOC) — o coração
    fluxoHelpers.js      funções puras do motor (normaliza campos editor↔motor, escala NPS) + testes
    integrations.js      ★ SGP (URA/precadastro) + Evolution + getAnthropicClient
    iaTools.js           15 tools Anthropic (executarTool)
    promptService.js     resolverPrompt(slug) — compõe system prompt do banco
    supervisoraIA.js     sentimento + SLA do agente + sugestões
    filaService.js       fila/SLA (monitor 60s)
    inbox.js outbox.js jobs.js  ★ filas da FASE 4 (entrada durável, envio write-ahead, relógio)
    filaDb.js            reivindicação com SKIP LOCKED + lease (as 3 filas usam)
    politicaRetry.js     ★ puro: TTL/_parkedAte, backoff, expiração, destino de lease + testes
    workerFilas.js       tick de 5s: reclaim → inbox → outbox → jobs → purga
    sseManager.js        broadcast/sendToAgente
    telegram.js          envio Telegram
    canais/              ★ adapters de ENVIO por canal (evolution.js, telegram.js) + dispatcher
    webhooks/            evolution.js, meta.js, telegram.js (entrada das mensagens)
                         metaSeguranca.js — handshake/assinatura da Meta (puro, testável)
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

**Testes:** `cd apps/api && npm test` (runner nativo `node --test`, zero deps) — **249 testes puros**, rodam em qualquer máquina sem serviço nenhum. `motorFluxo.js` **não é importável em teste** (puxa `config/db.js` → Knex no topo e as deps não ficam instaladas localmente); por isso toda lógica testável vive em **módulos puros** ao lado dele — escreva o teste primeiro (TDD):
- `fluxoHelpers.js` — resolução de campos editor↔motor + escala NPS.
- `politicaRetry.js` — **as decisões de tempo da FASE 4** num lugar só (§130): `expirou()` (TTL de 2 h, `_parkedAte`, teto de 72 h), backoff, `expiraEm` por canal, e `destinoLease` — a regra "leitura retenta, escrita não" (§23) mora aqui.
- `fluxoValidador.js` (+`.cli.js`) — **validador estático** do grafo do fluxo: pega beco sem saída (cliente perdido), porta não conectada, nó inalcançável, aresta órfã, loop sem espera (trava). `node src/services/fluxoValidador.cli.js examples/fluxo-exemplo.json`.
- `motorLoop.js` — o loop do motor extraído como função pura (`executarLoop`). ⚠️ **Divergiu na FASE 1**: o laço real virou assíncrono na persistência (`await estados.set/delete` num `finally`, grafo congelado, `fim({manter})`). Este arquivo — e o `motorSimulador.js` que roda sobre ele — espelham o laço **pré-FASE-1**. "Espelho byte-a-byte" hoje vale só para a travessia (qual nó vem depois), não para o ciclo de vida da execução.
- `motorSimulador.js` (+`.cli.js`) — **simulador** de conversa multi-turno sobre o `executarLoop` (passo a passo, detecta concluido/travado/perdido/aguardando). `node src/services/motorSimulador.cli.js <fluxo.json> [cenario.json]`.

**Testes de integração** (`apps/api/tests/integracao/`, `npm run test:integracao`) — **82 testes**, provam o que só o banco/Redis provam: dedup por `external_id`, SSE cruzando instâncias, migrations replay-safe, os **critérios de aceite do motor persistente** (§14) e os **14 critérios da FASE 4** (`fase4-filas.test.js`: dedup por hash, ordem por conversa, lease vencido, espera com relógio). É o único lugar onde o `motorFluxo.js` roda de verdade num teste (`DATABASE_URL` está posta, então ele importa). **Não há Docker nesta máquina**; o Postgres é nativo (`brew install postgresql@16`). Eles se **pulam** sem as envs, então `npm test` segue verde em qualquer lugar:
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
- **Migrations:** cada mudança de schema é um arquivo novo em `apps/api/src/migrations/versions/NNN_nome.js` com `up(db)`/`down(db)`. Runner próprio (tabela `_migrations`, transacional, ordenado por nome). Nunca rode `ALTER TABLE` direto. **Escreva idempotente** (`hasColumn`/`IF NOT EXISTS`) — o rastreamento é **por nome de arquivo**, então renomear uma migration já aplicada faz ela rodar de novo. ✅ **As 12 são replay-safe, e há teste travando isso** (`tests/integracao/migrations-replay.test.js`). `001` e `002` não eram — usavam `createTableIfNotExists`, deprecado no knex, que emite o `CREATE TABLE IF NOT EXISTS` mas dispara `ADD CONSTRAINT`/`CREATE INDEX` incondicionalmente; corrigidas em 2026-08-21 com um helper local `criarTabela()` + guarda `hasTable`. **Nunca use `createTableIfNotExists`** — migration que falha no boot pula os monitores de SLA e da supervisora. A sequência tem um buraco no **010** de propósito: 011/012/013 foram renumeradas na reconciliação de 2026-08-21 e as originais (008/009/010) já constam no `_migrations` de produção.
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
- **Catálogo de nós tem duas faces:** `apps/web/src/lib/nodeTypes.js` (visual, ~32 tipos) deve espelhar o `switch` de `processarNo` em `motorFluxo.js` (backend). Ao adicionar um nó, atualize os dois + o painel de propriedades **dentro de `FluxoEditor.jsx`** (`components/fluxo/PropsPanel.jsx` era arquivo morto e foi removido na FASE 2). Há **teste de contrato** entre `nodeTypes.js`, o `NOS` do validador e o `switch` do motor — ele falha quando a divergência cresce. **Cuidado com o nome dos campos:** o `PropsPanel` historicamente salvou campos com nomes que o motor não lia (`botao`/`secao`/`instrucao`/`tipo`), então a config era ignorada na execução. Hoje `fluxoHelpers.js` normaliza esses casos (lê o nome do editor com fallback pro antigo) — mas **a regra é manter os nomes iguais nas duas faces**; o helper é rede de segurança, não desculpa pra divergir.
- **Envio por canal passa pelo registry `services/canais/`**, nunca por `if (canal === ...)`. Cada provedor é um adapter com **um método por tipo de mensagem** (`texto`, `botoes`, `lista`, `cta`, `imagem`, `audio`, `arquivo`); o dispatcher resolve por `conversas.canal`. Regras não-óbvias: **a degradação mora dentro do adapter** (o Telegram degrada `lista`→**botões** com ≤8 itens, não para texto); tipo não implementado usa o método **`padrao`**, que **só o Telegram tem** — a Evolution não tem de propósito, porque hoje ela descarta tipos desconhecidos (inclusive `localizacao`) em silêncio, e um fallback genérico mudaria isso. Os adapters recebem os transportes por **injeção** para serem testáveis sem rede.
- **`enviarResposta` faz muito mais que enviar:** guarda de `resp.texto` vazio, persistência da mensagem, broadcast SSE e guarda de `chatId` acontecem **antes** do despacho. Ao mexer ali, só o trecho de despacho pertence ao registry. O `chat.js` ainda tem o `if/else` antigo (só texto) — migra quando precisar tratar `whatsapp_oficial`.
- **Prompts da IA são editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA: abas Prompts/Catálogo/Testar Tools). Placeholders `[REGRAS]/[ESTILO]/[PLANOS]/[TIPOS_OCORRENCIA]` resolvidos por `promptService`. Cuidado: há **dois caches** (`integrations.invalidateConfigCache` e `promptService` TTL 3min) — editar prompt invalida só um.
- **Nó `IA Responde` tem 3 campos com papéis distintos:** `contexto` = **slug** do prompt da tela (vira a base; slug inexistente → fallback genérico — o `contexto` precisa bater **exato**, ex. `suporte` não `"Suporte Técnico"`); `instrucao`/"instruções extras" = texto somado por cima da base; `tools_ativas` = **quais** tools a IA pode chamar (o prompt não registra tool, só orienta). Detalhe em [brain/systems/maxxi/components/ia-tool-calling.md](brain/systems/maxxi/components/ia-tool-calling.md).
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
- **Ligue SEMPRE a porta `saida` dos menus** (`enviar_botoes`/`enviar_lista`) — é o fallback de quando o cliente digita algo fora das opções. Solta, o motor cai no 3º fallback do `encontrarProximo` (**primeira aresta qualquer**) e manda o cliente para um ramo arbitrário, em silêncio.
- **`cfg.tools_ativas` no `ia_responde`** define as tools por ramo. Sem ele vale uma lista padrão de suporte; `precadastrar_cliente` fica de fora de propósito e precisa ser ativada explicitamente (só no ramo comercial).
- **Rode o validador antes de ativar**: alvo é 0 erros **e** 0 avisos.

- **O 200 do webhook NUNCA esperou o turno de IA.** Antes da FASE 4 os handlers faziam `processarConversa(...).catch(...)` sem `await`; hoje a rota nem chama o handler — ela grava no `inbox` e responde. Não repita a afirmação de que "o turno de IA segura a resposta do webhook": é falsa e já contaminou uma spec. O ganho do Inbox foi **durabilidade**, não latência.
- **`estado.aguardando` não distingue quem acordou o fluxo** — por isso a FASE 4 criou `aguardandoTimer` e o `tipo:'timer'`. Ao adicionar OUTRA forma de retomada (SLA, callback de provedor), repita o padrão: campo próprio + tipo próprio. `'sistema'` faz o `ia_responde` pausar e `'texto'` vazio faz a Anthropic recusar — os dois já foram bugs.
- **Todo efeito colateral novo do motor precisa do gate `if (!ctx.sandbox)`**. O sandbox usa ids `sandbox:<uuid>`/`share:<uuid>`, que não são uuid — `estadoStore` tem guarda (`ehUuid`), `agendarTimer` e o outbox também; tabela nova não terá.

## Armadilhas conhecidas (bugs/dívidas — ver [brain/work/](brain/work/))

- **Conversa duplicada e protocolo colidindo — corrigidos na FASE 1 (migration 014).** Os 3 webhooks faziam check-then-act (`porTelefoneCanal` → `criar`): duas mensagens simultâneas de um número novo criavam **duas conversas**. Agora todos passam por **`conversaRepo.obterOuCriar`** (devolve `{conversa, nova}` — só quem criou emite `nova_conversa` no SSE) sobre uma **unique parcial** `conversas(telefone, canal) WHERE status <> 'encerrada'`. O protocolo era `COUNT(*) do dia + 1`: retry na aplicação **não converge** (medido: 8 chamadas concorrentes ainda colidiam na 5ª tentativa); virou a tabela `protocolo_seq` com `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, atômico por construção. ⚠️ Mesma armadilha da 008: o `down()` da 014 derruba índice usado por `onConflict` — **não rode em produção**.
- **Os 4 críticos da auditoria foram corrigidos em 2026-08-21** (race de estado do fluxo → `filaPorChave.js`; `sgp_url` não salvava; Canais apagava config; dedup de webhook → migration 008 + `onConflict`). ✅ **Validados contra Postgres real em 2026-08-21** (FASE 0) — 6 testes, incluindo o caso concorrente. ⚠️ Descoberta: `onConflict('external_id')` é **incondicional**, então sem o índice único da 008 o Postgres recusa **todo** insert de mensagem, não só duplicatas — o `down()` da 008 derruba a ingestão inteira, **nunca rode em produção**. O lado bom: uma instância que armazena mensagens prova por comportamento que a 008 aplicou.
- **Mismatches editor↔motor — maioria fechada na FASE 2 (2026-08-22)**, travada por `tests/contrato-catalogos.test.js` (importa `nodeTypes.js` direto do `apps/web` — JS puro — e compara com o `NOS` do validador e o `switch` do motor): dois bugs **ativos** no `ia_responde` corrigidos (tela gravava `prompt`/`max_turns`, motor preferia `instrucao`/`max_turnos` em direções **contrárias** — editar instrução não tinha efeito, e encostar em "máx. turnos" derrubava cadastro de 25→5; fonte única agora em `camposIaResponde` de `fluxoHelpers.js`); escala do NPS configurável; defaults de tools alinhados (`TOOLS_PADRAO` em `fluxoHelpers.js` = `IA_TOOLS_DEFAULT` em `nodeTypes.js`); portas mortas removidas da paleta (`sem_localizacao`/`erro`, `sem_agente`) e `abrir_chamado`/`enviar_email` alinhados ao que o motor emite; 5 stubs órfãos do provedor de inspiração deletados. **Ainda abertos:** `gatilho_keyword` (filtro inerte), campos inertes da tela (`enviar_cta.rodape`, `alias`, `ia_menu_ativo`, `transferir_agente.motivo/fila` — fila é FASE 5), e o nó `listar_planos` (SGP) vs tool `listar_planos_ativos` (tabela local): **mesma pergunta, duas respostas**.
- ~~`sseManager.js` importa `redis` mas o pacote é `ioredis`~~ → **corrigido (2026-08-21)**: migrado para a API do `ioredis`. ✅ **Conexão real validada em 2026-08-21** (FASE 0): broadcast cruza instâncias, `sendToAgente` respeita o destinatário e `ehEcoProprio` impede a entrega dupla.
- **⚠️ Sonda de deploy: use uma ROTA que só existe no código novo, não o `last-modified`.** Medido em 2026-08-22: o push das 04:17 UTC (FASE 4) **deployou** às ~04:26 (≈9 min), e o `last-modified` de `GET /` **não se moveu** — seguiu marcando 03:31. Ou seja, a sonda que esta doc recomendava dá falso negativo. O que respondeu a verdade foi `GET /api/filas`: **404 = código antigo, 401 = código novo no ar** (a rota existe e exige token). Ao entregar uma fase, escolha uma rota nova dela e sonde por status.
- **⚠️ O deploy automático do Coolify é INTERMITENTE (revisto em 2026-08-21).** Não é que nunca deploye: das 3 entregas de 21/08 (19:20, 19:55, 22:54 UTC), **a #1 virou deploy** (`index.html` reconstruído às 20:06 UTC) e as outras duas **se perderam** — por isso a correção do XSS (`f8ed98f`, pushada às 19:55) segue fora do ar. Todas voltaram **200 OK**, e é aí que mora a armadilha: o webhook é do tipo **`manual`** do Coolify (`/webhooks/source/github/events/manual`), que **responde 200 mesmo quando recusa** e põe o motivo no *corpo*. Ler só o status engana.
  - **Config atual (`gh api repos/Chrisw16/AtendimentoApp/hooks`):** `http://72.60.53.164:8000/...` — **HTTP puro**, IP cru, `insecure_ssl=1`, **sem secret**. O payload do push trafega em claro.
  - **Para diagnosticar:** ler o *corpo* da resposta da entrega (GitHub → Settings → Webhooks → Recent Deliveries → Response), ou `gh auth refresh -h github.com -s admin:repo_hook` e depois `gh api repos/Chrisw16/AtendimentoApp/hooks/611298182/deliveries/<id>`. E o log da aba **Deployments** no Coolify.
  - Consequência prática: **pushar não é deployar** neste projeto. Confirme sempre com sonda antes de dar algo como entregue — o `last-modified` de `GET /` é o carimbo de build mais confiável (`/health` devolve `2.0.0` fixo e não serve).
- ~~`GET /api/webhooks/meta` refletia HTML arbitrário sem autenticação~~ → **corrigido (2026-08-21, commit `f8ed98f`)**. A rota comparava `token === process.env.META_VERIFY_TOKEN`; com a env ausente, `undefined === undefined` passava, e `res.send(challenge)` responde `text/html`. Confirmado ao vivo na produção. Somado à CSP desligada + JWT em `localStorage` + `GET /api/sysconfig` em texto plano, a cadeia terminava em roubo de sessão de admin. Agora `verificarHandshake` é **fail-closed**, compara em tempo constante e responde `text/plain`. **Mitigação sem deploy: definir `META_VERIFY_TOKEN` no ambiente.**
- ~~`GET /api/sysconfig/:chave` lia qualquer chave do `sistema_kv`~~ → **corrigido (2026-08-21)**: a allowlist `CHAVES_PUBLICAS` governava só o `PUT` e o GET agregado.
- ~~`GET /api/sysconfig` retorna API keys em texto plano~~ → **corrigido na FASE 3 (2026-08-22)**: mascarado nas duas rotas de GET, e cifrado em repouso quando há `KV_SECRET`. Ver a regra de credenciais acima.
- ~~Nós de SGP sem bloco no PropsPanel / "o cliente nunca é perguntado pelo CPF"~~ → **a armadilha descrevia um ARQUIVO MORTO** (descoberto na FASE 2): `components/fluxo/PropsPanel.jsx` não era importado por ninguém — o painel vivo mora **dentro** de [FluxoEditor.jsx](apps/web/src/pages/FluxoEditor.jsx) (`PropsPanel`, ~linha 320) e sempre teve campo para `consultar_cliente.pergunta`. Os dois arquivos mortos (`PropsPanel.jsx`, `FlowNode.jsx`) foram removidos em 2026-08-22. **Regra que fica: o painel de propriedades e o nó visual são os de `FluxoEditor.jsx`** — não crie/edite versões em `components/fluxo/`.
- ~~Simulador diverge do motor no `consultar_cliente`~~ → **corrigido (FASE 2)**: o simulador agora espelha o motor (`cfg.pergunta`, sem default inventado; sem ela, silêncio — como a produção). Teste em `motorSimulador.test.js`.
- ~~Mass-assignment em PUT de `ocorrencias`/`ordens`/`tarefas`; `tarefas` sem ownership-check~~ → **corrigido na FASE 3 (2026-08-22)**: allowlist de colunas por rota e ownership em `tarefas` (dono ou admin).
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
| 5–13 | abertas |

## Estado do produto (2026-08-22)

**Está EM PRODUÇÃO**, em VPS via Coolify: `https://gochat.netgo.net.br`. O SGP responde de verdade e a IA comercial roda com tool calling — pré-cadastro, `listar_planos_ativos` e `salvar_dado` exercitados em conversa real.

### Plano de Evolução V1.0 — 5 de 13 fases entregues

| Fase | Estado |
|---|---|
| **0** — Reconciliação e linha de base | ✅ mergeada |
| **1** — Flow Engine persistente (P0) | ✅ mergeada |
| **2** — Registry Foundation | ✅ mergeada |
| **3** — Segurança e governança base | ✅ mergeada |
| **4** — Inbox, Outbox e Jobs | ✅ implementada (2026-08-22) |
| 5–13 | ⬜ não começadas |

O que mudou de estrutural: **conversa sobrevive a restart e deploy** (`flow_executions`, versão do fluxo congelada por conversa), **credencial não sai mais em texto plano** e há cripto em repouso oportunista, **`/health/ready` bloqueia até as migrations terminarem**, há **graceful shutdown**, e agora **mensagem que entra é durável, envio é write-ahead e `aguardar_tempo` espera de verdade** (`inbox`/`outbox`/`jobs`). Suítes: **249 testes puros + 82 de integração** contra Postgres e Redis reais.

Detalhe por fase em [brain/work/tasks/](brain/work/tasks/); plano completo em [docs/ers/](docs/ers/).

### ✅ O `main` ESTÁ em produção (2026-08-22 04:26 UTC)

Confirmado por sonda de rota: `GET /api/filas` responde **401** (a rota nasceu na FASE 4) e `/health/ready` responde **200** — o que também prova que as migrations até a **016** rodaram no banco de produção. As FASES 1 a 4 estão no ar, o XSS do handshake da Meta incluído.

O deploy levou ~9 min depois do push e **não mexeu no `last-modified` de `GET /`** — não confie nessa sonda (ver a armadilha acima).

Pendências de produto: rodar um atendimento real pelo WhatsApp (volume segue ~zero); destravar o deploy; parametrizar o acoplamento NetGo para revenda.

> **Branch `dev`** tem 21 commits (WhatsApp via QR Code, de outro programador) que **não estão no `main`** e nunca foram deployados. Decisão de 2026-08-21: deixar de lado por ora.
