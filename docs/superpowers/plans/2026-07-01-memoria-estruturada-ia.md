# Memória estruturada da IA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a IA do `ia_responde` nunca re-perguntar um dado já coletado, salvando cada dado como variável de fluxo (tool `salvar_dado`) e reinjetando a "ficha" no system prompt a cada turno.

**Architecture:** Extração estruturada tratada como variável de fluxo. A IA chama uma tool `salvar_dado({dados:{...}})` (batch); o motor grava cada par em `ctx.estado.contexto[chaveNormalizada]` (como `definir_variavel` já faz) e devolve confirmação. A cada turno, um helper puro monta o bloco `## DADOS JÁ COLETADOS` a partir do contexto e o `montarSystemPrompt` injeta no system. A lógica testável vive em `fluxoHelpers.js` (TDD); o wiring no `motorFluxo.js`/`iaTools.js` é verificado por `node --check` + suíte existente.

**Tech Stack:** Node 20 + ESM, runner nativo `node --test` (zero deps), Anthropic `@anthropic-ai/sdk` (modelo `claude-haiku-4-5-20251001`).

**Spec:** `docs/superpowers/specs/2026-07-01-memoria-estruturada-ia-design.md`

## Global Constraints

- **Branch de trabalho:** `worktree-ambiente-testes-fluxo` (worktree em `.claude/worktrees/ambiente-testes-fluxo`). Todos os caminhos abaixo são relativos à raiz da worktree.
- **Testes:** `cd apps/api && npm test` (runner `node --test`). Rodar da pasta `apps/api`.
- **Lógica testável só em módulos puros:** `motorFluxo.js` e `iaTools.js` **não são importáveis em teste** (puxam `config/db.js` → Knex, sem deps locais). Toda lógica com teste vai em `fluxoHelpers.js`; edições nesses dois arquivos são verificadas por `node --check <arquivo>`.
- **Convenção editor↔motor:** nomes de campo salvos pela IA são normalizados para ASCII (`\w`), porque a interpolação `{{campo}}` usa regex `\w+`.
- **`salvar_dado` NÃO grava no mundo real** (só estado de fluxo em memória) → não entra em `TOOLS_ESCRITA` e roda igual em sandbox e produção.
- **Disciplina:** DRY, YAGNI, TDD, commits frequentes (um por task).

---

## File Structure

- `apps/api/src/services/fluxoHelpers.js` — **(modificar)** adiciona `normalizarNomeCampo`, `montarFichaColetada`; estende `montarSystemPrompt`.
- `apps/api/src/services/fluxoHelpers.test.js` — **(modificar)** testes das três funções puras.
- `apps/api/src/services/iaTools.js` — **(modificar)** adiciona a tool `salvar_dado` a `IA_TOOLS`.
- `apps/api/src/services/motorFluxo.js` — **(modificar)** `processarIAResponde`: importa helpers, calcula `ficha`, passa a `montarSystemPrompt`, force-include a tool, intercepta `salvar_dado` no loop.
- Fluxo comercial (dado no banco, via editor) — **(config)** `max_turns ≈ 25` no nó `ia_responde` de cadastro. Sem arquivo no repo.

---

### Task 1: `normalizarNomeCampo` (helper puro)

**Files:**
- Modify: `apps/api/src/services/fluxoHelpers.js`
- Test: `apps/api/src/services/fluxoHelpers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `normalizarNomeCampo(nome: string) => string` — slug ASCII (lowercase, sem acento, não-alfanumérico→`_`, sem `_` nas bordas). Usada pela Task 5.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `apps/api/src/services/fluxoHelpers.test.js`, e incluir `normalizarNomeCampo` no import da linha 3 (fica `import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, normalizarNomeCampo } from './fluxoHelpers.js';`):

```js
// ── normalizarNomeCampo ─────────────────────────────────────────
test('normalizarNomeCampo remove acentos e minusculiza', () => {
  assert.equal(normalizarNomeCampo('Endereço'), 'endereco');
});

test('normalizarNomeCampo troca espaços por _', () => {
  assert.equal(normalizarNomeCampo('Data Nasc'), 'data_nasc');
});

test('normalizarNomeCampo mantém nome já simples', () => {
  assert.equal(normalizarNomeCampo('cidade'), 'cidade');
});

test('normalizarNomeCampo colapsa não-alfanuméricos e apara as bordas', () => {
  assert.equal(normalizarNomeCampo('CPF/CNPJ '), 'cpf_cnpj');
});

