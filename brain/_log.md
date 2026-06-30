# Brain Log

Registro cronológico append-only de todas as operações no brain.

## [2026-06-30 12:20] INIT | Brain do Maxxi v2 criado

Bootstrap do brain na raiz do repositório `netgo-chat-v2` (código do Maxxi v2 / GoCHAT, clonado de github.com/Chrisw16/AtendimentoApp com histórico completo).

- Estrutura criada: `raw/sources/{code,strategy,docs}`, `brain/systems/maxxi/{components,runbooks,diagrams}`, `brain/{concepts,domains,strategy/decisions}`, `brain/work/{tasks,bugs}`.
- Source inicial absorvida: `2026-06-30_decisao-base-maxxi.md` (handoff da decisão estratégica de adotar o Maxxi como base do produto ISP).
- Decisões da sessão: brain na raiz (vault Obsidian); repo a ser tornado privado para versionar a documentação junto do código.
- Próximo: estudo minucioso do código (backend núcleo → schema/rotas → frontend) e construção das páginas de conhecimento + CLAUDE.md.

## [2026-06-30 13:30] INGEST | Estudo do código + 18 páginas de conhecimento

Estudo linha-por-linha do código do Maxxi v2 (backend lido de perto; frontend e rotas periféricas por 3 agentes paralelos). Source: `raw/sources/code/2026-06-30_estudo-codigo-maxxi.md`.

- Criado `CLAUDE.md` (guia operacional) na raiz.
- 18 páginas de brain criadas: overview do sistema + 12 componentes (motor-fluxo, ia-tool-calling, integracoes-sgp, canais-e-webhooks, supervisora-ia, fila-e-sla, realtime-sse, auth-e-seguranca, modelo-de-dados, frontend, design-system, api-backend) + runbook; domínio SGP; decisão de base; pessoa Christian; achados de código (bugs/segurança).
- `_index.md` e `_backlinks.json` reconstruídos. Página mais conectada: "Maxxi v2 / GoCHAT — Visão geral" (17 inbound).
- Descobertas notáveis: design system migrou para tema LIGHT (README desatualizado); credenciais de integração vivem no banco (sistema_kv), não em env; bug do Redis (`redis` vs `ioredis`); API keys expostas em `GET /sysconfig`; resíduos "CITmax" do sistema de inspiração.

## [2026-06-30 14:15] INGEST | Documentos do usuário sobre o motor de fluxo

Ingestão de 2 sources autorais do usuário sobre o coração do sistema: `motor-fluxo.md` (arquitetura + catálogo nó-a-nó) e `integrations.md` (referência completa do integrations.js). Salvos em `raw/sources/docs/`.

- Criada página `Catálogo de Nós` (referência nó-a-nó dos ~30 nós: portas, config, contexto) — centro da documentação do motor.
- `Motor de Fluxo` reescrita com profundidade do modelo de execução: estrutura JSON do fluxo, padrão "enviar e aguardar" (2 fases), tabela de interpolação, saída multicanal, limitações.
- `Integração SGP` enriquecida: helpers de transporte (sgpPost/PostJSON/Get), retornos por função, aliases para o motor, distinção listarPlanos (SGP) vs listar_planos_ativos (tabela local).
- Novos achados: porta do `abrir_chamado` inconsistente (nodeTypes `saida` vs motor `sucesso`/`erro`); divergência entre branches `main` e `dev` (comportamento sem-fluxo + break do loop agêntico).
- `_index` e `_backlinks` atualizados (19 páginas; "Maxxi overview" com 18 inbound).

## [2026-06-30 15:00] INGEST | Documentação das abas (telas) do sistema

Estudo de cada aba do painel (para que serve, como funciona, integração entre telas), a partir do estudo de frontend já absorvido.

- Criadas 4 páginas em `systems/maxxi/telas/`: `Telas e Navegação` (hub: rotas, guards, RBAC, **mapa de integração entre abas**), `Abas de Atendimento` (Chat, Histórico, Satisfação), `Abas de Configuração` (Dashboard, Agentes, Fluxos+Editor, Canais, Prompts IA, Configurações, Analytics), `Abas de Operações e Infraestrutura` (Clientes, Ocorrências, Ordens, Cobertura, Monitor + não-roteadas + stubs).
- `Frontend Maxxi` agora aponta para o detalhe por aba.
- Integração-chave registrada: cadeia Fluxos→Prompts IA→Configurações(Planos/credenciais)→Canais→Chat→Dashboard; espinha `conversas`/`mensagens` compartilhada; e a **divergência de NPS** (aba Satisfação lê `avaliacoes` 1-5 vs nó `nps_inline`/Dashboard usam `satisfacao` 0-10).
- `_index` e `_backlinks` atualizados (23 páginas).

## [2026-06-30 16:30] WORK | Auditoria profunda de bugs (4 agentes + verificação)

Auditoria pesada do código: 4 agentes paralelos (núcleo backend, rotas/dados, páginas FE, componentes+contratos) lendo linha por linha, seguida de verificação adversarial relendo PropsPanel.jsx, api.js, useChat.js, Configuracoes.jsx, Canais.jsx e o motor.

