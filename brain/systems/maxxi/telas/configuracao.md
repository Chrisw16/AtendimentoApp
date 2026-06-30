---
title: Abas de Configuração
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Telas e Navegação]]", "[[Motor de Fluxo]]", "[[Catálogo de Nós]]", "[[IA com Tool Calling]]", "[[Integração SGP]]", "[[Canais e Webhooks]]", "[[Auth e Segurança]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Dashboard", "Agentes", "Fluxos", "Editor de Fluxo", "Canais", "Prompts IA", "Configurações", "Analytics"]
tags: [frontend, telas, configuracao, admin]
---

# Abas de Configuração

Grupo "Configuração" do menu (**todas admin-only**): **Dashboard**, **Agentes**, **Fluxos** (+ Editor), **Canais**, **Prompts IA**, **Configurações** e **Analytics**. É onde o sistema é montado e parametrizado. Visão geral em [[Telas e Navegação]].

## Dashboard (`/dashboard`) — "Relatórios"

KPIs de atendimento/IA/NPS/canais: total de atendimentos, % resolvido pela IA, com humano, ativas agora, NPS score, atendimentos por dia, volume por canal (donut), agentes online. Lê `GET /api/dashboard/{kpis,serie,agentes}` (com refresh dos agentes a cada 30s). **Integração:** é a camada de leitura agregada de quase tudo — conta `conversas` (de Chat/Histórico), NPS da tabela `satisfacao` (preenchida pelo nó `nps_inline`), e agentes online (de [[Abas de Configuração|Agentes]]).

## Agentes (`/agentes`) — operadores e permissões

CRUD dos usuários do painel com **permissões granulares** por checkbox (chat, historico, tarefas, financeiro, clientes, frota, ocorrencias) para o role `agente`; admin tem tudo. `GET/POST/PUT /api/agentes`, senha em bcrypt, auto-desativação bloqueada. **Integração:** os agentes aparecem no [[Abas de Atendimento|Chat]] (assumir/transferir), no Dashboard (online) e como técnicos em [[Abas de Operações e Infraestrutura|Ordens de Serviço]]. As permissões alimentam `hasPerm` (mas o roteamento não as aplica — ver [[Auth e Segurança]]).

## Fluxos (`/fluxos`) e Editor de Fluxo (`/fluxos/:id`)

Lista/CRUD dos fluxos de chatbot + o **editor visual** (`@xyflow/react`): paleta de nós arrastáveis, portas dinâmicas, import/export JSON, Ctrl+S. `GET/POST/PUT/DELETE /api/fluxos` + `/:id/ativar` (ativação **exclusiva** — só um fluxo ativo). **Integração (a mais densa do sistema):** o fluxo salvo é o que o [[Motor de Fluxo]] executa; os nós espelham o [[Catálogo de Nós]]; o nó `ia_responde` usa os prompts de **Prompts IA** ([[IA com Tool Calling]]); os nós SGP e as tools usam a [[Integração SGP]] e os planos de **Configurações**; o resultado é conduzido no [[Abas de Atendimento|Chat]].

## Canais (`/canais`) — conectar os canais

Ativa/desativa e configura credenciais de 6 canais (whatsapp [meta/evolution], telegram, widget, email, voip, sms) com campos condicionais. `GET /api/canais`, `PUT /api/canais/:tipo` (upsert por tipo). **Integração:** os [[Canais e Webhooks|webhooks]] consomem essa config (ex.: token do Telegram em `canais.config`); algumas credenciais também vivem em `sistema_kv`. Mostra a URL do webhook Evolution de produção.

## Prompts IA (`/prompts-ia`) — cérebro da IA

Edita os 8 prompts da IA (regras/estilo/roteador/financeiro/suporte/comercial/faq/outros) + catálogo das 15 tools + um **testador de tools SGP**. `GET/PUT /api/prompts`, `/:slug/restaurar`, `POST /api/sysconfig/tools/test`. **Integração:** os prompts (tabela `prompts_ia`) são consumidos pelo `promptService` no nó `ia_responde` ([[IA com Tool Calling]]); placeholders `[PLANOS]`/`[TIPOS_OCORRENCIA]` são resolvidos a partir de `planos`/`sistema_kv`; o testador chama o SGP real ([[Integração SGP]]).

## Configurações (`/configuracoes`) — o painel-mãe

6 abas: Geral, IA & Bot, **Planos** (CRUD), Horário, Notificações e **Integrações**. `GET/PUT /api/sysconfig` + CRUD `/api/planos`. **Integração (hub de credenciais):** guarda em `sistema_kv` **todas** as chaves que o resto usa — SGP (url/app/token), Evolution (url/key), Anthropic, OpenAI, Telegram. A aba **Planos** alimenta as tools `listar_planos_ativos`/`precadastrar_cliente` (campo `plano_id_sgp`); o **Horário** é lido pelo nó `transferir_agente`. ⚠️ `GET /api/sysconfig` devolve as chaves em texto plano (ver [[Auth e Segurança]]).

## Analytics (`/analytics`)

**Stub** — placeholder vazio. Métricas reais vivem hoje no Dashboard.

## See Also

- [[Telas e Navegação]] · [[Abas de Atendimento]] · [[Abas de Operações e Infraestrutura]]
