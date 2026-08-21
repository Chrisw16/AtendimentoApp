---
title: "SGP API — URA"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP URA", "API SGP URA"]
tags: [sgp, api, reference, ura]
---

# SGP API — URA

Endpoints do módulo **URA** da API do SGP (69). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Cliente – Listar
`POST /api/ura/clientes/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 100; Máximo: 100;) |
| `cliente_id` | — | ID do cliente |
| `cpfcnpj` | — | CPF ou CNPJ do cliente |
| `cliente_nome` | — | Nome ou nome social |
| `plano` | — | ID do plano que o cliente deve ter |
| `login` | — | Login do serviço de internet |
| `contrato` | — | ID do contrato pertencente ao cliente |
| `status` | — | Retorna clientes que tenham títulos nesses status (Para valores, verifique a documentação pública) |
| `portador` | — | Retorna clientes que tenham títulos desse ID do portador |
| `telefone` | — | Contato telefônico do cliente |
| `pop` | — | ID do POP que o contrato do cliente deve ter |
| `contrato_status` | — | Retorna clientes com contratos nessa situação (Para valores, verifique a documentação pública) |
| `omitir_contratos` | — | Não imprime dados de contratos |
| `omitir_titulos` | — | Não imprime dados de títulos |
| `omitir_contatos` | — | Não imprime dados de contatos |
| `tipo_servico` | — | Retorna clientes que tenham o tipo de serviço especificado nesse parâmetro (Para valores, verifique a documentação pública) |
| `exibir_conexao` | — | Retorna se o cliente está conectado (internet) |
| `exibir_observacao_cliente` | — | Retorna observações do cadastro do cliente |
| `exibir_observacao_servicos` | — | Retorna observações do contrato do cliente |
| `data_cadastro_inicio` | — | Data de cadastro inicial do cliente. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_cadastro_fim` | — | Data de cadastro final do cliente. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_alteracao_inicio` | — | Data de alteração inicial do cadastro do cliente ou endereço. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_alteracao_fim` | — | Data de alteração final do cadastro do cliente ou endereço. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_vencimento_inicio` | — | Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_vencimento_fim` | — | Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_contrato_status_inicio` | — | Data de alteração inicial do status de um contrato. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_contrato_status_fim` | — | Data de alteração final do status de um contrato. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_pagamento_inicio` | — | Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_pagamento_fim` | — | Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `cto` | — | Filtra clientes pelo ID da CTO vinculada ao contrato de serviço |
| `cto_porta` | — | Filtra clientes pelo número da porta da CTO vinculada ao contrato de serviço |

## Cliente – Listagem Resumida
`POST /api/ura/listacliente/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `pop` | — | ID do POP a ser utilizado como filtro |
| `status` | — | Status do contrato |
| `status_data_inicial` | — | Data de alteração inicial do último status de contrato |
| `status_data_final` | — | Data de alteração final do último status de contrato |
| `tipo` | — | Tipo de pessoa a ser retornado | Utilizar F ou J |

## Cliente – Consultar
`POST /api/ura/consultacliente/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF ou CNPJ do cliente | Utilizar um dos filtros obrigatórios |
| `contrato` | sim | [Obrigatório] - ID do contrato do cliente | Utilizar um dos filtros obrigatórios |
| `nome` | sim | [Obrigatório] - Nome do cliente | Utilizar um dos filtros obrigatórios |
| `mac_controle` | sim | [Obrigatório] - Mac do serviço de internet do cliente | Utilizar um dos filtros obrigatórios |
| `mac_dhcp` | sim | [Obrigatório] - Mac DHCP do serviço de internet do cliente | Utilizar um dos filtros obrigatórios |
| `servico_serial` | sim | [Obrigatório] - Serial controle do serviço de internet do cliente | Utilizar um dos filtros obrigatórios |
| `onu_serial` | sim | [Obrigatório] - Phy Address da ONU do serviço de internet do cliente | Utilizar um dos filtros obrigatórios |
| `login` | sim | [Obrigatório] - Login do serviço do cliente (Utilizar este ou email) | Utilizar um dos filtros obrigatórios |
| `email` | sim | [Obrigatório] - Email (login) do serviço do cliente (Utilizar este ou login) | Utilizar um dos filtros obrigatórios |
| `senha` | — | Retorna clientes cujo contrato possuam essa senha (Utilizar em conjunto com login ou email) |
| `telefone` | — | Contato telefônico do cliente |
| `radius` | — | Retorna situação da sessão radius se aplicável |
| `incluir_unificados` | — | Considerará também contratos unificados (Padrão: ignora) |
| `tservico` | — | Busca por tipos de serviço (Para valores, verifique a documentação pública) |
| `status` | — | Busca por contratos atualmente nesse status. Pode informar mais de um por vírgula (Para valores, verifique a documentação pública) |
| `atrasado` | — | Retorna apenas quem possui títulos em atraso |
| `servicos_dados` | — | Detalha os serviços encontrados (O resultado da consulta pode aumentar consideravelmente) |
| `plano` | — | Busca por clientes que seus serviços possuam o ID do plano informado nesse parâmetro |
| `titulo_status` | — | Retorna quem possuir títulos nesse status (valores: 'abertos'; 'pagos'; 'cancelados';) |
| `exibir_observacao_cliente` | — | Retorna observações do cadastro do cliente |
| `exibir_observacao_servicos` | — | Retorna observações do contrato do cliente |
| `pop` | — | Busca por contratos que sejam desse POP (ID) |
| `assinatura_eletronica` | — | Retornam as assinaturas eletrônicas dos contratos |
| `exibir_historico_status` | — | Retornam os últimos 50 status do contrato consultado |

