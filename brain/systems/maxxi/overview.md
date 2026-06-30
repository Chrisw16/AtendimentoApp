---
title: Maxxi v2 / GoCHAT — Visão geral
type: system
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Adotar o Maxxi v2 como base]]", "[[Motor de Fluxo]]", "[[IA com Tool Calling]]", "[[Integração SGP]]", "[[Canais e Webhooks]]", "[[Modelo de Dados]]", "[[Frontend Maxxi]]", "[[Design System Maxxi]]", "[[Supervisora IA]]", "[[Fila e SLA]]", "[[Realtime SSE]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi", "2026-06-30_decisao-base-maxxi"]
aliases: ["Maxxi v2 / GoCHAT — Visão geral", "Maxxi", "GoCHAT", "GoChat", "Maxxi v2", "AtendimentoApp"]
tags: [produto, isp, atendimento, omnichannel]
---

# Maxxi v2 / GoCHAT

Sistema de atendimento omnichannel com IA para provedores de internet (ISP), reconstruído do zero com arquitetura limpa. Marca de produto: **GoCHAT**. Repositório: `github.com/Chrisw16/AtendimentoApp` (clonado em `netgo-chat-v2`, último commit `db6c997`). É a [[Adotar o Maxxi v2 como base|base escolhida do produto]] de atendimento para ISP, substituindo o Atendechat como base de evolução.

O ciclo central: uma mensagem entra por um canal (WhatsApp via Evolution/Meta, Telegram), vira uma `conversa`, o [[Motor de Fluxo]] executa um fluxo visual de atendimento, a [[IA com Tool Calling|IA Claude]] resolve consultas no [[Integração SGP|SGP]] (boleto, conexão, chamado, planos, pré-cadastro) e, quando necessário, transfere para um agente humano com chat em tempo real ([[Realtime SSE|SSE]]).

## Arquitetura

Monorepo `apps/api` (Express + Knex/Postgres 16 + Redis) e `apps/web` (React 19 + Vite). Backend em ESM. Em produção (Coolify) um **Dockerfile multi-stage** builda o frontend e a própria API o serve estático no mesmo container (porta 4000); em dev, `docker-compose` separa postgres/redis/api/web. Detalhes de deploy em [[Runbooks Maxxi]].

Princípio arquitetural central: **as credenciais de integração (SGP, Evolution, Anthropic, Telegram) vivem no banco** (tabela `sistema_kv`), configuradas pela tela admin — não em variáveis de ambiente. Só infraestrutura (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) vem de env. Isso é o que viabiliza a [[Adotar o Maxxi v2 como base|multi-tenancy por instância]]: cada provedor revendido roda um deploy isolado e configura seu próprio SGP/WhatsApp/IA pela interface.

## Subsistemas

- [[Motor de Fluxo]] — interpretador de grafo (`motorFluxo.js`, ~30 nós). O coração.
- [[IA com Tool Calling]] — loop agêntico Claude + 15 tools SGP + composição de prompts.
- [[Integração SGP]] — camada de ERP de ISP (URA + precadastro) + Evolution API.
- [[Canais e Webhooks]] — ingestão de mensagens (Evolution, Meta, Telegram).
- [[Supervisora IA]] — análise de sentimento, SLA do agente, sugestões de resposta.
- [[Fila e SLA]] — priorização e alertas de fila.
- [[Realtime SSE]] — entrega em tempo real ao painel.
- [[Auth e Segurança]] — JWT + bcrypt + permissões; e a dívida de segurança.
- [[Modelo de Dados]] — 21 tabelas, single-tenant.
- [[Frontend Maxxi]] e [[Design System Maxxi]] — painel React e o tema visual.
- [[API Backend Maxxi]] — superfície de rotas REST.

## Estado do produto (auditoria estática 2026-06-30, não validado rodando)

| Área | Estado |
|---|---|
| Atendimento ponta-a-ponta | ~95% (Evolution/Telegram > Meta) |
| Núcleo (auth, fila, transferência, CRUD) | sólido, single-tenant |
| Frontend de atendimento | usável (Chat, Dashboard, Agentes, Fluxos+editor, Histórico) |
| SGP + IA | prontos; faltam credenciais |
| Periféricos (Financeiro, Cobertura, Ocorrências, OS) | parciais/UI-sem-rota |
| Canais/Config | UI pronta, backend parcial |
| Multi-tenant | inexistente (zero `company_id`) |
| Segurança | dívida relevante — ver [[Auth e Segurança]] |
| Testes | nenhum |

## Caminho até vendável

Fases independentes (cada uma vira spec própria): (1) **validar** rodando ponta a ponta; (2) **endurecer segurança** (criptografar `sistema_kv`, `JWT_SECRET` por env, rate-limit de login); (3) **fechar canais & config** (endpoints stub, conectar Evolution); (4) **deploy-por-cliente** automatizado no Coolify; (5) completar periféricos. Achados que viram trabalho em [[Achados de código (2026-06-30)]].

## Open Questions

- A análise profunda de sentimento ao encerrar (`analisarConversaEncerrada`) está conectada à rota de encerramento? Parece não ser chamada por `chat.js`. Validar rodando.
- Repositório será tornado privado para versionar o brain junto. Confirmar e ajustar deploy do Coolify (deploy key/PAT).

## See Also

- [[Adotar o Maxxi v2 como base]]
- [[Achados de código (2026-06-30)]]
