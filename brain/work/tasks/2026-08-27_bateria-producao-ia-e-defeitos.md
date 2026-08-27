---
title: Bateria de produção da IA — o que a suíte não pegava
type: task
created: 2026-08-27
last_updated: 2026-08-27
status: in-progress
priority: p0
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/components/knowledge-hub", "systems/maxxi/components/playbook-engine", "systems/maxxi/components/testes-de-fluxo"]
related: ["[[Knowledge Hub]]", "[[Playbook Engine]]", "[[IA e Tool Calling]]", "[[Testes de Fluxo]]", "[[Cliente 360 e Copiloto]]", "[[Integração SGP]]", "[[FASE 9 — AI Runtime V1]]"]
aliases: ["bateria 27/08", "buscar_conhecimento desligada", "protocolo inventado", "link de teste vazando ficha", "herancaIaResponde", "sessaoTeste"]
tags: [work, task, ia, knowledge, playbook, seguranca, producao]
---

# Bateria de produção da IA — o que a suíte não pegava

**2026-08-27.** Quatro commits (`09341ce`, `130a9eb`, `91da5ac`, `2363ba3`),
todos deployados e verificados por sonda. Suíte: **494 → 513 testes puros**.

Nenhum defeito desta página foi encontrado lendo código ou rodando teste. Todos
apareceram **conversando com a IA em produção** pelo link público e lendo o log
do container na VPS. É a mesma classe de defeito de [[Defeitos que só aparecem
operando]]: atravessam a fronteira entre configuração do operador, dado do
banco e código, e por isso não existe teste que os veja.

## O método, porque ele é reutilizável

O link público (`/teste/<token>`) roda o motor **de verdade** com SGP e IA
reais, em sandbox. Um driver de 20 linhas dirige a conversa por HTTP e, do
outro lado, `docker logs` no container do Coolify dá a verdade sobre o que
aconteceu. **A linha honesta é `[IA] Executando tool:`** — o que não aparece ali
não foi executado, por mais que a IA diga que executou.

O acesso é `ssh workflow-vps` (com `-o ClearAllForwardings=yes`, senão os
túneis do `~/.ssh/config` colidem). O Postgres é o container que o
`DATABASE_URL` do app aponta; `docker exec … psql` responde consultas de
leitura direto.

⚠️ **`fluxos.nos` está vazio (`{}`) no fluxo ativo — os nós moram em
`fluxos.dados->'nodes'`.** Consultar `nos` devolve nada e parece que o fluxo
não existe.

## Os quatro defeitos de código, e por que cada um existia

### 1. `cfg.tools_ativas` desligava a base de conhecimento em silêncio

A lista de tools do nó **substitui** `TOOLS_PADRAO` inteira. Os nós do fluxo em
produção foram escritos antes da FASE 7, então `buscar_conhecimento` nunca
chegou ao modelo — os 55 artigos da migration 024 estavam no banco e **nenhuma
linha os lia**. Perguntada, a IA listou as 8 tools que de fato tinha; a base não
estava entre elas.

A correção não é editar o fluxo, é a regra: **memória e base de conhecimento
não se desligam por config de nó** (`TOOLS_SEMPRE_ATIVAS`, aplicada por
`filtrarTools`), pelo mesmo motivo que os blocos do §67/§68/§75 não são config
de nó — nó esquecido não pode virar IA que inventa. `concluir_etapa_playbook`
segue condicionada ao procedimento ativo.

Prova depois do deploy: `Executando tool: buscar_conhecimento (pergunta)` numa
pergunta sobre fidelidade, e a resposta certa — a política é **esqueleto em
rascunho**, a base devolveu nada, e ela **não inventou**. A garantia da FASE 7
de que rascunho não vaza, verificada em produção.

### 2. O painel do editor mentia sobre o que ia rodar — e foi ele quem congelou a lista

Todo campo do `ia_responde` era exibido como se o nó fosse o dono. "Máx. turnos"
mostrava o default do **input** (`6`) ao lado de um perfil que diz 25, e "Tools
ativas" mostrava `IA_TOOLS_DEFAULT` em vez das tools do perfil.

O estrago não era visual: `toggleTool` grava a lista **exibida** inteira. Marcar
uma caixinha serializava o default daquele dia como override permanente. **Foi
assim que o nó ficou congelado sem `buscar_conhecimento`** — o painel não mentia
por bug, mentia por desenho.

