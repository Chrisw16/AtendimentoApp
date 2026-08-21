# SGP — API completa (extração da coleção Postman)

Data: 2026-07-01. 237 endpoints, 13 módulos. Fonte imutável; ver páginas curadas em brain/domains/sgp-api/.


## URA (69)

### Cliente – Listar
`POST /api/ura/clientes/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 100; Máximo: 100;)
  - cliente_id — ID do cliente
  - cpfcnpj — CPF ou CNPJ do cliente
  - cliente_nome — Nome ou nome social
  - plano — ID do plano que o cliente deve ter
  - login — Login do serviço de internet
  - contrato — ID do contrato pertencente ao cliente
  - status — Retorna clientes que tenham títulos nesses status (Para valores, verifique a documentação pública)
  - portador — Retorna clientes que tenham títulos desse ID do portador
  - telefone — Contato telefônico do cliente
  - pop — ID do POP que o contrato do cliente deve ter
  - contrato_status — Retorna clientes com contratos nessa situação (Para valores, verifique a documentação pública)
  - omitir_contratos — Não imprime dados de contratos
  - omitir_titulos — Não imprime dados de títulos
  - omitir_contatos — Não imprime dados de contatos
  - tipo_servico — Retorna clientes que tenham o tipo de serviço especificado nesse parâmetro (Para valores, verifique a documentação pública)
  - exibir_conexao — Retorna se o cliente está conectado (internet)
  - exibir_observacao_cliente — Retorna observações do cadastro do cliente
  - exibir_observacao_servicos — Retorna observações do contrato do cliente
  - data_cadastro_inicio — Data de cadastro inicial do cliente. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_cadastro_fim — Data de cadastro final do cliente. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_alteracao_inicio — Data de alteração inicial do cadastro do cliente ou endereço. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_alteracao_fim — Data de alteração final do cadastro do cliente ou endereço. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_vencimento_inicio — Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_vencimento_fim — Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_contrato_status_inicio — Data de alteração inicial do status de um contrato. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_contrato_status_fim — Data de alteração final do status de um contrato. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_pagamento_inicio — Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_pagamento_fim — Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - cto — Filtra clientes pelo ID da CTO vinculada ao contrato de serviço
  - cto_porta — Filtra clientes pelo número da porta da CTO vinculada ao contrato de serviço

### Cliente – Listagem Resumida
`POST /api/ura/listacliente/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - pop — ID do POP a ser utilizado como filtro
  - status — Status do contrato
  - status_data_inicial — Data de alteração inicial do último status de contrato
  - status_data_final — Data de alteração final do último status de contrato
  - tipo — Tipo de pessoa a ser retornado | Utilizar F ou J

### Cliente – Consultar
`POST /api/ura/consultacliente/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cpfcnpj [obrig] — [Obrigatório] - CPF ou CNPJ do cliente | Utilizar um dos filtros obrigatórios
  - contrato [obrig] — [Obrigatório] - ID do contrato do cliente | Utilizar um dos filtros obrigatórios
  - nome [obrig] — [Obrigatório] - Nome do cliente | Utilizar um dos filtros obrigatórios
  - mac_controle [obrig] — [Obrigatório] - Mac do serviço de internet do cliente | Utilizar um dos filtros obrigatórios
  - mac_dhcp [obrig] — [Obrigatório] - Mac DHCP do serviço de internet do cliente | Utilizar um dos filtros obrigatórios
  - servico_serial [obrig] — [Obrigatório] - Serial controle do serviço de internet do cliente | Utilizar um dos filtros obrigatórios
  - onu_serial [obrig] — [Obrigatório] - Phy Address da ONU do serviço de internet do cliente | Utilizar um dos filtros obrigatórios
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (Utilizar este ou email) | Utilizar um dos filtros obrigatórios
  - email [obrig] — [Obrigatório] - Email (login) do serviço do cliente (Utilizar este ou login) | Utilizar um dos filtros obrigatórios
  - senha — Retorna clientes cujo contrato possuam essa senha (Utilizar em conjunto com login ou email)
  - telefone — Contato telefônico do cliente
  - radius — Retorna situação da sessão radius se aplicável
  - incluir_unificados — Considerará também contratos unificados (Padrão: ignora)
  - tservico — Busca por tipos de serviço (Para valores, verifique a documentação pública)
  - status — Busca por contratos atualmente nesse status. Pode informar mais de um por vírgula (Para valores, verifique a documentação pública)
  - atrasado — Retorna apenas quem possui títulos em atraso
  - servicos_dados — Detalha os serviços encontrados (O resultado da consulta pode aumentar consideravelmente)
  - plano — Busca por clientes que seus serviços possuam o ID do plano informado nesse parâmetro
  - titulo_status — Retorna quem possuir títulos nesse status (valores: 'abertos'; 'pagos'; 'cancelados';)
  - exibir_observacao_cliente — Retorna observações do cadastro do cliente
  - exibir_observacao_servicos — Retorna observações do contrato do cliente
  - pop — Busca por contratos que sejam desse POP (ID)
  - assinatura_eletronica — Retornam as assinaturas eletrônicas dos contratos
  - exibir_historico_status — Retornam os últimos 50 status do contrato consultado

### Cliente - Sem Fatura
`POST /api/ura/clientes/semfatura/`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - periodo — Período de consulta (Formato AAAA-MM)

### Contato – Criar
`POST /api/ura/contato/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contato [obrig] — [Obrigatório] - Contato a ser cadastrado
  - contrato [obrig] — [Obrigatório] - ID do contrato do cliente que terá o contato vinculado
  - tipo — Tipo do contato, padrão: Celular Pessoal (Para valores, verifique a documentação pública)

### Viabilidade – Consultar
`POST /api/ura/viabilidade/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - logradouro [obrig] — [Obrigatório] - Consulta por logradouro | Utilizar um dos filtros obrigatórios
  - numero_inicial [obrig] — [Obrigatório] - Consulta à partir de um certo número da rua | Utilizar um dos filtros obrigatórios
  - numero_final [obrig] — [Obrigatório] - Consulta até um certo número da rua | Utilizar um dos filtros obrigatórios
  - bairro [obrig] — [Obrigatório] - Consulta por bairro | Utilizar um dos filtros obrigatórios
  - cep [obrig] — [Obrigatório] - Consulta por CEP | Utilizar um dos filtros obrigatórios
  - cidade [obrig] — [Obrigatório] - Consulta pela cidade | Utilizar um dos filtros obrigatórios

### Viabilidade – Consultar via Gateway
`GET /api/ura/viabilidadeinstalacao`


### Contrato – Listar
`POST /api/ura/listacontrato/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato — ID do contrato
  - plano — ID do plano vinculado ao contrato
  - tipo — Tipo da pessoa (Para valores, verifique a documentação pública)
  - status — Status atual (ID) do contrato (Para valores, verifique a documentação pública)
  - exibir_endereco — Detalha o endereço do contrato

### Contrato – Atualizar
`POST /api/ura/contrato/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - sms_desativado — Altera o campo de SMS Desativado (1=Ativa;0=Inativa;)
  - forma_cobranca — Altera a forma de cobrança do contrato (Para valores, verifique a documentação pública)
  - portador — Altera o portador do contrato (informar ID)
  - debito_banco — Altera o código do banco para débito automático (3 dígitos)
  - debito_agencia — Altera a agência para débito automático (4 dígitos)
  - debito_conta — Altera a conta para débito automático (Informar conta com dígito, sem traço)
  - tag_add — Adiciona tags ao contrato (Informar IDs, ex.: 1,2,3)
  - tag_remove — Remove tags do contrato (Informar IDs, ex.: 1,2,3)

### Contrato – Imprimir
`GET /api/contratos/print/{tipo_contrato}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha ou usuario+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha ou usuario+senha
  - contrato [obrig] — ID do contrato (Obrigatório para autenticação token+app, e recomendado para as outras)
  - cpfcnpj — CPF ou CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha
  - usuario — Usuário de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha
  - senha — Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha

### Contrato – Liberação por Confiança
`POST /api/ura/liberacaopromessa/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - data_promessa — Informa uma data de promessa customizada (formato: "AAAA-MM-DD")
  - uracontato — Retorna o valor informado nesse parâmetro na resposta da requisição
  - enviar_sms — Dispara um SMS ou Whatsapp para informar ao cliente da liberação
  - uraIP — Salva o valor informado nesse parâmetro nas observações da promessa de pagamento
  - conteudo — Substitui o conteúdo da ocorrência aberta ao realizar a liberação

### Serviço Internet – Verificar disponibilidade
`POST /api/ura/verificaacesso/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato | Utilizar um dos filtros obrigatórios
  - telefone [obrig] — [Obrigatório] - Contato vinculado ao cliente | Utilizar um dos filtros obrigatórios
  - status_all — Também retorna contratos suspensos (Padrão: apenas ativos e reduzidos)
  - status_filter — Retorna apenas os status especificados (Para valores, verifique a documentação pública)
  - uracontato — Retorna o valor informado nesse parâmetro na resposta da requisição
  - protocolo_ura — Abre uma ocorrência. Caso o serviço esteja em manutenção, a ocorrência será aberta por padrão