## Cliente - Sem Fatura
`POST /api/ura/clientes/semfatura/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `periodo` | — | Período de consulta (Formato AAAA-MM) |

## Contato – Criar
`POST /api/ura/contato/add/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contato` | sim | [Obrigatório] - Contato a ser cadastrado |
| `contrato` | sim | [Obrigatório] - ID do contrato do cliente que terá o contato vinculado |
| `tipo` | — | Tipo do contato, padrão: Celular Pessoal (Para valores, verifique a documentação pública) |

## Viabilidade – Consultar
`POST /api/ura/viabilidade/`

Consulta Viabilidade

| Campo | Obrig. | Descrição |
|---|---|---|
| `logradouro` | sim | [Obrigatório] - Consulta por logradouro | Utilizar um dos filtros obrigatórios |
| `numero_inicial` | sim | [Obrigatório] - Consulta à partir de um certo número da rua | Utilizar um dos filtros obrigatórios |
| `numero_final` | sim | [Obrigatório] - Consulta até um certo número da rua | Utilizar um dos filtros obrigatórios |
| `bairro` | sim | [Obrigatório] - Consulta por bairro | Utilizar um dos filtros obrigatórios |
| `cep` | sim | [Obrigatório] - Consulta por CEP | Utilizar um dos filtros obrigatórios |
| `cidade` | sim | [Obrigatório] - Consulta pela cidade | Utilizar um dos filtros obrigatórios |

## Viabilidade – Consultar via Gateway
`GET /api/ura/viabilidadeinstalacao`

Parâmetro Tipo Descrição gateway integer ID da Gateway de mapas raio integer Raio de consulta coordenada string Coordenada do ponto a ser consultado (Modelo "X.XXXXX,Y.YYYYY")

(sem parâmetros além de auth)

## Contrato – Listar
`POST /api/ura/listacontrato/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | — | ID do contrato |
| `plano` | — | ID do plano vinculado ao contrato |
| `tipo` | — | Tipo da pessoa (Para valores, verifique a documentação pública) |
| `status` | — | Status atual (ID) do contrato (Para valores, verifique a documentação pública) |
| `exibir_endereco` | — | Detalha o endereço do contrato |

## Contrato – Atualizar
`POST /api/ura/contrato/edit/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `sms_desativado` | — | Altera o campo de SMS Desativado (1=Ativa;0=Inativa;) |
| `forma_cobranca` | — | Altera a forma de cobrança do contrato (Para valores, verifique a documentação pública) |
| `portador` | — | Altera o portador do contrato (informar ID) |
| `debito_banco` | — | Altera o código do banco para débito automático (3 dígitos) |
| `debito_agencia` | — | Altera a agência para débito automático (4 dígitos) |
| `debito_conta` | — | Altera a conta para débito automático (Informar conta com dígito, sem traço) |
| `tag_add` | — | Adiciona tags ao contrato (Informar IDs, ex.: 1,2,3) |
| `tag_remove` | — | Remove tags do contrato (Informar IDs, ex.: 1,2,3) |

## Contrato – Imprimir
`GET /api/contratos/print/{tipo_contrato}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | ID do contrato (Obrigatório para autenticação token+app, e recomendado para as outras) |
| `cpfcnpj` | — | CPF ou CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha |
| `usuario` | — | Usuário de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha |
| `senha` | — | Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha |

## Contrato – Liberação por Confiança
`POST /api/ura/liberacaopromessa/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `data_promessa` | — | Informa uma data de promessa customizada (formato: "AAAA-MM-DD") |
| `uracontato` | — | Retorna o valor informado nesse parâmetro na resposta da requisição |
| `enviar_sms` | — | Dispara um SMS ou Whatsapp para informar ao cliente da liberação |
| `uraIP` | — | Salva o valor informado nesse parâmetro nas observações da promessa de pagamento |
| `conteudo` | — | Substitui o conteúdo da ocorrência aberta ao realizar a liberação |

## Serviço Internet – Verificar disponibilidade
`POST /api/ura/verificaacesso/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato | Utilizar um dos filtros obrigatórios |
| `telefone` | sim | [Obrigatório] - Contato vinculado ao cliente | Utilizar um dos filtros obrigatórios |
| `status_all` | — | Também retorna contratos suspensos (Padrão: apenas ativos e reduzidos) |
| `status_filter` | — | Retorna apenas os status especificados (Para valores, verifique a documentação pública) |
| `uracontato` | — | Retorna o valor informado nesse parâmetro na resposta da requisição |
| `protocolo_ura` | — | Abre uma ocorrência. Caso o serviço esteja em manutenção, a ocorrência será aberta por padrão |

