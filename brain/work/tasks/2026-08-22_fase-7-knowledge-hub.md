---
title: FASE 7 — Knowledge Hub
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/ia-tool-calling"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 6 — Cliente 360]]", "[[IA e Tool Calling]]"]
aliases: ["FASE 7", "Knowledge Hub", "base de conhecimento", "RAG", "pgvector", "knowledge gaps", "busca full-text"]
tags: [work, task, fase-7, plano-evolucao, conhecimento, busca]
---

# FASE 7 — Knowledge Hub

**Estado: implementada (2026-08-22).** Migration **018**. Suítes: **338 puros ·
158 de integração**.

## O desvio: pgvector saiu, full-text nativo entrou

O plano pedia "PostgreSQL + pgvector" (§54) — **com uma licença explícita**:
*"salvo melhor justificativa técnica após inspeção"*. A inspeção derrubou:

1. **A extensão não existe** neste Postgres (`pg_available_extensions` não
   lista `vector`). Instalar significa **trocar a imagem do Postgres de
   produção** — mudança de infra num banco que já atende, impossível de
   verificar daqui;
2. **Não há de onde tirar embedding.** A Anthropic não oferece embeddings, e
   `openai_api_key` é uma chave de configuração que **nenhuma linha do código
   lê** — seria uma integração nova inteira, com custo por chamada e latência
   no caminho da resposta ao cliente;
3. **O corpus não pede.** A base de um provedor tem dezenas a poucas centenas
   de artigos.

O que entrou: `to_tsvector('portuguese')` + `websearch_to_tsquery` + `pg_trgm`,
tudo nativo, sem dependência, sem chave e sem custo por consulta.

**A porta continua aberta e barata:** a recuperação inteira mora em
`knowledge.buscar()`. Havendo pgvector e uma fonte de embeddings, acrescenta-se
a coluna e o ranqueamento vira híbrido ali dentro — nem a tool da IA nem a tela
mudam.

## Os dois assassinos silenciosos da busca em português

Ambos descobertos escrevendo os testes, e ambos esvaziariam a base aos olhos de
quem pergunta:

- **Acento.** O dicionário português não o remove: `conexão` vira `conexã` e
  `conexao` vira `conexa` — nunca casam. Metade dos clientes digita sem acento.
- **Hífen.** `Wi-Fi` vira os lexemas `wi-f`/`wi`/`fi`; `wifi` vira `wif`. E
  "wifi" é *a* palavra mais comum do suporte de um provedor.

A solução dos dois é a função `knowledge_norm()`, criada pela migration como
**IMMUTABLE** (coluna gerada só aceita função imutável, e `unaccent` não é):
ela remove acento e **indexa as duas formas** do texto com hífen. A mesma
função normaliza a consulta — a simetria entre índice e query passou a ser por
construção, não por disciplina.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| schema, categorias, artigos, documentos, metadados | migration 018 (6 tabelas) |
| workflow | `knowledgeHelpers.podeTransicionar` — máquina de estados pura |
| versionamento | `knowledge_versoes` + congelamento ao publicar |
| embeddings / pgvector | **substituído** por FTS nativo (ver acima) |
| RAG | `buscar()` + tool `buscar_conhecimento` |
| rastreamento de fonte | `knowledge_uso` grava artigo **e versão** |
| feedback | `knowledge_feedback` (útil/incorreto/desatualizado) |
| Knowledge Gaps | `knowledge_gaps` com contador por assunto |

## Regras não-óbvias que ficam

- **A normalização de texto NÃO está em JS.** Ficou no Postgres porque precisa
  ser idêntica à do índice e porque o stemmer dele acerta o que uma versão em
  JS erraria: "troco" e "trocar" viram o mesmo radical. Uma primeira versão em
  JS foi escrita e **descartada** por isso.
- **A chave da lacuna usa o MESMO pipeline da busca.** É o que faz "Como troco
  a senha do WiFi?", "trocar senha wifi" e "WIFI SENHA TROCAR" virarem **uma**
  linha com contador 3 — sem isso o painel de lacunas *recorrentes* nunca
  mostraria nada recorrente.
- **`websearch_to_tsquery`, nunca `to_tsquery`.** O cliente escreve `???`,
  aspas soltas e `-`; `to_tsquery` lança erro de sintaxe e derrubaria a
  resposta. Há teste com quatro entradas que quebrariam a versão ingênua.
- **A coluna `busca` é GERADA**, não mantida por trigger: artigo editado nunca
  fica com índice velho, e não há gatilho para esquecer de disparar.
- **Só `publicado` chega na IA** (§52), e **rascunho não vai direto ao ar** —
  é a revisão que o workflow existe para impor.
- **Editar artigo publicado é recusado com 409.** Mover para "revisão" primeiro
  é o que impede sobrescrever conhecimento oficial em silêncio (§53). Sair de
  publicado sobe a versão.
- **`status` fica fora da allowlist do PUT**: publicar é transição de workflow,
  não campo de formulário.
- **Revisão vencida NÃO tira o artigo do ar** — marca. Sumir automaticamente
  deixaria a IA sem resposta por causa de uma data que alguém esqueceu.
- **Lacuna resolvida que reaparece é REABERTA**: sinal de que o artigo escrito
  não respondeu de verdade.
- **No sandbox a tool LÊ mas não ESCREVE.** Uma rodada de "Testar fluxo" não
  pode inflar o contador de lacunas nem sujar o rastreamento de uso.
- **O "não achei" é uma resposta útil**: é o texto que instrui a IA a dizer que
  vai confirmar em vez de inventar procedimento — o pior defeito possível num
  atendimento.
- **Cuidado ao comentar SQL cru:** o knex conta `?` como placeholder **dentro
  de comentário**. Um `"? IS NULL"` num comentário custou um "Expected 7
  bindings, saw 8".

## Tetos assumidos

- **Sem busca semântica de verdade.** Sinônimo sem raiz comum ("lerdo" vs
  "lento") não casa. É o preço de não ter embeddings — e o motivo de a porta
  ter ficado aberta em `buscar()`.
- **Sem importação de documento** (PDF/DOCX): o tipo `documento` existe no
  schema, mas o conteúdo entra colado à mão.
- **Sem geração de rascunho a partir de atendimentos** (§56, parte final): a
  lacuna é registrada e priorizada, o texto ainda é humano.
- **Feedback é coletado e exibido, mas não ranqueia.** Um artigo marcado
  "incorreto" 10 vezes continua aparecendo igual na busca.
- **Sem editor rico**: `textarea` de texto puro.

## Arquivos

Novos: `migrations/versions/018_knowledge_hub.js`,
`services/knowledgeHelpers.js` (+`.test.js`), `services/knowledge.js`,
`routes/knowledge.js`, `tests/integracao/fase7-knowledge.test.js`,
`apps/web/src/pages/Knowledge.jsx` (+`.module.css`).

Tocados: `services/iaTools.js` (tool `buscar_conhecimento`),
`services/fluxoHelpers.js` (entra no `TOOLS_PADRAO`), `server.js`, `seed.js`
(só categorias — conteúdo não se semeia), `apps/web` (App, Sidebar, api,
nodeTypes).

## Sonda de deploy desta fase

`GET /api/knowledge/categorias` — **404 = antigo, 401 = FASE 7 no ar**. Sonde
6+ vezes e exija unanimidade.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[FASE 6 — Cliente 360]] · [[IA e Tool Calling]]
