---
title: "SGP API — CRM"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP CRM", "API SGP CRM"]
tags: [sgp, api, reference, crm]
---

# SGP API — CRM

Endpoints do módulo **CRM** da API do SGP (12). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Consulta Cliente - Cliente ID
`GET /api/crm/cliente/{{cliente_id}}/`

(sem parâmetros além de auth)

## Consulta Cliente - CPFCNPJ
`GET /api/crm/cliente/?cpfcnpj`

(sem parâmetros além de auth)

## Consulta Contratos - Por Cliente ID
`GET /api/crm/cliente/{{cliente_id}}/contratos/`

(sem parâmetros além de auth)

## Consulta Contratos - Por CPFCNPJ do Cliente
`GET /api/crm/cliente/contratos/?cpfcnpj`

(sem parâmetros além de auth)

## Cliente - Cadastrar Pessoa Física
`POST /api/crm/cliente/F`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP nome String [Obrigatório] - Nome do cliente cpfcnpj String [Obrigatório] - CPF do cliente. Formato: NNN.NNN.NNN-NN ou NNNNNNNNNNN rg String RG do cliente rg_emissor Emissor do RG do cliente sexo String Sexo do cliente. Exemplo: "M" ou "F" estadocivil String Estado Civil do cliente. Exemplo: Casado: "C". Solteiro: "S". Viúvo: "V". Divorciado: "D" nomemae String Nome da mãe do cliente nomepai Nome do pai do cliente profissao String Profissão do cliente nacionalidade String Nacionalidade do cliente. Exemplo: "BR", "PY" naturalidade String Naturalidade do cliente email String E-mail do cliente celular String Celular do cliente. Formato: (DD) NNNNN-NNNN datanasc String Data de nascimento do cliente. Formato: DD/MM/AAAA logradouro String [Obrigatório] - Logradouro do endereço do cliente numero Integer Número do endereço do cliente complemento String Complemento do endereço do cliente bairro String [Obrigatório] - Bairro do endereço do cliente cidade String [Obrigatório] - cidade do endereço do cliente cep String [Obrigatório] - CEP do endereço do cliente. Formato: NNNNN-NNN ou NNNNNNNN uf String [Obrigatório] - UF do endereço do cliente pais String País do endereço do cliente. Exemplo: "BR", "PY" pontoreferencia String Ponto de referência do endereço do cliente map_ll String Geolocalização do endereço do cliente. Formato: "latitude,longitude" condominio String ID do condomínio do cliente observacao String Observações gerais sobre o cliente

Body (raw):
```
{
  "app": "",
  "token": "",
  "nome": "",
  "cpfcnpj": "",
  "email": "",
  "celular": "",
  "datanasc": "",
  "endereco": {
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cidade": "",
        "cep": "",
        "uf": "",
        "pais": "",
        "pontoreferencia": "",
        "map_ll": "",
        "condominio": ""
    },
  "observacao": "",
  "rg": "",
  "rg_emissor": "",
  "sexo": "",
  "estadocivil": "",
  "nomemae": "",
  "nomep
```

## Cliente - Cadastrar Pessoa Jurídica
`POST /api/crm/cliente/J`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP nome String [Obrigatório] - Nome da empresa nomefantasia String Nome fantasia da empresa cpfcnpj String [Obrigatório] - CNPJ da empresa. Formato: NN.NNN.NNN/NNNN-NN ou NNNNNNNNNNNNNN respempresa String Nome do reponsável pela empresa cliente respcpf String CPF do responsável pela empresa email String E-mail da empresa celular String Celular da empresa. Formato: (DD) NNNNN-NNNN datafundacao String Data de fundação da empresa. Formato: DD/MM/AAAA logradouro String [Obrigatório] - Logradouro do endereço da empresa numero Integer Número do endereço da empresa complemento String Complemento do endereço da empresa bairro String [Obrigatório] - Bairro do endereço da empresa cidade String [Obrigatório] - cidade do endereço da empresa cep String [Obrigatório] - CEP do endereço da empresa. Formato: NNNNN-NNN ou NNNNNNNN uf String [Obrigatório] - UF do endereço da empresa pais String País do endereço da empresa. Exemplo: "BR", "PY" pontoreferencia String Ponto de referência do endereço da empresa map_ll String Geolocalização do endereço da empresa. Formato: "latitude,longitude" condominio String ID do condomínio da empresa observacao String Observações gerais sobre a empresa

