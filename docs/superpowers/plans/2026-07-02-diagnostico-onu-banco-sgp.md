# Diagnóstico da ONU via banco do SGP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a tool `consultar_onu_acs` (hoje stub) ler o sinal óptico e o status do equipamento direto do banco read-only do SGP, e orientar a IA de suporte a usar isso.

**Architecture:** Lógica pura (classificação + formatação) em `sgpHelpers.js` (TDD). Acesso ao banco num `pg.Pool` dedicado em `sgpDb.js` (fail-safe, não-testável). A tool consome os dois. Credenciais no `sistema_kv`, configuráveis na tela admin. Mensagem técnica interna; prompt manda a IA falar leigo.

**Tech Stack:** Node 20 ESM · `pg` (já é dependência via Knex) · `node --test` · React (Vite) no front.

## Global Constraints

- Banco do SGP: **PostgreSQL 11**, `177.52.36.89:5432/dbconect`, user read-only `consulta_conect`, **`ssl: false`** (SSL não suportado), whitelist de IP (VPS já liberada).
- `pg.Pool`: `max: 8`, `options: '-c timezone=America/Sao_Paulo'`, `statement_timeout: 5000`.
- Driver `pg`: `numeric` chega como string → as queries já usam `::float8`. Placeholders são `$1` (o `?` no SQL é o operador jsonb "key exists", não parâmetro).
- **Somente-leitura**: nenhuma query de escrita. Fail-safe: `diagnosticoOnu` nunca lança — retorna `null`.
- Testes com `node --test` a partir de `apps/api`. Trabalho na worktree `worktree-ambiente-testes-fluxo`.
- Régua de sinal (Rx do cliente): `≥ -25` bom · `-27 ≤ rx < -25` atenção · `-28 ≤ rx < -27` ruim · `< -28` crítico.

---

### Task 1: `classificarSinal` (função pura)

**Files:**
- Modify: `apps/api/src/services/sgpHelpers.js`
- Test: `apps/api/src/services/sgpHelpers.test.js`

**Interfaces:**
- Produces: `classificarSinal(rx: number|string|null) → { nivel: 'bom'|'atencao'|'ruim'|'critico'|'desconhecido', emoji: string, label: string }`

- [ ] **Step 1: Write the failing tests** — anexe ao fim de `apps/api/src/services/sgpHelpers.test.js`:

```js
// ── classificarSinal ───────────────────────────────────────────────
import { classificarSinal, formatarDiagnosticoOnu } from './sgpHelpers.js';

test('classificarSinal: -20 e -25 (fronteira) são bom', () => {
  assert.equal(classificarSinal(-20).nivel, 'bom');
  assert.equal(classificarSinal(-25).nivel, 'bom');
});
test('classificarSinal: -26 e -27 (fronteira) são atenção', () => {
  assert.equal(classificarSinal(-26).nivel, 'atencao');
  assert.equal(classificarSinal(-27).nivel, 'atencao');
});
test('classificarSinal: -27.5 e -28 (fronteira) são ruim', () => {
  assert.equal(classificarSinal(-27.5).nivel, 'ruim');
  assert.equal(classificarSinal(-28).nivel, 'ruim');
});
test('classificarSinal: -28.5 é crítico', () => {
  assert.equal(classificarSinal(-28.5).nivel, 'critico');
});
test('classificarSinal: valor nulo/inválido é desconhecido', () => {
  assert.equal(classificarSinal(null).nivel, 'desconhecido');
  assert.equal(classificarSinal('x').nivel, 'desconhecido');
});
```

