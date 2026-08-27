---
title: Redesenho do módulo Chat — a tela onde a atendente passa o dia
type: task
created: 2026-08-27
last_updated: 2026-08-27
status: in-progress
priority: p1
knowledge_refs: ["systems/maxxi/telas/chat", "systems/maxxi/components/fila-e-sla", "systems/maxxi/components/cliente-360-e-copiloto"]
related: ["[[Fila e SLA]]", "[[Cliente 360 e Copiloto]]", "[[FASE 5 — Equipes, Filas e Human Handoff]]", "[[FASE 6 — Cliente 360]]"]
aliases: ["redesenho do chat", "ConversaList grupos", "régua de ícones", "gaveta do assinante"]
tags: [work, task, chat, ux, frontend]
---

# Redesenho do módulo Chat

**Iniciado em 2026-08-27.** Origem: o operador mandou prints do painel que a
equipe usa hoje (TSMX) pedindo que a nossa tela ficasse tão fácil quanto.

## O achado que define o tamanho da tarefa

**É frontend puro. Nenhuma linha de API muda.**

`conversaRepository.CONVERSA_FIELDS` já devolve `agente_nome`, `fila_nome` e
`fila_cor` em **toda** listagem — o comentário no próprio arquivo diz por que
(*"sem isto a tela só saberia o `fila_id` e teria de buscar o nome de novo"*).
A `urgencia` do SLA já vem calculada. E o `useChat` já expõe `assumir`,
`assumirProximo`, `transferirFila`, `devolverIA`, `encerrar` e `transferir`.

**A tela recebe tudo isso hoje e joga fora.** O redesenho é, em boa medida,
parar de descartar dado que já está no fio.

## As quatro decisões

### 1. Grupos colapsáveis por STATUS, não abas

Os 5 chips (`Todas / IA / Fila / Agente / Encerradas`) viram 5 grupos com
contador: **Com a IA · Aguardando · Em atendimento · Fora de hora · Encerradas
hoje**.

O eixo é **status**, não fila e não SLA. Fila espalharia "aguardando" por três
grupos e quebraria justamente para quem atende mais de um setor; SLA some com a
noção de "minhas conversas". Status responde a pergunta que a atendente faz o
dia inteiro: **o que precisa de mim agora?**

Aba **esconde** o resto; grupo **mostra o todo** e deixa fechar o que não
interessa. Com 18 conversas em cinco estados, essa é a diferença entre ver a
operação e caçar por ela. `Aguardando` nasce aberto porque é o único que pede
ação; o resto lembra o estado em `localStorage`.

### 2. O cartão diz setor, dono e espera

Etiqueta do setor pintada com `fila_cor`; **quem atende** (`agente_nome`) ou o
botão primário **Atender** quando está aguardando; e o tempo de espera junto do
SLA. Mais um menu `⋮` com **Transferir**, **Devolver para IA** e **Finalizar**
— resolver sem abrir a conversa é o que o painel antigo faz e o nosso não fazia.

Mostrar **quem atende** não é enfeite: é o que evita dois agentes na mesma
conversa antes de o `assumir` condicional ter de recusar um deles.

### 3. Coluna direita vira régua de ícones + gaveta

`ConversaInfo` (508 linhas segurando ficha do assinante, Copiloto, Supervisora e
notas) vira uma barra vertical de ícones; clicar abre a gaveta por cima.

O ganho não é só espaço. **Hoje trocar de conversa paga a ficha do SGP mesmo
sem ninguém olhar.** Com gaveta, só paga no clique — exatamente o argumento com
que a FASE 6 já tinha posto o painel completo atrás de um drawer
([[Cliente 360 e Copiloto]]). A régua estende a mesma regra ao resto da coluna.

Quebrar o `ConversaInfo` é consequência necessária do trabalho, não faxina
avulsa: quatro conteúdos independentes num arquivo só é o que impedia cada um
de carregar sob demanda.

### 4. As ações saem do esconderijo

Header da conversa com **Finalizar** destacado, mais transferir, devolver à IA e
histórico.

## Como isto é testado, já que não há runner de frontend

