---
title: Agente de recepção e agente financeiro — e o segundo motor que não foi escrito
type: task
created: 2026-09-05
last_updated: 2026-09-05
status: done
priority: p0
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/components/playbook-engine", "systems/maxxi/components/cliente-360-e-copiloto", "systems/maxxi/components/fila-e-sla"]
related: ["[[IA e Tool Calling]]", "[[Playbook Engine]]", "[[FASE 9 — AI Runtime V1]]", "[[FASE 11 — Quality AI V1]]", "[[Cliente 360 e Copiloto]]", "[[Integração SGP]]"]
aliases: ["agente financeiro", "ia_roteador", "agente de recepção", "identificar_cliente", "direcionar_atendimento", "migration 029"]
tags: [work, task, ia, financeiro, recepcao, roteador]
---

# Agente de recepção e agente financeiro

**2026-09-05.** Duas entregas pedidas pelo operador: um **agente financeiro**
(o produto tinha só suporte e comercial) e a revisão do **`ia_roteador`**, que
ele queria como agente de recepção — receber, qualificar e encaminhar.

## O achado que mudou o tamanho da tarefa

**O `ia_roteador` nunca esteve no fluxo ativo.** Ele existe só no fluxo
"Teste" (`n_1788647790506`), com duas rotas (`financeiro`, `suporte`), sem
`cfg.mensagem`, e alimentado por três `enviar_texto` — ou seja, cabeado como
*"posso ajudar em mais alguma coisa?"*, não como recepção. Ao lado dele, um
`ia_responde` com `{"contexto":"financeiro"}` e nada mais: o operador já tinha
começado exatamente o que pediu, e faltavam as peças.

E ele tinha três defeitos, todos medidos no código, nenhum visível por teste.

### A regra de despedida sequestrava o atendimento

```js
/^(obrigad|valeu|vlw|não|nao|tchau|encerr|até|flw|ok|certo|tudo|
   fechou?|nada|por enquanto|por ora)[^\w]*/i
```

`.test()` casa **prefixo**, e a alternação não é ancorada no fim. Então
`"não consigo acessar"`, `"nada funciona aqui"`, `"ok, quero a segunda via"`,
`"tudo bem, mas caiu de novo"`, `"até agora não voltou"` e `"certo, e o
técnico?"` saíam todos pela porta `encerrar` — **antes** de qualquer IA ser
consultada. Mesma família do menu que devolvia boleto para quem relatava
queda: o cliente digita a frase mais comum do suporte e é desligado na cara.

**A regex saiu inteira, não foi ancorada.** Ela existia para poupar UMA
chamada de Haiku numa despedida, e o preço foi esse. Com o agente decidindo
`encerrar` por ferramenta, a classe de defeito some em vez de ser estreitada.

### O prompt 🧭 da tela Prompts IA era código morto

`processarIARoteador` montava o `system` inline e nunca chamava
`resolverPrompt('roteador')`; o modelo estava cravado e a temperatura nem era
lida. O operador editava e nada mudava — mesma classe do painel do
`ia_responde` que mentia (27/08).

