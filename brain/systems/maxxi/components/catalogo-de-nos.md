---
title: Catálogo de Nós
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Motor de Fluxo]]", "[[IA com Tool Calling]]", "[[Integração SGP]]", "[[Frontend Maxxi]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["2026-06-30_motor-fluxo-catalogo", "2026-06-30_estudo-codigo-maxxi"]
aliases: ["nós", "catálogo de nós", "node catalog", "tipos de nó", "etapas do fluxo", "nodeTypes"]
tags: [backend, fluxo, nós, referencia, chatbot]
---

# Catálogo de Nós

Referência nó-a-nó do [[Motor de Fluxo]]. Cada nó é uma **etapa do fluxo de atendimento** (um "quadradinho" no editor). São ~30 tipos em 7 grupos. Para cada nó: o que faz, **portas** de saída (de onde saem as conexões), campos de **`config`** (editáveis no painel de propriedades) e o que lê/grava no **contexto** da conversa. O catálogo visual vive em `apps/web/src/lib/nodeTypes.js`; o comportamento, no `switch` de `processarNo` (`motorFluxo.js`). Os dois lados devem permanecer espelhados — ao adicionar/alterar um nó, mexer em ambos + `PropsPanel.jsx`.

## Gatilho 🟢

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `inicio` | Ponto de entrada (1 por fluxo, `unico:true`). **Reseta o contexto** (`cliente:{}`). | `saida` | — |
| `gatilho_keyword` | Dispara quando o cliente digita uma palavra específica. | `saida` | `palavra` |

## Mensagens 🔵

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `enviar_texto` | Texto com interpolação. | `saida` | `texto` |
| `enviar_cta` | Texto + botão que abre URL. | `saida` | `corpo`, `label`, `url` |
| `enviar_imagem` | Imagem com legenda. | `saida` | `url`, `legenda` |
| `enviar_audio` | Áudio. | `saida` | `url` |
| `enviar_arquivo` | Documento. | `saida` | `url`, `filename` |
| `enviar_localizacao` | Ponto no mapa. | `saida` | `nome`, `address`, `lat`, `lng` |
| `enviar_botoes` | Botões de resposta rápida. **Portas dinâmicas** (1 por botão). | dinâmico (id do botão) | `corpo`, `botoes[]`, `ia_menu_ativo` |
| `enviar_lista` | Lista de opções. **Portas dinâmicas** (1 por item). | dinâmico (id do item) | `corpo`, `label_botao`, `titulo_secao`, `itens[]` |
| `solicitar_localizacao` | Pede o GPS e salva em variável. | `localizacao_recebida` · `sem_localizacao` · `erro` | `mensagem`, `variavel` |

Botões e lista usam o [[Motor de Fluxo|padrão "enviar e aguardar"]]: na resposta, casam o texto digitado (ou o número, no caso da lista) com o botão/item e avançam pela **porta correspondente ao `id`**. `itens` é normalizado caso venha como string JSON. No WhatsApp, `enviar_lista` perde os rótulos por um bug de nomenclatura (ver [[Achados de código (2026-06-30)]]).

## Lógica 🟡

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `aguardar_resposta` | Aguarda a próxima msg e salva em variável. | `saida` | `mensagem`, `variavel` (default `resposta`) |
| `condicao` | Bifurca por uma condição sobre uma variável. | `sim` · `nao` | `variavel`, `operador`, `valor` |
| `condicao_multipla` | Cascata de condições; a primeira que casar vence. | dinâmico (`ramo.porta`) + `default` | `ramos[]` `{variavel, operador, valor, porta}` |
| `definir_variavel` | Define/atualiza variável (com interpolação). | `saida` | `variavel`, `valor` |
| `divisao_ab` | Split por percentual (teste A/B, via `Math.random`). | `a` · `b` | `pct_a` (default 50) |
| `aguardar_tempo` | Pausa por N segundos. ⚠️ **Hoje avança na hora** (simulado — não há scheduler). | `saida` | `segundos` (default 60) |

Operadores de `condicao` (`avaliarCondicao`): `==` `!=` `>` `<` `contem` `nao_contem` `vazio` `nao_vazio` (aliases pt: `igual`, `diferente`, `maior`, `menor`).

## SGP / ERP 🟣

Os nós que consultam o ERP. Implementação e retornos em [[Integração SGP]].

| Nó | O que faz | Portas | Endpoint SGP |
|---|---|---|---|
| `consultar_cliente` | Identifica por CPF; popula `contexto.cliente` (com retry de CPF). | `encontrado` · `multiplos_contratos` · `max_tentativas` | `consultacliente/` |
| `consultar_boleto` | 2ª via de boleto(s); popula `contexto.boleto`. | `encontrado` · `nao_encontrado` | `fatura2via/` |
| `verificar_status` | Bifurca pelo status do contrato. **Não chama API** — lê `contexto.cliente.status`. | `ativo`·`inativo`·`cancelado`·`suspenso`·`inviabilidade`·`novo`·`reduzido` | — |
| `abrir_chamado` | Abre ocorrência técnica; popula `contexto.chamado`. | `sucesso` · `erro` | `chamado/` |
| `promessa_pagamento` | Libera acesso por promessa; popula `contexto.promessa`. | `sucesso` · `adimplente` · `erro` | `liberacaopromessa/` |
| `listar_planos` | Planos da cidade → `contexto.planos.lista`. | `saida` | `planos/` |
| `consultar_historico` | Histórico de chamados → `contexto.historico.resumo`. | `saida` | `ocorrencia/list/` |

> Inconsistência conhecida: `nodeTypes.js` declara porta `saida` para `abrir_chamado`, mas o motor avança por `sucesso`/`erro`. Ver [[Achados de código (2026-06-30)]].

## IA 🩷

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `ia_responde` | Agente autônomo Claude que conversa e executa tools até resolver/transferir. | `resolvido` · `transferir` · `max_turnos` | `contexto` (slug do prompt), `prompt` (instrução extra), `max_turns` (def 6), `tools_ativas[]` |
| `ia_roteador` | Classificador de intenção: a IA escolhe a rota. | dinâmico (1 por rota) + `nao_entendeu` + `encerrar` | `mensagem`, `rotas[]` `{id, label, descricao}` |

Mecânica completa (loop agêntico de 5 rounds, sentinelas `__TRANSFERIR__`/`__ENCERRAR__`, histórico por nó, default de tools = todas menos `precadastrar_cliente`) em [[IA com Tool Calling]].

## Ações 🟠

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `transferir_agente` | Manda para a fila humana; checa **horário de atendimento** (`sistema_kv.horario`). | `transferido` · `fora_horario` · `sem_agente` | `msg_fora` |
| `chamada_http` | Requisição HTTP a API externa; salva resposta em variável. | `sucesso` · `erro` | `url`, `method`, `body`, `variavel` |
| `nota_interna` | Grava nota interna na conversa (não vai ao cliente). | `saida` | `nota` |
| `enviar_email` | ⚠️ **Não implementado** (só loga). | `sucesso` | `para` |
| `nps_inline` | Pergunta nota 1–10 e grava em `satisfacao`. | `promotor` (≥9) · `neutro` (≥7) · `detrator` | `pergunta` |

## Fim 🔴

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `encerrar` | Despede-se, encerra a conversa (`conversaRepo.encerrar`) e limpa o estado. | — | `mensagem` |

## Stubs avançados

`mudanca_endereco`, `mudar_plano`, `cadastrar_lead`, `cadastrar_condominio`, `registrar_ocorrencia_cond` — herdados do sistema de inspiração; hoje só enviam uma mensagem e avançam por `saida`.

## Portas dinâmicas

`enviar_botoes`, `enviar_lista`, `condicao_multipla` e `ia_roteador` geram **uma porta por opção** em runtime. O editor (React Flow) precisa **re-medir os handles** quando as portas mudam (`useUpdateNodeInternals`), senão o arraste de conexão quebra na v12 do `@xyflow/react` — armadilha já vivida no projeto.

## See Also

- [[Motor de Fluxo]] · [[IA com Tool Calling]] · [[Integração SGP]]
