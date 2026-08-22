---
title: FASE 9 — AI Runtime V1
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/components/motor-fluxo"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 8 — Playbook Engine]]", "[[FASE 7 — Knowledge Hub]]", "[[IA e Tool Calling]]"]
aliases: ["FASE 9", "AI Runtime", "handoff", "perfis de IA", "guardrails", "hierarquia de confiança", "LLM Gateway"]
tags: [work, task, fase-9, plano-evolucao, ia, seguranca]
---

# FASE 9 — AI Runtime V1

**Estado: implementada (2026-08-22).** Migration **020**. Suítes: **388 puros ·
190 de integração**.

## A regra do plano foi seguida à risca: evoluir, não reescrever

O laço agêntico do `motorFluxo` **não foi tocado na sua mecânica**. O que entrou
foi o que ele não tinha: hierarquia de confiança, lista do que não se inventa,
guardrails de campo, perfis, desfecho estruturado e handoff.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| profiles (§66) | `ia_perfis` + `cfg.perfil` no nó + aba **Perfis** em Prompts IA |
| Conversation Context (§69) | `iaRuntime.contextoEstruturado` — slots nomeados |
| Goal/Outcome (§70/§71) | `ia_execucoes` com `goal`, `desfecho` e `motivo` |
| hierarquia de fontes (§67) | `BLOCO_HIERARQUIA`, injetado em toda execução |
| anti-alucinação (§68) | `BLOCO_ANTI_ALUCINACAO` — lista **nominal** |
| guardrails ISP (§75) | `BLOCO_GUARDRAILS` |
| integração Knowledge/Playbook | já vinham das FASES 7 e 8; o perfil agora as amarra |
| motivos de transferência (§73) | enum + `normalizarMotivo` (texto livre → estruturado) |
| handoff estruturado (§74) | `montarHandoff` + cartão no painel do agente |
| LLM Gateway (§76) | `services/llmGateway.js` |

## Decisões que valem mais que o código

- **Motivo de transferência é ENUM, não texto.** A IA escreve "cliente
  nervoso", "cliente está bravo", "cliente furioso" — três strings, o mesmo
  fato. Sem `normalizarMotivo` o relatório da FASE 12 não soma nada. Há teste
  provando que as variações caem no mesmo valor.
- **"Estou irritado, quero falar com um atendente" é `customer_frustrated`, não
  `customer_requested_human`.** É uma escalada, não um pedido de rotina — e a
  prioridade na fila depende disso.
- **O motivo vira PRIORIDADE na fila da FASE 5.** Frustrado e caso sensível
  entram como 2, que o `calcularUrgencia` já lê como crítico. Sem isso, quem
  chega escalado espera atrás de quem quer 2ª via.
- **A lista do que não se inventa é NOMINAL.** "Não invente nada" é fácil de o
  modelo contornar; "não invente prazo, PIX, cobertura, sinal" não é.
- **Os guardrails de campo não são conformidade de papel.** Um cliente que olha
  para a ponta de uma fibra energizada perde visão — e quem mandou olhar foi o
  atendimento. O bloco diz explicitamente que **nem o cliente pedindo** libera.
- **Os três blocos entram em TODA execução**, não por configuração de nó: são
  regra da casa, e um nó esquecido não pode virar orientação perigosa. Vão
  **por último** no system prompt, que é a posição de maior aderência.
- **§71: estourar turnos não é "resolvido", é desistência.** O desfecho é
  gravado com essa distinção; um relatório que conta max_turnos como sucesso
  mente sobre a operação.
- **A config do NÓ vence a do perfil** — o nó é mais específico, e quem o
  configurou estava olhando para aquele ramo.
- **Perfil inativo não orienta nada** e perfil inexistente **não derruba o
  turno** (loga e segue com a config do nó).
- **O handoff NÃO carrega CPF nem telefone.** A FASE 6 tirou PII do payload do
  agente; duplicá-la aqui abriria a porta dos fundos que aquela fase fechou.
- **`embed` NÃO existe no LLM Gateway.** O §76 lista quatro métodos, mas a
  Anthropic não oferece embeddings e a FASE 7 decidiu busca full-text. Método
  que ninguém implementa e ninguém chama é pior que ausência: parece capacidade
  e não é.
- **`registrarExecucao` nunca lança e não roda em sandbox** — telemetria que
  derruba atendimento é pior que telemetria ausente, e "Testar fluxo" encheria
  o relatório de atendimentos que nunca existiram.

## Tetos assumidos

- **O Gateway ainda não é o único caminho.** `llmGateway.js` existe e normaliza
  erro, mas `motorFluxo` e `supervisoraIA` seguem chamando `getAnthropicClient`
  direto — migrar o laço agêntico é reescrita, e a regra da fase é o contrário.
  A próxima chamada nova nasce no gateway.
- **Multi-intenção (§72) não foi implementada** — o plano pede "preparar o
  runtime", e a estrutura de contexto já tem os slots; reconhecer duas intenções
  simultâneas conflita com o Flow Engine hoje.
- **Tool policies por perfil são só a lista de tools.** Risco e confirmação por
  tool continuam como na FASE 2 (`is_write`, `allowed_in_sandbox`).
- **Identificação progressiva (§35, herdada da FASE 6)** segue aberta.
- **`goal`/`success`/`fail` são texto**, não expressão avaliável: quem julga é
  a IA, o sistema só registra.

## Arquivos

Novos: `migrations/versions/020_ia_runtime.js`, `services/iaRuntime.js`
(+`.test.js`), `services/llmGateway.js`, `routes/iaRuntime.js`,
`tests/integracao/fase9-ia-runtime.test.js`.

Tocados: `services/motorFluxo.js` (perfil, blocos, desfecho, handoff),
`services/fluxoHelpers.js` (`montarSystemPrompt` ganhou `runtime`), `server.js`,
`seed.js` (2 perfis), `apps/web` (PromptsIA ganhou aba Perfis, FluxoEditor
ganhou seletor de perfil, ConversaInfo mostra o handoff).

## Sonda de deploy desta fase

`GET /api/ia/motivos` — **404 = antigo, 401 = FASE 9 no ar**. Sonde 6+ vezes.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 8 — Playbook Engine]] · [[IA e Tool Calling]]
