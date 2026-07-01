---
title: "SGP API — Central Assinante"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Central Assinante", "API SGP Central Assinante"]
tags: [sgp, api, reference, central-assinante]
---

# SGP API — Central Assinante

Endpoints do módulo **Central Assinante** da API do SGP (33). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Contrato - Listar
`POST /api/central/contratos`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |

## Serviço Internet – Verificar disponibilidade
`POST /api/central/verificaacesso/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |

## Serviço Internet – Extrato de Tráfego
`POST /api/central/extratouso/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato ano integer Ano mes integer Mês

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `ano` | sim | [Obrigatório] - Ano da consulta |
| `mes` | sim | [Obrigatório] - Mês da consulta |

## Contrato – Liberação por Confiança
`POST /api/central/promessapagamento/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |

## Chamado – Listar
`POST /api/central/chamado/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | — | ID do contrato | Informar contrato ou cliente |
| `cliente` | — | ID do cliente | Informar contrato ou cliente |
| `os` | — | ID da ordem de serviço |
| `status` | — | Status da ordem de serviço (Também responde por os_status) |
| `oc_status` | — | Status da ocorrência vinculada |
| `pop` | — | ID do POP vinculado à essa ordem de serviço |
| `data_cadastro_inicio` | — | Ordens de serviço geradas à partir de (formato: "AAAA-MM-DD") |
| `data_cadastro_fim` | — | Ordens de serviço geradas até (formato: "AAAA-MM-DD") |
| `data_agendamento_inicio` | — | Ordens de serviço agendadas à partir de (formato: "AAAA-MM-DD") |
| `data_agendamento_fim` | — | Ordens de serviço agendadas até (formato: "AAAA-MM-DD") |
| `data_finalizacao_inicio` | — | Ordens de serviço finalizadas à partir de (formato: "AAAA-MM-DD") |
| `data_finalizacao_fim` | — | Ordens de serviço finalizadas até (formato: "AAAA-MM-DD") |

## Tipos de Ocorrência – Listar
`POST /api/central/tipoocorrencia/list/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |

## Chamado – Criar
`POST /api/central/chamado/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `conteudo` | — | Conteúdo da ocorrência e ordem de serviço |
| `contato` | — | Nome do contato na ocorrência |
| `contato_numero` | — | Número do contato na ocorrência |
| `ocorrenciatipo` | — | Código do tipo de ocorrência |
| `setor` | — | ID do setor da ocorrência e ordem de serviço |
| `responsaveloc` | — | Usuário do responsável da ocorrência |
| `motivoos` | — | Código do motivo da ordem de serviço |
| `sem_os` | — | Impede a geração de uma ordem de serviço |
| `os_tecnico_responsavel` | — | ID ou Usuário do técnico da ordem de serviço |
| `os_servico_prestado` | — | Serviço prestado da ordem de serviço |
| `os_prioridade` | — | Prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta; Padrão 2) |
| `data_hora_agendamento` | — | Data de agendamento da ocorrência e ordem de serviço (formato: "AAAA-MM-DD HH:MM") |

## Chamado – Atualizar
`POST /api/central/chamado/update/{os_id}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `ocorrencia_conteudo` | — | Substitui o campo Conteúdo da ocorrência |
| `ocorrencia_encerrar` | — | Encerra a ocorrência caso a mesma tenha apenas uma ordem de serviço, e ela esteja encerrada |
| `os_servico_prestado` | — | Substitui o campo Serviço Prestado da ordem de serviço |
| `os_observacao` | — | Substitui o campo Observação da ordem de serviço |
| `os_anotacao` | — | Substitui o campo Observação Interna da ordem de serviço |
| `os_data_agendamento` | — | Substitui a data de agendamento da ordem de serviço (formato: "AAAA-MM-DD HH:MM") |
| `os_status` | — | Altera o status da ordem de serviço (0=Aberta;1=Encerrada;2=Em execução;3=Pendente) |
| `os_tecnico_responsavel` | — | Substitui o técnico da ordem de serviço. Utilizar ID ou Usuário |
| `os_setor` | — | Substitui o setor da ordem de serviço. Utilizar ID |
| `os_motivo` | — | Substitui o motivo da ordem de serviço. Utilizar Código |
| `os_prioridade` | — | Substitui a prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta;) |
| `notificar_cliente` | — | Dispara um aviso de encerramento da ocorrência/ordem de serviço ao cliente. Valor 1 para ativar |

## Chamado – Adicionar Anexo
`POST /api/central/chamado/{os_id}/anexo/add/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `file` | sim | [Obrigatório] - Arquivo que será anexado | Utilizar file ou file_b64 |
| `file_b64` | sim | [Obrigatório] - Arquivo, em base64, que será anexado | Utilizar file ou file_b64 |
| `descricao` | — | Descrição do anexo |
| `filename` | — | Nome do anexo caso feito via file_b64. Se não informar, será criado um nome no padrão anexo_... |

