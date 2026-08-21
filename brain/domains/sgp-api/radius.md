---
title: "SGP API — RADIUS"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP RADIUS", "API SGP RADIUS"]
tags: [sgp, api, reference, radius]
---

# SGP API — RADIUS

Endpoints do módulo **RADIUS** da API do SGP (5). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Login PPPoE – Listar
`POST /ws/radius/radacct/list/all/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 100; Máximo: 1000*;) *Consulte documentação. |
| `username` | — | Login do serviço de internet - [Esse filtro pode ser usado sozinho] |
| `online` | — | Encontra-se online? (valores: 1 = 'Online; 0 = 'Offline';) - [Esse filtro pode ser usado sozinho] |
| `host` | — | IP em formato IPv4 ou IPv6. Também atende por framedipaddress - [Esse filtro pode ser usado sozinho] |
| `framedipaddress` | — | IP em formato IPv4 ou IPv6. Também atende por host - [Esse filtro pode ser usado sozinho] |
| `callingstationid` | — | Identificador do Calling Station - [Esse filtro pode ser usado sozinho] |
| `nasportid` | — | Identificador da porta NAS - [Esse filtro pode ser usado sozinho] |
| `last_session` | — | Retorna apenas a última sessão de cada cliente encontrado- [Esse filtro pode ser usado sozinho] |
| `cep` | — | CEP do endereço de instalação - [Esse filtro necessita de ao menos um outro] |
| `logradouro` | — | Logradouro do endereço de instalação - [Esse filtro necessita de ao menos um outro] |
| `bairro` | — | Bairro do endereço de instalação - [Esse filtro necessita de ao menos um outro] |
| `cidade` | — | Cidade do endereço de instalação - [Esse filtro necessita de ao menos um outro] |
| `uf` | — | UF do endereço de instalação - [Esse filtro necessita de ao menos um outro] |
| `tipopessoa` | — | Tipo de pessoa (valores: 'F' = Física; 'J' = Jurídica; 'E' = Estrangeira;) - [Esse filtro necessita de ao menos um outro] |
| `cpfcnpj` | — | CPF ou CNPJ do cliente - [Esse filtro necessita de ao menos um outro] |
| `notafiscal` | — | Procura por serviços que tenham notas fiscais geradas no período informado em data_inicial e data_final - [Esse filtro necessita de ao menos um outro] |
| `data_inicial` | — | Data de emissão inicial de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') - [Esse filtro necessita de ao menos um outro] |
| `data_final` | — | Data de emissão final de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') - [Esse filtro necessita de ao menos um outro] |
| `plano` | — | ID(s) do(s) Plano(s) de Internet - [Esse filtro necessita de ao menos um outro] |
| `pop` | — | ID(s) do(s) POP(s) - [Esse filtro necessita de ao menos um outro] |
| `grupo` | — | ID do grupo do contrato ou plano (Para valores, consulte a documentação pública) - [Esse filtro necessita de ao menos um outro] |
| `nas` | — | ID(s) do(s) NAS vinculado(s) ao(s) contrato(s) - [Esse filtro necessita de ao menos um outro] |
| `ipfixo` | — | Possui IP definido no contrato? (valor: 1) - [Esse filtro necessita de ao menos um outro] |
| `tipoconexao` | — | Tipo de conexão (Consulte valores na documentação pública) - [Esse filtro necessita de ao menos um outro] |
| `olt` | — | ID(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro] |
| `oltslot` | — | Identificador(es) do(s) slot(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro] |
| `pon` | — | Identificador(es) da(s) PON(s) - [Esse filtro necessita de ao menos um outro] |
| `calledstationid` | — | Identificador do Called Station - [Esse filtro necessita de ao menos um outro] |

## Login PPPoE – Detalhar Status
`POST /ws/radius/service/status/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `incluir_suspensos` | — | Passa a retornar também serviços suspensos. O padrão é retornar Ativos e Reduzidos. |

## Login PPPoE – Desconectar
`POST /ws/radius/disconnect/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login PPPoE a ser desconectado |

## Radius – Check Replies
`POST /ws/radius/{param}/list/`

param : radcheck radreply radgroupreply radusergroup

(sem parâmetros além de auth)

## Radius – Log
`GET /ws/radius/log/`

(sem parâmetros além de auth)
