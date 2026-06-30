# Brain Index — Maxxi v2

Last rebuilt: 2026-06-30

> Índice do conhecimento sobre o Maxxi v2 / GoCHAT. Rode `/brain rebuild-index` após mudanças manuais.

## Systems — Maxxi v2 / GoCHAT

- **Maxxi v2 / GoCHAT — Visão geral** (também: Maxxi, GoCHAT, AtendimentoApp) — produto de atendimento omnichannel com IA para ISP; ponto de entrada — `systems/maxxi/overview.md`
- **Runbooks Maxxi** (também: subir Maxxi, deploy, Coolify) — como subir em dev e fazer deploy; configurar a instância — `systems/maxxi/runbooks/subir-e-deploy.md`

### Componentes
- **Motor de Fluxo** (motorFluxo, execução de fluxo) — interpretador de grafo do atendimento, estado em memória, padrão 2 fases — `systems/maxxi/components/motor-fluxo.md`
- **Catálogo de Nós** (tipos de nó, etapas do fluxo, nodeTypes) — referência nó-a-nó dos ~30 nós (portas, config, contexto) — `systems/maxxi/components/catalogo-de-nos.md`
- **IA com Tool Calling** (Claude, iaTools, promptService, ia_responde/roteador) — loop agêntico + 15 tools SGP + composição de prompts — `systems/maxxi/components/ia-tool-calling.md`
- **Integração SGP** (integrations.js, Evolution, precadastro) — camada de ERP de ISP + WhatsApp não-oficial — `systems/maxxi/components/integracoes-sgp.md`
- **Canais e Webhooks** (Evolution/Meta/Telegram) — ingestão de mensagens — `systems/maxxi/components/canais-e-webhooks.md`
- **Supervisora IA** (sentimento, SLA do agente, sugestões) — IA que assiste o agente humano — `systems/maxxi/components/supervisora-ia.md`
- **Fila e SLA** (filaService, urgência, agente fantasma) — fila de espera e alertas — `systems/maxxi/components/fila-e-sla.md`
- **Realtime SSE** (sseManager, broadcast) — entrega em tempo real (+ bug do Redis) — `systems/maxxi/components/realtime-sse.md`
- **Auth e Segurança** (JWT, permissões, dívida) — autenticação e postura de segurança — `systems/maxxi/components/auth-e-seguranca.md`
- **Modelo de Dados** (schema, migrations, 21 tabelas) — Postgres/Knex, single-tenant — `systems/maxxi/components/modelo-de-dados.md`
- **Frontend Maxxi** (apps/web, React, Zustand, useChat) — painel e suas 21 páginas — `systems/maxxi/components/frontend.md`
- **Design System Maxxi** (tokens, tema light) — paleta navy+laranja, fontes — `systems/maxxi/components/design-system.md`
- **API Backend Maxxi** (Express, rotas) — superfície REST (~62 endpoints) — `systems/maxxi/components/api-backend.md`

### Telas (abas)
- **Telas e Navegação** (abas, menu, sidebar, rotas) — mapa das telas, guards e integração entre abas — `systems/maxxi/telas/telas-e-navegacao.md`
- **Abas de Atendimento** (Chat, Histórico, Satisfação) — telas do agente no dia a dia — `systems/maxxi/telas/atendimento.md`
- **Abas de Configuração** (Dashboard, Agentes, Fluxos, Canais, Prompts IA, Configurações) — montagem e parametrização (admin) — `systems/maxxi/telas/configuracao.md`
- **Abas de Operações e Infraestrutura** (Clientes, Ocorrências, Ordens, Cobertura, Monitor) — operação ISP + telas sem rota e stubs — `systems/maxxi/telas/operacoes.md`

## Domains
- **SGP** (Sistema de Gestão de Provedores, ERP ISP) — domínio do ERP e vocabulário ISP — `domains/sgp.md`

## Strategy / Decisions
- **Adotar o Maxxi v2 como base** (Maxxi vs Atendechat, multi-tenancy por instância) — decisão de base do produto — `strategy/decisions/2026-06-30_adotar-maxxi-base.md`

## People
- **Christian** (Chrisw16, dono do produto) — dono/dev do Maxxi, ligado à NetGo Internet — `people/christian.md`

## Work
- **Achados de código (2026-06-30)** (bugs, dívida técnica, segurança) — levantamento do estudo estático — `work/bugs/2026-06-30_achados-codigo.md`
- **Auditoria profunda (2026-06-30)** (auditoria pesada, mismatches editor↔motor) — 4 agentes + verificação; CONFIRMADO vs PLAUSÍVEL — `work/bugs/2026-06-30_auditoria-profunda.md`
