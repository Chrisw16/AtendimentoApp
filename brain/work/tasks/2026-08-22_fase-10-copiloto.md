---
title: FASE 10 — Copiloto V1
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 9 — AI Runtime V1]]", "[[FASE 8 — Playbook Engine]]", "[[FASE 6 — Cliente 360]]"]
aliases: ["FASE 10", "Copiloto", "sugestão de resposta", "próxima ação", "resumo vivo"]
tags: [work, task, fase-10, plano-evolucao, ia, atendimento]
---

# FASE 10 — Copiloto V1

**Estado: implementada (2026-08-22).** Migration **021** (uma tabela, e de
métrica). Suítes: **407 puros · 201 de integração**.

## O que separa um copiloto de um botão que chama o LLM

O §79 é a fase inteira: o copiloto tem de decidir se a hora é de **responder**,
de **consultar** ou de **avançar o procedimento** — e **não gerar texto quando
ainda faltam dados objetivos**. Um copiloto que sempre escreve um parágrafo
bonito é um gerador de texto; um que sabe dizer *"identifique o cliente antes,
responder sobre a conta dele agora seria chute"* é um copiloto.

Essa decisão é **determinística e não passa pelo modelo**
(`decidirProximaAcao`): é lida a cada conversa aberta, precisa ser instantânea,
barata e igual toda vez. O modelo só entra quando o atendente pede um TEXTO.

A ordem das checagens é a ordem da urgência operacional, e cada uma existe por
um erro de atendimento real:

1. cliente não identificado → **consultar** (responder é chute);
2. manutenção ativa na região → a resposta muda por completo, e abrir chamado
   individual é trabalho jogado fora;
3. caso técnico sem diagnóstico → verificar conexão antes de opinar;
4. procedimento com etapa pendente → o playbook já disse o que fazer;
5. só então: responder.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| sugestão de resposta (§78) | `copiloto.sugerir` via **llmGateway** |
| Inserir / Editar / Enviar | componente `Copiloto.jsx`, acima do campo de mensagem |
| próxima ação (§79) | `decidirProximaAcao`, puro e testado |
| execução de Tool (§80) | botões que chamam **a rota do Cliente 360** |
| Playbook visível (§81) | `<details>` com ✓/○ e a etapa em foco |
| resumo vivo (§82) | `montarResumo` — de FATOS, sem chamar modelo |
| suporte e comercial (§83/§84) | `detectarSinais` — objeção, sinal de compra, recorrência, falha física |
| handoff (§85) | o resumo é o mesmo insumo que a FASE 9 já entrega na transferência |
| feedback (§86) | 👍/👎 + motivo |
| eventos de uso (§87) | `copiloto_eventos` + `aproveitamento` |

## Regras não-óbvias que ficam

- **O copiloto ajuda, a Quality AI audita** (§77). Nada aqui julga o atendente,
  e **nada sai para o cliente sem uma pessoa clicar**.
- **A execução de tool NÃO ganhou rota nova.** Reusa
  `POST /api/cliente360/:id/acao`, que já tem allowlist de campos, permissão e
  auditoria. Um segundo caminho para o mesmo poder acabaria sem alguma das três.
- **O painel não chama o modelo.** Gastar uma chamada de IA para dizer
  "identifique o cliente primeiro" seria caro, lento e não determinístico.
- **O resumo vivo é montado de fatos**, não gerado. Quem assume uma conversa
  quer os dados, não prosa — e prosa gerada varia a cada leitura.
- **Os sinais vêm da ÚLTIMA fala do cliente**, não da conversa inteira: a
  objeção de preço de três mensagens atrás já foi tratada.
- **Proximidade, não adjacência, nos padrões de texto.** Ninguém escreve "cabo
  rompido" — escreve "o cabo tá rompido". A primeira versão exigia as palavras
  coladas e deixava passar o relato mais comum de todos.
- **`aproveitamento` = (enviada + editada) / gerada.** Sugestão **ignorada** é o
  sinal de que ela não serve; sem essa taxa, o copiloto nunca é avaliado.
- **Sem sugestão gerada, o aproveitamento é `null`, não zero** — zero diria "não
  serve", `null` diz "ninguém usou ainda".
- **Só a sugestão EDITADA guarda o texto.** É ela que ensina o que o copiloto
  errou; as outras seriam ruído com PII do cliente.
- **Falha do modelo devolve 503 com texto explicativo**, não erro genérico: o
  atendente precisa saber que pode seguir digitando, e não que o chat quebrou.
- **A chamada nasceu no `llmGateway`** — era a promessa da FASE 9, que deixou o
  gateway sem migrar o laço agêntico e disse "a próxima chamada nova nasce
  nele". Esta é ela.

## Tetos assumidos

- **Sem streaming**: a sugestão aparece pronta.
- **Sem "resumo vivo" atualizado sozinho**: ele é recalculado quando o painel é
  lido (30 s de cache), não empurrado por SSE.
- **A sugestão não é persistida** — só o que o atendente fez com ela. Sugestão
  vive segundos e carrega o que o cliente contou.
- **§80 lista "consultar cobertura"**, que ainda não é tool do catálogo.
- **Sem detecção de upsell por dado** (só por texto): cruzar plano atual com
  planos elegíveis é trabalho para o Cliente 360 comercial.

## Arquivos

Novos: `migrations/versions/021_copiloto.js`, `services/copilotoHelpers.js`
(+`.test.js`), `services/copiloto.js`, `routes/copiloto.js`,
`tests/integracao/fase10-copiloto.test.js`,
`apps/web/src/components/chat/Copiloto.jsx` (+`.module.css`).

Tocados: `server.js`, `apps/web` (ConversaView passou a aceitar texto injetado
no campo, `lib/api.js`).

## Sonda de deploy desta fase

`GET /api/copiloto/metricas` — **404 = antigo, 401 = FASE 10 no ar**.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 9 — AI Runtime V1]] · [[FASE 6 — Cliente 360]]
