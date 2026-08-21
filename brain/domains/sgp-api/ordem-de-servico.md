---
title: "SGP API — Ordem de Serviço"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Ordem de Serviço", "API SGP Ordem de Serviço"]
tags: [sgp, api, reference, ordem-de-servico]
---

# SGP API — Ordem de Serviço

Endpoints do módulo **Ordem de Serviço** da API do SGP (26). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Ordens de Serviço
`POST /api/os/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `filtro_data` | — | Garante a filtragem de agendamento inicial e final, independente de variáveis |
| `agendamento_inicial` | — | Data de agendamento inicial (formato: 'AAAA-MM-DD HH:mm:ss') |
| `agendamento_final` | — | Data de agendamento final (formato: 'AAAA-MM-DD HH:mm:ss') |
| `pop_id` | — | Retorna ordens de serviço vinculadas à contratos com esse ID de POP |
| `contrato_id` | — | Retorna ordens de serviço vinculadas ao contrato com esse ID |
| `cliente_id` | — | Retorna ordens de serviço vinculadas ao cliente com esse ID |
| `status_encerrada` | — | Retorna ordens de serviço que tenham data de finalização |
| `data_finalizacao` | — | Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD') |
| `orderby` | — | Ordenação dos resultados (Consultar documentação para valores) |

## Ordem de Serviço por ID
`POST /api/os/list/id/{os_id}`

(sem parâmetros além de auth)

## Ordens de Serviço Total
`POST /api/os/list/total/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `filtro_data` | — | Garante a filtragem de agendamento inicial e final, independente de variáveis |
| `agendamento_inicial` | — | Data de agendamento inicial (formato: 'AAAA-MM-DD') |
| `agendamento_final` | — | Data de agendamento final (formato: 'AAAA-MM-DD') |
| `pop_id` | — | Retorna ordens de serviço vinculadas à contratos com esse ID de POP |
| `contrato_id` | — | Retorna ordens de serviço vinculadas ao contrato com esse ID |
| `cliente_id` | — | Retorna ordens de serviço vinculadas ao cliente com esse ID |
| `status_encerrada` | — | Retorna ordens de serviço que tenham data de finalização |
| `data_finalizacao` | — | Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD') |
| `orderby` | — | Ordenação dos resultados (Consultar documentação para valores) |

