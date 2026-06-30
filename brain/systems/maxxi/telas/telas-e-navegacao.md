---
title: Telas e Navegação
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Frontend Maxxi]]", "[[Abas de Atendimento]]", "[[Abas de Configuração]]", "[[Abas de Operações e Infraestrutura]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["telas", "abas", "navegação", "menu", "sidebar", "rotas", "páginas"]
tags: [frontend, navegacao, telas, ux]
---

# Telas e Navegação

Mapa das **abas** (telas/itens de menu) do painel do Maxxi e de como se conectam. O menu lateral ([[Frontend Maxxi|Sidebar]]) organiza as abas em 4 grupos; o roteamento é React Router 6 com guards. Detalhe de cada aba em [[Abas de Atendimento]], [[Abas de Configuração]] e [[Abas de Operações e Infraestrutura]].

## Grupos do menu (Sidebar)

| Grupo | Abas |
|---|---|
| **Atendimento** | Chat · Histórico · Satisfação |
| **Configuração** | Dashboard · Agentes · Fluxos · Canais · Analytics · Prompts IA · Configurações |
| **Operações** | Clientes · Ocorrências · Ordens de Serviço · Cobertura |
| **Infraestrutura** | Monitor de Rede |

## Rotas e guards

`PrivateRoute` exige token; `AdminRoute` exige `role==='admin'`; `SmartRedirect` manda admin→`/dashboard`, demais→`/chat`.

| Rota | Tela | Guard |
|---|---|---|
| `/login` | Login | público |
| `/` , `*` | SmartRedirect | privado |
| `/chat` | Chat | privado |
| `/historico` | Histórico | privado |
| `/satisfacao` | Satisfação | privado |
| `/clientes` | Clientes | privado |
| `/ocorrencias` | Ocorrências | privado |
| `/ordens` | Ordens de Serviço | privado |
| `/cobertura` | Cobertura | privado |
| `/dashboard` | Dashboard | **admin** |
| `/agentes` | Agentes | **admin** |
| `/fluxos` , `/fluxos/:id` | Fluxos · FluxoEditor | **admin** |
| `/canais` | Canais | **admin** |
| `/prompts-ia` | Prompts IA | **admin** |
| `/configuracoes` | Configurações | **admin** |
| `/analytics` | Analytics (stub) | **admin** |
| `/rede` | Monitor de Rede | **admin** |

Existem permissões granulares por agente (`permissoes`: chat, historico, tarefas, financeiro, clientes, frota, ocorrencias; `hasPerm`) usadas na UI de [[Abas de Configuração|Agentes]], mas o **roteamento só checa token/admin** — as rotas privadas não-admin não filtram por `hasPerm` (ver [[Auth e Segurança]]). `Tarefas` e `Financeiro` têm tela mas **nenhuma rota** (inacessíveis). Detalhe em [[Abas de Operações e Infraestrutura]].

## Mapa de integração entre as abas

As abas não são ilhas — compartilham dados e alimentam umas às outras:

- **Espinha dorsal de dados (`conversas`/`mensagens`):** [[Abas de Atendimento|Chat]] opera o atendimento ao vivo; **Histórico** lê as mesmas conversas (encerradas); **Dashboard** e **Satisfação** agregam métricas delas; **Ocorrências** e **Ordens** vinculam-se por `conversa_id`. Tudo via [[API Backend Maxxi|/api/chat]] + [[Realtime SSE|SSE]].
- **Cadeia IA/atendimento:** [[Abas de Configuração|Fluxos]] (+ editor) desenham o atendimento → o nó `ia_responde` usa os prompts de **Prompts IA** → as tools de IA usam o catálogo de **Configurações → Planos** (`listar_planos_ativos`, `precadastrar_cliente`) e as credenciais SGP de **Configurações** → as respostas saem pelos **Canais** → o resultado aparece no **Chat** → o **Dashboard** mede. Ver [[Motor de Fluxo]] e [[IA com Tool Calling]].
- **SGP:** **Clientes** consulta o SGP direto; os nós/tools puxam o mesmo SGP ([[Integração SGP]]); **Configurações** guarda as credenciais que todos usam.
- **Transferência humana:** Chat → fila ([[Fila e SLA]]) → outro **Agente** assume; a [[Supervisora IA]] alimenta alertas/sugestões no Chat via SSE.
- **Canais ↔ Configurações:** ambas gravam credenciais (em `canais.config` e `sistema_kv`); os [[Canais e Webhooks|webhooks]] consomem isso para receber/enviar mensagens.

## See Also

- [[Abas de Atendimento]] · [[Abas de Configuração]] · [[Abas de Operações e Infraestrutura]] · [[Frontend Maxxi]]
