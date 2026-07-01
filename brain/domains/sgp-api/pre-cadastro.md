---
title: "SGP API — Pré-Cadastro"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Pré-Cadastro", "API SGP Pré-Cadastro"]
tags: [sgp, api, reference, pre-cadastro]
---

# SGP API — Pré-Cadastro

Endpoints do módulo **Pré-Cadastro** da API do SGP (5). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Plano – Listar
`POST /api/precadastro/plano/list`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Vencimento – Listar
`POST /api/precadastro/vencimento/list`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório)

(sem parâmetros além de auth)

## Vendedor – Listar
`POST /api/precadastro/vendedor/list`

(sem parâmetros além de auth)

## Pré-Cadastro – Cadastrar PF
`POST /api/precadastro/F`

| Campo | Obrig. | Descrição |
|---|---|---|
| `nome` | sim | [Obrigatório] - Nome do cliente |
| `logradouro` | sim | [Obrigatório] - Logradouro do cliente |
| `numero` | — | Número da rua |
| `bairro` | — | Bairro do endereço |
| `cidade` | — | Cidade do endereço |
| `uf` | — | UF do endereço, apenas sigla |
| `cep` | — | CEP do endereço |
| `complemento` | — | Complemento do endereço |
| `pontoreferencia` | — | Ponto de referência do endereço |
| `condominio` | — | ID do condomínio desse endereço |
| `map_ll` | — | Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715') |
| `pais` | — | País do endereço, apenas sigla (padrão: BR) |
| `datanasc` | — | Data de nascimento (formato: 'AAAA-MM-DD') |
| `cpfcnpj` | — | CPF do cliente |
| `rg` | — | RG do cliente |
| `rg_emissor` | — | Emissor do RG |
| `nomepai` | — | Nome do pai |
| `nomemae` | — | Nome da mãe |
| `nacionalidade` | — | Nacionalidade |
| `naturalidade` | — | Naturalidade |
| `estadocivil` | — | Estado civil (escolhas: 'S' = Solteiro(a); 'C' = Casado(a); 'D' = Divorciado(a); 'V' = Viúvo(a);) |
| `sexo` | — | Gênero (escolhas: 'M' = Masculino; 'F' = Feminino;) |
| `profissao` | — | Profissão do cliente |
| `observacao` | — | Observação do cliente |
| `email` | — | E-mail de contato |
| `celular` | — | Telefone de contato |
| `portador_id` | — | ID do portador - [Para criação de contrato] |
| `pop_id` | — | ID do POP - [Para criação de contrato] |
| `nas_id` | — | ID do NAS |
| `plano_id` | — | ID do Plano (Internet) |
| `planointernet_id` | — | ID do Plano de Internet |
| `planobase_id` | — | ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico) |
| `vencimento_id` | — | ID do vencimento - [Para criação de contrato] |
| `login` | — | Login (PPPoE ou Email) do contrato - [Para criação de contrato] |
| `senha` | — | Senha do contrato - [Para criação de contrato] |
| `central_senha` | — | Senha de acesso à cental - [Para criação de contrato] |
| `modoaquisicao` | — | Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato] |
| `fidelidade_id` | — | ID da fidelidade - [Para criação de contrato] |
| `contrato_id` | — | ID do grupo de contratos de impressão - [Para criação de contrato] |
| `ip` | — | Endereço de IP - [Para criação de contrato] |
| `mac` | — | MAC Controle - [Para criação de contrato] |
| `splitter_id` | — | ID da CTO - [Para criação de contrato] |
| `splitter_port` | — | Porta da CTO - [Para criação de contrato] |
| `servicodesc` | — | Detalhes do serviço solicitado |
| `tipo_equipamento_id` | — | ID do tipo de equipamento - [Para criação de contrato] |
| `midia_id` | — | Como conheceu a empresa? (ID) |
| `vendedor_id` | — | ID do vendedor - [Para criação de contrato] |
| `tecnico_id` | — | ID do técnico responsável para instalação - [Para criação de contrato] |
| `os_instalacao` | — | Gerar OS de instalação? (valor: 1) - [Para criação de contrato] |
| `instalacao_quantidade_parcelas` | — | Quantidade de parcelas de instalação - [Para criação de contrato] |
| `instalacao_preco` | — | Valor da instalação - [Para criação de contrato] |
| `instalacao_desconto` | — | Valor descontado da instalação - [Para criação de contrato] |
| `instalacao_entrada` | — | Valor de entrada da instalação - [Para criação de contrato] |
| `instalacao_entrada_forma` | — | Forma de entrada da instalação (Consulte a documentação para valores) - [Para criação de contrato] |
| `instalacao_parcela_forma` | — | Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato] |
| `ippool_id` | — | ID do Pool de IP - [Para criação de contrato] |
| `mac_dhcp` | — | MAC Autenticação - [Para criação de contrato] |
| `comissao_tipo` | — | Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato] |
| `comissao_valor` | — | Valor da comissão do vendedor - [Para criação de contrato] |
| `comissao_qtd_parcelas` | — | Quantidade de parcelas da comissão do vendedor - [Para criação de contrato] |
| `usuariocad_id` | — | ID do usuário responsável pelo pré-cadastro |
| `formacobranca_id` | — | ID da Forma de Cobrança |
| `precadastro_ativar` | — | Converte o pré-cadastro em cadastro definitivo |

