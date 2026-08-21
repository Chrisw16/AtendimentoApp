# Diagnóstico técnico da ONU via leitura direta do banco do SGP

**Data:** 2026-07-02
**Status:** aprovado (design) — aguarda plano de implementação
**Branch:** worktree-ambiente-testes-fluxo

## Problema

A tool `consultar_onu_acs` (usada pela IA de suporte técnico) é um **stub**: sempre retorna "Consulta de ONU via ACS não configurada". A IA não consegue coletar o **sinal óptico** nem o **status do equipamento**, e o diagnóstico técnico trava. A API do SGP não expõe esses dados de forma utilizável (o módulo Gerenciador CPE exigiria Basic auth + id_servico + ler ao vivo da OLT).

O banco de produção do SGP (PostgreSQL 11) **tem** esses dados cacheados, e a VPS do chat já está na whitelist de IP.

## Escopo

**Dentro:** ler do banco do SGP, **somente-leitura**, o diagnóstico que a API não dá — **sinal óptico da ONU (Rx/Tx/olt_rx em dBm)** e **status do equipamento** (online/offline, uptime da sessão, modelo/serial). Rewire da tool `consultar_onu_acs`.

**Fora:** qualquer escrita; substituir leituras que a API já faz (cliente/boleto/contrato seguem na API); `reiniciar_onu_acs` (reboot é comando via Gerenciador CPE/Basic, não dá por banco read-only) — continua stub; firmware (não existe no banco); PPPoE/IP e localização física (OLT/CTO) — adiáveis.

## Conexão (dados do NetGo Metrics)

- **PostgreSQL 11** · host `177.52.36.89:5432` · db `dbconect` · user read-only `consulta_conect`.
- **Sem SSL** (`ssl: false`) — se o driver tentar TLS, falha.
- Whitelist de IP (VPS já liberada). Conexão TCP direta pela internet.
- **Pool** (não abrir/fechar por request), `max: 8`.
- Fixar timezone: `options: '-c timezone=America/Sao_Paulo'`.
- `statement_timeout` curto (~5s) — é banco de produção do ERP; queries enxutas com `LIMIT`.
- `numeric` chega como **string** no driver `pg`; por isso as queries usam `::float8`.

### Credenciais (sistema_kv, campos separados)

Configuráveis pela tela admin (Configurações), padrão dos outros integradores:

| chave | exemplo |
|---|---|
| `sgpdb_host` | `177.52.36.89` |
| `sgpdb_port` | `5432` |
| `sgpdb_name` | `dbconect` |
| `sgpdb_user` | `consulta_conect` |
| `sgpdb_password` | (secreto) |

## Modelo de dados / query

Cadeia: `admcore_clientecontrato(id) → admcore_servicointernet(clientecontrato_id) → netcore_onu(service_id)` para o sinal; `servicointernet.login = radacct.username` para o status. Filtrar `netcore_onu.date_removed_from_olt IS NULL AND info ? 'optical'` (só equipamento vigente com leitura óptica).

Query única, parametrizada por `contrato` (`$1`):

```sql
WITH svc AS (
  SELECT si.id, si.login
  FROM admcore_servicointernet si
  WHERE si.clientecontrato_id = $1
  LIMIT 1
)
SELECT
  o.onutype                               AS modelo,
  o.phy_addr                              AS serial,
  (o.info->'optical'->>'rx')::float8      AS rx_dbm,
  (o.info->'optical'->>'tx')::float8      AS tx_dbm,
  (o.info->'optical'->>'olt_rx')::float8  AS olt_rx_dbm,
  (o.info->'optical'->>'date')            AS sinal_lido_em,
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
LIMIT 1;
```

Retorna 0 ou 1 linha. 0 linhas = sem ONU vigente com leitura (tratado como "sem dado").

## Componentes

### `services/sgpDb.js` (novo — não-testável, abre socket)
- `pg.Pool` lazy montado das credenciais do `sistema_kv` (reusa `getKV`/cache de `integrations.js` ou um getter próprio). `ssl:false`, `max:8`, `options:'-c timezone=America/Sao_Paulo'`, `statement_timeout: 5000`.
- `export async function diagnosticoOnu(contrato)` → a linha crua (objeto) ou `null` (0 linhas **ou** erro — loga `console.error('[SGP-DB] ...')`). Fail-safe: nunca lança pra cima.
- `export function invalidateSgpDbPool()` — encerra/recria o pool quando a credencial muda (chamar junto de `invalidateConfigCache`).

### `services/sgpHelpers.js` (estende — **puro, TDD**)
- `classificarSinal(rx)` → `{ nivel, emoji, label }`. Régua sobre o **Rx do cliente**:
  - `rx >= -25` → `bom` 🟢
  - `-27 <= rx < -25` → `atencao` 🟡
  - `-28 <= rx < -27` → `ruim` 🔴
  - `rx < -28` → `critico` 🔴
  - `rx` nulo/NaN → `desconhecido`