## Ordem de Serviço – Adicionar Anotação
`POST /api/central/chamado/{os_id}/anotacao`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente anotacao string Anotação do Chamado

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `anotacao` | sim | [Obrigatório] - Anotação a ser criada |

## Nota Fiscal – Listar
`POST /api/central/notafiscal/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato que possui as notas vinculadas |

## NFCom - Listar
`POST /api/central/nfcom/list`

| Campo | Obrig. | Descrição |
|---|---|---|
| `usuario` | sim | [Obrigatório] - usuario da central para autenticação | Utilizar usuario + senha ou app + token |
| `senha` | sim | [Obrigatório] - Senha da central para autenticação | Utilizar usuario + senha ou app + token |
| `contrato` | — | ID do contrato do cliente |
| `emitente` | — | ID da empresa emitente |
| `status` | — | Status das NFComs | Status disponíveis (usar número): 1 - Autorizada, 3 - Em Digitação, 5 - Rejeitada, 8 - Cancelada, 9 - Importada por XML, 10 - Aguardando Envio, 11 - Substituida |
| `ambiente` | — | Ambiente de emissão | 1 - Produção (padrão) e 2 - Homologação. |
| `data_emissao_fim` | — | Data início do período de emissão | Formato: AAAA-MM-DD |
| `data_emissao_inicio` | — | Data fim do período de emissão | Formato: AAAA-MM-DD |

## NFCom - Baixar
`POST /api/central/nfcom/print/{{numero_nota}}`

Parâmetro Tipo Descrição {{numero_nota}} Integer Número da NFCom passado na URL

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `formato` | — | Valores aceitos: pdf ou xml. Padrão: pdf |

## NFCom - Enviar
`POST /api/central/nfcom/enviar/{{id_nota}}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato. |
| `email` | — | [Opcional] - Email destinatário. |

## NFSe – Listar
`POST /api/central/nfse/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato que possui as notas vinculadas |

## NFSe - Enviar
`POST /api/central/nfse/enviar/{{id_nota}}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | [Obrigatório] - ID do contrato. |
| `email` | — | [Opcional] - Email destinatário. |

## Fatura – Listar
`POST /api/central/titulos/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | — | Retorna títulos desse contrato. Se não informado, retornará do cpf/cnpj informado no parâmetro cpfcnpj |
| `offset` | — | Deslocamento da consulta (a partir de quando deve começar, Padrão: 0) |
| `limit` | — | Limite de resultados (Padrão: 250) |
| `status` | — | Retorna títulos apenas com o status informado (1=Em aberto;2=Pago;3=Cancealdo; Padrão = 1 e 2) |
| `imprimir_nota_fiscal` | — | Retorna as notas fiscais modelos 21 e 22 atreladas à esses títulos |
| `imprimir_nota_debito` | — | Retorna as notas de débito atreladas à esses títulos |

## Fatura – Segunda via
`POST /api/central/fatura2via/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato nao_gerar_os integer Não Gerar OS

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `nao_gerar_os` | — | Não gera ocorrência no cliente mediante disparo desse endpoint |

## Fatura – Gerar PIX
`POST /api/central/pagamento/pix/{id_titulo}`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |

