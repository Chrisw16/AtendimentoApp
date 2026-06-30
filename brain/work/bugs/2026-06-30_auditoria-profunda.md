---
title: Auditoria profunda (2026-06-30)
type: bug
created: 2026-06-30
last_updated: 2026-06-30
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/motor-fluxo", "systems/maxxi/components/catalogo-de-nos", "systems/maxxi/components/canais-e-webhooks", "systems/maxxi/components/integracoes-sgp"]
related: ["[[Achados de código (2026-06-30)]]", "[[Motor de Fluxo]]", "[[Catálogo de Nós]]", "[[Canais e Webhooks]]", "[[Integração SGP]]", "[[Frontend Maxxi]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Auditoria profunda (2026-06-30)", "auditoria", "auditoria pesada", "audit"]
tags: [work, bug, auditoria, seguranca, divida-tecnica]
---

# Auditoria profunda (2026-06-30)

Resultado de uma auditoria pesada (4 agentes paralelos lendo o código + verificação adversarial relendo os arquivos). Complementa o levantamento inicial em [[Achados de código (2026-06-30)]] com bugs **novos**. Cada item marca `[CONFIRMADO]` (verificado relendo o código) ou `[PLAUSÍVEL]` (reportado, depende de validar rodando / formato real do SGP). Auditoria estática — nada validado em execução.

O grupo mais importante é o de **mismatches editor↔motor**: o painel de propriedades ([[Catálogo de Nós|PropsPanel]]) salva campos com nomes que o [[Motor de Fluxo|motor]] não lê, então **configuração feita no editor é silenciosamente ignorada na execução** — afeta diretamente o motor de fluxo.

## Crítico

