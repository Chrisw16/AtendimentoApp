---
title: Modelo de Dados
type: component
created: 2026-06-30
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Modelo de Dados", "schema", "banco", "migrations", "tabelas"]
tags: [backend, banco, postgres, knex]
---

# Modelo de Dados

PostgreSQL 16 via Knex. O schema é definido por **23 migrations** em `apps/api/src/migrations/versions/` (numeradas 001–024, sem a 010 — ver a reconciliação da FASE 0), aplicadas por um runner próprio (`run.js`) que registra o aplicado na tabela `_migrations`, roda em transação e ordena por nome de arquivo. São **44 tabelas**. Regra do projeto: nunca `ALTER TABLE` solto — sempre uma migration nova, e **escrita idempotente**: o rastreamento é por NOME DE ARQUIVO, então renomear uma já aplicada a faz rodar de novo. Há teste travando isso (`tests/integracao/migrations-replay.test.js`). O banco é **single-tenant**: nenhuma tabela tem `company_id`.

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

A FASE 6 (Cliente 360) **não criou tabela**: é composição sobre o que já existia — o
sinal de que a fase estava no lugar certo.

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
- `ocorrencias` (tickets), `ordens_servico` (OS de campo, com lat/lng e máquina de estados), `tarefas` (kanban interno).
- `zonas_cobertura` (polígonos GeoJSON), `consultas_cobertura` (log), `equipamentos_rede` + `alertas_rede` (monitor NOC).
- `avaliacoes` (NPS **escala 1-5**) e `satisfacao` (NPS **escala 0-10**) — **duas tabelas/escalas de NPS coexistem** (`satisfacao` usada por fluxos/dashboard; `avaliacoes` pela página Satisfação). Divergência a resolver.
- `auditoria` (log de ações).

## Notas

- `equipamentos_rede` é criada **em runtime** pela rota `monitor /ping` (`createTableIfNotExists`), não por migration; `alertas_rede` é lida mas nunca criada no código visto — anti-pattern, ver [[Achados de código (2026-06-30)]].
- Migration 005 faz **seed** dos 8 prompts da IA (fortemente NetGo). Migration 006 adiciona os campos de sentimento. Migration 007 cria `planos`.
- `_gerarProtocolo` e o `numero` de OS usam `COUNT(*)+1` → race condition sob concorrência.

## See Also

- [[Motor de Fluxo]] · [[IA com Tool Calling]] · [[Integração SGP]]