`herancaIaResponde` (em `nodeTypes.js`, puro, com teste de contrato) espelha a
precedência do motor e devolve valor **e origem**. Campo em branco herda e
mostra o herdado como placeholder; `limpar()` apaga a chave para voltar a
herdar — gravar `''`/`null` seria um override de valor vazio, que é outra coisa.

### 3. A ordem de salvar dados só aparecia depois de já ter salvo

`montarFichaColetada` devolvia `''` sem dados coletados: a instrução de usar
`salvar_dado` vivia **dentro** do bloco de dados já coletados. No primeiro dado,
que é quando importa, o prompt não dizia nada. Doze turnos medidos: *"Perfeito,
já anotei"*, *"Já guardei o endereço"*, e `estado.contexto` **vazio**.

Corrigido pela metade, e está registrado como tal. Hoje ela chama a tool — **uma
vez**, no primeiro turno com dados — e depois volta a dizer que anotou sem
chamar. Pior: numa conversa a memória ficou com `cidade: Natal` enquanto o
endereço coletado era em **Macaíba**. Não é memória incompleta, é memória que
contradiz a conversa. **Persuasão de prompt não fecha isto**; a garantia seria
extrair os campos do turno fora do modelo.

### 4. O link público devolvia a ficha crua do assinante

`POST /api/chat-teste/:token` era stateless: mandava o `estado` inteiro ao
navegador e o recebia no turno seguinte. Esse blob carrega
`contexto._contratos_sgp` — nome, endereço com lat/lng, **senha do PPPoE** e
**login e senha da Central do Assinante**. O link **não pede login**. Medido com
assinante real: bastava a URL e um CPF.

Hoje o navegador carrega só um id opaco e a ficha fica em `sessaoTeste.js` (Map
em memória, TTL de 2 h igual ao do estado do fluxo, purga na escrita para o link
não virar depósito de ficha). **Cifrar o blob foi descartado**: `KV_SECRET` não
está setada neste deploy e a cripto do `kvSeguro` é oportunista — seria um no-op
silencioso, o pior tipo de correção de segurança.

## Perfil e playbook: estavam ligados o tempo todo

O operador ligou o perfil nos nós e o comportamento não mudou. **O motor não
logava nada no caminho feliz**, então *"não pegou"* e *"pegou e o modelo
ignorou"* tinham exatamente o mesmo sintoma. Silêncio não é evidência.

A linha nova responde de uma vez:

```
nó=n_1774212197671 perfil=suporte   playbook=suporte_sem_conexao 0/9  tools=15               max_turnos=12
nó=ia_comercial    perfil=comercial playbook=comercial_venda_residencial 0/11 tools=8 (lista do nó) max_turnos=25
```

Estava tudo funcionando. O que enganava era o `0/N`:

- ⚠️ **No sandbox o playbook NUNCA marca etapa.** `prepararParaIA` devolve
  `exec: null` de propósito, então o bloco entra no prompt com as etapas todas
  desmarcadas e nada é gravado. **O link de teste não serve para validar
  rastreamento de procedimento** — só conversa real, onde o `conversaId` é uuid
  e `obterExecucao` roda.
- **`(lista do nó)` no campo `tools` denuncia override congelado.** No nó
  comercial ele filtra `concluir_etapa_playbook`, então as 4 etapas
  conversacionais do playbook de venda **nunca serão marcadas, nem em
  produção**, até alguém clicar `↩ herdar`.
- A IA **não segue a ordem** das etapas (pulou "verificar manutenção" e
  "consultar RADIUS" e foi direto para "religar o equipamento"). O bloco está no
  prompt; a aderência é do modelo, e é o que a Quality AI existe para auditar.

## Aberto — a fila de amanhã

### P0 — o protocolo que a IA inventa

Com LOS vermelho ela respondeu *"Chamado aberto! Protocolo: **25438-LOS-001**"*.
Em sandbox `criar_chamado` devolve `🧪 [sandbox] … foi simulada`, **sem
protocolo**: o número é o contrato com um sufixo fabricado. §68 lista
*protocolo* nominalmente e ela inventou mesmo assim. Em produção a tool devolve
o número real — o que isto prova é a **borda**: quando a tool não dá protocolo
(SGP fora, timeout, disjuntor aberto), ela preenche o buraco.

