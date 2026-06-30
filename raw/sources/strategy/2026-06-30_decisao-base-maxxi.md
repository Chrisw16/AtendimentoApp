# Decisão de base do produto: adotar o Maxxi v2 (HANDOFF para a próxima sessão)

- **Data:** 2026-06-30
- **Status:** DECIDIDO pelo usuário. Próxima sessão começa do zero, focada no **Maxxi**.
- **Tipo:** decisão estratégica / handoff (não é spec de implementação)

## TL;DR

Paramos de evoluir o **Atendechat (netgo-chat)** como base e adotamos o **Maxxi v2** (também chamado "GoCHAT"), que está em `gochat-antigo-inspiração/`, como a **base do produto de atendimento para provedores de internet (ISP)**. Multi-tenancy será **por instância** (um deploy isolado por provedor revendido, via Coolify — sem refactoring de `company_id` agora). O Atendechat vira **referência** (de domínio e de features); nada nele precisa ser desfeito.

## Por que mudamos (resumo da comparação)

A pergunta original do usuário era "melhorar o editor de fluxo do Atendechat, inspirado no GoCHAT". Ao auditar o GoCHAT, descobrimos que ele **não é um protótipo de telas** — é um **sistema de atendimento omnichannel quase completo**, feito sob medida para ISP, **melhor construído** que o Atendechat e **já contendo** o que íamos construir (editor de fluxo rico + nós SGP + IA com tool calling = a "fase 2").

| Dimensão | Atendechat (netgo-chat) | Maxxi v2 (GoCHAT) |
|---|---|---|
| Origem | codatendechat "nulled"/herdado, dívida técnica pesada (SQL injection, IDOR, cross-tenant, monólitos) | reescrito do zero, arquitetura limpa, migrations formais |
| Stack | React 17/CRA, Sequelize, `react-flow-renderer` v11 | React 19/Vite, Knex, `@xyflow/react` v12 |
| Motor de fluxo | `ActionsWebhookService` monolítico/frágil, ~11 nós | `motorFluxo.js` limpo (1027 LOC), **30+ nós em 7 categorias** |
| IA | nó OpenAI cosmético | **IA com tool calling agêntico (Claude) + 14-16 tools SGP** |
| Multi-tenant | ✅ row-level (é SaaS white-label) | ❌ single-tenant (feito só p/ a NetGo) |

Como o usuário quer **revender para outros provedores** (multi-tenant), e o Maxxi é single-tenant, reenquadramos: "multi-tenant" pode ser **por instância** (deploy isolado por cliente) em vez de row-level. Isso deixa o Maxxi single-tenant **utilizável como está** para revenda, sem o atoleiro de refatorar tenancy. Caminho escolhido: **Maxxi como base + isolamento por instância**, evoluindo para row-level só se a escala pedir.

## Laudo do Maxxi (4 auditorias estáticas — por leitura de código, ainda NÃO validado rodando)

1. **Atendimento (ciclo crítico): 95-99% funcional.** 3 canais — **Evolution (98%)**, Meta (95%), Telegram (75%). Mensagem entra (webhook) → cria conversa → `motorFluxo` → IA → resposta sai. **Evolution = WhatsApp não-oficial (Baileys por baixo)** — resolve o requisito de WhatsApp sem API oficial paga. Estado do fluxo em memória (perde no restart — mesma limitação do Atendechat).
2. **Núcleo: 70-80% sólido.** Auth JWT+bcrypt+permissões, 7 migrations (modelo limpo: agentes/conversas/mensagens/fluxos/ocorrencias/ordens_servico/planos/sistema_kv...), CRUD completo, **fila com SLA e priorização**, transferência p/ agente. ⚠️ **SINGLE-TENANT** (zero company_id). ⚠️ Falhas de segurança: **credenciais em plaintext** no `sistema_kv`, `JWT_SECRET` default, sem rate-limit de login, sem testes.
3. **Frontend: núcleo de atendimento 100% usável.** Login, Chat (SSE realtime, assumir/devolver/encerrar), Dashboard, Agentes, Fluxos (+ editor ReactFlow), Histórico, Monitor de Rede, Clientes — funcionais. Design system maduro (tokens, Syne/DM Sans/Geist Mono, acento `#00E5A0`). Periféricos parciais (Tarefas/Financeiro/Ocorrências/Ordens 20-60%; Canais/Config/PromptsIA 50-60% — UI pronta, endpoints stub). Analytics/Frota/Email/VoIP/Dispositivos = stub.
4. **SGP + IA: 100% pronto.** `integrations.js` (16 funções SGP reais → `/api/ura/*` + `/api/precadastro/*`), `iaTools.js` (14 tools executáveis + 2 ACS stub), loop agêntico em `processarIAResponde` (`@anthropic-ai/sdk`, `claude-haiku-4-5`, max 5 tool-loops), prompts parametrizados em 8 slugs (tabela `prompts_ia`). **Cobre mais que o nosso `SgpService`** (+RADIUS, planos, vencimentos, precadastro). É a "fase 2" já feita. Só falta preencher credenciais.