### Portador – Listar
`GET /api/ura/portador/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Motivos de Status – Listar
`POST /api/ura/contrato/status/motivos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Status do Contrato – Atualizar
`POST /api/ura/contrato/status/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - status [obrig] — [Obrigatório] - ID do novo status (Para valores, verifique a documentação pública)
  - motivo — ID do novo motivo (Para valores, verifique a documentação pública)

### Senha do Serviço – Atualizar
`POST /api/ura/cliente/servico/senha/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - servico [obrig] — [Obrigatório] - ID do serviço que será alterado
  - tipo [obrig] — [Obrigatório] - ID do tipo de serviço (Para valores, verifique a documentação pública)
  - senha [obrig] — [Obrigatório] - Nova senha do serviço

### CPE Manage – Consultar
`GET /api/ura/cpemanage/`


### CPE Manage – Atualizar
`POST /api/ura/cpemanage/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - contrato [obrig] — [Obrigatório] - ID do contrato de serviço (também responde por 'clientecontrato')
  - servico — ID do serviço a ser consultado (Caso o contrato possua múltiplos serviços, informar o id do correto)
  - wifi_status — Alterar situação da Wifi ('on' / 'off')
  - novo_ssid — Alterar nome da Wifi
  - nova_senha — Alterar senha da Wifi
  - wifi_status_5g — Alterar situação da Wifi 5GHz ('on' / 'off')
  - novo_ssid_5g — Alterar nome da Wifi 5GHz
  - nova_senha_5g — Alterar senha da Wifi 5GHz

### Plano – Listar
`GET /api/ura/consultaplano/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Feriado – Listar
`GET /api/model/feriado/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação

### Classificação - Listar
`GET /api/ura/classificacoes/list/`


### Configurações (Variáveis) – Listar
`POST /api/ura/configuracoes/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - configuracao — Consulta se há essa variável ativa na base

### Notificação no Sistema – Criar
`POST /api/ura/notificacaosistema/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato | Informar este ou cpfcnpj
  - cpfcnpj [obrig] — [Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato
  - uracontato — Retorna o valor informado nesse parâmetro na resposta da requisição
  - uraagent — Retorna o valor informado nesse parâmetro na resposta da requisição

### Ocorrência – Listar
`POST /api/ura/ocorrencia/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 1000; Máximo: 1000;)
  - ocorrencia — Filtra pelo número da ocorrência
  - status — Filtra pelo status da ocorrência (Para valores, verifique a documentação pública)
  - pop — ID do POP vinculado ao contrato de serviço vinculado à ocorrência
  - tipo — ID do tipo de ocorrência
  - contrato — ID do contrato de serviço vinculado à ocorrência
  - contrato_status — Status atual do contrato de serviço vinculado à ocorrência (Para valores, verifique a documentação pública)
  - data_cadastro_inicio — Data de cadastro inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_cadastro_fim — Data de cadastro final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_cadastro_inicio — Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM)
  - hora_cadastro_fim — Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM)
  - data_agendamento_inicio — Data de agendamento inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_agendamento_fim — Data de agendamento final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_agendamento_inicio — Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM)
  - hora_agendamento_fim — Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM)
  - data_finalizacao_inicio — Data de finalização inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_finalizacao_fim — Data de finalização final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_finalizacao_inicio — Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM)
  - hora_finalizacao_fim — Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM)

### Ordem de Serviço – Listar
`POST /api/ura/ordemservico/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 1000; Máximo: 1000;)
  - ordem_servico — Filtra pelo ID da ocorrência
  - status — Filtra pelo status da O.S. (Para valores, verifique a documentação pública)
  - pop — ID do POP vinculado ao contrato de serviço vinculado à O.S.
  - motivo — ID do motivo da O.S.
  - contrato — ID do contrato de serviço vinculado à O.S.
  - contrato_status — Status atual do contrato de serviço vinculado à O.S. (Para valores, verifique a documentação pública)
  - data_cadastro_inicio — Data de cadastro inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_cadastro_fim — Data de cadastro final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_cadastro_inicio — Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM)
  - hora_cadastro_fim — Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM)
  - data_agendamento_inicio — Data de agendamento inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_agendamento_fim — Data de agendamento final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_agendamento_inicio — Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM)
  - hora_agendamento_fim — Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM)
  - data_finalizacao_inicio — Data de finalização inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_finalizacao_fim — Data de finalização final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - hora_finalizacao_inicio — Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM)
  - hora_finalizacao_fim — Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM)

### Método de Ocorrência – Listar
`GET /api/ura/ocorrencia/metodo/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Técnico – Listar
`POST /api/ura/tecnicos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Chamado – Criar
`POST /api/ura/chamado/`


### Chamado – Anexar Áudio
`POST /api/ura/audio/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - protocolo [obrig] — [Obrigatório] - Número da ocorrência que terá o áudio vinculado
  - url [obrig] — [Obrigatório] - Endereço (URL) do áudio que será vinculado

### POP – Listar
`POST /api/ura/pops/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Empresa – Listar
`POST /api/ura/empresas/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cnpj — CNPJ da empresa

### Fornecedor – Listar
`POST /api/ura/fornecedores/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cpfcnpj — CPF ou CNPJ do fornecedor

### Tipo de Documento (Conta) – Listar
`POST /api/ura/contas/tiposdocumentos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Conta à Pagar/Receber – Listar
`POST /api/ura/contas/{tipo}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 100; Máximo: 500;)
  - descricao — Descrição da conta à pagar ou receber
  - nota_fiscal — Número da nota fiscal vinculada a conta à pagar ou receber
  - status — Status da conta à pagar ou receber (Para valores, verifique a documentação pública)
  - tipo_documento — "Tipo Documento" selecionado na conta à pagar ou receber
  - plano_contas — ID do plano de contas vinculado a conta à pagar ou receber
  - empresa — ID da empresa vinculado a conta à pagar ou receber
  - pop — ID do POP vincualdo a conta à pagar ou receber
  - fornecedor — ID do fornecedor vincualdo a conta à pagar ou receber
  - usuario — Nome do usuário que cadastrou a conta à pagar ou receber
  - data_cadastro_inicio — Data de cadastro inicial da conta à pagar ou receber (formato: "AAAA-MM-DD")
  - data_cadastro_fim — Data de cadastro final da conta à pagar ou receber (formato: "AAAA-MM-DD")
  - data_vencimento_inicio — Data de vencimento inicial da conta à pagar ou receber (formato: "AAAA-MM-DD")
  - data_vencimento_fim — Data de vencimento final da conta à pagar ou receber (formato: "AAAA-MM-DD")
  - data_pagamento_inicio — Data de pagamento inicial da conta à pagar ou receber (formato: "AAAA-MM-DD")
  - data_pagamento_fim — Data de pagamento final da conta à pagar ou receber (formato: "AAAA-MM-DD")

### Plano de Contas – Listar
`POST /api/ura/planoscontas/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ponto de Recebimento – Listar
`POST /api/ura/pontosrecebimentos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Fatura – Listar
`POST /api/ura/titulos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 250; Máximo: 250;)
  - titulo_id — ID do título
  - cliente_id — ID do cliente vinculado aos títulos
  - cpfcnpj — CPF ou CNPJ do cliente vinculado aos títulos
  - contrato — ID do contrato de serviço vinculado aos títulos
  - status — Filtrar determinados status de títulos (escolhas: 'abertos'; 'pagos'; 'cancelados';)
  - portador — ID do portador gerador dos títulos
  - ordenar — Ordena os títulos em 3 modos (escolhas: 'data_documento'; 'data_vencimento'; 'data_pagamento';)
  - ordenar_ordem — Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';)
  - empresa_cnpj — CNPJ da empresa vinculada aos títulos. É possível enviar mais de um CNPJ separando por vírgula.
  - tipo_pessoa — Tipo de pessoa vinculada aos títulos. As escolhas são F (Física), J (Jurídica), E (Estrangeira Física) e EJ (Estrangeira Jurídica).
  - data_vencimento_inicio — Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_vencimento_fim — Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_pagamento_inicio — Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD")
  - data_pagamento_fim — Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_cancelamento_inicio — Data de cancelamento inicial dos títulos. Se utilizado sozinho, filtrará títulos cancelados especificamente nesse dia (formato: "AAAA-MM-DD")
  - data_cancelamento_fim — Data de cancelamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD")
  - data_acordo_inicio — Títulos de acordo de pagamento gerados à partir dessa data. Se utilizado sozinho, filtrará títulos de acordo gerados especificamente nesse dia (formato: "AAAA-MM-DD")
  - data_acordo_fim — Títulos de acordo de pagamento gerados até essa data. Utilizar junto com a inicial (formato: "AAAA-MM-DD")

### Fatura – Segunda via
`POST /api/ura/fatura2via/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cpfcnpj [obrig] — [Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato
  - contrato [obrig] — [Obrigatório] - ID do contrato do cliente | Informar este ou cpfcnpj
  - telefone — Se informado, tentará inferir o cpfcnpj à partir do número de telefone
  - notafiscal — Trará também nota fiscal, se existir
  - faturas_abertas_todas — Retorna todos os títulos válidos
  - numero_documento — Filtra especificamente um número de documento
  - ocorrencia_conteudo — A ocorrência aberta terá o conteúdo informado nesse parâmetro
  - nao_gerar_os — Não gera chamado para essa solicitação
  - tipo_ordenacao — Ordena os títulos em 2 modos (escolhas: 'data_documento'; 'data_vencimento';)
  - modo_ordenacao — Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';)
  - link_pdf — Caso exista um link de título, o mesmo ficará com ".pdf" no final do link

### Fatura – Gerar PIX
`POST /api/ura/pagamento/pix/{fatura}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato vinculado ao título que será gerado/retornado o PIX

