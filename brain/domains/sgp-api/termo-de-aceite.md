---
title: "SGP API — Termo de Aceite"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Termo de Aceite", "API SGP Termo de Aceite"]
tags: [sgp, api, reference, termo-de-aceite]
---

# SGP API — Termo de Aceite

Endpoints do módulo **Termo de Aceite** da API do SGP (2). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Termo Exibir
`GET /api/contrato/termoaceite/{idcontrato}/`

(sem parâmetros além de auth)

## Termo Aceitar
`POST /api/contrato/termoaceite/{idcontrato}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `aceite` | sim | [Obrigatório] - Necessário enviar para aceitar |
