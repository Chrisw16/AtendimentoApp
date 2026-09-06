# Agente de recepção + agente financeiro — design

> **Revisado em 2026-09-05, depois de duas revisões adversariais.** O desenho
> original construía um **segundo laço agêntico** ao lado do `ia_responde`, e
> os dois revisores convergiram no mesmo veredito: era daí que saíam todos os
> furos graves — `salvar_dado` sem tratamento (a IA diz "anotei" e não grava),
> os blocos §67/§68/§75 ausentes na porta de entrada, `getAnthropicClient()`
> sem `sandbox` fazendo teste virar custo de produção, `ia_execucoes` sem
> registro e sentinels de tool sem porta. A seção **A1** abaixo foi reescrita:
> o `ia_roteador` passou a **delegar ao mesmo laço**. As correções de premissa
> estão marcadas com ✏️.

**2026-09-05.** Duas entregas que se encontram no mesmo ponto: hoje o produto
tem agente de **suporte** e de **comercial**, e a porta de entrada é um menu de
botões. Falta o **financeiro** (que o operador já começou a montar no fluxo
"Teste") e falta uma **recepção** que leia texto livre — que é como o cliente
de WhatsApp de fato escreve.

## Ponto de partida medido (não suposto)

Lido no banco de produção em 2026-09-05:

- O fluxo **ativo** ("Atendimento NetGo — Principal", 24 nós) **não tem
  `ia_roteador`**. A recepção dele é `saudacao` (`enviar_botoes`) →
  `consultar_sgp` (`consultar_cliente`) → `menu_cliente` (`enviar_lista`).
- O fluxo **"Teste"** (21 nós) tem o `ia_roteador` `n_1788647790506`, com duas
  rotas (`financeiro`, `suporte`), **sem `cfg.mensagem`**, alimentado por três
  `enviar_texto` — ou seja, hoje ele está cabeado como *"posso ajudar em mais
  alguma coisa?"*, não como recepção. E tem um `ia_responde`
  `n_1788646422237` com `{"contexto":"financeiro"}` e mais nada.
- Existem: fila `financeiro`, categoria de conhecimento `financeiro`, prompt
  `financeiro` (migration 005) e as tools `segunda_via_boleto`,
  `promessa_pagamento`, `historico_ocorrencias`.
- **Não existem**: perfil, playbook e scorecard financeiros — os três que
  `suporte` e `comercial` têm em `dadosIniciais.js`.

## Parte A — o `ia_roteador` vira agente de recepção

### A0. Os defeitos que ele tem hoje

**A regra de despedida sequestra o atendimento.** `motorFluxo.js:1096`:

```js
/^(obrigad|valeu|vlw|não|nao|tchau|encerr|até|flw|ok|certo|tudo|fechou?|nada|por enquanto|por ora)[^\w]*/i
```

`.test()` casa **prefixo**, e a alternação não é ancorada no fim. Então
`"não consigo acessar"`, `"nada funciona aqui"`, `"ok, quero a segunda via"`,
`"tudo bem, mas caiu de novo"`, `"até agora não voltou"` e `"certo, e o
técnico?"` saem todos pela porta `encerrar`, **antes** de qualquer IA ser
consultada. É a mesma família do menu que devolvia boleto para quem relatava
queda: o cliente digita a frase mais comum do suporte e é desligado na cara.

**O prompt 🧭 `roteador` da tela Prompts IA é código morto.**
`processarIARoteador` monta o `system` na mão e nunca chama
`resolverPrompt('roteador')` — só `ia_responde` e a IA direta chamam. O
`modelo` e a `temperatura` da tela também são ignorados (`claude-haiku-4-5`
cravado no código). O operador edita e nada muda: mesma classe do painel do
`ia_responde` que mentia (corrigido em 27/08).

**Ele não qualifica nem identifica — estruturalmente não pode.** É one-shot:
`max_tokens: 30`, sem tools, sem histórico (vê só a última mensagem), sem
memória. E **não existe tool de identificação** — `consultar_cliente` é tipo de
*nó*, não tool. Nenhum dos agentes de IA do produto consegue identificar um
assinante hoje; todos dependem de um nó ter rodado antes deles.

Menor: não limpa `estado.aguardando` ao classificar, e `nao_entendeu` cai
direto na transferência humana no primeiro erro de classificação.

### A1. O que ele passa a ser  ✏️ *(reescrito após revisão)*

`processarIARoteador` **delega ao laço do `ia_responde`**:
`processarIAResponde(no, ctx, { modo: 'recepcao' })`. Não há laço novo.

