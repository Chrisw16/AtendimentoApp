---
title: Modelo de Dados
type: component
created: 2026-06-30
last_updated: 2026-08-26
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Modelo de Dados", "schema", "banco", "migrations", "tabelas"]
tags: [backend, banco, postgres, knex]
---

# Modelo de Dados

PostgreSQL 16 via Knex. O schema é definido pelas migrations em `apps/api/src/migrations/versions/` (numeradas 001–028, sem a 010 — ver a reconciliação da FASE 0), aplicadas por um runner próprio (`run.js`) que registra o aplicado na tabela `_migrations`, roda em transação e ordena por nome de arquivo. São **40 tabelas** (eram 44 até a 027 dropar as quatro do ERP local) mais **três views de leitura**: `conversa_fatos` e `nps_unificado` (025) e `clientes_contato` (028). Regra do projeto: nunca `ALTER TABLE` solto — sempre uma migration nova, e **escrita idempotente**: o rastreamento é por NOME DE ARQUIVO, então renomear uma já aplicada a faz rodar de novo. Há teste travando isso (`tests/integracao/migrations-replay.test.js`). O banco é **single-tenant**: nenhuma tabela tem `company_id`.

⚠️ **O `seed` não roda no deploy** — só as migrations. Catálogo novo (fila, playbook, perfil, categoria) se semeia **por migration** (022 e 024), senão a tela abre vazia em produção e nada acusa.

PKs são `uuid` (`gen_random_uuid()`) exceto `prompts_ia` e `planos` (`increments`) e `canais` (PK lógica `tipo`). Quase toda tabela tem `criado_em`/`atualizado` e colunas `jsonb` (`meta`, `config`, etc.).

## O que cada fase acrescentou

| Migration | Tabelas | Fase |
|---|---|---|
| 014 | `flow_executions`, `protocolo_seq` | 1 — estado do motor persistente |
| 015 | `audit_log` | 3 — governança |
| 016 | `inbox`, `outbox`, `jobs` | 4 — entrada durável, envio write-ahead, relógio |
| 017 | `filas`, `agentes_filas` (+ `agentes.capacidade`, `conversas.fila_id`) | 5 — fila de gente |
| 018 | `knowledge_artigos`, `knowledge_categorias`, `knowledge_versoes`, `knowledge_uso`, `knowledge_feedback`, `knowledge_gaps` | 7 — base de conhecimento |
| 019 | `playbooks`, `playbook_etapas`, `playbook_versoes`, `playbook_execucoes` | 8 — procedimentos |
| 020 | `ia_perfis`, `ia_execucoes` | 9 — AI Runtime |
| 021 | `copiloto_eventos` | 10 — copiloto |
| 022 / 024 | (dados, sem schema) | catálogos e carga de conhecimento |
| 023 | `quality_scorecards`, `quality_auditorias` | 11 — Quality AI |
| 025 | views `conversa_fatos`, `nps_unificado` (+ `analytics_config`) | 12 — Analytics (leitura, sem event store) |
| 026 | `erros_app` | 13 — observabilidade |
| 027 | **DROP** de `ocorrencias`, `ordens_servico`, `equipamentos_rede`, `alertas_rede` | remoção dos módulos de ERP (2026-08-26) |
| 028 | view `clientes_contato` | Clientes = histórico de contato (2026-08-26) |

A FASE 6 (Cliente 360) **não criou tabela**: é composição sobre o que já existia — o
sinal de que a fase estava no lugar certo. Mesma coisa na 028: o padrão se repete e
**vale como regra** — tabela nova só quando o fato ainda não tem casa.

## A view `clientes_contato` (028) — e por que não é tabela

