---
title: "SGP API — Visão geral"
type: reference
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[Integração SGP]]", "[[SGP]]", "[[Pré-cadastro real]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["sgp-api-postman"]
aliases: ["SGP API", "API do SGP", "Estudo da API SGP", "SGP endpoints"]
tags: [sgp, api, reference, overview]
---

# SGP API — Visão geral

O **SGP** (Sistema de Gestão de Provedores) é o ERP/OSS que a [[Integração SGP|camada de integração do GoCHAT]] consulta. Sua API REST tem **237 endpoints em 13 módulos**, autenticados por `app`+`token` em **todo** request (o token não é o JWT do painel). Base configurada em `sistema_kv` (`sgp_url`/`sgp_app`/`sgp_token`). Este estudo foi extraído da coleção Postman oficial (`raw/sources/docs/2026-07-01_sgp-api-postman.json`); cada módulo tem página própria com todos os endpoints (método, path, campos, obrigatórios).

## Módulos

| Módulo | Nº | Página | Papel |
|---|---|---|---|
| URA | 69 | [[SGP API — URA]] | Núcleo do GoCHAT: consulta cliente, 2ª via, chamado, verifica acesso, ocorrências, manutenção, faturas, **e os `list` de NAS/POP/portador/plano** |
| Central Assinante | 33 | [[SGP API — Central Assinante]] | Área do assinante: contratos, chamados, NF, faturas, PIX, cartão |
| Estoque | 32 | [[SGP API — Estoque]] | Produtos, kits, comodato, compras, transferências |
| FTTH | 29 | [[SGP API — FTTH]] | OLT/ONU/CTO — provisionamento de fibra |
| Ordem de Serviço | 26 | [[SGP API — Ordem de Serviço]] | OS: listar, alterar, anexos, checklist, comentários |
| CRM | 12 | [[SGP API — CRM]] | Cadastro **completo** de cliente (PF/PJ/estrangeiro) + contratos |
| Gerenciador CPE | 12 | [[SGP API — Gerenciador CPE]] | TR-069: WiFi, reboot, speedtest, ping |
| Suporte | 9 | [[SGP API — Suporte]] | Serviços, documentos do cliente |
| Pré-Cadastro | 5 | [[SGP API — Pré-Cadastro]] | Lead → cliente (F/J) + list de plano/vencimento/vendedor |
| RADIUS | 5 | [[SGP API — RADIUS]] | Sessão PPPoE: listar, status, desconectar |
| Remessa / Retorno | 2 | [[SGP API — Remessa / Retorno]] | Bancário (CNAB) |
| Termo de Aceite | 2 | [[SGP API — Termo de Aceite]] | Exibir/aceitar termo do contrato |
| Outros | 1 | [[SGP API — Outros]] | Info do usuário autenticado |

## O que o GoCHAT usa hoje

A [[Integração SGP]] (`integrations.js`) fala com um subconjunto da **URA** + **Pré-Cadastro** + **RADIUS**:
`consultacliente`, `fatura2via`, `liberacaopromessa`, `chamado`, `verificaacesso`, `ocorrencia/list`, `manutencao/list` (URA); `radacct/list/all` (RADIUS); `precadastro/F`, `precadastro/plano/list`, `precadastro/vencimento/list`. Os stubs de ACS (`consultar_onu_acs`/`reiniciar_onu_acs`) correspondem ao módulo **Gerenciador CPE** (ainda não integrado).

## Correções que este estudo trouxe

Endpoints que o código/brain tinham **errados** (referência antiga era derivada do código, que estava desatualizado):
- **Listar planos:** era `/api/ura/planos/` (404 na NetGo). Correto: **`/api/precadastro/plano/list`**. Corrigido em `listarPlanos` ([[Integração SGP]]).
- **Pré-cadastro só exige `nome` + `logradouro`.** Todo o resto é opcional; os campos de plano/NAS/login/os_instalacao são **"[Para criação de contrato]"** e só valem quando `precadastro_ativar=1`. Por isso o GoCHAT grava em [[Pré-cadastro real|modo lead]] (`precadastro_ativar=0`), deixando a equipe montar o contrato.
- **`cidade` é texto** (nome), não ID/IBGE.
- **`datanasc` = `AAAA-MM-DD`** estrito (o GoCHAT normaliza qualquer formato antes de enviar).

## Oportunidades (relevantes p/ revenda e evolução)

- **De-hardcodar IDs NetGo:** existem `list` de NAS (`/api/ura/nas/list/`), POP (`/api/ura/pops/`), portador (`/api/ura/portador/`) e plano (`/api/ura/consultaplano/` e `/api/precadastro/plano/list`). Hoje NAS=53/POP/portador são fixos em `integrations.js` — poderiam ser descobertos por API por instância. Ver [[Integração SGP]].
- **CRM** (`/api/crm/cliente/F|J|E|EJ` + contratos) é um caminho de cadastro mais completo que o pré-cadastro.
- **Gerenciador CPE** é o TR-069 real — resolve os stubs de ONU/ACS.
- **CPE/FTTH/Estoque/OS** abrem espaço pra novas tools de IA (diagnóstico de ONU, status de OS, etc.).

## See Also

- [[Integração SGP]] — a camada de código (`integrations.js`) que consome esses endpoints
- [[SGP]] — o que é o SGP e o modelo de negócio ISP
- [[Pré-cadastro real]] — a integração de pré-cadastro validada em 2026-07-01