- `formatarDiagnosticoOnu(row, now)` → **string** pra IA. Regras:
  - `row` nulo → fail-safe: "Não consegui ler o sinal do equipamento agora." (a IA segue com reinício/chamado).
  - Sinal: `Rx {rx} dBm {emoji} ({label}) · Tx {tx}`; sempre cita **quando foi medido** (parse de `sinal_lido_em` com `parseDataSgp`). Se a leitura tiver **> 7 dias**, anexa aviso "última medição há N dias, pode estar desatualizada".
  - Status: `online` → "Equipamento ONLINE" + uptime formatado (de `uptime_segundos`); offline → "Equipamento OFFLINE" + `ultima_queda_motivo` quando houver (ex.: `Lost-Carrier` = queda de sinal).

### `services/iaTools.js`
- `consultar_onu_acs`: passa a chamar `diagnosticoOnu(input.contrato || ctx?.cliente?.contrato)` → `formatarDiagnosticoOnu(row, new Date())`. **Corrige** o bug atual (`input.serial` → contrato). Atualiza a `description` (lê sinal/status reais do equipamento). `input_schema` continua com `contrato`.

## Orientação da IA (prompt de suporte)

A IA não vê banco nem SQL: ela **chama a tool** `consultar_onu_acs` e recebe de volta um **texto interno técnico + veredito** (o retorno de `formatarDiagnosticoOnu`, ex.: `Rx -28.5 dBm 🔴 crítico · ONLINE há 3h`). O **prompt** manda a IA **raciocinar com o técnico e falar leigo** com o cliente (nunca despejar dBm, a menos que ele peça).

Adicionar ao **PASSO 1 (Diagnóstico)** do prompt de suporte (tela Prompts IA → Suporte técnico, também no seed 005):

```text
- Chame verificar_conexao e consultar_onu_acs (lê o sinal e o status do equipamento).
- Decida pelo resultado:
  • Sinal RUIM/CRÍTICO → problema provável na fibra/equipamento; reiniciar não resolve.
    Explique de forma simples e abra chamado (PASSO 4).
  • Sinal BOM mas OFFLINE → siga o reinício (PASSO 2).
  • Sinal BOM e ONLINE (cliente reclama de lentidão) → provável Wi-Fi/dispositivo; oriente.
  • "Não consegui ler o sinal" → siga o fluxo normal (reinício → chamado).
- NUNCA cite números técnicos (dBm) ao cliente, a menos que ele peça. Fale simples
  ("o sinal do seu equipamento está fraco/bom").
```

`consultar_onu_acs` precisa estar em `tools_ativas` do nó de suporte (já está no default do motor).

## Fluxo de dados

`ia_responde (suporte)` → tool `consultar_onu_acs` → `diagnosticoOnu(contrato)` (pool SGP-DB) → `formatarDiagnosticoOnu(row, now)` → texto → IA responde. Erro/timeout/sem-dado → mensagem fail-safe → IA orienta reinício/chamado.

## Tratamento de erro

Fail-safe em todas as camadas: sem credencial configurada, banco inalcançável, timeout, 0 linhas → `diagnosticoOnu` devolve `null` → `formatarDiagnosticoOnu(null)` devolve a mensagem neutra. **Nunca** trava o atendimento nem lança exceção pro motor.

## Testes (TDD)

`sgpHelpers.test.js` (novos casos):
- `classificarSinal`: -20→bom, -25→bom (fronteira), -26→atencao, -27→atencao (fronteira), -27.5→ruim, -28→ruim (fronteira), -28.5→critico, null→desconhecido.
- `formatarDiagnosticoOnu`: row nulo → mensagem fail-safe sem "Rx"; leitura fresca+online → contém rx, "bom", "ONLINE", uptime; leitura antiga (30 dias) → contém aviso de desatualizada; offline com `ultima_queda_motivo` → contém "OFFLINE" e o motivo.

`sgpDb.js` não entra em teste unitário (abre socket — igual `integrations.js`). Validação: `node --check` + validação ao vivo contra o banco (com credencial configurada).

## Segurança

- Acesso **somente-leitura** (user `consulta_conect`).
- ⚠️ Senha do `consulta_conect` marcada como possivelmente comprometida pelo NetGo Metrics → **criar user dedicado read-only** (`leitura_diag`) antes de produção (decisão adiada pelo Christian).
- ⚠️ **Sem SSL** na internet pública → credencial e dados trafegam em claro; mitigado só pela whitelist de IP. Reforça a dívida "criptografar `sistema_kv`".

## Fora de escopo (futuro)

`reiniciar_onu_acs` real (Gerenciador CPE), PPPoE/IP detalhado, localização física (OLT/CTO/PON), correlação automática sinal-ruim × manutenção na região.