Body (raw):
```
{
  "app": "",
  "token": "",
  "nome": "",
  "nomefantasia":"",
  "cpfcnpj": "",
  "respempresa":"",
  "respcpf":"",
  "insc_estadual":"",
  "insc_municipal":"",
  "email": "",
  "celular": "",
  "datanasc": "",
  "endereco": {
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cidade": "",
        "cep": "",
        "uf": "",
        "pais": "",
        "pontoreferencia": "",
        "map_ll": "",
        "condominio": ""
    },
  "observa
```

## Cliente - Cadastrar Pessoa Estrangeira
`POST /api/crm/cliente/E`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP nome String [Obrigatório] - Nome do cliente tipodoc String Tipo de documento do cliente. Exemplo: "PASSAPORTE", "DNI", "OUTRO" cpfcnpj String [Obrigatório] - Documento do cliente sexo String Sexo do cliente. Exemplo: "M" ou "F" estadocivil String Estado Civil do cliente. Exemplo: Casado: "C". Solteiro: "S". Viúvo: "V". Divorciado: "D" nomemae String Nome da mãe do cliente nomepai String Nome do pai do cliente profissao String Profissão do cliente nacionalidade String Nacionalidade do cliente. Exemplo: "BR", "PY" naturalidade String Naturalidade do cliente email String E-mail do cliente celular String Celular do cliente. Formato: (DD) NNNNN-NNNN datanasc String Data de nascimento do cliente. Formato: DD/MM/AAAA logradouro String [Obrigatório] - Logradouro do endereço do cliente numero Integer Número do endereço do cliente complemento String Complemento do endereço do cliente bairro String [Obrigatório] - Bairro do endereço do cliente cidade String [Obrigatório] - cidade do endereço do cliente cep String [Obrigatório] - CEP do endereço do cliente uf String [Obrigatório] - UF do endereço do cliente pais String País do endereço do cliente. Exemplo: "BR", "PY" pontoreferencia String Ponto de referência do endereço do cliente map_ll String Geolocalização do endereço do cliente. Formato: "latitude,longitude" condominio String ID do condomínio do cliente observacao String Observações gerais sobre o cliente

Body (raw):
```
{
  "app": "",
  "token": "",
  "nome": "",
  "tipodoc":"",
  "cpfcnpj": "",
  "datanasc": "",
  "sexo": "",
  "estadocivil": "",
  "nomemae": "",
  "nomepai": "",
  "profissao": "",
  "nacionalidade": "",
  "naturalidade": "",
  "email": "",
  "celular": "",
  "endereco": {
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cidade": "",
        "cep": "",
        "uf": "",
        "pais": "",
        "pontoreferencia": "",
        "map_ll":
```

## Cliente - Cadastrar Pessoa Jurídica Estrangeira
`POST /api/crm/cliente/EJ`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP nome String [Obrigatório] - Nome da empresa tipodoc String Tipo de documento do cliente. Exemplo: "PASSAPORTE", "DNI", "OUTRO" cpfcnpj String [Obrigatório] - CNPJ da empresa. Formato: NN.NNN.NNN/NNNN-NN ou NNNNNNNNNNNNNN email String E-mail da empresa celular String Celular da empresa. Formato: (DD) NNNNN-NNNN datafundacao String Data de fundação da empresa. Formato: DD/MM/AAAA logradouro String [Obrigatório] - Logradouro do endereço da empresa numero Integer Número do endereço da empresa complemento String Complemento do endereço da empresa bairro String [Obrigatório] - Bairro do endereço da empresa cidade String [Obrigatório] - cidade do endereço da empresa cep String [Obrigatório] - CEP do endereço da empresa. Formato: NNNNN-NNN ou NNNNNNNN uf String [Obrigatório] - UF do endereço da empresa pais String País do endereço da empresa. Exemplo: "BR", "PY" pontoreferencia String Ponto de referência do endereço da empresa map_ll String Geolocalização do endereço da empresa. Formato: "latitude,longitude" condominio String ID do condomínio da empresa observacao String Observações gerais sobre a empresa

