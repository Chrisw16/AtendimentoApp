---
title: Abas de Atendimento
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Telas e Navegação]]", "[[Realtime SSE]]", "[[Supervisora IA]]", "[[Fila e SLA]]", "[[Motor de Fluxo]]", "[[Canais e Webhooks]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Abas de Atendimento", "Chat", "Histórico", "Satisfação", "aba Chat", "aba Histórico", "NPS"]
tags: [frontend, telas, atendimento, chat]
---

# Abas de Atendimento

Grupo "Atendimento" do menu: **Chat**, **Histórico** e **Satisfação**. São as telas que o agente humano usa no dia a dia. Visão geral e mapa de integração em [[Telas e Navegação]].

## Chat (`/chat`) — a mesa de trabalho

Tela principal do agente, onde acontece o atendimento ao vivo. Layout de 3 colunas: **ConversaList** (lista/busca/filtros) · **ConversaView** (mensagens + envio) · **ConversaInfo** (dados do contato/ações) + painel flutuante da [[Supervisora IA]].

- **Como funciona:** toda a lógica está em `hooks/useChat.js`, que carrega conversas/mensagens via `/api/chat` e abre um stream [[Realtime SSE|SSE]] (`/api/chat/sse`). Mensagens novas, mudanças de conversa, alertas de SLA e sugestões da Supervisora chegam em tempo real. O envio usa **optimistic update** (mostra na hora, confirma depois).
- **Ações:** assumir, devolver para IA, encerrar, transferir para outro agente, enviar mensagem/nota interna, reagir, respostas rápidas, e o **toggle global bot/humano** (`modo`, admin).
- **Integrações:** a urgência de cada conversa vem da [[Fila e SLA]] (badges crítico/atenção); transferir joga na fila e notifica outro [[Abas de Configuração|Agente]]; a resposta sai pelo canal de origem ([[Canais e Webhooks|Evolution/Telegram]]); conversas em modo IA são conduzidas pelo [[Motor de Fluxo]] e aparecem aqui em tempo real.

## Histórico (`/historico`) — consulta do passado

Lista navegável de conversas com filtros e um drawer com a **timeline de mensagens** de cada uma.

- **Como funciona:** usa o **mesmo endpoint** do Chat (`GET /api/chat/conversas`, `.../mensagens`) — é uma leitura filtrável (status: encerrada/ativa/ia/aguardando/todos; canal; busca por nome/telefone/protocolo). Read-only.
- **Integrações:** compartilha a espinha dorsal `conversas`/`mensagens` com o [[Abas de Atendimento|Chat]]; mostra o que a [[Supervisora IA]] gravou na conversa ao encerrar (sentimento/tópico/resumo, quando preenchidos).

## Satisfação (`/satisfacao`) — NPS

Pesquisa de satisfação: KPIs (nota média, NPS%, total, com comentário), distribuição de notas e avaliações recentes.

- **Como funciona:** lê `GET /api/satisfacao/resumo` e `/avaliacoes` sobre a tabela **`avaliacoes`** (escala **1–5**, promotor ≥4 / detrator ≤2).
- **Integração / divergência importante:** o nó `nps_inline` do [[Motor de Fluxo]] grava na tabela **`satisfacao`** (escala **0–10**), e o **Dashboard** calcula NPS sobre `satisfacao` também. Ou seja, **a aba Satisfação lê uma tabela diferente** da que o fluxo preenche — `avaliacoes` (1–5) vs `satisfacao` (0–10). As duas fontes/escalas de NPS coexistem e precisam ser reconciliadas (ver [[Modelo de Dados]] e [[Achados de código (2026-06-30)]]).

## See Also

- [[Telas e Navegação]] · [[Abas de Configuração]] · [[Abas de Operações e Infraestrutura]]
