# Brain Log

Registro cronológico append-only de todas as operações no brain.

## [2026-06-30 12:20] INIT | Brain do Maxxi v2 criado

Bootstrap do brain na raiz do repositório `netgo-chat-v2` (código do Maxxi v2 / GoCHAT, clonado de github.com/Chrisw16/AtendimentoApp com histórico completo).

- Estrutura criada: `raw/sources/{code,strategy,docs}`, `brain/systems/maxxi/{components,runbooks,diagrams}`, `brain/{concepts,domains,strategy/decisions}`, `brain/work/{tasks,bugs}`.
- Source inicial absorvida: `2026-06-30_decisao-base-maxxi.md` (handoff da decisão estratégica de adotar o Maxxi como base do produto ISP).
- Decisões da sessão: brain na raiz (vault Obsidian); repo a ser tornado privado para versionar a documentação junto do código.
- Próximo: estudo minucioso do código (backend núcleo → schema/rotas → frontend) e construção das páginas de conhecimento + CLAUDE.md.

## [2026-06-30 13:30] INGEST | Estudo do código + 18 páginas de conhecimento

Estudo linha-por-linha do código do Maxxi v2 (backend lido de perto; frontend e rotas periféricas por 3 agentes paralelos). Source: `raw/sources/code/2026-06-30_estudo-codigo-maxxi.md`.

- Criado `CLAUDE.md` (guia operacional) na raiz.
- 18 páginas de brain criadas: overview do sistema + 12 componentes (motor-fluxo, ia-tool-calling, integracoes-sgp, canais-e-webhooks, supervisora-ia, fila-e-sla, realtime-sse, auth-e-seguranca, modelo-de-dados, frontend, design-system, api-backend) + runbook; domínio SGP; decisão de base; pessoa Christian; achados de código (bugs/segurança).
- `_index.md` e `_backlinks.json` reconstruídos. Página mais conectada: "Maxxi v2 / GoCHAT — Visão geral" (17 inbound).
- Descobertas notáveis: design system migrou para tema LIGHT (README desatualizado); credenciais de integração vivem no banco (sistema_kv), não em env; bug do Redis (`redis` vs `ioredis`); API keys expostas em `GET /sysconfig`; resíduos "CITmax" do sistema de inspiração.

## [2026-06-30 14:15] INGEST | Documentos do usuário sobre o motor de fluxo

Ingestão de 2 sources autorais do usuário sobre o coração do sistema: `motor-fluxo.md` (arquitetura + catálogo nó-a-nó) e `integrations.md` (referência completa do integrations.js). Salvos em `raw/sources/docs/`.

- Criada página `Catálogo de Nós` (referência nó-a-nó dos ~30 nós: portas, config, contexto) — centro da documentação do motor.
- `Motor de Fluxo` reescrita com profundidade do modelo de execução: estrutura JSON do fluxo, padrão "enviar e aguardar" (2 fases), tabela de interpolação, saída multicanal, limitações.
- `Integração SGP` enriquecida: helpers de transporte (sgpPost/PostJSON/Get), retornos por função, aliases para o motor, distinção listarPlanos (SGP) vs listar_planos_ativos (tabela local).
- Novos achados: porta do `abrir_chamado` inconsistente (nodeTypes `saida` vs motor `sucesso`/`erro`); divergência entre branches `main` e `dev` (comportamento sem-fluxo + break do loop agêntico).
- `_index` e `_backlinks` atualizados (19 páginas; "Maxxi overview" com 18 inbound).
