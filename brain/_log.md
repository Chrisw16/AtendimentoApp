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

## [2026-06-30 20:30] DOC | Como funciona o módulo Prompts IA + campos do nó IA Responde

Dúvida do Christian sobre a tela Prompts IA e o nó IA Responde. Estudo + documentação (sem mudar código).

- `IA com Tool Calling` ganhou: tabela `contexto` × `instrucao` × `tools_ativas` (papéis distintos; o prompt NÃO registra tools, só orienta) + seção das 3 abas da tela (Prompts / Catálogo read-only / Testar Tools).
- **Armadilha registrada:** nós que setam `contexto` para um valor que não é slug válido (ex. `"Suporte Técnico"` ≠ `suporte`) caem no prompt genérico de fallback → editar o prompt na tela não afeta o nó. Visto no fluxo de produção (prompt gigante inline em `instrucao` + `contexto` divergente).
- Observado: a aba Catálogo é lista fixa no front e esconde as tools Comercial (só mostra Diagnóstico/Atendimento/Financeiro).
- CLAUDE.md: regra dos prompts estendida com os 3 campos do nó IA Responde.

## [2026-06-30 22:00] FEAT | Iteração no produto durante o uso (Christian testando em prod)

Christian subiu a branch no Coolify e foi testando/pedindo melhorias. Tudo na branch `worktree-ambiente-testes-fluxo`, validado por build do Vite + `node --check` + 77 testes (sem rodar o app — sem deps/banco local).

- **Chat de simulação estilo WhatsApp** (`TesteFluxoModal`): botões/listas clicáveis, formatação `*negrito*`/`` `mono` ``, bolhas alinhadas.
- **Dropdown de contexto no nó IA Responde** — corrigido no painel **real** (inline no `FluxoEditor.jsx`; o `components/fluxo/PropsPanel.jsx` é **código morto**). Valor inválido aparece com ⚠.
- **Prompt comercial** completo entregue (apresentação→coleta→pré-cadastro→finalização, tools certas). Ainda não versionado no brain.
- **Planos — cidade vazia = todas as cidades** (`listar_planos_ativos`) + multi-cidade por vírgula.
- **Planos — promoção** (migration 011 — era 008, renumerada na reconciliação com o main: `valor_promocional` + `promo_meses`): preço dos primeiros meses + duração; a tool `listar_planos_ativos` passa a citar "R$ X nos primeiros N meses, depois R$ Y/mês"; form e card atualizados.

## [2026-06-30 23:30] FECHAMENTO DO DIA | Mais melhorias de produto + pauta de amanhã

Christian seguiu testando e pedindo melhorias; fim do dia.

- **Planos — benefícios** (migration 012 — era 009, renumerada: `beneficios` texto): Globoplay/Deezer/Qualifica etc.; `listar_planos_ativos` cita "inclui: …"; form (textarea) + chips no card.
- **Link público de teste** (migration 013 — era 010, renumerada: `fluxos.share_token`): rota pública `/api/chat-teste/:token` (sandbox, rate-limit) + página `ChatTeste.jsx` em `/teste/:token` (fora do login) + UI de gerar/revogar no `TesteFluxoModal`. Modo Real + token revogável.
- **Fixes do teste comercial:** histórico do `ia_responde` 20→50 msgs (esquecia cidade/plano em cadastro longo); protocolo fabricado no sandbox (em produção `conversaRepo.criar` já gera). Confirmado: `precadastrar_cliente` não roda no sandbox **por design** (gate) — função real (`precadastrarCliente`) está correta.
- **Prompt comercial** versionado no brain (`systems/maxxi/prompts/comercial.md`).
- **Docs:** CLAUDE.md (link público, planos, fragilidade da memória da IA), `Testes de Fluxo`, `IA com Tool Calling`, nova página de pauta `work/tasks/2026-06-30_…`. `_index` atualizado.
- **Branch `worktree-ambiente-testes-fluxo`:** ~13 commits, não mesclada (Christian decide o merge). Deploy roda na branch via Coolify (migrations 008/009/010 pendentes no próximo Redeploy).
- **PAUTA DE AMANHÃ:** (1) melhorar a **memória/janela da IA** (Christian sugeriu "cache" — discutir extração estruturada / sumário / prompt caching); (2) **pré-cadastro real** (tirar do sandbox pra testar pra-valer). Ver `work/tasks/2026-06-30_ambiente-testes-e-proximos-passos.md`.