- Criada página `Auditoria profunda (2026-06-30)` em `work/bugs/`, com achados marcados CONFIRMADO (verificado) vs PLAUSÍVEL (a validar rodando), por severidade.
- Grupo mais valioso: **mismatches editor↔motor** (PropsPanel salva `botao/secao/instrucao/tipo`, motor lê `label_botao/titulo_secao/prompt/tipo_id`) → configuração ignorada na execução; e **portas mortas** (solicitar_localizacao, transferir_agente, condicao_multipla).
- Críticos novos: race de estado do fluxo (webhooks sem await + Map compartilhado); URL do SGP não salva (`onChange={setSgpUrl}`); Canais apaga config ao salvar; dedup de webhook sem unique constraint (duplica mensagem + IA 2x).
- A verificação pegou exageros dos agentes (api.js com métodos errados mas mortos/não-usados, não quebras vivas) — registrados como latentes.
- Cross-link com `Achados de código (2026-06-30)`. `_index`/`_backlinks` atualizados (24 páginas).

## [2026-06-30 17:30] WORK | 1ª leva de correções dos mismatches editor↔motor (com testes)

Correção dos mismatches mais diretos da auditoria, em worktree isolada + TDD (primeiros testes do projeto).

- Criado `apps/api/src/services/fluxoHelpers.js` (4 funções puras) + `fluxoHelpers.test.js` (21 testes, `node --test`); `package.json` ganhou script `test`.
- Corrigidos: `enviar_lista` (`camposLista` lê `botao`/`secao` com fallback), `abrir_chamado` (`resolverTipoChamado` mapeia `tipo`→código SGP), `ia_responde` (`montarSystemPrompt` usa `cfg.instrucao ?? cfg.prompt`), `nps_inline` (`avaliarNps` respeita escala 5/10). `integrations.js`→`evolutionEnviarLista` passou a ler `label_botao`/`titulo_secao`.
- Brain atualizado: `Motor de Fluxo` (seção "Funções puras testáveis") e `Auditoria profunda (2026-06-30)` (itens ✅). CLAUDE.md ganhou seção de Testes + nota dos mismatches.
- **Aberto ainda:** `gatilho_keyword` (matching), `aguardar_resposta` (timeout/scheduler), `condicao_multipla` (editor + portas), portas mortas (`solicitar_localizacao`, `transferir_agente`), `enviar_cta` rodapé.
- Próximo passo decidido com o Christian: **ambiente de testes de fluxo** (detectar trava/limbo/cliente perdido).

## [2026-06-30 18:30] WORK | Ambiente de testes de fluxo (validador estático + simulador)

Construído em branch separada (`worktree-ambiente-testes-fluxo`) — Christian trabalha com outro dev e só passa pra main quando estiver 100%. Tudo TDD, sem subir banco/IA (o motor não importa em teste pois puxa knex e as deps não ficam instaladas localmente).

- **`fluxoValidador.js`** (+CLI +exemplo): análise estática do grafo. Catálogo `NOS` (tipo→portas que o motor emite, extraído do `processarNo`) + checagens `sem_entrada`/`beco_sem_saida`/`porta_nao_conectada`/`no_inalcancavel`/`aresta_orfa`/`loop_sem_espera`. 38 testes.
- **`motorLoop.js`**: loop real do motor extraído como função pura (`executarLoop`, `encontrarProximo` byte-a-byte), classifica desfecho (concluido/aguardando/perdido/travado/erro). Espelho fiel, **pronto pra religar** no `processarConversa` (deferido: precisa Docker p/ validar). 9 testes.
- **`motorSimulador.js`** (+CLI +cenário): conversa multi-turno sobre o `executarLoop`, executor fiel p/ determinísticos (reusa `avaliarNps`) + decisões roteirizadas p/ IO/IA/SGP. 9 testes.
- Insight registrado: o 3º fallback do `encontrarProximo` (qualquer aresta) faz ramo não-ligado **mandar pro nó errado** (não perder o cliente) → no validador é `aviso`, não `erro`; "perdido" de runtime só com **zero arestas**.
- Brain: nova página `Testes de Fluxo`; `_index` (15 componentes) e See Also de `Motor de Fluxo` atualizados. Total na branch: **77 testes verdes**.

## [2026-06-30 19:30] WORK | Função nativa de teste de fluxo no app (Fase A + B)

Rodado o validador no fluxo real "Atendimento NetGo — Principal" (24 nós): 0 erros, 8 avisos reais — aresta `nao_encontrado` numa porta que `consultar_cliente` nunca emite (funciona só por sorte via `max_tentativas`), branches mortos `wifi`/`relocacao` no menu (lista não tem mais essas opções), porta `sim` resíduo, e 4 menus sem tratar resposta-fora-das-opções (o `n_1774406303940` sem `ia_menu_ativo` é o risco real). Encerrar sem mensagem de despedida.

Construída a função nativa (Christian pediu, escopo A+B):
- **Fase A:** rotas `POST /fluxos/:id/validar` e `/simular` (finas, reusam os módulos puros) + botão "Testar fluxo" → `TesteFluxoModal` (aba Validação + Simulação modo Roteiro).
- **Fase B (simulação real):** `processarConversa(c, msg, opts)` com `opts` (fluxo/estados/enviar/sandbox; defaults = produção byte-idêntica). Sandbox roda SGP/IA reais mas **simula tudo que grava** (nós + tools de IA via gate no `executarTool`). Rota `/simular-real` resumível por turno + chat sandbox na UI.
- **Não rodado** (sem deps/banco local) — `node --check` OK, 77 testes dos módulos puros verdes; validar via docker antes da main.