### Fatura – Enviar
`POST /api/ura/enviafatura/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - tipo — Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email"
  - email — Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato
  - celular — Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao invés do celular do contrato
  - numero_documento — Dispara, especificamente, o título com o número de documento especificado nesse parâmetro
  - mensagem — Especifica a mensagem disparada
  - conteudo — Informa o conteúdo da ocorrência de envio que será aberta. Padrão: 'Envio de Fatura via URA'
  - link_pdf — Caso exista um link de título, o mesmo ficará com ".pdf" no final do link

### Fatura – Liquidar
`POST /api/banco/titulo/{fatura_id}/baixar/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - data_pagamento [obrig] — [Obrigatório] - Data de pagamento do título (formato: 'AAAA-MM-DD')
  - valor_pago [obrig] — [Obrigatório] - Valor pago do título (ex: '51.52')
  - ponto_recebimento — ID do caixa de liquidação. Se não informado, procurará o caixa vinculado ao portador do boleto
  - forma_pagamento — Forma de pagamento. Padrão: 'Dinheiro' (valores: 'DINHEIRO', 'CARTAO', 'DEBITO', 'PIX')
  - tarifas — Tarifa do título (ex: '0.15')
  - liquidacao_parcial — Informa se será uma liquidação parcial. Valor: 1
  - desconto — Define um desconto para a liquidação parcial
  - motivodesconto — Descreve o motivo do desconto, caso exista
  - observacao — Observação extra para que seja salva no título

### Fatura – Estornar
`POST /api/banco/titulo/{fatura_id}/estornar/`


### Fatura – Listar lançamentos de caixa (Liquidação parcial)
`POST /api/banco/titulo/{fatura_id}/pagamento/list`
  - token — 
  - app — 

### Fatura – Cancelar
`POST /api/banco/titulo/{fatura_id}/cancelar/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - motivo [obrig] — [Obrigatório] - Descreva o motivo do cancelamento
  - naolibera — Não realiza liberação dos serviços mediante cancelamento
  - cancelar_nf — Se existirem notas fiscais para o título, as cancela também
  - taxa_baixa_lanc — Solicita o lançamento da taxa de cancelamento. A taxa deve estar configurada no portador

### Fatura – Descancelar
`POST /api/banco/titulo/{fatura_id}/descancelar/`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação

### Fatura – Gerar Mensalidade
`POST /api/ura/cliente/mensalidade/avulsa/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - contrato [obrig] — [Obrigatório] - ID do contrato que terá a mensalidade gerada
  - ano [obrig] — [Obrigatório] - Ano de validade da mensalidade
  - mes [obrig] — [Obrigatório] - Mês de validade da mensalidade
  - ignorar_titulos_cancelados — Ignora títulos cancelados na tentativa de geração
  - gerar_proporcional — Tenta uma geração proporcional (funcional para o primeiro título do contrato)
  - gerar_pix — Solicita a geração do PIX junto com a criação da mensalidade

### Fatura - Gerar Título
`POST /api/ura/cliente/titulo/avulso/add/`


### Fatura – Gerar Acordo de Pagamento
`POST /api/ura/acordopagamento`


### NFe - Listar
`POST /api/ura/nfe/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - chave — Chave de acesso da noa fiscal eletrônica (44 dígitos)
  - data_emissao_inicio — Data de emissão inicial da nota fiscal. Se informada, informar também a final. (formato: 'AAAA-MM-DD')
  - data_emissao_fim — Data de emissão final da nota fiscal. Se informada, informar também a inicial. (formato: 'AAAA-MM-DD')

### NFe - Importar
`POST /api/ura/nfe/importar/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - xml [obrig] — [Obrigatório] - Arquivo XML da nota fiscal eletrônica

### NFe - Enviar
`POST /api/ura/nfe/enviar/{{id_nota}}`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar app + token.
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar app + token.
  - contrato [obrig] — [Obrigatório se NFe vinculada ao contrato] - ID do contrato de serviço.
  - email — [Opcional] - Email destinatário.

### NAS - Listar
`POST /api/ura/nas/list/`


### SMS - Gateways
`GET /api/sms/gateway/list/`


### SMS - Enviar
`GET /api/sms/send/`


### Manutenção - Listar
`GET /api/ura/manutencao/list/`


### Manutenção - Cadastrar
`POST /api/ura/manutencao/add/`


### Manutenção - Alterar
`POST /api/ura/manutencao/edit/`


### Manutenção - Deletar
`POST /api/ura/manutencao/delete/`


### AP - Listar
`GET /api/ura/ap/list/`


### Fonte - Listar
`GET /api/ura/fonte/list/`


### Switch - Listar
`GET /api/ura/switch/list/`


### Proteção de Crédito - Consulta Documento
`GET /api/ura/documento/consulta/gateway/{id_gateway}/?documento=&uf=&adicionais=`


### Proteção de Crédito - Adicionais
`GET /api/ura/consulta/adicionais/gateway/{id_gateway}/?tipo_pessoa`


### Proteção de Crédito - Listar Gateways
`GET /api/ura/gatewaysserasa/list`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Anotações - Adicionar
`POST /api/ura/cliente/anotacao/add`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cliente_id [obrig] — [Obrigatorio] - ID do cliente para o qual será adicionado a nova Anotação
  - anotacao [obrig] — [Obrigatório] - Conteúdo da Anotação
  - contrato_id — [Opcional] - ID do contrato para o qual será vinculado a nova anotação
  - tipo_id — [Opcional] - ID do Tipo de Anotação
  - alerta_modo — [Opcional] - Modo de alerta. Consulte documentação para valores possíveis

### Anotações - Listar/Consultar
`GET /api/ura/cliente/anotacao/list`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - id — [Opcional] - Consultar anotação filtrando pelo ID
  - cliente_id — [Opcional] - Consultar anotações filtrando pelo ID do cliente
  - contrato_id — [Opcional] - Consultar anotações filtrando pelo ID do contrato de serviço

### Anotações - Atualizar
`POST /api/ura/cliente/anotacao/{id}/edit`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - anotacao — [Opcional] - Novo conteúdo da anotação
  - tipo_id — [Opcional] - ID do novo tipo de anotação
  - alerta_modo — [Opcional] - ID do novo modo de alerta

### Anotação - Remover
`POST /api/ura/cliente/anotacao/{id}/remove/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Mapa FTTH - Listar Gateways
`GET /api/ura/listgatewaymapa`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth


## Central Assinante (33)

### Contrato - Listar
`POST /api/central/contratos`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente

### Serviço Internet – Verificar disponibilidade
`POST /api/central/verificaacesso/`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato

### Serviço Internet – Extrato de Tráfego
`POST /api/central/extratouso/`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - ano [obrig] — [Obrigatório] - Ano da consulta
  - mes [obrig] — [Obrigatório] - Mês da consulta

### Contrato – Liberação por Confiança
`POST /api/central/promessapagamento/`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato

### Chamado – Listar
`POST /api/central/chamado/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato — ID do contrato | Informar contrato ou cliente
  - cliente — ID do cliente | Informar contrato ou cliente
  - os — ID da ordem de serviço
  - status — Status da ordem de serviço (Também responde por os_status)
  - oc_status — Status da ocorrência vinculada
  - pop — ID do POP vinculado à essa ordem de serviço
  - data_cadastro_inicio — Ordens de serviço geradas à partir de (formato: "AAAA-MM-DD")
  - data_cadastro_fim — Ordens de serviço geradas até (formato: "AAAA-MM-DD")
  - data_agendamento_inicio — Ordens de serviço agendadas à partir de (formato: "AAAA-MM-DD")
  - data_agendamento_fim — Ordens de serviço agendadas até (formato: "AAAA-MM-DD")
  - data_finalizacao_inicio — Ordens de serviço finalizadas à partir de (formato: "AAAA-MM-DD")
  - data_finalizacao_fim — Ordens de serviço finalizadas até (formato: "AAAA-MM-DD")

### Tipos de Ocorrência – Listar
`POST /api/central/tipoocorrencia/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha

### Chamado – Criar
`POST /api/central/chamado/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - conteudo — Conteúdo da ocorrência e ordem de serviço
  - contato — Nome do contato na ocorrência
  - contato_numero — Número do contato na ocorrência
  - ocorrenciatipo — Código do tipo de ocorrência
  - setor — ID do setor da ocorrência e ordem de serviço
  - responsaveloc — Usuário do responsável da ocorrência
  - motivoos — Código do motivo da ordem de serviço
  - sem_os — Impede a geração de uma ordem de serviço
  - os_tecnico_responsavel — ID ou Usuário do técnico da ordem de serviço
  - os_servico_prestado — Serviço prestado da ordem de serviço
  - os_prioridade — Prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta; Padrão 2)
  - data_hora_agendamento — Data de agendamento da ocorrência e ordem de serviço (formato: "AAAA-MM-DD HH:MM")