Body (raw):
```
{
  "app": "",
  "token": "",
  "nome": "",
  "tipodoc":"",
  "cpfcnpj": "",
  "datafundacao": "",
  "celular": "",
  "email": "",
  "endereco": {
        "logradouro": "",
        "numero": "",
        "complemento": "",
        "bairro": "",
        "cidade": "",
        "cep": "",
        "uf": "",
        "pais": "",
        "pontoreferencia": "",
        "map_ll": "",
        "condominio": ""
    },
  "observacao": ""
}
  
```

## Contrato - Cadastro por Cliente ID
`POST /api/crm/cliente/{{cliente_id}}/contratos`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP vendedor_id Integer ID do vendedor responsável comissao_tipo Integer Tipo de valor informado para comissão. Exemplo: 1 - Porcentagem e 2 - Valor Fixo comissao Float Valor da comissão do vendedor pop_id Integer [Obrigatório] - ID do POP contrato_id Integer ID do grupo de contrato para impressão login String Login de acesso do cliente ou serviço. Para serviço de internet é o login PPPoE (obrigatório para serviço de internet) senha String Senha do cliente ou serviço. Para serviço de internet é a senha do PPPoE (obrigatório para serviço de internet) plano_id Integer [Obrigatório] - ID do plano contratado pelo cliente portador_id Integer [Obrigatório] - ID do portador ou responsável financeiro forma_cobranca_codigo Integer [Obrigatório] - Forma de cobrança. Valores aceitos: 1 - Boleto 2 - Débito Automático 3 - Carnê 4 - Cobrança Recorrente 6 - PIX isento Float Porcentagem de isenção do contrato servicodesc String Descrição fixa do serviço (para notas fiscais) autocobranca Bool Ativação da autocobrança do contrato. Exemplo: "false" para desativado e "true" para ativado, ambos sem aspas vencimento_dia Integer [Obrigatório] - Dia de vencimento cadastrado no SGP fidelidade_id Integer ID da fidelidade observacao String Observações gerais sobre o cliente ou serviço nas String Nome dos NAS (Somente para Serviço de Internet) central_login String Login da central do assinante. Obrigatório se informado central_senha. central_senha String Senha da central do assinante. Obrigatório se informado central_login. ip String Endereço IP atribuído ao cliente (Somente para Serviço de Internet) ippool_id Integer Identificador do pool de IPs (Somente para Serviço de Internet) mac_dhcp String Endereço MAC configurado via DHCP (Somente para Serviço de Internet) mac String Endereço MAC fixo do equipamento (Somente para Serviço de Internet) logins_simult Integer Quantidade de acessos simultâneos permitidos com o mesmo login modoaquisicao Integer Modo de aquisição do serviço. Informe 1 para Próprio ou 2 para Comodato. (Campo obrigatório para serviços de Internet) midia_id Integer ID da mídia usada pelo cliente os_instalacao Bool Abertura de OS de instalação. Exemplo: "false" para não abrir e "true" para abrir, sem aspas conteudo String Conteúdo da ocorrência que será aberta no cadastro do contrato (depende de os_instalacao ser "true") instalacao_quantidade_parcelas Integer Quantidade de parcelas da instalação instalacao_preco Float Preço total da instalação instalacao_desconto Float Desconto aplicado na instalação instalacao_entrada Float Valor da entrada paga na instalação instalacao_entrada_forma Integer Forma de pagamento da entrada instalacao_parcela_forma Integer Forma de pagamento das parcelas restantes instalacao_portador Integer ID do portador que recebeu o pagamento da instalação logradouro String [Obrigatório] - Logradouro do endereço do cliente. (instalação e cobrança) numero Integer Número do endereço do cliente. (instalação e cobrança) complemento String Complemento do endereço do cliente. (instalação e cobrança) bairro String [Obrigatório] - Bairro do endereço do cliente. (instalação e cobrança) cidade String [Obrigatório] - cidade do endereço do cliente. (instalação e cobrança) cep String [Obrigatório] - CEP do endereço do cliente. Formato: NNNNN-NNN ou NNNNNNNN. (instalação e cobrança) uf String [Obrigatório] - UF do endereço do cliente. (instalação e cobrança) pais String País do endereço da empresa. Exemplo: "BR", "PY". (instalação e cobrança) pontoreferencia String Ponto de referência do endereço do cliente. (instalação e cobrança) map_ll String Geolocalização do endereço do cliente. Formato: "latitude,longitude". (instalação e cobrança) condominio String ID do condomínio do cliente. (instalação e cobrança) usuarioalt_id Integer ID do usuário que alterou o registro splitter_id Integer ID do splitter utilizado na instalação (Somente para Serviço de Internet) splitter_port Integer Porta do splitter utilizada (Somente para Serviço de Internet) tipo_equipamento String Código do tipo de equipamento cadastrado