A aba Clientes é o **histórico de contato**: quem já falou com a gente, quantas vezes, e
se já sabemos quem é. Ela agrupa `conversas` por **`COALESCE(telefone, id::text)`** e
expõe, por contato: `telefone`, `nome`, `cpf`, `contrato_id`, `email`, `cidade`,
`ultimo_canal`, `ultima_conversa_id`, `ultimo_protocolo`, `conversas` (contagem),
`primeiro_contato`, `ultimo_contato`, `em_atendimento`.

**Por que view e não tabela.** Os fatos já moram em `conversas` desde a migration 001, e
as colunas `cpf`/`contrato_id` passaram a ser **escritas** na FASE 6 (nó
`consultar_cliente` do motor). Uma tabela `clientes` seria uma **segunda verdade para o
mesmo fato**: exigiria backfill, exigiria um segundo escritor sincronizado com o motor,
**nasceria vazia** para todo o histórico anterior, e no dia em que dessincronizasse a tela
mentiria. É o mesmo argumento com que a FASE 12 recusou um event store. O que faltava era
**leitura** — é o que a view é.

- ⚠️ **`COALESCE(telefone, id::text)` não é detalhe.** Com `GROUP BY telefone` puro, toda
  conversa de widget (telefone `NULL`) cai no mesmo grupo e vira **um cliente só**,
  juntando gente que nunca se falou. É a mesma armadilha da FASE 6 e da window de
  recontato da `conversa_fatos` (025), em `GROUP BY`.
- **`(array_agg(x ORDER BY criado_em DESC) FILTER (WHERE x IS NOT NULL))[1]`** = "o último
  valor que conhecemos". É isso que faz o telefone que volta meses depois já aparecer com
  o CPF que a IA identificou lá atrás — o vínculo não é copiado para lugar nenhum, é uma
  agregação.
- **`DROP VIEW` + `CREATE VIEW`**, nunca `CREATE OR REPLACE` (falha quando a lista de
  colunas muda) — mesma regra da 025.
- ⚠️ **Teto:** agrega `conversas` inteira a cada request. Com o volume atual é de graça;
  vira `MATERIALIZED VIEW` (refresh no encerramento) ou tabela real quando `conversas`
  passar da casa das centenas de milhares.
- ⚠️ **Só o nó `consultar_cliente` escreve `conversas.cpf`.** Um fluxo que colete CPF por
  `salvar_dado` guarda no blob do estado e **não** persiste o vínculo — o contato aparece
  como "não identificado".

## Detalhes que só se aprende apanhando

- **`knowledge_artigos.busca` é uma coluna GERADA** (`GENERATED ALWAYS AS ... STORED`),
  não mantida por trigger: artigo editado nunca fica com índice velho. Ela usa a função
  **IMMUTABLE `knowledge_norm()`**, que tira acento e indexa as duas formas do texto com
  hífen — sem isso `conexao` não acha `conexão` e `wifi` não acha `Wi-Fi`.
- **`conversas` tem unique parcial** `(telefone, canal) WHERE status <> 'encerrada'` — é o
  que impede duas conversas para a mesma pessoa (FASE 1).
- **`protocolo_seq`** existe porque `COUNT(*) do dia + 1` **não converge** sob
  concorrência (medido: 8 chamadas simultâneas ainda colidiam na 5ª tentativa).
- **`inbox`/`outbox`/`jobs` contam `tentativas` na REIVINDICAÇÃO**, não na falha: SIGKILL
  não passa pelo `catch`.
- ⚠️ **Vários `down()` são destrutivos** (008, 014, 017): derrubam índices de que
  `onConflict` depende. **Não rode em produção.**

## Tabelas por domínio

