---
title: Maxxi v2 / GoCHAT — Visão geral
type: system
created: 2026-06-30
last_updated: 2026-08-22
status: active
related: ["[[Adotar o Maxxi v2 como base]]", "[[Plano de Evolução V1.0 — status consolidado]]", "[[Motor de Fluxo]]", "[[IA com Tool Calling]]", "[[Knowledge Hub]]", "[[Playbook Engine]]", "[[Cliente 360 e Copiloto]]", "[[Integração SGP]]", "[[Canais e Webhooks]]", "[[Modelo de Dados]]", "[[Frontend Maxxi]]", "[[Design System Maxxi]]", "[[Supervisora IA]]", "[[Fila e SLA]]", "[[Realtime SSE]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi", "2026-06-30_decisao-base-maxxi"]
aliases: ["Maxxi v2 / GoCHAT — Visão geral", "Maxxi", "GoCHAT", "GoChat", "Maxxi v2", "AtendimentoApp"]
tags: [produto, isp, atendimento, omnichannel]
---

# Maxxi v2 / GoCHAT

Sistema de atendimento omnichannel com IA para provedores de internet (ISP), reconstruído do zero com arquitetura limpa. Marca de produto: **GoCHAT**. Repositório: `github.com/Chrisw16/AtendimentoApp` (clonado em `netgo-chat-v2`, último commit `db6c997`). É a [[Adotar o Maxxi v2 como base|base escolhida do produto]] de atendimento para ISP, substituindo o Atendechat como base de evolução.

O ciclo central: uma mensagem entra por um canal (WhatsApp via Evolution/Meta, Telegram), é **persistida no `inbox`** antes de qualquer processamento, vira uma `conversa`, o [[Motor de Fluxo]] executa um fluxo visual de atendimento, a [[IA com Tool Calling|IA Claude]] resolve consultas no [[Integração SGP|SGP]] (boleto, conexão, chamado, planos, pré-cadastro) apoiada pelo [[Knowledge Hub]] e por um [[Playbook Engine|procedimento oficial]] e, quando necessário, transfere para um agente humano — com **handoff estruturado**, fila com SLA e o painel [[Cliente 360 e Copiloto]] ao lado do chat.

> ⚠️ **Esta página descreve o sistema DEPOIS do Plano de Evolução V1.0 COMPLETO — as 13 fases** (agosto/2026). O estado por fase, com as decisões e os tetos assumidos, está em [[Plano de Evolução V1.0 — status consolidado]].

## Arquitetura

Monorepo `apps/api` (Express + Knex/Postgres 16 + Redis) e `apps/web` (React 19 + Vite). Backend em ESM. Em produção (Coolify) um **Dockerfile multi-stage** builda o frontend e a própria API o serve estático no mesmo container (porta 4000); em dev, `docker-compose` separa postgres/redis/api/web. Detalhes de deploy em [[Runbooks Maxxi]].

