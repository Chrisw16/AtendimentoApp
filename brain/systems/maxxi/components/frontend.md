---
title: Frontend Maxxi
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Telas e Navegação]]", "[[Design System Maxxi]]", "[[Motor de Fluxo]]", "[[Realtime SSE]]", "[[API Backend Maxxi]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Frontend Maxxi", "frontend", "apps/web", "React", "painel", "useChat", "Zustand"]
tags: [frontend, react, vite, zustand]
---

# Frontend Maxxi

Painel em **React 19 + Vite** (`apps/web`). Roteamento React Router 6 com lazy loading e guards (`PrivateRoute` exige token; `AdminRoute` exige `role==='admin'`; `SmartRedirect` manda admin → `/dashboard`, demais → `/chat`). Em dev o Vite serve na porta 3000 com proxy `/api`→4000; em produção o bundle é servido pela própria API.

## Estado e dados

- **TanStack Query** para server-state (a maioria das telas: `useQuery`/`useMutation` + `invalidateQueries`).
- **Zustand** em dois stores: `store/index.js` (`maxxi-store`, **persistido**: token/user/role/permissoes; toasts; UI) e `store/chat.js` (**não persistido**: conversas, mensagens por id, filtros, modo bot/humano).
- `lib/api.js` — cliente HTTP central: injeta `Authorization: Bearer`, **auto-refresh em 401** (retenta a request), `createSSE` (EventSource com token na query), `upload` multipart. Define objetos tipados de endpoints (`authApi`, `chatApi`, `agentesApi`, `fluxosApi`, etc.).
- `hooks/useChat.js` — orquestra o chat: carrega conversas/mensagens, abre [[Realtime SSE|SSE]], aplica optimistic update no envio, e propaga eventos da [[Supervisora IA]] como `CustomEvent` no `window`.

## Páginas (21)

Núcleo de atendimento **usável**: Login, Chat (3 colunas, realtime), Dashboard ("Relatórios", gráficos SVG custom), Agentes (CRUD + permissões), Fluxos + **FluxoEditor** (editor visual `@xyflow/react`, ~32 nós, paleta arrastável, import/export JSON, Ctrl+S — espelha o [[Motor de Fluxo]]), Histórico, MonitorRede, Canais, Configurações (6 abas + integrações + planos), Prompts IA (editor + catálogo de tools + testador SGP), Ocorrências, Ordens de Serviço, Satisfação.

Parciais/incompletas: **Tarefas** e **Financeiro** (implementadas mas **sem rota** em `App.jsx`), **Cobertura** (só lê/deleta zonas, sem desenho), **Clientes** (busca quebrada por `useDebounce`). Stubs vazios: Analytics, Dispositivos, Email, VoIP, Frota. Bugs detalhados em [[Achados de código (2026-06-30)]].

O detalhe de cada aba (propósito, funcionamento e integração entre telas) está em [[Telas e Navegação]] e nas páginas [[Abas de Atendimento]], [[Abas de Configuração]] e [[Abas de Operações e Infraestrutura]].

## See Also

- [[Design System Maxxi]] · [[Motor de Fluxo]] · [[API Backend Maxxi]]