test('normalizarNomeCampo devolve string vazia para entrada vazia', () => {
  assert.equal(normalizarNomeCampo(''), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test`
Expected: FAIL — `normalizarNomeCampo is not a function` (ou `undefined`).

- [ ] **Step 3: Write minimal implementation**

Adicionar a `apps/api/src/services/fluxoHelpers.js` (ao final do arquivo):

```js
// salvar_dado: normaliza o nome do campo salvo pela IA para um slug ASCII,
// porque a interpolação {{campo}} usa regex \w+ (não casa acento/espaço).
export function normalizarNomeCampo(nome) {
  return String(nome || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')    // remove acentos decompostos pelo NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')       // não-alfanumérico → _
    .replace(/^_+|_+$/g, '');          // apara _ das bordas
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test`
Expected: PASS (todos, incluindo os 5 novos).

- [ ] **Step 5: Commit**

```bash
git -C "$(git rev-parse --show-toplevel)" add apps/api/src/services/fluxoHelpers.js apps/api/src/services/fluxoHelpers.test.js
git commit -m "feat(motor): normalizarNomeCampo para slug ASCII de variáveis da IA"
```

---

### Task 2: `montarFichaColetada` (helper puro)

**Files:**
- Modify: `apps/api/src/services/fluxoHelpers.js`
- Test: `apps/api/src/services/fluxoHelpers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `montarFichaColetada(contexto: object) => string` — bloco `## DADOS JÁ COLETADOS …` com as variáveis flat escalares (exclui chaves `_*` e valores não-escalares/vazios); `''` quando não há nenhuma. Usada pela Task 5.

- [ ] **Step 1: Write the failing test**

Incluir `montarFichaColetada` no import da linha 3 do teste. Adicionar ao final de `apps/api/src/services/fluxoHelpers.test.js`:

```js
// ── montarFichaColetada ─────────────────────────────────────────
test('montarFichaColetada lista escalares flat e ignora objetos/internos/vazios', () => {
  const bloco = montarFichaColetada({
    cidade: 'Natal',
    plano: '450M',
    cliente: { nome: 'Fulano' },   // objeto → ignora
    _ia_turnos_n1: 3,              // interno → ignora
    _ia_hist_n1: [],              // interno → ignora
    obs: '',                      // vazio → ignora
  });
  assert.match(bloco, /cidade: Natal/);
  assert.match(bloco, /plano: 450M/);
  assert.match(bloco, /NUNCA/);
  assert.doesNotMatch(bloco, /Fulano/);
  assert.doesNotMatch(bloco, /_ia_turnos/);
  assert.doesNotMatch(bloco, /obs:/);
});

test('montarFichaColetada devolve string vazia quando não há dados coletados', () => {
  assert.equal(montarFichaColetada({ cliente: {}, _ia_hist_n1: [] }), '');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test`
Expected: FAIL — `montarFichaColetada is not a function`.

- [ ] **Step 3: Write minimal implementation**

Adicionar a `apps/api/src/services/fluxoHelpers.js`:

```js
// Monta o bloco de "memória" injetado no system prompt do ia_responde a cada turno.
// Inclui só variáveis flat escalares (não-vazias) do contexto; ignora chaves internas
// (_ia_hist_*, _ia_turnos_*) e valores não-escalares (cliente/boleto/planos são objetos).
export function montarFichaColetada(contexto = {}) {
  const linhas = Object.entries(contexto)
    .filter(([k, v]) =>
      !k.startsWith('_') &&
      (typeof v === 'string' || typeof v === 'number') &&
      String(v).trim() !== '')
    .map(([k, v]) => `${k}: ${v}`);
  if (!linhas.length) return '';
  return [
    '## DADOS JÁ COLETADOS (memória — NUNCA re-pergunte)',
    ...linhas,
    'Estes dados já foram coletados nesta conversa. NUNCA pergunte de novo por eles. Se faltar algum dado que não está na lista acima, pergunte e salve com a ferramenta salvar_dado.',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C "$(git rev-parse --show-toplevel)" add apps/api/src/services/fluxoHelpers.js apps/api/src/services/fluxoHelpers.test.js
git commit -m "feat(motor): montarFichaColetada monta bloco de memória da IA"
```

---

### Task 3: `montarSystemPrompt` injeta a ficha

**Files:**
- Modify: `apps/api/src/services/fluxoHelpers.js:36-43`
- Test: `apps/api/src/services/fluxoHelpers.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `montarSystemPrompt({ systemBase, instrucao, ctxCliente, ficha, regrasTools }) => string` — agora aceita `ficha` opcional, injetada entre os dados do cliente e as regras de tool. Usada pela Task 5.

- [ ] **Step 1: Write the failing test**

Adicionar ao final de `apps/api/src/services/fluxoHelpers.test.js`:

```js
// ── montarSystemPrompt: ficha ───────────────────────────────────
test('montarSystemPrompt injeta o bloco da ficha quando fornecido', () => {
  const s = montarSystemPrompt({ systemBase: 'Base', ficha: '## DADOS JÁ COLETADOS\ncidade: Natal' });
  assert.match(s, /DADOS JÁ COLETADOS/);
  assert.match(s, /cidade: Natal/);
});

test('montarSystemPrompt sem ficha não inclui o bloco de memória', () => {
  const s = montarSystemPrompt({ systemBase: 'Base' });
  assert.doesNotMatch(s, /DADOS JÁ COLETADOS/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test`
Expected: FAIL — o primeiro teste falha (a ficha não aparece no prompt).

- [ ] **Step 3: Write minimal implementation**

Substituir a função `montarSystemPrompt` em `apps/api/src/services/fluxoHelpers.js` (linhas 36-43) por:

```js
export function montarSystemPrompt({ systemBase, instrucao, ctxCliente, ficha, regrasTools } = {}) {
  return [
    systemBase || instrucao,
    instrucao && systemBase ? `\nInstrução específica: ${instrucao}` : '',
    ctxCliente ? `\n📋 Dados do cliente identificado:\n${ctxCliente}` : '',
    ficha ? `\n${ficha}` : '',
    regrasTools || '',
  ].filter(Boolean).join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && npm test`
Expected: PASS (novos + todos os testes antigos de `montarSystemPrompt` continuam passando — a mudança é aditiva).

- [ ] **Step 5: Commit**

```bash
git -C "$(git rev-parse --show-toplevel)" add apps/api/src/services/fluxoHelpers.js apps/api/src/services/fluxoHelpers.test.js
git commit -m "feat(motor): montarSystemPrompt injeta ficha de dados coletados"
```

---

### Task 4: Tool `salvar_dado` em `IA_TOOLS`

**Files:**
- Modify: `apps/api/src/services/iaTools.js:160-161` (inserir antes de `transferir_para_humano`)

**Interfaces:**
- Consumes: nada.
- Produces: entrada `salvar_dado` em `IA_TOOLS` com `input_schema` `{ dados: object<string,string> }`. Consumida pela Task 5 (o motor a intercepta pelo nome).

> Sem teste unitário: `iaTools.js` importa `integrations.js` → `config/db.js` (Knex) e não é importável em teste. Verificação = `node --check`.

- [ ] **Step 1: Inserir a tool**

Em `apps/api/src/services/iaTools.js`, inserir o bloco abaixo **imediatamente antes** do objeto `{ name: 'transferir_para_humano', … }` (linha 161), logo após o `},` que fecha `precadastrar_cliente`:

```js
  {
    name: 'salvar_dado',
    description: 'Salva dados que o cliente informou, como variáveis persistentes da conversa. Sempre que o cliente fornecer um dado (nome, cpf, data de nascimento, email, celular, logradouro, numero, bairro, cidade, cep, plano, vencimento, etc.), salve TODOS os dados novos desta mensagem numa ÚNICA chamada. NUNCA pergunte de novo um dado já salvo. Use nomes de campo curtos e sem acento (ex.: cidade, plano, data_nasc).',
    input_schema: {
      type: 'object',
      properties: {
        dados: {
          type: 'object',
          description: 'Mapa campo→valor. Ex.: {"cidade":"Natal","plano":"450M","vencimento":"10"}',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['dados'],
    },
  },
```

- [ ] **Step 2: Verificar sintaxe**

Run: `node --check apps/api/src/services/iaTools.js`
Expected: sem saída (exit 0).

- [ ] **Step 3: Rodar a suíte (garantir que nada quebrou)**

Run: `cd apps/api && npm test`
Expected: PASS (mesma contagem de antes; iaTools não é importado nos testes).

- [ ] **Step 4: Commit**

```bash
git -C "$(git rev-parse --show-toplevel)" add apps/api/src/services/iaTools.js
git commit -m "feat(ia): tool salvar_dado (batch) para memória estruturada"
```

---

### Task 5: Wiring no motor (`processarIAResponde`)

**Files:**
- Modify: `apps/api/src/services/motorFluxo.js:21` (import), `:611-631` (ficha + montarSystemPrompt), `:652` (tools), `:684` (intercept)

**Interfaces:**
- Consumes: `normalizarNomeCampo`, `montarFichaColetada`, `montarSystemPrompt` (Tasks 1-3); tool `salvar_dado` (Task 4).
- Produces: comportamento — a IA salva dados que persistem em `ctx.estado.contexto[campo]` e são reinjetados no system a cada turno.

> Sem teste unitário: `motorFluxo.js` puxa Knex. Verificação = `node --check` + suíte de `fluxoHelpers`.

- [ ] **Step 1: Estender o import dos helpers (linha 21)**

Substituir a linha 21 de `apps/api/src/services/motorFluxo.js`:

```js
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista } from './fluxoHelpers.js';
```

por:

```js
import { resolverTipoChamado, avaliarNps, montarSystemPrompt, camposLista, montarFichaColetada, normalizarNomeCampo } from './fluxoHelpers.js';
```

- [ ] **Step 2: Calcular a ficha e passá-la ao montarSystemPrompt**

Em `processarIAResponde`, logo após o bloco que monta `ctxCliente` (termina na linha 614 com `.join('\n');`), inserir:

```js
  // Ficha de dados já coletados (reinjetada todo turno para a IA não re-perguntar).
  const ficha = montarFichaColetada(ctx.estado.contexto);
```

E na chamada `const system = montarSystemPrompt({ … })` (linha 618), acrescentar `ficha,` logo após `ctxCliente,`, ficando:

```js
  const system = montarSystemPrompt({
    systemBase,
    instrucao,
    ctxCliente,
    ficha,
    regrasTools: `## REGRAS CRÍTICAS DE FERRAMENTAS
```

(o restante do template de `regrasTools` permanece inalterado.)

- [ ] **Step 3: Force-include a tool `salvar_dado` (linha 652)**

Substituir a linha 652:

```js
  const tools = IA_TOOLS.filter(t => toolsAtivas.includes(t.name));
```

por:

```js
  // salvar_dado sempre disponível — memória não pode ser desligada por config de nó.
  const tools = IA_TOOLS.filter(t => toolsAtivas.includes(t.name) || t.name === 'salvar_dado');
```

- [ ] **Step 4: Interceptar `salvar_dado` no loop de tools (linha 684)**

Dentro de `processarIAResponde`, no laço `for (const tu of toolUses) {` (linha 684), inserir o bloco abaixo como **primeira instrução do corpo do for**, antes do `console.log(...)` da linha 685:

```js
          // salvar_dado é tratada aqui (não no executarTool) porque precisa mutar
          // o estado do fluxo, que o executarTool(name,input,{cliente,conversa,sandbox}) não vê.
          if (tu.name === 'salvar_dado') {
            const dados = tu.input?.dados || {};
            const salvos = [];
            for (const [campo, valor] of Object.entries(dados)) {
              const chave = normalizarNomeCampo(campo);
              if (!chave) continue;
              ctx.estado.contexto[chave] = String(valor ?? '');
              salvos.push(`${chave}=${ctx.estado.contexto[chave]}`);
            }
            toolResults.push({
              type: 'tool_result',
              tool_use_id: tu.id,
              content: salvos.length ? `✓ Salvei: ${salvos.join(', ')}` : 'Nenhum dado para salvar.',
            });
            continue;
          }
```

- [ ] **Step 5: Verificar sintaxe**

Run: `node --check apps/api/src/services/motorFluxo.js`
Expected: sem saída (exit 0).

- [ ] **Step 6: Rodar a suíte**

Run: `cd apps/api && npm test`
Expected: PASS (a lógica pura das Tasks 1-3 cobre o comportamento testável).

- [ ] **Step 7: Commit**

```bash
git -C "$(git rev-parse --show-toplevel)" add apps/api/src/services/motorFluxo.js
git commit -m "feat(motor): ia_responde grava e reinjeta dados coletados (memória estruturada)"
```

---

### Task 6: `max_turns ≈ 25` no nó de cadastro comercial (config, não-código)

**Files:**
- Nenhum arquivo no repo. O fluxo comercial vive **no banco** (criado via editor; não está no `seed.js`).

**Interfaces:**
- Consumes: comportamento das Tasks 1-5 (a memória estruturada é o que torna um `max_turns` alto seguro).
- Produces: o nó `ia_responde` de cadastro comercial passa a caber um cadastro completo sem estourar `max_turnos`.

- [ ] **Step 1: Ajustar o nó no editor**

No app (Fluxos → fluxo comercial → editar), selecionar o nó `IA Responde` de cadastro e definir **Máx. turnos = 25** ([FluxoEditor.jsx:413-414](../../apps/web/src/pages/FluxoEditor.jsx#L413) salva em `cfg.max_turns`). Salvar o fluxo.

- [ ] **Step 2: Validação (deferida — precisa app rodando com SGP+IA)**

Simular um cadastro de 10+ mensagens (tela Fluxos → "Testar fluxo" → Conversa real, ou link `/teste/<token>` em sandbox) e confirmar:
- a IA **não re-pergunta** um dado já informado (aparece em `## DADOS JÁ COLETADOS`);
- a conversa **não cai** na porta `max_turnos` antes de concluir o cadastro.

> Sem commit (mudança de dado no banco). Registrar o resultado na pauta do brain ao fechar.

---

## Notas de execução

- Ao terminar as Tasks 1-5, rodar `cd apps/api && npm test` uma vez a mais para confirmar a suíte inteira verde, e `npm run build` em `apps/web` não é afetado (mudanças são de backend + config).
- Fechamento: atualizar `brain/work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md` (item 1 → concluído) e o CLAUDE.md (a nota "Memória da IA é frágil" passa a apontar para a solução).
