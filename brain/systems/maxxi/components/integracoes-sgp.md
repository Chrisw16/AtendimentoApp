---
title: Integração SGP
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[IA com Tool Calling]]", "[[Motor de Fluxo]]", "[[Canais e Webhooks]]", "[[SGP]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["integrations.js", "SGP integração", "Evolution", "precadastro", "URA"]
tags: [backend, sgp, erp, evolution, integracao]
---

# Integração SGP

`apps/api/src/services/integrations.js` (~609 LOC) é a camada de integração com o **[[SGP]]** (ERP de provedores de internet) e com a **Evolution API** (WhatsApp não-oficial). Fiel ao `erp.js` do sistema de inspiração. Também expõe `getAnthropicClient()`.

## Configuração e transporte

Credenciais lidas de `sistema_kv` (`sgp_url`, `sgp_app`, `sgp_token`), cache 5 min (`getKV`). O SGP usa `application/x-www-form-urlencoded` com `app`+`token` em todo request; helpers `sgpPost`, `sgpPostJSON`, `sgpGet`. `getSGPConfig` normaliza a URL (remove `/api` final, força `https://`).

## Funções SGP

| Função | Endpoint SGP | Uso |
|---|---|---|
| `consultarClientes(cpfcnpj)` | `/api/ura/consultacliente/` | Dados + contratos (status 1-7, ordena por relevância, máx 8) |
| `segundaViaBoleto(cpf, contrato)` | `/api/ura/fatura2via/` | Boleto único ou múltiplos (link + PIX + linha digitável) |
| `promessaPagamento(contrato)` | `/api/ura/liberacaopromessa/` | Libera acesso (default +3 dias) |
| `criarChamado(contrato, tipo, conteudo)` | `/api/ura/chamado/` | Abre OS/chamado (tipos 5/200/13/23/22/3/14) |
| `verificarConexao(contrato)` | `/api/ura/verificaacesso/` | Online/offline |
| `historicoOcorrencias(contrato)` | `/api/ura/ocorrencia/list/` | Chamados anteriores |
| `listarPlanos(cidade)` | `/api/ura/planos/` | Planos do SGP |
| `consultarManutencao()` | `/api/ura/manutencao/list` | Manutenções ativas |
| `consultarRadius(cpf)` | `/ws/radius/radacct/list/all/` | Sessão PPPoE ativa |
| `listarVencimentos()` | `/api/precadastro/vencimento/list` | Dias de vencimento |
| `precadastrarCliente(d)` | `/api/precadastro/F` | Cadastro PF completo (novo cliente) |

`statusRede()` usa `consultarManutencao` como proxy. `consultarOnuAcs`/`reiniciarOnuAcs` são **stubs** (TR-069/ACS não configurado — retornam orientação ao cliente). Cobre mais que o `SgpService` do Atendechat (+RADIUS, planos, vencimentos, precadastro).

## Acoplamento NetGo (impacto na revenda)

`precadastrarCliente` e a tool `precadastrar_cliente` têm **IDs hardcoded da NetGo**: planos (Essencial=12/30, Avançado=13/29, Premium=16/28 conforme cidade), POP (Natal/Macaíba=1, S.M.Gostoso=3, S.Gonçalo=4), portador (16/18), `uf=RN`, senha default `'123456'`. Esses defaults por cidade e IDs precisam ser parametrizados por instância antes de revender — é o maior ponto de acoplamento single-tenant fora dos prompts. Ver [[Adotar o Maxxi v2 como base]].

## Evolution API (WhatsApp não-oficial)

`evolutionRequest(path, body, method)` — config de `sistema_kv` (`evolution_url`, `evolution_key`), header `apikey`. Senders: `evolutionEnviarTexto` (`/message/sendText`), `Botoes`, `Lista`, `CTA` (`sendLink`), `Imagem`/`Audio`/`Arquivo` (`sendMedia`). É a forma de resolver WhatsApp sem API oficial paga (Baileys por baixo). A instância (`canal_instancia`, salva no [[Canais e Webhooks|webhook]]) é necessária para responder.

## See Also

- [[SGP]] · [[IA com Tool Calling]] · [[Motor de Fluxo]]