Princípio arquitetural central: **as credenciais de integração (SGP, Evolution, Anthropic, Telegram) vivem no banco** (tabela `sistema_kv`), configuradas pela tela admin — não em variáveis de ambiente. Só infraestrutura (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`) vem de env. Isso é o que viabiliza a [[Adotar o Maxxi v2 como base|multi-tenancy por instância]]: cada provedor revendido roda um deploy isolado e configura seu próprio SGP/WhatsApp/IA pela interface.

## Subsistemas

**Núcleo do atendimento**
- [[Motor de Fluxo]] — interpretador de grafo (`motorFluxo.js`, ~32 nós). O coração. Estado **persistente** em `flow_executions` desde a FASE 1.
- [[Canais e Webhooks]] — ingestão de mensagens (Evolution, Meta, Telegram). O webhook **só persiste**; quem processa é o worker.
- [[Integração SGP]] — camada de ERP de ISP (URA + precadastro) + Evolution API. **Camada única**: nada mais fala HTTP com o SGP.
- [[Realtime SSE]] — entrega em tempo real ao painel.

**Inteligência**
- [[IA com Tool Calling]] — loop agêntico Claude + tools SGP + composição de prompts + **perfis, hierarquia de confiança e guardrails** (FASE 9).
- [[Knowledge Hub]] — base de conhecimento com workflow editorial, versionamento e busca full-text nativa (FASE 7).
- [[Playbook Engine]] — procedimentos oficiais injetados no prompt, com a etapa **provada pela tool executada** (FASE 8).
- [[Cliente 360 e Copiloto]] — o painel do atendente: ficha do assinante, Context Cards e sugestão de resposta (FASES 6 e 10).
- [[Supervisora IA]] — sentimento e SLA do agente. A **auditoria formal** (scorecard, violação crítica, coaching) é a FASE 11.

**Operação**
- [[Fila e SLA]] — filas de atendimento humano com SLA e horário **por fila**, capacidade por agente e assunção atômica (FASE 5).
- [[Auth e Segurança]] — JWT + bcrypt + **permissões que decidem** + PII mascarada no servidor + audit log.
- [[Modelo de Dados]] — **44 tabelas** (+`_migrations`), single-tenant, 23 migrations.
- [[Frontend Maxxi]] e [[Design System Maxxi]] — painel React e o tema visual.
- [[API Backend Maxxi]] — superfície de rotas REST.
- **Analytics** — indicadores sobre duas views (`conversa_fatos`, `nps_unificado`); **não há event store**, e isso foi decisão (FASE 12).
- **Observabilidade** — log estruturado com correlation ID que atravessa webhook → worker → motor → SGP, PII redigida no log, disjuntor no SGP, error tracking com deduplicação e a tela **Saúde do Sistema** (FASE 13). Backup em [[Backup e Restore]].

### Filas internas (FASE 4) — não confundir com a fila de gente
`inbox` (entrada durável), `outbox` (envio write-ahead) e `jobs` (relógio). Mensagem que
entra é durável, envio é write-ahead e `aguardar_tempo` espera de verdade. A fila de
**pessoas** é outra coisa e mora em [[Fila e SLA]].

## Estado do produto (2026-08-22)

**Em produção** em VPS via Coolify: `https://gochat.netgo.net.br`. O SGP responde de
verdade e a IA comercial roda com tool calling.

| Área | Estado |
|---|---|
| Atendimento ponta-a-ponta | funcional (Evolution/Telegram > Meta) |
| Durabilidade | conversa sobrevive a restart e deploy; entrada e envio duráveis |
| Fila humana | filas com SLA/horário próprios, capacidade, "assumir próximo" atômico |
| Painel do atendente | Cliente 360 + Copiloto + handoff estruturado |
| Conhecimento | base com workflow editorial; **55 artigos** carregados pelo operador |
| Qualidade | auditoria pós-atendimento com evidência, revisão humana e coaching |
| Indicadores | resolução aparente × efetiva, custo de IA, FCR, NPS unificado |
| Operação | Saúde do Sistema, logs correlacionados, disjuntor no SGP |
| Procedimentos | 2 playbooks (suporte e comercial), em rascunho |
| Segurança | PII mascarada **no servidor**, permissões efetivas, cripto em repouso, audit log |
| Multi-tenant | inexistente por decisão — **uma instância por provedor** |
| Testes | **472 puros + 267 de integração** contra Postgres e Redis reais, mais CI no GitHub Actions |

**✅ 13 de 13 fases** do Plano de Evolução V1.0 entregues (agosto/2026). Detalhe e
dívida assumida por fase em [[Plano de Evolução V1.0 — status consolidado]].

## O que ainda não existe

- **Parametrizar o acoplamento NetGo** (POP, `nas_id=53`, textos nos prompts) — é o que
  falta para revender a instância.
- **Volume real**: o sistema está no ar, mas o atendimento em produção segue perto de
  zero — quase tudo foi validado por teste automatizado e sandbox, não por uso.

## Armadilhas que valem para qualquer sessão

- **O `seed` NÃO roda no deploy** — só as migrations. Catálogo novo se semeia por
  migration (ver 022/024), senão a tela abre vazia em produção e nada acusa.
- **Pushar não é deployar**: o Coolify é intermitente. Sonde uma **rota que só existe no
  código novo**, 6+ vezes, e exija unanimidade — durante o rollout convivem duas versões.
- **`seed.js` completo num ambiente que já atende é perigoso**: insere fluxo legado com
  `ativo: true` e o motor escolhe com `where({ativo:true}).first()` sem `ORDER BY`.

## See Also

- [[Adotar o Maxxi v2 como base]]
- [[Achados de código (2026-06-30)]]
