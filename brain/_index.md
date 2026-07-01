# Brain Index — Maxxi v2

Last rebuilt: 2026-07-01

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
- **Testes de Fluxo** (validador estático, simulador de conversa, motorLoop) — pega trava/limbo/cliente perdido sem subir nada — `systems/maxxi/components/testes-de-fluxo.md`
- **Memória estruturada da IA** (salvar_dado, ficha, cache da IA) — a IA não re-pergunta dado coletado; vira variável de fluxo — `systems/maxxi/components/memoria-estruturada-ia.md`
- **Pré-cadastro real** (precadastrarCliente, lead, cadastro comercial SGP) — grava cliente no SGP em modo lead; correções da validação real — `systems/maxxi/components/precadastro-real.md`

### Telas (abas)
- **Telas e Navegação** (abas, menu, sidebar, rotas) — mapa das telas, guards e integração entre abas — `systems/maxxi/telas/telas-e-navegacao.md`
- **Abas de Atendimento** (Chat, Histórico, Satisfação) — telas do agente no dia a dia — `systems/maxxi/telas/atendimento.md`
- **Abas de Configuração** (Dashboard, Agentes, Fluxos, Canais, Prompts IA, Configurações) — montagem e parametrização (admin) — `systems/maxxi/telas/configuracao.md`
- **Abas de Operações e Infraestrutura** (Clientes, Ocorrências, Ordens, Cobertura, Monitor) — operação ISP + telas sem rota e stubs — `systems/maxxi/telas/operacoes.md`

## Domains
- **SGP** (Sistema de Gestão de Provedores, ERP ISP) — domínio do ERP e vocabulário ISP — `domains/sgp.md`

### SGP API (estudo — 237 endpoints, 13 módulos)
- **SGP API — Visão geral** (SGP API, API do SGP, endpoints) — mapa dos módulos, auth, o que o GoCHAT usa, correções — `domains/sgp-api/overview.md`
- **SGP API — URA** (69 endpoints) — consulta cliente, faturas, chamado, list de NAS/POP/portador/plano — `domains/sgp-api/ura.md`
- **SGP API — Central Assinante** (33) — área do assinante: NF, faturas, PIX, cartão — `domains/sgp-api/central-assinante.md`
- **SGP API — Estoque** (32) — produtos, kits, comodato, compras — `domains/sgp-api/estoque.md`
- **SGP API — FTTH** (29) — OLT/ONU/CTO — `domains/sgp-api/ftth.md`
- **SGP API — Ordem de Serviço** (26) — OS: listar, alterar, checklist — `domains/sgp-api/ordem-de-servico.md`
- **SGP API — CRM** (12) — cadastro completo de cliente PF/PJ — `domains/sgp-api/crm.md`
- **SGP API — Gerenciador CPE** (12) — TR-069: WiFi, reboot, speedtest — `domains/sgp-api/gerenciador-cpe.md`
- **SGP API — Suporte** (9) — serviços, documentos do cliente — `domains/sgp-api/suporte.md`
- **SGP API — Pré-Cadastro** (5) — F/J + list de plano/vencimento/vendedor — `domains/sgp-api/pre-cadastro.md`
- **SGP API — RADIUS** (5) — sessão PPPoE — `domains/sgp-api/radius.md`
- **SGP API — Remessa / Retorno** (2) — CNAB — `domains/sgp-api/remessa-retorno.md`
- **SGP API — Termo de Aceite** (2) — termo do contrato — `domains/sgp-api/termo-de-aceite.md`
- **SGP API — Outros** (1) — info do usuário — `domains/sgp-api/outros.md`

## Strategy / Decisions
- **Adotar o Maxxi v2 como base** (Maxxi vs Atendechat, multi-tenancy por instância) — decisão de base do produto — `strategy/decisions/2026-06-30_adotar-maxxi-base.md`

## People
- **Christian** (Chrisw16, dono do produto) — dono/dev do Maxxi, ligado à NetGo Internet — `people/christian.md`

## Prompts (referência)
- **Prompt Comercial (Netzinha)** (prompt comercial, vendas, slug comercial) — prompt-coração da IA vendedora (apresentação→coleta→pré-cadastro) — `systems/maxxi/prompts/comercial.md`

## Work
- **Achados de código (2026-06-30)** (bugs, dívida técnica, segurança) — levantamento do estudo estático — `work/bugs/2026-06-30_achados-codigo.md`
- **Auditoria profunda (2026-06-30)** (auditoria pesada, mismatches editor↔motor) — 4 agentes + verificação; CONFIRMADO vs PLAUSÍVEL — `work/bugs/2026-06-30_auditoria-profunda.md`
- **Ambiente de testes + próximos passos (2026-06-30)** (pauta de amanhã: janela/memória da IA, pré-cadastro real) — recap da sessão + agenda — `work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md`
