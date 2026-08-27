---
title: Remoção dos módulos de ERP + Clientes como histórico
type: task
created: 2026-08-26
last_updated: 2026-08-26
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/modelo-de-dados", "systems/maxxi/telas/operacoes"]
related: ["[[Abas de Operações]]", "[[Modelo de Dados]]", "[[API Backend Maxxi]]", "[[Telas e Navegação]]", "[[Cliente 360 e Copiloto]]", "[[Integração SGP]]", "[[FASE 12 — Conversation Events + Analytics]]"]
aliases: ["Remoção do ERP", "Ocorrências removidas", "Ordens de Serviço removidas", "Monitor de Rede removido", "clientes_contato", "Clientes histórico de contato", "migration 027", "migration 028"]
tags: [work, task, remocao, erp, clientes, migration-027, migration-028]
---

# Remoção dos módulos de ERP + Clientes como histórico

**Entregue em 2026-08-26.** Migrations **027** e **028**. Suítes: **494 puros ·
276 de integração**, todos verdes. Branch `feat/remover-erp-clientes-historico`.

O produto deixou de fingir ser um ERP.

## A decisão da tarefa: o ERP desta operação é o SGP

**Ocorrências** e **Ordens de Serviço** eram um ERP em miniatura mantido ao lado
do SGP. O mesmo chamado passava a existir em duas bases e **nada as
conciliava** — e conciliação não é detalhe de implementação aqui: o técnico
fecha a OS **no SGP**, porque é lá que está o contrato, o estoque e a cobrança.
No dia em que as duas discordassem — e discordariam — ninguém saberia qual está
certa. Duas verdades para o mesmo fato é o defeito, não o trabalho dobrado.

A IA já operava no lugar certo o tempo todo: `criar_chamado` abre chamado em
`/api/ura/chamado/` e `historico_ocorrencias` lê de `ocorrencia/list/`. As
tabelas locais nunca foram consultadas por elas.

O **Monitor de Rede** tinha o mesmo problema com um agravante: era um NMS que
ninguém alimentava. `equipamentos_rede` nascia **em tempo de execução** pelo
`POST /api/monitor/ping` (`createTableIfNotExists`, DDL fora de migration — o
**último do código**) e `alertas_rede` nunca era escrita, então a seção de
alertas ficava eternamente vazia. Era, ainda, uma fonte de status **distinta**
da manutenção do [[Integração SGP|SGP]] que a IA consulta em `status_rede`.

E **Clientes** era a terceira cara do mesmo erro: um proxy de busca no SGP, do
lado de fora de qualquer conversa. Consultar o ERP por CPF arbitrário é o que o
[[Cliente 360 e Copiloto|Cliente 360]] faz **dentro** de uma conversa, com
`contratosPermitidos` limitando o contrato ao do assinante daquele atendimento.
Um segundo caminho até o SGP sem essa allowlist é exatamente a "integração
paralela" que a FASE 6 proibiu.

## O que virou fato

| Item | Onde |
|---|---|
| DROP de `ocorrencias`, `ordens_servico`, `equipamentos_rede`, `alertas_rede` | migration **027** |
| View **`clientes_contato`** (nenhuma tabela nova) | migration **028** |
| `/api/ocorrencias` e `/api/ordens` deixaram de existir | `routes/{ocorrencias,ordens}.js` deletados, `server.js` |
| `GET /api/monitor/status` e `POST /api/monitor/ping` removidos | `routes/monitor.js` (o arquivo **fica**) |
| `/api/clientes` reescrita: lista + linha do tempo do contato | `routes/clientes.js` |
| Lógica não-SQL da busca, pura e testada | `services/clientesHelpers.js` (+`.test.js`) |
| Telas `Ocorrencias`, `OrdensServico`, `MonitorRede` (+CSS) removidas | `apps/web/src/pages/` |
| Tela **Clientes** reescrita como histórico de contato | `apps/web/src/pages/Clientes.jsx` |
| Grupo "Infraestrutura" some; **Saúde do Sistema** sobe para "Configuração" | `components/layout/Sidebar.jsx` |
| Provas contra Postgres real | `tests/integracao/fase14-clientes-contato.test.js` |

### A view, e por que não é tabela

