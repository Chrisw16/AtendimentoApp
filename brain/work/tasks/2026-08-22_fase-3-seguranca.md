---
title: FASE 3 — Segurança e governança base
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/canais-e-webhooks"]
related: ["[[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]]"]
tags: [work, task, fase-3, plano-evolucao, seguranca]
---

# FASE 3 — Segurança e governança base

Referência: [Plano Mestre PARTE XV (§113–124) e FASE 3](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md).

## O que entra (e a decisão por trás de cada um)

### 1. Mass-assignment nos PUT de `ocorrencias`/`ordens`/`tarefas` (§114)

`update({ ...req.body })` deixa o cliente gravar **qualquer coluna** — incluindo
`agente_id` de outra pessoa e `criado_em`. Vira allowlist de colunas por rota.
`tarefas` ganha ownership: editar/apagar só o dono (`agente_id`) ou admin.

### 2. Mascaramento de secrets (§117: "frontend nunca recebe o segredo de volta")

`GET /sysconfig` devolve `anthropic_api_key`, `sgp_token`, `evolution_key`,
`telegram_bot_token`, `sgpdb_password`… **em texto plano**. Uma sessão de admin
vazada entrega todas as credenciais de uma vez.

- GET (agregado e `/:chave`) passa a devolver máscara `••••1234` (últimos 4)
  para as chaves da lista `CHAVES_SECRETAS`.
- PUT **ignora** valor que é máscara — senão salvar a tela destrói o segredo
  real. (O frontend não muda: campo mostra a máscara, digitar por cima troca.)

### 3. Criptografia em repouso — **oportunista, sem migração de dados** (§117)

11 arquivos leem `sistema_kv` direto; não há chokepoint. E uma migração que
criptografa exige `KV_SECRET` **já setada no Coolify no momento do deploy** —
não estará, e as credenciais de produção ficariam ilegíveis (SGP/IA fora).

Desenho que não quebra nada:

- `services/kvSeguro.js`: `criptografar/descriptografar` (AES-256-GCM, chave =
  `KV_SECRET` do ambiente, valores marcados `enc:v1:`).
- **Escrita** (só o PUT do sysconfig grava credencial): criptografa **se** a
  chave existir no ambiente; sem ela, grava como hoje e avisa no log.
- **Leitura** (os 4 leitores de segredo: `integrations.getKV`, `sgpDb`,
  `telegram.js`, `webhooks/telegram.js`): valor `enc:v1:` → descriptografa;
  texto plano → usa como está.
- Ativação: operador seta `KV_SECRET` no Coolify e re-salva as credenciais na
  tela. Zero migração, zero janela de quebra, rollback trivial.
- Ceiling explícito: chave mestre vive no env do MESMO container (é onde
  `DATABASE_URL` já vive). Num deploy single-box o ganho real é contra dump de
  banco/backup vazado — que é exatamente o cenário do §117.

### 4. Audit Log (§119) — migration 015

```
audit_log: id, actor_type(human|ai|system), actor_id, action, resource,
           before jsonb, after jsonb, conversa_id, ip, criado_em
```

`services/auditoria.js` → `auditar({...})` fire-and-forget (auditoria **nunca**
derruba a operação auditada). Pontos de gancho:

- login ok/falha (com IP) — `auth.js`
- `PUT /sysconfig` — **quais chaves** mudaram, nunca os valores
- assumir / devolver-ia / encerrar — `chat.js` (actor human)
- tool de escrita executada pela IA (`is_write` da FASE 2) — actor **ai**,
  com `conversa_id` (§118: rastro do que a IA fez no mundo)
- CRUD de agentes

Sem tela nesta fase — o log é consultável por SQL; timeline amigável (§120) é
com o Conversation Events da FASE 12.

### 5. Autenticação (§123) — o que dá para fazer sem quebrar sessão

- **Rate limit específico do login**: 20 tentativas / 15 min por IP
  (`express-rate-limit` já instalado). Auditado quando bloqueia.
- **Seed previsível**: em `NODE_ENV=production`, `seed.js` recusa `admin123`/
  `agente123` — gera senha aleatória e imprime **uma vez** no log do seed.
