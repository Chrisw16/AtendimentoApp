---
title: Backup e Restore
type: runbook
created: 2026-08-22
last_updated: 2026-08-22
status: active
related: ["[[Runbooks Maxxi]]", "[[Modelo de Dados]]", "[[Auth e Segurança]]", "[[FASE 13 — Observabilidade e hardening]]"]
aliases: ["backup", "restore", "restaurar banco", "pg_dump", "drill de restauração"]
tags: [runbook, operacao, backup, postgres]
---

# Backup e Restore

Procedimento do §142. **Backup que nunca foi restaurado não é backup** — por
isso a última seção (o drill) não é opcional.

## Backup

O Postgres do Coolify tem *scheduled backups* nativo (`pg_dump` agendado com
destino local/S3). É **configuração, não código**.

**Retenção proposta:** 7 diários + 4 semanais.

## ⚠️ Duas armadilhas que só este sistema tem

1. **O dump contém CREDENCIAL e PII.** `sistema_kv` guarda as chaves de SGP,
   Evolution e Anthropic; `inbox.payload` guarda o webhook cru (telefone e texto
   do cliente); `flow_executions.estado` guarda a ficha coletada pela IA. **O
   arquivo de backup é material sensível** — trate como credencial, não como
   arquivo de banco.
2. **Sem a mesma `KV_SECRET`, o restore vem ilegível.** A cripto em repouso da
   FASE 3 é oportunista: valores gravados com `KV_SECRET` presente ficam
   `enc:v1:...`. Restaurar num ambiente com outra chave (ou sem chave) deixa as
   credenciais **inutilizáveis**, e o sintoma aparece só num 403 do SGP.
   **Guarde a `KV_SECRET` junto deste procedimento, fora do dump.**

## Restore

1. Banco vazio (novo database ou `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`).
2. `pg_restore -d <url> <arquivo>` (ou `psql -f` se for dump SQL).
3. Confira que a `KV_SECRET` do ambiente é a mesma de quando o dump foi feito.
4. Suba a aplicação. **As migrations são replay-safe e há teste travando isso**
   (`tests/integracao/migrations-replay.test.js`), então bootar depois do
   restore é seguro — o runner vai apenas confirmar o que já está aplicado.

## Checklist pós-restore

- [ ] `SELECT name FROM _migrations ORDER BY id DESC LIMIT 1` — é a última esperada?
- [ ] Contagens fazem sentido: `conversas`, `mensagens`, `knowledge_artigos`,
      `playbooks`, `filas`, `agentes`.
- [ ] `GET /health/ready` responde **200** (503 permanente = migration falhou).
- [ ] `GET /health/dependencies` (admin): banco `ok`, filas sem DLQ inesperada.
- [ ] Uma conversa de teste pelo link público `/teste/<token>` de um fluxo.
- [ ] Uma consulta real ao SGP (tela Clientes) — prova que a `KV_SECRET` bate.

## Drill trimestral (não pule)

Restaure o dump mais recente no **Postgres nativo da máquina de desenvolvimento**
(nunca em produção), rode o checklist inteiro e **anote a data aqui**:

| Data do drill | Quem | Resultado |
|---|---|---|
| — | — | ainda não realizado |

Automatizar o drill exigiria infra que não existe hoje. Manual e **documentado**
é melhor que automatizado e imaginário.

## Teste de carga (§147)

`node scripts/carga.js --url http://localhost:4000 --msgs 200 --taxa 20`

**Nunca contra produção**: o webhook cria conversa de verdade, o motor chama o
SGP de verdade e o outbox manda WhatsApp de verdade.

O número que importa não é a latência do webhook (ele só persiste no `inbox`, e
deve responder em milissegundos) — é a **taxa de drenagem**: acompanhe
`GET /api/filas` ou `SELECT status, count(*) FROM inbox GROUP BY 1`.

O que este teste **não** mede: a latência real de SGP e LLM, que domina o turno
de verdade. Ele mede a capacidade do app, que é a pergunta de sizing.

## See Also

- [[Runbooks Maxxi]] · [[Modelo de Dados]] · [[FASE 13 — Observabilidade e hardening]]