## Portador – Listar
`GET /api/ura/portador/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Motivos de Status – Listar
`POST /api/ura/contrato/status/motivos/`

(sem parâmetros além de auth)

## Status do Contrato – Atualizar
`POST /api/ura/contrato/status/edit/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `status` | sim | [Obrigatório] - ID do novo status (Para valores, verifique a documentação pública) |
| `motivo` | — | ID do novo motivo (Para valores, verifique a documentação pública) |

## Senha do Serviço – Atualizar
`POST /api/ura/cliente/servico/senha/edit/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `servico` | sim | [Obrigatório] - ID do serviço que será alterado |
| `tipo` | sim | [Obrigatório] - ID do tipo de serviço (Para valores, verifique a documentação pública) |
| `senha` | sim | [Obrigatório] - Nova senha do serviço |

## CPE Manage – Consultar
`GET /api/ura/cpemanage/`

(sem parâmetros além de auth)

## CPE Manage – Atualizar
`POST /api/ura/cpemanage/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato de serviço (também responde por 'clientecontrato') |
| `servico` | — | ID do serviço a ser consultado (Caso o contrato possua múltiplos serviços, informar o id do correto) |
| `wifi_status` | — | Alterar situação da Wifi ('on' / 'off') |
| `novo_ssid` | — | Alterar nome da Wifi |
| `nova_senha` | — | Alterar senha da Wifi |
| `wifi_status_5g` | — | Alterar situação da Wifi 5GHz ('on' / 'off') |
| `novo_ssid_5g` | — | Alterar nome da Wifi 5GHz |
| `nova_senha_5g` | — | Alterar senha da Wifi 5GHz |

## Plano – Listar
`GET /api/ura/consultaplano/`

Parâmetro (Body) Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) Parâmetro (Query) Tipo Descrição pop integer Retornar apenas planos vinculados à esse POP (ID)

(sem parâmetros além de auth)