## Pré-Cadastro – Cadastrar PJ
`POST /api/precadastro/J`

| Campo | Obrig. | Descrição |
|---|---|---|
| `nome` | sim | [Obrigatório] - Razão social da empresa |
| `logradouro` | sim | [Obrigatório] - Logradouro da empresa |
| `numero` | — | Número da rua |
| `bairro` | — | Bairro do endereço |
| `cidade` | — | Cidade do endereço |
| `uf` | — | UF do endereço, apenas sigla |
| `сер` | — | CEP do endereço |
| `complemento` | — | Complemento do endereço |
| `pontoreferencia` | — | Ponto de referência do endereço |
| `condominio` | — | ID do condomínio desse endereço |
| `map_ll` | — | Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715') |
| `pais` | — | País do endereço, apenas sigla (padrão: BR) |
| `datanasc` | — | Data de fundação da empresa |
| `cpfcnpj` | — | CNPJ da empresa |
| `nomefantasia` | — | Nome fantasia da empresa |
| `respempresa` | — | Nome do responsável da empresa |
| `respcpf` | — | CPF do responsável da empresa |
| `observacao` | — | Observação da empresa |
| `email` | — | E-mail de contato |
| `celular` | — | Telefone de contato |
| `portador_id` | — | ID do portador - [Para criação de contrato] |
| `pop_id` | — | ID do POP - [Para criação de contrato] |
| `nas_id` | — | ID do NAS |
| `plano_id` | — | ID do plano - [Para criação de contrato] |
| `planointernet_id` | — | ID do Plano de Internet |
| `planobase_id` | — | ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico) |
| `vencimento_id` | — | ID do vencimento - [Para criação de contrato] |
| `login` | — | Login (PPPoE ou Email) do contrato - [Para criação de contrato] |
| `senha` | — | Senha do contrato - [Para criação de contrato] |
| `central_senha` | — | Senha de acesso à cental - [Para criação de contrato] |
| `modoaquisicao` | — | Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato] |
| `fidelidade_id` | — | ID da fidelidade - [Para criação de contrato] |
| `contrato_id` | — | ID do grupo de contratos de impressão - [Para criação de contrato] |
| `ip` | — | Endereço de IP - [Para criação de contrato] |
| `mac` | — | MAC Controle - [Para criação de contrato] |
| `splitter_id` | — | ID da CTO - [Para criação de contrato] |
| `splitter_port` | — | Porta da CTO - [Para criação de contrato] |
| `servicodesc` | — | Detalhes do serviço solicitado |
| `tipo_equipamento_id` | — | ID do tipo de equipamento - [Para criação de contrato] |
| `midia_id` | — | Como conheceu a empresa? (ID) |
| `vendedor_id` | — | ID do vendedor - [Para criação de contrato] |
| `tecnico_id` | — | ID do técnico responsável para instalação - [Para criação de contrato] |
| `os_instalacao` | — | Gerar OS de instalação? (valor: 1) - [Para criação de contrato] |
| `instalacao_quantidade_parcelas` | — | Quantidade de parcelas de instalação - [Para criação de contrato] |
| `instalacao_preco` | — | Valor da instalação - [Para criação de contrato] |
| `instalacao_desconto` | — | Valor descontado da instalação - [Para criação de contrato] |
| `instalacao_entrada` | — | Valor de entrada da instalação - [Para criação de contrato] |
| `instalacao_entrada_forma` | — | Forma de entrada da instalação (Consulte a documentação para valores) - [Para criação de contrato] |
| `instalacao_parcela_forma` | — | Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato] |
| `ippool_id` | — | ID do Pool de IP - [Para criação de contrato] |
| `mac_dhop` | — | MAC Autenticação - [Para criação de contrato] |
| `comissao_tipo` | — | Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato] |
| `comissao_valor` | — | Valor da comissão do vendedor - [Para criação de contrato] |
| `comissao_qtd_parcelas` | — | Quantidade de parcelas da comissão do vendedor - [Para criação de contrato] |
| `usuariocad_id` | — | ID do usuário responsável pelo pré-cadastro |
| `formacobranca_id` | — | ID da Forma de Cobrança |
| `precadastro_ativar` | — | Converte o pré-cadastro em cadastro definitivo |