## [2026-07-01 18:00] INGEST | Estudo da API do SGP (237 endpoints) + memória/pré-cadastro

Fonte `sgp-api-postman` (coleção Postman oficial) absorvida. Criadas: [[SGP API — Visão geral]] + 13 páginas de módulo em `brain/domains/sgp-api/` (URA 69, Central Assinante 33, Estoque 32, FTTH 29, Ordem de Serviço 26, CRM 12, Gerenciador CPE 12, Suporte 9, Pré-Cadastro 5, RADIUS 5, Remessa/Retorno 2, Termo de Aceite 2, Outros 1). Cada endpoint com método, path, campos e obrigatórios. Criadas [[Pré-cadastro real]] e [[Memória estruturada da IA]] (trabalho da sessão). Corrigidos endpoints errados em [[Integração SGP]] e [[SGP]] (planos `/api/precadastro/plano/list`, `nas_id=53`, modo lead, ACS→Gerenciador CPE). Task [[Ambiente de testes + próximos passos (2026-06-30)]] itens 1 e 2 marcados concluídos. Raw imutável: `raw/sources/docs/2026-07-01_sgp-api-postman.json` + extração `2026-07-01_sgp-api-completa.md`.

## [2026-07-02 14:30] WORK | Auditoria das chamadas SGP dos nós/tools + fix da 2ª via

Revisão das 11 chamadas SGP do código contra a doc oficial (agora que a API do SGP está toda no brain), confrontando `integrations.js` + `iaTools.js` + `processarNo`. Padrão dos bugs vivos: **mismatch de campo entre a resposta do `integrations.js` e quem consome** — eixo `integração ↔ tool da IA` (as tools divergiram dos nós). Criada [[Auditoria SGP ↔ tools da IA (2026-07-02)]].

- **Corrigido (TDD, commit `d423a48`):** a tool `segunda_via_boleto` lia `r.link`/`r.pix`/`r.valor` (inexistentes) e **sempre** dizia "não encontrei boleto". Lógica extraída p/ `iaToolsHelpers.js` (`formatarBoletoIA`, pura) + `iaToolsHelpers.test.js` (6 testes; suíte 93→99 verdes). [[IA com Tool Calling]] enriquecida com a armadilha.
- **Abertos:** `criarChamado` descarta `extras` (contato/atribuição do chamado); nó `promessa_pagamento` lê `adimplente`/`dias`/`data` (função retorna `liberado`/`liberado_dias`/`data_promessa`); tool `historico_ocorrencias` lê `o.id`/`o.descricao` (retorno tem `numero`/`conteudo`); `listarPlanos(cidade)` filtra por campo que o `plano/list` ignora; `manutencao/list` sem barra final; `consultar_radius` `tipoconexao:'PPP'` a validar.
- Christian foi testar a IA ao vivo em seguida. Tudo na branch `worktree-ambiente-testes-fluxo`.
## [2026-08-21 · retomada] WORK | Os 4 críticos da auditoria corrigidos (+ Redis SSE)

Retomada do projeto após pausa. Objetivo declarado pelo Christian: **colocar em produção na NetGo**. Frente escolhida: fechar os críticos antes de subir ambiente.

