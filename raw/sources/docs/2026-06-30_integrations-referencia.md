# `integrations.js` — Referência completa

Documentação de **todo** o conteúdo de [`apps/api/src/services/integrations.js`](../apps/api/src/services/integrations.js) — a camada de integração externa do GoCHAT: **SGP** (ERP), **ACS** (stub), **Anthropic** (IA) e **Evolution API** (WhatsApp).

> Cabeçalho do arquivo: *"Integração SGP fiel ao código original — todos os endpoints, formatos e campos idênticos ao `erp.js` de referência."*

**Dependência:** `getDb` de `../config/db.js` (usado só para ler `sistema_kv`).

---

## Índice

1. [Configuração & cache](#1-configuração--cache)
2. [Helpers de transporte SGP](#2-helpers-de-transporte-sgp)
3. [Funções SGP](#3-funções-sgp)
4. [Status da rede](#4-status-da-rede)
5. [ACS — ONU (stubs)](#5-acs--onu-stubs)
6. [Pré-cadastro & vencimentos](#6-pré-cadastro--vencimentos)
7. [IA — Anthropic](#7-ia--anthropic)
8. [Evolution API (WhatsApp)](#8-evolution-api-whatsapp)
9. [Aliases para o motorFluxo](#9-aliases-para-o-motorfluxo)
10. [Apêndice: tabela de endpoints](#apêndice-tabela-de-endpoints)

---

## 1. Configuração & cache

Credenciais ficam em `sistema_kv` (Configurações → SGP/ERP, Integrações de IA, Evolution API). Lidas com cache de **5 minutos**.

| Símbolo | Tipo | Descrição |
|---|---|---|
| `cache` / `CACHE_TTL` | privado | `Map` em memória, TTL 5 min (`5*60*1000`) |
| `getKV(chave)` | privado, async | Lê `sistema_kv.valor` por chave; faz `JSON.parse` (fallback string); cacheia |
| `invalidateConfigCache()` | **export** | `cache.clear()` — chamar após editar credenciais |
| `getSGPConfig()` | privado, async | Retorna `{ url, app, token }` |

**`getSGPConfig()`** lê `sgp_url`, `sgp_app`, `sgp_token` em paralelo. Lança erro claro se faltar qualquer um. Higieniza a URL:
- remove `/` finais e `/api` no fim (`.replace(/\/+$/,'').replace(/\/api$/,'')`)
- força `https://` se não começar com `http`

```js
// throws: "URL do SGP não configurada. Acesse Configurações → SGP/ERP." (idem app/token)
```

---

## 2. Helpers de transporte SGP

Todos injetam `app` + `token` e têm timeout via `AbortSignal.timeout`. Lançam `Error("SGP <status> em <path>")` se `!res.ok`.

| Helper | Método / Content-Type | Timeout | Uso |
|---|---|---|---|
| `sgpPost(path, params)` | POST · `x-www-form-urlencoded` | 12s | maioria dos endpoints URA |
| `sgpPostJSON(path, body)` | POST · `application/json` | 12s | chamado, histórico |
| `sgpGet(path, params)` | GET · querystring | 10s | manutenção |

**`formatarCPFCNPJ(digits)`** (privado): formata 11 dígitos como `000.000.000-00` e 14 como `00.000.000/0000-00`; senão retorna como veio.

---

## 3. Funções SGP

### `consultarClientes(cpfcnpj)` → dados do cliente
- **Endpoint:** `POST /api/ura/consultacliente/`
- **Linha:** [integrations.js:92](../apps/api/src/services/integrations.js#L92)
- **Lógica:** valida ≥11 dígitos; tenta **2 formatos** (só dígitos, depois formatado). Ordena contratos por status (ativo/novo → suspenso/reduzido → inativo/inviab. → cancelado), corta em **8**.
- **Payload:** `{ cpfcnpj }`
- **Retorno:**
  ```js
  { erro?, mensagem?,            // quando inválido / não encontrado
    nome, cpfcnpj, email, fone,
    contratos: [{ id, plano, status, titulos_abertos, valor_aberto,
                  cidade, popId, popNome, venc_dia }] }
  ```
- **STATUS_MAP:** `1=ativo, 2=inativo, 3=cancelado, 4=suspenso, 5=inviabilidade técnica, 6=novo, 7=ativo vel. reduzida` (usa `contratoStatusDisplay` quando vem).

### `segundaViaBoleto(cpfcnpj, contrato)` → faturas em aberto
- **Endpoint:** `POST /api/ura/fatura2via/`
- **Linha:** [integrations.js:161](../apps/api/src/services/integrations.js#L161)
- **Payload:** `{ cpfcnpj, contrato, faturas_abertas_todas: '1', notafiscal: '1' }`
- **Retorno (3 formas):**
  - `{ status: 'sem_boleto', mensagem }` — quando `raw.status !== 1` ou sem links
  - `{ status: 'multiplos_boletos', total, cliente, contrato, lista: [boleto…] }`
  - boleto único (objeto direto)
- **Campos do boleto:** `fatura_id, valor_original, valor_cobrado, vencimento_original, vencimento_atual, vencido, link_boleto, link_cobranca, link_pix_html, pix_copia_cola, linha_digitavel`

### `promessaPagamento(contrato, extras={})` → liberação por promessa
- **Endpoint:** `POST /api/ura/liberacaopromessa/` (fetch direto, não usa `sgpPost`)
- **Linha:** [integrations.js:213](../apps/api/src/services/integrations.js#L213)
- **Data:** hoje + 3 dias (`AAAA-MM-DD`), override por `extras.data_promessa`
- **Payload:** `{ contrato, data_promessa }`
- **Retorno:** `{ httpStatus, status, liberado, liberado_dias, protocolo, data_promessa, contratoId, razaoSocial, msg, erro }` (`liberado = status===1`)

### `criarChamado(contrato, ocorrenciatipo, conteudo, extras={})` → abre ticket
- **Endpoint:** `POST /api/ura/chamado/` (JSON)
- **Linha:** [integrations.js:252](../apps/api/src/services/integrations.js#L252)
- **Payload:** `{ contrato:Number, ocorrenciatipo:Number(||5), conteudo }`
- **Retorno:** `{ ...raw, protocolo, chamado_aberto, contrato, cliente }` — protocolo extraído de `protocolo|numero_chamado|numero|id|ocorrencia_id`
- **Tipos:** `5=Outros, 200=Reparo, 3=MudSenhaWifi, 14=RelocRoteador, 13=MudEndereco, 23=MudPlano, 22=ProbFatura`

### `verificarConexao(contrato)` → online/offline
- **Endpoint:** `POST /api/ura/verificaacesso/`
- **Linha:** [integrations.js:280](../apps/api/src/services/integrations.js#L280)
- **Payload:** `{ contrato }`
- **Retorno:** `{ contrato, online, status_conexao, msg, status_contrato, razao_social }` (`online = status===1`)

### `historicoOcorrencias(contrato)` → chamados anteriores
- **Endpoint:** `POST /api/ura/ocorrencia/list/` (JSON)
- **Linha:** [integrations.js:295](../apps/api/src/services/integrations.js#L295)
- **Payload:** `{ contrato:Number, offset:0, limit:50 }`
- **Retorno:** `[{ numero, status, tipo, data_cadastro, data_finalizacao, conteudo(≤200ch), responsavel }]`

### `listarPlanos(cidade)` → planos do SGP
- **Endpoint:** `POST /api/ura/planos/`
- **Linha:** [integrations.js:315](../apps/api/src/services/integrations.js#L315)
- **Payload:** `{ cidade }` (ou vazio)
- **Retorno:** `[{ id, descricao, valor, velocidade }]`
- ⚠️ Difere da tool `listar_planos_ativos` (que lê a tabela **local** `planos`).

### `consultarManutencao()` → manutenções ativas
- **Endpoint:** `GET /api/ura/manutencao/list`
- **Linha:** [integrations.js:328](../apps/api/src/services/integrations.js#L328)
- **Retorno:** `{ ativa, total, itens, cidadesAfetadas, mensagemCentral, previsao }` (previsão no fuso `America/Fortaleza`). Try/catch que devolve estrutura "sem manutenção" no erro.

### `consultarRadius(cpfcnpj)` → sessão PPPoE
- **Endpoint:** `POST /ws/radius/radacct/list/all/` (fetch direto, 10s)
- **Linha:** [integrations.js:398](../apps/api/src/services/integrations.js#L398)
- **Payload:** `{ tipoconexao: 'PPP', cpfcnpj }`
- **Retorno:** `{ sessao_ativa, ip, usuario, inicio_sessao, mensagem, sessoes:[{usuario, ip, online, inicio, nas}] }` (máx. 3 sessões). `online = acctstoptime === null`.

---

## 4. Status da rede

### `statusRede()` → resumo de rede
- **Linha:** [integrations.js:354](../apps/api/src/services/integrations.js#L354)
- **Não tem endpoint próprio** — usa `consultarManutencao()` como proxy (o sistema de inspiração faz ping em hosts; aqui usamos manutenções do SGP).
- **Retorno:** `{ status:'ok'|'manutencao', mensagem, detalhes? }`

---

## 5. ACS — ONU (stubs)

⚠️ **Não implementados** — retornam aviso amigável. Pendente integração **TR-069 real**.

| Função | Linha | Retorno |
|---|---|---|
| `consultarOnuAcs(serial)` | [373](../apps/api/src/services/integrations.js#L373) | `{ encontrado:false, mensagem, requer_acs:true }` |
| `reiniciarOnuAcs(serial)` | [387](../apps/api/src/services/integrations.js#L387) | `{ sucesso:false, mensagem, requer_acs:true }` |

Quando implementar (referência inspiração): `consultarOnuAcs` deve retornar `sinal_rx, sinal_tx, uptime, firmware, ip_wan, wan_status` buscando por serial na tabela `acs_devices`.

---

## 6. Pré-cadastro & vencimentos

### `listarVencimentos()` → dias de vencimento
- **Endpoint:** `POST /api/precadastro/vencimento/list`
- **Linha:** [integrations.js:437](../apps/api/src/services/integrations.js#L437)
- **Retorno:** `[{ id, dia }]` (filtra `id != null`); `[]` em erro.

### `precadastrarCliente(d={})` → cria cliente PF no SGP 🔒
- **Endpoint:** `POST /api/precadastro/F`
- **Linha:** [integrations.js:464](../apps/api/src/services/integrations.js#L464)
- **Obrigatórios (lança `Error` se faltar):** `nome, cpf(ou cpfcnpj), celular, cidade, plano_id, vencimento_id`
- **Auto-detecção por cidade:**
  - **POP:** Gostoso→`3`, São Gonçalo→`4`, default (Natal/Macaíba)→`1`
  - **Portador:** Gostoso→`18`, demais→`16`
- **Defaults aplicados:** `uf=RN, pais=BR, login=CPF, senha=123456, nas_id=2, os_instalacao=True, formacobranca_id=1, precadastro_ativar=1, observacao='Pré-cadastro via IA GoCHAT'`
- **Opcionais condicionais:** `rg, rg_emissor, map_ll, condominio, vendedor_id, midia_id`
- **Retorno:** `{ sucesso, mensagem, id, raw }`

**IDs de plano NetGo (do comentário no código):**
| Cidade | Essencial | Avançado | Premium |
|---|---|---|---|
| Macaíba / São Gonçalo / Natal | 12 (300M R$59,90) | 13 (450M R$99,90) | 16 (600M R$119,90) |
| São Miguel do Gostoso | 30 (200M R$69,90) | 29 (300M R$99,90) | 28 (500M R$119,90) |

---

## 7. IA — Anthropic

### `getAnthropicClient()` → cliente SDK
- **Linha:** [integrations.js:534](../apps/api/src/services/integrations.js#L534)
- Lê `anthropic_api_key` de `sistema_kv`; `import` dinâmico de `@anthropic-ai/sdk`; retorna `new Anthropic({ apiKey })`.
- Lança erro se a key não estiver configurada.

---

## 8. Evolution API (WhatsApp)

### `evolutionRequest(path, body=null, method='GET')` — base
- **Linha:** [integrations.js:542](../apps/api/src/services/integrations.js#L542)
- Lê `evolution_url` + `evolution_key`; header `apikey`; timeout 8s. Lança `Error("Evolution <status>: <txt>")` em falha.

**Senders (todos POST, recebem `instancia`, `numero` + payload):**

| Função | Endpoint Evolution | Payload-chave |
|---|---|---|
| `evolutionEnviarTexto(inst, num, texto)` | `/message/sendText/{inst}` | `{ number, text }` |
| `evolutionEnviarBotoes(inst, num, {corpo, botoes})` | `/message/sendButtons/{inst}` | `buttons[]` (buttonId/displayText) |
| `evolutionEnviarLista(inst, num, {corpo, labelBotao, tituloSecao, itens})` | `/message/sendList/{inst}` | `sections[].rows[]` |
| `evolutionEnviarCTA(inst, num, {corpo, label, url})` | `/message/sendLink/{inst}` | `{ caption, title, linkPreview }` |
| `evolutionEnviarImagem(inst, num, {url, legenda})` | `/message/sendMedia/{inst}` | `mediatype:'image'` |
| `evolutionEnviarAudio(inst, num, {url})` | `/message/sendMedia/{inst}` | `mediatype:'audio'` |
| `evolutionEnviarArquivo(inst, num, {url, filename})` | `/message/sendMedia/{inst}` | `mediatype:'document'` |

---

## 9. Aliases para o motorFluxo

Exports que renomeiam/adaptam funções para os nós do motor ([integrations.js:592](../apps/api/src/services/integrations.js#L592)):

| Alias | Aponta para | Observação |
|---|---|---|
| `sgpBuscarCliente` | `consultarClientes` | — |
| `sgpBuscarBoletos` | `segundaViaBoleto` | — |
| `sgpVerificarStatus(contratoId)` | função própria | Consulta `consultacliente` **por contrato** e mapeia status |
| `sgpAbrirChamado({contratoId, tipoId, descricao, extras})` | `criarChamado` | **Assinatura por objeto** (≠ posicional) |
| `sgpPromessaPagamento` | `promessaPagamento` | — |
| `sgpListarPlanos` | `listarPlanos` | — |

> `sgpVerificarStatus` faz `POST /api/ura/consultacliente/` com `{ contrato }` e retorna `{ status, status_num, contrato }`.

---

## Apêndice: tabela de endpoints

| Endpoint | Método | Função | Helper |
|---|---|---|---|
| `/api/ura/consultacliente/` | POST form | `consultarClientes`, `sgpVerificarStatus` | `sgpPost` |
| `/api/ura/fatura2via/` | POST form | `segundaViaBoleto` | `sgpPost` |
| `/api/ura/liberacaopromessa/` | POST form | `promessaPagamento` | `fetch` direto |
| `/api/ura/chamado/` | POST JSON | `criarChamado` | `sgpPostJSON` |
| `/api/ura/verificaacesso/` | POST form | `verificarConexao` | `sgpPost` |
| `/api/ura/ocorrencia/list/` | POST JSON | `historicoOcorrencias` | `sgpPostJSON` |
| `/api/ura/planos/` | POST form | `listarPlanos` | `sgpPost` |
| `/api/ura/manutencao/list` | GET | `consultarManutencao` | `sgpGet` |
| `/ws/radius/radacct/list/all/` | POST form | `consultarRadius` | `fetch` direto |
| `/api/precadastro/vencimento/list` | POST form | `listarVencimentos` | `sgpPost` |
| `/api/precadastro/F` | POST form | `precadastrarCliente` | `sgpPost` |
| `/message/*/{instancia}` | POST JSON | senders Evolution | `evolutionRequest` |

---

## Observações

- **Autenticação SGP:** `app` + `token` em **todo** request (form ou JSON). Token NÃO é o JWT do painel.
- **`promessaPagamento` e `consultarRadius`** usam `fetch` direto (não os helpers) — payload montado manualmente.
- **Tolerância a versões do SGP:** quase todo retorno tem fallback de campos (`raw?.planos || raw?.data || []`, protocolo de 5 campos possíveis, etc.) porque o SGP varia nomes entre versões.
- **ACS** é o único bloco totalmente stub. Tudo o mais chama API real.

*Gerado a partir de `apps/api/src/services/integrations.js` (610 linhas) na branch `main` + edições locais.*