### Chamado – Atualizar
`POST /api/central/chamado/update/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - ocorrencia_conteudo — Substitui o campo Conteúdo da ocorrência
  - ocorrencia_encerrar — Encerra a ocorrência caso a mesma tenha apenas uma ordem de serviço, e ela esteja encerrada
  - os_servico_prestado — Substitui o campo Serviço Prestado da ordem de serviço
  - os_observacao — Substitui o campo Observação da ordem de serviço
  - os_anotacao — Substitui o campo Observação Interna da ordem de serviço
  - os_data_agendamento — Substitui a data de agendamento da ordem de serviço (formato: "AAAA-MM-DD HH:MM")
  - os_status — Altera o status da ordem de serviço (0=Aberta;1=Encerrada;2=Em execução;3=Pendente)
  - os_tecnico_responsavel — Substitui o técnico da ordem de serviço. Utilizar ID ou Usuário
  - os_setor — Substitui o setor da ordem de serviço. Utilizar ID
  - os_motivo — Substitui o motivo da ordem de serviço. Utilizar Código
  - os_prioridade — Substitui a prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta;)
  - notificar_cliente — Dispara um aviso de encerramento da ocorrência/ordem de serviço ao cliente. Valor 1 para ativar

### Chamado – Adicionar Anexo
`POST /api/central/chamado/{os_id}/anexo/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - file [obrig] — [Obrigatório] - Arquivo que será anexado | Utilizar file ou file_b64
  - file_b64 [obrig] — [Obrigatório] - Arquivo, em base64, que será anexado | Utilizar file ou file_b64
  - descricao — Descrição do anexo
  - filename — Nome do anexo caso feito via file_b64. Se não informar, será criado um nome no padrão anexo_...

### Ordem de Serviço – Adicionar Anotação
`POST /api/central/chamado/{os_id}/anotacao`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - anotacao [obrig] — [Obrigatório] - Anotação a ser criada

### Nota Fiscal – Listar
`POST /api/central/notafiscal/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato que possui as notas vinculadas

### NFCom - Listar
`POST /api/central/nfcom/list`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar app + token ou usuario + senha
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar app + token ou usuario + senha
  - usuario [obrig] — [Obrigatório] - usuario da central para autenticação | Utilizar usuario + senha ou app + token
  - senha [obrig] — [Obrigatório] - Senha da central para autenticação | Utilizar usuario + senha ou app + token
  - contrato — ID do contrato do cliente
  - emitente — ID da empresa emitente
  - status — Status das NFComs | Status disponíveis (usar número): 1 - Autorizada, 3 - Em Digitação, 5 - Rejeitada, 8 - Cancelada, 9 - Importada por XML, 10 - Aguardando Envio, 11 - Substituida
  - ambiente — Ambiente de emissão | 1 - Produção (padrão) e 2 - Homologação.
  - data_emissao_fim — Data início do período de emissão | Formato: AAAA-MM-DD
  - data_emissao_inicio — Data fim do período de emissão | Formato: AAAA-MM-DD

### NFCom - Baixar
`POST /api/central/nfcom/print/{{numero_nota}}`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar app + token
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar app + token
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - formato — Valores aceitos: pdf ou xml. Padrão: pdf

### NFCom - Enviar
`POST /api/central/nfcom/enviar/{{id_nota}}`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar app + token.
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar app + token.
  - contrato [obrig] — [Obrigatório] - ID do contrato.
  - email — [Opcional] - Email destinatário.

### NFSe – Listar
`POST /api/central/nfse/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato que possui as notas vinculadas

### NFSe - Enviar
`POST /api/central/nfse/enviar/{{id_nota}}`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar app + token.
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar app + token.
  - contrato [obrig] — [Obrigatório] - ID do contrato.
  - email — [Opcional] - Email destinatário.

### Fatura – Listar
`POST /api/central/titulos/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato — Retorna títulos desse contrato. Se não informado, retornará do cpf/cnpj informado no parâmetro cpfcnpj
  - offset — Deslocamento da consulta (a partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 250)
  - status — Retorna títulos apenas com o status informado (1=Em aberto;2=Pago;3=Cancealdo; Padrão = 1 e 2)
  - imprimir_nota_fiscal — Retorna as notas fiscais modelos 21 e 22 atreladas à esses títulos
  - imprimir_nota_debito — Retorna as notas de débito atreladas à esses títulos

### Fatura – Segunda via
`POST /api/central/fatura2via/`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - nao_gerar_os — Não gera ocorrência no cliente mediante disparo desse endpoint

### Fatura – Gerar PIX
`POST /api/central/pagamento/pix/{id_titulo}`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato

### Fatura – Enviar
`POST /api/central/envia2via/`
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - tipo — Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email"
  - email — Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato
  - celular — Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao invés do celular do contrato

### Fatura - Pagar via Cartão de Crédito
`POST /api/central/pagamento/cartao/{titulo_id}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - nome [obrig] — [Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão
  - numero [obrig] — [Obrigatório] - Número do cartão | Informar esse ou o ID do cartão
  - expira [obrig] — [Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão
  - cvv [obrig] — [Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão
  - cartao_id [obrig] — [Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão

### Fatura - Pagar via Cartão de Débito
`POST /api/central/pagamento/cartao/{titulo_id}/debito/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato
  - nome [obrig] — [Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão
  - numero [obrig] — [Obrigatório] - Número do cartão | Informar esse ou o ID do cartão
  - expira [obrig] — [Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão
  - cvv [obrig] — [Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão
  - cartao_id [obrig] — [Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão

### Fatura - Pagar via Cartão Checkout
`POST /api/central/pagamento/checkout/{titulo_id}/cartao/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - cpfcnpj [obrig] — [Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha
  - senha [obrig] — [Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha
  - contrato [obrig] — [Obrigatório] - ID do contrato

### Gateway Cartão - Listar
`POST /api/centralapp/gatewaycartao/list/`


### Cartão de Crédito - Cadastrar
`POST /api/centralapp/cadastrarcartao/`


### Cartão de Crédito - Delete
`DELETE /api/centralapp/deletecartao/{id_cartao}/`
  - token [obrig] — Token do aplicativo da central do assinante [obrigatório]
  - contrato [obrig] — Id do Contrato [obrigatório]
  - login [obrig] — Login ou CPFCNPJ do contrato (Depende do modo de autenticação, ver Doc.) [obrigatório]
  - password — Senha de autenticação da central (Depende do modo de autenticação, ver Doc.)

### Cobrança Recorrente - Cadastrar
`POST /api/centralapp/cartao/{id_cartao}/cobrancarecorrente/add/`


### Cobrança Recorrente - Delete
`POST /api/centralapp/cartao/{id_cartao}/cobrancarecorrente/delete/`


### Declaração de Quitação - Baixar
`GET /api/centralapp/declaracao/quitacao/2026/`
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app)
  - password [obrig] — [Obrigatório] - Senha do serviço do cliente
  - token [obrig] — [Obrigatório] - Token do aplicativo da central do assinante

### Assinatura - Detalhe
`POST /api/centralapp/assinaturas/{id_assinatura/detail/`
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app)
  - password [obrig] — [Obrigatório] - Senha do serviço do cliente
  - token [obrig] — [Obrigatório] - Token do aplicativo da central do assinante

### Assinaturas - Listar
`POST /api/centralapp/assinaturas/list`
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app)
  - password [obrig] — [Obrigatório] - Senha do serviço do cliente
  - token [obrig] — [Obrigatório] - Token do aplicativo da central do assinante

### Contrato - PDF
`GET /api/centralapp/contrato/print/{tipo}/`
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app)
  - password [obrig] — [Obrigatório] - Senha do serviço do cliente
  - token [obrig] — [Obrigatório] - Token do aplicativo da central do assinante

### Avisos - Listar
`GET /api/centralapp/avisos/servico/list/`
  - login [obrig] — [Obrigatório] - Login do serviço do cliente (ou CPF/CNPJ, a depender do modo de autenticação escolhido na central do app)
  - password [obrig] — [Obrigatório] - Senha do serviço do cliente
  - token [obrig] — [Obrigatório] - Token do aplicativo da central do assinante


## Estoque (32)

### Empresa – Listar
`GET /api/estoque/empresa/list/`


### Fornecedor – Listar
`GET /api/estoque/fornecedor/list/`


### Categoria – Listar
`GET /api/estoque/categoria/list/?nome`


### Fabricante – Listar
`GET /api/estoque/fabricante/list/`


### NCM – Listar
`GET /api/estoque/ncm/list/`


### Kit de Instalação – Listar
`GET /api/estoque/kitinstalacao/list/`


### Produtos de Kit – Listar
`GET /api/estoque/kitinstalacaoproduto/list/`


### Comodato de Cliente – Listar
`GET /api/estoque/comodato/list/`


### Itens da Comodato – Listar
`GET /api/estoque/comodatoitens/list/`


### Venda de Cliente – Listar
`GET /api/estoque/venda/list/`


### Itens da Venda – Listar
`GET /api/estoque/vendaitens/list/`


### Lançamento – Listar
`GET /api/estoque/lancamento/list/`


### Itens do Lançamento – Listar
`GET /api/estoque/lancamentoitem/list/`


### Local de Estoque – Listar
`GET /api/estoque/estoque/list/`


### Saldo – Listar
`GET /api/estoque/estoque_agregado_referencias/list/`


### Produto – Listar (Quantitativos)
`GET /api/estoque/produto/list/`


### Produto – Listar (Cadastrados)
`GET /api/estoque/produto/list/all/`


### Unidades de Medidas - Listar
`GET /api/estoque/unidademedida/list/`


### Compras - Listar
`GET /api/estoque/compra/list/`


### Itens da Compra - Listar
`GET /api/estoque/compraitens/list/`


### Transferências - Listar
`GET /api/estoque/transferencia/list/`


### Lançamento – Criar
`POST /api/estoque/lancamentoitem/create/`


### Estorno – Atualizar
`POST /api/estoque/lancamentoitem/estorno/`
  - lancamentoitem_id [obrig] — [Obrigatório] - ID do item do lançamento
  - local_id [obrig] — [Obrigatório] - ID do local de estoque destino do retorno
  - os_id — ID da ordem de serviço que será vinculada ao estorno
  - observacao — Observação que será vinculada ao estorno

### Produto - Cadastrar
`POST /api/estoque/produto/create/`
  - codigo [obrig] — [Obrigatório] - Código identificador do produto
  - descricao [obrig] — [Obrigatório] - Nome do produto
  - ativo — Produto disponível? Padrão: sim (valores: 0=Inativo;1=Ativo)
  - codigo_barras — Código de barras do produto
  - tipo_referencia — Tipo de referência (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;)
  - informar_referencia_saida — Pode informar a referência na saída?
  - categorias — IDs das categorias (Se informar mais de um, separar por vírgula)
  - foto — Foto representadora do produto
  - valor_custo — Valor de custo do produto
  - valor_venda — Valor de venda do produto
  - unidade_medida — ID da unidade de medida a ser vinculada
  - detalhes — Detalhes do produto
  - fabricante — ID do fabricante a ser vinculado
  - modelo — Modelo do produto
  - informacoes_adicionais — Informações extras do produto
  - ncm — ID do NCM a ser vinculado

### Produto - Alterar
`POST /api/estoque/produto/{produto_id}/update/`
  - codigo — Substitui o código identificador do produto
  - descricao — Substitui o nome do produto
  - ativo — Ativa ou inativa o produto (valores: 0=Inativo;1=Ativo)
  - codigo_barras — Substitui o código de barras do produto
  - tipo_referencia — Substitui o tipo de referência do produto (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;)
  - informar_referencia_saida — Ativa ou desativa a possibilidade de informar referência na saída (valores: 0=Inativo;1=Ativo)
  - categorias — Substitui as categorias do produto (ID)
  - foto — Substitui a foto do produto
  - valor_custo — Substitui o valor de custo do produto
  - valor_venda — Substitui o valor de venda do produto
  - unidade_medida — Substitui a unidade de medida do produto (ID)
  - detalhes — Substitui os detalhes do produto
  - fabricante — Substitui o fabricante do produto (ID)
  - modelo — Substitui o modelo do produto
  - informacoes_adicionais — Substitui as informações adicionais do produto
  - ncm — Substitui o NCM do produto (ID)

### Compra - Cadastrar
`POST /api/estoque/compra/create/`


### Transferência - Cadastrar
`POST /api/estoque/transferencia/create/`


### Vincular Produto NFe X Produto Estoque
`POST /api/ura/produtonfe_produtoestoque/vincular/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - produto_nfe [obrig] — [Obrigatório] - ID do produto vinculado à NFe
  - produto_estoque [obrig] — [Obrigatório] - ID do produto existente no estoque que deseja vincular

### Vincular Produto NFe X Produto Estoque  Patch
`PATCH /api/ura/produtonfe_produtoestoque/vincular/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - produto_nfe [obrig] — [Obrigatório] - ID do produto vinculado à NFe que deseja alterar
  - produto_estoque [obrig] — [Obrigatório] - ID do produto existente no estoque que deseja vincular

### Compra - NFe
`POST /api/ura/compra/nfe/`


### Fornecedor - Cadastrar
`POST /api/estoque/fornecedor/create/`
  - nome [obrig] — [Obrigatório] - Nome do fornecedor
  - tipo_pessoa — Tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica)
  - sit_fiscal — Situação fiscal do fornecedor (Para valores, verifique a documentação pública)
  - nome_fantasia — Nome fantasia do fornecedor
  - responsavel_empresa — Responsável do fornecedor
  - nome_contato — Nome do contato do fornecedor
  - cpf_cnpj — CPF ou CNPJ do fornecedor
  - rg — RG do Fornecedor
  - rg_emissor — Emissor do RG
  - insc_estadual — Inscrição estadual do fornecedor
  - insc_municipal — Inscrição municipal do fornecedor
  - contrib_icms — Tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública)
  - endereco_logradouro — Rua do fornecedor
  - endereco_numero — Número da rua do fornecedor
  - endereco_bairro — Bairro do fornecedor
  - endereco_cidade — Cidade do fornecedor
  - endereco_uf — UF do fornecedor
  - endereco_cep — CEP do fornecedor
  - endereco_complemento — Complemento do endereço do fornecedor
  - endereco_ponto_referencia — Ponto de referência do endereço do fornecedor
  - endereco_pais — País do fornecedor
  - endereco_coordenadas — Coordenadas (lat/long) do fornecedor
  - cpais — Código do país (Ex.: Brasil = 1058)
  - cmun — Código do município (Ex.: 2408102)
  - email — E-mail do fornecedor
  - telefone — Telefone do fornecedor
  - celular — Celular do fornecedor
  - fax — Fax do fornecedor
  - observacao — Observação para o fornecedor
  - json — JSON para o fornecedor (em caso de integrações futuras)
  - ativo — Fornecedor disponível? Padrão: sim (valores: 0=Inativo;1=Ativo)

