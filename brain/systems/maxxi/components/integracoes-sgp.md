---
title: Integração SGP
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Catálogo de Nós]]", "[[IA com Tool Calling]]", "[[Motor de Fluxo]]", "[[Canais e Webhooks]]", "[[SGP]]", "[[Auth e Segurança]]"]
sources: ["2026-06-30_integrations-referencia", "2026-06-30_estudo-codigo-maxxi"]
aliases: ["Integração SGP", "integrations.js", "SGP integração", "Evolution", "precadastro", "URA"]
tags: [backend, sgp, erp, evolution, integracao]
---

# Integração SGP

`apps/api/src/services/integrations.js` (~609 LOC) é a camada de integração externa: **[[SGP]]** (ERP), **ACS** (stub), **Anthropic** (IA) e **Evolution API** (WhatsApp). Cabeçalho do arquivo: "fiel ao `erp.js` de referência — endpoints, formatos e campos idênticos". Os nós SGP do [[Catálogo de Nós|catálogo]] e as tools da [[IA com Tool Calling|IA]] chamam estas funções.

## Configuração e transporte

Credenciais lidas de `sistema_kv` (`sgp_url`, `sgp_app`, `sgp_token`), cache 5 min (`getKV`; `invalidateConfigCache()` limpa). `getSGPConfig` higieniza a URL (remove `/` e `/api` finais; força `https://`) e lança erro claro se faltar credencial. O SGP autentica com `app` + `token` em **todo** request (não é o JWT do painel).

| Helper | Método · Content-Type | Timeout | Uso |
|---|---|---|---|
| `sgpPost(path, params)` | POST · form-urlencoded | 12s | maioria dos endpoints URA |
| `sgpPostJSON(path, body)` | POST · JSON | 12s | `chamado`, `ocorrencia/list` |
| `sgpGet(path, params)` | GET · querystring | 10s | `manutencao/list` |

`promessaPagamento` e `consultarRadius` usam **`fetch` direto** (payload montado à mão). Tolerância a versões do SGP: quase todo retorno tem fallback de campos (protocolo extraído de 5 nomes possíveis, `raw?.planos || raw?.data || []`, etc.).

## Funções SGP

| Função | Endpoint | Retorno (resumo) |
|---|---|---|
| `consultarClientes(cpf)` | `consultacliente/` | `{nome, cpfcnpj, email, fone, contratos[]}`; tenta 2 formatos de CPF, ordena por status, corta em 8 |
| `segundaViaBoleto(cpf, contrato)` | `fatura2via/` | 3 formas: `sem_boleto` · `multiplos_boletos` (lista) · boleto único (link + PIX + linha digitável) |
| `promessaPagamento(contrato)` | `liberacaopromessa/` | `{liberado, liberado_dias, protocolo, data_promessa, …}`; hoje +3 dias |
| `criarChamado(contrato, tipo, conteudo)` | `chamado/` | `{protocolo, chamado_aberto, cliente}`; tipos 5/200/3/14/13/23/22 |
| `verificarConexao(contrato)` | `verificaacesso/` | `{online, status_conexao, msg, …}` (`online = status===1`) |
| `historicoOcorrencias(contrato)` | `ocorrencia/list/` | `[{numero, status, tipo, data_cadastro, conteudo…}]` |
| `listarPlanos(cidade)` | `precadastro/plano/list` | `[{id, descricao, valor, velocidade}]` (era `/api/ura/planos/`, dava 404) |
| `consultarManutencao()` | `manutencao/list` | `{ativa, cidadesAfetadas, previsao…}` (fuso America/Fortaleza) |
| `consultarRadius(cpf)` | `/ws/radius/radacct/list/all/` | `{sessao_ativa, ip, usuario, sessoes[]}` (PPPoE, máx 3) |
| `listarVencimentos()` | `precadastro/vencimento/list` | `[{id, dia}]` |
| `precadastrarCliente(d)` | `precadastro/F` | `{sucesso, mensagem, id, raw}` — cadastro PF em [[Pré-cadastro real|modo lead]] (`precadastro_ativar=0`; só `nome`+`logradouro` obrigatórios) |

`statusRede()` usa `consultarManutencao` como proxy (não tem endpoint próprio). `consultarOnuAcs`/`reiniciarOnuAcs` são **stubs** (TR-069/ACS não integrado — retornam orientação); a API real p/ isso é o módulo **Gerenciador CPE** do SGP (ver [[SGP API — Visão geral]]). Status numéricos do contrato: 1=ativo, 2=inativo, 3=cancelado, 4=suspenso, 5=inviabilidade, 6=novo, 7=ativo vel. reduzida.

> `listarPlanos` (SGP) **difere** da tool `listar_planos_ativos` da IA, que lê a tabela **local** `planos`. São fontes distintas de catálogo.

## Acoplamento NetGo (impacto na revenda)

`precadastrarCliente` e a tool `precadastrar_cliente` têm **IDs hardcoded da NetGo**: POP (Natal/Macaíba=1, S.M.Gostoso=3, S.Gonçalo=4 — auto por cidade), portador (16/18), `uf=RN`, `senha=123456`, `nas_id=53` (`RTR_BNG_NETGO_02`), `formacobranca_id=1`. É o maior ponto de acoplamento single-tenant fora dos prompts — parametrizar por instância antes de revender. **A própria API do SGP tem os `list` para de-hardcodar isso** (NAS `/api/ura/nas/list/`, POP `/api/ura/pops/`, portador `/api/ura/portador/`, plano `/api/precadastro/plano/list`) — ver [[SGP API — Visão geral]]. Ver também [[Adotar o Maxxi v2 como base]]. (Os `plano_id` reais vivem no SGP e na tabela local `planos`, não mais hardcoded no código.)

## Aliases para o motorFluxo

Exports que adaptam funções aos nós: `sgpBuscarCliente`→`consultarClientes`, `sgpBuscarBoletos`→`segundaViaBoleto`, `sgpPromessaPagamento`, `sgpListarPlanos`. Dois com assinatura própria: `sgpVerificarStatus(contratoId)` (consulta por contrato, retorna `{status, status_num, contrato}`) e `sgpAbrirChamado({contratoId, tipoId, descricao})` (assinatura por **objeto**, ≠ posicional de `criarChamado`).

## Evolution API (WhatsApp não-oficial)

`evolutionRequest(path, body, method)` — config de `sistema_kv` (`evolution_url`, `evolution_key`), header `apikey`, timeout 8s. Senders (POST, recebem `instancia` + `numero`): `Texto` (`/message/sendText`), `Botoes` (`sendButtons`), `Lista` (`sendList`), `CTA` (`sendLink`), `Imagem`/`Audio`/`Arquivo` (`sendMedia`). Resolve WhatsApp sem API oficial paga (Baileys por baixo). A instância (`canal_instancia`, salva no [[Canais e Webhooks|webhook]]) é necessária para responder. `getAnthropicClient()` lê `anthropic_api_key` do KV.

## See Also

- [[SGP API — Visão geral]] — estudo completo dos 237 endpoints da API do SGP
- [[Pré-cadastro real]] · [[SGP]] · [[Catálogo de Nós]] · [[IA com Tool Calling]] · [[Motor de Fluxo]]