## Fatura – Enviar
`POST /api/central/envia2via/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato email string Email

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `tipo` | — | Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email" |
| `email` | — | Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato |
| `celular` | — | Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao invés do celular do contrato |

## Fatura - Pagar via Cartão de Crédito
`POST /api/central/pagamento/cartao/{titulo_id}`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `nome` | sim | [Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão |
| `numero` | sim | [Obrigatório] - Número do cartão | Informar esse ou o ID do cartão |
| `expira` | sim | [Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão |
| `cvv` | sim | [Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão |
| `cartao_id` | sim | [Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão |

## Fatura - Pagar via Cartão de Débito
`POST /api/central/pagamento/cartao/{titulo_id}/debito/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato |
| `nome` | sim | [Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão |
| `numero` | sim | [Obrigatório] - Número do cartão | Informar esse ou o ID do cartão |
| `expira` | sim | [Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão |
| `cvv` | sim | [Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão |
| `cartao_id` | sim | [Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão |

## Fatura - Pagar via Cartão Checkout
`POST /api/central/pagamento/checkout/{titulo_id}/cartao/`

Parâmetro Tipo Descrição cpfcnpj string CPF / CNPJ do Cliente senha string Senha do Cliente contrato integer ID do Contrato

| Campo | Obrig. | Descrição |
|---|---|---|
| `cpfcnpj` | sim | [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha |
| `senha` | sim | [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha |
| `contrato` | sim | [Obrigatório] - ID do contrato |

## Gateway Cartão - Listar
`POST /api/centralapp/gatewaycartao/list/`

Parâmetro Tipo Descrição token string Token do aplicativo da central do assinante [obrigatório] login string Login do contrato [obrigatório] contrato string Id do Contrato [obrigatório]

(sem parâmetros além de auth)

## Cartão de Crédito - Cadastrar
`POST /api/centralapp/cadastrarcartao/`

Parâmetro Tipo Descrição token string Token do aplicativo da central do assinante [obrigatório] login string Login do contrato [obrigatório] contrato integer Id do Contrato [obrigatório] mes_expira integer Mês de expiração do cartão MM [obrigatório] ano_expira integer Ano de expiração do cartão no formato YYYY [obrigatório] numero string Número do cartão [obrigatório] cvv string CVV do cartão [obrigatório] Nome conforme está no cartão string Nome conforme está no cartão [obrigatório] payment_token string Token de pagamento caso a gateway exija o token cobranca_recorrente string Caso desejar adicionar este cartão como cobrança recorrente adicionar_contratos string Caso desejar que o cartão seja adicionado a mais de um contrato do mesmo cliente.

(sem parâmetros além de auth)

## Cartão de Crédito - Delete
`DELETE /api/centralapp/deletecartao/{id_cartao}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `contrato` | sim | Id do Contrato [obrigatório] |
| `login` | sim | Login ou CPFCNPJ do contrato (Depende do modo de autenticação, ver Doc.) [obrigatório] |
| `password` | — | Senha de autenticação da central (Depende do modo de autenticação, ver Doc.) |

## Cobrança Recorrente - Cadastrar
`POST /api/centralapp/cartao/{id_cartao}/cobrancarecorrente/add/`

Parâmetro Tipo Descrição token string Token do aplicativo da central do assinante [obrigatório] login string Login do contrato [obrigatório] contrato integer Id do Contrato [obrigatório]

(sem parâmetros além de auth)

## Cobrança Recorrente - Delete
`POST /api/centralapp/cartao/{id_cartao}/cobrancarecorrente/delete/`

Parâmetro Tipo Descrição token string Token do aplicativo da central do assinante [obrigatório] login string Login do contrato [obrigatório] contrato integer Id do Contrato [obrigatório]

(sem parâmetros além de auth)

## Declaração de Quitação - Baixar
`GET /api/centralapp/declaracao/quitacao/2026/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app) |
| `password` | sim | [Obrigatório] - Senha do serviço do cliente |

## Assinatura - Detalhe
`POST /api/centralapp/assinaturas/{id_assinatura/detail/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app) |
| `password` | sim | [Obrigatório] - Senha do serviço do cliente |

## Assinaturas - Listar
`POST /api/centralapp/assinaturas/list`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app) |
| `password` | sim | [Obrigatório] - Senha do serviço do cliente |

## Contrato - PDF
`GET /api/centralapp/contrato/print/{tipo}/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app) |
| `password` | sim | [Obrigatório] - Senha do serviço do cliente |

## Avisos - Listar
`GET /api/centralapp/avisos/servico/list/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `login` | sim | [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app) |
| `password` | sim | [Obrigatório] - Senha do serviço do cliente |