## Feriado – Listar
`GET /api/model/feriado/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) pop integer ID do Pop tipo integer ID do Tipo ano integer Ano do Feriado mes integer Mês do Feriado tipo : 1 = Municipal; 2 = Estadual; 3 = Nacional;

(sem parâmetros além de auth)

## Classificação - Listar
`GET /api/ura/classificacoes/list/`

(sem parâmetros além de auth)

## Configurações (Variáveis) – Listar
`POST /api/ura/configuracoes/`

Listar Configurações

| Campo | Obrig. | Descrição |
|---|---|---|
| `configuracao` | — | Consulta se há essa variável ativa na base |

## Notificação no Sistema – Criar
`POST /api/ura/notificacaosistema/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato | Informar este ou cpfcnpj |
| `cpfcnpj` | sim | [Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato |
| `uracontato` | — | Retorna o valor informado nesse parâmetro na resposta da requisição |
| `uraagent` | — | Retorna o valor informado nesse parâmetro na resposta da requisição |

## Ocorrência – Listar
`POST /api/ura/ocorrencia/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 1000; Máximo: 1000;) |
| `ocorrencia` | — | Filtra pelo número da ocorrência |
| `status` | — | Filtra pelo status da ocorrência (Para valores, verifique a documentação pública) |
| `pop` | — | ID do POP vinculado ao contrato de serviço vinculado à ocorrência |
| `tipo` | — | ID do tipo de ocorrência |
| `contrato` | — | ID do contrato de serviço vinculado à ocorrência |
| `contrato_status` | — | Status atual do contrato de serviço vinculado à ocorrência (Para valores, verifique a documentação pública) |
| `data_cadastro_inicio` | — | Data de cadastro inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_cadastro_fim` | — | Data de cadastro final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_cadastro_inicio` | — | Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM) |
| `hora_cadastro_fim` | — | Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM) |
| `data_agendamento_inicio` | — | Data de agendamento inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_agendamento_fim` | — | Data de agendamento final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_agendamento_inicio` | — | Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM) |
| `hora_agendamento_fim` | — | Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM) |
| `data_finalizacao_inicio` | — | Data de finalização inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_finalizacao_fim` | — | Data de finalização final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_finalizacao_inicio` | — | Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM) |
| `hora_finalizacao_fim` | — | Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM) |

## Ordem de Serviço – Listar
`POST /api/ura/ordemservico/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 1000; Máximo: 1000;) |
| `ordem_servico` | — | Filtra pelo ID da ocorrência |
| `status` | — | Filtra pelo status da O.S. (Para valores, verifique a documentação pública) |
| `pop` | — | ID do POP vinculado ao contrato de serviço vinculado à O.S. |
| `motivo` | — | ID do motivo da O.S. |
| `contrato` | — | ID do contrato de serviço vinculado à O.S. |
| `contrato_status` | — | Status atual do contrato de serviço vinculado à O.S. (Para valores, verifique a documentação pública) |
| `data_cadastro_inicio` | — | Data de cadastro inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_cadastro_fim` | — | Data de cadastro final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_cadastro_inicio` | — | Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM) |
| `hora_cadastro_fim` | — | Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM) |
| `data_agendamento_inicio` | — | Data de agendamento inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_agendamento_fim` | — | Data de agendamento final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_agendamento_inicio` | — | Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM) |
| `hora_agendamento_fim` | — | Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM) |
| `data_finalizacao_inicio` | — | Data de finalização inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_finalizacao_fim` | — | Data de finalização final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `hora_finalizacao_inicio` | — | Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM) |
| `hora_finalizacao_fim` | — | Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM) |

## Método de Ocorrência – Listar
`GET /api/ura/ocorrencia/metodo/list/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Técnico – Listar
`POST /api/ura/tecnicos/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Chamado – Criar
`POST /api/ura/chamado/`

Parâmetro Tipo Descrição token string Token da Aplicação no SGP (obrigatório) app string Nome da Aplicação no SGP (obrigatório) contrato integer ID do Contrato (obrigatório) conteudo string Conteúdo da ocorrência e ordem de serviço conteudolimpo integer Remove a mensagem padrão de abertura vira URA observacao string Conteúdo do campo de observações ocorrenciatipo integer Código do Tipo de Ocorrência, Padrão 5 tipoclassificacoes array IDs das classificações a serem vinculadas na ocorrência. Ex.: [10, 15] metodo integer Código do Método da ocorrência setor integer ID do Setor usuario string Username do usuário que ficará como quem abriu a ocorrência responsaveloc string Username do usuário que ficará como responsável da ocorrência contato_nome string Nome do contato na ocorrência contato_telefone string Telefone do contato na ocorrência desativa_os integer Não abrir ordem de serviço status_encerrado integer Criar a ocorrência e ordem de serviço já encerradas notificar_cliente integer Notifica o cliente do encerramento da ocorrência caso ela seja criada já encerrada motivoos integer Código do Motivo da ordem de serviço motivoclassificacoes array IDs das classificações a serem vinculadas na ordem de serviço. Ex.: [10, 15] responsavel string Username do usuário que ficará como técnico responsável da ordem de serviço data_hora_agendamento string Data e hora do agendamento para ocorrências e ordens de serviço, formato: "AAAA-MM-DD HH:MM" sms_tecnico integer Avisa ao técnico responsável por SMS/WhatsApp da abertura da ordem de serviço. Necessário ter data_hora_agendamento e gateway de disparo integrada tipo_servico string Nome do tipo de serviço. Valores aceitos: "internet","telefonia","tv,"multimidia","generico" servico_id integer ID pertencente ao serviço do contrato do cliente. Requisição metodo : Consultar códigos em {{url}}/api/ura/ocorrencia/metodo/list/ Observações: Para vincular um serviço específico na ocorrência é necessário informar os parâmetros tipo_servico e servico_id

Body (raw):
```
{
    "token": "{{token}}",
    "app": "{{app}}",
    "contrato": 308,
    "ocorrenciatipo": 30,
    "tipoclassificacoes": [5]
}
```

## Chamado – Anexar Áudio
`POST /api/ura/audio/add/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `protocolo` | sim | [Obrigatório] - Número da ocorrência que terá o áudio vinculado |
| `url` | sim | [Obrigatório] - Endereço (URL) do áudio que será vinculado |

## POP – Listar
`POST /api/ura/pops/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Empresa – Listar
`POST /api/ura/empresas/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) cnpj string CNPJ da Empresa

| Campo | Obrig. | Descrição |
|---|---|---|
| `cnpj` | — | CNPJ da empresa |