## Onde está o Maxxi + arquivos-chave

- **Raiz:** `gochat-antigo-inspiração/` (monorepo, repo git próprio, Dockerfile + docker-compose.yml). README = "Maxxi v2".
- **Frontend** `apps/web` (React 19 + Vite + `@xyflow/react` + Zustand + TanStack Query):
  - `src/pages/FluxoEditor.jsx` (785) · `src/lib/nodeTypes.js` (292, catálogo de nós) · `src/components/fluxo/FlowNode.jsx` (282) · `src/components/fluxo/PropsPanel.jsx` (485) · `src/pages/Chat.jsx` + `src/components/chat/*` · `src/styles/tokens.css` · `src/components/ui/*`.
- **Backend** `apps/api` (Express + Knex/Postgres 16 + Redis + Anthropic/OpenAI):
  - `src/services/motorFluxo.js` (1027, motor) · `src/services/integrations.js` (609, SGP+Evolution) · `src/services/iaTools.js` (363, tools IA) · `src/services/promptService.js` · `src/services/sseManager.js` · `src/migrations/versions/001..007*.js` · `src/seed.js` (admin/admin123, agente01/agente123).
- **Subir:** `docker-compose up -d` + `docker-compose exec api npm run seed`. Front :3000, API :4000. Credenciais (SGP/Evolution/Anthropic) vão no banco (`sistema_kv`) via tela admin de Configurações.

## O caminho até "vendável" (fases independentes — cada uma vira spec/plano próprio)

1. **Validar** — subir o Maxxi e confirmar o atendimento ponta a ponta de verdade (o laudo foi estático).
2. **Endurecer segurança** — criptografar credenciais do `sistema_kv`, `JWT_SECRET` por env, rate-limit de login.
3. **Fechar canais & config** — implementar os endpoints stub de Canais/Configurações (conectar Evolution de verdade).
4. **Deploy-por-cliente** — automatizar a instância isolada no Coolify (template: banco próprio + domínio + credenciais por provedor).
5. **Completar periféricos** conforme demanda.

**Primeiro passo recomendado:** Fase 1 (validar rodando) — maior valor, menor risco; também é a "revisão de verdade" que o usuário pediu.

## O que fica do trabalho no Atendechat (não desfazer)

- Deploy no Coolify (`chat.netgo.net.br`) **de pé** — bug do 504 resolvido (rede customizada removida do compose; ver `docs/brain/systems/atendechat/runbooks/deploy-coolify.md`). A experiência de Coolify se reaproveita (o Maxxi também sobe lá).
- `SgpService` (Plano 1, TS, em `backend/src/services/SgpService/`) — referência/validação da API SGP.
- Todo o brain (`docs/brain/`) documentando o Atendechat — acervo de domínio (SGP, ISP, fluxo).

## Como retomar (próxima sessão)

1. Ler este doc.
2. Confirmar a fase a atacar (recomendado: **validar** subindo o Maxxi).
3. Como é uma nova base, considerar: brain/CLAUDE.md próprios do Maxxi; e se o Maxxi vira repo novo / fica onde está.
