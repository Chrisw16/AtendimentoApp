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
REDIS_URL_TEST='redis://127.0.0.1:6380' \
npm run test:integracao
```

Sem essas envs eles se **pulam** com motivo explícito — `npm test` continua
185/185 em qualquer máquina, sem serviço nenhum.

> ⚠️ **O `6379` desta máquina NÃO é um Redis local — é um túnel SSH** (`ssh -f -N
> workflow-vps`). Os testes de integração desta fase publicaram no Redis do outro
> lado do túnel. Sob ele, `broadcast` entre instâncias falha de forma
> intermitente (latência acima da janela de 3 s do `ateQue`) e o processo de
> teste não encerra. Corrigido em 2026-08-21 com um **Redis local dedicado**:
> `brew install redis && redis-server --port 6380 --daemonize yes --save ''`,
> e `REDIS_URL_TEST='redis://127.0.0.1:6380'`. Resultado: **22/22, 1.4 s**
> (contra 21/22 e 4.6 s pelo túnel). **Nunca aponte `REDIS_URL_TEST` para o
> 6379 desta máquina.**

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

### `001` e `002` não sobreviviam a um replay — **corrigido** ✅

O CLAUDE.md manda *"escreva idempotente… renomear uma migration já aplicada faz
ela rodar de novo"*. Testadas uma a uma, **10 das 12 sobreviviam; `001` e `002`
não**:

```
001_schema_inicial.js  ❌ alter table "agentes" add constraint "agentes_login_unique" already exists
002_tabelas_adicionais ❌ create index "zonas_cobertura_tipo_index" already exists
```

Causa: `createTableIfNotExists` do knex — **deprecado**, e o próprio knex avisa
18 vezes no boot. Ele emite o `CREATE TABLE IF NOT EXISTS` mas dispara
`ALTER TABLE ADD CONSTRAINT` e `CREATE INDEX` **incondicionalmente**.

Corrigido com um helper local `criarTabela()` + guarda `hasTable` — o padrão que
o próprio aviso do knex prescreve. Local em cada arquivo de propósito: migration
é registro histórico e não deve depender de módulo compartilhado que mude depois.

Verificado dos dois lados, que é o que importa numa mudança de migration:
- **replay** sobre schema pronto: 12/12 (antes 10/12)
- **banco do zero**, código novo vs. antigo: `pg_dump -s` **idêntico** — 414
  linhas, 22 tabelas, 21 índices

Travado por `tests/integracao/migrations-replay.test.js`, para não voltar em
silêncio na próxima migration.

**Efeito colateral encontrado no caminho:** com dois arquivos de teste aplicando
migrations no mesmo banco, rodá-los em paralelo faz dois processos criarem
`_migrations` ao mesmo tempo (`Key (typname, typnamespace)=(_migrations, 2200)
already exists`) e o schema sai pela metade. O script usa
`--test-concurrency=1`. **Teste de integração que compartilha banco não pode
rodar em paralelo.**

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

### Deploy — o diagnóstico antigo estava errado

A tese registrada era *"o Coolify recebe 200 e nunca deploya"*. **Falso.**
Reconstruída a linha do tempo de 21/08 (UTC):

| Hora | Evento |
|---|---|
| 19:17 | commit `32a558c` |
| 19:20 | entrega #1 do webhook → 200 |
| 19:26 | commit `f8ed98f` — **a correção do XSS** |
| 19:55 | entrega #2 → 200 |
| **20:06** | **`index.html` de produção reconstruído — um deploy COMPLETOU** |
| 22:54 | entrega #3 → 200 |

Ou seja: a entrega #1 **virou deploy**; a #2, que carregava a correção de
segurança, **se perdeu**. O deploy é **intermitente**, não morto — o que é um
problema diferente e pior, porque parece funcionar.

Config do webhook (`gh api repos/Chrisw16/AtendimentoApp/hooks`):

```
url    http://72.60.53.164:8000/webhooks/source/github/events/manual
       ↑ HTTP puro, IP cru, insecure_ssl=1, SEM SECRET
events ["push"]   active true
```

É o webhook do tipo **`manual`** do Coolify, que **responde 200 mesmo quando
recusa** e põe o motivo no *corpo* da resposta. Foi por isso que "200 OK" foi
lido como sucesso por semanas. **Ninguém nunca leu o corpo.**

Para fechar o diagnóstico faltam duas leituras que exigem acesso humano:
1. **Corpo da resposta das entregas #2 e #3** — GitHub → Settings → Webhooks →
   Recent Deliveries → Response. (Ou `gh auth refresh -h github.com -s
   admin:repo_hook`, que destrava `gh api .../hooks/611298182/deliveries/<id>`.)
2. **Log da aba Deployments no Coolify** — diz se #2 chegou a virar build.

Independente da causa, três correções valem por si:
- **Pôr um secret no webhook** e trocar para **HTTPS**. Hoje o payload do push
  trafega em claro e não há como verificar assinatura.
- **`META_VERIFY_TOKEN` no ambiente** — fecha o XSS **agora**, sem depender de
  deploy.
- **Deploy manual** pelo painel para subir o `f8ed98f`.

### Sonda de deploy

`/health` devolve `2.0.0` **fixo** e não serve para saber o que está no ar. O
carimbo confiável é o **`last-modified` de `GET /`**, que reflete o build do
`index.html`. Hoje: `Fri, 21 Aug 2026 20:06:00 GMT`.

### Resto

- **Sem CI.** Os testes de integração só rodam quando alguém roda. Pipeline é
  FASE 13.
- **`npm run seed`** ainda imprime `admin/admin123` — item §123, FASE 3.

## See Also

- [[Fechamento 2026-08-21 + pauta]] · [[WhatsApp API Oficial — estado e pendências]] · [[Canais e Webhooks]]