## Fornecedor – Listar
`POST /api/ura/fornecedores/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | — | CPF ou CNPJ do fornecedor |

## Tipo de Documento (Conta) – Listar
`POST /api/ura/contas/tiposdocumentos/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Conta à Pagar/Receber – Listar
`POST /api/ura/contas/{tipo}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 100; Máximo: 500;) |
| `descricao` | — | Descrição da conta à pagar ou receber |
| `nota_fiscal` | — | Número da nota fiscal vinculada a conta à pagar ou receber |
| `status` | — | Status da conta à pagar ou receber (Para valores, verifique a documentação pública) |
| `tipo_documento` | — | "Tipo Documento" selecionado na conta à pagar ou receber |
| `plano_contas` | — | ID do plano de contas vinculado a conta à pagar ou receber |
| `empresa` | — | ID da empresa vinculado a conta à pagar ou receber |
| `pop` | — | ID do POP vincualdo a conta à pagar ou receber |
| `fornecedor` | — | ID do fornecedor vincualdo a conta à pagar ou receber |
| `usuario` | — | Nome do usuário que cadastrou a conta à pagar ou receber |
| `data_cadastro_inicio` | — | Data de cadastro inicial da conta à pagar ou receber (formato: "AAAA-MM-DD") |
| `data_cadastro_fim` | — | Data de cadastro final da conta à pagar ou receber (formato: "AAAA-MM-DD") |
| `data_vencimento_inicio` | — | Data de vencimento inicial da conta à pagar ou receber (formato: "AAAA-MM-DD") |
| `data_vencimento_fim` | — | Data de vencimento final da conta à pagar ou receber (formato: "AAAA-MM-DD") |
| `data_pagamento_inicio` | — | Data de pagamento inicial da conta à pagar ou receber (formato: "AAAA-MM-DD") |
| `data_pagamento_fim` | — | Data de pagamento final da conta à pagar ou receber (formato: "AAAA-MM-DD") |

## Plano de Contas – Listar
`POST /api/ura/planoscontas/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Ponto de Recebimento – Listar
`POST /api/ura/pontosrecebimentos/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Fatura – Listar
`POST /api/ura/titulos/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `offset` | — | Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 250; Máximo: 250;) |
| `titulo_id` | — | ID do título |
| `cliente_id` | — | ID do cliente vinculado aos títulos |
| `cpfcnpj` | — | CPF ou CNPJ do cliente vinculado aos títulos |
| `contrato` | — | ID do contrato de serviço vinculado aos títulos |
| `status` | — | Filtrar determinados status de títulos (escolhas: 'abertos'; 'pagos'; 'cancelados';) |
| `portador` | — | ID do portador gerador dos títulos |
| `ordenar` | — | Ordena os títulos em 3 modos (escolhas: 'data_documento'; 'data_vencimento'; 'data_pagamento';) |
| `ordenar_ordem` | — | Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';) |
| `empresa_cnpj` | — | CNPJ da empresa vinculada aos títulos. É possível enviar mais de um CNPJ separando por vírgula. |
| `tipo_pessoa` | — | Tipo de pessoa vinculada aos títulos. As escolhas são F (Física), J (Jurídica), E (Estrangeira Física) e EJ (Estrangeira Jurídica). |
| `data_vencimento_inicio` | — | Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_vencimento_fim` | — | Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_pagamento_inicio` | — | Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") |
| `data_pagamento_fim` | — | Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_cancelamento_inicio` | — | Data de cancelamento inicial dos títulos. Se utilizado sozinho, filtrará títulos cancelados especificamente nesse dia (formato: "AAAA-MM-DD") |
| `data_cancelamento_fim` | — | Data de cancelamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |
| `data_acordo_inicio` | — | Títulos de acordo de pagamento gerados à partir dessa data. Se utilizado sozinho, filtrará títulos de acordo gerados especificamente nesse dia (formato: "AAAA-MM-DD") |
| `data_acordo_fim` | — | Títulos de acordo de pagamento gerados até essa data. Utilizar junto com a inicial (formato: "AAAA-MM-DD") |

## Fatura – Segunda via
`POST /api/ura/fatura2via/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato |
| `contrato` | sim | [Obrigatório] - ID do contrato do cliente | Informar este ou cpfcnpj |
| `telefone` | — | Se informado, tentará inferir o cpfcnpj à partir do número de telefone |
| `notafiscal` | — | Trará também nota fiscal, se existir |
| `faturas_abertas_todas` | — | Retorna todos os títulos válidos |
| `numero_documento` | — | Filtra especificamente um número de documento |
| `ocorrencia_conteudo` | — | A ocorrência aberta terá o conteúdo informado nesse parâmetro |
| `nao_gerar_os` | — | Não gera chamado para essa solicitação |
| `tipo_ordenacao` | — | Ordena os títulos em 2 modos (escolhas: 'data_documento'; 'data_vencimento';) |
| `modo_ordenacao` | — | Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';) |
| `link_pdf` | — | Caso exista um link de título, o mesmo ficará com ".pdf" no final do link |

## Fatura – Gerar PIX
`POST /api/ura/pagamento/pix/{fatura}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato vinculado ao título que será gerado/retornado o PIX |

## Fatura – Enviar
`POST /api/ura/enviafatura/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `tipo` | — | Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email" |
| `email` | — | Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato |
| `celular` | — | Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao invés do celular do contrato |
| `numero_documento` | — | Dispara, especificamente, o título com o número de documento especificado nesse parâmetro |
| `mensagem` | — | Especifica a mensagem disparada |
| `conteudo` | — | Informa o conteúdo da ocorrência de envio que será aberta. Padrão: 'Envio de Fatura via URA' |
| `link_pdf` | — | Caso exista um link de título, o mesmo ficará com ".pdf" no final do link |

