---
title: Auth e Segurança
type: component
created: 2026-06-30
last_updated: 2026-08-26
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[API Backend Maxxi]]", "[[Modelo de Dados]]", "[[Achados de código (2026-06-30)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Auth e Segurança", "auth", "JWT", "segurança", "permissões", "RBAC"]
tags: [backend, seguranca, auth, jwt]
---

# Auth e Segurança

> ### ⚠️ Atualizado em 2026-08-22 — a maior parte da dívida abaixo FOI PAGA
>
> Esta página foi escrita na auditoria de 2026-06-30. O que mudou:
>
> - **`JWT_SECRET` não tem mais fallback fixo**; em produção o boot falha sem ela.
> - **Credencial não sai em texto plano**: `GET /sysconfig` mascara, e há **cripto em
>   repouso oportunista** com `KV_SECRET` ([[FASE 3 — Segurança e governança base]]).
> - **XSS do handshake da Meta corrigido** (`verificarHandshake` é fail-closed, compara em
>   tempo constante, responde `text/plain`).
> - **Mass-assignment fechado** em `tarefas`, com ownership-check (dono ou admin). Os
>   `PUT` de `ocorrencias` e `ordens` tinham o mesmo defeito e foram fechados na FASE 3;
>   em **2026-08-26** as duas rotas deixaram de existir junto com os módulos.
> - **`agentes.permissoes` finalmente DECIDE algo** (`services/permissoes.js`, FASE 6). O
>   campo existia desde a migration 001 e **nada no backend jamais leu** — o admin marcava
>   caixas e todo mundo seguia podendo tudo. Permissão antiga vale **por omissão**; só
>   `ver_dados_completos` é **negada por omissão**. Capacidade desconhecida **nega**.
> - **PII é mascarada NO SERVIDOR** (`mascarar.js`): esconder no CSS deixa o CPF inteiro
>   chegar ao navegador — ver [[Cliente 360 e Copiloto]].
> - **`audit_log`** registra ator `human`/`ai`/`system`.
> - ⚠️ **Segue aberto**: JWT em `localStorage` com TTL de 30 dias (encurtar hoje desloga
>   todo mundo), e a chave mestra da cripto vive no env do **mesmo** container — protege
>   contra dump de banco, não contra shell.


Autenticação por **JWT + bcrypt**. `middlewares/auth.js`: `authMiddleware` aceita `Authorization: Bearer <jwt>` ou `?token=` (para SSE, que não envia headers); popula `req.agente`. `adminMiddleware` exige `role === 'admin'`. Login (`routes/auth.js`) compara senha com `bcrypt`, marca o agente online, e emite token via `signToken`. Há `refresh`/`me`/`logout`. No frontend o token vive no Zustand persistido (`maxxi-store`), com auto-refresh em 401.

Autorização: rotas administrativas exigem `adminMiddleware`; o frontend tem permissões granulares por agente (`permissoes` jsonb, `hasPerm`), mas a maioria das rotas não-admin só checa token (não `hasPerm`). `tarefas` é a única com filtro row-level — e só no GET. Em `conversas`, agente não-admin só vê as próprias.

## Dívida de segurança (relevante)

Esta é a área que mais precisa de endurecimento antes de ir a produção/revenda. Itens (detalhe e severidade em [[Achados de código (2026-06-30)]]):

- **Credenciais em plaintext** no `sistema_kv` (SGP token, Evolution key, Anthropic key, Telegram token) — sem criptografia em repouso.
- **`GET /api/sysconfig` retorna as API keys em texto plano** (sem mascaramento), para qualquer sessão admin.
- **`JWT_SECRET` com fallback hardcoded** (`'maxxi-dev-secret-change-in-prod'`) se a env não estiver setada. Token expira em 30 dias.
- **Sem rate-limit específico de login** (só o global de 200/min); sem testes automatizados.
- **Mass-assignment** (`{...req.body}`) em PUT de `tarefas`, sem checagem de ownership em PUT/DELETE. (O mesmo valia para `ocorrencias`/`ordens` — corrigido na FASE 3, e as rotas saíram do produto em 2026-08-26.)
- SQL string-interpolada em `dashboard.js` (atenuado por whitelist). ~~LIKE sem escape em `clientes.js`~~ → corrigido em 2026-08-26: `termosBusca` escapa `%`, `_` e `\\`, e a query usa `ESCAPE '\\'`.

Como o repositório foi **público**, documentar essas falhas levou à decisão de torná-lo privado antes de versionar o brain. Ver [[Adotar o Maxxi v2 como base]].

## See Also

- [[Achados de código (2026-06-30)]] · [[API Backend Maxxi]] · [[Modelo de Dados]]