### Fornecedor - Alterar
`POST /api/estoque/fornecedor/<fornecedor_id>/update/`
  - nome — Novo nome do fornecedor
  - tipo_pessoa — Novo tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica)
  - sit_fiscal — Nova situação fiscal do fornecedor (Para valores, verifique a documentação pública)
  - nome_fantasia — Novo nome fantasia do fornecedor
  - responsavel_empresa — Novo responsável do fornecedor
  - nome_contato — Novo nome do contato do fornecedor
  - cpf_cnpj — Novo CPF ou CNPJ do fornecedor
  - rg — Novo RG do Fornecedor
  - rg_emissor — Novo emissor do RG
  - insc_estadual — Nova inscrição estadual do fornecedor
  - insc_municipal — Nova inscrição municipal do fornecedor
  - contrib_icms — Novo tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública)
  - endereco_logradouro — Nova rua do fornecedor
  - endereco_numero — Novo número da rua do fornecedor
  - endereco_bairro — Novo bairro do fornecedor
  - endereco_cidade — Nova cidade do fornecedor
  - endereco_uf — Nova UF do fornecedor
  - endereco_cep — Novo CEP do fornecedor
  - endereco_complemento — Novo complemento do endereço do fornecedor
  - endereco_ponto_referencia — Novo ponto de referência do endereço do fornecedor
  - endereco_pais — Novo país do fornecedor
  - endereco_coordenadas — Novas coordenadas (lat/long) do fornecedor
  - cpais — Novo código do país (Ex.: Brasil = 1058)
  - cmun — Novo código do município (Ex.: 2408102)
  - email — Novo e-mail do fornecedor
  - telefone — Novo telefone do fornecedor
  - celular — Novo celular do fornecedor
  - fax — Novo fax do fornecedor
  - observacao — Nova observação para o fornecedor
  - json — Novo JSON para o fornecedor (em caso de integrações futuras)
  - ativo — Modificar disponibilidade do fornecedor (valores: 0=Inativo;1=Ativo)


## FTTH (29)

### Listar OLT
`GET /api/fttx/olt/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar PON
`GET /api/fttx/olt/{olt_id}/pon/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar ONU por OLT
`GET /api/fttx/olt/{olt_id}/onu/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar ONU
`GET /api/fttx/onu/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar CTO utilizadas na OLT
`GET /api/fttx/olt/pon/{OLT_ID}/splitter/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar ONUs vinculadas a CTO
`GET /api/fttx/splitter/{cto_id}/onu/all/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar CTO
`GET /api/fttx/splitter/{id}/`


