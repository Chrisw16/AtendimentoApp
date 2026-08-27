---
title: Redesenho do módulo Chat — a tela onde a atendente passa o dia
type: task
created: 2026-08-27
last_updated: 2026-08-27
status: done
priority: p1
knowledge_refs: ["systems/maxxi/telas/chat", "systems/maxxi/components/fila-e-sla", "systems/maxxi/components/cliente-360-e-copiloto"]
related: ["[[Fila e SLA]]", "[[Cliente 360 e Copiloto]]", "[[FASE 5 — Equipes, Filas e Human Handoff]]", "[[FASE 6 — Cliente 360]]"]
aliases: ["redesenho do chat", "ConversaList grupos", "régua de ícones", "gaveta do assinante"]
tags: [work, task, chat, ux, frontend]
---

# Redesenho do módulo Chat

**Iniciado em 2026-08-27.** Origem: o operador mandou prints do painel que a
equipe usa hoje (TSMX) pedindo que a nossa tela ficasse tão fácil quanto.

## O achado que definiu o tamanho da tarefa

**Quase tudo já vinha pronto do backend — a tela é que descartava.**

(O "quase" custou três correções de API, todas achadas pela análise e listadas
mais abaixo. A premissa de partida — "isto é frontend puro" — estava errada, e
errada de um jeito útil: foi tentar montar a lateral que expôs defeitos que
ninguém tinha visto porque a aba que os mostraria nunca era aberta.)

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

## O que a tela no ar corrigiu do próprio desenho

Três coisas só apareceram depois do deploy, e as três valem mais que o plano:

### O painel abria POR CIMA — e cobrir a conversa é o oposto do que ele serve

A gaveta nasceu overlay porque copiei a anatomia do `PainelSGP`, que é o único
drawer que o app tinha. Errado: o atendente precisa da ficha **e** da conversa
ao mesmo tempo — escurecer o chat para mostrar o dado com que ele vai responder
inverte a função da tela. Virou **coluna**: divide o espaço, não cobre. Abaixo
de 1180px ela volta a sobrepor, que é o único caso em que sobrepor ajuda.

O `PainelSGP` **continua overlay de propósito**, e agora a diferença tem
sentido: a coluna é acompanhamento lado a lado, o overlay é o mergulho completo
no assinante. Ele se marca com `data-drawer-sobreposto` para o Esc da coluna
saber que há algo por cima.

### O cartão parecia quebrado, e a culpa era do reset que faltou

`.avatar` e `.content` são `<button>`, e eu não zerei `border`/`background`/
`padding`. A moldura cinza dentro do cartão era a **borda nativa do botão**. É o
tipo de coisa que o build não vê, o teste não vê, e a primeira olhada na tela
vê na hora.

### O cabeçalho do contato fez falta

Tirei o nome/avatar/status do topo do painel por serem redundantes com o header
da conversa. Na tela real o header fica na **outra ponta**, e o painel abria um
monte de dado sem dizer de quem era. Reposto.

## O que a verificação adversarial pegou antes do deploy

Um segundo agente revisou as correções do primeiro. Os que sobreviveram à
verificação e viraram commit:

- ⚠️ **Clicar numa conversa da fila não abria nada** para quem não é admin: o
  cartão vem de `/chat/fila`, e a busca da conversa selecionada olhava só
  `chat.conversas`. O grupo principal da tela nova seria inclicável.
- ⚠️ **Abrir uma conversa da fila para decidir se assume ZERAVA o `nao_lidas`
  dela.** `GET /conversas/:id/mensagens` marca como lida sem checar dono — antes
  não importava, porque o agente comum não conseguia abrir conversa alheia pela
  UI. A lateral nova tornou isso alcançável, e o aviso sumiria para o colega que
  fosse atender. Marcar como lida é **escrita**, e agora só acontece para o dono.
- **Fechar o painel do SGP fechava a coluna junto** (overlay aninhado sem
  `stopPropagation`), e o Esc idem.
- **O menu `⋮` era decepado pelo overflow da lista** — `position: absolute` não
  escapa de `overflow` de ancestral, então nos cartões da metade de baixo o
  formulário de "Finalizar" ficava invisível.
- **A busca filtrava com predicados DIFERENTES nos dois lugares** (o store sem
  `trim`, a lista com): `" joao"` escondia as conversas próprias e deixava a
  fila inteira na tela — o sintoma que a correção anterior dizia matar, ao
  contrário. Virou `combinaBusca`, fonte única e testada.
- **O toggle IA/Humano mentia:** `PUT /chat/modo` existe desde sempre e não
  tinha cliente nenhum. Mudava a cor do botão e o backend seguia no modo antigo,
  até o próximo `loadConversas` reverter. A rota é `adminMiddleware`, então o
  botão também sumiu para quem não é admin.
- **O `⋮` ficava invisível em tela de toque** (`opacity: 0` até o hover) — numa
  operação com tablet, as três ações mais usadas do dia deixavam de existir.

## Estado

**Entregue e no ar em 2026-08-27.** Suíte: **527 testes puros** (14 deles do
`agruparConversas`/`combinaBusca`). Nenhum runner de frontend foi adicionado — a
lógica testável saiu para `lib/`, e o resto é build + olhar a tela, que foi
exatamente o que pegou os três defeitos de cima.

### Tetos assumidos, para quem vier depois

- **`ConversaInfo.jsx` continua grande** (~450 linhas). Ele deixou de ser coluna
  e virou conteúdo de painel, que era o ganho que importava — carregar sob
  demanda. Quebrar em três arquivos era code motion sem benefício novo.
- **`SupervisoraIA.jsx` segue órfã**: ninguém importa, e os
  `window.dispatchEvent` de `useChat` caem no vazio. Ou vira o 4º ícone da
  régua, ou sai.
- **A guarda do Esc é um `querySelector` global.** Funciona porque nenhum outro
  modal do app monta junto com o Chat. Um modal global futuro (paleta de
  comandos, confirmação) trava o Esc da coluna em silêncio.
- **`conversa_atualizada` é broadcast para todos os clientes SSE**, e o
  `upsertConversa` insere conversa desconhecida quando ela vem com `status`.
  Continua sendo um vazamento de visibilidade — pré-existente, e fora do escopo
  desta tarefa.
