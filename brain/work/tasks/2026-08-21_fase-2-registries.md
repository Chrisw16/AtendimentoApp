---
title: FASE 2 — Registry Foundation (Node Registry + Tool Registry)
type: task
created: 2026-08-21
last_updated: 2026-08-21
status: draft
priority: p1
knowledge_refs: ["systems/maxxi/components/motor-fluxo", "systems/maxxi/components/ia-tool-calling"]
related: ["[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[Motor de Fluxo]]"]
tags: [work, task, fase-2, plano-evolucao, registry]
---

# FASE 2 — Registry Foundation

Referência: [Plano Mestre PARTE V (§15–19), PARTE VI (§20–24) e FASE 2](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md).
Objetivo declarado: *"eliminar divergência estrutural"*.

**Status: rascunho** — a ser revisado por agentes antes de virar código.

## Medição da divergência real (não a suposta)

Contado no código, não estimado:

| Fato | Número |
|---|---|
| tipos na paleta (`NODE_TYPES`) | 32 |
| `case` no `processarNo` do motor | 37 |
| tipos que o motor executa e **não estão na paleta** | **5** |
| tipos na paleta que o motor **ignora** | **0** |
| tipos na paleta **sem bloco no PropsPanel** | **9 de 32** |

Os 5 órfãos do motor: `cadastrar_lead`, `cadastrar_condominio`, `mudar_plano`,
`mudanca_endereco`, `registrar_ocorrencia_cond`.

Os 9 inconfiguráveis: `inicio`, `condicao_multipla`, `solicitar_localizacao`,
`consultar_cliente`, `consultar_boleto`, `verificar_status`,
`promessa_pagamento`, `listar_planos`, `consultar_historico`.

> Isto corrige a leitura antiga do CLAUDE.md ("~32 tipos visuais devem espelhar o
> switch"): a paleta **não** tem nó morto. O buraco é o inverso — nó que executa
> sem existir na tela — e, principalmente, **nó na tela sem como configurar**.
> `consultar_cliente` é o caso vivo: o motor lê `cfg.pergunta`, não há campo na
> tela, então **o cliente nunca é perguntado pelo CPF**.

## Decisões de desenho

### Uma definição, dois consumidores — e o problema de empacotamento

`apps/web` e `apps/api` são pacotes npm separados e o **Dockerfile builda o
frontend num estágio que só copia `apps/web/`**. Um import cruzado quebraria o
build de produção em silêncio (funciona em dev, falha no deploy).

Solução: `shared/nodeRegistry.js` na raiz + alias do Vite resolvido por
`path.resolve(__dirname, '../../shared')` (bate em dev **e** no estágio Docker,
desde que o `COPY shared` exista nos dois estágios). Uma linha de config, duas
linhas de Dockerfile — e nenhum monorepo tooling novo.

### O registry adiciona `campos`, não substitui `NODE_TYPES`

`NODE_TYPES` já carrega `label/group/color/portas/descricao` e é o que a paleta
usa. O que falta é o **schema de configuração** (`campos`), que hoje só existe
implícito no `PropsPanel` (à mão) e no motor (`cfg.x`).

Então o registry é `NODE_TYPES` **mudado de lugar e acrescido de `campos`** — não
uma segunda estrutura ao lado. Estrutura nova ao lado de estrutura velha é
exatamente a divergência que a fase existe para matar.

### PropsPanel derivado, com escape hatch

O painel passa a renderizar `campos` genericamente (texto, textarea, número,
select, lista). Os blocos à mão que hoje existem para casos ricos
(`ia_responde`, `enviar_botoes`) continuam podendo sobrescrever — derivar 100%
custaria mais do que ganha e não é o que os critérios pedem.

**Ganho imediato e mensurável:** os 9 tipos sem bloco ganham painel de graça, e
`consultar_cliente.pergunta` passa a ser configurável pela tela.

### `internal_only`

Os 5 órfãos do motor entram no registry marcados `internal_only: true` — não
aparecem na paleta, mas passam a existir na definição única, que é o que o
critério §19 pede ("todo nó executável possui configuração visual **ou** é
explicitamente `internal_only`").

### Tool Registry — metadados que a IA já usa, mais risco

`iaTools.js` já tem `name/description/input_schema/executor`. Falta
`risk_level`, `is_write`, `allowed_in_sandbox` e `idempotency_strategy`.

O gate de sandbox **já existe** dentro do `executarTool` (FASE anterior) mas é
uma lista à mão. Vira propriedade da tool. Escopo desta fase: os metadados +
mover o gate para eles. `requires_confirmation` / `allowed_roles` /
`allowed_teams` dependem de permissões, que são **FASE 3** — entram como campo
declarado e ainda não aplicado, para não inventar um modelo de permissão antes
da fase que o define.

## Critérios de aceite (§19)

- [ ] todo nó executável tem configuração visual ou é `internal_only`
- [ ] editor e motor usam os mesmos nomes de configuração
- [ ] portas válidas derivam da mesma definição
- [ ] validador e simulador não duplicam mais metadados de nó
- [ ] fluxos existentes não quebram (aliases legados de `fluxoHelpers.js` preservados)

## Riscos conhecidos

- **`fluxoHelpers.js` é rede de segurança viva.** Ele normaliza nomes que o
  PropsPanel gravou errado (`botao`/`secao`/`instrucao`/`tipo`). Unificar os
  nomes NÃO pode apagar esses aliases: há fluxo salvo em produção com os nomes
  antigos.
- **`motorLoop.js`/`motorSimulador.js` já divergem desde a FASE 1.** Derivar o
  simulador do registry sem antes reconciliar o laço só move a divergência.