- **Race de estado do fluxo** `[CONFIRMADO]` — os webhooks chamam `processarConversa(...)` **sem `await`** e o `estadosExecucao` é um `Map` mutável compartilhado por referência; duas mensagens do mesmo cliente em sequência rápida intercalam (há `await` SGP/IA no meio) e corrompem o estado (saltos de nó, respostas duplicadas). Serializar por `conversa_id` (fila/lock) ou persistir estado.
- **URL do SGP não salva** `[CONFIRMADO]` — [Configuracoes.jsx:383](apps/web/src/pages/Configuracoes.jsx#L383): `onChange={setSgpUrl}` passa o **evento** em vez de `e.target.value` (o campo Evolution ao lado faz certo). `sgp_url` é gravado como objeto → integração SGP nunca conecta.
- **Canais apaga config salva** `[CONFIRMADO]` — [Canais.jsx:82](apps/web/src/pages/Canais.jsx#L82): `useState(canal.config || {})` inicializa uma vez; a página renderiza os 6 cards do catálogo **antes** do fetch resolver (config `{}`) e o card não remonta. Toggle/salvar envia `config:{}` → sobrescreve credenciais já salvas. Perda de dados.
- **Webhook duplica mensagem** `[CONFIRMADO]` — não há **unique constraint** em `mensagens.external_id` (migration 001 cria só índice não-único); reentrega concorrente da Evolution passa pelos dois `porExternalId` antes de inserir → 2 inserts + `processarConversa` 2x → IA responde em dobro e cobra a Anthropic 2x.

## Alto

- **Mensagens em `aguardando` ignoradas** `[CONFIRMADO]` — os webhooks só acionam o motor (`status==='ia'`) ou a supervisora (`'ativa'`); cliente na fila esperando agente que escreve "PROCON/cancelar" não dispara análise de palavra crítica nem re-escala SLA.
- **Mismatches editor↔motor (config ignorada)** `[CONFIRMADO]`:
  - `enviar_lista`: editor salva `botao`/`secao`, motor lê `label_botao`/`titulo_secao` → lista sai sem texto de botão e sem título de seção.
  - `ia_responde`: editor salva `instrucao`, motor lê `cfg.prompt` → "instrução adicional" nunca entra no system prompt.
  - `abrir_chamado`: editor salva `tipo` (string `tecnico/financeiro/comercial`), motor lê `tipo_id` → todo chamado abre como tipo 5 (Outros).
  - `gatilho_keyword`: editor salva `palavras`/`exato`, motor só faz `avancar('saida')` → filtro de palavra-chave é inerte.
  - `aguardar_resposta`: editor salva `timeout`/`max_tentativas`, motor ignora os dois.
  - `nps_inline`: editor oferece escala "1 a 5", mas o motor hardcoda 1-10 → nota 5 vira detrator.
- **Portas declaradas que o motor nunca emite (ramos mortos)** `[CONFIRMADO]`:
  - `solicitar_localizacao`: só emite `localizacao_recebida` (nunca `sem_localizacao`/`erro`); não valida se veio localização.
  - `transferir_agente`: só `fora_horario` ou `fim()` no sucesso — nunca `transferido`/`sem_agente`.
  - `condicao_multipla`: **sem bloco no PropsPanel** (inconfigurável) + FlowNode gera portas por `ramo.id` mas o motor avança por `ramo.porta`, com fallback `default` que o editor nunca cria.
- **Dashboard NPS ≈ -100** `[CONFIRMADO]` — quando cai no fallback da tabela `avaliacoes` (escala 1-5), o cálculo usa escala 0-10 (`>=9` promotor) → toda nota vira detrator. Liga-se à divergência de NPS: `nps_inline` grava em `satisfacao` (0-10), a tela Satisfação lê `avaliacoes` (1-5).

## Médio

- **`consultarManutencao` sem `protocolo`/`titulo`** `[CONFIRMADO]` — a tool `consultar_manutencao` sempre reporta "Protocolo: N/A" e `statusRede` cai no título fallback.
- **`criar_chamado` despeja JSON** `[CONFIRMADO]` — quando o SGP não retorna protocolo, a tool usa `JSON.stringify(r)` como "protocolo" → cliente recebe um JSON cru como número de protocolo.
- **Falsy-zero com `||`** `[CONFIRMADO, latente]` — `divisao_ab` `pct_a||50`, `abrir_chamado` `tipo_id||5`, `aguardar_tempo` `segundos||60`: configurar 0 vira o default (no editor o slider impede 0; afeta fluxos importados via JSON).
- **`__TRANSFERIR__`/`__ENCERRAR__` não dão break** `[CONFIRMADO]` — no loop agêntico do `ia_responde`, após a sentinela o loop continua e o texto de despedida pode ser sobrescrito pela próxima resposta da IA (o roteamento de porta ainda funciona).
- **Toggle modo IA/Humano cosmético** `[CONFIRMADO]` — o toggle em `ConversaList` chama só `store.setModo` (estado local), nunca `PUT /chat/modo`; o modo no banco não muda.
- **Painel mostra bolha vazia** `[CONFIRMADO]` — `ConversaView` renderiza só `imagem`/`audio`/texto; mensagens tipo `botoes`/`lista`/`cta`/`arquivo`/`localizacao` (geradas pelo motor) aparecem em branco para o agente (texto real está em `corpo`/`itens`).
- **Backend ecoa msg do agente ao autor** `[CONFIRMADO]` — `broadcast('mensagem')` não exclui o autor; em erro de POST após o broadcast, a UI mostra bolha duplicada (temp com X + real entregue); os eventos `mensagem` e `conversa_atualizada` disputam o campo `atualizado` (saltos na ordenação).
- **Reconexão SSE incompleta** `[CONFIRMADO, nuance]` — `useChat.onError` só recarrega a lista (`setTimeout(loadConversas)`), nunca recria o `EventSource`. O EventSource nativo reconecta erros transitórios sozinho, mas em falha terminal (ex.: token expira → 401 no `/sse`) o realtime morre.
- **PUT /agentes com login duplicado → 500** `[CONFIRMADO]` — o POST checa duplicidade, o PUT não; viola a unique e estoura 500 em vez de 409.
- **`GET /:id` não-UUID → 500** `[CONFIRMADO]` — id que não é UUID gera erro de cast no Postgres (ocorrencias/ordens/fluxos/agentes/cobertura) em vez de 404.
- **Restaurar prompt incompleto** `[CONFIRMADO]` — `POST /prompts/:slug/restaurar` só restaura `conteudo=padrao`; provedor/modelo/temperatura permanecem customizados.
- **Clientes: `process.env` no Vite** `[CONFIRMADO]` — [Clientes.jsx](apps/web/src/pages/Clientes.jsx) usa `process.env.VITE_ERP_URL`; `process` é `undefined` no browser → ReferenceError ao renderizar o detalhe com `contrato_id` (não é só fallback silencioso).
- **FluxoEditor ignora auto-refresh** `[CONFIRMADO]` — lê o token do `localStorage` e faz `fetch` cru; token expirado → erro genérico sem refresh, trabalho potencialmente perdido.
- **Contadores de abas errados** `[PLAUSÍVEL]` — Ocorrências/Ordens calculam os contadores das abas sobre a lista já filtrada no servidor → abas não-ativas mostram 0.
- **`transferir` não ajusta SLA** `[PLAUSÍVEL]` — não toca `assumido_em`/`primeira_msg_agente_em` → falso-positivo de "agente fantasma" ou escape do detector.
- **`segundaViaBoleto` vencido** `[PLAUSÍVEL]` — `new Date(f.vencimento)` quebra se o SGP mandar data BR (`dd/mm/yyyy`) → boleto vencido marcado como não-vencido.
- **Clientes dedup inútil** `[PLAUSÍVEL]` — fallback local com `GROUP BY` incluindo `id` (UUID único) → mesmo cliente repetido por conversa.

## Baixo

- **api.js com endpoints latentes** `[CONFIRMADO, latente]` — `dashboardApi.atendimentos` aponta para `/dashboard/atendimentos` (rota é `/serie`; mas o Dashboard usa `/serie` direto, então o método é morto); `clientesApi.create/update` (POST/PUT `/clientes` não existem; tela é read-only); `chatApi.agendarRetorno/cancelarRetorno` (`/agendamento` não existe — 404 se a UI chamar). São métodos errados/mortos, não quebras vivas hoje.
- **seed duplica respostas rápidas** `[CONFIRMADO]` — `onConflict().ignore()` sem unique em `respostas_rapidas` → cada `npm run seed` reinsere as 5.
- **`consultas_cobertura` morta** `[CONFIRMADO]` — tabela criada na migration 002 mas nunca escrita (`/cobertura/check` não loga).
- **`sgpPost` sem try no `res.json()`** `[CONFIRMADO]` — SGP respondendo não-JSON com 200 lança SyntaxError (em `precadastrarCliente` sobe como erro cru).
- **`pointInPolygon` crasha** `[CONFIRMADO]` — `coordinates` vazio → TypeError (sem guard).
- **Topbar: sino inerte** `[CONFIRMADO]` — o botão de notificações não tem `onClick`; somado ao `n.lida` vs `read`, o badge fica preso e nunca zera.
- **`confirmarEncerrar` sem await** `[CONFIRMADO]` — `ConversaInfo` fecha o form mesmo se o encerramento falhar.
- **`enviar_cta` `rodape` ignorado** `[CONFIRMADO]` + nós stub (`mudanca_endereco` etc.) existem no motor mas não no catálogo do editor.

## Top correções recomendadas

1. **Mismatches editor↔motor** (alto, fácil): alinhar nomes de campo (`botao→label_botao`, `secao→titulo_secao`, `instrucao→prompt`, `tipo→tipo_id`) e portas mortas — restaura funcionalidade do motor de fluxo de imediato.
2. **Race + dedup de webhook** (crítico): unique em `mensagens.external_id` + serializar `processarConversa` por conversa.
3. **URL do SGP + Canais config** (crítico): corrigir `onChange` e a inicialização de estado — hoje impedem configurar SGP e podem apagar credenciais.
4. **NPS** (alto): unificar tabela/escala (`avaliacoes` 1-5 vs `satisfacao` 0-10).
5. **Mensagens em `aguardando`** (alto): acionar supervisora/fila também nesse status.

## See Also

- [[Achados de código (2026-06-30)]] · [[Motor de Fluxo]] · [[Catálogo de Nós]] · [[Canais e Webhooks]]
