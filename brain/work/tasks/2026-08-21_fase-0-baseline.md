---
title: FASE 0 — Reconciliação e linha de base
type: task
created: 2026-08-21
last_updated: 2026-08-21
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/canais-e-webhooks", "systems/maxxi/components/motor-fluxo"]
related: ["[[Fechamento 2026-08-21 + pauta]]", "[[WhatsApp API Oficial — estado e pendências]]", "[[Canais e Webhooks]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["FASE 0", "linha de base", "baseline", "Plano de Evolução Fase 0"]
tags: [work, task, fase-0, plano-evolucao, testes, seguranca, migrations]
---

# FASE 0 — Reconciliação e linha de base

Primeira fase do [Plano Mestre de Evolução V1.0](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md).
Objetivo declarado pelo plano: *"garantir que a implementação seja feita sobre o
comportamento real"*. A FASE 1 vai persistir o estado do motor — construir isso
sobre premissas nunca verificadas era o risco que esta fase existe para eliminar.

## O ambiente, que era o bloqueio real

A documentação assume `docker-compose`. **Esta máquina não tem Docker** — nem
Colima, nem Podman. O compose não é executável aqui, e nunca foi: é por isso que
os itens de banco da ERS §8.2 seguiam como aposta havia meses.

Resolvido com Postgres nativo via Homebrew:

```bash
brew install postgresql@16 && brew services start postgresql@16
createdb -O maxxi maxxi_v2        # dev
createdb -O maxxi maxxi_v2_test   # testes de integração (é TRUNCADO)
```

Role `maxxi` / senha `maxxi_dev_pass` — as mesmas do `docker-compose.yml`, para
o `.env.example` e o compose seguirem coerentes. Redis já estava de pé (7.4.8).

**Rodar os testes de integração:**

```bash
cd apps/api
DATABASE_URL_TEST='postgres://maxxi:maxxi_dev_pass@127.0.0.1:5432/maxxi_v2_test' \
REDIS_URL_TEST='redis://127.0.0.1:6379' \
npm run test:integracao
```

Sem essas envs eles se **pulam** com motivo explícito — `npm test` continua
185/185 em qualquer máquina, sem serviço nenhum.

## O que virou fato

### 1. As 12 migrations aplicam limpas do zero ✅

Primeira execução verificada contra Postgres 16.15. Todas as 12, em ordem,
incluindo o buraco proposital no `010`. Schema resultante: **22 tabelas**.

### 2. A deduplicação funciona ✅

6 testes em `tests/integracao/dedup-mensagens.test.js`. O caso que importa é o
**concorrente** — o TOCTOU que motivou a migration 008: três `criar()`
simultâneos com o mesmo `external_id` gravam **uma** mensagem.

Verificado com dentes: derrubado o índice único, os 6 falham.

### 3. O Redis pub/sub funciona ✅

3 testes em `tests/integracao/sse-redis.test.js`. Duas instâncias reais do
módulo (query-string no import ESM dá módulos independentes, com
`INSTANCIA_ID` e conexões próprias — que é o que dois containers seriam).

Prova o broadcast cruzando instâncias, `sendToAgente` respeitando o
destinatário, e `ehEcoProprio` impedindo a entrega dupla. Verificado com
dentes: com Redis morto, as duas travessias falham.

Isso fecha as duas primeiras linhas da ERS §8.2.

### 4. O CPF saiu do log ✅

O CLAUDE.md listava 3 logs de PII. A varredura achou **6** — e o pior não
estava na lista: `[SGP] consultacliente` imprimia o **CPF completo** a cada
consulta. Caminho quente do sistema, não debug esquecido. Detalhe no commit
`4289426`.

## O que a FASE 0 descobriu (divergências)

### `001` e `002` não sobrevivem a um replay ⚠️

O CLAUDE.md manda *"escreva idempotente… renomear uma migration já aplicada faz
ela rodar de novo"*. Testadas uma a uma, **10 das 12 sobrevivem; `001` e `002`
não**:

```
001_schema_inicial.js  ❌ alter table "agentes" add constraint "agentes_login_unique" already exists
002_tabelas_adicionais ❌ create index "zonas_cobertura_tipo_index" already exists
```

Causa: as duas usam `createTableIfNotExists` do knex — **deprecado**, e o
próprio knex avisa no boot. Ele emite o `CREATE TABLE IF NOT EXISTS` mas depois
dispara `ALTER TABLE ADD CONSTRAINT` e `CREATE INDEX` **incondicionalmente**.

Não é risco vivo hoje (produção já tem as duas em `_migrations`). Vira risco se
alguém renomear os arquivos ou se uma linha de `_migrations` se perder — e uma
migration que falha no boot **pula a inicialização dos monitores de SLA e da
supervisora** (`server.js`). Corrigir o conteúdo é seguro; **renomear é o que
não pode**.

### `onConflict` e a migration 008 são acoplados — e isso responde a pauta

Ao derrubar o índice para testar, todos os 6 testes falharam, inclusive os que
não deveriam depender dele. O motivo:

```
there is no unique or exclusion constraint matching the ON CONFLICT specification
```

`mensagemRepo.criar` usa `onConflict('external_id')` **incondicionalmente**.
Sem o índice único da 008, o Postgres recusa **todo** insert de mensagem — não
só as duplicatas. E os três webhooks (Evolution, Telegram, Meta) gravam por
`mensagemRepo.criar`.

**Consequência prática:** a pauta pedia ler o log de boot do Coolify para
confirmar a 008. Não é mais estritamente necessário — uma instância que
**armazena mensagens** prova, por comportamento, que a 008 aplicou. Se não
tivesse aplicado, nenhuma mensagem entraria e isso seria óbvio.

Fica um alerta no lugar: **o `down()` da migration 008 derruba a ingestão
inteira**, não faz rollback parcial. Nunca rodar em produção.

### Menores

- `node --test <diretório>` não funciona no Node 24 — precisa de glob. Está no
  script `test:integracao`.
- `[SGP] manutencao/list raw` segue despejando 600 chars. **Mantido**: é janela
  de manutenção e POP, dado de rede, não do assinante. É ruído, não vazamento.
- `seed.js` imprime as credenciais padrão (`admin/admin123`). Não é PII, é o
  item *"eliminar seeds previsíveis em produção"* (§123) — **FASE 3**.

## Aberto ao fim da FASE 0

- **Deploy.** O Coolify não deploya (webhook 200, nada sobe). Confirmado ao vivo
  nesta sessão: `GET /api/webhooks/meta?hub.mode=subscribe&hub.challenge=X`
  ainda responde `text/html` refletindo o challenge — **o XSS corrigido em
  `f8ed98f` continua vivo em produção**. Mitigação sem deploy: definir
  `META_VERIFY_TOKEN` no ambiente.
- **Idempotência de `001`/`002`** — diagnosticada, não corrigida. Decisão
  pendente.
- **Sem CI.** Os testes de integração só rodam quando alguém roda. Pipeline é
  FASE 13.

## See Also

- [[Fechamento 2026-08-21 + pauta]] · [[WhatsApp API Oficial — estado e pendências]] · [[Canais e Webhooks]]