Duas dívidas na mesma linha, `iaTools.js:327`:

```js
const protocolo = r?.protocolo || r?.id || r?.ocorrencia_id || JSON.stringify(r);
return `✅ Chamado aberto com sucesso! Protocolo: *${protocolo}*. O técnico entrará em contato em até 24h úteis.`;
```

- **`|| JSON.stringify(r)`** é a versão de produção do mesmo buraco: formato
  inesperado do SGP vira um dump de JSON no lugar do protocolo do cliente.
- **"24h úteis" está cravado em código.** Não é alucinação — é a IA repetindo o
  texto da tool, inclusive generalizando para o comercial, onde não vale. É um
  SLA de operação morando no lugar errado; a casa dele é a base de conhecimento
  (`politica-de-instalacao`, hoje em rascunho).

Encaminhamento proposto: sandbox devolver `SANDBOX-SEM-PROTOCOLO` explícito;
§68 ganhar *"nunca informe protocolo que não veio de uma ferramenta nesta
conversa"*; o retorno gravar o protocolo do SGP na conversa (hoje **nada liga**
`conversas.protocolo` ao chamado aberto); e o `|| JSON.stringify(r)` virar
falha honesta. O protocolo de **atendimento** já é sólido (`protocolo_seq`,
atômico) — o que falta é o **elo** e a proibição.

### P0 — "minha internet caiu" devolve um boleto

```
Executando nó: enviar_lista (id=menu_cliente)
Resultado nó enviar_lista: tipo=avancar saida=saida
Próximo nó: gerar_boleto
```

Não é o fallback de primeira aresta: a porta `saida` do `menu_cliente` **está
cabeada no `gerar_boleto`**. Contrato **ativo**, cliente digita a frase mais
comum do suporte de ISP, recebe uma fatura. É dado de fluxo — repontar a aresta.

O `verificar_status` **não** entra nisto e é bom desenho: cliente em velocidade
reduzida já recebe *"Seu contrato tem pendências financeiras"* antes do menu,
justamente porque ele pode achar que é problema técnico quando é boleto.

### P1

- **A IA de suporte não consulta a base.** Artigo `o-que-significa-los-vermelho`
  publicado, nenhum `buscar_conhecimento` no log. Ela acertou de cabeça.
- **Cliente com velocidade reduzida recebe diagnóstico técnico.** O contexto tem
  `status: reduzido` e ela foi diagnosticar lentidão. É a etapa 2 do
  `suporte_sem_conexao` ("verificar situação do contrato") — o melhor argumento
  concreto para o playbook.
- **Marca do provedor de inspiração chegando ao cliente:** o boleto sai com
  *"2ª Via de Boleto — CITmax"* e o encerramento comercial manda
  `https://cit.net.br/app`. Nenhum dos dois está no código — é texto dos nós.
- **Pergunta fora do script vira transferência silenciosa**, reprodutível.
- **`ia_menu_ativo` continua inerte**: o autor do fluxo já pediu que uma IA
  interpretasse o off-menu, e o campo não faz nada.

## O que funciona, medido

`verificar_conexao`, `consultar_onu_acs`, `consultar_manutencao`,
`criar_chamado`, `historico_ocorrencias`, `listar_planos_ativos`,
`precadastrar_cliente` (12 campos), `buscar_conhecimento`,
`transferir_para_humano`, `encerrar_atendimento` — todos contra o SGP real.
`verificar_status` com as três saídas. Guardrails do §75 recusando abrir ONU,
mexer em fibra e subir em poste, **inclusive com o cliente insistindo**. E,
quando a ONU não respondeu, *"não consegui ler o sinal do equipamento agora"* em
vez de "o sinal está bom" — a distinção entre **não sei** e **não tem**,
funcionando. **334 linhas de log, zero erro.**

## De quebra

O `GET /api/dashboard/kpis` estava **quebrado em produção** (`42P18`): o knex
conta `?` como placeholder **dentro de comentário SQL**, e um comentário
terminava em *"nesta conversa?"*. Segunda vez que essa armadilha morde, então
ficou a guarda estática `tests/sql-comentario-interrogacao.test.js`, que varre
`src/` inteiro.
