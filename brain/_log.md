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