- **Race de estado do fluxo**: criado `apps/api/src/services/filaPorChave.js` (fila FIFO por chave) + `filaPorChave.test.js` (7 testes, TDD — RED verificado por `ERR_MODULE_NOT_FOUND` antes de implementar). `processarConversa` virou wrapper que serializa por `conversa.id` sobre `processarConversaInterno`; os 3 webhooks ficaram protegidos sem mudança. Suíte foi de 21 → 28 testes.
- **URL do SGP não salva**: `onChange={setSgpUrl}` → `onChange={e => setSgpUrl(e.target.value)}`.
- **Canais apaga config**: **a causa registrada na auditoria estava errada** (a página *tem* guard de `isLoading`). Causa real: o estado nunca ressincronizava com o servidor. Corrigido com `useEffect` sobre a config do servidor.
- **Webhook duplica mensagem**: migration `008_dedup_mensagens.js` (limpa duplicatas + unique index em `external_id`) + `mensagemRepo.criar` com `onConflict().ignore()` retornando `null` + guard nos 3 webhooks.
- **Bônus — Redis SSE**: `sseManager.js` migrado de `redis` (não instalado) para `ioredis`, com `lazyConnect` e handlers de `error`. Contrato da API do ioredis verificado rodando.

**Verificado:** 31/31 testes passam; `node --check` nos arquivos de API alterados; `apps/web` builda (`vite build` ✓).
**NÃO verificado:** a migration 008 e o `onConflict` contra Postgres real; a conexão Redis de fato.

### Correção no meio da sessão: o sistema JÁ ESTÁ EM PRODUÇÃO

Eu havia concluído (do estado da máquina local) que o sistema "nunca rodou" e que o próximo passo era subir ambiente. **Errado** — o Christian informou e comprovou por print: roda numa **VPS via Coolify**, em `https://gochat.netgo.net.br`. Login, dashboard e navegação funcionam; 3 agentes cadastrados (Administrador, Christian, Atendente).

Mas o dashboard mostra **tudo zerado** em 30 dias: 0 atendimentos, 0 conversas, 0 respostas NPS, sem dados por canal. Ou seja: **deployado e de pé, ainda não em operação real**. A distinção importa — o risco de mexer em dados é baixo agora, e essa é justamente a janela boa para aplicar correções estruturais.

### Bug que EU ia introduzir (pego a tempo)

A correção do Redis SSE tinha um defeito sério que só apareceu ao saber que existe produção com `REDIS_URL`: `broadcast()` entrega local **e** publica no Redis; o subscriber vive **no mesmo processo**, e pub/sub entrega a todos os inscritos — inclusive a quem publicou. Com o Redis finalmente conectando, **toda mensagem seria entregue duas vezes** na tela do agente. Antes isso estava mascarado porque o import de `redis` sempre falhava.

Corrigido com `INSTANCIA_ID` (randomUUID) carimbado em `origem` nos payloads publicados + `ehEcoProprio()` descartando o próprio eco na recepção. 3 testes novos (fail-open: payload sem `origem`, de instância antiga em deploy gradual, é entregue — perder mensagem é pior que duplicar). Lição: **habilitar um caminho que estava morto exige revisar o caminho inteiro**, não só o ponto do erro.

### Risco operacional descoberto em `server.js`

Se qualquer migration falha no boot, o `.catch` (server.js:101) só loga warning — mas o `.then` que inicia o **monitor de SLA** e a **supervisora IA** é pulado. Uma migration quebrada **desliga os monitores silenciosamente**, com o app parecendo saudável. Por isso a 008 foi endurecida (conta e loga antes de apagar, idempotente). **A falha de acoplamento em si continua aberta** — vale desacoplar os monitores das migrations.

**Ambiente local:** a máquina de dev não tem Docker, Postgres nem Redis. A porta 6379 responde, mas é um **túnel SSH** (`ssh -f -N workflow-vps`) para um Redis remoto — não apontar o `.env` do Maxxi para `localhost:6379` achando que é local.

**Próximo passo:** validar em produção — aplicar as correções e conferir a 008 rodando contra o Postgres real (janela ideal: base ainda vazia), e então fazer o primeiro atendimento ponta-a-ponta de verdade pelo WhatsApp.

## [2026-08-21 · revisão] WORK | Revisão de código: 3 bugs novos corrigidos

