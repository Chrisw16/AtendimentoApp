---
title: Runbooks Maxxi
type: runbook
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Canais e Webhooks]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi", "2026-06-30_decisao-base-maxxi"]
aliases: ["Runbooks Maxxi", "runbook", "subir Maxxi", "deploy", "Coolify", "rodar"]
tags: [runbook, deploy, operacao]
---

# Runbooks Maxxi

Procedimentos operacionais para subir e operar o Maxxi v2.

## Subir em dev (docker-compose)

```bash
docker-compose up -d                      # postgres:5432, redis:6379, api:4000, web:3000
docker-compose exec api npm run seed      # migrations + dados iniciais
```
Front `http://localhost:3000`, API `http://localhost:4000`, `/health` sempre responde. Login: `admin/admin123` ou `agente01/agente123` (trocar em produção). Credenciais do compose dev: Postgres `maxxi/maxxi_dev_pass`, `JWT_SECRET` hardcoded — só para dev.

## Subir sem Docker

Requer Postgres 16 + Redis 7 + Node 20. Backend (`apps/api`): `cp .env.example .env` → editar `DATABASE_URL`/`REDIS_URL`/`JWT_SECRET` → `npm install` → `npm run seed` → `npm run dev`. Frontend (`apps/web`): `npm install` → `npm run dev`.

## Deploy (Coolify)

O **Dockerfile raiz** é multi-stage: builda `apps/web` e copia `dist` para `apps/api/apps/web/dist`; a API serve frontend + API no mesmo container (porta 4000, healthcheck em `/health`). Migrations rodam em background no boot. Env de produção mínima: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` (forte!), `CORS_ORIGIN`, `META_VERIFY_TOKEN`. Demais credenciais (SGP/Evolution/Anthropic/Telegram) são configuradas **pela tela admin** depois (gravadas em [[Modelo de Dados|sistema_kv]]).

Webhook Evolution de produção observado: `https://gochat.netgo.net.br/api/webhooks/evolution`. Após subir, registrar o webhook do Telegram via `POST /api/webhooks/telegram/setup`.

## Pós-deploy: configurar a instância

1. Logar como admin → **Configurações → Integrações:** preencher SGP (url/app/token), Evolution (url/key), Anthropic key, Telegram token.
2. **Configurações → Planos:** cadastrar o catálogo (liga `plano_id_sgp` às tools de IA).
3. **Prompts IA:** ajustar os prompts ao provedor (os seed são da NetGo).
4. **Canais:** ativar e conectar os canais desejados.

## Atenção (repo privado)

Ao tornar o repositório privado, o Coolify precisa de **deploy key** ou **PAT** para continuar puxando o código. Ver [[Adotar o Maxxi v2 como base]].

## See Also

- [[Maxxi v2 / GoCHAT — Visão geral]] · [[Canais e Webhooks]]
