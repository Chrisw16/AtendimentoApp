---
title: API Backend Maxxi
type: component
created: 2026-06-30
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Auth e Segurança]]", "[[Modelo de Dados]]", "[[Canais e Webhooks]]", "[[Fila e SLA]]", "[[Achados de código (2026-06-30)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["API Backend Maxxi", "API", "rotas", "endpoints", "Express", "server.js"]
tags: [backend, api, express, rotas]
---

# API Backend Maxxi

> ### ⚠️ Atualizado em 2026-08-22 — rotas novas
>
> `/api/filas` (inbox/outbox/jobs — **mensageria**, FASE 4) · `/api/atendimento`
> (filas de **gente**, FASE 5) · `/api/cliente360` (FASE 6) · `/api/knowledge` (FASE 7) ·
> `/api/playbooks` (FASE 8) · `/api/ia` (perfis, motivos, handoff — FASE 9) ·
> `/api/copiloto` (FASE 10) · `/health/ready` (readiness, FASE 3).
>
> ⚠️ **`/api/filas` e `/api/atendimento/filas` são coisas diferentes** — a primeira é fila
> de mensagem, a segunda é fila de pessoa.


Express (ESM) com `server.js` como entrypoint. Sobe o servidor primeiro (o `/health` responde sempre), e roda migrations + monitores ([[Fila e SLA|SLA]], [[Supervisora IA|supervisora]]) em background no boot. Middlewares globais: `helmet`, `cors` (`CORS_ORIGIN`), `rate-limit` (200/min), `express.json` (10mb). `errorHandler` global (`asyncHandler`, `HttpError`). Sem zod — validação manual.

## Superfície de rotas (~62 endpoints, 17 routers)

**Públicas:** `/api/auth` (login/me/logout/refresh), `/api/webhooks` (evolution/meta/telegram + setup) — ver [[Canais e Webhooks]]. Também `GET /api/cobertura/check` (consulta pública de cobertura).

**Autenticadas:**
- `/api/chat` — o caminho do agente: SSE, conversas (listar/ver), mensagens (listar/enviar), **ações** (assumir, devolver-ia, encerrar, transferir), fila, notas, reações, respostas-rápidas, modo bot/humano (admin), stats. Toda query passa por `conversaRepository`/`mensagemRepository`.
- `/api/fluxos`, `/api/prompts`, `/api/dashboard`, `/api/agentes`, `/api/canais`, `/api/sysconfig`, `/api/planos` — admin.
- `/api/clientes` (híbrido SGP+local), `/api/ocorrencias`, `/api/ordens`, `/api/tarefas`, `/api/satisfacao`, `/api/cobertura`, `/api/monitor`, `/api/financeiro`.

Status: ~13 recursos com backend real, 1 parcial (`financeiro` depende de `ERP_URL`), nenhum stub puro. `dashboard` calcula KPIs + NPS; `sysconfig` guarda config e tem um **testador de tools SGP** (`POST /tools/test`).

## Padrões e armadilhas

- Repositórios concentram as queries de conversa/mensagem (zero SQL espalhado nessas).
- `clientes` integra SGP com fallback no banco local.
- `monitor /ping` faz **DDL em runtime** (cria `equipamentos_rede`); `alertas_rede` nunca é criada.
- Achados de segurança da camada de rotas (mass-assignment, keys expostas no `sysconfig`, etc.) em [[Achados de código (2026-06-30)]] e [[Auth e Segurança]].

## See Also

- [[Auth e Segurança]] · [[Canais e Webhooks]] · [[Modelo de Dados]]