Revisão pedida pelo Christian ("código quebrado, sem sentido, sem lógica, bugs"). Feita sem agentes: verificações automáticas sobre os 89 arquivos + leitura profunda do núcleo.

### Ferramentas de varredura (em `scratchpad`, descartáveis)
- **`check_imports.mjs`** — resolve todo import relativo e confere se o símbolo nomeado existe no módulo alvo. **89 arquivos, 0 quebrados.**
- **`check_api.mjs`** — extrai os 88 endpoints do backend e as 52 chamadas de `api.js`, e cruza por verbo+forma. Reproduziu exatamente as 5 divergências que a auditoria marcou como latentes — todas confirmadas **código morto** (nenhuma tela as chama).

### Bugs novos (não estavam na auditoria)
1. **NPS escala 5 → todo respondente vira detrator** (alto). `nps_inline` gravava a nota crua em `satisfacao` (sem coluna de escala) e o dashboard reimplementava as faixas em SQL com 0-10 fixo. Nota 5 numa escala de 5 era promotora no fluxo e detratora no relatório. **Causa raiz: as faixas viviam em dois lugares.** Corrigido com migration 009 (`satisfacao.escala`) + `agregarNps` como fonte única (6 testes) + dashboard delegando. Rótulos do FE ("Promotores (9–10)") viraram agnósticos de escala.
2. **Busca de clientes morta** (alto). `useDebounce` usava `useState` no lugar de `useEffect`: o callback virava inicializador lazy, rodava uma vez com o valor inicial vazio, e o "cleanup" virava o valor do state. `buscaDebounced` ficava `''` para sempre.
3. **`JWT_SECRET` com fallback versionado no repo** (crítico). `'maxxi-dev-secret-change-in-prod'` era a única ocorrência da env em todo o código — sem validação nem aviso. Se o Coolify não define a env, produção assina com segredo público e qualquer um forja admin. Corrigido em `resolverSegredo` (4 testes): env quando existe; **falha o boot** em `NODE_ENV=production`; **aleatório por boot** no resto. Escolhi aleatório em vez de falha dura no caso ambíguo justamente para **não arriscar downtime** se a env não estiver setada — o pior caso vira "sessões caem no restart".

### Correções ao que estava documentado
- `GET /api/sysconfig` **é admin-only** — o CLAUDE.md não dizia, superestimando a severidade.
- O SQL do dashboard (`INTERVAL '${days} days'`) **não é injetável**: `days` vem de um ternário com literais 7/90/30. Registrado como padrão frágil, não vulnerabilidade.

### Cobertura
Lido a fundo: motor de fluxo, auth, dashboard, monitor de SLA, Clientes, sysconfig, contrato FE↔BE. **Não** revisado linha a linha: `iaTools.js`, `integrations.js`, `supervisoraIA.js` e a maioria das rotas e páginas de frontend — os achados de médio porte da auditoria nessas áreas seguem sem revalidação.

Suíte: 31 → 41 testes.

## [2026-08-21 · reconciliação] WORK | Harness de testes de fluxo reconciliado com o main

O Christian pediu para construir um ambiente de testes de fluxo. **Ele já existia** — na branch `worktree-ambiente-testes-fluxo`, parada com **51 commits** nunca mergeados. Descoberto antes de escrever qualquer código, ao checar as branches remotas.

### O que a branch tinha (e o main não)
Harness completo (validador estático, `motorSimulador`, `motorLoop`, sandbox no `processarConversa`, link público `/teste/<token>`), memória estruturada da IA (`salvar_dado` + ficha), diagnóstico de ONU via banco do SGP, correções do SGP (`listarPlanos` com endpoint certo, 2ª via lendo os campos reais, `nas_id`, pré-cadastro em modo lead) e planos com promoção/benefícios.

### Por que estava parada
A própria doc dizia: *"escrito mas não rodado neste ambiente (sem node_modules/banco)"*. Eram ~880 linhas de teste jamais executadas. Com as deps instaladas nesta máquina, rodaram **pela primeira vez: 128/128 passando**. O bloqueio era ambiental, não de qualidade.