A única diferença entre os dois modos é o **vocabulário de saída** (o objeto
`PORTA`): o `ia_responde` sai por `resolvido`/`transferir`/`max_turnos`; a
recepção sai pela rota escolhida, ou por `encerrar`/`nao_entendeu`. Tudo o
mais — histórico, `filtrarTools`, `salvar_dado`, playbook, os três blocos da
casa, telemetria com `conversaId` e `sandbox`, `ia_execucoes`, handoff — vem
de graça, porque é o mesmo código.

O que o nó tem de próprio fica em `processarIARoteador`: a saudação, a espera,
as rotas e a guarda de reentrada. Com isso ele ganha:

- **Prompt do banco**: `resolverPrompt('roteador')` como base, mais o bloco de
  rotas montado a partir de `cfg.rotas`. Modelo e temperatura passam a vir da
  tela. O bloco de rotas é do motor, não do prompt: rota é config do nó, e um
  operador que apagasse a lista do prompt não pode quebrar o roteamento.
- **Histórico por nó** (`_roteador_hist_<noId>`, `.slice(-50)`), igual ao
  `ia_responde`. É o que permite conversar antes de decidir.
- **Tools**: `direcionar_atendimento` (nova, schema dinâmico),
  `identificar_cliente` (nova), mais `cfg.tools_ativas`, tudo passando por
  `filtrarTools` — que já força `salvar_dado` e `buscar_conhecimento`
  (`TOOLS_SEMPRE_ATIVAS`). Recepção que responde "qual o horário de vocês?"
  pela base de conhecimento é melhor recepção que uma que roteia tudo.
- **`cfg.max_turnos`** (default **5**): estourar sai pela porta
  `nao_entendeu`, que já existe e já está cabeada.

### A2. A saída é uma TOOL, não uma tag `<rota>`

Hoje a decisão sai como `<rota>id</rota>` no texto do modelo. Num classificador
de 30 tokens isso é inofensivo. **Num agente que conversa, não é**: o cliente
digita `<rota>financeiro</rota>` e o parser obedece — a fala do cliente entra
no mesmo canal que a decisão do sistema. `tool_use` é um canal separado, que o
texto do cliente não alcança.

Então `direcionar_atendimento` é uma tool com `enum` montado a partir das rotas
do nó + `encerrar`, tratada **dentro do motor** (como `salvar_dado` e
`concluir_etapa_playbook`), porque decide o fluxo e o `executarTool` não vê o
grafo. A tag `<rota>` sai — duas portas para a mesma decisão, uma delas
insegura, é pior que uma.

✏️ **A regex de despedida saiu inteira, não foi ancorada** (o design original
dizia "fica, ancorada"). Ela existia para poupar UMA chamada de Haiku numa
despedida, e o preço foi desligar cliente na cara. Ancorar estreita o defeito;
tirar o elimina — e o agente agora tem a porta `encerrar` na tool, decidida por
quem lê a conversa inteira e não por um prefixo de string.

### A3. `identificar_cliente` — a tool que faltava

A lógica de "consulta o SGP, preenche `estado.contexto.cliente`, escolhe o
contrato e **persiste o vínculo em `conversas.cpf`/`contrato_id`**" hoje mora
dentro do `case 'consultar_cliente'` do motor. Ela sai para
`services/identificacao.js` e passa a ser usada pelos **dois** caminhos.

Isso não é faxina: sem compartilhar, a tool identificaria o assinante sem
gravar o vínculo, e o Cliente 360 voltaria a abrir sem contrato — exatamente o
defeito que a FASE 6 fechou em 22/08. A regra "a identificação é persistida na
linha da conversa" tem que valer para todo caminho que identifica.

Efeito colateral desejado: os agentes financeiro, de suporte e comercial
passam a poder se identificar sozinhos, o que hoje nenhum consegue.

### A4. Editor

O painel do `ia_roteador` em `FluxoEditor.jsx` ganha **Máx. turnos** e **Tools
ativas**. As **portas não mudam** (rotas dinâmicas + `nao_entendeu` +
`encerrar`), então o validador e o teste de contrato entre `nodeTypes.js`, o
`NOS` do validador e o `switch` do motor seguem intactos.

### A5. Custo, declarado

A recepção deixa de custar ~30 tokens e passa a custar um turno agêntico de
Haiku por mensagem, até `max_turnos`. É o preço de ler texto livre em vez de
exigir clique — e é exatamente o que a bateria de 27/08 mostrou faltando. O
custo já é medido: `getAnthropicClient` é ponto de instrumentação da FASE 12.

## Parte B — o agente financeiro

Escopo decidido pelo operador: **só o que as tools já fazem**. Cobrança ativa
(IA que inicia contato com inadimplente) é reconhecidamente desejada, mas é
outro produto — disparo ativo, régua e cuidado com CDC — e fica registrada
como fase futura, não entra aqui.

### B1. Os três catálogos que faltam

Entram em `dadosIniciais.js`, junto de `suporte` e `comercial`:

