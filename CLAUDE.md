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
  migrations/versions/   001..007 — modelo de dados (rode em ordem; NUNCA ALTER TABLE solto)
  repositories/          conversaRepository.js, mensagemRepository.js (toda query de conversa/msg)
  routes/                auth, chat, webhooks (públicas) + agentes, fluxos, prompts, dashboard, ... (autenticadas)
  services/
    motorFluxo.js        ★ motor de execução do fluxo (1032 LOC) — o coração
    fluxoHelpers.js      funções puras do motor (normaliza campos editor↔motor, escala NPS) + testes
    integrations.js      ★ SGP (URA/precadastro) + Evolution + getAnthropicClient
    iaTools.js           15 tools Anthropic (executarTool)
    promptService.js     resolverPrompt(slug) — compõe system prompt do banco
    supervisoraIA.js     sentimento + SLA do agente + sugestões
    filaService.js       fila/SLA (monitor 60s)
    sseManager.js        broadcast/sendToAgente
    telegram.js          envio Telegram
    webhooks/            evolution.js, meta.js, telegram.js (entrada das mensagens)
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

**Testes:** `cd apps/api && npm test` (runner nativo `node --test`, zero deps). `motorFluxo.js` **não é importável em teste** (puxa `config/db.js` → Knex no topo e as deps não ficam instaladas localmente); por isso toda lógica testável vive em **módulos puros** ao lado dele — escreva o teste primeiro (TDD):
- `fluxoHelpers.js` — resolução de campos editor↔motor + escala NPS.
- `fluxoValidador.js` (+`.cli.js`) — **validador estático** do grafo do fluxo: pega beco sem saída (cliente perdido), porta não conectada, nó inalcançável, aresta órfã, loop sem espera (trava). `node src/services/fluxoValidador.cli.js examples/fluxo-exemplo.json`.
- `motorLoop.js` — o **loop real** do motor extraído como função pura (`executarLoop`), espelho byte-a-byte; pronto pra religar no `processarConversa` (deferido: precisa Docker pra validar).
- `motorSimulador.js` (+`.cli.js`) — **simulador** de conversa multi-turno sobre o `executarLoop` (passo a passo, detecta concluido/travado/perdido/aguardando). `node src/services/motorSimulador.cli.js <fluxo.json> [cenario.json]`.

**Testar fluxo no app** (tela Fluxos → botão "Testar fluxo" → `TesteFluxoModal`): `POST /fluxos/:id/validar` (relatório estático), `/simular` (roteirizado) e `/simular-real` (roda o motor de verdade com SGP+IA em **modo sandbox** — `processarConversa(c,msg,{fluxo,estados,enviar,sandbox})`; em sandbox, reads são reais mas tudo que grava é simulado, inclusive as tools de IA via gate no `executarTool`). **Link público de teste** `/teste/<token>` (rota pública `chat-teste`, sem login, sandbox, revogável; coluna `fluxos.share_token`).

Detalhe em [brain/systems/maxxi/components/testes-de-fluxo.md](brain/systems/maxxi/components/testes-de-fluxo.md). Próximos passos abertos (memória/janela da IA, pré-cadastro real) em [brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md](brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md).

**Produção (Coolify):** o **Dockerfile raiz** é multi-stage — builda `apps/web` e copia `dist` para `apps/api/apps/web/dist`; a API serve frontend + API no **mesmo container** (porta 4000). Migrations rodam em background no boot. Runbook: [brain/systems/maxxi/runbooks/](brain/systems/maxxi/runbooks/). Webhook Evolution de produção: `https://gochat.netgo.net.br/api/webhooks/evolution`.

## Convenções e regras (não-óbvias — leia antes de mexer)