## Fatura – Liquidar
`POST /api/banco/titulo/{fatura_id}/baixar/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `data_pagamento` | sim | [Obrigatório] - Data de pagamento do título (formato: 'AAAA-MM-DD') |
| `valor_pago` | sim | [Obrigatório] - Valor pago do título (ex: '51.52') |
| `ponto_recebimento` | — | ID do caixa de liquidação. Se não informado, procurará o caixa vinculado ao portador do boleto |
| `forma_pagamento` | — | Forma de pagamento. Padrão: 'Dinheiro' (valores: 'DINHEIRO', 'CARTAO', 'DEBITO', 'PIX') |
| `tarifas` | — | Tarifa do título (ex: '0.15') |
| `liquidacao_parcial` | — | Informa se será uma liquidação parcial. Valor: 1 |
| `desconto` | — | Define um desconto para a liquidação parcial |
| `motivodesconto` | — | Descreve o motivo do desconto, caso exista |
| `observacao` | — | Observação extra para que seja salva no título |

## Fatura – Estornar
`POST /api/banco/titulo/{fatura_id}/estornar/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) pontoRecebimento integer ID do Ponto de Recebimento (obrigatório) estorno_parcial integer Informa se será um estorno de uma liquidação parcial. Valor: 1 caixalancamento_id integer Informa o ID do caixa que será utilizado no estorno Requisição fatura_id: ID da Fatura ponto_recebimento: Ponto de Recebimento que será utilizado no lançamento de estorno no caixa; Consultar IDs dos pontos de recebimento em {{url}}/api/ura/pontosrecebimentos/ Consultar IDs dos lançamentos de caixa em {{url}}/api/banco/titulo/{fatura_id}/pagamento/list Para permitir estornar, é necessário que o portador tenha a checkbox "Permite Estornar Título via API" marcada.

Body (raw):
```
{
    "token": "{{token}}",
    "app": "{{app}}",
    "pontoRecebimento": 1,
    "caixalancamento_id": 2,
    "estorno_parcial": 1
}
```

## Fatura – Listar lançamentos de caixa (Liquidação parcial)
`POST /api/banco/titulo/{fatura_id}/pagamento/list`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) Requisição fatura_id: ID da Fatura OBS Atualmente retornam resultados exclusivamente para liquidações feitas de forma parcial.

(sem parâmetros além de auth)

## Fatura – Cancelar
`POST /api/banco/titulo/{fatura_id}/cancelar/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `motivo` | sim | [Obrigatório] - Descreva o motivo do cancelamento |
| `naolibera` | — | Não realiza liberação dos serviços mediante cancelamento |
| `cancelar_nf` | — | Se existirem notas fiscais para o título, as cancela também |
| `taxa_baixa_lanc` | — | Solicita o lançamento da taxa de cancelamento. A taxa deve estar configurada no portador |

## Fatura – Descancelar
`POST /api/banco/titulo/{fatura_id}/descancelar/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) Requisição fatura_id: ID da Fatura Para permitir descancelar, é necessário que o portador tenha a checkbox "Permite Descancelar Título via API" marcada.

(sem parâmetros além de auth)

## Fatura – Gerar Mensalidade
`POST /api/ura/cliente/mensalidade/avulsa/add/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato que terá a mensalidade gerada |
| `ano` | sim | [Obrigatório] - Ano de validade da mensalidade |
| `mes` | sim | [Obrigatório] - Mês de validade da mensalidade |
| `ignorar_titulos_cancelados` | — | Ignora títulos cancelados na tentativa de geração |
| `gerar_proporcional` | — | Tenta uma geração proporcional (funcional para o primeiro título do contrato) |
| `gerar_pix` | — | Solicita a geração do PIX junto com a criação da mensalidade |

## Fatura - Gerar Título
`POST /api/ura/cliente/titulo/avulso/add/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) contrato int ID do Contrato (obrigatório) portador int ID do Portador (obrigatório) parcelas int Número de Parcelas (obrigatório) valor decimal Valor (obrigatório) data_vencimento string Data de Vencimento, formato "AAAA-MM-DD" (obrigatório) desconto_vencimento decimal Valor do Desconto Vencimento observacao string Observação plano_contas int ID do Plano de Contas (obrigatório) demonstrativo string Demonstrativo

(sem parâmetros além de auth)

## Fatura – Gerar Acordo de Pagamento
`POST /api/ura/acordopagamento`

Parâmetros obrigatórios Tipo Descrição token string Token da Aplicação no SGP (obrigatório token+app ou username+password) app string Nome da Aplicação no SGP (obrigatório token+app ou username+password) titulo_sync array Servirá em breve para definir manualmente os parâmetros do título. Enviar [] por enquanto (obrigatório) cliente integer ID do Cliente que terá o acordo gerado titulos array IDs dos títulos englobados pelo acordo. Enviar os ids separados por vírgula em [] contrato integer ID do Contrato que terá o acordo gerado centrodecusto integer ID do Plano de Contas desse acordo portador integer ID do Portador que originará o acordo parcelas integer Quantidade de parcelas do acordo valor float Valor total do acordo data_vencimento string Data de vencimento da primeira parcela do acordo desconto_venc float Desconto até o vencimento do acordo tolerancia_dias integer Dias de tolerância do acordo Parâmetros opcionais Tipo Descrição Exemplo de Valor liberar_servico string Informar se a criação do acordo deve liberar o serviço "True" cancelar_contrato_automatico string Define a checkbox de cancelar contrato automático no acordo "True" cancelar_titulos_automatico string Define a checkbox de cancelar títulos automaticamente no acordo "True" entrada_valor float Define o valor de entrada do acordo, caso exista 50.00 entrada_centrodecusto integer Define, pelo ID, qual o plano de contas dessa entrada 9 entrada_pontorecebimento integer Define, pelo ID, em qual caixa será lançado o valor de entrada 1 entrada_formapagamento integer Define, pelo ID, qual a forma de pagamento dessa entrada 1 entrada_data_baixa string Define a data de liquidação dessa entrada "2025-01-31" gerar_titulo_entrada string Define que a entrada será criada como um título "True" entrada_portador integer Define o ID do portador que criará a entrada 1 Caso o acordo tenha uma entrada, os parâmetros de nome entrada_valor e entrada_centrodecusto devem ser utilizados com: entrada_pontorecebimento entrada_formapagamento entrada_data_baixa OU gerar_titulo_entrada entrada_portador

