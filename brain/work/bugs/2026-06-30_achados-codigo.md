---
title: Achados de código (2026-06-30)
type: bug
created: 2026-06-30
last_updated: 2026-06-30
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/auth-e-seguranca", "systems/maxxi/components/realtime-sse", "systems/maxxi/components/api-backend"]
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Auth e Segurança]]", "[[Realtime SSE]]", "[[API Backend Maxxi]]", "[[Frontend Maxxi]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Achados de código (2026-06-30)", "achados", "bugs", "dívida técnica", "findings"]
tags: [work, bug, seguranca, divida-tecnica]
---

# Achados de código (2026-06-30)

Lista de bugs, falhas de segurança e dívidas levantados no estudo linha-por-linha do código (auditoria estática, não validada rodando). Cada item vira candidato a task numa das fases de [[Maxxi v2 / GoCHAT — Visão geral|hardening/validação]].

## Segurança

- **[crítico] API keys expostas:** `GET /api/sysconfig` e `/:chave` retornam `anthropic_api_key`, `openai_api_key`, `sgp_token`, `evolution_key`, `telegram_bot_token` em texto plano (sem mascaramento). Restrito a admin, mas vaza tudo se uma sessão admin cair.
- **[crítico] Credenciais em plaintext no `sistema_kv`** — sem criptografia em repouso.
- **[alto] `JWT_SECRET` com fallback hardcoded** (`'maxxi-dev-secret-change-in-prod'`) se a env não for setada. Token expira em 30 dias.
- **[médio] Sem rate-limit específico de login** (só global 200/min). Sem testes.
- **[médio] Mass-assignment** (`{...req.body}`) em PUT de `ocorrencias`, `ordens`, `tarefas`; `tarefas` PUT/DELETE sem ownership-check.
- **[baixo] SQL string-interpolada** em `dashboard.js` (`INTERVAL '${days}'`, `${table}`) — atenuado por whitelist; LIKE sem escape de wildcard em `clientes.js`.

## Bugs funcionais

- **`sseManager.js` importa `redis`** (node-redis) mas o pacote é `ioredis` → Redis pub/sub não conecta, broadcast fica em modo local. Ver [[Realtime SSE]].
- **`evolutionEnviarLista`** espera `labelBotao`/`tituloSecao` (camelCase) mas o [[Motor de Fluxo|motor]] envia `label_botao`/`titulo_secao` → rótulos da lista perdidos no WhatsApp.
- **`ocorrencias POST /:id/notas`** cria nota órfã (não associa à ocorrência).
- **`monitor /ping`** cria `equipamentos_rede` em runtime (DDL); `alertas_rede` nunca é criada → `/status` sempre sem alertas.
- **Meta media `/api/media/:id`** referenciada mas sem rota montada → mídia do WhatsApp oficial não carrega.
- **Protocolo de conversa e número de OS** usam `COUNT(*)+1` → race condition.
- **Dois caches de prompt** desalinhados (integrations vs promptService TTL 3min).
- **`analisarConversaEncerrada`** (sentimento ao encerrar) importada em `chat.js` mas aparentemente não chamada na rota de encerramento.
- **Porta do `abrir_chamado` inconsistente:** `nodeTypes.js` declara a porta `saida`, mas o [[Catálogo de Nós|motor]] avança por `sucesso`/`erro` — o editor não expõe as portas reais do nó.

## Branches / processo

- A branch `dev` alterou o comportamento "sem fluxo ativo" e o break do loop agêntico do [[Motor de Fluxo]]. Há divergência entre `main` e `dev` a revalidar antes de alinhar/mesclar.

## Frontend

- **`Clientes.jsx`**: `useDebounce` usa `useState` no lugar de `useEffect` (busca não dispara) + `process.env` em vez de `import.meta.env`.
- **`Tarefas.jsx` e `Financeiro.jsx`** implementadas mas **sem rota** em `App.jsx`.
- **`Cobertura.jsx`** só lê/deleta zonas (sem ferramenta de desenho).
- **`Topbar`** lê `n.lida` mas o store cria `read` → badge de não-lidas sempre 0.
- **`FlowNode` (linha ~209)**: `borderBottom` é string literal não interpolada.
- Fonte `DM Sans` usada inline mas não importada nos tokens.

## Resíduos do sistema de inspiração ("CITmax")

- Tool `status_rede` menciona "rede CITmax"; `seed.js` tem resposta rápida apontando `citmax.com.br/cliente`.
- O **fluxo padrão do seed** usa tipos de nó legados (`mensagem`/`menu`, arestas `{origem,destino}`) que **não casam** com o motor atual (`enviar_texto`/`enviar_botoes`, `{from,to}`) → não-funcional. Fluxos reais vêm do editor visual.

## See Also

- [[Auditoria profunda (2026-06-30)]] — segunda passada (4 agentes + verificação), com os mismatches editor↔motor e bugs novos.
- [[Auth e Segurança]] · [[Realtime SSE]] · [[Maxxi v2 / GoCHAT — Visão geral]]