Body (raw):
```
{
  "app": "",
  "token": "",
  "contrato_id": 0,
  "pop_id": "",
  "plano_id": 0,
  "vencimento_dia": 0,
  "forma_cobranca_codigo": 0,
  "isento": 0.0,
  "autocobranca": false,
  "observacao": "",
  "vendedor_id": 0,
  "comissao_tipo": 0,
  "comissao": 0.0,
  "login": "",
  "senha": "",
  "email": "",
  "portador_id": 0,
  "fidelidade_id": 0,
  "nas": "",
  "central_login": "",
  "central_senha": "",
  "ip": "",
  "ippool_id": 0,
  "mac_dhcp": "",
  "logins_simult": 0,
  "mac": "",
  "servicode
```

## Contrato - Cadastro por CPFCNPJ Cliente
`POST /api/crm/cliente/contratos/?cpfcnpj`

Parâmetro Tipo Descrição app String [Obrigatório] - Nome da aplicação no SGP token String [Obrigatório] - Token no SGP vendedor_id Integer ID do vendedor responsável comissao_tipo Integer Tipo de valor informado para comissão. Exemplo: 1 - Porcentagem e 2 - Valor Fixo comissao Float Valor da comissão do vendedor pop_id Integer [Obrigatório] - ID do POP contrato_id Integer ID do grupo de contrato para impressão login String Login de acesso do cliente ou serviço. Para serviço de internet é o login PPPoE (obrigatório para serviço de internet) senha String Senha do cliente ou serviço. Para serviço de internet é a senha do PPPoE (obrigatório para serviço de internet) plano_id Integer [Obrigatório] - ID do plano contratado pelo cliente portador_id Integer [Obrigatório] - ID do portador ou responsável financeiro forma_cobranca_codigo Integer [Obrigatório] - Forma de cobrança. Valores aceitos: 1 - Boleto 2 - Débito Automático 3 - Carnê 4 - Cobrança Recorrente 6 - PIX isento Float Porcentagem de isenção do contrato servicodesc String Descrição fixa do serviço (para notas fiscais) autocobranca Bool Ativação da autocobrança do contrato. Exemplo: "false" para desativado e "true" para ativado, ambos sem aspas vencimento_dia Integer [Obrigatório] - Dia de vencimento cadastrado no SGP fidelidade_id Integer ID da fidelidade observacao String Observações gerais sobre o cliente ou serviço nas String Nome dos NAS (Somente para Serviço de Internet) central_login String Login da central do assinante. Obrigatório se informado central_senha. central_senha String Senha da central do assinante. Obrigatório se informado central_login. ip String Endereço IP atribuído ao cliente (Somente para Serviço de Internet) ippool_id Integer Identificador do pool de IPs (Somente para Serviço de Internet) mac_dhcp String Endereço MAC configurado via DHCP (Somente para Serviço de Internet) mac String Endereço MAC fixo do equipamento (Somente para Serviço de Internet) logins_simult Integer Quantidade de acessos simultâneos permitidos com o mesmo login modoaquisicao Integer Modo de aquisição do serviço. Informe 1 para Próprio ou 2 para Comodato. (Campo obrigatório para serviços de Internet) midia_id Integer ID da mídia usada pelo cliente os_instalacao Bool Abertura de OS de instalação. Exemplo: "false" para não abrir e "true" para abrir, sem aspas conteudo String Conteúdo da ocorrência que será aberta no cadastro do contrato (depende de os_instalacao ser "true") instalacao_quantidade_parcelas Integer Quantidade de parcelas da instalação instalacao_preco Float Preço total da instalação instalacao_desconto Float Desconto aplicado na instalação instalacao_entrada Float Valor da entrada paga na instalação instalacao_entrada_forma Integer Forma de pagamento da entrada instalacao_parcela_forma Integer Forma de pagamento das parcelas restantes instalacao_portador Integer ID do portador que recebeu o pagamento da instalação logradouro String [Obrigatório] - Logradouro do endereço do cliente. (instalação e cobrança) numero Integer Número do endereço do cliente. (instalação e cobrança) complemento String Complemento do endereço do cliente. (instalação e cobrança) bairro String [Obrigatório] - Bairro do endereço do cliente. (instalação e cobrança) cidade String [Obrigatório] - cidade do endereço do cliente. (instalação e cobrança) cep String [Obrigatório] - CEP do endereço do cliente. Formato: NNNNN-NNN ou NNNNNNNN. (instalação e cobrança) uf String [Obrigatório] - UF do endereço do cliente. (instalação e cobrança) pais String País do endereço da empresa. Exemplo: "BR", "PY". (instalação e cobrança) pontoreferencia String Ponto de referência do endereço do cliente. (instalação e cobrança) map_ll String Geolocalização do endereço do cliente. Formato: "latitude,longitude". (instalação e cobrança) condominio String ID do condomínio do cliente. (instalação e cobrança) usuarioalt_id Integer ID do usuário que alterou o registro splitter_id Integer ID do splitter utilizado na instalação (Somente para Serviço de Internet) splitter_port Integer Porta do splitter utilizada (Somente para Serviço de Internet) tipo_equipamento String Código do tipo de equipamento cadastrado

Body (raw):
```
{
  "app": "",
  "token": "",
  "contrato_id": 0,
  "pop_id": "",
  "plano_id": 0,
  "vencimento_dia": 0,
  "forma_cobranca_codigo": 0,
  "isento": 0.0,
  "autocobranca": false,
  "observacao": "",
  "vendedor_id": 0,
  "comissao_tipo": 0,
  "comissao": 0.0,
  "login": "",
  "senha": "",
  "email": "",
  "portador_id": 0,
  "fidelidade_id": 0,
  "nas": "",
  "central_login": "",
  "central_senha": "",
  "ip": "",
  "ippool_id": 0,
  "mac_dhcp": "",
  "logins_simult": 0,
  "mac": "",
  "servicode
```

## Status CRM - Alterar por Cliente ID
`POST /api/crm/cliente/{{cliente_id}}/status/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `status_id` | sim | [Obrigatório] - Status a definir |
| `motivo` | — | Motivo da mudana de status |

## Status CRM - Alterar por Cliente CPFCNPJ
`POST /api/crm/cliente/status/?cpfcnpj`

| Campo | Obrig. | Descrição |
|---|---|---|
| `status_id` | sim | [Obrigatório] - Status a definir |
| `motivo` | — |  |