Body (raw):
```
{
    "token": "{{token}}",
    "app": "{{app}}",
    "cliente": 1,
    "titulos": [1,2],
    "contrato": 1,
    "centrodecusto": 9,
    "portador": 1,
    "parcelas": 2,
    "valor": 258.25,
    "data_vencimento": "2025-01-31",
    "desconto_venc": 5.00,
    "tolerancia_dias": 2,
    "titulo_sync": []
}
```

## NFe - Listar
`POST /api/ura/nfe/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `chave` | — | Chave de acesso da noa fiscal eletrônica (44 dígitos) |
| `data_emissao_inicio` | — | Data de emissão inicial da nota fiscal. Se informada, informar também a final. (formato: 'AAAA-MM-DD') |
| `data_emissao_fim` | — | Data de emissão final da nota fiscal. Se informada, informar também a inicial. (formato: 'AAAA-MM-DD') |

## NFe - Importar
`POST /api/ura/nfe/importar/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) xml file Arquivo XML

| Campo | Obrig. | Descrição |
|---|---|---|
| `xml` | sim | [Obrigatório] - Arquivo XML da nota fiscal eletrônica |

## NFe - Enviar
`POST /api/ura/nfe/enviar/{{id_nota}}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório se NFe vinculada ao contrato] - ID do contrato de serviço. |
| `email` | — | [Opcional] - Email destinatário. |

## NAS - Listar
`POST /api/ura/nas/list/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

Body (raw):
```
{
    "app": {{app}},
    "token": {{token}}
}
```

## SMS - Gateways
`GET /api/sms/gateway/list/`

(sem parâmetros além de auth)

## SMS - Enviar
`GET /api/sms/send/`

Parâmetro Tipo Descrição phone string Telefones, separados por vírgula (obrigatório) msg string Mensagem (obrigatório) gateway int ID da Gateway (obrigatório) idcliente int ID do Cliente, funcionalidade a depender da Gateway idcontrato int ID do Contrato, funcionalidade a depender da Gateway link_url string URL da fatura/pix/anexo, funcionalidade a depender da Gateway

(sem parâmetros além de auth)

## Manutenção - Listar
`GET /api/ura/manutencao/list/`

(sem parâmetros além de auth)

## Manutenção - Cadastrar
`POST /api/ura/manutencao/add/`

Parâmetro Tipo Descrição descricao string Descrição da Manutenção (Obrigatório) data_inicial string Data Inicial da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" (Obrigatório) data_final string Data Final da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" (Obrigatório) severidade int Severidade da Manutenção (Obrigatório) status int Status da Manutenção (Obrigatório) observacoes string Observações da Manutenção mensagem_central string Mensagem da Central mensagem_ura string Mensagem da URA enviar_sms int Enviar SMS? ativa int Ativa? pops string IDs dos Pops, separados por vírgula nas string IDs dos NAS, separados por vírgula aps string IDs dos APs, separados por vírgula sources string IDs das Fontes, separadas por vírgula switches string IDs dos Switches, separados por vírgula olts string IDs das OLTs, separadas por vírgula oltpons string IDs das PONs, separadas por vírgula ctos string IDs das CTOs, separadas por vírgula enviar_sms : 0 = False; 1 = True. ativa : 0 = False; 1 = True. severidade : 0 = Desconhecido; 1 = Operacional; 2 = Problemas de performance; 3 = Indisponibilidade parcial; 4 = Indisponibilidade total. status : 0 = Desconhecido; 1 = Investigando; 2 = Identificado; 3 = Observando; 4 = Resolvido. pops : Listar os Pops no endpoint: {{url}}/api/ura/pops/ nas : Listar os NAS no endpoint: {{url}}/api/ura/nas/list/ aps : Listar os APs no endpoint: {{url}}/api/ura/ap/list/ sources : Listar os Sources no endpoint: {{url}}/api/ura/fonte/list/ switches : Listar os Switches no endpoint: {{url}}/api/ura/switch/list/ olts : Listar as OLTs no endpoint: {{url}}/api/fttx/olt/list/ oltpons : Listar as PONs no endpoint: {{url}}/api/fttx/olt/{olt_id}/pon/list/ ctos : Listar as CTOs no endpoint: {{url}}/api/fttx/splitter/all/

(sem parâmetros além de auth)

## Manutenção - Alterar
`POST /api/ura/manutencao/edit/`

