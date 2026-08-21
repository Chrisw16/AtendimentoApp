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
