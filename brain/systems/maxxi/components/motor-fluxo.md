---
title: Motor de Fluxo
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[IA com Tool Calling]]", "[[Integração SGP]]", "[[Canais e Webhooks]]", "[[Frontend Maxxi]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["motorFluxo", "motor de fluxo", "fluxo", "chatbot engine", "nós"]
tags: [backend, fluxo, motor, chatbot]
---

# Motor de Fluxo

`apps/api/src/services/motorFluxo.js` (~1032 LOC) é o coração do produto: um **interpretador de grafo** que executa o fluxo de atendimento desenhado no [[Frontend Maxxi|editor visual]]. É invocado pelos [[Canais e Webhooks|webhooks]] sempre que chega mensagem de cliente em conversa com `status = 'ia'`.

## Como funciona

`processarConversa(conversa, mensagemCliente)`:
1. Busca o fluxo ativo (`fluxos.where({ativo:true}).first()`). Sem fluxo ou sem nós → cai em `processarIADireta` (IA com prompt `outros`).
2. `parseDados` extrai `nodes`/`edges` — suporta o formato atual (`dados.{nodes,edges}`) e o legado (`nos`/`conexoes`), normalizando `tipo` e `config`.
3. Recupera/cria o **estado da conversa** e roda um loop de **até 15 iterações por mensagem**. Cada nó (`processarNo`) retorna um de três resultados: `avancar(saida)` (segue a aresta da porta `saida`), `aguardar_input` (pausa e espera a próxima mensagem) ou `fim` (encerra o fluxo).
4. `encontrarProximo(noId, saida, edges)` resolve a aresta por `(from|source)` + `(port|sourceHandle)` → `(to|target)`.
5. Ao fim do loop, `enviarResposta` despacha cada resposta acumulada para o canal certo.

## Estado em memória (limitação central)

`estadosExecucao = Map<conversa_id, {noAtual, contexto:{cliente}, historico, aguardando}>` vive **em memória do processo**. Reinício do servidor → todo fluxo em andamento perde o ponto e recomeça. É a mesma limitação herdada do Atendechat. Combinado com o bug do [[Realtime SSE|Redis]], também não é compartilhado entre instâncias/processos.

## Catálogo de nós (~30, em 7 categorias)

- **Gatilhos:** `inicio`, `gatilho_keyword`.
- **Mensagens:** `enviar_texto`, `enviar_cta`, `enviar_imagem`, `enviar_audio`, `enviar_arquivo`, `enviar_localizacao`, `enviar_botoes`, `enviar_lista`, `solicitar_localizacao`.
- **Lógica:** `aguardar_resposta`, `condicao`, `condicao_multipla`, `definir_variavel`, `divisao_ab` (A/B por `Math.random`), `aguardar_tempo` (apenas loga e avança — não há scheduler real).
- **SGP/ERP:** `consultar_cliente` (com retry de CPF e ramo multi-contrato), `consultar_boleto` (único/múltiplos), `verificar_status`, `abrir_chamado`, `promessa_pagamento`, `listar_planos`, `consultar_historico`. Detalhe em [[Integração SGP]].
- **IA:** `ia_responde`, `ia_roteador`. Detalhe em [[IA com Tool Calling]].
- **Ações:** `transferir_agente` (checa horário), `chamada_http` (genérico), `nota_interna`, `enviar_email` (TODO), `nps_inline`, `encerrar`.
- **Stubs avançados:** `mudanca_endereco`, `mudar_plano`, `cadastrar_lead`, `cadastrar_condominio`, `registrar_ocorrencia_cond` (só mandam texto e seguem).

O catálogo visual (`apps/web/src/lib/nodeTypes.js`, ~32 tipos) deve espelhar este `switch`. Adicionar um nó = mexer nos dois lados + `PropsPanel.jsx`.

## Interpolação e contexto

`interpolar(texto, ctx)` resolve placeholders no texto dos nós: `{{cliente.x}}`, `{{boleto.x}}`, `{{chamado.x}}`, `{{promessa.x}}`, `{{planos.x}}` e `{{var}}`. O `contexto.cliente` é populado pelo nó `consultar_cliente` (nome, cpf, contrato, plano, status, cidade...) e fica disponível para a IA e para os demais nós.

## Envio de resposta (`enviarResposta`)

Persiste a mensagem (origem `ia`), faz `broadcast` SSE, e envia ao canal externo: **Telegram** (`telegram.js`, converte lista em botões/numerado pois Telegram não tem lista nativa) ou **Evolution/WhatsApp** (`integrations.js`). Bug conhecido: `enviar_lista` no Evolution perde os rótulos por mismatch snake_case/camelCase — ver [[Achados de código (2026-06-30)]].

## See Also

- [[IA com Tool Calling]] · [[Integração SGP]] · [[Canais e Webhooks]] · [[Frontend Maxxi]]
