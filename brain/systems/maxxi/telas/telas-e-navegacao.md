---
title: Telas e Navegação
type: component
created: 2026-06-30
last_updated: 2026-08-26
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Frontend Maxxi]]", "[[Abas de Atendimento]]", "[[Abas de Configuração]]", "[[Abas de Operações]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Telas e Navegação", "telas", "abas", "navegação", "menu", "sidebar", "rotas", "páginas"]
tags: [frontend, navegacao, telas, ux]
---

# Telas e Navegação

> ### ⚠️ Atualizado em 2026-08-22 — telas novas que esta página não lista
>
> | Tela | Rota | Quem vê | Fase |
> |---|---|---|---|
> | **Filas** | `/filas` | admin | 5 |
> | **Conhecimento** (Artigos · Lacunas · Categorias) | `/knowledge` | todos | 7 |
> | **Procedimentos** (playbooks) | `/playbooks` | admin | 8 |
> | **Perfis de IA** | aba dentro de `/prompts-ia` | admin | 9 |
>
> E dentro do **Chat**: a lateral virou [[Cliente 360 e Copiloto|Cliente 360]] (Context
> Cards, financeiro, diagnóstico, ações rápidas, handoff da IA) e o **Copiloto** aparece
> acima do campo de mensagem quando a conversa está com um humano.

> ### ⚠️ Atualizado em 2026-08-26 — telas que SAÍRAM
>
> **Ocorrências** (`/ocorrencias`), **Ordens de Serviço** (`/ordens`) e **Monitor de
> Rede** (`/rede`) foram removidos: o ERP desta operação é o SGP, e manter chamado nas
> duas bases sem conciliação criava duas verdades. Com o Monitor foi o grupo
> **Infraestrutura** inteiro — sobrava só **Saúde do Sistema**, que subiu para
> **Configuração**. **Clientes** virou o **histórico de contato**. Tabelas dropadas pela
> migration 027; view `clientes_contato` na 028. Ver
> [[Remoção dos módulos de ERP + Clientes como histórico]].


Mapa das **abas** (telas/itens de menu) do painel do Maxxi e de como se conectam. O menu lateral ([[Frontend Maxxi|Sidebar]]) organiza as abas em 3 grupos; o roteamento é React Router 6 com guards. Detalhe de cada aba em [[Abas de Atendimento]], [[Abas de Configuração]] e [[Abas de Operações]].

## Grupos do menu (Sidebar)

| Grupo | Abas |
|---|---|
| **Atendimento** | Chat · Histórico · Satisfação |
| **Configuração** | Dashboard · Agentes · Fluxos · Canais · Analytics · Prompts IA · Configurações · Saúde do Sistema |
| **Operações** | Clientes · Cobertura |

## Rotas e guards

`PrivateRoute` exige token; `AdminRoute` exige `role==='admin'`; `SmartRedirect` manda admin→`/dashboard`, demais→`/chat`.

| Rota | Tela | Guard |
|---|---|---|
| `/login` | Login | público |
| `/` , `*` | SmartRedirect | privado |
| `/chat` | Chat | privado |
| `/historico` | Histórico | privado |
| `/satisfacao` | Satisfação | privado |
| `/clientes` | Clientes (histórico de contato) | privado |
| `/cobertura` | Cobertura | privado |
| `/dashboard` | Dashboard | **admin** |
| `/agentes` | Agentes | **admin** |
| `/fluxos` , `/fluxos/:id` | Fluxos · FluxoEditor | **admin** |
| `/canais` | Canais | **admin** |
| `/prompts-ia` | Prompts IA | **admin** |
| `/configuracoes` | Configurações | **admin** |
| `/analytics` | Analytics | **admin** |
| `/saude` | Saúde do Sistema | **admin** |

Existem permissões granulares por agente (`agentes.permissoes`; desde a FASE 6 elas **decidem** de verdade, via `services/permissoes.js`) usadas na UI de [[Abas de Configuração|Agentes]], mas o **roteamento só checa token/admin** — as rotas privadas não-admin não filtram por `hasPerm` (ver [[Auth e Segurança]]). `/clientes` é exceção: a rota exige a capacidade `cliente360` no backend. `Tarefas` e `Financeiro` têm tela mas **nenhuma rota** (inacessíveis). Detalhe em [[Abas de Operações]].

## Mapa de integração entre as abas

As abas não são ilhas — compartilham dados e alimentam umas às outras:

- **Espinha dorsal de dados (`conversas`/`mensagens`):** [[Abas de Atendimento|Chat]] opera o atendimento ao vivo; **Histórico** lê as mesmas conversas (encerradas); **Dashboard** e **Satisfação** agregam métricas delas; **Clientes** é a view `clientes_contato` agregando as mesmas conversas por telefone. Tudo via [[API Backend Maxxi|/api/chat]] + [[Realtime SSE|SSE]].
- **Cadeia IA/atendimento:** [[Abas de Configuração|Fluxos]] (+ editor) desenham o atendimento → o nó `ia_responde` usa os prompts de **Prompts IA** → as tools de IA usam o catálogo de **Configurações → Planos** (`listar_planos_ativos`, `precadastrar_cliente`) e as credenciais SGP de **Configurações** → as respostas saem pelos **Canais** → o resultado aparece no **Chat** → o **Dashboard** mede. Ver [[Motor de Fluxo]] e [[IA com Tool Calling]].
- **SGP:** os nós/tools puxam o SGP ([[Integração SGP]]) e o [[Cliente 360 e Copiloto|Cliente 360]] compõe a ficha **dentro** da conversa; **Configurações** guarda as credenciais que todos usam. **Clientes** não fala com o SGP — mostra o vínculo telefone↔CPF que a IA já gravou na conversa.
- **Transferência humana:** Chat → fila ([[Fila e SLA]]) → outro **Agente** assume; a [[Supervisora IA]] alimenta alertas/sugestões no Chat via SSE.
- **Canais ↔ Configurações:** ambas gravam credenciais (em `canais.config` e `sistema_kv`); os [[Canais e Webhooks|webhooks]] consomem isso para receber/enviar mensagens.

## See Also

- [[Abas de Atendimento]] · [[Abas de Configuração]] · [[Abas de Operações]] · [[Frontend Maxxi]]