`clientes_contato` agrupa `conversas` por **`COALESCE(telefone, id::text)`** e
devolve, por contato: telefone, nome, CPF, contrato, e-mail, cidade, último
canal, id da última conversa, último protocolo, contagem de conversas, primeiro
e último contato, e se há atendimento em aberto.

Os fatos já moram em `conversas` desde a migration 001, e `cpf`/`contrato_id`
passaram a ser **escritos** na FASE 6 (nó `consultar_cliente` do motor). Uma
tabela `clientes` seria uma **segunda verdade para o mesmo fato**: exigiria
backfill, exigiria um segundo escritor sincronizado com o motor, **nasceria
vazia** para todo o histórico anterior, e no dia em que dessincronizasse a tela
mentiria. É o mesmo argumento com que a [[FASE 12 — Conversation Events +
Analytics|FASE 12]] recusou um event store. **O que faltava era leitura.**

Duas coisas que não são detalhe:

- ⚠️ **`COALESCE(telefone, id::text)`.** Com `GROUP BY telefone` puro, toda
  conversa de widget (telefone `NULL`) cai no mesmo grupo e vira **um cliente
  só**, juntando gente que nunca se falou. É a armadilha nomeada na FASE 6 e
  repetida na window de recontato da `conversa_fatos` (025) — agora em
  `GROUP BY`.
- **`(array_agg(x ORDER BY criado_em DESC) FILTER (WHERE x IS NOT NULL))[1]`** é
  "o último valor que conhecemos". É isso que faz o telefone que volta meses
  depois já aparecer com o CPF que a IA identificou lá atrás: o vínculo não é
  copiado para lugar nenhum, é uma agregação.

### O selo "identificado" não é o nome

`estaIdentificado` é `cpf || contrato_id`, nunca `nome`. O cliente diz o nome
dele no primeiro "oi", e isso não identifica ninguém. Confundir os dois faria a
tela prometer uma ficha do assinante que não existe — a mesma classe de mentira
que o painel do Financeiro cometeu em 2026-08-22 ao dizer "16 títulos" e
"nenhum boleto" na mesma altura da tela.

### O identificador exposto é o uuid, não o telefone

`GET /api/clientes/:conversaId` recebe o **uuid de uma conversa** e resolve o
grupo **no servidor**. A chave de agrupamento (o telefone) nunca entra pela URL:
aceitá-la como parâmetro deixaria qualquer agente listar o histórico de um
número arbitrário digitando-o. Pela mesma razão a `chave` não sai no payload —
devolvê-la entregaria, na chave da lista, o mesmo dado que o `mascararTelefone`
acabou de esconder uma coluna ao lado.

## O que divergiu do que se esperava

- **`ordens_servico` e `ocorrencias` não tinham FK de entrada.** As FKs que
  existiam eram de **saída** (`agente_id → agentes`, `conversa_id → conversas`),
  então a ordem do drop foi indiferente e nem `agentes` nem `conversas` foram
  tocadas. A remoção que parecia arriscada era, no schema, folha de árvore.
- **`notas` quase saiu junto** — nasceu na 001 ao lado de `ocorrencias` e era
  citada pela rota `POST /ocorrencias/:id/notas`. Mas `notas` é a tabela das
  **notas internas da conversa**, usada por `routes/chat.js`; e a tal rota de
  ocorrências **sempre falhou**, porque inseria `conversa_id: null` numa coluna
  `notNullable`. Ficou.
- **`zonas_cobertura`/`consultas_cobertura` também nascem na 002** e ficaram:
  Cobertura continua no produto.
- **O `POST /monitor/ping` tinha que sair junto com a tabela, não depois.**
  Enquanto ele existisse, a 027 dropava `equipamentos_rede` e o primeiro POST a
  **ressuscitaria vazia** — DDL em runtime derrota migration por construção.
- **A lista antiga de Clientes nunca agrupou nada.** Sem `q`, a rota caía num
  `groupBy(['id', ...])` que — por incluir o `id` — deixava cinco conversas do
  mesmo cliente virarem cinco "clientes". O teste de integração trava isso
  agora: cinco conversas do mesmo telefone = **uma** linha com contagem 5.
