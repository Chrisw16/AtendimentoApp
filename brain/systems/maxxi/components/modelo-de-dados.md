---
title: Modelo de Dados
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Integração SGP]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Modelo de Dados", "schema", "banco", "migrations", "tabelas"]
tags: [backend, banco, postgres, knex]
---

# Modelo de Dados

PostgreSQL 16 via Knex. O schema é definido por **7 migrations** em `apps/api/src/migrations/versions/`, aplicadas por um runner próprio (`run.js`) que registra o aplicado na tabela `_migrations`, roda em transação e ordena por nome de arquivo. Regra do projeto: nunca `ALTER TABLE` solto — sempre uma migration nova. O banco é **single-tenant**: nenhuma tabela tem `company_id`.

PKs são `uuid` (`gen_random_uuid()`) exceto `prompts_ia` e `planos` (`increments`) e `canais` (PK lógica `tipo`). Quase toda tabela tem `criado_em`/`atualizado` e colunas `jsonb` (`meta`, `config`, etc.).

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
