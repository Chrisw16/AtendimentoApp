---
title: SGP
type: domain
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Integração SGP]]", "[[IA com Tool Calling]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["SGP", "Sistema de Gestão de Provedores", "ERP ISP", "URA SGP"]
tags: [dominio, isp, sgp, erp]
---

# SGP

O **SGP (Sistema de Gestão de Provedores)** é o ERP/OSS usado por provedores de internet brasileiros para gerir clientes, contratos, financeiro, chamados técnicos e rede. É a fonte da verdade que a [[IA com Tool Calling|IA do Maxxi]] consulta para atender — boleto, status de conexão, abertura de chamado, planos, pré-cadastro. A camada de código que fala com ele é a [[Integração SGP]].

## Como o Maxxi usa o SGP

Autenticação por `app` + `token` (de [[Modelo de Dados|sistema_kv]]) em todo request, `x-www-form-urlencoded`. Duas famílias de endpoint:

- **URA** (`/api/ura/*`) — autoatendimento: `consultacliente`, `fatura2via`, `liberacaopromessa`, `chamado`, `verificaacesso`, `ocorrencia/list`, `planos`, `manutencao/list`. Também RADIUS (`/ws/radius/radacct/list/all/`) para sessão PPPoE.
- **Pré-cadastro** (`/api/precadastro/*`) — `F` (cadastro PF, [[Pré-cadastro real|modo lead]]), `plano/list`, `vencimento/list`.

A API do SGP tem **237 endpoints em 13 módulos**; o GoCHAT usa um subconjunto pequeno. Estudo completo (cada endpoint, campos e obrigatórios) em [[SGP API — Visão geral]].

## Vocabulário de domínio

- **Contrato** — vínculo cliente↔serviço; um cliente pode ter vários. Status numéricos: 1=ativo, 2=inativo, 3=cancelado, 4=suspenso, 5=inviabilidade técnica, 6=novo, 7=ativo vel. reduzida.
- **POP** — ponto de presença/concentração; cada cidade tem o seu (na NetGo: Natal/Macaíba=1, S.M.Gostoso=3, S.Gonçalo=4).
- **Tipo de ocorrência/chamado** — código do tipo de OS: 200=Reparo, 5=Outros, 13=Mud. endereço, 23=Mud. plano, 22=Prob. fatura, 3=Mud. senha Wi-Fi, 14=Reloc. roteador.
- **Promessa de pagamento** — liberação temporária (≈3 dias) de acesso suspenso por inadimplência.
- **Vencimento** — dia de cobrança escolhido no cadastro (`vencimento_id`).
- **RADIUS / PPPoE** — autenticação de sessão de banda; indica se o cliente está efetivamente conectado.
- **ACS / TR-069 / ONU** — gestão remota do equipamento óptico do cliente. No Maxxi é **stub** (não integrado); a API real é o módulo **Gerenciador CPE** ([[SGP API — Visão geral]]).

## Contexto NetGo

A instância de referência é a **NetGo Internet** (fibra em Natal/RN e cidades vizinhas: Macaíba, São Gonçalo do Amarante, São Miguel do Gostoso). Planos, POPs, portadores e textos estão hardcoded — ver o acoplamento em [[Integração SGP]] e a estratégia de [[Adotar o Maxxi v2 como base|deploy por instância]].

## See Also

- [[SGP API — Visão geral]] — estudo completo dos 237 endpoints
- [[Integração SGP]] · [[IA com Tool Calling]]
