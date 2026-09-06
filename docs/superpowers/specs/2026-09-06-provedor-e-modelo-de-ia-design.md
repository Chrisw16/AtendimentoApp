# Provedor e modelo de IA configuráveis — design

> **Revisado em 2026-09-06 após revisão adversarial do design.** As correções
> estão marcadas com ✏️. As três maiores: a precedência não pode depender de uma
> regra mágica ("o par padrão não conta") — a **migration 031 anula o par que o
> seed gravou** e tira o default das colunas; **trocar provedor num prompt
> demorava 3 min** porque `invalidarCachePrompts()` não tinha chamador nenhum;
> e **PII do assinante vai para o provedor escolhido** — inclusive um gratuito
> cujos termos permitem treino — e isso precisa estar escrito na tela.

**2026-09-06.** Pedido do operador: escolher, em **Configurações**, qual IA o
sistema usa (Claude, ChatGPT, DeepSeek, Gemini — e modelos gratuitos como Llama
e Qwen) e qual modelo, para trocar **qualidade por preço** sem editar código.

Decisões já tomadas com o operador (2026-09-05):

- Entram **todos** os provedores citados, mais Groq e OpenRouter (é de onde
  saem Llama e Qwen, inclusive gratuitos).
- `temperatura` passa a ser **honrada** — hoje é lida e ignorada. Os valores
  gravados foram conferidos (tabela abaixo); o de `roteador` (0.10) foi
  configurado para um classificador de uma palavra e é rígido demais para o
  agente de recepção que aquele slug virou.
- **Falha honesta**: provedor fora do ar não troca de provedor em silêncio. Cai
  no caminho de erro que já existe e aparece na tela Saúde do Sistema.

## Ponto de partida medido

**Seis pontos falam com o modelo hoje**, e todos falam Anthropic:

| onde | como | o que lê da resposta |
|---|---|---|
| `motorFluxo.js:907` (`ia_responde`/recepção) | `getAnthropicClient().messages.create` | `stop_reason`, `content[]` bloco a bloco, `usage` |
| `motorFluxo.js:1304` (IA direta, sem fluxo) | idem | texto |
| `supervisoraIA.js:182` e `:224` | idem | texto |
| `copiloto.js:123`, `quality.js:184` | `llmGateway.generateTexto` | texto |

**`prompts_ia` já tem `provedor`, `modelo` e `temperatura`** desde a 005;
`resolverPrompt` devolve os três; o motor **usa só `modelo`**. `provedor` e
`temperatura` são configuração que a tela mostra e o backend não honra — a
família do `agentes.permissoes`. Em produção, todas as 8 linhas dizem
`anthropic` / `claude-haiku-4-5-20251001`, e as temperaturas são:

| slug | temperatura gravada | efetiva hoje |
|---|---|---|
| roteador | 0.10 | 1.0 (default da Anthropic) |
| suporte, financeiro | 0.20 | 1.0 |
| faq, regras, estilo | 0.30 | 1.0 |
| outros | 0.40 | 1.0 |
| comercial | 0.60 | 1.0 |

**`openai_api_key` é campo da tela que nenhuma linha lê**, e o pacote `openai`
(`^4.52.0`) está instalado e nunca foi importado.

**A telemetria de custo (FASE 12) envelopa `getAnthropicClient`**: quem sair
desse caminho sai da conta de custo — e a conta é por modelo
(`analytics_config.precos_llm`), com `null` para modelo sem preço.

## A decisão central: a língua franca é o formato da Anthropic

O laço agêntico do motor lê `res.stop_reason`, itera `res.content[]` por
`type` (`text` / `tool_use`) e monta o turno seguinte com `{role:'assistant',
content: res.content}` + `{role:'user', content:[{type:'tool_result',...}]}`.
Isso é o formato de blocos da Anthropic — e é o formato **mais rico** entre os
provedores (texto e chamadas de tool no mesmo array, na ordem).

Então **os adapters traduzem nas duas pontas e o motor não muda uma linha.**
Trocar de provedor não pode ser reescrever o laço: ele é o coração do produto,
roda em produção há semanas e acabou de ganhar o modo recepção.

## Componentes

### `services/llm/` — registry de provedores (espelha `services/canais/`)

```
services/llm/
  index.js          resolverProvedor(), gerar(): escolhe adapter + credencial, telemetria
  anthropic.js      SDK atual; passa direto, só normaliza erro
  openaiCompat.js   UM adapter para OpenAI, DeepSeek, Gemini, Groq, OpenRouter — muda a baseURL
  llmHelpers.js     PURO: tradução de tools/mensagens/resposta, catálogo, precedência, preços
```

**Um adapter OpenAI-compatível cobre cinco provedores.** DeepSeek, Gemini
(`/v1beta/openai/`), Groq e OpenRouter expõem o mesmo contrato
`chat.completions`; o que muda é `baseURL` e a chave. Cinco adapters seriam
cinco cópias da mesma tradução.

A tradução (pura, testada):

