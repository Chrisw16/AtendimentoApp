---
title: Pré-cadastro real
type: component
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[Integração SGP]]", "[[SGP API — Pré-Cadastro]]", "[[SGP API — Visão geral]]", "[[Prompt Comercial (Netzinha)]]", "[[IA com Tool Calling]]"]
sources: ["sgp-api-postman"]
aliases: ["Pré-cadastro real", "precadastro lead", "precadastrarCliente", "cadastro comercial SGP"]
tags: [sgp, precadastro, comercial, backend]
---

# Pré-cadastro real

Integração do fluxo comercial que grava um cliente de verdade no SGP via `POST /api/precadastro/F` (`precadastrarCliente` em [[Integração SGP|integrations.js]]). Validada de ponta a ponta em 2026-07-01 pela tela Testar Tools contra o SGP de produção da NetGo. A IA comercial ([[Prompt Comercial (Netzinha)]]) coleta os dados, confirma com o cliente e chama a tool `precadastrar_cliente`.

## Modo LEAD (decisão)

O `POST /api/precadastro/F` só exige **`nome` + `logradouro`** ([[SGP API — Pré-Cadastro]]); todos os campos de plano/NAS/login/`os_instalacao` são marcados **"[Para criação de contrato]"** e só valem quando `precadastro_ativar=1`. O GoCHAT grava em **modo lead** (`precadastro_ativar=0`, default): manda só os dados do cliente + o plano/vencimento desejado na **observação**, e a equipe da NetGo monta o contrato (CTO, IP, técnico, agenda). Motivo: o chatbot não tem como decidir dado técnico/físico de contrato. O ramo `precadastro_ativar=1` (cadastro definitivo com os campos de contrato) fica preservado no código para uso futuro.

## Correções aplicadas (2026-07-01)

A validação real descascou uma série de mismatches (código estava desatualizado vs. o SGP da NetGo):

- **Endpoint de planos:** `/api/ura/planos/` dava 404. Correto: `/api/precadastro/plano/list` (`listarPlanos`).
- **NAS:** default era `nas_id=2` ("NAS não encontrado"). Correto: **53** (`RTR_BNG_NETGO_02`), fixo — acoplamento NetGo.
- **Data:** o SGP exige `datanasc` em `AAAA-MM-DD` estrito; adicionado `normalizarData` (aceita `DD/MM/AAAA`, `DD/MM/AA`, etc.) antes de enviar.
- **plano_id:** a tool `listar_planos_ativos` lê a tabela **local** `planos` (Configurações → Planos), que tinha IDs errados. Adicionado o teste **"Listar Planos SGP"** (`/api/precadastro/plano/list`) na aba Testar Tools p/ descobrir os IDs reais.
- **Coleta de endereço:** o prompt comercial passou a coletar `logradouro`/`numero`/`bairro` **separados** (a IA juntava rua+número).
- **Observabilidade:** `sgpPost` passou a incluir o corpo do erro HTTP; `precadastrarCliente` loga params + resposta crua.

## Erros de negócio já mapeados

- **CPF duplicado** → `SGP 402 {"error":"Já existe um cliente com o CPF informado."}`. O executor detecta e a IA avisa "CPF já cadastrado".
- **Campos obrigatórios ausentes** → `SGP 400 {"message":"Verifique se todos os campos obrigatórios foram enviados."}` (acontecia no modo definitivo; resolvido pelo modo lead).

## See Also

- [[SGP API — Pré-Cadastro]] · [[Integração SGP]] · [[Prompt Comercial (Netzinha)]]