**Atendimento (núcleo):**
- `conversas` — uma conversa/atendimento. Campos-chave: `canal`, `telefone`, `nome`, `status` (`ia`|`aguardando`|`ativa`|`encerrada`), `agente_id`, `protocolo` (único, `YYYYMMDD-NNNN`), `prioridade`, `aguardando_desde`, `canal_instancia` (instância Evolution p/ responder), `cpf`/`contrato_id`, `sentimento`/`topico`/`resumo_ia` (preenchidos pela [[Supervisora IA]]), timestamps de SLA (`assumido_em`, `primeira_msg_agente_em`, `ultima_msg_agente_em`).
- `mensagens` — `conversa_id`, `origem` (`cliente`|`agente`|`ia`|`sistema`), `tipo` (texto/imagem/audio/video/doc/nota), `texto`, `url`/`mime`, `external_id` (dedup do canal), `reacoes` jsonb, `apagada`.
- `notas` (internas), `respostas_rapidas`, `agendamentos`.
- `agentes` — operadores: `login`, `senha_hash` (bcrypt), `role` (`admin`|`agente`), `online`, `permissoes` jsonb.

**Automação/IA:**
- `fluxos` — grafo do editor: `dados` jsonb (`{nodes, edges}`, formato atual) + `nos`/`conexoes` (legado), `ativo` (só um por vez), `gatilho`, `publicado`/`versao`. Consumido pelo [[Motor de Fluxo]].
- `prompts_ia` — prompts editáveis em runtime: `slug` (regras/estilo/roteador/financeiro/suporte/comercial/faq/outros), `conteudo`, `padrao` (para restaurar), `provedor`/`modelo`/`temperatura`. Ver [[IA com Tool Calling]].
- `planos` — catálogo comercial local que espelha o SGP: `plano_id_sgp` (vai no precadastro), `nome`, `valor`, `velocidade`, `cidade`. Alimenta a tool `listar_planos_ativos`.
- `sistema_kv` — key-value de configuração: **guarda as credenciais de integração** (`sgp_url/app/token`, `evolution_url/key`, `anthropic_api_key`, `telegram_bot_token`...), além de `modo` (bot/humano), `horario`, `planos_texto`, `tipos_ocorrencia`. Ver risco em [[Auth e Segurança]].

**Operações ISP:**
- `tarefas` (kanban interno).
- `zonas_cobertura` (polígonos GeoJSON), `consultas_cobertura` (log).
- ⛔ **Dropadas em 2026-08-26 (migration 027):** `ocorrencias`, `ordens_servico`,
  `equipamentos_rede`, `alertas_rede`. Eram um ERP em miniatura ao lado do SGP — o mesmo
  chamado nas duas bases, sem conciliação. Nenhuma FK apontava **para** elas (as que
  existiam eram de saída, para `agentes`/`conversas`), então nem a ordem do drop importou.
  `notas`, `zonas_cobertura` e `consultas_cobertura` **não** saíram junto, apesar de
  nascerem nas mesmas 001/002. O `down()` recria a **estrutura**, não os dados — por isso
  o `up()` conta as linhas antes e loga o número, para o dado não sumir sem registro.
- `avaliacoes` (NPS **escala 1-5**) e `satisfacao` (NPS **escala 0-10**) — **duas tabelas/escalas de NPS coexistem** (`satisfacao` usada por fluxos/dashboard; `avaliacoes` pela página Satisfação). Divergência a resolver.
- `auditoria` (log de ações).

## Notas

- ~~`equipamentos_rede` é criada **em runtime** pela rota `monitor /ping`~~ → resolvido em 2026-08-26 pela raiz: a rota `POST /api/monitor/ping` saiu, e com ela o **último `createTableIfNotExists` do código**. Enquanto ela existisse, a 027 dropava a tabela e o primeiro POST a ressuscitaria vazia.
- Migration 005 faz **seed** dos 8 prompts da IA (fortemente NetGo). Migration 006 adiciona os campos de sentimento. Migration 007 cria `planos`.
- ~~`_gerarProtocolo` e o `numero` de OS usam `COUNT(*)+1`~~ → o protocolo virou `protocolo_seq` na FASE 1; o `numero` de OS foi embora com a tabela (027).

## See Also

- [[Motor de Fluxo]] · [[IA com Tool Calling]] · [[Integração SGP]]