| Anthropic (interno) | OpenAI-compat |
|---|---|
| `system` | primeira mensagem `role:'system'` |
| `tools[{name,description,input_schema}]` | `tools[{type:'function',function:{name,description,parameters}}]` |
| assistant com bloco `tool_use{id,name,input}` | `tool_calls[{id,type:'function',function:{name,arguments:JSON}}]` |
| user com blocos `tool_result{tool_use_id,content}` | **um** `role:'tool'` por resultado, com `tool_call_id` |
| resposta `finish_reason:'tool_calls'` | `stop_reason:'tool_use'` |
| `finish_reason:'stop'` / `'length'` | `'end_turn'` / `'max_tokens'` |
| `usage.prompt_tokens/completion_tokens` | `usage.input_tokens/output_tokens` |

✏️ **Gemini recusa `type:'object'` com `properties:{}`** — e três tools do
produto são assim (`status_rede`, `consultar_manutencao`, `listar_vencimentos`).
A tradução omite `parameters` quando não há propriedades; a OpenAI aceita
`function` sem `parameters`.

✏️ **404 não é só "modelo não existe".** O OpenRouter devolve 404 quando o
modelo existe mas **não suporta tool calling** ("No endpoints found that support
tool use") — e nesse caso o pedido inteiro falha, não é "o laço tolera". A
mensagem do provedor entra no erro normalizado, senão "não encontrado" mentiria.

⚠️ **`arguments` chega como STRING JSON** e pode vir malformado em modelo
pequeno. `JSON.parse` falhando não pode derrubar o turno: vira `input: {}` e o
`executarTool` responde o que responderia a uma chamada sem argumentos.

### Configuração global (`sistema_kv`)

- `ia_provedor` (`anthropic` | `openai` | `deepseek` | `gemini` | `groq` | `openrouter`)
- `ia_modelo` (id do modelo naquele provedor)
- credenciais novas: `deepseek_api_key`, `gemini_api_key`, `groq_api_key`,
  `openrouter_api_key` — em **`CHAVES_SECRETAS`** (mascaradas no GET, o PUT
  ignora valor com `•`) e em `CHAVES_PUBLICAS` (editáveis). Cifradas em repouso
  quando há `KV_SECRET`, como as demais.

**Sem `ia_provedor` gravado, vale `anthropic` + `claude-haiku-4-5-20251001`** —
o deploy não muda o comportamento de ninguém.

### Precedência (espelha nó × perfil)  ✏️

```
prompts_ia.provedor/modelo (por prompt, tela Prompts IA)  →  global (Configurações)  →  padrão do código
```

✏️ **O furo que a revisão achou:** a 005 gravou `anthropic`/`claude-haiku-4-5`
em TODAS as linhas e pôs esses valores como DEFAULT das colunas. Não por
escolha do operador — porque o seed precisava de um valor. Com a precedência
acima, cada linha pareceria um override e o global **nunca seria alcançado**: a
tela de Configurações seria decorativa. A primeira implementação resolveu com
uma regra ("par igual ao padrão não conta"), que funciona e ninguém lembraria em
seis meses. A **migration 031** faz o honesto: `UPDATE ... SET provedor=NULL,
modelo=NULL WHERE` o par é exatamente o do seed, e remove o default das
colunas. **NULL = herança; valor = escolha.** `resolverPrompt` devolve o valor
cru (vazio quando vazio) em vez de preencher o padrão. A regra fica como cinto
de segurança para instalações onde a 005 rode depois, e está marcada.

`||` para string: vazio é ausência, herda. A tela Prompts IA já tem os campos;
passa a mostrar **"herdando de Configurações"** quando vazios, como o painel do
`ia_responde` faz com o perfil (`herancaIaResponde`). Um `provedor` preenchido
sem `modelo` (ou vice-versa) é configuração incoerente: **herda os dois** do
global e loga — misturar provedor de um lugar com modelo de outro é chamar a
OpenAI com `claude-haiku`.

### Catálogo de modelos (`llmHelpers.CATALOGO`)

Por provedor: `{id, nome, tool_calling: 'maduro'|'parcial'|'fraco', nota}`.
**A tela mostra a coluna `tool_calling`.** O produto depende de 18 ferramentas
e do laço agêntico; oferecer um Llama 8B gratuito sem dizer que ele erra tool
calling é oferecer um suporte que não consulta o SGP e não avisa. A escolha
qualidade × preço só é uma escolha se o preço da qualidade estiver escrito.

O campo de modelo é **texto livre com sugestões**, não `select` fechado: provedor
lança modelo novo toda semana e o operador não pode depender de deploy para
usá-lo.

### Telemetria e custo  ✏️

✏️ **Três buracos que a revisão achou, fechados:** "chave não configurada"
lançava ANTES de registrar telemetria — a tela Saúde dizia "IA ok" enquanto todo
turno caía para humano; a mensagem de erro do provedor morria no `console` — vai
para `erros_app` (dedup por assinatura) para o operador saber POR QUÊ; e
`analytics` transformava tokens NULL (provedor que não devolve `usage`) em custo
**zero** com preço configurado — "a IA é de graça". Chamadas sem tokens = custo
`null`.

✏️ `getAnthropicClient` **saiu** de `integrations.js`: virou envelope com zero
chamadores, e um cliente exportado que alguém importasse amanhã pinaria a
Anthropic fora da precedência e fora da conta de custo.

A telemetria sai do envelope de `getAnthropicClient` e vai para
**`llm/index.js:gerar()`** — o funil por onde todo provedor passa. Mesmo
registro (`tipo:'llm', nome: modelo, tokensIn/Out, ok, erro, ms`), então o
Analytics não muda.

**Preços semeados** em `analytics_config.precos_llm` para os modelos do
catálogo (USD por milhão de tokens, in/out), por migration idempotente que
**só acrescenta chaves ausentes** — o que o operador ajustou fica. Sem isso, o
dia em que ele trocar de modelo o `custo_por_resolvido` vira `null`, que é
honesto mas parece quebrado.

### Os seis pontos migram para `gerar()`

`llmGateway.generate` passa a chamar `llm.gerar()`; `copiloto` e `quality` vêm
de graça. `motorFluxo` (×2) e `supervisoraIA` (×2) trocam
`getAnthropicClient().messages.create(params)` por `gerar(params, {conversaId,
origem, sandbox})` — a resposta tem a mesma forma, então **o código que lê a
resposta não muda**. `getAnthropicClient` fica exportado (a tela de teste de
credencial pode usá-lo) mas sem chamador no caminho de atendimento.

### Sandbox

Já tratado: `gerar()` recebe `sandbox` e não grava telemetria, como hoje.

### Tela

- **Configurações → Integrações de IA**: seletor de provedor, campo de modelo
  com sugestões do catálogo (e a coluna tool calling), um campo de chave por
  provedor. Botão **"Testar"** chama `POST /api/sysconfig/ia/testar` — uma
  chamada mínima ao provedor escolhido, devolvendo ok/erro normalizado. Sem isso
  o operador só descobre chave errada quando um cliente escreve.
- **Prompts IA**: os campos `provedor`/`modelo`/`temperatura` que já existem
  ganham o placeholder "herdando" e a lista de provedores.

## Testes

- `llmHelpers.test.js` — tradução ida e volta (tools, mensagens com tool_use e
  tool_result, resposta com `tool_calls`, `arguments` malformado, finish
  reasons, usage), precedência (vazio herda; par incoerente herda os dois),
  catálogo (todo modelo tem `tool_calling` declarado), preços (todo modelo do
  catálogo tem preço).
- Contrato: `Configuracoes.jsx` e `PromptsIA.jsx` listam exatamente os
  provedores de `PROVEDORES` (mesmo padrão do teste `PERMISSOES_LABELS` ×
  `CAPACIDADES`).
- Integração: a migration de preços só acrescenta; `resolverProvedor` lê o
  global do banco e o override do prompt.

## Fora, deliberadamente

- **Adapter nativo do Gemini** (`functionDeclarations`). A via compatível cobre
  o pedido; se o tool calling dela se mostrar insuficiente, é um arquivo novo no
  registry. Teto declarado no catálogo (`parcial`).
- **Embeddings.** Continua fora (§76, FASE 7).
- **Fallback automático de provedor.** Decidido: não.
- **Trocar o modelo de uma conversa viva.** O grafo é congelado por conversa; o
  modelo não é, e passa a valer no turno seguinte. Aceito e documentado — o
  contrário exigiria gravar provedor/modelo no `flow_executions` sem ganho
  claro.
- **Streaming.** Nenhum caminho usa hoje.

## Riscos declarados

- ✏️ **PII do assinante vai para o provedor escolhido.** O system prompt carrega
  CPF, nome e contrato; a ficha coletada; e o retorno de `identificar_cliente`.
  Com um modelo gratuito do OpenRouter, isso vai para um terceiro cujos termos
  permitem uso do prompt para treino. Para um ISP sob LGPD é decisão do
  operador, não de código — e por isso está **escrito na tela**, ao lado do
  seletor, não só aqui. O link público de teste tem a mesma exposição e ainda
  gasta cota do provedor global com visitante anônimo.
- ✏️ **Modelos de raciocínio da OpenAI** (o-series, gpt-5) recusam `max_tokens`
  e `temperature ≠ 1`. Não entram nas sugestões; quem digitar o id recebe o 400
  do provedor com a mensagem dele, que já está no erro normalizado.
- ✏️ **`temperatura` do `processarIADireta` já era honrada** — a tabela "efetiva
  hoje 1.0" valia para o `ia_responde` (o laço), não para o slug `outros` sem
  fluxo ativo.

- **Tool calling não é igual entre provedores.** Modelos pequenos erram nome de
  tool, mandam `arguments` inválido ou ignoram a tool e respondem em texto. O
  laço já tolera (tool inexistente devolve texto de erro para o modelo; o motor
  segue). O que a mudança faz é deixar isso **visível na tela** antes da
  escolha, não escondê-lo.
- **`temperatura` passar a valer muda toda resposta em produção** — de 1.0
  para 0.2 no suporte e financeiro. É o que o operador escolheu; a migration de
  preços aproveita para subir `roteador` de 0.10 para 0.40 **só se ainda estiver
  em 0.10**.
