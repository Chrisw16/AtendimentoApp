---
title: "SGP API — FTTH"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP FTTH", "API SGP FTTH"]
tags: [sgp, api, reference, ftth]
---

# SGP API — FTTH

Endpoints do módulo **FTTH** da API do SGP (29). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## Listar OLT
`GET /api/fttx/olt/list/`

(sem parâmetros além de auth)

## Listar PON
`GET /api/fttx/olt/{olt_id}/pon/list/`

(sem parâmetros além de auth)

## Listar ONU por OLT
`GET /api/fttx/olt/{olt_id}/onu/list/`

Parâmetro Tipo Descrição onuid integer ID da ONU onuidreal integer ONUID da ONU slot integer Slot da ONU pon integer PON da ONU phy_addr string PHY_ADDR da ONU cpfcnpj string CPF/CNPJ do Cliente contrato integer ID do Contrato servico integer ID do Serviço status integer IDs dos Status (separados por vírgula) login string Login do Serviço address integer Exibe Informação de Endereço no resultado signal integer Exibe Informação de sinal no resultado connection integer Exibe Informação de "online" no resultado

(sem parâmetros além de auth)

## Listar ONU
`GET /api/fttx/onu/list/`

Parâmetro Tipo Descrição onuid integer ID da ONU slot integer Slot da ONU pon integer PON da ONU phy_addr string PHY_ADDR da ONU cpfcnpj string CPF/CNPJ do Cliente contrato integer ID do Contrato servico integer ID do Serviço status integer IDs dos Status (separados por vírgula) login string Login do Serviço address integer Exibe Informação de Endereço no resultado signal integer Exibe Informação de sinal no resultado connection integer Exibe Informação de "online" no resultado

(sem parâmetros além de auth)

## Listar CTO utilizadas na OLT
`GET /api/fttx/olt/pon/{OLT_ID}/splitter/list/`

Parâmetro Tipo Descrição pon integer PON da CTO slot integer Slot da CTO

(sem parâmetros além de auth)

## Listar ONUs vinculadas a CTO
`GET /api/fttx/splitter/{cto_id}/onu/all/`

Parâmetro Tipo Descrição onuid integer ID da ONU slot integer Slot da ONU pon integer PON da ONU phy_addr string PHY_ADDR da ONU cpfcnpj string CPF/CNPJ do Cliente contrato integer ID do Contrato servico integer ID do Serviço status integer IDs dos Status (separados por vírgula) login string Login do Serviço address integer Exibe Informação de Endereço no resultado signal integer Exibe Informação de sinal no resultado connection integer Exibe Informação de "online" no resultado

(sem parâmetros além de auth)

## Listar CTO
`GET /api/fttx/splitter/{id}/`

(sem parâmetros além de auth)

## Listar todas CTO
`GET /api/fttx/splitter/all/`

(sem parâmetros além de auth)

## Listar ONUs não autorizadas
`GET /api/fttx/olt/{olt_id}/unauth/`

(sem parâmetros além de auth)

## Autorizar ONU
`POST /api/fttx/olt/{olt_id}/auth/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `slot` | sim | [Obrigatório] - Slot da OLT que será autorizada |
| `pon` | sim | [Obrigatório] - PON em que será autorizada |
| `contrato` | sim | [Obrigatório] - ID do contrato | Utilizar contrato e/ou service e/ou description |
| `service` | sim | [Obrigatório] - Login do cliente | Utilizar contrato e/ou service e/ou description |
| `description` | sim | [Obrigatório] - Descrição da ONU | Utilizar contrato e/ou service e/ou description |
| `onutemplate` | sim | [Obrigatório] - ID do ONU Template a ser utilizado |
| `onutemplate_plain` | — | Retira a necessidade de informar o onutemplate |
| `splitter` | sim | [Obrigatório] - ID da CTO | Utilizar splitter ou splitter_port + pon + slot |
| `splitter_port` | sim | [Obrigatório] - Porta da CTO | Utilizar splitter ou splitter_port + pon + slot |
| `id` | sim | [Obrigatório] - Phy Address que será gravada na ONU |
| `onutype` | sim | [Obrigatório] - Código do tipo da ONU |
| `mode` | sim | [Obrigatório] - BRIDGE = 1; PPPOE = 2; BRIDGE_WAN = 3; DHCP = 4; |
| `vlan` | — | VLAN |
| `ident` | — | Etiqueta da ONU |
| `pppoe_login` | — | Login do serviço |
| `pppoe_password` | — | Senha do serviço |
| `wifi_ssid` | — | Nome da rede Wifi |
| `wifi_password` | — | Senha da rede Wifi |
| `wifi_channel` | — | Canal da rede Wifi |
| `wifi_ssid5` | — | Nome da rede Wifi (5GHz) |
| `wifi_password5` | — | Senha da rede Wifi (5GHz) |
| `wifi_channel5` | — | Canal da rede Wifi (5GHz) |
| `wifi_authmode` | — | Modo de autenticação da Wifi |
| `wifi_encrypttype` | — | Criptografia da Wifi |
| `wifi_central` | — | Permite gerenciar a wifi na central do assinante |
| `onu_web` | — | Habilita a alteração da ONU via Web |
| `onu_web_port` | — | Define a porta da interface web de alteração da ONU (Padrão: 80) |
| `onu_telnet` | — | Habilita Telnet |
| `onu_login` | — | Login WAN da ONU |
| `onu_password` | — | Senha WAN da ONU |
| `no_auth` | — | Permitir registrar a ONU sem autorizar na OLT atraves da api | Se usar, necessário informar onuid |
| `onuid` | — | Posição da ONU caso esteja utilizando com o parâmetro no_auth |

## Resetar ONU
`GET /api/fttx/onu/{id_onu}/reset/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição default_cfg integer Configuração padrão