E o conteúdo do prompt era um **classificador de uma palavra** (*"Responda
SOMENTE com uma palavra"*), com categorias que não são as rotas do nó
(`comercial`, `faq`, `outros`) e **sem `[REGRAS]` e `[ESTILO]`** — o único
prompt de agente sem os dois. Ligar esse prompt num agente que precisa
conversar entregaria uma recepção muda com duas listas contraditórias no mesmo
system prompt. Foi reescrito, e só para quem não o tinha editado.

### Ele não qualificava nem identificava — estruturalmente não podia

One-shot, `max_tokens: 30`, sem tools, sem histórico, sem memória. E **não
existia tool de identificação**: `consultar_cliente` é tipo de **nó**. Nenhum
agente de IA do produto conseguia descobrir com quem estava falando; todos
dependiam de um nó ter rodado antes.

## A decisão que a revisão virou do avesso

O desenho original fazia `processarIARoteador` virar **um segundo laço
agêntico**, no mesmo formato do `ia_responde`. Duas revisões adversariais
independentes convergiram no mesmo veredito, e estavam certas: **todos os
furos graves saíam da duplicação.**

O gêmeo esqueceria: tratar `salvar_dado` (que não tem `case` no `executarTool`
— é tratada dentro do `ia_responde`, então a IA diria *"anotei"* e a tool
responderia que não existe: o defeito de 27/08 reintroduzido por construção);
os três blocos da casa §67/§68/§75, **na porta de entrada**, que é o nó que
fala com todo mundo; `getAnthropicClient({sandbox})`, fazendo cada teste no
link público entrar no relatório de custo como atendimento real; e
`registrarExecucao`, deixando a recepção invisível no Analytics.

Este repositório já pagou caro por catálogos gêmeos que divergem
(`nodeTypes` × `NOS` × switch, `PropsPanel` morto, `IA_TOOLS_DEFAULT` ×
`TOOLS_PADRAO`) e a resposta dele sempre foi **fonte única ou teste de
contrato**, nunca uma segunda cópia.

**Então o `ia_roteador` delega:** `processarIAResponde(no, ctx, { modo:
'recepcao' })`. A única diferença é o **vocabulário de saída** — um objeto
`PORTA` que mapeia `resolvido→encerrar`, `transferir→nao_entendeu`,
`max_turnos→nao_entendeu` — mais a tool de direcionamento e o bloco de rotas
no prompt. O resto vem de graça porque é o mesmo código.

## A saída é uma TOOL, não a tag `<rota>`

O classificador lia `<rota>id</rota>` do **texto** do modelo. Num agente que
conversa, isso é a fala do cliente e a decisão do sistema saindo pelo mesmo
canal: bastava o cliente digitar `<rota>encerrar</rota>`. `tool_use` é um canal
que o texto do cliente não alcança — e o destino ainda é validado contra o
`enum` das rotas do nó.

⚠️ **`direcionar_atendimento` é construída a cada chamada.** `IA_TOOLS` é um
singleton de módulo e `filtrarTools` faz cópia **rasa**: escrever o `enum` das
rotas lá dentro contaminaria as outras conversas do mesmo lote (o worker
processa em `Promise.all`), e duas conversas em fluxos diferentes trocariam a
lista de destinos uma da outra.

## `identificar_cliente` — a tool que faltava

A lógica de "consulta o SGP, preenche o contexto e **persiste o vínculo em
`conversas.cpf`/`contrato_id`**" saiu do `case 'consultar_cliente'` para
`identificarNoContexto()`, usada pelos dois caminhos. Sem compartilhar, a tool
identificaria sem persistir — o defeito que a FASE 6 fechou em 22/08.

Fica **no nó**, de propósito: o contador de tentativas, as portas
(`encontrado`/`multiplos_contratos`/`max_tentativas`), as mensagens
configuráveis e a pausa por `aguardar_input`.

Três travas que a revisão exigiu:

- ⚠️ **Recusada no sandbox.** O link público `/teste/<token>` não pede login e
  roda o motor de verdade contra o SGP. Uma tool que devolve ficha ao modelo —
  que fala com um visitante anônimo — transforma o link num **oráculo
  CPF→assinante** e contorna, por um canal novo, a correção de 27/08. **Teto: a
  identificação por IA só se valida em conversa real**, como o rastreamento de
  playbook.
- **O retorno é resumo curado, nunca a ficha.** `contratos[].servico.senha`
  (PPPoE), `wifi.senha` e `central.senha` moram no mesmo objeto; despejar a
  ficha no `tool_result` põe as três no histórico da conversa. Há teste
  travando isso.
- **Auditada** (`identificacao_por_cpf`), mesmo sendo leitura: a mesma consulta
  pelo Cliente 360 gera trilha, e aqui o alcance é maior — qualquer turno de
  qualquer agente.

Ela entra em **`TOOLS_SEMPRE_ATIVAS`** pelo argumento de memória e base de
conhecimento: todo nó escrito antes da FASE 7 tem `cfg.tools_ativas` explícito,
e essa lista **substitui** o padrão. Deixá-la no padrão a entregaria
exatamente aos nós que não precisam e a nenhum dos que precisam.

## O que a revisão adversarial do código mudou

Três revisões (duas do design, uma do diff pronto) acharam nove defeitos além
dos já conhecidos. Os quatro que teriam virado incidente:

1. ⚠️ **A recepção engolia a fala do cliente em turnos alternados.** O guard de
   reentrada usava `estado.aguardando`, que é **persistido**, e
   `processarIAResponde` nunca escreve nesse campo — então ele voltava a `null`
   a cada turno e o nó pulava a mensagem sim, outra não. Num fluxo
   `inicio → ia_roteador` (a recepção de verdade, sem `cfg.mensagem`, porque
   quem cumprimenta é o próprio agente) a **primeira** fala do cliente ficava
   sem resposta nenhuma. O sinal certo é `ctx.respostas.length`, que é **do
   turno** e responde a pergunta real: "alguém já falou com o cliente agora?".
2. ⚠️ **A recepção herdava `TOOLS_PADRAO` inteiro** — `reiniciar_onu_acs`,
   `criar_chamado`, `promessa_pagamento` (1x por mês, irreversível),
   `segunda_via_boleto` — no **primeiro nó de toda conversa**, enquanto o prompt
   dela diz "você não resolve o problema, você descobre qual é". O roteador
   antigo rodava com zero tools; o novo não pode nascer podendo agir no mundo
   real antes de saber com quem fala. Hoje tem lista própria.
3. ⚠️ **`identificar_cliente` sabotava o pré-cadastro.** Entrando nas
   sempre-ativas, ela chega ao nó comercial — onde o normal é o CPF ser de quem
   ainda **não** é assinante. O retorno dizia *"Confirme o número com o
   cliente"*, mandando a IA duvidar de um CPF correto exatamente onde o
   pré-cadastro deveria seguir.
4. ⚠️ **A etapa "Identificar o cliente" era marcada mesmo quando falhava.** O
   `registrarTool` foi hoisted para o topo do laço (o que corrigiu de quebra o
   `salvar_dado`, que nunca marcava a etapa "Coletar o endereço" do playbook
   comercial), mas para esta tool o sucesso é conhecido no próprio handler:
   marcar pela chamada poria `[x] Identificar o cliente` no turno seguinte com
   o contexto vazio — num playbook cuja etapa 2 diz *"sem CPF e contrato não se
   fala de valor nenhum"*.

E cinco menores, todos corrigidos: o fallback do `scorecardDe` sem `ORDER BY`
escolheria um scorecard **arbitrário** para qualquer fila sem homônimo (o `||`
era código morto, e revivê-lo era pior que deixá-lo morto); `mesclarCliente`
carregava campos do cliente **anterior** quando o CPF mudava (`popId` errado
manda o `consultar_manutencao` para o POP de outra pessoa); o fallback de
documento aceitava um CPF ilegível e respondia sobre a consulta anterior; a
heurística de roteamento por texto (`lwr.includes('transferir')`) faria a
recepção sair do nó **pelo texto que ela mesma escreveu**; e o `catch` era a
única saída que não limpava o estado do nó.

⚠️ **`diasAte` nasceu com off-by-one** e é por isso que virou módulo puro
testado: `data_promessa` nasce de um `.toISOString()` (UTC) e eu comparava
contra a data **local** — em UTC-3, perto da meia-noite, 3 dias viram 4.

## Os prompts: uma substituição e uma correção cirúrgica

Medido em produção: **os dois prompts foram editados pelo operador**, então a
regra "não desfazer edição" não resolvia sozinha.

- **`financeiro` — correção cirúrgica.** Ele manda *"Chame `consultar_clientes`"*
  em dois lugares, tool que nunca existiu. Trocar o nome não é reescrever o
  prompt: é consertar uma referência quebrada dentro do que o operador
  escreveu. O resto fica intacto.
- **`roteador` — substituído, e a exceção está declarada.** O slug **nunca foi
  lido por linha nenhuma de código**, então não há trabalho do operador em
  efeito para preservar. E o conteúdo em produção era um classificador JSON
  (*"Responda APENAS com o JSON"*) que, como base de um agente que conversa,
  produziria uma recepção respondendo `{"agente":"suporte"}` ao cliente.

O conteúdo anterior fica transcrito aqui para não se perder:

```
Classifique a mensagem em UMA categoria. Responda APENAS com o JSON, nada mais:
{"agente":"financeiro|suporte|comercial|faq|outros","cpf":"CPF se mencionado ou null","resumo":"5 palavras"}

REGRAS:
- "financeiro": boleto, 2ª via, pagamento, PIX, desbloqueio, fatura, cobrar
- "suporte": internet, lento, caiu, conexão, reiniciar, técnico, manutenção
- "comercial": plano, upgrade, cancelar, contratar, instalar, cobertura, preço, mudança
- "faq": horário, endereço, como funciona, fibra, canal de atendimento
- "outros": saudação (oi/olá/bom dia), despedida, reclamação, fora do escopo
```

## Encaminhar não é resolver

`registrarExecucao` da recepção grava **sempre `roteado`**, nunca `resolvido` —
nem quando o destino é `encerrar`. `conversa_fatos.desfecho_ia` pega a ÚLTIMA
execução da conversa: um cliente que diz "oi" e "obrigado, era só isso" na
recepção entraria como resolução da IA e baratearia o `custo_por_resolvido`. É
a mesma família do KPI que era ~100% por construção e que a FASE 12 consertou.

## O agente financeiro

Escopo decidido pelo operador: **só o que as tools já fazem** — 2ª via, PIX e
desbloqueio por promessa. Negociação, parcelamento, troca de vencimento e
cancelamento viram transferência. **Cobrança ativa** (IA que inicia contato com
inadimplente) foi pedida para o futuro e é outro produto: disparo ativo, régua
e cuidado com CDC.

Entram perfil `financeiro` (prompt já existia desde a 005), playbook
`financeiro_2via_e_desbloqueio` (8 etapas) e scorecard `financeiro` — cujo
critério **crítico** é *informação sem fonte*: valor, prazo, protocolo ou
condição que não veio de ferramenta nesta conversa. Num atendimento de
cobrança, é o pior erro possível.

### As mentiras que estavam na trilha

- ⚠️ **O NÓ `promessa_pagamento` anunciava sucesso para uma recusa** — e ele
  está no fluxo ATIVO (`n_1774208475772`). Lia `data.adimplente`, `data.dias` e
  `data.data`, três campos que `promessaPagamento` **nunca devolveu** (os nomes
  são `liberado_dias`/`data_promessa`), e **nunca lia `liberado`**. Como a
  função não lança quando o SGP recusa, o `catch` não via nada: o cliente lia
  *"✅ Promessa registrada! 📅 Pague até: "* com a data vazia, e desligava
  achando que a conexão ia voltar.
- **A afirmação de que a TOOL fazia o mesmo estava errada** e é registrada como
  tal: `integrations.js` já marca `erro` quando `status !== 1`. O que a tool
  fazia de errado era descartar o **protocolo** (enquanto o prompt manda
  informá-lo — o convite à invenção) e os dias, e transformar recusa legítima
  (a promessa é 1x/mês) em `"Erro: ..."`, que o modelo repassa como falha de
  sistema.
- ⚠️ **`promessaPagamento` fabricava o prazo**: `liberado_dias || 3`. Uma
  correção contra número inventado não pode imprimir um — o `|| 3` saiu e o
  formatador **omite** o prazo quando o SGP não o mandou.
- ⚠️ **`criar_chamado` mandava a ficha crua do assinante ao cliente.**
  `|| JSON.stringify(r)` não punha "um dump de JSON": `r` é o spread da
  resposta do SGP, sobre a qual o próprio `integrations.js` avisa que *"traz
  nome e dados do assinante"* — PII no WhatsApp, por um caminho que
  `mascararPII` não alcança. E o `✅` era pior que o dump: `criarChamado` não
  lança quando o SGP responde 200 com `status: 0`, então a tool anunciava
  chamado aberto que não abriu. **A guarda passa a ser `chamado_aberto`**, que
  já era calculado e nunca lido.
- **O sandbox parava em "foi simulada", sem protocolo** — e foi esse buraco que
  fez a IA anunciar `25438-LOS-001` em 27/08 (o contrato com um sufixo
  fabricado). §68 já listava *protocolo* nominalmente e não bastou: **proibir
  inventar não fecha um buraco, só o nomeia.** A mensagem do guard genérico
  agora diz, com todas as letras, que nenhum número foi gerado — e cobre as
  quatro tools de escrita de uma vez.

### Dois catálogos que a tela mostrava e o backend ignorava

- ⚠️ **`quality.scorecardDe` só conhecia dois perfis** (`comercial`, senão
  `suporte`): uma conversa da fila Financeiro seria auditada com critérios de
  RADIUS, ONU e reteste. Scorecard novo nasceria decorativo — a família do
  `agentes.permissoes` que nunca decidiu nada. E o `||` do fallback era código
  morto: query builder do knex é sempre truthy.
- ⚠️ **A etapa 1 do playbook de suporte declarava `consultar_cliente`**, que é
  **tipo de nó**, não tool. Como a etapa é dada por cumprida pela tool que a
  evidencia, ela **nunca** podia ser marcada — o procedimento ficava travado em
  `0/9` para sempre, e já enganou o operador uma vez (27/08). A 022 semeou essa
  linha em produção, então a **029 faz o `UPDATE`**, condicional ao valor exato.

## Migration 029

Semeia **só o que é novo**, e não `semearCatalogos()` inteiro: aquele guard é
existência, não histórico, e ressuscitaria um catálogo que o operador apagou de
propósito desde a 022. A contagem no log é de inserções de verdade —
`semearCatalogos` devolve `FILAS.length` mesmo tendo inserido zero, e o
operador lê o log do deploy como confirmação.

Os prompts são trocados **só se o operador não os editou** (compara `conteudo`
com `padrao`). ⚠️ A **ordem importa**: comparar antes de gravar o `padrao`
novo — invertido, a condição nunca casa e ninguém recebe a correção, que é a
pior falha possível porque é silenciosa.

⚠️ **O playbook nasce em rascunho** (§60/§62) e `carregar()` só lê `publicado`.
São **dois cliques na tela**, não uma linha de código. Sem isso o perfil
financeiro roda sem procedimento — exatamente como suporte e comercial ficaram
até alguém publicá-los.

## O que fica de fora, e por quê

- **Cobrança ativa** — pedida, é outro produto.
- **Honrar `temperatura` do banco** — nenhum caminho a passa hoje; fazer só a
  recepção honrá-la criaria divergência nova.
- **Os SLAs cravados nos prompts do seed** (*"em até 10 minutos"*, *"48h
  úteis"*) — tirar o prazo do `return` da tool e deixar esses de pé resolve
  metade, mas são conteúdo editável do operador.
- **Repontar a aresta `saida` do `menu_cliente`** (P0: "internet caiu" devolve
  boleto) — é dado de fluxo no banco de produção, não código.

## Suítes

**589 testes puros** (eram 527) e **288 de integração** (eram 278).