- **`clientesApi.create`/`update`/`buscar` apontavam para rotas que nunca
  existiram.** Saíram do `lib/api.js` sem nada quebrar — não havia chamador.
- **Um achado fora de escopo entrou junto:** `valorParaGravar` passou a dar
  `trim()` em credencial secreta. Credencial colada da documentação vem com
  espaço/quebra de linha grudado, o header sai literal e o provedor devolve
  `401 "API key is invalid"` — que lê como **chave errada**, não como chave
  suja, e manda o operador caçar no lugar errado. Só nas secretas: `prompt_ia` e
  `saudacao` são texto do operador, e o espaço ali pode ser dele.

## Tetos assumidos

- ⚠️ **A view agrega `conversas` INTEIRA a cada request.** Com o volume atual
  (~zero em produção) é de graça. Vira `MATERIALIZED VIEW` com refresh no
  encerramento da conversa, ou tabela real com escritor próprio, quando
  `conversas` passar da casa das centenas de milhares. Está marcado com
  `ponytail:` na migration.
- ⚠️ **`conversas.cpf` só é escrito pelo nó `consultar_cliente` do motor.** Um
  fluxo que colete CPF por `salvar_dado` guarda no blob do estado e **não**
  persiste o vínculo — o contato aparece como "não identificado" mesmo tendo
  dito o CPF. Quem montar fluxo de coleta precisa passar pelo
  `consultar_cliente`, ou o vínculo se perde quando a conversa encerra.
- ⚠️ **As linhas do histórico na tela são estáticas.** Nem `/chat` nem
  `/historico` aceitam deep-link por id de conversa hoje, então clicar numa
  conversa antiga não leva a lugar nenhum. É uma linha de rota nas duas telas —
  não foi feita aqui para não misturar as mudanças.
- ⚠️ **Contatos NÃO são mesclados por CPF entre telefones diferentes.** A chave
  é o telefone. O mesmo assinante falando do celular e do fixo aparece como
  **dois contatos**, os dois identificados com o mesmo CPF. Mesclar por CPF
  exigiria decidir o que fazer com quem tem CPF `NULL` (a maioria) e com o
  telefone que trocou de dono — nenhuma das duas tem resposta óbvia, e a
  errada funde gente que não é a mesma pessoa.
- ⚠️ **O `down()` da 027 recria ESTRUTURA, não dados.** O drop é irreversível
  quanto ao conteúdo. O `down` existe para que um rollback de código para uma
  versão que ainda tenha as rotas não encontre `42P01` a cada request — é cópia
  fiel das 001/002, porque schema divergente num rollback é pior que rollback
  nenhum. Por isso o `up()` **conta as linhas antes** e loga o número: se havia
  dado, ele fica no log do deploy em vez de sumir sem registro.
- **Nada foi migrado para o SGP.** Se houver ocorrência/OS local com conteúdo em
  produção, ela morre com a tabela. A contagem no log é o único registro.

## Arquivos

Novos: `migrations/versions/027_remover_modulos_erp.js`,
`migrations/versions/028_clientes_contato.js`,
`services/clientesHelpers.js` (+`.test.js`),
`tests/integracao/fase14-clientes-contato.test.js`.

Removidos: `routes/ocorrencias.js`, `routes/ordens.js`,
`apps/web/src/pages/{Ocorrencias,OrdensServico,MonitorRede}.jsx` (+`.module.css`).

Tocados: `routes/clientes.js` (reescrita), `routes/monitor.js` (só `/erros` e
`/saude` ficam), `server.js`, `services/kvSeguro.js`,
`apps/web/src/{App.jsx,lib/api.js,components/layout/Sidebar.jsx,pages/Clientes.jsx}`.

## Sonda de deploy

`GET /api/ocorrencias` — **401 = código antigo (a rota ainda existe e pede
token), 404 = esta mudança no ar.** É o inverso da sonda de fase habitual, e
funciona pelo mesmo motivo. Vale a regra de sempre: sonde **6 vezes** e só
aceite se as 6 concordarem — durante o rollout há duas versões atendendo atrás
do balanceador.

## See Also

- [[Abas de Operações]] · [[Modelo de Dados]] · [[API Backend Maxxi]] · [[Cliente 360 e Copiloto]]
