---
title: "SGP API — Gerenciador CPE"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[SGP API — Visão geral]]", "[[Integração SGP]]", "[[SGP]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP Gerenciador CPE", "API SGP Gerenciador CPE"]
tags: [sgp, api, reference, gerenciador-cpe]
---

# SGP API — Gerenciador CPE

Endpoints do módulo **Gerenciador CPE** da API do SGP (12). Autenticação por `app`+`token` em todo request. Base: `{{url}}`. Ver [[SGP API — Visão geral]].

## CPE - Detalhes
`GET /api/cpemanager/servico/{id_servico}/infodetail`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Sincronizar WAN
`POST /api/cpemanager/servico/{id_servico}/sync/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Importar Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/import/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Definir Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/set/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Configurar Wan
`POST /api/cpemanager/servico/{id_servico}/pppoe/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Ping
`POST /api/cpemanager/servico/{id_servico}/command/ping/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - SpeedTest
`POST /api/cpemanager/servico/{id_servico}/command/speedtest/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Remover Dados do SGP
`POST /api/cpemanager/servico/{id_servico}/command/clear/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Reboot
`POST /api/cpemanager/servico/{id_servico}/command/boot/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Wifi List
`GET /api/cpemanager/servico/{id_servico}/wifi/list/`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha).

(sem parâmetros além de auth)

## CPE - Atualizar dados Wifi
`POST /api/cpemanager/servico/{id_servico}/wifi/update/`

Sufixo Tipo Descrição ssid string Nome da rede (Wifi SSID) frequency int Canal da rede (Wifi Channel) password string Senha da rede (Wifi Password) enabled string Ativo (Valores aceitos: "on" ou "off") Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). Montagem da requisição : É necessário montar o parâmetro baseado no ID da interface da wifi do serviço em específico. O layout deve ser dessa maneira: {interface_id}_{sufixo} Verifique os sufixos e seus respectivos valores aceitos na tabela acima. Ex prático.: Dado que o Interface ID da WiFi do cliente é 3-7, a mudança do SSID deve ser feita enviando o parâmetro 3-7_ssid .

Body (raw):
```
{
    "1-1_ssid": "Novo nome wifi",
    "1-1_frequency": 1,
    "1-1_password": "Nova senha wifi",
    "1-1_enabled": "on"
}
```

## CPE - Atualizar Campo
`POST /api/cpemanager/servico/{id_servico}/update/field/?param=InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase&value=123123456`

Modo de uso : Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). Parâmetros: "param" : Parâmetro a ser alterado "value" : Valor a ser passado

(sem parâmetros além de auth)
