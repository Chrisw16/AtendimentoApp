---
title: "SGP API — Estoque"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Estoque", "API SGP Estoque"]
tags: [sgp, api, reference, estoque]
---

# SGP API — Estoque

Endpoints do módulo **Estoque** da API do SGP (32). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Empresa – Listar
`GET /api/estoque/empresa/list/`

Parâmetro Tipo Descrição cpfcnpj string CNPJ da Empresa nome string Nome Fantasia / Razão Social da Empresa

(sem parâmetros além de auth)

## Fornecedor – Listar
`GET /api/estoque/fornecedor/list/`

Parâmetro Tipo Descrição cpfcnpj string CNPJ do Fornecedor nome string Nome Fantasia / Razão Social do Fornecedor

(sem parâmetros além de auth)

## Categoria – Listar
`GET /api/estoque/categoria/list/?nome`

Parâmetro Tipo Descrição nome string Nome da Categoria

(sem parâmetros além de auth)

## Fabricante – Listar
`GET /api/estoque/fabricante/list/`

Parâmetro Tipo Descrição nome string Nome do Fabricante

(sem parâmetros além de auth)

## NCM – Listar
`GET /api/estoque/ncm/list/`

Parâmetro Tipo Descrição codigo string Código do NCM descricao string Descrição do NCM

(sem parâmetros além de auth)

## Kit de Instalação – Listar
`GET /api/estoque/kitinstalacao/list/`

Parâmetro Tipo Descrição descricao string Descrição do Kit de Instalação

(sem parâmetros além de auth)

## Produtos de Kit – Listar
`GET /api/estoque/kitinstalacaoproduto/list/`

Parâmetro Tipo Descrição kitinstalacao_id string ID do Kit de Instalação (Obrigatório)

(sem parâmetros além de auth)

## Comodato de Cliente – Listar
`GET /api/estoque/comodato/list/`

Parâmetro Tipo Descrição cliente_id string ID do Cliente *(Obrigatório) clientecontrato_id string ID do Contrato *(Obrigatório) ordemservico_id string ID da Ordem de Serviço *(Obrigatório) data_cadastro_ini string Data de Cadastro Inicial do Comodato, formato: "AAAA-MM-DD" *(Obrigatório) data_cadastro_fim string Data de Cadastro Final do Comodato, formato: "AAAA-MM-DD" *(Obrigatório) status string Status data_estorno_ini string Data Inicial do Estorno data_estorno_fim string Data Final do Estorno (*) Necessário informar ao menos 1 entre os parâmetros: cliente_id, clientecontrato_id, ordemservico_id, datas de cadastro (ini/fim) data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. status : 1 = Aberto; 2 = Ativo; 3 = Devolvido; 4 = Cancelado.

(sem parâmetros além de auth)

## Itens da Comodato – Listar
`GET /api/estoque/comodatoitens/list/`

Parâmetro Tipo Descrição comodato_id string ID do Comodato (Obrigatório)

(sem parâmetros além de auth)

## Venda de Cliente – Listar
`GET /api/estoque/venda/list/`

Parâmetro Tipo Descrição cliente_id string ID do Cliente *(Obrigatório) clientecontrato_id string ID do Contrato *(Obrigatório) ordemservico_id string ID da Ordem de Serviço *(Obrigatório) data_cadastro_ini string Data de Cadastro Inicial da Venda, formato: "AAAA-MM-DD" *(Obrigatório) data_cadastro_fim string Data de Cadastro Final da Venda, formato: "AAAA-MM-DD" *(Obrigatório) status string Status data_estorno_ini string Data Inicial do Estorno data_estorno_fim string Data Final do Estorno (*) Necessário informar ao menos 1 entre os parâmetros: cliente_id, clientecontrato_id, ordemservico_id, datas de cadastro (ini/fim) data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. status : 1 = Aberto; 2 = Ativo; 3 = Devolvido; 4 = Cancelado.

(sem parâmetros além de auth)

## Itens da Venda – Listar
`GET /api/estoque/vendaitens/list/`

Parâmetro Tipo Descrição venda_id string ID da Venda

(sem parâmetros além de auth)

## Lançamento – Listar
`GET /api/estoque/lancamento/list/`

