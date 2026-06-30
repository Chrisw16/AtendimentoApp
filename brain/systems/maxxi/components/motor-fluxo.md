---
title: Motor de Fluxo
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Catálogo de Nós]]", "[[IA com Tool Calling]]", "[[Integração SGP]]", "[[Canais e Webhooks]]", "[[Frontend Maxxi]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_motor-fluxo-catalogo", "2026-06-30_estudo-codigo-maxxi"]
aliases: ["motorFluxo", "motor de fluxo", "fluxo", "chatbot engine", "execução de fluxo"]
tags: [backend, fluxo, motor, chatbot]
---

# Motor de Fluxo

`apps/api/src/services/motorFluxo.js` (~1032 LOC) é o coração do produto: um **interpretador de grafo** que executa o fluxo (chatbot) desenhado no [[Frontend Maxxi|editor visual]]. O editor salva o fluxo como JSON na coluna `fluxos.dados`; o motor lê o fluxo ativo e executa nó a nó. É invocado pelos [[Canais e Webhooks|webhooks]] sempre que chega mensagem de cliente em conversa com `status = 'ia'`. A referência nó-a-nó está em [[Catálogo de Nós]].

## Estrutura de dados de um fluxo

`parseDados(fluxo)` normaliza o JSON em `{nodes, edges}`:
- **node:** `{ id, tipo, config, x, y }`. `tipo` define o comportamento; `config` (cfg) são os campos editáveis por tipo. Aceita variações (`n.type`, `n.data.tipo`/`n.data.config`).
- **edge:** liga a **porta de saída** de um nó ao próximo. Dois formatos aceitos: editor `{from, to, port}` e legado `{source, target, sourceHandle}` — `encontrarProximo` normaliza ambos (porta exata → porta `saida` → primeira aresta do nó).

## Modelo de execução (máquina de estados por conversa)

`processarConversa(conversa, mensagem)`:
1. Carrega o fluxo ativo (`fluxos.where({ativo:true})`). Sem fluxo/sem nós → cai em `processarIADireta` (IA com prompt `outros` + histórico — a rede de segurança).
2. Recupera/cria o estado da conversa; sem `noAtual`, começa pelo nó `inicio`/`gatilho_keyword`.
3. **Loop de até 15 iterações** (trava anti-loop-infinito) executando `processarNo(no, ctx)`. Cada nó retorna um de três resultados:

| Resultado | Helper | O motor faz |
|---|---|---|
| `avancar(porta)` | — | acha o próximo nó pela porta e continua o loop; sem aresta → fim |
| `aguardar()` | `aguardar_input` | **salva o estado e para** — espera a próxima mensagem do cliente |
| `fim()` | — | limpa o estado e encerra |

4. Ao final, despacha as `ctx.respostas` acumuladas (`enviarResposta`).

## Estado em memória (limitação central)

`estadosExecucao = Map<conversa_id, {noAtual, contexto:{cliente}, historico, aguardando}>` vive **em memória do processo** — reinício perde o ponto de cada conversa. Combinado com o bug do [[Realtime SSE|Redis]], reforça que o Maxxi hoje assume **um processo por instância**. Persistir o estado (banco/Redis por `conversa_id`) é a melhoria nº 1 ao endurecer o sistema.

## Padrão "enviar e aguardar" (interatividade em 2 fases)

Nós que pedem algo ao cliente (botões, lista, `aguardar_resposta`, `nps_inline`, `solicitar_localizacao`, `consultar_cliente`) usam **a mesma função em duas passagens**, decididas por `ctx.estado.aguardando === no.id`: na 1ª, perguntam e marcam `aguardando = no.id`; quando o cliente responde, o mesmo nó é reexecutado, agora processando a resposta e avançando. É o mecanismo central da conversação.

## Contexto e interpolação

O `contexto` da conversa acumula dados ao longo do fluxo. Textos dos nós aceitam placeholders resolvidos por `interpolar`:

| Placeholder | Origem |
|---|---|
| `{{cliente.nome}}`, `{{cliente.contrato}}`… | `contexto.cliente` (preenchido por `consultar_cliente`) |
| `{{boleto.valor}}`, `{{boleto.pix}}` | `contexto.boleto` |
| `{{chamado.protocolo}}` | `contexto.chamado` |
| `{{promessa.data}}`, `{{promessa.dias}}` | `contexto.promessa` |
| `{{planos.lista}}` | `contexto.planos` |
| `{{var}}` | `contexto[var]` ou campo da conversa |

`getCtxVal(ctx, 'cliente.status')` lê valores aninhados (usado em condições e nós SGP).

## Saída multicanal

As respostas são **agnósticas de canal** (`{tipo, texto, botoes, url…}`) e traduzidas só na borda (`enviarResposta`): **Telegram** (texto, botões inline, imagem; lista vira botões ≤8 ou texto numerado) e **WhatsApp/Evolution** (texto, CTA, botões, lista, imagem, áudio, arquivo). Toda resposta é persistida em `mensagens` e transmitida via [[Realtime SSE|SSE]] ao painel.

## Limitações e melhorias conhecidas

Persistir o estado de execução; `aguardar_tempo` é simulado (avança na hora — falta scheduler/job); `enviar_email` só loga; ACS é stub. Padronizar o formato de aresta. Nota: a branch `dev` alterou o comportamento "sem fluxo" e o break do loop agêntico — revalidar ao alinhar branches. Bugs em [[Achados de código (2026-06-30)]].

## See Also

- [[Catálogo de Nós]] · [[IA com Tool Calling]] · [[Integração SGP]] · [[Canais e Webhooks]]
