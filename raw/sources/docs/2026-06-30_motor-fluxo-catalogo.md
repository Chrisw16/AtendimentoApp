# Motor de Fluxo — Arquitetura e Catálogo de Nós

Como o GoCHAT monta e executa fluxos de atendimento conversacional, e o que cada nó faz. Serve como **referência de arquitetura** para replicar o mecanismo num sistema novo.

- **Editor visual:** [`apps/web/src/pages/FluxoEditor.jsx`](../apps/web/src/pages/FluxoEditor.jsx) (+ `components/fluxo/FlowNode.jsx`, `PropsPanel.jsx`)
- **Catálogo de nós:** [`apps/web/src/lib/nodeTypes.js`](../apps/web/src/lib/nodeTypes.js)
- **Motor (execução):** [`apps/api/src/services/motorFluxo.js`](../apps/api/src/services/motorFluxo.js) — 1027 linhas
- **Nós SGP em detalhe:** ver [`nos-sgp.md`](nos-sgp.md) · **Tools da IA:** ver `iaTools.js`

---

# Parte 1 — Como o fluxo funciona

## 1.1 Visão geral da arquitetura

```
┌─────────────┐   salva JSON    ┌──────────────┐   lê fluxo ativo   ┌──────────────┐
│ Editor React │ ──────────────▶ │  fluxos.dados │ ◀───────────────── │  motorFluxo  │
│  (@xyflow)   │    (nodes+edges)│   (Postgres)  │                    │  (backend)   │
└─────────────┘                 └──────────────┘                    └──────┬───────┘
                                                                            │ executa nó a nó
                                                          ┌─────────────────┼─────────────────┐
                                                          ▼                 ▼                 ▼
                                                      integrations.js   iaTools.js      telegram/evolution
                                                        (SGP/ERP)       (tools IA)        (envio)
```

1. O **editor** desenha o fluxo (nós + conexões) e salva como **JSON** na coluna `fluxos.dados`.
2. Quando chega mensagem de um cliente, o webhook chama **`processarConversa(conversa, mensagem)`**.
3. O motor carrega o **fluxo ativo** (`fluxos.ativo = true`), encontra onde a conversa parou, e **executa os nós em sequência** até precisar aguardar resposta do cliente, encerrar, ou transferir.

## 1.2 Estrutura de dados de um fluxo

