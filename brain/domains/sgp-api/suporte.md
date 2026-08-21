---
title: "SGP API — Suporte"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Suporte", "API SGP Suporte"]
tags: [sgp, api, reference, suporte]
---

# SGP API — Suporte

Endpoints do módulo **Suporte** da API do SGP (9). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Serviço - Alterar
`POST /api/suporte/service/update/{servico_id}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `servico_tipo` | — | Tipo do serviço a ser alterado, padrão: Internet (Consulte a documentação para todos os valores) |
| `action` | — | Ação ser realizada (Consulte a documentação para todos os valores) |
| `mac` | — | Caso action seja 'change_mac', informar novo MAC aqui |
| `login` | — | Caso action seja 'change_login', informar novo login aqui |
| `login_password` | — | Caso action seja 'change_password', informar nova senha aqui |
| `map_ll` | — | Caso action seja 'change_endereco", informar a latitude e longitude aqui. Exemplo de formato: '-99.9999, -99.9999' |
| `serial` | — | Caso action seja 'change_serial', informar novo serial aqui |
| `cpemanager` | — | Caso action seja 'change_cpemanager', informar novo gerenciador de CPE aqui |
| `plano_id` | — | Informar ID do plano novo em caso de mudança de plano |

## Serviço Genérico - Criar
`POST /api/servico/generico`

| Campo | Obrig. | Descrição |
|---|---|---|
| `clientecontrato_id` | sim | [Obrigatório] - ID do contrato de serviço que terá o serviço genérico criado |
| `planobase_id` | sim | [Obrigatório] - ID do plano do serviço genérico |
| `descricao` | — | Descrição a ser salva |
| `identificador_gateway` | — | Informação a ser salva no "Gateway ID" |
| `identificador_gateway_extra` | — | Informação a ser salva no "Gateway Extra" |
| `login` | — | Login do serviço |
| `senha` | — | Senha do serviço |

## Serviço Genérico - Deletar
`DELETE /api/servico/generico/{id}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `clientecontrato_id` | sim | [Obrigatório] - ID do contrato de serviço que está vinculado à esse serviço |

## Contratos
`POST /api/suporte/contrato/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cliente_nome` | — | Nome do cliente vinculado ao contrato |
| `cliente_id` | — | ID do cliente vinculado ao contrato |
| `contrato_id` | — | Consultar especificamente o contrato com esse ID |
| `servico_login` | — | Consulta contratos que tenham serviços de internet, tv ou telefonia com esse login |
| `cliente_cpfcnpj` | — | Retorna contratos vinculados ao cliente desse CPF ou CNPJ |

## Cadastrar Cliente Documento
`PUT /api/suporte/cliente/{cliente_id}/documento/add/`

Parâmetro Tipo Descrição file file Arquivo descricao string Descrição do Documento

| Campo | Obrig. | Descrição |
|---|---|---|
| `file` | sim | [Obrigatório] - Arquivo que será criado |
| `descricao` | — | Descrição do arquivo. Se não informado, utilizará o original do arquivo |

## Alterar Cliente Documento
`POST /api/suporte/cliente/{cliente_id}/documento/edit/`

Parâmetro Tipo Descrição arquivo string Nome do Arquivo descricao string Descrição do Documento

| Campo | Obrig. | Descrição |
|---|---|---|
| `arquivo` | sim | [Obrigatório] - Nome do arquivo |
| `descricao` | sim | [Obrigatório] - Nova descrição |

## Cliente Documento
`POST /api/suporte/cliente/{cliente_id}/documento/detail/`

Parâmetro Tipo Descrição arquivo string Nome do Arquivo

| Campo | Obrig. | Descrição |
|---|---|---|
| `arquivo` | sim | [Obrigatório] - Nome do arquivo |

## Cliente Documentos
`GET /api/suporte/cliente/{cliente_id}/documento/list/`

(sem parâmetros além de auth)

## Remover Cliente Documento
`GET /api/suporte/cliente/{documento_id}/documento/delete/`

(sem parâmetros além de auth)
