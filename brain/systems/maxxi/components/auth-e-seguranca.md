---
title: Auth e Segurança
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[API Backend Maxxi]]", "[[Modelo de Dados]]", "[[Achados de código (2026-06-30)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["auth", "JWT", "segurança", "permissões", "RBAC"]
tags: [backend, seguranca, auth, jwt]
---

# Auth e Segurança

Autenticação por **JWT + bcrypt**. `middlewares/auth.js`: `authMiddleware` aceita `Authorization: Bearer <jwt>` ou `?token=` (para SSE, que não envia headers); popula `req.agente`. `adminMiddleware` exige `role === 'admin'`. Login (`routes/auth.js`) compara senha com `bcrypt`, marca o agente online, e emite token via `signToken`. Há `refresh`/`me`/`logout`. No frontend o token vive no Zustand persistido (`maxxi-store`), com auto-refresh em 401.

Autorização: rotas administrativas exigem `adminMiddleware`; o frontend tem permissões granulares por agente (`permissoes` jsonb, `hasPerm`), mas a maioria das rotas não-admin só checa token (não `hasPerm`). `tarefas` é a única com filtro row-level — e só no GET. Em `conversas`, agente não-admin só vê as próprias.

## Dívida de segurança (relevante)

Esta é a área que mais precisa de endurecimento antes de ir a produção/revenda. Itens (detalhe e severidade em [[Achados de código (2026-06-30)]]):

- **Credenciais em plaintext** no `sistema_kv` (SGP token, Evolution key, Anthropic key, Telegram token) — sem criptografia em repouso.
- **`GET /api/sysconfig` retorna as API keys em texto plano** (sem mascaramento), para qualquer sessão admin.
- **`JWT_SECRET` com fallback hardcoded** (`'maxxi-dev-secret-change-in-prod'`) se a env não estiver setada. Token expira em 30 dias.
- **Sem rate-limit específico de login** (só o global de 200/min); sem testes automatizados.
- **Mass-assignment** (`{...req.body}`) em PUT de `ocorrencias`/`ordens`/`tarefas`; `tarefas` PUT/DELETE sem checagem de ownership.
- SQL string-interpolada em `dashboard.js` (atenuado por whitelist); LIKE sem escape em `clientes.js`.

Como o repositório foi **público**, documentar essas falhas levou à decisão de torná-lo privado antes de versionar o brain. Ver [[Adotar o Maxxi v2 como base]].

## See Also

- [[Achados de código (2026-06-30)]] · [[API Backend Maxxi]] · [[Modelo de Dados]]
