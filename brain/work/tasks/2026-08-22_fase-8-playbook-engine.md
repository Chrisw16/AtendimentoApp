---
title: FASE 8 — Playbook Engine
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/components/motor-fluxo"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 7 — Knowledge Hub]]", "[[Motor de Fluxo]]", "[[IA e Tool Calling]]"]
aliases: ["FASE 8", "Playbook", "procedimento oficial", "playbook engine", "etapas", "aderência"]
tags: [work, task, fase-8, plano-evolucao, playbook, ia]
---

# FASE 8 — Playbook Engine

**Estado: implementada (2026-08-22).** Migration **019**. Suítes: **362 puros ·
176 de integração**.

## A decisão central: a etapa é provada pela TOOL, não pelo relato da IA

O jeito óbvio de rastrear um procedimento é pedir para a IA declarar o que fez.
Não funciona por dois motivos: o modelo esquece de se auto-reportar, e — pior —
**a Quality AI (FASE 11) não pode auditar um procedimento acreditando no que o
próprio modelo disse ter feito**. Seria a testemunha depondo sobre si mesma.

Então cada etapa declara as `tools` que a **evidenciam**, e a etapa é dada por
cumprida quando uma delas roda de verdade, dentro do motor. Isso não depende do
modelo colaborar e deixa um rastro conferível.

Sobram as etapas conversacionais ("entender a necessidade", "tratar objeções"),
que não têm tool que as prove — o playbook comercial é quase todo assim. Para
elas existe a tool `concluir_etapa_playbook`. **Dois mecanismos porque são dois
tipos de etapa**, não por indecisão.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| schema de Playbook | migration 019 (4 tabelas) |
| etapas, condições, obrigatório/opcional/condicional | `playbook_etapas` |
| Tools associadas | `playbook_etapas.tools` — e é o mecanismo de rastreio |
| versionamento e publicação | `playbook_versoes` com snapshot INTEIRO |
| Playbook Comercial inicial (§62) | seed, 11 etapas, em rascunho |
| Playbook de Suporte "Sem conexão" (§60) | seed, 9 etapas, em rascunho |
| subplaybooks (§63) | coluna `subplaybook_id` (estrutura pronta, sem UI) |

E a ligação que faz tudo isso valer: **o nó `ia_responde` ganhou `cfg.playbook`**,
que injeta o roteiro no system prompt **a cada turno**, com as etapas já
cumpridas marcadas.

## Regras não-óbvias que ficam

- **O workflow é `rascunho → teste → publicado → arquivado`** — diferente do
  Knowledge (`revisão` no lugar de `teste`). Não é descuido: **procedimento se
  valida rodando, texto se valida lendo**. Duas máquinas de estado separadas,
  cada uma honesta sobre o que seu estado do meio significa.
- **O snapshot da versão é o playbook INTEIRO, com etapas.** Guardar só o
  número faria a auditoria de um atendimento de três meses atrás ver o
  procedimento de hoje.
- **Playbook sem etapas não publica** — 409 explícito.
- **Editar publicado é recusado**: mova para "teste" antes. Reescrever por baixo
  de execuções em andamento é o que o §64 impede.
- **O prompt é reinjetado TODO TURNO.** Injetar só na primeira passagem faz a IA
  esquecer o roteiro no segundo turno — que é exatamente quando ela improvisa.
- **Etapa cumprida continua VISÍVEL no prompt, marcada com `[x]`.** Removê-la
  faz a IA repetir a pergunta que já fez.
- **A próxima etapa é apontada com "← VOCÊ ESTÁ AQUI".** Lista sem foco vira
  "faça tudo de novo".
- **As exceções (§61) entram no prompt.** Sem elas o playbook vira checklist
  burro e a IA insiste em testar remotamente um cabo que o cliente já disse
  estar rompido.
- **O prompt proíbe a IA de recitar as etapas ao cliente** — o procedimento é
  interno; cliente não quer ouvir "estou na etapa 4 de 9".
- **`opcional` nunca vira a próxima etapa** (se bloqueasse, não seria opcional)
  e **`condicional` não impede concluir** — exigi-la sempre transformaria toda
  exceção em pendência eterna.
- **Uma execução viva por (conversa, playbook)**: o cliente que volta continua
  de onde parou.
- **No sandbox NÃO cria execução**, mas a tool de etapa responde "simulado":
  registrar encheria de conversas fictícias o histórico que a auditoria vai
  ler, e não responder faria a IA tentar de novo, quebrando a fidelidade do
  teste de fluxo.
- **`concluir_etapa_playbook` some da lista de tools quando não há playbook.**
  Tool inútil na lista é ruído que compete com a tool certa.

## Tetos assumidos

- **Sem aderência/score.** `pendentesObrigatorias` existe, mas nota de qualidade
  é FASE 11 — de propósito, para não inventar métrica antes de quem a consome.
- **Subplaybooks (§63) têm coluna, não têm UI nem execução aninhada.**
- **Gatilhos por intenção (§59) são armazenados e não roteiam nada**: escolher
  playbook por intenção é AI Runtime (FASE 9). Hoje quem escolhe é o nó do fluxo.
- **Sem painel de progresso no chat.** `GET /playbooks/execucao/:conversaId` já
  devolve etapas, foco e pendências — é o Copiloto (FASE 10) que vai desenhar.
- **A etapa `condicional` não é avaliada pelo sistema**: a condição é texto para
  a IA julgar, não expressão executável.

## Arquivos

Novos: `migrations/versions/019_playbooks.js`, `services/playbookHelpers.js`
(+`.test.js`), `services/playbook.js`, `routes/playbooks.js`,
`tests/integracao/fase8-playbooks.test.js`,
`apps/web/src/pages/Playbooks.jsx` (+`.module.css`).

Tocados: `services/motorFluxo.js` (injeção + rastreio por tool),
`services/fluxoHelpers.js` (`montarSystemPrompt` ganhou `playbook`),
`services/iaTools.js` (tool `concluir_etapa_playbook`), `server.js`, `seed.js`,
`apps/web` (App, Sidebar, api, nodeTypes, FluxoEditor).

## Sonda de deploy desta fase

`GET /api/playbooks` — **404 = antigo, 401 = FASE 8 no ar**. Sonde 6+ vezes.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 7 — Knowledge Hub]] · [[Motor de Fluxo]]