### Reconciliação
Feita em worktree isolada (revisar+testar antes de mergear, a pedido do Christian). 4 conflitos, todos resolvidos **combinando** os dois lados:

- **`motorFluxo.js`** — a branch injeta deps em `processarConversa` (`db`/`estados`/`enviar`/`sandbox`); o main envolveu a mesma função com a fila de serialização. Complementares.
  ⚠️ **Achado da revisão:** a fila **não pode** valer no sandbox. A rota pública usa `conversa.id = share:<fluxoId>` — **fixo por fluxo**, não por visitante. Serializar ali colocaria todos os testadores numa fila única, cada um esperando o round-trip de IA/SGP do anterior. Resolvido com `if (opts.estados) return processarConversaInterno(...)`: estado injetado é isolado e dispensa fila. **Um merge ingênuo teria introduzido esse gargalo.**
- **`nps_inline`** — mantém a escala gravada (main) E o guard de sandbox (branch).
- **`fluxoHelpers.js` / `.test.js`** — aditivo puro, os dois lados preservados.
- **`_log.md`** — reordenado por data.

Migrations da branch renumeradas **008/009/010 → 011/012/013** (as 008/009 do main já rodaram em produção; o runner registra por nome de arquivo). Referências na doc atualizadas.

### Verificado
**148/148** testes na suíte reconciliada · `apps/web` builda · as duas CLIs rodam no código merjado (o validador acusa os avisos esperados, incluindo a aresta órfã de `transferir_agente`; o simulador conclui a conversa de 3 turnos).

Também confirmado que o `encontrarProximo` do `motorLoop` continua idêntico ao do motor (só diferem `export` e um comentário) — o espelho segue fiel.

### Aberto
Branch `merge/harness` **não** mergeada no main nem deployada. As migrations 008/009 (main) e 011/012/013 (branch) seguem sem validação contra Postgres real.

## [2026-08-21 · fluxo] WORK | Fluxo "Atendimento NetGo — v2" (híbrido menu+IA)

Fluxo novo construído a pedido do Christian, em `apps/api/examples/fluxo-netgo-v2.json`. Importável direto pelo botão 📂 Importar do editor (o importador aceita `{nome, nodes, edges}` com `posX`/`posY`).

**Desenho:** menu de botões na entrada (2ª via · sem internet · quero ser cliente) para o volume alto resolver sem gastar token, e `ia_responde` só nos ramos que precisam de conversa (`suporte` e `comercial`, com `tools_ativas` explícitas por ramo — `precadastrar_cliente` só no comercial).

**13 nós, 32 arestas, todas as portas conectadas** — inclusive o `saida` dos menus (que no fluxo antigo estava solto em 4 nós) voltando ao menu via "não entendi".

Decisões de produto embutidas:
- **Suspenso/reduzido reaproveita o ramo do boleto**: quem está sem internet por débito recebe a 2ª via na hora, em vez de ir para a fila humana. É o caso mais comum de "sem internet" num ISP.
- **Detrator no NPS vai para humano** (recuperação), promotor/neutro encerram.
- **Saída para humano em todos os ramos** como escape (CPF que falha, IA que não resolve, status inativo/cancelado).

**Verificado:** validador `0 erros, 0 avisos`; simulador conclui as jornadas de boleto e de suspenso→boleto (`cpf_sup → status → msg_debito → busca_boleto → nps → fim`).

**Achados durante a construção (abertos):**
- `consultar_cliente`, `consultar_boleto`, `verificar_status`, `promessa_pagamento`, `listar_planos` **não têm bloco no PropsPanel** — são inconfiguráveis pela interface. Como o motor lê `cfg.pergunta` no `consultar_cliente` e ninguém consegue setar isso pela tela, hoje **o cliente nunca é perguntado pelo CPF**: o nó fica em silêncio esperando. No fluxo v2 o campo foi preenchido direto no JSON (funciona e sobrevive ao salvar).
- **Divergência simulador↔motor:** `motorSimulador.js:88` lê `cfg.mensagem` com default embutido `'Informe seu CPF:'`; o motor lê `cfg.pergunta`. O simulador mostra a pergunta do CPF mesmo quando o motor real não mandaria nada — falso positivo de confiança justamente no nó de entrada de dados.