A lógica de agrupamento sai como função **pura** (`agruparConversas`) em
`apps/web/src/lib/`, e a suíte do `apps/api` a importa direto — mesmo truque que
`contrato-catalogos.test.js` usa com o `nodeTypes.js`, e pela mesma razão: JS
puro atravessa a fronteira dos dois pacotes sem tocar em build nenhum. O resto
é `npm run build` e olhar a tela.

## O que a análise especialista achou, e mudou o plano

Três agentes leram o código antes da primeira linha nova. O que eles acharam
não estava no design, e mudou decisões:

### O grupo "Aguardando" nasceria VAZIO para todo mundo que não é admin

`GET /chat/conversas` filtra por `agente_id = eu` quando o papel não é admin
(`routes/chat.js:42`). O agente comum **não recebe conversa em fila nenhuma** —
o próprio `ConversaList.jsx` já documentava isso num comentário sobre o botão
"Próxima". Uma lateral agrupada por status mostraria zero em três dos cinco
grupos.

A saída não foi mudar a listagem: **`GET /chat/fila` já faz a coisa certa** —
aplica `conversaVisivel`, calcula `pos_na_fila` **antes** do filtro de
visibilidade, e devolve o SLA da fila. `chatApi.fila()` estava definido em
`lib/api.js` e **nenhum componente chamava**. O grupo "Aguardando" passa a
comer de lá; o resto continua vindo da listagem.

### "Encerradas hoje" também nasceria vazia, e essa exigiu backend

`conversaRepo.encerrar` **zera o `agente_id`**, então a conversa que o agente
acabou de fechar sumia da tela dele no primeiro F5 — defeito que já existia,
escondido atrás de uma aba que ninguém abria. Um grupo fixo com contador zero o
exporia.

Corrigido na origem, com o caminho que esta casa já usa: a Quality AI recupera
o agente pela **última mensagem dele** quando o `agente_id` foi zerado (§FASE
11). A listagem passa a aceitar `agente_id = eu` **OU** existir mensagem minha
na conversa.

### O SLA do cartão discordava da tela de Fila

`/chat/conversas` chamava `calcularUrgencia(desde, prioridade)` **sem o terceiro
argumento**, enquanto `/chat/fila` e `transferir-fila` passavam a fila. A
listagem usava o padrão 5/15 para todas as filas: a **mesma** conversa aparecia
"crítica" numa tela e "ok" na outra. `CONVERSA_FIELDS` ganhou
`sla_atencao_min as atencao_min` e `sla_critico_min as critico_min` — os nomes
que `nivelUrgencia` lê.

### O cronômetro do cartão não pode vir de `urgencia.minutos`

Eventos SSE parciais reemitem `urgencia` **zerada** (`calcularUrgencia(null)` →
`{nivel:'ia', minutos:0}`), e o `upsertConversa` faz merge raso. O cronômetro
voltaria a zero sem a conversa ter saído da fila. O cartão deriva o tempo de
`aguardando_desde`, que é fato, não derivada.

### Havia dois cálculos de urgência divergentes

`store/chat.js` tinha um `calcUrgencia` local com limiares próprios (10/5/2
min), usado só para ordenar, contra os 5/15 por fila do servidor — **a ordem da
lista e a cor do cronômetro discordavam por acidente**. Ele saiu; ordenar é do
`agruparConversas`, que é puro e testado.

### Cartão fantasma

O evento SSE `mensagem` faz upsert de `{id, ultima_mensagem, atualizado}`; se o
id não estava na lista, o store **inseria** um objeto sem `status` e sem
`nome`. Hoje isso vira um cartão quebrado; com grupos, um item sem grupo. Uma
guarda no `upsertConversa` cobre todos os chamadores de uma vez: patch de
conversa desconhecida não vira linha nova.

### E "fora de hora" não precisou de regra nova

`GET /atendimento/filas` já devolve `aberta: dentroDoHorario(f.horario)`, e o
`ConversaInfo` já chamava esse endpoint **descartando o campo**. Copiar
`dentroDoHorario` para o frontend criaria uma segunda verdade sobre o horário
da operação; o grupo lê o booleano que o backend calculou.

## Estado

Design aprovado. Backend corrigido (3 pontos acima), `agruparConversas` no ar
com 10 testes, suíte em **523 puros**. Componentes da tela em construção.