- **Credenciais de integração vivem no BANCO (`sistema_kv`), não em env.** SGP, Evolution, Anthropic, OpenAI, Telegram são configurados pela tela admin (**Configurações** / **Canais**) e gravados em `sistema_kv`. Só **infra** vem de env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `META_VERIFY_TOKEN`, `ERP_URL`/`ERP_API_KEY`. Muitas vars do `.env.example` (IMAP/SMTP/ASTERISK/VAPID/META_ACCESS_TOKEN) **não são lidas pelo código** — são aspiracionais.
- **Migrations:** cada mudança de schema é um arquivo novo em `apps/api/src/migrations/versions/NNN_nome.js` com `up(db)`/`down(db)`. Runner próprio (tabela `_migrations`, transacional, ordenado por nome). Nunca rode `ALTER TABLE` direto.
- **Estado do fluxo é em memória** (`estadosExecucao` Map em `motorFluxo.js`) — **perde no restart**. Conversas em meio de fluxo recomeçam.
- **Catálogo de nós tem duas faces:** `apps/web/src/lib/nodeTypes.js` (visual, ~32 tipos) deve espelhar o `switch` de `processarNo` em `motorFluxo.js` (backend). Ao adicionar um nó, atualize os dois + `PropsPanel.jsx`. **Cuidado com o nome dos campos:** o `PropsPanel` historicamente salvou campos com nomes que o motor não lia (`botao`/`secao`/`instrucao`/`tipo`), então a config era ignorada na execução. Hoje `fluxoHelpers.js` normaliza esses casos (lê o nome do editor com fallback pro antigo) — mas **a regra é manter os nomes iguais nas duas faces**; o helper é rede de segurança, não desculpa pra divergir.
- **Prompts da IA são editáveis em runtime** (tabela `prompts_ia`, tela Prompts IA: abas Prompts/Catálogo/Testar Tools). Placeholders `[REGRAS]/[ESTILO]/[PLANOS]/[TIPOS_OCORRENCIA]` resolvidos por `promptService`. Cuidado: há **dois caches** (`integrations.invalidateConfigCache` e `promptService` TTL 3min) — editar prompt invalida só um.
- **Nó `IA Responde` tem 3 campos com papéis distintos:** `contexto` = **slug** do prompt da tela (vira a base; slug inexistente → fallback genérico — o `contexto` precisa bater **exato**, ex. `suporte` não `"Suporte Técnico"`); `instrucao`/"instruções extras" = texto somado por cima da base; `tools_ativas` = **quais** tools a IA pode chamar (o prompt não registra tool, só orienta). Detalhe em [brain/systems/maxxi/components/ia-tool-calling.md](brain/systems/maxxi/components/ia-tool-calling.md).
- **Acoplamento NetGo:** POP/portador/`nas_id=53` (`RTR_BNG_NETGO_02`) e textos estão hardcoded em `integrations.js` e nos prompts seed. A API do SGP tem `list` de NAS/POP/portador/plano p/ de-hardcodar por instância. **Estudo completo da API do SGP (237 endpoints, 13 módulos)** em [brain/domains/sgp-api/overview.md](brain/domains/sgp-api/overview.md). Qualquer revenda exige parametrizar isso.
- **Planos comerciais (Configurações → Planos, tabela `planos`):** alimentam a tool `listar_planos_ativos`. `cidade` vazia = vale p/ **todas** (multi-cidade por vírgula); `valor` = preço normal + `valor_promocional`/`promo_meses` = promoção dos primeiros meses; `beneficios` = texto (um por linha). Migrations 008/009.
- **Memória da IA (estruturada, 2026-07-01):** o `ia_responde` guarda o que a IA coleta como **variável de fluxo** — a tool `salvar_dado` grava em `ctx.estado.contexto[campo]` e `montarFichaColetada` reinjeta o bloco `## DADOS JÁ COLETADOS` no system prompt **todo turno**, então cadastro longo não re-pergunta. O histórico cru (`.slice(-50)`) segue só pro tom. Nó de cadastro precisa de `max_turns≈25`. Detalhe em [brain/systems/maxxi/components/memoria-estruturada-ia.md](brain/systems/maxxi/components/memoria-estruturada-ia.md). Toda conversa de produção nasce com `protocolo`; no sandbox o protocolo é fabricado (`AAAAMMDD-TESTE`). **⏳ PENDENTE:** validar a memória numa **conversa real com a IA** (até 2026-07-01 só foi validado o pré-cadastro isolado no Testar Tools).
- **Pré-cadastro real (SGP):** `precadastrarCliente` grava em **modo lead** (`precadastro_ativar=0`; o SGP só exige `nome`+`logradouro`) — a equipe monta o contrato. Endpoint de planos correto é `/api/precadastro/plano/list` (o antigo `/api/ura/planos/` dava 404); `datanasc` normalizado p/ `AAAA-MM-DD`; `nas_id=53`. Detalhe em [brain/systems/maxxi/components/precadastro-real.md](brain/systems/maxxi/components/precadastro-real.md). **⏳ PENDENTE:** enxugar os logs de debug ligados na validação — `[SGP] precadastro/F params:` (grava PII + `senha` padrão no console), `[SGP] precadastro/F resposta:` e `[IA] salvar_dado →` — depois de validar ao vivo.

