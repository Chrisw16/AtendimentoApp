---
title: Memória estruturada da IA
type: component
created: 2026-07-01
last_updated: 2026-07-01
status: active
related: ["[[IA com Tool Calling]]", "[[Motor de Fluxo]]", "[[Pré-cadastro real]]", "[[Prompt Comercial (Netzinha)]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Memória estruturada da IA", "salvar_dado", "ficha da IA", "cache da IA", "memória do ia_responde"]
tags: [ia, motor, memoria, backend]
---

# Memória estruturada da IA

Mecanismo que impede o nó `ia_responde` de re-perguntar um dado que o cliente já informou. Implementado em 2026-07-01 (branch `worktree-ambiente-testes-fluxo`), resolve a fragilidade da janela deslizante. Spec/plano em `docs/superpowers/{specs,plans}/2026-07-01-memoria-estruturada-ia*`.

## Problema

O histórico do `ia_responde` era uma janela deslizante por nó (`_ia_hist_<id>`, `.slice(-50)`). Os dados coletados viviam só como texto no histórico; num cadastro comercial longo, cidade/plano do começo saíam da janela e a IA re-perguntava.

## Solução: dado coletado vira variável de fluxo

- **Tool `salvar_dado({dados:{...}})`** (batch, [[IA com Tool Calling|iaTools.js]]): a IA salva o que o cliente informa. O [[Motor de Fluxo|motor]] intercepta (não passa pelo `executarTool` porque precisa mutar o estado), normaliza a chave p/ ASCII (`normalizarNomeCampo`) e grava em `ctx.estado.contexto[campo]` — igual `definir_variavel`. Chaves reservadas (`cliente`/`boleto`/...) são protegidas (`CAMPOS_RESERVADOS`).
- **`montarFichaColetada(contexto)`** monta o bloco `## DADOS JÁ COLETADOS`, injetado no system prompt **todo turno** por `montarSystemPrompt`. Mesmo que o histórico cru deslize, os fatos voltam sempre. A lógica pura fica em `fluxoHelpers.js` (testada; `motorFluxo.js` não é importável em teste).

## Fixes que a validação real exigiu

- **Texto colado no tool_use:** o loop agêntico só capturava o texto do modelo no `stop_reason=end_turn`. Quando a IA mandava a fala junto de um tool_use (típico no fim do cadastro: "confirmo seus dados, posso finalizar?" + `salvar_dado`), o texto era descartado e a conversa travava com "Respostas geradas: 0". Corrigido: texto que acompanha um tool_use é enviado na hora e registrado no histórico.
- **`max_turns`:** o contador `_ia_turnos_<id>` (default 6) desviava p/ a porta `max_turnos` antes de um cadastro longo terminar. O nó comercial precisa de `max_turns≈25`. A memória estruturada é o que torna um `max_turns` alto seguro (sem ela, mais turnos = mais esquecimento).

## See Also

- [[IA com Tool Calling]] · [[Motor de Fluxo]] · [[Pré-cadastro real]]