Parâmetro Tipo Descrição cliente_id integer ID do Cliente (*) clientecontrato_id integer ID do Contrato (*) ordemservico_id integer ID da Ordem de Serviço (*) tipo integer Tipo do lançamento (*) data_cadastro_ini string Data de Cadastro Inicial do Lançamento, formato: "AAAA-MM-DD" (*) data_cadastro_fim string Data de Cadastro Final do Lançamento, formato: "AAAA-MM-DD" (*) (*) Um dos 6 parâmetros é obrigatório. data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. Legenda tipo : 2 = Compra; 3 = Venda; 4 = Comodato; 5 = Transferência; 6 = O.S.; 7 = O.S. Estorno; 8 = Correção de Entrada; 9 = Correção de Saída; 10 = Compra Estorno; 11 = Venda Estorno; 12 = Comodato Estorno;

(sem parâmetros além de auth)

## Itens do Lançamento – Listar
`GET /api/estoque/lancamentoitem/list/`

Parâmetro Tipo Descrição ordemservico_id string ID da Ordem de Serviço (*) lancamento_id string ID do Lançamento cliente_id string ID do Cliente (*) clientecontrato_id string ID do Contrato (*) (*) Um dos 3 parâmetros é obrigatório.

(sem parâmetros além de auth)

## Local de Estoque – Listar
`GET /api/estoque/estoque/list/`

Parâmetro Tipo Descrição usuario string Nome do Usuário descricao string Descrição do Estoque Basic Auth opcional com Username/Password para filtrar por usuário.

(sem parâmetros além de auth)

## Saldo – Listar
`GET /api/estoque/estoque_agregado_referencias/list/`

Parâmetro Tipo Descrição estoque_id string ID do Estoque produto_id string ID do Produto referencia string Valor da Referência do Produto

(sem parâmetros além de auth)

## Produto – Listar (Quantitativos)
`GET /api/estoque/produto/list/`

Parâmetro Tipo Descrição descricao string Descrição do Produto Basic Auth opcional com Username/Password para filtrar por usuário.

(sem parâmetros além de auth)

## Produto – Listar (Cadastrados)
`GET /api/estoque/produto/list/all/`

Parâmetro Tipo Descrição retornar_inativos boolean Caso enviado, retorna também produtos inativos. Basic Auth opcional com Username/Password para filtrar por usuário.

(sem parâmetros além de auth)

## Unidades de Medidas - Listar
`GET /api/estoque/unidademedida/list/`

Parâmetros URL: sigla; descricao.

(sem parâmetros além de auth)

## Compras - Listar
`GET /api/estoque/compra/list/`

Parâmetros URL: fornecedor_id (*); data_cadastro_ini (AAAA-MM-DD) (*); data_cadastro_fim (AAAA-MM-DD) (*). (*) Um dos 3 parâmetros é obrigatório. data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado.

(sem parâmetros além de auth)

## Itens da Compra - Listar
`GET /api/estoque/compraitens/list/`

Parâmetros URL: compra_id

(sem parâmetros além de auth)

## Transferências - Listar
`GET /api/estoque/transferencia/list/`

Parâmetros URL: data_cadastro_ini (AAAA-MM-DD); data_cadastro_fim (AAAA-MM-DD). data_cadastro_ini e data_cadastro_fim são obrigatórios.

(sem parâmetros além de auth)

## Lançamento – Criar
`POST /api/estoque/lancamentoitem/create/`

Parâmetro Tipo Descrição itens array Array de produtos (*) origem_id integer ID da Origem (*) os_id integer ID da Ordem de Serviço cliente_id integer ID do Cliente clientecontrato_id integer ID do Contrato (*) comodato integer Cadastrar como Comodato (*) É um parâmetro obrigatório.

Body (raw):
```
{
    "os_id": 1,
    "cliente_id": 1,
    "clientecontrato_id": 1,
    "comodato": 1,
    "origem_id": 1,
    "itens": [
        {
            "produto_id": 1,
            "quantidade": 1,
            "valor": "1.11",
            "referencia_id": 1
        }
    ]
}
```

## Estorno – Atualizar
`POST /api/estoque/lancamentoitem/estorno/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `lancamentoitem_id` | sim | [Obrigatório] - ID do item do lançamento |
| `local_id` | sim | [Obrigatório] - ID do local de estoque destino do retorno |
| `os_id` | — | ID da ordem de serviço que será vinculada ao estorno |
| `observacao` | — | Observação que será vinculada ao estorno |

## Produto - Cadastrar
`POST /api/estoque/produto/create/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `codigo` | sim | [Obrigatório] - Código identificador do produto |
| `descricao` | sim | [Obrigatório] - Nome do produto |
| `ativo` | — | Produto disponível? Padrão: sim (valores: 0=Inativo;1=Ativo) |
| `codigo_barras` | — | Código de barras do produto |
| `tipo_referencia` | — | Tipo de referência (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;) |
| `informar_referencia_saida` | — | Pode informar a referência na saída? |
| `categorias` | — | IDs das categorias (Se informar mais de um, separar por vírgula) |
| `foto` | — | Foto representadora do produto |
| `valor_custo` | — | Valor de custo do produto |
| `valor_venda` | — | Valor de venda do produto |
| `unidade_medida` | — | ID da unidade de medida a ser vinculada |
| `detalhes` | — | Detalhes do produto |
| `fabricante` | — | ID do fabricante a ser vinculado |
| `modelo` | — | Modelo do produto |
| `informacoes_adicionais` | — | Informações extras do produto |
| `ncm` | — | ID do NCM a ser vinculado |