## [2026-08-21 · fechamento] FECHAMENTO DO DIA | Retomada: críticos, revisão, harness reconciliado e fluxo v2

Sessão de retomada após ~7 semanas parado. Pauta de continuação em [[Fechamento 2026-08-21 + pauta]].

**Entregue:** 4 críticos da auditoria + 3 bugs novos da revisão de código + reconciliação do harness (51 commits parados, nunca testados → 128/128 na 1ª execução) + fluxo `Atendimento NetGo — v2` (validador 0/0) + Coolify migrado da branch para o `main`. Suíte: **21 → 148 testes**.

**Dois erros meus nesta sessão, registrados para não repetir:**
1. Concluí que o sistema "nunca tinha rodado" a partir do estado da máquina local (sem Docker/Postgres/.env). Ele estava em produção o tempo todo. **Estado da máquina de dev não é evidência sobre produção.**
2. Afirmei que a correção do `JWT_SECRET` era "sem risco de downtime" sem ter lido o Dockerfile, que fixa `NODE_ENV=production` — exatamente o caso que dispara a falha dura. **Verificar a config de deploy antes de afirmar consequência de deploy.**

**O que a sessão ensinou sobre o produto:** o harness pega problema de *grafo*, não de *configuração*. O `max_turnos: 12` que encerrou o atendimento comercial no meio passou por validador e simulador sem alarme — só o chat de conversa real pegou. Validador e simulador são rede ampla; conversa real continua insubstituível.

**Aberto e importante:** as migrations 008/009 nunca foram confirmadas rodando (a 008 apaga linhas) — ler o log de boot do Coolify é o item 1 da pauta.

## [2026-08-21 · whatsapp oficial] WORK | Vulnerabilidade viva corrigida + registry de canais (Fase 1)

Pedido: adicionar a **API Oficial do WhatsApp** (Meta Cloud API) como canal. Design em `docs/superpowers/specs/2026-08-21-whatsapp-api-oficial-design.md`; estado e pendências em [[WhatsApp API Oficial — estado e pendências]].

### O achado que interrompeu a feature

Três agentes revisaram a spec (arquitetura contra o código, segurança, e verificação da doc da Meta). A revisão de segurança apontou, e **confirmei sondando a produção**, uma vulnerabilidade **viva**:

`GET /api/webhooks/meta` comparava `token === process.env.META_VERIFY_TOKEN`. A env não está definida em produção, então ambos os lados eram `undefined` e a comparação **passava sem token nenhum**. Com `res.send(challenge)` respondendo `text/html`, a rota pública virou refletor de HTML na origem do painel. Enviei `<b>negrito</b>` e voltou 200 com o markup intacto.

A cadeia não parava no XSS: CSP desligada + JWT de 30 dias em `localStorage` + `GET /api/sysconfig` devolvendo todas as credenciais em texto plano = roubo de sessão de admin e vazamento de SGP/Anthropic/Evolution.

Corrigido em `f8ed98f`: `verificarHandshake` **fail-closed**, comparação em tempo constante, `text/plain`. Junto, fechada a leitura irrestrita do `sistema_kv` em `GET /api/sysconfig/:chave` (a allowlist só valia para o `PUT` e o GET agregado).

### Fase 1 — registry de canais

O `switch` de despacho (67 linhas) saiu do `motorFluxo.enviarResposta` para `services/canais/`. Detalhe em [[Canais e Webhooks]] → "Envio: registry de adapters". **30 testes de caracterização escritos ANTES da extração.**