Parâmetro Tipo Descrição manutencao int ID da Manutenção descricao string Descrição da Manutenção data_inicial string Data Inicial da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" data_final string Data Final da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" observacoes string Observações da Manutenção mensagem_central string Mensagem da Central mensagem_ura string Mensagem da URA enviar_sms int Enviar SMS? ativa int Ativa? severidade int Severidade da Manutenção status int Status da Manutenção pops_adicionar string IDs dos Pops, separados por vírgula pops_remover string IDs dos Pops, separados por vírgula nas_adicionar string IDs dos NAS, separados por vírgula nas_remover string IDs dos NAS, separados por vírgula aps_adicionar string IDs dos APs, separados por vírgula aps_remover string IDs dos APs, separados por vírgula sources_adicionar string IDs das Fontes, separadas por vírgula sources_remover string IDs das Fontes, separadas por vírgula switches_adicionar string IDs dos Switches, separados por vírgula switches_remover string IDs dos Switches, separados por vírgula olts_adicionar string IDs das OLTs, separadas por vírgula olts_remover string IDs das OLTs, separadas por vírgula oltpons_adicionar string IDs das PONs, separadas por vírgula oltpons_remover string IDs das PONs, separadas por vírgula ctos_adicionar string IDs das CTOs, separadas por vírgula ctos_remover string IDs das CTOs, separadas por vírgula enviar_sms : 0 = False; 1 = True. ativa : 0 = False; 1 = True. severidade : 0 = Desconhecido; 1 = Operacional; 2 = Problemas de performance; 3 = Indisponibilidade parcial; 4 = Indisponibilidade total. status : 0 = Desconhecido; 1 = Investigando; 2 = Identificado; 3 = Observando; 4 = Resolvido. pops : Listar os Pops no endpoint: {{url}}/api/ura/pops/ nas : Listar os NAS no endpoint: {{url}}/api/ura/nas/list/ aps : Listar os APs no endpoint: {{url}}/api/ura/ap/list/ sources : Listar os Sources no endpoint: {{url}}/api/ura/fonte/list/ switches : Listar os Switches no endpoint: {{url}}/api/ura/switch/list/ olts : Listar as OLTs no endpoint: {{url}}/api/fttx/olt/list/ oltpons : Listar as PONs no endpoint: {{url}}/api/fttx/olt/{olt_id}/pon/list/ ctos : Listar as CTOs no endpoint: {{url}}/api/fttx/splitter/all/

(sem parâmetros além de auth)

## Manutenção - Deletar
`POST /api/ura/manutencao/delete/`

Parâmetro Tipo Descrição manutencao int ID da Manutenção

(sem parâmetros além de auth)

## AP - Listar
`GET /api/ura/ap/list/`

(sem parâmetros além de auth)

## Fonte - Listar
`GET /api/ura/fonte/list/`

(sem parâmetros além de auth)

## Switch - Listar
`GET /api/ura/switch/list/`

(sem parâmetros além de auth)

## Proteção de Crédito - Consulta Documento
`GET /api/ura/documento/consulta/gateway/{id_gateway}/?documento=&uf=&adicionais=`

(sem parâmetros além de auth)

## Proteção de Crédito - Adicionais
`GET /api/ura/consulta/adicionais/gateway/{id_gateway}/?tipo_pessoa`

(sem parâmetros além de auth)

## Proteção de Crédito - Listar Gateways
`GET /api/ura/gatewaysserasa/list`

Parâmetro Tipo Descrição token string Token da Aplicação no SGP (obrigatório) app string Nome da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Anotações - Adicionar
`POST /api/ura/cliente/anotacao/add`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cliente_id` | sim | [Obrigatorio] - ID do cliente para o qual será adicionado a nova Anotação |
| `anotacao` | sim | [Obrigatório] - Conteúdo da Anotação |
| `contrato_id` | — | [Opcional] - ID do contrato para o qual será vinculado a nova anotação |
| `tipo_id` | — | [Opcional] - ID do Tipo de Anotação |
| `alerta_modo` | — | [Opcional] - Modo de alerta. Consulte documentação para valores possíveis |

## Anotações - Listar/Consultar
`GET /api/ura/cliente/anotacao/list`

| Campo | Obrig. | Descrição |
|---|---|---|
| `id` | — | [Opcional] - Consultar anotação filtrando pelo ID |
| `cliente_id` | — | [Opcional] - Consultar anotações filtrando pelo ID do cliente |
| `contrato_id` | — | [Opcional] - Consultar anotações filtrando pelo ID do contrato de serviço |

## Anotações - Atualizar
`POST /api/ura/cliente/anotacao/{id}/edit`

| Campo | Obrig. | Descrição |
|---|---|---|
| `anotacao` | — | [Opcional] - Novo conteúdo da anotação |
| `tipo_id` | — | [Opcional] - ID do novo tipo de anotação |
| `alerta_modo` | — | [Opcional] - ID do novo modo de alerta |

## Anotação - Remover
`POST /api/ura/cliente/anotacao/{id}/remove/`

Parâmetro Tipo Descrição token string Token da Aplicação no SGP (obrigatório) app string Nome da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Mapa FTTH - Listar Gateways
`GET /api/ura/listgatewaymapa`

Parâmetro Tipo Descrição token string Token da Aplicação no SGP (obrigatório) app string Nome da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)