### Listar todas CTO
`GET /api/fttx/splitter/all/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Listar ONUs não autorizadas
`GET /api/fttx/olt/{olt_id}/unauth/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Autorizar ONU
`POST /api/fttx/olt/{olt_id}/auth/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - slot [obrig] — [Obrigatório] - Slot da OLT que será autorizada
  - pon [obrig] — [Obrigatório] - PON em que será autorizada
  - contrato [obrig] — [Obrigatório] - ID do contrato | Utilizar contrato e/ou service e/ou description
  - service [obrig] — [Obrigatório] - Login do cliente | Utilizar contrato e/ou service e/ou description
  - description [obrig] — [Obrigatório] - Descrição da ONU | Utilizar contrato e/ou service e/ou description
  - onutemplate [obrig] — [Obrigatório] - ID do ONU Template a ser utilizado
  - onutemplate_plain — Retira a necessidade de informar o onutemplate
  - splitter [obrig] — [Obrigatório] - ID da CTO | Utilizar splitter ou splitter_port + pon + slot
  - splitter_port [obrig] — [Obrigatório] - Porta da CTO | Utilizar splitter ou splitter_port + pon + slot
  - id [obrig] — [Obrigatório] - Phy Address que será gravada na ONU
  - onutype [obrig] — [Obrigatório] - Código do tipo da ONU
  - mode [obrig] — [Obrigatório] - BRIDGE = 1; PPPOE = 2; BRIDGE_WAN = 3; DHCP = 4;
  - vlan — VLAN
  - ident — Etiqueta da ONU
  - pppoe_login — Login do serviço
  - pppoe_password — Senha do serviço
  - wifi_ssid — Nome da rede Wifi
  - wifi_password — Senha da rede Wifi
  - wifi_channel — Canal da rede Wifi
  - wifi_ssid5 — Nome da rede Wifi (5GHz)
  - wifi_password5 — Senha da rede Wifi (5GHz)
  - wifi_channel5 — Canal da rede Wifi (5GHz)
  - wifi_authmode — Modo de autenticação da Wifi
  - wifi_encrypttype — Criptografia da Wifi
  - wifi_central — Permite gerenciar a wifi na central do assinante
  - onu_web — Habilita a alteração da ONU via Web
  - onu_web_port — Define a porta da interface web de alteração da ONU (Padrão: 80)
  - onu_telnet — Habilita Telnet
  - onu_login — Login WAN da ONU
  - onu_password — Senha WAN da ONU
  - no_auth — Permitir registrar a ONU sem autorizar na OLT atraves da api | Se usar, necessário informar onuid
  - onuid — Posição da ONU caso esteja utilizando com o parâmetro no_auth

### Resetar ONU
`GET /api/fttx/onu/{id_onu}/reset/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Exportar ONU
`GET /api/fttx/olt/{olt_id}/onu/export/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### ONU Info
`GET /api/fttx/onu/{id_onu}/info/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### ONU Detalhe
`GET /api/fttx/onu/{id_onu}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Alterar ONU
`POST /api/fttx/onu/{onu_id}/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - onu_update [obrig] — [Obrigatório] - Informar o que deseja alterar. Escolhas: 'wifi' , 'wan' , 'service'
  - wifi_ssid — Nome da rede Wifi ('wifi')
  - wifi_password — Senha da rede Wifi ('wifi')
  - wifi_channel — Canal da rede Wifi ('wifi')
  - wifi_ssid5 — Nome da rede Wifi (5GHz) ('wifi')
  - wifi_password5 — Senha da rede Wifi (5GHz) ('wifi')
  - wifi_channel5 — Canal da rede Wifi (5GHz) ('wifi')
  - wifi_central — Permite gerenciar a wifi na central do assinante ('wifi')
  - onu_web — Habilita a alteração da ONU via Web ('wan')
  - onu_telnet — Habilita Telnet ('wan')
  - onu_login — Login WAN da ONU ('wan')
  - onu_password — Senha WAN da ONU ('wan')
  - service — Login do serviço que deseja vincular a ONU ('service')

### Remover ONU
`GET /api/fttx/onu/{id_onu}/deauth/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Remover ONU
`POST /api/fttx/onu/{id_onu}/deauth/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### ONU Wifi
`GET /api/fttx/onu/{identificador_onu}/wifi/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### ONU WAN
`GET /api/fttx/onu/{identificador_onu}/wan/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### ONU CMD
`GET /api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/`


### ONU CMD
`POST /api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/`


### ONU TL1 CMD
`GET /api/fttx/onu/{IDENTIFICADOR_ONU}/tl1/cmd/`


### ONU Histórico
`GET /api/fttx/onu/history/`


### Cadastrar CTO
`POST /api/fttx/splitter/add/`


### ONU Template
`GET /api/fttx/onutemplate/list/`


### ONU Tipo
`GET /api/fttx/onutype/list/`


### ONU Modo
`GET /api/fttx/onumode/list/`


### Serviços
`GET /api/fttx/service/list/`


### Adicionar CTO ao Serviço
`POST /ws/fttx/splitter/service/add/`



## Ordem de Serviço (26)

### Ordens de Serviço
`POST /api/os/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - filtro_data — Garante a filtragem de agendamento inicial e final, independente de variáveis
  - agendamento_inicial — Data de agendamento inicial (formato: 'AAAA-MM-DD HH:mm:ss')
  - agendamento_final — Data de agendamento final (formato: 'AAAA-MM-DD HH:mm:ss')
  - pop_id — Retorna ordens de serviço vinculadas à contratos com esse ID de POP
  - contrato_id — Retorna ordens de serviço vinculadas ao contrato com esse ID
  - cliente_id — Retorna ordens de serviço vinculadas ao cliente com esse ID
  - status_encerrada — Retorna ordens de serviço que tenham data de finalização
  - data_finalizacao — Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD')
  - orderby — Ordenação dos resultados (Consultar documentação para valores)

### Ordem de Serviço por ID
`POST /api/os/list/id/{os_id}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordens de Serviço Total
`POST /api/os/list/total/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - filtro_data — Garante a filtragem de agendamento inicial e final, independente de variáveis
  - agendamento_inicial — Data de agendamento inicial (formato: 'AAAA-MM-DD')
  - agendamento_final — Data de agendamento final (formato: 'AAAA-MM-DD')
  - pop_id — Retorna ordens de serviço vinculadas à contratos com esse ID de POP
  - contrato_id — Retorna ordens de serviço vinculadas ao contrato com esse ID
  - cliente_id — Retorna ordens de serviço vinculadas ao cliente com esse ID
  - status_encerrada — Retorna ordens de serviço que tenham data de finalização
  - data_finalizacao — Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD')
  - orderby — Ordenação dos resultados (Consultar documentação para valores)

### Alterar Ordem de Serviço
`POST /api/os/update/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - os_servicoprestado — Altera o conteúdo do serviço prestado
  - os_observacao — Altera o conteúdo da observação
  - os_data_alteracao — Define uma data de alteração (formato: 'AAAA-MM-DD HH:mm:ss')
  - os_data_finalizacao — Define uma data de finalização (formato: 'AAAA-MM-DD HH:mm:ss')
  - checkin_data — Define uma data de checkin (formato: 'AAAA-MM-DD HH:mm:ss')
  - assinatura_cliente — Assinatura do cliente em formato base64
  - assinatura_tecnico — Assinatura do técnico em formato base64
  - assinatura_contrato — Assinatura do contrato em formato base64
  - os_status — Altera o status da O.S. (valores: 0 = 'Aberta'; 1 = 'Encerrada'; 2 = 'Em execução'; 3 = 'Pendente';)
  - checkin_latitude — Define a latitude da O.S. (ex: '-11.1313962')
  - checkin_longitude — Define a longitude da O.S. (ex: '-33.1017715')
  - classificacao_adicionar — IDs das Classificações a adicionar, separados por vírgula
  - classificacao_remover — IDs das Classificações a remover, separados por vírgula

### Ordem de Serviço - A caminho
`POST /api/os/acaminho/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Imprimir Ordem de Serviço
`GET /api/os/print/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Anexar Imagem
`PUT /api/os/imagem/id/{os_id}/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - file [obrig] — [Obrigatório] - Imagem a ser anexada | Utilizar este ou image_base64
  - image_base64 [obrig] — [Obrigatório] - Imagem em base64 | Utilizar este ou file
  - descricao — Informar o nome da imagem, ou será gerado um

### Ordem de Serviço - Alterar descrição da imagem
`POST /api/os/{os_id}/imagem/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - arquivo [obrig] — [Obrigatório] - Nome do arquivo
  - descricao [obrig] — [Obrigatório] - Nova descrição

### Ordem de Serviço - Imagem
`POST /api/os/{os_id}/imagem/detail/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - arquivo [obrig] — [Obrigatório] - Nome do arquivo

### Ordem de Serviço - Imagens
`GET /api/os/imagem/id/{os_id}/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Visualizar Anexo por ID
`GET  /api/os/imagem/{anexo_id}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Remover Imagem
`GET /api/os/imagem/{imagem_id}/delete/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Alterar Serviço
`POST /api/os/servico/update/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - set_mac — Define um novo MAC Autenticação
  - del_mac — Remove o MAC Autenticação
  - conexao_senha — Define uma nova senha do serviço (ex: Senha PPPoE)

### Ordem de Serviço - Anotações
`POST /api/os/anotacoes/list/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Cadastrar Anotação
`POST /api/os/anotacoes/add/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - anotacao [obrig] — [Obrigatório] - Anotação a ser criada

### Ordem de Serviço - Comentários (Ocorrência)
`POST /api/os/ocorrencia/comentario/list/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Ordem de Serviço - Cadastrar Comentário (Ocorrência)
`POST /api/os/ocorrencia/comentario/add/id/{os_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - anotacao [obrig] — [Obrigatório] - Comentário a ser criado

### Ordem de Serviço - Checklist
`GET /api/os/{os_id}/checklist/list/`


### Ordem de Serviço - Marcar/Desmarcar Checklist
`POST /api/os/checklist/{checklist_id}/toggle/`


### Ordem de Serviço - Comentários
`GET /api/os/{os_id}/comentario/list/`


### Ordem de Serviço - Cadastrar Comentário
`POST /api/os/{os_id}/comentario/add/`


### Ordem de Serviço - Excluir Comentário
`POST /ws/os/{os_id}/comentario/delete/`


### Motivos
`GET /api/os/ocorrencia/motivo/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Métodos
`GET /api/os/ocorrencia/metodo/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Tipos
`GET /api/os/ocorrencia/tipo/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Setores
`GET /api/os/ocorrencia/setor/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth


## CRM (12)

### Consulta Cliente - Cliente ID
`GET /api/crm/cliente/{{cliente_id}}/`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app

### Consulta Cliente - CPFCNPJ
`GET /api/crm/cliente/?cpfcnpj`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app

### Consulta Contratos - Por Cliente ID
`GET /api/crm/cliente/{{cliente_id}}/contratos/`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app

### Consulta Contratos - Por CPFCNPJ do Cliente
`GET /api/crm/cliente/contratos/?cpfcnpj`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app

### Cliente - Cadastrar Pessoa Física
`POST /api/crm/cliente/F`


### Cliente - Cadastrar Pessoa Jurídica
`POST /api/crm/cliente/J`


### Cliente - Cadastrar Pessoa Estrangeira
`POST /api/crm/cliente/E`


### Cliente - Cadastrar Pessoa Jurídica Estrangeira
`POST /api/crm/cliente/EJ`


### Contrato - Cadastro por Cliente ID
`POST /api/crm/cliente/{{cliente_id}}/contratos`


### Contrato - Cadastro por CPFCNPJ Cliente
`POST /api/crm/cliente/contratos/?cpfcnpj`


### Status CRM - Alterar por Cliente ID
`POST /api/crm/cliente/{{cliente_id}}/status/`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app
  - status_id [obrig] — [Obrigatório] - Status a definir
  - motivo — Motivo da mudana de status

### Status CRM - Alterar por Cliente CPFCNPJ
`POST /api/crm/cliente/status/?cpfcnpj`
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app
  - status_id [obrig] — [Obrigatório] - Status a definir
  - motivo — 


## Gerenciador CPE (12)

### CPE - Detalhes
`GET /api/cpemanager/servico/{id_servico}/infodetail`


### CPE - Sincronizar WAN
`POST /api/cpemanager/servico/{id_servico}/sync/`


### CPE - Importar Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/import/`