> Nota: o `import` de `formatarDiagnosticoOnu` já entra aqui porque a Task 2 usa o mesmo arquivo de teste. Ele fica não-usado até a Task 2 — tudo bem.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- --test-name-pattern="classificarSinal"`
Expected: FAIL — `classificarSinal` não existe / não é exportada (SyntaxError de import ou AssertionError).

- [ ] **Step 3: Implement** — anexe ao fim de `apps/api/src/services/sgpHelpers.js`:

```js
// Classifica o Rx do cliente (dBm) conforme a régua da NetGo.
export function classificarSinal(rx) {
  const v = Number(rx);
  if (!Number.isFinite(v)) return { nivel: 'desconhecido', emoji: '⚪', label: 'sinal indisponível' };
  if (v >= -25) return { nivel: 'bom',     emoji: '🟢', label: 'bom' };
  if (v >= -27) return { nivel: 'atencao', emoji: '🟡', label: 'atenção' };
  if (v >= -28) return { nivel: 'ruim',    emoji: '🔴', label: 'ruim' };
  return          { nivel: 'critico', emoji: '🔴', label: 'crítico' };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test -- --test-name-pattern="classificarSinal"`
Expected: PASS (5 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sgpHelpers.js apps/api/src/services/sgpHelpers.test.js
git commit -m "feat(sgp): classificarSinal (régua Rx da ONU)"
```

---

### Task 2: `formatarDiagnosticoOnu` (função pura)

**Files:**
- Modify: `apps/api/src/services/sgpHelpers.js`
- Test: `apps/api/src/services/sgpHelpers.test.js`

**Interfaces:**
- Consumes: `classificarSinal` (Task 1), `parseDataSgp` (já existe em `sgpHelpers.js`).
- Produces: `formatarDiagnosticoOnu(row: object|null, now?: Date) → string` — texto INTERNO (técnico + veredito) que a IA lê. Espera o row da query da Task 3: `{ modelo, serial, rx_dbm, tx_dbm, olt_rx_dbm, sinal_lido_em, online, uptime_segundos, ultima_queda_motivo }`.

- [ ] **Step 1: Write the failing tests** — anexe ao fim de `apps/api/src/services/sgpHelpers.test.js`:

```js
// ── formatarDiagnosticoOnu ─────────────────────────────────────────
const AGORA_ONU = new Date(2026, 6, 2, 12, 0, 0); // 2026-07-02 12:00

test('formatarDiagnosticoOnu: row nulo → fail-safe, sem "Rx"', () => {
  const msg = formatarDiagnosticoOnu(null, AGORA_ONU);
  assert.match(msg, /não consegui ler/i);
  assert.doesNotMatch(msg, /Rx/);
});
test('formatarDiagnosticoOnu: leitura fresca + online mostra rx, "bom", ONLINE e uptime', () => {
  const row = { rx_dbm: -20.97, tx_dbm: 2.06, sinal_lido_em: '2026-07-02 07:25:37',
    online: true, uptime_segundos: 10800, ultima_queda_motivo: null };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /-20\.97/);
  assert.match(msg, /bom/);
  assert.match(msg, /ONLINE/);
  assert.match(msg, /3h/);
  assert.match(msg, /hoje/);
});
test('formatarDiagnosticoOnu: leitura antiga (>7 dias) avisa desatualizada', () => {
  const row = { rx_dbm: -21, tx_dbm: 2, sinal_lido_em: '2026-06-01 10:00:00', online: true, uptime_segundos: 600 };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /dias/);
  assert.match(msg, /desatualizad/i);
});
test('formatarDiagnosticoOnu: offline mostra OFFLINE e o motivo da queda', () => {
  const row = { rx_dbm: -35, tx_dbm: 2, sinal_lido_em: '2026-07-02 07:00:00',
    online: false, uptime_segundos: null, ultima_queda_motivo: 'Lost-Carrier' };
  const msg = formatarDiagnosticoOnu(row, AGORA_ONU);
  assert.match(msg, /OFFLINE/);
  assert.match(msg, /Lost-Carrier/);
  assert.match(msg, /crítico/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix apps/api test -- --test-name-pattern="formatarDiagnosticoOnu"`
Expected: FAIL — `formatarDiagnosticoOnu` não é função (não implementada).

- [ ] **Step 3: Implement** — anexe ao fim de `apps/api/src/services/sgpHelpers.js`:

```js
function formatarUptimeOnu(seg) {
  const s = Number(seg);
  if (!Number.isFinite(s) || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 24) return `${Math.floor(h / 24)}d${h % 24}h`;
  if (h >= 1)  return `${h}h${m > 0 ? m + 'min' : ''}`;
  return `${m}min`;
}

// Monta o texto INTERNO (técnico + veredito) que a IA lê. O prompt traduz p/ leigo.
export function formatarDiagnosticoOnu(row, now = new Date()) {
  if (!row || row.rx_dbm == null) {
    return 'Não consegui ler o sinal do equipamento agora. Siga o diagnóstico normal (reinício → chamado).';
  }
  const s = classificarSinal(row.rx_dbm);
  let msg = `📡 Sinal da ONU: Rx ${row.rx_dbm} dBm ${s.emoji} (${s.label})`;
  if (row.tx_dbm != null) msg += ` · Tx ${row.tx_dbm}`;

  const lido = parseDataSgp(row.sinal_lido_em);
  if (lido) {
    const dias = Math.floor((now - lido) / 86400000);
    if (dias <= 0)       msg += ` · medido hoje`;
    else if (dias === 1) msg += ` · medido ontem`;
    else                 msg += ` · medido há ${dias} dias`;
    if (dias > 7) msg += ` ⚠️ (leitura antiga, pode estar desatualizada)`;
  }

  if (row.online) {
    const up = formatarUptimeOnu(row.uptime_segundos);
    msg += ` · Equipamento ONLINE${up ? ` há ${up}` : ''}`;
  } else {
    msg += ` · Equipamento OFFLINE`;
    if (row.ultima_queda_motivo) msg += ` (última queda: ${row.ultima_queda_motivo})`;
  }
  return msg;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix apps/api test`
Expected: PASS — suíte inteira verde (119 anteriores + 9 novos = 128).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/sgpHelpers.js apps/api/src/services/sgpHelpers.test.js
git commit -m "feat(sgp): formatarDiagnosticoOnu (mensagem técnica interna da ONU)"
```

---

### Task 3: `sgpDb.js` — pool read-only + diagnosticoOnu

**Files:**
- Create: `apps/api/src/services/sgpDb.js`

**Interfaces:**
- Consumes: `getDb` de `../config/db.js` (lê `sistema_kv`).
- Produces: `diagnosticoOnu(contrato) → Promise<object|null>` (row da query ou null em erro/sem-dado); `invalidateSgpDbPool() → void`.

- [ ] **Step 1: Create the file** `apps/api/src/services/sgpDb.js`:

```js
/**
 * sgpDb.js — leitura SOMENTE-LEITURA do banco do SGP (Postgres 11) para o
 * diagnóstico técnico que a API não entrega: sinal óptico + status da ONU.
 * Pool pg dedicado; credenciais no sistema_kv. Fail-safe: nunca lança pra cima.
 */
import pg from 'pg';
import { getDb } from '../config/db.js';

let pool = null;

async function getCreds() {
  const db = getDb();
  const rows = await db('sistema_kv').whereIn('chave',
    ['sgpdb_host', 'sgpdb_port', 'sgpdb_name', 'sgpdb_user', 'sgpdb_password']);
  const kv = {};
  rows.forEach(r => { try { kv[r.chave] = JSON.parse(r.valor); } catch { kv[r.chave] = r.valor; } });
  return kv;
}

async function getPool() {
  if (pool) return pool;
  const kv = await getCreds();
  if (!kv.sgpdb_host || !kv.sgpdb_user) {
    throw new Error('Banco do SGP não configurado (Configurações → SGP/Banco).');
  }
  pool = new pg.Pool({
    host: kv.sgpdb_host,
    port: Number(kv.sgpdb_port) || 5432,
    database: kv.sgpdb_name || 'dbconect',
    user: kv.sgpdb_user,
    password: kv.sgpdb_password || '',
    ssl: false,
    max: 8,
    options: '-c timezone=America/Sao_Paulo',
    statement_timeout: 5000,
    connectionTimeoutMillis: 5000,
  });
  pool.on('error', (e) => console.error('[SGP-DB] pool error:', e.message));
  return pool;
}

export function invalidateSgpDbPool() {
  if (pool) { pool.end().catch(() => {}); pool = null; }
}

// contrato → sinal óptico (netcore_onu.info->optical) + status (radacct).
const QUERY_DIAG_ONU = `
WITH svc AS (
  SELECT si.id, si.login
  FROM admcore_servicointernet si
  WHERE si.clientecontrato_id = $1
  LIMIT 1
)
SELECT
  o.onutype AS modelo,
  o.phy_addr AS serial,
  (o.info->'optical'->>'rx')::float8 AS rx_dbm,
  (o.info->'optical'->>'tx')::float8 AS tx_dbm,
  (o.info->'optical'->>'olt_rx')::float8 AS olt_rx_dbm,
  (o.info->'optical'->>'date') AS sinal_lido_em,
  EXISTS(SELECT 1 FROM radacct ra
         WHERE lower(trim(ra.username))=lower(trim(svc.login)) AND ra.acctstoptime IS NULL) AS online,
  (SELECT EXTRACT(EPOCH FROM (now()-ra.acctstarttime))::int FROM radacct ra
     WHERE lower(trim(ra.username))=lower(trim(svc.login)) AND ra.acctstoptime IS NULL
     ORDER BY ra.acctstarttime DESC LIMIT 1) AS uptime_segundos,
  (SELECT ra.acctterminatecause FROM radacct ra
     WHERE lower(trim(ra.username))=lower(trim(svc.login)) AND ra.acctstoptime IS NOT NULL
     ORDER BY ra.acctstoptime DESC LIMIT 1) AS ultima_queda_motivo
FROM svc
JOIN netcore_onu o ON o.service_id = svc.id AND o.date_removed_from_olt IS NULL AND o.info ? 'optical'
ORDER BY o.id DESC
LIMIT 1;`;

export async function diagnosticoOnu(contrato) {
  const id = Number(contrato);
  if (!Number.isFinite(id) || id <= 0) return null;
  try {
    const p = await getPool();
    const { rows } = await p.query(QUERY_DIAG_ONU, [id]);
    return rows[0] || null;
  } catch (e) {
    console.error('[SGP-DB] diagnosticoOnu:', e.message);
    return null;
  }
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check apps/api/src/services/sgpDb.js`
Expected: sem saída (exit 0).

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/sgpDb.js
git commit -m "feat(sgp): sgpDb.js — pool read-only + diagnosticoOnu (sinal+status da ONU)"
```

---

### Task 4: religar a tool `consultar_onu_acs`

**Files:**
- Modify: `apps/api/src/services/iaTools.js`

**Interfaces:**
- Consumes: `diagnosticoOnu` (Task 3), `formatarDiagnosticoOnu` (Task 2).

- [ ] **Step 1: Add imports** — em `apps/api/src/services/iaTools.js`, logo após a linha `import { formatarBoletoIA } from './iaToolsHelpers.js';` adicione:

```js
import { diagnosticoOnu } from './sgpDb.js';
import { formatarDiagnosticoOnu } from './sgpHelpers.js';
```

- [ ] **Step 2: Update the tool description** — substitua a `description` da tool `consultar_onu_acs` em `IA_TOOLS`:

De:
```js
    description: 'Lê dados da ONU do cliente via ACS: sinal óptico Rx/Tx, uptime, firmware, IP WAN. Use quando suspeitar de falha óptica ou problema no equipamento.',
```
Para:
```js
    description: 'Lê o sinal óptico (Rx/Tx em dBm) e o status do equipamento (online/offline, uptime) do cliente. Use no diagnóstico de suporte quando o cliente estiver offline ou com lentidão, para saber se o problema é na fibra/equipamento. Não repasse números técnicos ao cliente — fale simples.',
```

- [ ] **Step 3: Rewire the executor** — substitua o `case 'consultar_onu_acs'` inteiro:

De:
```js
    case 'consultar_onu_acs': {
      const r = await consultarOnuAcs(input.serial || '').catch(e => ({ encontrado: false, mensagem: e.message }));
      if (!r.encontrado) return r.mensagem;
      let msg = `📡 Dados da ONU:\n`;
      if (r.sinal_rx) msg += `• Sinal Rx: ${r.sinal_rx} dBm\n`;
      if (r.sinal_tx) msg += `• Sinal Tx: ${r.sinal_tx} dBm\n`;
      if (r.uptime)   msg += `• Uptime: ${r.uptime}\n`;
      if (r.ip_wan)   msg += `• IP WAN: ${r.ip_wan}\n`;
      if (r.status)   msg += `• Status: ${r.status}`;
      return msg;
    }
```
Para:
```js
    case 'consultar_onu_acs': {
      // Lê sinal óptico + status direto do banco read-only do SGP (sgpDb.js).
      const contrato = input.contrato || ctx?.cliente?.contrato;
      const row = await diagnosticoOnu(contrato);
      return formatarDiagnosticoOnu(row, new Date());
    }
```

- [ ] **Step 4: Verify syntax + suite**

Run: `node --check apps/api/src/services/iaTools.js && npm --prefix apps/api test`
Expected: `node --check` limpo; suíte 128 verdes (sem regressão).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/iaTools.js
git commit -m "fix(ia): consultar_onu_acs lê sinal real do banco do SGP (fim do stub + bug do input.serial)"
```

---

### Task 5: config no admin (sistema_kv) + invalidação do pool

**Files:**
- Modify: `apps/api/src/routes/sysconfig.js`
- Modify: `apps/web/src/pages/Configuracoes.jsx`

- [ ] **Step 1: Backend — whitelist + invalidação.** Em `apps/api/src/routes/sysconfig.js`:

Adicione o import após a linha 2 (`import { invalidateConfigCache } ...`):
```js
import { invalidateSgpDbPool } from '../services/sgpDb.js';
```
Acrescente as 5 chaves ao array `CHAVES_PUBLICAS` (última linha, antes do `];`):
```js
  'sgpdb_host', 'sgpdb_port', 'sgpdb_name', 'sgpdb_user', 'sgpdb_password',
```
No handler `PUT '/'`, logo após `invalidateConfigCache();` adicione:
```js
  invalidateSgpDbPool();
```

- [ ] **Step 2: Backend — verify syntax**

Run: `node --check apps/api/src/routes/sysconfig.js`
Expected: exit 0.

- [ ] **Step 3: Frontend — estado.** Em `apps/web/src/pages/Configuracoes.jsx`, após a linha `const [sgpToken, setSgpToken] = useState('');` adicione:
```jsx
  const [sgpdbHost, setSgpdbHost] = useState('');
  const [sgpdbPort, setSgpdbPort] = useState('5432');
  const [sgpdbName, setSgpdbName] = useState('dbconect');
  const [sgpdbUser, setSgpdbUser] = useState('');
  const [sgpdbPass, setSgpdbPass] = useState('');
```

- [ ] **Step 4: Frontend — carregar do kv.** No effect que popula os campos (onde há `setSgpToken(kv.sgp_token || '');`), adicione logo abaixo:
```jsx
    setSgpdbHost(kv.sgpdb_host || '');
    setSgpdbPort(kv.sgpdb_port || '5432');
    setSgpdbName(kv.sgpdb_name || 'dbconect');
    setSgpdbUser(kv.sgpdb_user || '');
    setSgpdbPass(kv.sgpdb_password || '');
```

- [ ] **Step 5: Frontend — salvar.** No objeto de `handleSave` (onde há `sgp_url: sgpUrl, sgp_app: sgpApp, sgp_token: sgpToken,`), adicione:
```jsx
    sgpdb_host: sgpdbHost, sgpdb_port: sgpdbPort, sgpdb_name: sgpdbName,
    sgpdb_user: sgpdbUser, sgpdb_password: sgpdbPass,
```

- [ ] **Step 6: Frontend — campos na tela.** Na aba de SGP/ERP, logo abaixo do campo do token do SGP (`sgpToken`/`setSgpToken`), renderize os 5 campos novos, no mesmo padrão dos campos SGP existentes — use `ApiKeyField` para a senha e o mesmo wrapper de input dos demais campos SGP para host/porta/banco/usuário:
```jsx
        <ApiKeyField label="Banco SGP — Host" value={sgpdbHost} onChange={setSgpdbHost} placeholder="177.52.36.89" mono />
        <ApiKeyField label="Banco SGP — Porta" value={sgpdbPort} onChange={setSgpdbPort} placeholder="5432" mono />
        <ApiKeyField label="Banco SGP — Database" value={sgpdbName} onChange={setSgpdbName} placeholder="dbconect" mono />
        <ApiKeyField label="Banco SGP — Usuário (read-only)" value={sgpdbUser} onChange={setSgpdbUser} placeholder="consulta_conect" mono />
        <ApiKeyField label="Banco SGP — Senha" value={sgpdbPass} onChange={setSgpdbPass} placeholder="senha read-only" />
```
> `ApiKeyField(label, value, onChange, placeholder, hint, badge, mono)` já existe no arquivo (topo). Se a aba SGP usar outro wrapper de campo para host/url, siga o mesmo do campo `sgp_url` — o importante é `value`/`onChange` ligados aos states novos.

- [ ] **Step 7: Frontend — build**

Run: `npm --prefix apps/web run build`
Expected: `✓ built` sem erro.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/sysconfig.js apps/web/src/pages/Configuracoes.jsx
git commit -m "feat(config): credenciais do banco do SGP no admin + invalidação do pool"
```

---

### Task 6: orientar o prompt de suporte a usar o sinal

**Files:**
- Modify: `apps/api/src/migrations/versions/005_prompts_ia.js`

- [ ] **Step 1: Editar o seed do suporte.** Em `apps/api/src/migrations/versions/005_prompts_ia.js`, no prompt slug `suporte`, substitua o bloco inteiro do PASSO 1 (do cabeçalho até a linha `• Se a tool disser que NÃO há manutenção: siga para o PASSO 2.`):

De:
```
PASSO 1 — DIAGNÓSTICO (sempre, não pule):
- Chame verificar_conexao com o contrato do cliente.
- Se ONLINE: "Sua conexão aparece *online* aqui no sistema! O problema pode estar no Wi-Fi ou no aparelho. Me conta o que está acontecendo?" e ajude conforme o relato.
- Se OFFLINE: chame consultar_manutencao.
  • Se a tool CONFIRMAR manutenção na região do cliente: avise que há uma manutenção/instabilidade na área dele, informe a previsão de normalização SÓ se a tool trouxer, diga que a equipe já está atuando e que ele não precisa fazer nada. NÃO oriente reinício nesse caso.
  • Se a tool disser que NÃO há manutenção: siga para o PASSO 2.
```
Para:
```
PASSO 1 — DIAGNÓSTICO (sempre, não pule):
- Chame verificar_conexao e consultar_onu_acs (lê o sinal e o status do equipamento).
- Decida pelo sinal:
  • RUIM/CRÍTICO → problema provável na fibra/equipamento; reiniciar não resolve. Explique de forma simples e abra chamado (PASSO 4).
  • BOM e ONLINE (cliente reclama de lentidão) → provável Wi-Fi/dispositivo; oriente ("Sua conexão está *online* e com sinal bom aqui; o problema pode estar no Wi-Fi ou no aparelho. Me conta o que acontece?").
  • BOM mas OFFLINE, ou "não consegui ler o sinal" → chame consultar_manutencao:
     - Se CONFIRMAR manutenção na região: avise que há manutenção/instabilidade na área, informe a previsão SÓ se a tool trouxer, diga que a equipe já está atuando e que ele não precisa fazer nada. NÃO oriente reinício.
     - Se NÃO houver manutenção: siga para o PASSO 2.
- NUNCA cite números técnicos (dBm) ao cliente, a menos que ele peça. Fale simples ("o sinal do seu equipamento está fraco/bom").
```

- [ ] **Step 2: Verify syntax**

Run: `node --check apps/api/src/migrations/versions/005_prompts_ia.js`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/migrations/versions/005_prompts_ia.js
git commit -m "docs(prompt): suporte usa consultar_onu_acs no diagnóstico (sinal da ONU)"
```

> **Pós-plano (Christian, manual):** (1) configurar o banco do SGP na tela **Configurações**; (2) colar o passo do sinal também no prompt de suporte **ao vivo** (o seed não altera a instância viva); (3) validar contra o banco real com um contrato de teste, conferindo os logs `[SGP-DB] ...`.

---

## Notas de execução

- **Firmware/PPPoE/localização/reboot** ficam fora (ver spec). `reiniciar_onu_acs` segue stub.
- `sgpDb.js` não tem teste unitário (abre socket, igual `integrations.js`); a garantia é `node --check` + validação ao vivo.
- Segurança: user `consulta_conect` por ora; trocar por `leitura_diag` dedicado antes de produção. Sem SSL na internet pública — mitigado pela whitelist.