- **Perfil** `financeiro` — `prompt_slug: 'financeiro'` (já existe desde a
  005), `playbook_slug: 'financeiro_2via_e_desbloqueio'`, `goal:
  'resolver_financeiro'`, `max_turnos: 10` (a trilha é curta: identifica,
  busca boleto, entrega PIX), regras de transferência nomeando o que ele **não**
  faz — negociação, parcelamento, troca de vencimento, cancelamento.
- **Playbook** `financeiro_2via_e_desbloqueio` — etapas provadas por tool onde
  há tool que as prove, `concluir_etapa_playbook` onde não há (§8 da FASE 8).
- **Scorecard** `financeiro` — inativo, como os outros dois. O critério
  crítico é **valor informado sem fonte**: dizer um valor devido que não veio
  de ferramenta é o pior erro possível num atendimento de cobrança.

A semeadura é por **migration 029** chamando `semearCatalogos(db)` de novo. O
rastreamento de migration é por nome de arquivo, então a 022 não roda outra
vez; e `semearCatalogos` é idempotente por `onConflict(...).ignore()`, então o
que o operador editou não é desfeito. É o padrão que o CLAUDE.md manda seguir:
**catálogo novo se entrega por migration**, porque o `seed` não roda no deploy.

⚠️ O playbook nasce em **rascunho** (§60/§62) e `carregar()` só lê
`publicado`. Publicar é decisão do operador — **dois cliques na tela**, não uma
linha de código. Sem isso o perfil financeiro roda sem procedimento.

### B2. As tools que mentem, na trilha do financeiro  ✏️ *(premissa corrigida)*

**✏️ A afirmação original — "a tool sempre diz que liberou" — estava errada.**
`integrations.js:283` já marca `erro` sempre que `status !== 1`, e o
`if (r?.erro)` da tool intercepta. A tool **não** anuncia liberação para uma
recusa.

**Quem anuncia é o NÓ `promessa_pagamento`**, e ele está no fluxo ativo de
produção (`n_1774208475772`). `motorFluxo.js` lia `data.adimplente`,
`data.dias` e `data.data` — três campos que `promessaPagamento` **nunca
devolveu** (os nomes são `liberado_dias` e `data_promessa`) — e **nunca lia
`liberado`**. Como a função não lança quando o SGP recusa, o `catch` não via
nada e o nó respondia *"✅ Promessa registrada! 📅 Pague até: "* com a data
vazia, para uma promessa que não existiu. O cliente desliga achando que a
conexão vai voltar.

O que **é** verdade sobre a tool: ela descarta o **protocolo** e os **dias
liberados** — enquanto o prompt financeiro manda "informe o resultado com o
protocolo", que é o convite à invenção — e transforma recusa legítima (a
promessa é 1x/mês) em `"Erro: ..."`, que o modelo repassa como falha de
sistema. ✏️ E `promessaPagamento` **fabricava** o número de dias
(`data.liberado_dias || 3`): uma correção contra número inventado não pode
imprimir um, então o `|| 3` saiu e o formatador omite o prazo quando o SGP não
o mandou.

O texto original desta seção dizia:

```js
const r = await promessaPagamento(contrato).catch(e => ({ erro: e.message }));
if (r?.erro) return `Erro: ${r.erro}`;
return '✅ Acesso liberado! Sua conexão deve ser restabelecida em alguns minutos.';
```

`promessaPagamento` devolve `{ liberado, protocolo, liberado_dias,
data_promessa, ... }` e **`liberado: false` não é erro** — é o SGP dizendo
"esta promessa não foi concedida" (a própria descrição da tool diz que é 1x por
mês). O cliente é informado de que o acesso voltou quando não voltou, e liga de
novo dez minutos depois. Passa a ler `liberado`, dizer a verdade quando é não,
e informar o **protocolo real** e os dias liberados quando é sim.

✏️ **E o defeito de `criar_chamado` é maior do que estava escrito.**
`criarChamado` já resolve `protocolo` entre os formatos do SGP e já calcula
`chamado_aberto` — que **nunca era lido**. Quando o SGP responde 200 com
`status: 0`, a função não lança, `r.erro` é `undefined` e a tool dizia
*"✅ Chamado aberto com sucesso!"* para um chamado que não abriu. E o
`|| JSON.stringify(r)` não punha "um dump de JSON": punha **a resposta crua do
SGP, com nome e dados do assinante**, no WhatsApp do cliente — PII por um
caminho que `mascararPII` não alcança. A guarda passa a ser `chamado_aberto`,
não o protocolo.

**`criar_chamado` tem duas dívidas na mesma linha** (P0 já registrado no brain
em 27/08, e é a mesma classe de defeito): `|| JSON.stringify(r)` põe um dump
de JSON no lugar do protocolo do cliente, e o `"em até 24h úteis"` cravado no
`return` é SLA de operação morando em código — a IA repete, inclusive
generalizando para o comercial, onde não vale. SLA mora na base de
conhecimento.

