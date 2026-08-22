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

> **Design v2.** A v1 propunha um `shared/nodeRegistry.js` com alias do Vite e
> mudança no Dockerfile. A revisão a demoliu, e com razão — o parágrafo abaixo
> explica por quê. O que ficou é bem menor e vale mais.

## O erro da v1: eu medi o arquivo morto

A v1 dizia *"9 de 32 tipos sem bloco no PropsPanel"* e prometia painel de graça
para eles. Estava medindo
`apps/web/src/components/fluxo/PropsPanel.jsx` — que **ninguém importa**. O painel
vivo é declarado dentro de [FluxoEditor.jsx:322](../../../apps/web/src/pages/FluxoEditor.jsx#L322).
Mesma história com `components/fluxo/FlowNode.jsx` (o vivo é `FluxoEditor.jsx:206`).

Medido contra o painel **vivo**: **2 de 32** sem bloco — `inicio` e
`consultar_historico`, e nenhum dos dois lê `cfg` nenhum. O ganho prometido pela
v1 era **zero**, e `consultar_cliente.pergunta` **já tem campo**
([FluxoEditor.jsx:372](../../../apps/web/src/pages/FluxoEditor.jsx#L372)).

Isso também derruba uma armadilha registrada no CLAUDE.md ("o cliente nunca é
perguntado pelo CPF") — ela descrevia o arquivo morto.

## E o `shared/` não funcionaria

Três caminhos de build, a v1 considerou um: o Dockerfile raiz usa
`WORKDIR /build/web`, então `path.resolve(__dirname,'../../shared')` cairia em
`/shared`; e o `docker-compose.yml` builda `web` e `api` com `context: ./apps/*`,
o que põe uma pasta na raiz **fora do contexto de build**. Seriam 3 Dockerfiles
e o compose, não "2 linhas".

**A alternativa custa zero:** `nodeTypes.js` é JS puro (sem JSX, sem React), então
o `apps/api` consegue importá-lo direto num **teste**. Verificado. Um teste de
contrato entre os catálogos mata a divergência **estruturalmente** sem shared
module, sem alias, sem tocar em build nenhum.

## O que a fase faz de verdade

### 1. Dois bugs ATIVOS no `ia_responde` (o de maior valor)

Os dois atingem o fluxo de referência `examples/fluxo-netgo-v2.json`, que é o que
roda em produção:

| | tela grava | motor lê | efeito |
|---|---|---|---|
| instrução extra | `cfg.prompt` | `cfg.instrucao ?? cfg.prompt` | o valor **antigo vence**: editar a instrução na tela **não tem efeito** e nada avisa |
| máx. turnos | `cfg.max_turns` (default **5**) | `cfg.max_turns \|\| cfg.max_turnos` (default **6**) | o valor **novo vence**: a tela mostra 5 num nó configurado para 25, e **encostar no campo** encurta a janela de cadastro de 25 para 5 turnos |

Os dois aliases do mesmo nó resolvem em **direções contrárias** — por isso não dá
para "só unificar": a precedência tem de ser decidida explicitamente. A tela passa
a gravar `instrucao`/`max_turnos` (os nomes do motor e do exemplo), o motor passa
a preferir esses, e os nomes antigos viram **fallback de leitura** para não quebrar
fluxo salvo.

### 2. NPS sem escala configurável

O motor lê `cfg.escala` ([motorFluxo.js:641](../../../apps/api/src/services/motorFluxo.js#L641))
e a tela só tem `pergunta`. Escala 1-5 é inconfigurável, e `satisfacao.escala`
grava 10 errado — a mesma classe de bug que a FASE 0 corrigiu no dashboard.

### 3. Tools: o checkbox mente

`IA_TOOLS_DEFAULT` da tela = tudo menos `precadastrar_cliente` (**inclui**
`listar_planos_ativos` e `listar_vencimentos`). O default do motor
([motorFluxo.js:759](../../../apps/api/src/services/motorFluxo.js#L759)) é uma
lista de 12 que **exclui as duas**. A tool aparece marcada na tela e está
desligada na execução.

### 4. Teste de contrato entre os três catálogos

`nodeTypes.js` (paleta) × `NOS` do `fluxoValidador.js` × `switch` do motor.
É o que o §19 pede ("portas derivam da mesma definição") sem inventar camada nova.

⚠️ **Cumprir esse critério literalmente quebra fluxo salvo:** o xyflow não
renderiza aresta cujo `sourceHandle` sumiu do nó, e há três tipos onde
`nodeTypes.js` diverge do motor (`enviar_email` diz `sucesso`, motor emite
`saida`). O teste **documenta** a divergência e falha quando ela cresce; renomear
porta exige mapa de migração, não alias — fica registrado, não feito aqui.

Correção de contexto: `transferir_agente.transferido` **deixou de ser porta morta
na FASE 1** (é por ela que a automação retoma). O comentário do validador está
desatualizado.

### 5. Tool Registry mínimo

`allowed_in_sandbox` vira propriedade da tool, no lugar do `Set` solto em
[iaTools.js:203](../../../apps/api/src/services/iaTools.js#L203).

**Não** entram `idempotency_strategy`, `requires_confirmation`, `allowed_roles`,
`allowed_teams`: não há retry no código para proteger e não há modelo de permissão
até a FASE 3. Campo declarado e não aplicado é exatamente a divergência que a fase
existe para matar.

### 6. `git rm` do código morto

Duas fontes de verdade a menos sem escrever uma linha.

## O que sai de escopo, e por quê

- **`shared/nodeRegistry.js`, alias, Dockerfile** — não funcionaria como escrito e
  o teste de contrato entrega o mesmo critério de graça.
- **`campos` como schema declarativo** — os blocos derivávéis são 19 one-liners; o
  renderizador genérico sairia maior que eles. Os 7 caros (listas que **geram
  portas**, `select` alimentado por fetch, matriz de checkbox) continuariam à mão.
- **`internal_only` para os 5 órfãos** — `mudanca_endereco`, `mudar_plano`,
  `cadastrar_lead`, `cadastrar_condominio`, `registrar_ocorrencia_cond` são um
  `case` só que empurra mensagem e avança. Resíduo do provedor de inspiração.
  Criar um conceito de visibilidade para eles é mais código que deletá-los.
- **Item 8 do plano ("nós reutilizam Tools")** — grande, e fica registrado porque a
  divergência é real e vale mais que o registry: o nó `listar_planos` chama o SGP
  e a tool `listar_planos_ativos` lê a tabela local `planos`. **Mesma pergunta,
  duas respostas** no mesmo atendimento.

## Achados de brinde da revisão (a confirmar)

- `iaTools.js:279` chama `reiniciarOnuAcs(input.serial)` mas o `input_schema` só
  declara `contrato` — a IA nunca manda `serial`, então a tool sempre chama com
  string vazia.
- `salvar_dado` está em `IA_TOOLS` mas **não tem `case`** em `executarTool`: é
  executada no motor, porque precisa mutar `ctx.estado.contexto`.
- `transferir_para_humano`/`encerrar_atendimento` não são tools, são control-flow
  (retornam sentinelas `__TRANSFERIR__:`).

## Critérios de aceite (§19) — resultado (2026-08-22)

- [x] **todo nó executável tem configuração visual ou é `internal_only`** — os 5
  órfãos do motor foram **deletados** (resíduo do provedor de inspiração, zero
  uso em seed/exemplos); os 2 tipos sem bloco no painel vivo não leem `cfg`.
- [x] **editor e motor usam os mesmos nomes** — `camposIaResponde` é a fonte
  única de `instrucao`/`max_turnos`; a tela grava os nomes do motor e lê os
  antigos como fallback. Escala do NPS ganhou campo. 5 testes novos.
- [x] **portas derivam da mesma definição** — paleta alinhada à verdade do motor
  (`solicitar_localizacao`, `abrir_chamado`, `transferir_agente`, `enviar_email`);
  `transferido` reconhecida como VIVA (retomada da FASE 1) no validador.
- [x] **validador e simulador não duplicam metadados** — o simulador espelha o
  motor no `consultar_cliente` (era o falso positivo da pauta); o **teste de
  contrato** (`tests/contrato-catalogos.test.js`) compara os 3 catálogos e falha
  quando divergem — o registry sem a camada.
- [x] **fluxos existentes não quebram** — nomes antigos são fallback de leitura;
  nenhuma porta usada por exemplo/produção foi renomeada (verificado por grep
  nos `examples/*.json`).

Extra: `allowed_in_sandbox`/`is_write` viraram metadado da tool (o `Set` solto
morreu) — e o motor passou a enviar à API **só** `name/description/input_schema`,
porque campo desconhecido na definição da tool derruba a chamada com 400. Bug de
brinde corrigido: `reiniciar_onu_acs` lia `input.serial`, que o schema nunca
declarou — reiniciava a ONU de serial `''` **sempre**; agora resolve o serial
pelo contrato via `diagnosticoOnu`.

Suíte: **199 puros + 48 integração**.

## Fica aberto (registrado, fora do escopo)

- `gatilho_keyword` inerte; `aguardar_resposta.timeout` (scheduler = FASE 4);
  campos inertes da tela (`rodape`, `alias`, `ia_menu_ativo`, `motivo`/`fila`).
- **nó `listar_planos` (SGP) vs tool `listar_planos_ativos` (tabela local)** —
  mesma pergunta, duas respostas no mesmo atendimento. É o item 8 do plano
  ("nós reutilizam Tools"), adiado com registro.
- `salvar_dado` executa no motor (precisa mutar `ctx.estado`), não no
  `executarTool`; `transferir_para_humano`/`encerrar_atendimento` são
  control-flow com sentinela, não tools — qualquer registry futuro precisa de
  um campo `kind`.