`parseDados(fluxo)` ([motorFluxo.js:929](../apps/api/src/services/motorFluxo.js#L929)) normaliza o JSON. Formato:

```jsonc
{
  "nodes": [
    {
      "id": "n1",
      "tipo": "enviar_texto",        // também aceita n.type ou n.data.tipo
      "config": { "texto": "Olá!" }, // também aceita n.data.config
      "x": 100, "y": 200            // posição no canvas (só pro editor)
    }
  ],
  "edges": [
    { "from": "n1", "to": "n2", "port": "saida" }   // formato do editor
    // legado também aceito: { "source": "n1", "target": "n2", "sourceHandle": "saida" }
  ]
}
```

- **`tipo`** define o comportamento (ver catálogo).
- **`config`** (`cfg`) são os campos editáveis no painel de propriedades — específicos por tipo.
- **`edges`** ligam a **porta de saída** de um nó (`port`) ao próximo nó. Suporta **dois formatos** (editor `{from,to,port}` e legado `{source,target,sourceHandle}`) — `encontrarProximo` normaliza ambos.

## 1.3 Modelo de execução — máquina de estados por conversa

Cada conversa tem um **estado em memória** ([`estadosExecucao` Map](../apps/api/src/services/motorFluxo.js#L23)):

```js
estado = {
  noAtual:    'n5',          // onde a conversa está parada
  contexto:   { cliente:{}, /* variáveis, dados de boleto, histórico IA… */ },
  historico:  [],
  aguardando: 'n5' | null,   // se != null, o nó está esperando a próxima msg do cliente
}
```

> ⚠️ **Estado é em memória (Map).** Reinício do processo perde o ponto onde cada conversa estava. Para produção robusta, **persista o estado** (banco/Redis) por `conversa_id`. Esta é a primeira coisa a melhorar ao replicar.

### O laço principal (`processarConversa`, [linha 26](../apps/api/src/services/motorFluxo.js#L26))

1. Carrega fluxo ativo. Sem fluxo / sem nós → cai para **IA direta** (`processarIADireta`).
2. Recupera (ou cria) o estado da conversa. Sem `noAtual` → começa pelo nó `inicio` ou `gatilho_keyword`.
3. **Loop de até 15 iterações** (trava anti-loop-infinito), executando `processarNo(no, ctx)`. Cada nó retorna um de três resultados:

| Resultado | Helper | O que o motor faz |
|---|---|---|
| `{ tipo:'avancar', saida }` | `avancar('porta')` | Acha o próximo nó pela porta (`encontrarProximo`) e continua o loop. Sem aresta → fim do fluxo. |
| `{ tipo:'aguardar_input' }` | `aguardar()` | **Salva o estado e para** — espera a próxima mensagem do cliente. |
| `{ tipo:'fim' }` | `fim()` | Limpa o estado e encerra. |

4. Ao final, envia todas as `ctx.respostas` acumuladas (`enviarResposta`).

### `encontrarProximo(noId, saida, edges)` ([linha 954](../apps/api/src/services/motorFluxo.js#L954))
Acha a aresta que sai do nó pela porta certa. Ordem de tentativa: porta exata → porta `saida` → qualquer aresta do nó (fallback). Retorna o `id` do próximo nó ou `null`.

## 1.4 O padrão "enviar e aguardar" (nós interativos em 2 fases)

Nós que pedem algo ao cliente (botões, lista, aguardar_resposta, NPS, solicitar_localizacao, consultar_cliente) usam **a mesma função em duas passagens**, controladas por `ctx.estado.aguardando === no.id`:

```js
case 'aguardar_resposta': {
  if (ctx.estado.aguardando === no.id) {     // 2ª passagem: já temos a resposta
    ctx.estado.aguardando = null;
    ctx.estado.contexto[cfg.variavel] = ctx.mensagem.texto;
    return avancar('saida');
  }
  // 1ª passagem: pergunta e marca que está aguardando
  ctx.respostas.push({ tipo:'texto', texto: cfg.mensagem });
  ctx.estado.aguardando = no.id;
  return aguardar();
}
```

Esse é o **coração da interatividade**: o mesmo nó é reexecutado quando o cliente responde, e o `aguardando` decide se é "perguntar" ou "processar a resposta".

## 1.5 Contexto e variáveis (interpolação)

Textos dos nós aceitam **placeholders** resolvidos por `interpolar(texto, ctx)` ([linha 964](../apps/api/src/services/motorFluxo.js#L964)):

| Placeholder | Origem |
|---|---|
| `{{cliente.nome}}`, `{{cliente.contrato}}`… | `contexto.cliente` (preenchido por `consultar_cliente`) |
| `{{boleto.valor}}`, `{{boleto.pix}}`… | `contexto.boleto` |
| `{{chamado.protocolo}}` | `contexto.chamado` |
| `{{promessa.data}}`, `{{promessa.dias}}` | `contexto.promessa` |
| `{{planos.lista}}` | `contexto.planos` |
| `{{qualquer_variavel}}` | `contexto[var]` ou campo da conversa |

`getCtxVal(ctx, 'cliente.status')` lê valores aninhados do contexto (usado em condições e nós SGP).

## 1.6 Saída multicanal (`enviarResposta`, [linha 838](../apps/api/src/services/motorFluxo.js#L838))

As respostas são **agnósticas de canal** (`{ tipo, texto, botoes, url… }`) e traduzidas na saída:

- **Telegram:** texto, botões inline, imagem. **Lista vira botões** (≤8 itens) ou texto numerado (Telegram não tem lista nativa).
- **WhatsApp (Evolution API):** texto, CTA, botões, lista, imagem, áudio, arquivo.
- Toda resposta também é **persistida** em `mensagens` e transmitida via SSE (`broadcast`) para o painel ao vivo.

## 1.7 Fallback sem fluxo: IA direta

Se não há fluxo ativo (ou ele está vazio), `processarIADireta` ([linha 806](../apps/api/src/services/motorFluxo.js#L806)) responde direto com o Claude usando o prompt `outros` + histórico recente da conversa. É a rede de segurança do sistema.

---

# Parte 2 — Catálogo de nós

7 grupos (cores em [`nodeTypes.js`](../apps/web/src/lib/nodeTypes.js)). Para cada nó: **o que faz**, **portas** de saída, principais campos de **`config`**, e o que lê/grava no **contexto**.

## 2.1 Gatilho 🟢

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `inicio` | Ponto de entrada (1 por fluxo, `unico:true`). **Reseta o contexto** (`cliente:{}`). | `saida` | — |
| `gatilho_keyword` | Dispara quando o cliente digita uma palavra específica. | `saida` | `palavra` |

## 2.2 Mensagens 🔵

| Nó | O que faz | Portas | Config principal |
|---|---|---|---|
| `enviar_texto` | Envia texto (com interpolação). | `saida` | `texto` |
| `enviar_cta` | Texto + botão que abre URL. | `saida` | `corpo`, `label`, `url` |
| `enviar_imagem` | Envia imagem com legenda. | `saida` | `url`, `legenda` |
| `enviar_audio` | Envia áudio. | `saida` | `url` |
| `enviar_arquivo` | Envia documento. | `saida` | `url`, `filename` |
| `enviar_localizacao` | Envia um ponto no mapa. | `saida` | `nome`, `address`, `lat`, `lng` |
| `enviar_botoes` | Botões de resposta rápida. **Portas dinâmicas** (1 por botão). | dinâmico | `corpo`, `botoes[]`, `ia_menu_ativo` |
| `enviar_lista` | Lista de opções. **Portas dinâmicas** (1 por item). | dinâmico | `corpo`, `label_botao`, `titulo_secao`, `itens[]` |
| `solicitar_localizacao` | Pede o GPS do cliente e salva em variável. | `localizacao_recebida` · `sem_localizacao` · `erro` | `mensagem`, `variavel` |

**Botões/lista** usam o padrão "enviar e aguardar": na resposta, casam o texto digitado (ou número) com o botão/item e avançam pela **porta correspondente ao `id`** do botão/item. `enviar_lista` também aceita o **número** digitado (1, 2, 3…). `itens` é normalizado caso venha como string JSON.

## 2.3 Lógica 🟡

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `aguardar_resposta` | Aguarda a próxima msg e salva em variável. | `saida` | `mensagem`, `variavel` (default `resposta`) |
| `condicao` | Bifurca por uma condição sobre uma variável. | `sim` · `nao` | `variavel`, `operador`, `valor` |
| `condicao_multipla` | Cascata de condições; primeira que casar vence. | dinâmico (`ramo.porta`) + `default` | `ramos[]` `{variavel, operador, valor, porta}` |
| `definir_variavel` | Define/atualiza uma variável (com interpolação). | `saida` | `variavel`, `valor` |
| `divisao_ab` | Split de tráfego por percentual (teste A/B). | `a` · `b` | `pct_a` (default 50) |
| `aguardar_tempo` | Pausa por N segundos. ⚠️ **Hoje avança na hora** (simulado). | `saida` | `segundos` (default 60) |

**Operadores de `condicao`** ([`avaliarCondicao`](../apps/api/src/services/motorFluxo.js#L983)): `== != > < contem nao_contem vazio nao_vazio` (com aliases pt: `igual`, `diferente`, `maior`, `menor`).

## 2.4 SGP / ERP 🟣

Resumo (detalhes completos em [`nos-sgp.md`](nos-sgp.md)):

| Nó | O que faz | Portas | Endpoint |
|---|---|---|---|
| `consultar_cliente` | Identifica cliente por CPF; popula `contexto.cliente`. | `encontrado` · `multiplos_contratos` · `max_tentativas` | `POST /api/ura/consultacliente/` |
| `consultar_boleto` | 2ª via de boleto(s). | `encontrado` · `nao_encontrado` | `POST /api/ura/fatura2via/` |
| `verificar_status` | Bifurca pelo status do contrato (**não chama API** — lê do contexto). | `ativo`·`inativo`·`cancelado`·`suspenso`·`inviabilidade`·`novo`·`reduzido` | — |
| `abrir_chamado` | Abre ocorrência técnica. | `sucesso`·`erro`¹ | `POST /api/ura/chamado/` |
| `promessa_pagamento` | Libera acesso por promessa de pagamento. | `sucesso`·`adimplente`·`erro` | `POST /api/ura/liberacaopromessa/` |
| `listar_planos` | Lista planos da cidade → `contexto.planos.lista`. | `saida` | `POST /api/ura/planos/` |
| `consultar_historico` | Histórico de chamados → `contexto.historico.resumo`. | `saida` | `POST /api/ura/ocorrencia/list/` |

¹ `nodeTypes.js` declara porta `saida` para `abrir_chamado`, mas o motor usa `sucesso`/`erro` — inconsistência conhecida.

## 2.5 IA 🩷

### `ia_responde` — agente autônomo com tools ([linha 571](../apps/api/src/services/motorFluxo.js#L571))
A IA conversa e **executa tools** (SGP, etc.) até resolver, transferir ou estourar turnos.

- **Portas:** `resolvido` · `transferir` · `max_turnos`
- **Config:** `contexto` (slug do prompt, ex. `suporte`/`comercial`), `prompt` (instrução extra), `max_turns` (default 6), `tools_ativas[]` (quais tools liberar)
- **Mecânica:**
  - Carrega o system prompt do banco (`resolverPrompt(slug)`) + injeta dados do cliente + **regras críticas de tool** (nunca escrever nome de tool, não inventar contrato, etc.).
  - **Loop agêntico** de até 5 rodadas: chama o Claude; se `stop_reason==='tool_use'`, executa as tools (`executarTool`), devolve o resultado e continua; se `end_turn`, responde.
  - Tools retornam strings especiais `__TRANSFERIR__` / `__ENCERRAR__` que viram as portas `transferir` / `resolvido`.
  - Mantém **histórico por nó** (`_ia_hist_<id>`, últimos 20 turns) e conta **turnos** (`_ia_turnos_<id>`).
  - **Default de tools:** todas menos `precadastrar_cliente` (sensível, opt-in). Derivado de `IA_TOOLS` para ficar em sincronia com o editor.

### `ia_roteador` — classificador de intenção ([linha 739](../apps/api/src/services/motorFluxo.js#L739))
A IA lê a mensagem e **escolhe uma rota** (porta).

- **Portas:** dinâmicas (1 por rota) + `nao_entendeu` + `encerrar`
- **Config:** `mensagem` (pergunta inicial), `rotas[]` `{id, label, descricao}`
- **Mecânica:** detecta despedida por regex **antes** de chamar a IA (economiza API → `encerrar`). Senão, monta prompt pedindo resposta em **XML** `<rota>id</rota>`, valida contra os ids válidos, e avança pela porta. Usa Haiku, `max_tokens:30`.

## 2.6 Ações 🟠

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `transferir_agente` | Transfere para fila humana; checa **horário de atendimento**. | `transferido` · `fora_horario` · `sem_agente` | `msg_fora` |
| `chamada_http` | Requisição HTTP a API externa; salva resposta em variável. | `sucesso` · `erro` | `url`, `method`, `body`, `variavel` |
| `nota_interna` | Grava nota interna na conversa (não vai pro cliente). | `saida` | `nota` |
| `enviar_email` | ⚠️ **Não implementado** (só loga). | `sucesso` | `para` |
| `nps_inline` | Pergunta nota 1–10 e grava em `satisfacao`. | `promotor`(≥9) · `neutro`(≥7) · `detrator` | `pergunta` |

`transferir_agente` muda a conversa para `status:'aguardando'` e emite `broadcast`. `verificarHorario` lê `sistema_kv.horario` (dias + janela início/fim).

## 2.7 Fim 🔴

| Nó | O que faz | Portas | Config |
|---|---|---|---|
| `encerrar` | Envia msg de despedida, encerra a conversa (`conversaRepo.encerrar`), limpa estado. | — | `mensagem` |

---

# Parte 3 — Notas de implementação (para replicar)

Pontos do design que valem atenção ao construir o sistema "pra valer":

1. **Persistir o estado de execução.** Hoje é um `Map` em memória — reinício derruba conversas no meio. Use banco/Redis por `conversa_id`.
2. **`aguardar_tempo` é simulado** — avança imediatamente. Numa versão real, agende um job (fila/scheduler) e retome o fluxo depois.
3. **`enviar_email` não existe** — só loga. Integrar SMTP/serviço.
4. **ACS é stub** (`consultar_onu_acs`/`reiniciar_onu_acs`) — falta TR-069.
5. **Padrão de 2 fases (`aguardando === no.id`)** é elegante e replicável: o mesmo nó pergunta e processa. Mantenha.
6. **Edges em dois formatos** (`{from,to,port}` e `{source,target,sourceHandle}`) — `encontrarProximo` aceita ambos; padronize um só no sistema novo.
7. **Portas dinâmicas** (botões, lista, condição múltipla, roteador) exigem que o editor (React Flow) **re-meça os handles** quando as portas mudam (`useUpdateNodeInternals`) — senão o drag de conexão quebra na v12 do `@xyflow/react`.
8. **Trava de 15 iterações** no loop principal evita laço infinito entre nós — bom guarda-chuva.
9. **Respostas agnósticas de canal** (`{tipo, …}`) com tradução só na borda (`enviarResposta`) — facilita adicionar canais. Mantenha esse desacoplamento.
10. **IA com regras anti-alucinação no system prompt** + prioridade `ctx > input` no executor de tools — essencial para a IA não inventar contrato/CPF.

---

*Gerado a partir de `motorFluxo.js` (1027 linhas) + `nodeTypes.js`, branch `main` + edições locais. A branch `dev` alterou o comportamento "sem fluxo" e o break do loop agêntico — revalidar ao alinhar.*