Duas decisões que vieram das revisões e mudaram o desenho original:
- **Degradação por adapter, não genérica** — o Telegram degrada `lista`→**botões** com ≤8 itens. Um `renderizarComoTexto` central não expressaria isso.
- **Sem fallback genérico para texto** — a Evolution não tem `padrao` de propósito: hoje ela descarta `localizacao` em silêncio, e um fallback faria ela passar a enviar. Seria mudança observável escondida num refactor.

Também descartei duas coisas que eu havia escrito na spec: "o agente ganha envio de mídia" (o botão de anexo do painel **não tem `onClick`** — falta o upload inteiro) e mexer no `chat.js` (só envia texto e não tem `else`; migra na Fase 2).

### Erro meu, registrado

A primeira versão da spec **se contradizia**: dizia "refactor inobservável" e, duas linhas acima, "o agente ganha envio de mídia". Ganhar comportamento é observável. Só apareceu porque um revisor leu as duas afirmações juntas — eu não tinha relido o próprio documento como um todo.

### Descoberta de infraestrutura

**O deploy automático do Coolify não está funcionando.** O webhook do GitHub está ativo e as três entregas de hoje voltaram **200 OK** — o Coolify recebe e não deploya. É configuração do lado dele. Consequência: **pushar não é deployar neste projeto**; confirmar sempre com sonda antes de dar algo como entregue.

A correção de segurança está no `origin/main` e **ainda não subiu**. Mitigação sem deploy: definir `META_VERIFY_TOKEN` no ambiente — com um valor real, a comparação que hoje passa deixa de passar.

### Decisão de entrega

Separei os lotes: `main` fica só com a correção de segurança, e a Fase 1 espera na branch `feat/canais-registry`. Misturar os dois faria o rollback do refactor levar a correção de segurança junto.

Suíte: 155 → **185 testes**.

## [2026-08-21 · plano de evolução] WORK | FASE 0 — reconciliação e linha de base

Entrou o **Plano Mestre de Evolução V1.0** (`docs/ers/`, 2579 linhas, 26 partes, 13 fases) somado à **ERS AS-IS** (1038 linhas). Os dois estavam só no disco; agora versionados. O plano manda executar **uma fase por vez** — começamos pela FASE 0.

Antes de qualquer código, o merge de `feat/canais-registry` no `main` fechou o lote pendente da Fase 1 do WhatsApp Oficial. Trabalho em `chore/fase-0-baseline`.

### O bloqueio real era o ambiente

A documentação toda assume `docker-compose`. **Não há Docker nesta máquina** — nem Colima, nem Podman. É por isso que os itens de banco da ERS §8.2 seguiam como aposta havia meses: ninguém tinha como rodá-los. Resolvido com Postgres 16 nativo via Homebrew, mesmas credenciais do compose.

### Duas apostas viraram fato

- **Deduplicação de webhook** (migration 008 + `onConflict`) — 6 testes, incluindo o caso **concorrente**, que é o TOCTOU original. Verificado com dentes: derrubado o índice único, os 6 falham.
- **Redis pub/sub** (`ioredis`) — 3 testes com duas instâncias reais do módulo (query-string no import ESM). Broadcast cruzando, destinatário respeitado, sem eco duplo. Com Redis morto, as travessias falham.

Contrato do diretório novo: sem `DATABASE_URL_TEST`/`REDIS_URL_TEST` os testes se **pulam**. `npm test` segue 185/185 em qualquer máquina.

### O que a fase descobriu

**`001` e `002` não sobrevivem a replay.** Testadas uma a uma: 10 das 12 sobrevivem, essas duas não. Usam `createTableIfNotExists`, deprecado no knex, que emite o `CREATE TABLE IF NOT EXISTS` e depois dispara `ADD CONSTRAINT`/`CREATE INDEX` incondicionalmente. Contradiz o "escreva idempotente" do CLAUDE.md. Não é risco vivo — vira risco se alguém renomear os arquivos.

