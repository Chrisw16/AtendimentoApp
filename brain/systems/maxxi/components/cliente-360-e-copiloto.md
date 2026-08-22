---
title: Cliente 360 e Copiloto
type: component
created: 2026-08-22
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Integração SGP]]", "[[Auth e Segurança]]", "[[Playbook Engine]]", "[[FASE 6 — Cliente 360]]", "[[FASE 10 — Copiloto V1]]"]
aliases: ["Cliente 360", "Copiloto", "painel do assinante", "Context Cards", "sugestão de resposta", "handoff"]
tags: [backend, frontend, ia, atendimento]
---

# Cliente 360 e Copiloto

A lateral da tela de atendimento: quem é o cliente, o que já foi feito e o que fazer
agora. Dois subsistemas que dividem a mesma tela e o mesmo insumo —
`services/cliente360.js` (FASE 6) e `services/copiloto.js` (FASE 10).

## Cliente 360 — a ficha

Compõe identidade, contratos, financeiro, diagnóstico, histórico de relacionamento e
**Context Cards**. Regras que valem mais que o código:

- **Zero integração própria.** A regra do plano — *"não criar integrações paralelas
  quando a operação já puder ser executada por Tool"* — foi seguida literalmente: leitura
  por `integrations.js` e toda AÇÃO por `executarTool`, com `actorType: human`. Tool nova
  nasce disponível para a IA e para o agente ao mesmo tempo.
- **PII é mascarada NO SERVIDOR** (`mascarar.js`). Esconder no CSS deixa o CPF inteiro
  chegar ao navegador, ao DevTools e a qualquer print. Só quem tem
  `ver_dados_completos` recebe o dado inteiro — e essa capacidade é **negada por omissão**.
- **O painel nunca derruba o atendimento**: cada bloco é isolado, falha vira `null` + um
  aviso **visível**. Sem o aviso, o agente lê "sem débito" quando a verdade é "não sei".
- **Cartão sem ação sugerida é ruído** — e ruído empurra para baixo o cartão que
  importava. Risco de churn exige **combinação** de sinais; `suspenso` **não** é "sem
  contrato ativo" (é cliente com contrato bloqueado, não candidato a novo).
- **Diagnóstico é opt-in** (`?diagnostico=1`): são 2 chamadas ao SGP e o painel precisa
  abrir rápido.

⚠️ **A identificação precisa estar na LINHA da conversa** (`conversas.cpf` /
`contrato_id`), não só no blob de `flow_executions`. O `consultar_cliente`
gravava apenas no estado do fluxo — que é **apagado** quando a conversa vai para
um humano sem a porta `transferido` ligada. Em produção isso significava: a IA
identifica o assinante, a conversa entra na fila, e o painel abre **sem
contrato** enquanto a 2ª via responde *"CPF/CNPJ inválido"* — o painel falhando
exatamente no momento para o qual foi feito. Corrigido em 2026-08-22; as colunas
existiam desde a migration 001 e nunca eram escritas.

⚠️ **IDOR fechado na revisão**: `POST /acao` repassava o corpo inteiro para
`executarTool`, que prefere `input.contrato` ao contexto — dava para puxar o boleto de
**outro assinante** pela conversa deste. Hoje cada ação declara uma allowlist de campos e
o contrato é validado contra `contratosPermitidos(conversa)`.

## Copiloto — a próxima ação

O que separa um copiloto de um botão que chama o LLM é decidir se a hora é de
**responder**, **consultar** ou **avançar o procedimento** — e não escrever parágrafo
quando ainda faltam dados objetivos.

Essa decisão (`decidirProximaAcao`) é **determinística e não passa pelo modelo**: é lida a
cada conversa aberta, precisa ser instantânea, barata e igual toda vez. O modelo só entra
quando o atendente pede um **texto**.

A ordem das checagens é a urgência operacional, e cada uma existe por um erro real:

1. cliente não identificado → **consultar** (responder é chute);
2. manutenção ativa na região → a resposta muda por completo, e abrir chamado individual
   é trabalho jogado fora;
3. caso técnico sem diagnóstico → verificar conexão antes de opinar;
4. procedimento com etapa pendente → o playbook já disse o que fazer;
5. só então responder.

Outras regras: **o copiloto ajuda, a Quality AI audita** — nada sai para o cliente sem uma
pessoa clicar; a **execução de tool reusa a rota do Cliente 360** (allowlist, permissão e
auditoria já moram lá, e um segundo caminho ficaria sem alguma delas); o **resumo vivo é
montado de fatos**, não gerado — quem assume a conversa quer dados, e prosa gerada varia a
cada leitura.

**Métrica que importa:** `aproveitamento = (enviada + editada) / gerada`. Sugestão
**ignorada** é o sinal de que ela não serve. Sem sugestão nenhuma o valor é **`null`, não
zero** — zero diria "não serve", `null` diz "ninguém usou ainda".

## Handoff (FASE 9)

Quando a IA transfere, o agente recebe um pacote de seis linhas: quem é o cliente, o que
ele queria, **o que a IA já consultou** (para não repetir), onde parou o procedimento e o
motivo estruturado. **Sem CPF e sem telefone** — duplicar PII aqui abriria a porta dos
fundos que a FASE 6 fechou.

## See Also

- [[FASE 6 — Cliente 360]] · [[FASE 10 — Copiloto V1]] · [[Auth e Segurança]] · [[Playbook Engine]]
