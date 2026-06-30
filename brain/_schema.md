# Brain Schema — Maxxi v2

Last updated: 2026-06-30

Brain do produto **Maxxi v2 / GoCHAT** — sistema de atendimento omnichannel com IA para provedores de internet (ISP). Código vive no mesmo repositório (`apps/api`, `apps/web`).

## Directories

| Path | Type | Description |
|------|------|-------------|
| `systems/maxxi/` | system | O produto inteiro: overview, componentes, runbooks, diagramas |
| `systems/maxxi/components/` | component | Um arquivo por subsistema (motorFluxo, integrations, iaTools, supervisoraIA, sseManager, filaService, auth, data-model, frontend, design-system...) |
| `systems/maxxi/runbooks/` | runbook | Procedimentos operacionais (subir local, deploy Coolify, migrations, seed) |
| `systems/maxxi/diagrams/` | diagram | Diagramas Excalidraw (arquitetura, fluxo de mensagem, modelo de dados) |
| `concepts/` | concept | Conceitos transversais (motor de fluxo, IA tool-calling, SSE realtime, fila/SLA...) |
| `domains/` | domain | Conhecimento de domínio ISP (SGP, RADIUS, planos, precadastro, NPS...) |
| `strategy/decisions/` | decision | ADRs e decisões estratégicas (adoção do Maxxi, multi-tenancy por instância...) |
| `work/tasks/`, `work/bugs/` | task/bug | Dimensão de trabalho (hardening de segurança, validação, endpoints stub...) |

## Frontmatter Fields in Use

`title`, `type`, `created`, `last_updated`, `status`, `related`, `sources`, `aliases`, `tags`. Páginas de decisão acrescentam `decision_date`, `stakeholders`, `impact`.

## Naming Conventions

- Componentes: nome em kebab-case do arquivo/serviço (`motor-fluxo.md`, `ia-tools.md`).
- Decisões: `YYYY-MM-DD_slug.md`.
- Sources de código: `raw/sources/code/YYYY-MM-DD_{escopo}.md`.

## Convenção de estudo de código

Cada lote de estudo do código vira uma source imutável em `raw/sources/code/` e alimenta as páginas de `systems/maxxi/components/`. As páginas descrevem o que o componente É e por que existe (memória institucional), não como usar (isso fica no CLAUDE.md).