### CPE - Definir Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/set/`


### CPE - Configurar Wan
`POST /api/cpemanager/servico/{id_servico}/pppoe/`


### CPE - Ping
`POST /api/cpemanager/servico/{id_servico}/command/ping/`


### CPE - SpeedTest
`POST /api/cpemanager/servico/{id_servico}/command/speedtest/`


### CPE - Remover Dados do SGP
`POST /api/cpemanager/servico/{id_servico}/command/clear/`


### CPE - Reboot
`POST /api/cpemanager/servico/{id_servico}/command/boot/`


### CPE - Wifi List
`GET /api/cpemanager/servico/{id_servico}/wifi/list/`


### CPE - Atualizar dados Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/update/`


### CPE - Atualizar Campo
`POST /api/cpemanager/servico/{id_servico}/update/field/?param=InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase&value=123123456`
  - token — 
  - app — 


## Suporte (9)

### Serviço - Alterar
`POST /api/suporte/service/update/{servico_id}/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - servico_tipo — Tipo do serviço a ser alterado, padrão: Internet (Consulte a documentação para todos os valores)
  - action — Ação ser realizada (Consulte a documentação para todos os valores)
  - mac — Caso action seja 'change_mac', informar novo MAC aqui
  - login — Caso action seja 'change_login', informar novo login aqui
  - login_password — Caso action seja 'change_password', informar nova senha aqui
  - map_ll — Caso action seja 'change_endereco", informar a latitude e longitude aqui. Exemplo de formato: '-99.9999, -99.9999'
  - serial — Caso action seja 'change_serial', informar novo serial aqui
  - cpemanager — Caso action seja 'change_cpemanager', informar novo gerenciador de CPE aqui
  - plano_id — Informar ID do plano novo em caso de mudança de plano

### Serviço Genérico - Criar
`POST /api/servico/generico`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - clientecontrato_id [obrig] — [Obrigatório] - ID do contrato de serviço que terá o serviço genérico criado
  - planobase_id [obrig] — [Obrigatório] - ID do plano do serviço genérico
  - descricao — Descrição a ser salva
  - identificador_gateway — Informação a ser salva no "Gateway ID"
  - identificador_gateway_extra — Informação a ser salva no "Gateway Extra"
  - login — Login do serviço
  - senha — Senha do serviço

### Serviço Genérico - Deletar
`DELETE /api/servico/generico/{id}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - clientecontrato_id [obrig] — [Obrigatório] - ID do contrato de serviço que está vinculado à esse serviço

### Contratos
`POST /api/suporte/contrato/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - cliente_nome — Nome do cliente vinculado ao contrato
  - cliente_id — ID do cliente vinculado ao contrato
  - contrato_id — Consultar especificamente o contrato com esse ID
  - servico_login — Consulta contratos que tenham serviços de internet, tv ou telefonia com esse login
  - cliente_cpfcnpj — Retorna contratos vinculados ao cliente desse CPF ou CNPJ

### Cadastrar Cliente Documento
`PUT /api/suporte/cliente/{cliente_id}/documento/add/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - file [obrig] — [Obrigatório] - Arquivo que será criado
  - descricao — Descrição do arquivo. Se não informado, utilizará o original do arquivo

### Alterar Cliente Documento
`POST /api/suporte/cliente/{cliente_id}/documento/edit/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - arquivo [obrig] — [Obrigatório] - Nome do arquivo
  - descricao [obrig] — [Obrigatório] - Nova descrição

### Cliente Documento
`POST /api/suporte/cliente/{cliente_id}/documento/detail/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - arquivo [obrig] — [Obrigatório] - Nome do arquivo

### Cliente Documentos
`GET /api/suporte/cliente/{cliente_id}/documento/list/`


### Remover Cliente Documento
`GET /api/suporte/cliente/{documento_id}/documento/delete/`



## Pré-Cadastro (5)

### Plano – Listar
`POST /api/precadastro/plano/list`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação

### Vencimento – Listar
`POST /api/precadastro/vencimento/list`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação

### Vendedor – Listar
`POST /api/precadastro/vendedor/list`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação

### Pré-Cadastro – Cadastrar PF
`POST /api/precadastro/F`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - nome [obrig] — [Obrigatório] - Nome do cliente
  - logradouro [obrig] — [Obrigatório] - Logradouro do cliente
  - numero — Número da rua
  - bairro — Bairro do endereço
  - cidade — Cidade do endereço
  - uf — UF do endereço, apenas sigla
  - cep — CEP do endereço
  - complemento — Complemento do endereço
  - pontoreferencia — Ponto de referência do endereço
  - condominio — ID do condomínio desse endereço
  - map_ll — Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715')
  - pais — País do endereço, apenas sigla (padrão: BR)
  - datanasc — Data de nascimento (formato: 'AAAA-MM-DD')
  - cpfcnpj — CPF do cliente
  - rg — RG do cliente
  - rg_emissor — Emissor do RG
  - nomepai — Nome do pai
  - nomemae — Nome da mãe
  - nacionalidade — Nacionalidade
  - naturalidade — Naturalidade
  - estadocivil — Estado civil (escolhas: 'S' = Solteiro(a); 'C' = Casado(a); 'D' = Divorciado(a); 'V' = Viúvo(a);)
  - sexo — Gênero (escolhas: 'M' = Masculino; 'F' = Feminino;)
  - profissao — Profissão do cliente
  - observacao — Observação do cliente
  - email — E-mail de contato
  - celular — Telefone de contato
  - portador_id — ID do portador - [Para criação de contrato]
  - pop_id — ID do POP - [Para criação de contrato]
  - nas_id — ID do NAS
  - plano_id — ID do Plano (Internet)
  - planointernet_id — ID do Plano de Internet
  - planobase_id — ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico)
  - vencimento_id — ID do vencimento - [Para criação de contrato]
  - login — Login (PPPoE ou Email) do contrato - [Para criação de contrato]
  - senha — Senha do contrato - [Para criação de contrato]
  - central_senha — Senha de acesso à cental - [Para criação de contrato]
  - modoaquisicao — Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato]
  - fidelidade_id — ID da fidelidade - [Para criação de contrato]
  - contrato_id — ID do grupo de contratos de impressão - [Para criação de contrato]
  - ip — Endereço de IP - [Para criação de contrato]
  - mac — MAC Controle - [Para criação de contrato]
  - splitter_id — ID da CTO - [Para criação de contrato]
  - splitter_port — Porta da CTO - [Para criação de contrato]
  - servicodesc — Detalhes do serviço solicitado
  - tipo_equipamento_id — ID do tipo de equipamento - [Para criação de contrato]
  - midia_id — Como conheceu a empresa? (ID)
  - vendedor_id — ID do vendedor - [Para criação de contrato]
  - tecnico_id — ID do técnico responsável para instalação - [Para criação de contrato]
  - os_instalacao — Gerar OS de instalação? (valor: 1) - [Para criação de contrato]
  - instalacao_quantidade_parcelas — Quantidade de parcelas de instalação - [Para criação de contrato]
  - instalacao_preco — Valor da instalação - [Para criação de contrato]
  - instalacao_desconto — Valor descontado da instalação - [Para criação de contrato]
  - instalacao_entrada — Valor de entrada da instalação - [Para criação de contrato]
  - instalacao_entrada_forma — Forma de entrada da instalação (Consulte a documentação para valores) - [Para criação de contrato]
  - instalacao_parcela_forma — Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato]
  - ippool_id — ID do Pool de IP - [Para criação de contrato]
  - mac_dhcp — MAC Autenticação - [Para criação de contrato]
  - comissao_tipo — Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato]
  - comissao_valor — Valor da comissão do vendedor - [Para criação de contrato]
  - comissao_qtd_parcelas — Quantidade de parcelas da comissão do vendedor - [Para criação de contrato]
  - usuariocad_id — ID do usuário responsável pelo pré-cadastro
  - formacobranca_id — ID da Forma de Cobrança
  - precadastro_ativar — Converte o pré-cadastro em cadastro definitivo

