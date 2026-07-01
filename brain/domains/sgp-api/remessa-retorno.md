---
title: "SGP API — Remessa / Retorno"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Remessa / Retorno", "API SGP Remessa / Retorno"]
tags: [sgp, api, reference, remessa-retorno]
---

# SGP API — Remessa / Retorno

Endpoints do módulo **Remessa / Retorno** da API do SGP (2). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Download Remessa
`POST /api/banco/remessa/download/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `portador` | sim | [Obrigatório] - ID do portador |
| `modelo_arquivo` | sim | [Obrigatório] - CNAB da remessa, escolhas são "CNAB240" ou "CNAB400" |
| `ocorrencias` | sim | [Obrigatório] - Código de movimentação dos títulos da remessa, ex: 01 = registro; 02 = baixa; |
| `data_inicial` | sim | [Obrigatório] - Títulos com vencimento à partir de (formato: "AAAA-MM-DD") |
| `data_final` | sim | [Obrigatório] - Títulos com vencimento até (formato: "AAAA-MM-DD") |
| `data_emissao_inicial` | — | Títulos gerados à partir de (formato: "AAAA-MM-DD") |
| `data_emissao_final` | — | Títulos gerados até (formato: "AAAA-MM-DD") |
| `status` | — | Status do contrato que possui os títulos. Escolhas: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;7=Reduzido |
| `pop` | — | ID do POP que o contrato (detentor dos títulos) deve possuir |
| `status_baixa` | — | Incluirá também na remessa de baixa (ocorrencias 02) títulos em aberto |

## Upload Retorno
`POST /api/banco/retorno/upload/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `portador` | sim | [Obrigatório] - ID do portador que receberá o retorno |
| `arquivo` | sim | [Obrigatório] - Arquivo de retorno, necessário anexar no endpoint |
| `previewcheck` | — | Não processa o retorno, dando apenas um feedback da anexação |