## Produto - Alterar
`POST /api/estoque/produto/{produto_id}/update/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `codigo` | — | Substitui o código identificador do produto |
| `descricao` | — | Substitui o nome do produto |
| `ativo` | — | Ativa ou inativa o produto (valores: 0=Inativo;1=Ativo) |
| `codigo_barras` | — | Substitui o código de barras do produto |
| `tipo_referencia` | — | Substitui o tipo de referência do produto (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;) |
| `informar_referencia_saida` | — | Ativa ou desativa a possibilidade de informar referência na saída (valores: 0=Inativo;1=Ativo) |
| `categorias` | — | Substitui as categorias do produto (ID) |
| `foto` | — | Substitui a foto do produto |
| `valor_custo` | — | Substitui o valor de custo do produto |
| `valor_venda` | — | Substitui o valor de venda do produto |
| `unidade_medida` | — | Substitui a unidade de medida do produto (ID) |
| `detalhes` | — | Substitui os detalhes do produto |
| `fabricante` | — | Substitui o fabricante do produto (ID) |
| `modelo` | — | Substitui o modelo do produto |
| `informacoes_adicionais` | — | Substitui as informações adicionais do produto |
| `ncm` | — | Substitui o NCM do produto (ID) |

## Compra - Cadastrar
`POST /api/estoque/compra/create/`

Parâmetro Tipo Descrição fornecedor integer Fornecedor empresa integer Empresa nota_fiscal string Nota Fiscal observacao string Observação Itens: Parâmetro Tipo Descrição produto_id integer Produto estoque_id integer Local de Estoque quantidade integer Quantidade valor_custo decimal Valor Custo (Un) desconto decimal Desconto referencias array Referências, formato: ["ref1", "ref2"]

Body (raw):
```
{
    "fornecedor": 1,
    "empresa": 1,
    "notafiscal": "12345678901234567890123456789012345678901234",
    "observacao": "Observação",
    "itens":[
        {
            "produto_id": 1,
            "estoque_id": 1,
            "quantidade": 2,
            "valor": 120.15,
            "desconto": 5.00,
            "referencias": ["ref1", "ref2"]
        }
    ]
}
```

## Transferência - Cadastrar
`POST /api/estoque/transferencia/create/`

Parâmetro Tipo Descrição origem integer Local de Origem destino integer Local de Destino responsavel_envio integer Responsável Envio observacao string Observação Itens: Parâmetro Tipo Descrição produto integer Produto quantidade integer Quantidade anotacao string Anotação referencias array Referências transferidas

Body (raw):
```
{
    "origem": 1,
    "destino": 2,
    "responsavel_envio": 1,
    "observacao": "Observação",
    "itens":[
        {
            "produto": 1,
            "quantidade": 2,
            "anotacao": "Anotação",
            "referencias": ["ref01", "ref02"]
        }
    ]
}
```

## Vincular Produto NFe X Produto Estoque
`POST /api/ura/produtonfe_produtoestoque/vincular/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `produto_nfe` | sim | [Obrigatório] - ID do produto vinculado à NFe |
| `produto_estoque` | sim | [Obrigatório] - ID do produto existente no estoque que deseja vincular |