### Pré-Cadastro – Cadastrar PJ
`POST /api/precadastro/J`
  - token [obrig] — [Obrigatório] - Token de autenticação
  - app [obrig] — [Obrigatório] - Appname de autenticação
  - nome [obrig] — [Obrigatório] - Razão social da empresa
  - logradouro [obrig] — [Obrigatório] - Logradouro da empresa
  - numero — Número da rua
  - bairro — Bairro do endereço
  - cidade — Cidade do endereço
  - uf — UF do endereço, apenas sigla
  - сер — CEP do endereço
  - complemento — Complemento do endereço
  - pontoreferencia — Ponto de referência do endereço
  - condominio — ID do condomínio desse endereço
  - map_ll — Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715')
  - pais — País do endereço, apenas sigla (padrão: BR)
  - datanasc — Data de fundação da empresa
  - cpfcnpj — CNPJ da empresa
  - nomefantasia — Nome fantasia da empresa
  - respempresa — Nome do responsável da empresa
  - respcpf — CPF do responsável da empresa
  - observacao — Observação da empresa
  - email — E-mail de contato
  - celular — Telefone de contato
  - portador_id — ID do portador - [Para criação de contrato]
  - pop_id — ID do POP - [Para criação de contrato]
  - nas_id — ID do NAS
  - plano_id — ID do plano - [Para criação de contrato]
  - planointernet_id — ID do Plano de Internet
  - planobase_id — ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico)
  - vencimento_id — ID do vencimento - [Para criação de contrato]
  - login — Login (PPPoE ou Email) do contrato - [Para criação de contrato]
  - senha — Senha do contrato - [Para criação de contrato]
  - central_senha — Senha de acesso à cental - [Para criação de contrato]
  - modoaquisicao — Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato]
  - fidelidade_id — ID da fidelidade - [Para criação de contrato]
  - contrato_id — ID do grupo de contratos de impressão - [Para criação de contrato]
  - ip — Endereço de IP - [Para criação de contrato]
  - mac — MAC Controle - [Para criação de contrato]
  - splitter_id — ID da CTO - [Para criação de contrato]
  - splitter_port — Porta da CTO - [Para criação de contrato]
  - servicodesc — Detalhes do serviço solicitado
  - tipo_equipamento_id — ID do tipo de equipamento - [Para criação de contrato]
  - midia_id — Como conheceu a empresa? (ID)
  - vendedor_id — ID do vendedor - [Para criação de contrato]
  - tecnico_id — ID do técnico responsável para instalação - [Para criação de contrato]
  - os_instalacao — Gerar OS de instalação? (valor: 1) - [Para criação de contrato]
  - instalacao_quantidade_parcelas — Quantidade de parcelas de instalação - [Para criação de contrato]
  - instalacao_preco — Valor da instalação - [Para criação de contrato]
  - instalacao_desconto — Valor descontado da instalação - [Para criação de contrato]
  - instalacao_entrada — Valor de entrada da instalação - [Para criação de contrato]
  - instalacao_entrada_forma — Forma de entrada da instalação (Consulte a documentação para valores) - [Para criação de contrato]
  - instalacao_parcela_forma — Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato]
  - ippool_id — ID do Pool de IP - [Para criação de contrato]
  - mac_dhop — MAC Autenticação - [Para criação de contrato]
  - comissao_tipo — Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato]
  - comissao_valor — Valor da comissão do vendedor - [Para criação de contrato]
  - comissao_qtd_parcelas — Quantidade de parcelas da comissão do vendedor - [Para criação de contrato]
  - usuariocad_id — ID do usuário responsável pelo pré-cadastro
  - formacobranca_id — ID da Forma de Cobrança
  - precadastro_ativar — Converte o pré-cadastro em cadastro definitivo


## RADIUS (5)

### Login PPPoE – Listar
`POST /ws/radius/radacct/list/all/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - offset — Deslocamento da consulta (à partir de quando deve começar, Padrão: 0)
  - limit — Limite de resultados (Padrão: 100; Máximo: 1000*;) *Consulte documentação.
  - username — Login do serviço de internet - [Esse filtro pode ser usado sozinho]
  - online — Encontra-se online? (valores: 1 = 'Online; 0 = 'Offline';) - [Esse filtro pode ser usado sozinho]
  - host — IP em formato IPv4 ou IPv6. Também atende por framedipaddress - [Esse filtro pode ser usado sozinho]
  - framedipaddress — IP em formato IPv4 ou IPv6. Também atende por host - [Esse filtro pode ser usado sozinho]
  - callingstationid — Identificador do Calling Station - [Esse filtro pode ser usado sozinho]
  - nasportid — Identificador da porta NAS - [Esse filtro pode ser usado sozinho]
  - last_session — Retorna apenas a última sessão de cada cliente encontrado- [Esse filtro pode ser usado sozinho]
  - cep — CEP do endereço de instalação - [Esse filtro necessita de ao menos um outro]
  - logradouro — Logradouro do endereço de instalação - [Esse filtro necessita de ao menos um outro]
  - bairro — Bairro do endereço de instalação - [Esse filtro necessita de ao menos um outro]
  - cidade — Cidade do endereço de instalação - [Esse filtro necessita de ao menos um outro]
  - uf — UF do endereço de instalação - [Esse filtro necessita de ao menos um outro]
  - tipopessoa — Tipo de pessoa (valores: 'F' = Física; 'J' = Jurídica; 'E' = Estrangeira;) - [Esse filtro necessita de ao menos um outro]
  - cpfcnpj — CPF ou CNPJ do cliente - [Esse filtro necessita de ao menos um outro]
  - notafiscal — Procura por serviços que tenham notas fiscais geradas no período informado em data_inicial e data_final - [Esse filtro necessita de ao menos um outro]
  - data_inicial — Data de emissão inicial de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') - [Esse filtro necessita de ao menos um outro]
  - data_final — Data de emissão final de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') - [Esse filtro necessita de ao menos um outro]
  - plano — ID(s) do(s) Plano(s) de Internet - [Esse filtro necessita de ao menos um outro]
  - pop — ID(s) do(s) POP(s) - [Esse filtro necessita de ao menos um outro]
  - grupo — ID do grupo do contrato ou plano (Para valores, consulte a documentação pública) - [Esse filtro necessita de ao menos um outro]
  - nas — ID(s) do(s) NAS vinculado(s) ao(s) contrato(s) - [Esse filtro necessita de ao menos um outro]
  - ipfixo — Possui IP definido no contrato? (valor: 1) - [Esse filtro necessita de ao menos um outro]
  - tipoconexao — Tipo de conexão (Consulte valores na documentação pública) - [Esse filtro necessita de ao menos um outro]
  - olt — ID(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro]
  - oltslot — Identificador(es) do(s) slot(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro]
  - pon — Identificador(es) da(s) PON(s) - [Esse filtro necessita de ao menos um outro]
  - calledstationid — Identificador do Called Station - [Esse filtro necessita de ao menos um outro]

### Login PPPoE – Detalhar Status
`POST /ws/radius/service/status/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - incluir_suspensos — Passa a retornar também serviços suspensos. O padrão é retornar Ativos e Reduzidos.

### Login PPPoE – Desconectar
`POST /ws/radius/disconnect/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - login [obrig] — [Obrigatório] - Login PPPoE a ser desconectado

### Radius – Check Replies
`POST /ws/radius/{param}/list/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth

### Radius – Log
`GET /ws/radius/log/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth


## Remessa / Retorno (2)

### Download Remessa
`POST /api/banco/remessa/download/`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha
  - portador [obrig] — [Obrigatório] - ID do portador
  - modelo_arquivo [obrig] — [Obrigatório] - CNAB da remessa, escolhas são "CNAB240" ou "CNAB400"
  - ocorrencias [obrig] — [Obrigatório] - Código de movimentação dos títulos da remessa, ex: 01 = registro; 02 = baixa;
  - data_inicial [obrig] — [Obrigatório] - Títulos com vencimento à partir de (formato: "AAAA-MM-DD")
  - data_final [obrig] — [Obrigatório] - Títulos com vencimento até (formato: "AAAA-MM-DD")
  - data_emissao_inicial — Títulos gerados à partir de (formato: "AAAA-MM-DD")
  - data_emissao_final — Títulos gerados até (formato: "AAAA-MM-DD")
  - status — Status do contrato que possui os títulos. Escolhas: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;7=Reduzido
  - pop — ID do POP que o contrato (detentor dos títulos) deve possuir
  - status_baixa — Incluirá também na remessa de baixa (ocorrencias 02) títulos em aberto

### Upload Retorno
`POST /api/banco/retorno/upload/`
  - app [obrig] — [Obrigatório] - Token de autenticação
  - token [obrig] — [Obrigatório] - Appname de autenticação
  - portador [obrig] — [Obrigatório] - ID do portador que receberá o retorno
  - arquivo [obrig] — [Obrigatório] - Arquivo de retorno, necessário anexar no endpoint
  - previewcheck — Não processa o retorno, dando apenas um feedback da anexação


## Termo de Aceite (2)

### Termo Exibir
`GET /api/contrato/termoaceite/{idcontrato}/`


### Termo Aceitar
`POST /api/contrato/termoaceite/{idcontrato}`
  - token [obrig] — [Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth
  - app [obrig] — [Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth
  - aceite [obrig] — [Obrigatório] - Necessário enviar para aceitar


## Outros (1)

### Informações do usuário
`GET /api/auth/info/`