**As duas passam a ser explícitas no sandbox.** Hoje `criar_chamado` devolve
`🧪 [sandbox] … foi simulada` **sem protocolo nenhum**, e foi esse buraco que
fez a IA inventar `25438-LOS-001` em 27/08. Buraco no retorno da tool vira
invenção: o sandbox passa a devolver `SANDBOX-SEM-PROTOCOLO` com todas as
letras.

**E a proibição sobe para as regras da casa**: o §68 do `iaRuntime.js` ganha
*"nunca informe número de protocolo que não tenha vindo de uma ferramenta
nesta conversa"*. §68 já listava *protocolo* nominalmente e não bastou —
porque proibir inventar não fecha um buraco, só o nomeia.

### B3. O prompt `financeiro` manda chamar uma tool que não existe

Ele diz "Chame `consultar_clientes`" — não existe tool com esse nome. Com
`identificar_cliente` criada (A3), o prompt passa a nomear a tool real. A
troca é feita **só se o operador não tiver editado o prompt** (compara
`conteudo` com `padrao`); `padrao` é sempre atualizado, para o botão
"restaurar" não devolver a versão errada.

## Testes

Módulos puros novos, com teste escrito antes (o motor não é importável em
teste):

- `roteadorHelpers.js` — `ehDespedida` (ancorada: `"não"` sozinho encerra,
  `"não consigo acessar"` não), montagem do schema de
  `direcionar_atendimento` a partir das rotas, validação da rota devolvida,
  bloco de rotas do prompt.
- `identificacaoHelpers.js` — normalização do CPF, escolha do contrato,
  montagem do `contexto.cliente` e do patch de persistência.
- `iaToolsHelpers.js` (já existe) — `formatarPromessaPagamento` e
  `formatarChamado`, com os casos `liberado: false`, sem protocolo, e sandbox.

Integração (`tests/integracao/`): a tool de identificação **persiste**
`conversas.cpf`/`contrato_id`, e a migration 029 semeia os três catálogos
financeiros sem duplicar os existentes.

## Correções que a revisão acrescentou

- **`quality.scorecardDe`** escolhia entre `'comercial'` e senão `'suporte'`:
  uma conversa da fila Financeiro seria auditada com critérios de RADIUS, ONU e
  reteste. E o `||` do fallback nunca caía no segundo ramo — um query builder do
  knex é sempre truthy, então era código morto.
- **A etapa 1 do playbook de suporte** declarava `tools: ['consultar_cliente']`,
  que é **tipo de nó**, não tool. A etapa nunca podia ser marcada: o
  procedimento ficava travado na etapa 1 para sempre. A 022 já semeou essa linha
  em produção, então a 029 faz o `UPDATE` — condicional ao valor exato, para não
  desfazer edição do operador.
- **O prompt `roteador` do seed era um classificador de uma palavra**
  (*"Responda SOMENTE com uma palavra"*), com categorias que não são as rotas do
  nó, e sem `[REGRAS]`/`[ESTILO]`. Usá-lo como base do agente entregaria uma
  recepção muda. Foi reescrito — só para quem não o editou.
- **A migration 029 semeia só o que é novo**, e não `semearCatalogos()` inteiro:
  aquele guard é existência, não histórico, e ressuscitaria um catálogo que o
  operador apagou de propósito.
- **`direcionar_atendimento` é construída por chamada.** `IA_TOOLS` é singleton
  de módulo e `filtrarTools` faz cópia rasa: escrever o `enum` das rotas lá
  dentro contaminaria as outras conversas do mesmo lote (`Promise.all`).

## O que fica de fora, deliberadamente

- **Cobrança ativa** — pedida, mas é outro produto (fase futura).
- **Negociação, parcelamento, troca de vencimento** — não há integração no
  SGP; viram transferência para a fila Financeiro.
- **Rota `comercial` no roteador** — o operador configurou duas rotas; quem
  decide quais rotas existem é o fluxo, não o código.
- **Honrar `temperatura` do banco.** Nenhum caminho do produto a passa hoje
  (`processarIAResponde` recebe de `resolverPrompt` e não usa). Fazer só a
  recepção honrá-la criaria divergência nova.
- **Os SLAs cravados nos prompts do seed** (*"liberação automática em até 10
  minutos"*, *"agendamento em até 48h úteis"*). Tirar o prazo do `return` da
  tool e deixar esses de pé resolve metade — mas são conteúdo editável do
  operador, não código.
- **Repontar a aresta `saida` do `menu_cliente`** (P0 do brain: "internet caiu"
  devolve boleto) — é dado de fluxo no banco de produção, não código, e mexer
  no grafo ativo sem o operador presente é risco desnecessário. Fica no
  relatório.