## Vincular Produto NFe X Produto Estoque  Patch
`PATCH /api/ura/produtonfe_produtoestoque/vincular/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `produto_nfe` | sim | [Obrigatório] - ID do produto vinculado à NFe que deseja alterar |
| `produto_estoque` | sim | [Obrigatório] - ID do produto existente no estoque que deseja vincular |

## Compra - NFe
`POST /api/ura/compra/nfe/`

Parâmetro Tipo Descrição app string Nome da Aplicação no SGP (obrigatório) token string Token da Aplicação no SGP (obrigatório) nfe integer ID da NFe estoque integer ID do Estoque fornecedor integer ID do Fornecedor Itens: Parâmetro Tipo Descrição produto_id integer ID do Produto referencias array Referências do Produto

Body (raw):
```
{
    "token": "token",
    "app": "app",
    "nfe": 1,
    "estoque": 1,
    "fornecedor": 1,
    "itens": [
        {
            "produto_id": 1,
            "referencias": ["ref01"]
        }
    ]
}
```

## Fornecedor - Cadastrar
`POST /api/estoque/fornecedor/create/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `nome` | sim | [Obrigatório] - Nome do fornecedor |
| `tipo_pessoa` | — | Tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica) |
| `sit_fiscal` | — | Situação fiscal do fornecedor (Para valores, verifique a documentação pública) |
| `nome_fantasia` | — | Nome fantasia do fornecedor |
| `responsavel_empresa` | — | Responsável do fornecedor |
| `nome_contato` | — | Nome do contato do fornecedor |
| `cpf_cnpj` | — | CPF ou CNPJ do fornecedor |
| `rg` | — | RG do Fornecedor |
| `rg_emissor` | — | Emissor do RG |
| `insc_estadual` | — | Inscrição estadual do fornecedor |
| `insc_municipal` | — | Inscrição municipal do fornecedor |
| `contrib_icms` | — | Tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública) |
| `endereco_logradouro` | — | Rua do fornecedor |
| `endereco_numero` | — | Número da rua do fornecedor |
| `endereco_bairro` | — | Bairro do fornecedor |
| `endereco_cidade` | — | Cidade do fornecedor |
| `endereco_uf` | — | UF do fornecedor |
| `endereco_cep` | — | CEP do fornecedor |
| `endereco_complemento` | — | Complemento do endereço do fornecedor |
| `endereco_ponto_referencia` | — | Ponto de referência do endereço do fornecedor |
| `endereco_pais` | — | País do fornecedor |
| `endereco_coordenadas` | — | Coordenadas (lat/long) do fornecedor |
| `cpais` | — | Código do país (Ex.: Brasil = 1058) |
| `cmun` | — | Código do município (Ex.: 2408102) |
| `email` | — | E-mail do fornecedor |
| `telefone` | — | Telefone do fornecedor |
| `celular` | — | Celular do fornecedor |
| `fax` | — | Fax do fornecedor |
| `observacao` | — | Observação para o fornecedor |
| `json` | — | JSON para o fornecedor (em caso de integrações futuras) |
| `ativo` | — | Fornecedor disponível? Padrão: sim (valores: 0=Inativo;1=Ativo) |

## Fornecedor - Alterar
`POST /api/estoque/fornecedor/<fornecedor_id>/update/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `nome` | — | Novo nome do fornecedor |
| `tipo_pessoa` | — | Novo tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica) |
| `sit_fiscal` | — | Nova situação fiscal do fornecedor (Para valores, verifique a documentação pública) |
| `nome_fantasia` | — | Novo nome fantasia do fornecedor |
| `responsavel_empresa` | — | Novo responsável do fornecedor |
| `nome_contato` | — | Novo nome do contato do fornecedor |
| `cpf_cnpj` | — | Novo CPF ou CNPJ do fornecedor |
| `rg` | — | Novo RG do Fornecedor |
| `rg_emissor` | — | Novo emissor do RG |
| `insc_estadual` | — | Nova inscrição estadual do fornecedor |
| `insc_municipal` | — | Nova inscrição municipal do fornecedor |
| `contrib_icms` | — | Novo tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública) |
| `endereco_logradouro` | — | Nova rua do fornecedor |
| `endereco_numero` | — | Novo número da rua do fornecedor |
| `endereco_bairro` | — | Novo bairro do fornecedor |
| `endereco_cidade` | — | Nova cidade do fornecedor |
| `endereco_uf` | — | Nova UF do fornecedor |
| `endereco_cep` | — | Novo CEP do fornecedor |
| `endereco_complemento` | — | Novo complemento do endereço do fornecedor |
| `endereco_ponto_referencia` | — | Novo ponto de referência do endereço do fornecedor |
| `endereco_pais` | — | Novo país do fornecedor |
| `endereco_coordenadas` | — | Novas coordenadas (lat/long) do fornecedor |
| `cpais` | — | Novo código do país (Ex.: Brasil = 1058) |
| `cmun` | — | Novo código do município (Ex.: 2408102) |
| `email` | — | Novo e-mail do fornecedor |
| `telefone` | — | Novo telefone do fornecedor |
| `celular` | — | Novo celular do fornecedor |
| `fax` | — | Novo fax do fornecedor |
| `observacao` | — | Nova observação para o fornecedor |
| `json` | — | Novo JSON para o fornecedor (em caso de integrações futuras) |
| `ativo` | — | Modificar disponibilidade do fornecedor (valores: 0=Inativo;1=Ativo) |
