---
title: Playbook Engine
type: component
created: 2026-08-22
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[IA com Tool Calling]]", "[[FASE 8 — Playbook Engine]]", "[[Knowledge Hub]]"]
aliases: ["Playbook Engine", "playbook", "procedimento oficial", "etapas", "aderência ao playbook"]
tags: [backend, ia, procedimento, qualidade]
---

# Playbook Engine

O procedimento oficial de **como se executa um atendimento**. `services/playbook.js` +
`playbookHelpers.js` (puro), tabelas `playbook*` (migration 019), tela
**Procedimentos**. História da entrega em [[FASE 8 — Playbook Engine]].

## A decisão que define o subsistema

**A etapa é provada pela TOOL que a evidencia, não pelo relato da IA.**

O jeito óbvio de rastrear seria pedir para a IA declarar o que fez. Não serve por dois
motivos: o modelo esquece de se auto-reportar e — pior — a **Quality AI não pode auditar
um procedimento acreditando no que o próprio modelo disse ter feito**. Seria a testemunha
depondo sobre si mesma.

Então cada etapa declara as `tools` que a evidenciam, e ela é dada por cumprida quando uma
delas roda de verdade dentro do motor. Etapas **conversacionais** ("entender a
necessidade", "tratar objeções") não têm tool que as prove — o playbook comercial é quase
todo assim — e usam a tool `concluir_etapa_playbook`. **Dois mecanismos porque são dois
tipos de etapa**, não por indecisão.

## Como chega na IA

O nó `ia_responde` tem `cfg.playbook` (ou herda do perfil de IA). O bloco entra no system
prompt **a cada turno**, com `[x]` nas etapas cumpridas e **"← VOCÊ ESTÁ AQUI"** na
próxima. Três decisões de redação que custaram para descobrir:

- injetar só na primeira passagem faz a IA **esquecer o roteiro no segundo turno** — que
  é exatamente quando ela improvisa;
- etapa cumprida **continua visível**: sumir com ela faz a IA repetir a pergunta que já fez;
- as **exceções (§61) vão junto**, senão o playbook vira checklist burro e a IA insiste em
  testar remotamente um cabo que o cliente já disse estar rompido.

O prompt também **proíbe recitar as etapas ao cliente** — o procedimento é interno.

## Obrigatoriedade

`obrigatoria` · `opcional` · `condicional`. **Opcional nunca vira a próxima etapa** (se
bloqueasse, não seria opcional) e **condicional não impede concluir** — exigi-la sempre
transformaria toda exceção em pendência eterna.

## Workflow (§64)

`rascunho → teste → publicado → arquivado`. Repare que o estado do meio é **teste**, e não
`revisão` como no [[Knowledge Hub]]: **procedimento se valida rodando, texto se valida
lendo**. Manter as duas máquinas de estado separadas é deliberado — unificá-las obrigaria
uma delas a mentir sobre o que aquele estado significa.

Publicar congela um **snapshot do playbook INTEIRO, com etapas**: guardar só o número da
versão faria a auditoria de um atendimento de três meses atrás ver o procedimento de hoje.
**Playbook sem etapas não publica**, e **editar publicado devolve 409**.

## Execução

Uma execução viva por `(conversa, playbook)` — o cliente que volta continua de onde parou.
**No sandbox não há execução** (registrar encheria de conversas fictícias o histórico que
a auditoria vai ler), mas a tool responde "simulado", senão a IA tentaria de novo e o
teste de fluxo deixaria de espelhar a produção.

Progresso em tempo real: `GET /api/playbooks/execucao/:conversaId` — é o que o
[[Cliente 360 e Copiloto|Copiloto]] desenha no chat.

## Os dois playbooks que existem

Semeados pela migration 022, **em rascunho**: `suporte_sem_conexao` (9 etapas) e
`comercial_venda_residencial` (11). São os nomeados pelo plano (§60 e §62) — estrutura
definida pelo documento, não fato sobre o provedor, e por isso podem ser semeados ao
contrário dos artigos de conhecimento.

## See Also

- [[FASE 8 — Playbook Engine]] · [[Motor de Fluxo]] · [[IA com Tool Calling]]
