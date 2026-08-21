# Memória estruturada da IA — Design

- **Data:** 2026-07-01
- **Branch:** `worktree-ambiente-testes-fluxo`
- **Componente:** `ia_responde` (motor de fluxo) + `iaTools.js` + `fluxoHelpers.js`
- **Pauta de origem:** `brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md` (item 1 — Memória/janela da IA)

## Problema

O nó `ia_responde` guarda o histórico da conversa por nó (`_ia_hist_<id>`) como um **sliding window** (`.slice(-50)` em [motorFluxo.js:731](../../../apps/api/src/services/motorFluxo.js#L731)). Os dados que a IA coleta (nome, CPF, cidade, plano, vencimento…) vivem **apenas como texto no histórico cru**, sem estrutura. Numa conversa longa (ex.: pré-cadastro comercial), os dados coletados no começo saem da janela e **a IA re-pergunta** algo que o cliente já informou.

Além disso, existe um segundo limite que quebra cadastros longos independentemente da janela: `maxTurnos` (default 6 em [motorFluxo.js:593](../../../apps/api/src/services/motorFluxo.js#L593)) conta **quantas mensagens do cliente** o nó atende antes de desviar para a porta `max_turnos`. Um pré-cadastro PF completo tem 8-12 idas e voltas — mais que 6 —, então o nó abandona o cadastro no meio.

## Objetivo (dor #1)

**A IA nunca pode re-perguntar um dado que já coletou.** Robustez do dado coletado durante uma conversa viva é a prioridade única deste trabalho.

## Não-objetivos (fora de escopo — tarefas separadas)

- **Persistir estado no restart.** O estado (`estadosExecucao`) continua sendo um `Map` em memória; a ficha morre no redeploy do Coolify. Isso resolve a durabilidade, não a dor escolhida.
- **Sumário/compactação do histórico** e **prompt caching da Anthropic.** São otimizações de **custo de tokens**, não de esquecimento.

## Abordagem escolhida

**Extração estruturada tratada como variável de fluxo.** Conforme a IA coleta um dado, ela o salva via tool como uma **variável normal do motor** (`ctx.estado.contexto[nome] = valor`, igual `definir_variavel` / `aguardar_resposta` já fazem). Todo turno, as variáveis coletadas são **reinjetadas no system prompt** com a regra "nunca re-pergunte o que já está aqui". Mesmo que o histórico cru deslize, os fatos persistem em estrutura e voltam sempre ao prompt. Bônus: como vira variável de fluxo, o dado fica usável em `{{campo}}`, condições e nós seguintes.

Abordagens descartadas (registro): extração automática por chamada LLM extra a cada turno (mais robusta, mas +1 chamada/turno de custo e latência); janela maior/ilimitada (não resolve, só adia + custo).

## Componentes

### 1. Tool `salvar_dado` (em `iaTools.js` → `IA_TOOLS`)

- **Formato batch (D1):** aceita vários campos de uma vez.
  ```jsonc
  {
    "name": "salvar_dado",
    "description": "Salva dados que o cliente informou, como variáveis persistentes da conversa. Sempre que o cliente fornecer um dado (nome, cpf, data de nascimento, email, celular, endereço/logradouro, numero, bairro, cidade, cep, plano, vencimento, etc.), salve TODOS os dados novos desta mensagem numa única chamada. NUNCA pergunte de novo um dado que já foi salvo. Use nomes de campo curtos e sem acento (ex.: cidade, plano, data_nasc).",
    "input_schema": {
      "type": "object",
      "properties": {
        "dados": {
          "type": "object",
          "description": "Mapa campo→valor. Ex.: {\"cidade\":\"Natal\",\"plano\":\"450M\",\"vencimento\":\"10\"}",
          "additionalProperties": { "type": "string" }
        }
      },
      "required": ["dados"]
    }
  }
  ```
- **Nomes de campo livres (D2):** a IA escolhe o nome; a descrição sugere os campos do cadastro. Reusável para suporte também.
- **Não é tool de escrita no mundo real:** escreve só estado de fluxo em memória → **não** entra em `TOOLS_ESCRITA` e **roda real inclusive no sandbox** (a memória precisa funcionar no teste de fluxo).

### 2. Execução especial no motor (`processarIAResponde`)

`executarTool(name, input, ctx)` só recebe `{cliente, conversa, sandbox}` — **não enxerga `ctx.estado.contexto`**. Logo, `salvar_dado` é tratada **no motor**, no mesmo laço `for (const tu of toolUses)` onde ele já inspeciona os sentinelas `__TRANSFERIR__` / `__ENCERRAR__` ([motorFluxo.js:684-706](../../../apps/api/src/services/motorFluxo.js#L684)):

- Se `tu.name === 'salvar_dado'`: para cada par de `tu.input.dados`, normaliza a chave para ASCII (peça 5) e grava `ctx.estado.contexto[chaveNormalizada] = String(valor)`. **Não** chama `executarTool`.
- Devolve um `tool_result` de confirmação: `"✓ Salvei: cidade=Natal, plano=450M"`.
- As variáveis **persistem** como estado de fluxo (não são limpas quando o nó vai para `resolvido`/`transferir`/`max_turnos` — só `_ia_hist_*` e `_ia_turnos_*` continuam sendo limpos, pois são a memória de trabalho do nó).

### 3. Injeção da ficha no system prompt, todo turno

- Novo helper puro **`montarFichaColetada(contexto)`** em `fluxoHelpers.js`: itera `contexto`, inclui entradas onde o valor é **escalar** (string/number), **não-vazio**, e a chave **não começa com `_`** (exclui `_ia_hist_*`/`_ia_turnos_*`) — objetos como `cliente`/`boleto`/`planos` já são filtrados por não serem escalares. Retorna um bloco formatado ou `''` se não houver nada.
  ```
  ## DADOS JÁ COLETADOS (memória — NUNCA re-pergunte)
  cidade: Natal
  plano: 450M
  vencimento: 10
  ```
- **`montarSystemPrompt`** ([fluxoHelpers.js:36](../../../apps/api/src/services/fluxoHelpers.js#L36)) ganha um parâmetro `ficha` e injeta esse bloco (entre os dados do cliente e as regras de tool), com a instrução: "Estes dados já foram coletados. NUNCA pergunte de novo. Se precisar de um dado que não está aqui, pergunte — e salve com `salvar_dado`."
- `processarIAResponde` chama `montarFichaColetada(ctx.estado.contexto)` e passa em `montarSystemPrompt({ ..., ficha })`.

### 4. `salvar_dado` sempre ligada

Force-include no array `tools` **independente de `cfg.tools_ativas`**, para nenhum nó desligar a memória por acidente:
```js
const tools = IA_TOOLS.filter(t => toolsAtivas.includes(t.name) || t.name === 'salvar_dado');
```
Opcional (baixa prioridade, só visibilidade): adicionar `salvar_dado` ao catálogo de tools do editor (lista de `tools_ativas` em `FluxoEditor.jsx`/`nodeTypes.js`).

### 5. Lógica pura + testes primeiro (TDD)

Toda a lógica testável vai para `fluxoHelpers.js` (convenção do projeto — `motorFluxo.js` puxa Knex e não é importável em teste), com testes `node --test` escritos **antes**:
- **`normalizarNomeCampo(nome)`** — lowercase, remove acentos (NFD + strip diacríticos), troca não-`\w` por `_`, colapsa repetições, tira `_` das bordas. Garante que `{{campo}}` (regex `\w+` em `interpolar`) resolva downstream (D3).
- **`montarFichaColetada(contexto)`** — filtro descrito na peça 3.
- **`montarSystemPrompt`** — passa a incluir o bloco da ficha quando `ficha` é fornecida.

### 6. `max_turns` do nó de cadastro comercial

O nó `ia_responde` do **fluxo comercial** deve ter `max_turns` elevado (recomendado **~25**) para caber um cadastro completo + reperguntas, mantendo o cap só como rede de segurança anti-loop. É **config do nó** (editor / fluxo salvo no banco ou seed), não código. Justificativa: a memória estruturada é o que torna um `max_turns` alto **seguro** — sem ela, mais turnos = mais esquecimento; com ela, o dado é durável. O default global (6) permanece — nós de suporte são curtos.

## Fluxo de dados (exemplo end-to-end)

1. Cliente: "moro em Natal e quero o de 450 mega".
2. Claude chama `salvar_dado({dados:{cidade:"Natal", plano:"450M"}})`.
3. Motor normaliza chaves, grava `contexto.cidade="Natal"`, `contexto.plano="450M"`, devolve `"✓ Salvei: cidade=Natal, plano=450M"`.
4. Próximo turno: `montarFichaColetada` produz o bloco `## DADOS JÁ COLETADOS` com cidade/plano; `montarSystemPrompt` injeta no system.
5. A IA vê os dados já coletados e **não re-pergunta**; `{{cidade}}` já funciona em nós seguintes.
6. Após ~10 mensagens coletando o resto, com `max_turns=25` o nó não estoura turno e chega ao `precadastrar_cliente` com tudo em mãos.

## Decisões

| # | Decisão | Escolha |
|---|---|---|
| D1 | Formato da tool | **Batch** — `salvar_dado({dados:{...}})`, vários campos por chamada (economiza voltas do loop agêntico, cap de 5 por mensagem). |
| D2 | Nomes de campo | **Livres** — a IA nomeia, com sugestões na descrição. |
| D3 | Normalização | **Sim** — slug ASCII no nome do campo ao salvar. |
| — | `max_turns` comercial | **~25** no nó de cadastro. |

## Riscos / gotchas

- **Regex de interpolação `{{\w+}}`** não casa acento → nomes normalizados (D3) evitam variável inalcançável downstream.
- **Dependência da disciplina do modelo (Haiku):** a IA precisa lembrar de chamar `salvar_dado`. Mitigação: descrição imperativa da tool + regra reforçada no bloco da ficha + a tool sempre ligada. (Extração automática determinística ficou como não-objetivo por custo; reavaliar se o esquecimento persistir em teste.)
- **Ficha morre no restart** (estado em memória) — aceito neste escopo; ver não-objetivos.
- **Colisão de nomes:** a IA pode salvar um campo com nome que colida com variável existente do fluxo. Aceito — comportamento de variável é sobrescrever; nomes livres são responsabilidade do prompt.

## Critérios de aceite / testes

- **Unitários (`fluxoHelpers.test.js`, escritos primeiro):**
  - `normalizarNomeCampo`: `'endereço'→'endereco'`, `'Data Nasc'→'data_nasc'`, `'cidade'→'cidade'`.
  - `montarFichaColetada`: dado um contexto com escalares flat + objetos (`cliente`) + `_ia_*`, retorna bloco só com os escalares não-internos; `''` quando não há nenhum.
  - `montarSystemPrompt`: inclui o bloco da ficha quando `ficha` é passada; inalterado quando não.
- **Validação de integração (deferida — precisa Docker/IA, conforme CLAUDE.md):** simular um cadastro de 10+ mensagens no simulador de fluxo (`motorSimulador`) e verificar que a IA (a) não re-pergunta um campo já salvo e (b) não estoura `max_turnos` com `max_turns=25`.

## Arquivos afetados

- `apps/api/src/services/fluxoHelpers.js` — `normalizarNomeCampo`, `montarFichaColetada`, `montarSystemPrompt` (estende).
- `apps/api/src/services/fluxoHelpers.test.js` — testes das três funções puras.
- `apps/api/src/services/iaTools.js` — adiciona `salvar_dado` a `IA_TOOLS`.
- `apps/api/src/services/motorFluxo.js` — `processarIAResponde`: intercepta `salvar_dado`, force-include no array `tools`, passa `ficha` a `montarSystemPrompt`.
- (opcional) `apps/web/src/lib/nodeTypes.js` / `FluxoEditor.jsx` — visibilidade de `salvar_dado` no catálogo de tools.
- Fluxo comercial (seed/DB via editor) — `max_turns ≈ 25` no nó de cadastro.