- **Access+refresh token: REGISTRADO, não feito.** O frontend já tenta refresh
  no 401, mas o `/auth/refresh` exige token **válido** — com token expirado o
  refresh também morre. Encurtar o TTL hoje = deslogar todo mundo a cada X
  horas. Fazer direito pede refresh token separado + storage + rotação: entra
  quando houver uma sessão de trabalho dedicada a auth, não de carona.

### 6. Validação de webhooks (§122) — na medida do que cada canal suporta

- **Meta POST**: valida `X-Hub-Signature-256` (HMAC do corpo com
  `META_APP_SECRET`) — helper puro ao lado do `metaSeguranca.js`, testável.
  Sem a env: aceita e avisa (compat); com ela: **fail-closed**.
- **Telegram**: valida `X-Telegram-Bot-Api-Secret-Token` se
  `TELEGRAM_WEBHOOK_SECRET` setada (o `setWebhook` do Telegram suporta nativo).
- **Evolution**: não assina. Suporte a `?token=` na URL comparado em tempo
  constante com `EVOLUTION_WEBHOOK_TOKEN`; sem a env, comportamento atual.
- Dedup/idempotência/rate-limit já existem (008 + limiter global).

## Fora desta fase (registrado)

- **Permissões granulares + Supervisor (§113–115)**: sem equipes/filas (FASE 5)
  o papel Supervisor não tem o que supervisionar. `admin|agente` com enforcement
  já existe; o modelo `Usuário → Role → Equipe` entra com a FASE 5.
- **Mascarar CPF/telefone na UI (§116)** — junto do Cliente 360 (FASE 6), que
  redesenha essas telas.
- **Access/refresh token** — ver acima.
- **Governança de versão de fluxo/prompt (§121)** — o motor já congela o grafo
  por conversa (FASE 1); ciclo editorial completo é com o Knowledge Hub (FASE 7).

## Critérios de saída — **todos fechados (2026-08-22)**

- [x] nenhum PUT aceita coluna fora da allowlist; tarefas com ownership
- [x] nenhum segredo sai em texto plano por GET
- [x] segredo re-salvo com `KV_SECRET` setada fica cifrado no banco e o sistema segue lendo
- [x] audit_log gravando: login, sysconfig, chat, tool de escrita da IA
- [x] 6ª tentativa de login errada em sequência: bloqueada e auditada
- [x] seed em produção não cria senha previsível
- [x] Meta com `META_APP_SECRET`: payload sem assinatura válida é recusado

Suítes ao fechar: **227 puros · 54 integração**.

## O que a implementação forçou a mudar no desenho

Três coisas só apareceram ao escrever o código e o teste:

1. **A coluna `sistema_kv.valor` é `jsonb`.** Um `enc:v1:...` cru **não é JSON
   válido** e o Postgres recusaria. O ciphertext precisa ser serializado de novo
   antes de gravar. O desenho não previa isso.
2. **`lerValorKV` fixava `process.env.KV_SECRET`** e não aceitava a chave por
   parâmetro — impossível de testar sem mutar o ambiente do processo. Ganhou um
   terceiro argumento.
3. **`getKV` era privada do módulo.** É o leitor por onde passam SGP, Evolution
   e Anthropic — e foi justamente essa falta de teste que deixou o bug do
   ciphertext (parse antes de decifrar) passar despercebido. Exportada.

## Degradações escolhidas, e por quê

- **GET com credencial ilegível** (`KV_SECRET` ausente ou trocada) devolve
  `null` com log, em vez de erro. Derrubar a tela de Configurações inteira
  deixaria o admin sem como consertar pela interface — exatamente quando ele
  mais precisa dela.
- **PUT sem `KV_SECRET`** grava em texto plano e avisa no log. Recusar a
  gravação transformaria a ausência de uma env opcional em indisponibilidade.

## O frontend não precisou mudar

`Configuracoes.jsx` inicializa os campos a partir do GET (agora a máscara) e
manda o **form inteiro** a cada save. É por isso que "o PUT ignora máscara" não
é refinamento: sem ele, todo save destruiria toda credencial não editada.

## Continua fora (registrado)

Permissões granulares + Supervisor (§113–115) → FASE 5 · Mascarar CPF/telefone
na UI (§116) → FASE 6 · Access/refresh token (§123) → sessão dedicada a auth ·
Governança editorial (§121) → FASE 7.

## See Also

- [[FASE 0 — Reconciliação e linha de base]]
