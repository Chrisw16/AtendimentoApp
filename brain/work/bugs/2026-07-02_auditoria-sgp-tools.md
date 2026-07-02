---
title: Auditoria SGP ↔ tools da IA (2026-07-02)
type: bug
created: 2026-07-02
last_updated: 2026-07-02
status: active
priority: p1
progress: "segunda_via_boleto corrigido (campos reais + testes); demais achados abertos"
knowledge_refs: ["systems/maxxi/components/ia-tool-calling", "systems/maxxi/components/integracoes-sgp", "domains/sgp-api/ura", "domains/sgp-api/pre-cadastro", "domains/sgp-api/radius"]
related: ["[[IA com Tool Calling]]", "[[Integração SGP]]", "[[SGP API — URA]]", "[[SGP API — Pré-Cadastro]]", "[[SGP API — RADIUS]]", "[[Auditoria profunda (2026-06-30)]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["sgp-api-postman", "2026-06-30_estudo-codigo-maxxi"]
aliases: ["Auditoria SGP tools", "auditoria SGP", "chamadas de API dos nós", "auditoria da API do SGP"]
tags: [work, bug, auditoria, sgp, ia, tools]
---

# Auditoria SGP ↔ tools da IA (2026-07-02)

Revisão das **chamadas de API do SGP** nos nós/tools do sistema, confrontando o código (`integrations.js` + `iaTools.js` + `processarNo`) contra a doc oficial ([[SGP API — Visão geral]], 237 endpoints). Cobre as 11 chamadas SGP que o código faz. O padrão dominante dos bugs vivos é o mesmo da [[Auditoria profunda (2026-06-30)]], só que num eixo novo: **mismatch de nome de campo entre a resposta do `integrations.js` e quem a consome** — desta vez `integração ↔ tool da IA` (as tools foram escritas depois dos nós e divergiram). Os **nós** do motor usam os campos certos; as **tools** da IA, não.

## ✅ Corrigido

- **`segunda_via_boleto` (tool) nunca entregava o boleto** `[CONFIRMADO]` — a tool lia `r.link`/`r.pix`/`r.valor`/`r.vencimento`, campos que `segundaViaBoleto` nunca retorna (os reais são `valor_cobrado`/`vencimento_atual`/`link_cobranca`||`link_boleto`/`pix_copia_cola`), e não tratava `multiplos_boletos`. O `if(!r.link && !r.pix)` era sempre verdadeiro → a IA **sempre** respondia "não encontrei boletos", mesmo com fatura aberta. **Fix (commit `d423a48`):** lógica extraída p/ `iaToolsHelpers.js` (`formatarBoletoIA`, pura, testável) + `iaToolsHelpers.test.js` (6 testes; suíte 93→99). O nó `consultar_boleto` já lia os campos certos (prova) e não foi tocado. Ver [[IA com Tool Calling]].

## Aberto — Médio

- **`criarChamado` descarta os `extras`** `[CONFIRMADO]` — a assinatura recebe `extras = {}` mas o corpo enviado ao `/api/ura/chamado/` tem só `{contrato, ocorrenciatipo, conteudo}`. A tool `criar_chamado` coleta `contato_nome`/`contato_telefone` e manda `usuario:'ia_maxxi'` — tudo dropado. A doc do chamado **suporta** `contato_nome`, `contato_telefone`, `usuario`, `observacao`. O chamado abre, mas sem contato nem atribuição.
- **Nó `promessa_pagamento` lê campos de resposta errados** `[CONFIRMADO]` — o nó usa `data.adimplente`, `data.dias`, `data.data`; `promessaPagamento` retorna `liberado`, `liberado_dias`, `data_promessa` (não existe `adimplente`). Efeito: a porta **`adimplente` é morta** e a mensagem de sucesso `Pague até: {{promessa.data}}` sai **com data vazia**.

## Aberto — Baixo

- **`historico_ocorrencias` (tool) lê `o.id`/`o.descricao`** `[CONFIRMADO]` — a função retorna `o.numero`/`o.conteudo` → protocolo vira `#undefined`. (O nó `consultar_historico` já usa `o.numero`/`o.tipo`/`o.status`.)
- **`listarPlanos(cidade)` manda `cidade` p/ `/api/precadastro/plano/list`** `[CONFIRMADO]` — a doc desse endpoint só aceita `app`+`token`; o SGP **ignora** o filtro. Afeta o nó `listar_planos`; a tool `listar_planos_ativos` da IA lê a tabela **local** `planos`, então o caminho da IA não é afetado.
- **`consultarManutencao` chama `GET /api/ura/manutencao/list` sem barra final** `[CONFIRMADO]` — a doc é `/manutencao/list/`; risco de 301/404.
- **`consultarRadius` usa `tipoconexao:'PPP'`** `[PLAUSÍVEL]` — valor não confirmado na doc (pode ser `PPPOE`); validar contra o SGP real.
- **`ocorrencia/list` enviado como `application/json`** `[PLAUSÍVEL]` — só o `chamado` tem exemplo JSON na doc; o resto de URA é form-urlencoded (provavelmente aceita ambos).

## Corretos (batem com a doc)

`consultacliente`, `fatura2via`, `verificaacesso`, `chamado` (endpoint/tipos), `vencimento/list` e `precadastro/F` — campos e obrigatórios conferem, inclusive o modo lead do pré-cadastro.

## See Also

- [[IA com Tool Calling]] · [[Integração SGP]] · [[Auditoria profunda (2026-06-30)]] · [[SGP API — Visão geral]]
