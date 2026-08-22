---
title: Knowledge Hub
type: component
created: 2026-08-22
last_updated: 2026-08-22
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[IA com Tool Calling]]", "[[Playbook Engine]]", "[[FASE 7 — Knowledge Hub]]", "[[Modelo de Dados]]"]
aliases: ["Knowledge Hub", "base de conhecimento", "knowledge", "RAG", "busca de conhecimento", "lacunas", "knowledge gaps"]
tags: [backend, ia, conhecimento, busca]
---

# Knowledge Hub

A base de conhecimento que a IA consulta antes de responder o que **não é dado do
cliente** — procedimento, prazo, política, argumentação. `services/knowledge.js` +
`knowledgeHelpers.js` (puro), tabelas `knowledge_*` (migration 018), tela
**Conhecimento**. História e decisões da entrega em [[FASE 7 — Knowledge Hub]].

## Como a IA usa

A tool **`buscar_conhecimento`** está no `TOOLS_PADRAO`: a IA chama, recebe título +
trecho dos artigos publicados e responde a partir dali. Quando não acha nada, a resposta
da tool **instrui a IA a dizer que vai confirmar** — o "não achei" é a peça que impede a
IA de inventar procedimento, que é o pior defeito possível num atendimento.

Todo uso registra **qual artigo e qual versão** sustentaram a resposta (`knowledge_uso`);
toda pergunta sem resposta vira **lacuna** com contador (`knowledge_gaps`).

## A busca — e por que não é embedding

O plano pedia pgvector. A inspeção derrubou: a extensão **não existe** neste Postgres
(instalar = trocar a imagem do banco de produção), a Anthropic **não oferece embeddings**
e `openai_api_key` era uma chave de config que **nenhuma linha do código lia**. Entrou
full-text nativo em português. A porta segue aberta: a recuperação inteira mora em
`knowledge.buscar()`, e o ranqueamento vira híbrido ali dentro sem nenhum chamador mudar.

Três armadilhas de busca em português, todas descobertas com conteúdo real:

1. **Acento.** O dicionário não remove: `conexão`→`conexã` vs `conexao`→`conexa`. Metade
   dos clientes digita sem acento.
2. **Hífen.** `Wi-Fi` vira `wi-f`/`wi`/`fi`; `wifi` vira `wif`. E "wifi" é *a* palavra do
   suporte de ISP.
3. **O E entre os termos.** `websearch_to_tsquery` faz **E**, e a IA passa a fala do
   cliente inteira: *"o cliente disse que achou caro"* vira `client & diss & car`, e
   "disse" — que não está em artigo nenhum — derrubava a busca com o artigo certo ali.

As duas primeiras morrem na função **IMMUTABLE `knowledge_norm()`**, usada pelo índice
**e** pela consulta (simetria por construção). A terceira virou **duas passadas**: E
primeiro, OU sobre os mesmos radicais só quando o E volta vazio — precisão quando dá,
recall quando precisa, e a segunda consulta nunca roda à toa.

## Workflow editorial (§52)

`rascunho → revisão → publicado → arquivado`. **Só `publicado` chega na IA.** Rascunho não
vai direto ao ar, e **editar artigo publicado devolve 409**: mova para revisão antes —
é o que impede sobrescrever conhecimento oficial em silêncio. Publicar congela
`knowledge_versoes`, então a auditoria consegue dizer qual texto estava no ar.

**Revisão vencida marca, não remove.** Sumir automaticamente deixaria a IA sem resposta
por causa de uma data que alguém esqueceu de atualizar.

## Conteúdo

**55 artigos e 15 categorias** carregados pela migration 024 — conteúdo **do operador**,
não do repositório. Essa distinção é o motivo de a 022 semear filas e playbooks mas
**nenhum artigo**: conhecimento escrito por quem faz o código viraria "política da casa"
que ninguém redigiu, e um agente citaria como se fosse.

**11 desses itens são esqueletos** ("preencher com as regras oficiais": fidelidade,
cancelamento, instalação, visita técnica, manuais de equipamento) e nascem em
**rascunho**, com aviso no topo. Publicar um faria a IA responder ao cliente com
*"Existe fidelidade? Qual o período?"*. Há teste garantindo que a busca **nunca** devolve
um esqueleto.

## Onde mexer

| Quero… | Vá em |
|---|---|
| escrever/editar artigo | tela **Conhecimento** → Artigos |
| criar categoria | tela **Conhecimento** → Categorias |
| ver o que a base não respondeu | tela **Conhecimento** → Lacunas |
| mudar o ranqueamento | `services/knowledge.js` → `buscar()` |
| mudar o workflow | `services/knowledgeHelpers.js` → `podeTransicionar` |

## See Also

- [[FASE 7 — Knowledge Hub]] · [[IA com Tool Calling]] · [[Playbook Engine]]