## Armadilhas conhecidas (bugs/dívidas — ver [brain/work/](brain/work/))

- **Mismatches editor↔motor (parcialmente corrigidos):** 4 já resolvidos via `fluxoHelpers.js` (`enviar_lista`, `abrir_chamado`, `ia_responde`, `nps_inline`). **Ainda abertos:** `gatilho_keyword` (filtro de palavra inerte), `aguardar_resposta` (`timeout`/`max_tentativas` ignorados — falta scheduler), `condicao_multipla` (sem editor no PropsPanel + porta por `ramo.id`×`ramo.porta`), portas mortas (`solicitar_localizacao`, `transferir_agente`), `enviar_cta` `rodape`. Detalhe em [brain/work/bugs/2026-06-30_auditoria-profunda.md](brain/work/bugs/2026-06-30_auditoria-profunda.md).
- `sseManager.js` importa `redis` mas o pacote é `ioredis` → Redis SSE provavelmente nunca conecta (cai em modo local; broadcast não cruza instâncias).
- `GET /api/sysconfig` retorna **API keys em texto plano** (sem mascaramento).
- Mass-assignment em PUT de `ocorrencias`/`ordens`/`tarefas`; `tarefas` sem ownership-check.
- `Tarefas.jsx` e `Financeiro.jsx` existem mas **não têm rota** em `App.jsx`. `Clientes.jsx` tem `useDebounce` quebrado.
- Meta gera mídia em `/api/media/:id` mas **não há rota `/api/media`** montada.
- Resíduos do provedor de inspiração ("CITmax") em `seed.js` e na tool `status_rede`. Fluxo padrão do seed é legado e não roda no motor atual.

## Design system

Tema **LIGHT** (atual): branco predominante, acentos **navy `#2050B8`** + **laranja `#E8572A`**. Fontes Plus Jakarta Sans (corpo), JetBrains Mono (código), Syne (display). Tokens em [apps/web/src/styles/tokens.css](apps/web/src/styles/tokens.css). (O README descreve um tema escuro `#00E5A0` **antigo/desatualizado** — `#00E5A0` hoje só aparece nas cores de nó do editor de fluxo.)

## Estado do produto (auditoria estática 2026-06-30, ainda não validado rodando)

Atendimento ponta-a-ponta ~95% (Evolution/WhatsApp e Telegram melhores que Meta); núcleo e frontend de atendimento usáveis; SGP+IA prontos (faltam credenciais). Pendências: validar rodando, endurecer segurança, fechar endpoints de Canais/Config, automatizar deploy-por-cliente. Detalhe por módulo em [brain/systems/maxxi/overview.md](brain/systems/maxxi/overview.md).