(sem parâmetros além de auth)

## Exportar ONU
`GET /api/fttx/olt/{olt_id}/onu/export/`

(sem parâmetros além de auth)

## ONU Info
`GET /api/fttx/onu/{id_onu}/info/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU.

(sem parâmetros além de auth)

## ONU Detalhe
`GET /api/fttx/onu/{id_onu}/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU.

(sem parâmetros além de auth)

## Alterar ONU
`POST /api/fttx/onu/{onu_id}/edit/`

| Campo | Obrig. | Descrição |
|---|---|---|
| `onu_update` | sim | [Obrigatório] - Informar o que deseja alterar. Escolhas: 'wifi' , 'wan' , 'service' |
| `wifi_ssid` | — | Nome da rede Wifi ('wifi') |
| `wifi_password` | — | Senha da rede Wifi ('wifi') |
| `wifi_channel` | — | Canal da rede Wifi ('wifi') |
| `wifi_ssid5` | — | Nome da rede Wifi (5GHz) ('wifi') |
| `wifi_password5` | — | Senha da rede Wifi (5GHz) ('wifi') |
| `wifi_channel5` | — | Canal da rede Wifi (5GHz) ('wifi') |
| `wifi_central` | — | Permite gerenciar a wifi na central do assinante ('wifi') |
| `onu_web` | — | Habilita a alteração da ONU via Web ('wan') |
| `onu_telnet` | — | Habilita Telnet ('wan') |
| `onu_login` | — | Login WAN da ONU ('wan') |
| `onu_password` | — | Senha WAN da ONU ('wan') |
| `service` | — | Login do serviço que deseja vincular a ONU ('service') |

## Remover ONU
`GET /api/fttx/onu/{id_onu}/deauth/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição no_commit integer Remover ONU sem desautorizar na OLT

(sem parâmetros além de auth)

## Remover ONU
`POST /api/fttx/onu/{id_onu}/deauth/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição no_commit integer Remover ONU sem desautorizar na OLT

(sem parâmetros além de auth)

## ONU Wifi
`GET /api/fttx/onu/{identificador_onu}/wifi/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição remove integer remove

(sem parâmetros além de auth)

## ONU WAN
`GET /api/fttx/onu/{identificador_onu}/wan/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição remove integer remove

(sem parâmetros além de auth)

## ONU CMD
`GET /api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição cmdrun string cmdrun cmd_print_result string cmd_print_result regex_search string regex_search

(sem parâmetros além de auth)

## ONU CMD
`POST /api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição cmdrun string cmdrun cmd_print_result string cmd_print_result regex_search string regex_search

(sem parâmetros além de auth)

## ONU TL1 CMD
`GET /api/fttx/onu/{IDENTIFICADOR_ONU}/tl1/cmd/`

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. Parâmetro Tipo Descrição action string Valores: "add"; "delete";

(sem parâmetros além de auth)

## ONU Histórico
`GET /api/fttx/onu/history/`

Parâmetro Tipo Descrição phy_addr string phy_addr service integer ID do Serviço

(sem parâmetros além de auth)

## Cadastrar CTO
`POST /api/fttx/splitter/add/`

Parâmetro Tipo Descrição pon_id integer ID da PON identificacao string Nome da CTO portas integer Número de portas streetpole_id integer ID do Poste latitude string Latitude da CTO longitude string Longitude da CTO verificar_portas integer Verificar Portas? limitar_portas integer Limitar Portas? tipo_conector integer Tipo do Conector localizacao integer Localização da CTO observacao integer Observação da CTO verificar_pon integer Verificar PON?

(sem parâmetros além de auth)

## ONU Template
`GET /api/fttx/onutemplate/list/`

(sem parâmetros além de auth)

## ONU Tipo
`GET /api/fttx/onutype/list/`

(sem parâmetros além de auth)

## ONU Modo
`GET /api/fttx/onumode/list/`

(sem parâmetros além de auth)

## Serviços
`GET /api/fttx/service/list/`

Parâmetro Tipo Descrição login string Login do Serviço contrato integer ID do Contrato

(sem parâmetros além de auth)

## Adicionar CTO ao Serviço
`POST /ws/fttx/splitter/service/add/`

Parâmetro Tipo Descrição service_id integer Id do seriço de internet [Obrigatório] splitter_id integer Id da CTO [Obrigatório] splitter_port integer Porta da CTO [Obrigatório]

(sem parâmetros além de auth)