## Alterar Ordem de Serviço
`POST /api/os/update/id/{os_id}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `os_servicoprestado` | — | Altera o conteúdo do serviço prestado |
| `os_observacao` | — | Altera o conteúdo da observação |
| `os_data_alteracao` | — | Define uma data de alteração (formato: 'AAAA-MM-DD HH:mm:ss') |
| `os_data_finalizacao` | — | Define uma data de finalização (formato: 'AAAA-MM-DD HH:mm:ss') |
| `checkin_data` | — | Define uma data de checkin (formato: 'AAAA-MM-DD HH:mm:ss') |
| `assinatura_cliente` | — | Assinatura do cliente em formato base64 |
| `assinatura_tecnico` | — | Assinatura do técnico em formato base64 |
| `assinatura_contrato` | — | Assinatura do contrato em formato base64 |
| `os_status` | — | Altera o status da O.S. (valores: 0 = 'Aberta'; 1 = 'Encerrada'; 2 = 'Em execução'; 3 = 'Pendente';) |
| `checkin_latitude` | — | Define a latitude da O.S. (ex: '-11.1313962') |
| `checkin_longitude` | — | Define a longitude da O.S. (ex: '-33.1017715') |
| `classificacao_adicionar` | — | IDs das Classificações a adicionar, separados por vírgula |
| `classificacao_remover` | — | IDs das Classificações a remover, separados por vírgula |

## Ordem de Serviço - A caminho
`POST /api/os/acaminho/id/{os_id}/`

(sem parâmetros além de auth)

## Imprimir Ordem de Serviço
`GET /api/os/print/id/{os_id}/`

(sem parâmetros além de auth)

## Ordem de Serviço - Anexar Imagem
`PUT /api/os/imagem/id/{os_id}/add/`

Parâmetro Tipo Descrição image_b64 string base64 file file Arquivo descricao string Descrição da Imagem Deve ser informado "image_b64" ou "file".

| Campo | Obrig. | Descrição |
|---|---|---|
| `file` | sim | [Obrigatório] - Imagem a ser anexada | Utilizar este ou image_base64 |
| `image_base64` | sim | [Obrigatório] - Imagem em base64 | Utilizar este ou file |
| `descricao` | — | Informar o nome da imagem, ou será gerado um |

## Ordem de Serviço - Alterar descrição da imagem
`POST /api/os/{os_id}/imagem/edit/`

Parâmetro Tipo Descrição arquivo string Nome do Arquivo descricao string Descrição da Imagem

| Campo | Obrig. | Descrição |
|---|---|---|
| `arquivo` | sim | [Obrigatório] - Nome do arquivo |
| `descricao` | sim | [Obrigatório] - Nova descrição |

## Ordem de Serviço - Imagem
`POST /api/os/{os_id}/imagem/detail/`

Parâmetro Tipo Descrição arquivo string Nome do Arquivo

| Campo | Obrig. | Descrição |
|---|---|---|
| `arquivo` | sim | [Obrigatório] - Nome do arquivo |

## Ordem de Serviço - Imagens
`GET /api/os/imagem/id/{os_id}/list/`

(sem parâmetros além de auth)

## Ordem de Serviço - Visualizar Anexo por ID
`GET  /api/os/imagem/{anexo_id}`

(sem parâmetros além de auth)

## Ordem de Serviço - Remover Imagem
`GET /api/os/imagem/{imagem_id}/delete/`

(sem parâmetros além de auth)

## Ordem de Serviço - Alterar Serviço
`POST /api/os/servico/update/id/{os_id}/`

Parâmetro Tipo Descrição set_mac string MAC del_mac integer Remover MAC? conexao_senha string Senha

| Campo | Obrig. | Descrição |
|---|---|---|
| `set_mac` | — | Define um novo MAC Autenticação |
| `del_mac` | — | Remove o MAC Autenticação |
| `conexao_senha` | — | Define uma nova senha do serviço (ex: Senha PPPoE) |

## Ordem de Serviço - Anotações
`POST /api/os/anotacoes/list/id/{os_id}/`

(sem parâmetros além de auth)

## Ordem de Serviço - Cadastrar Anotação
`POST /api/os/anotacoes/add/id/{os_id}/`

Parâmetro Tipo Descrição anotacao string Anotação

| Campo | Obrig. | Descrição |
|---|---|---|
| `anotacao` | sim | [Obrigatório] - Anotação a ser criada |

## Ordem de Serviço - Comentários (Ocorrência)
`POST /api/os/ocorrencia/comentario/list/id/{os_id}/`

(sem parâmetros além de auth)

## Ordem de Serviço - Cadastrar Comentário (Ocorrência)
`POST /api/os/ocorrencia/comentario/add/id/{os_id}/`

Parâmetro Tipo Descrição anotacao string Comentário

| Campo | Obrig. | Descrição |
|---|---|---|
| `anotacao` | sim | [Obrigatório] - Comentário a ser criado |

## Ordem de Serviço - Checklist
`GET /api/os/{os_id}/checklist/list/`

(sem parâmetros além de auth)

## Ordem de Serviço - Marcar/Desmarcar Checklist
`POST /api/os/checklist/{checklist_id}/toggle/`

Parâmetro Tipo Descrição is_checked string/int Está marcado? comentario string Comentário do checklist is_checked : "0" - False; "1" - True.

(sem parâmetros além de auth)

## Ordem de Serviço - Comentários
`GET /api/os/{os_id}/comentario/list/`

(sem parâmetros além de auth)

## Ordem de Serviço - Cadastrar Comentário
`POST /api/os/{os_id}/comentario/add/`

Parâmetro Tipo Descrição comentario string Comentário checklist_id int ID do Checklist

(sem parâmetros além de auth)

## Ordem de Serviço - Excluir Comentário
`POST /ws/os/{os_id}/comentario/delete/`

Parâmetro Tipo Descrição comentario_id integer Id do comentário [Obrigatário]

(sem parâmetros além de auth)

## Motivos
`GET /api/os/ocorrencia/motivo/list/`

(sem parâmetros além de auth)

## Métodos
`GET /api/os/ocorrencia/metodo/list/`

(sem parâmetros além de auth)

## Tipos
`GET /api/os/ocorrencia/tipo/list/`

(sem parâmetros além de auth)

## Setores
`GET /api/os/ocorrencia/setor/list/`

(sem parâmetros além de auth)