**`onConflict` e a 008 são acoplados.** Sem o índice, o Postgres recusa *todo* insert de mensagem, não só duplicata. Isso responde à pauta por outro caminho: uma instância que armazena mensagens **prova por comportamento** que a 008 aplicou — não é mais preciso ler o log do Coolify. Em troca, fica o alerta de que o `down()` da 008 derruba a ingestão inteira.

### Erro meu, registrado

Montei o teste de replay por migration com `$PSQL` numa variável — **o zsh não faz word-splitting**, então todos os comandos de setup falharam em silêncio (eu tinha redirecionado para `/dev/null`) e a tabela saiu com 12 ✅ falsos. Só percebi porque o resultado contradizia um teste anterior meu. Refeito com função de shell. Lição: quando um resultado novo contradiz um resultado antigo, o suspeito é o instrumento, não o achado.

### Segurança

Os logs de PII eram **6**, não os 3 que o CLAUDE.md listava. O pior não estava na lista: `[SGP] consultacliente` imprimia o **CPF completo** a cada consulta — caminho quente, não debug esquecido. Em cada sítio saiu o dado e ficou o diagnóstico.

Sondada a produção: o XSS do handshake da Meta corrigido em `f8ed98f` **continua vivo** — `text/html` refletindo o challenge. O Coolify segue sem deployar.

Detalhe em [[FASE 0 — Reconciliação e linha de base]].

## [2026-08-21 · pontos soltos] WORK | Migrations idempotentes + o diagnóstico do deploy revisto

Fechamento dos dois itens que a FASE 0 deixou abertos.

### `001` e `002` corrigidas

Teste escrito primeiro (`migrations-replay.test.js`), reproduziu as duas falhas, e só então a correção: helper local `criarTabela()` com guarda `hasTable`, no lugar do `createTableIfNotExists` deprecado.

O que dá confiança aqui não é o teste de replay passar — é a **segunda** verificação: criei um banco do zero com o código antigo e outro com o novo, e comparei `pg_dump -s`. **Idênticos**, 414 linhas. Numa mudança de migration, provar que o replay parou de estourar sem provar que o schema do zero não mudou seria meia verificação.

Efeito colateral encontrado no caminho: dois arquivos de teste aplicando migrations no mesmo banco em paralelo fazem dois processos criarem `_migrations` ao mesmo tempo e o schema sai pela metade. Script passou a usar `--test-concurrency=1`.

Integração: 9 → **22 testes**. Suíte pura: 185.

### O diagnóstico do deploy estava errado

Estava registrado que *"o Coolify recebe 200 e nunca deploya"*. Investigado com `gh` (autenticado como Chrisw16), a linha do tempo de hoje desmente:

- 19:20 entrega #1 → **virou deploy** (`index.html` de produção reconstruído às 20:06 UTC)
- 19:55 entrega #2, que levava a correção do XSS → **se perdeu**
- 22:54 entrega #3 → se perdeu

O deploy é **intermitente**, não morto. Pior que a tese anterior, porque parece funcionar.

A razão de ninguém ter visto: o webhook é do tipo **`manual`** do Coolify, que **responde 200 mesmo quando recusa**, com o motivo no *corpo*. Todo mundo leu o status e ninguém leu o corpo. Fica a lição: **num webhook, 200 não é confirmação de nada** — é preciso ler a resposta ou sondar o efeito.

Descoberto junto: o webhook é `http://` puro, IP cru, `insecure_ssl=1` e **sem secret**. O payload do push trafega em claro.

Ficaram duas leituras que exigem acesso humano (corpo das entregas #2/#3 e o log da aba Deployments), mas três correções valem independente da causa: pôr secret + HTTPS no webhook, definir `META_VERIFY_TOKEN` (fecha o XSS **sem** depender de deploy) e um deploy manual para subir o `f8ed98f`.

Registrada também a sonda certa: `/health` devolve `2.0.0` **fixo** e é inútil para saber o que está no ar. O carimbo é o **`last-modified` de `GET /`**.

Detalhe em [[FASE 0 — Reconciliação e linha de base]].
