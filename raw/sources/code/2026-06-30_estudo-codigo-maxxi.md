# Estudo de código — Maxxi v2 / GoCHAT (2026-06-30)

Source imutável: registro do estudo linha-por-linha do código do Maxxi v2 (clonado de github.com/Chrisw16/AtendimentoApp, último commit `db6c997 feat: gerenciador de planos`). Backend lido de perto; frontend e rotas periféricas estudados por 3 agentes paralelos (transcrições completas nos arquivos de task da sessão). ~19.000 LOC: `apps/api` (Express/Knex/Postgres) + `apps/web` (React 19/Vite).

## Arquitetura macro

- **Monorepo** `apps/api` + `apps/web`. ESM (`"type":"module"`) no backend.
- **Produção (Coolify):** Dockerfile raiz multi-stage → builda `apps/web` e copia `dist` para `apps/api/apps/web/dist`; a API serve o frontend estático e a API no **mesmo container** (porta 4000). `server.js` serve `dist` se existir (SPA fallback para `index.html`).
- **Dev:** `docker-compose.yml` sobe postgres 16 + redis 7 + api (`npm run dev`, watch) + web (vite `--host`, porta 3000, proxy `/api`→4000).
- **Credenciais de integração ficam no banco (`sistema_kv`), não em env.** Só infra vem de env: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `META_VERIFY_TOKEN`, `ERP_URL`/`ERP_API_KEY`. SGP/Evolution/Anthropic/OpenAI/Telegram são configurados pela tela admin e gravados em `sistema_kv`. O `.env.example` lista muitas vars (IMAP/SMTP/ASTERISK/VAPID/META_ACCESS_TOKEN) que **o código não usa** — são aspiracionais.

## Ciclo de vida da mensagem (caminho crítico)

1. Webhook recebe (`POST /api/webhooks/{evolution|meta|telegram}`) — rotas públicas.
2. Handler (`services/webhooks/*.js`): dedup por `external_id` → acha/cria `conversa` (`porTelefoneCanal`, ignora encerradas) → cria `mensagem` (origem `cliente`) → `incrementarNaoLidas` → `broadcast` SSE (`mensagem`, `conversa_atualizada`, `nova_conversa`).
3. Se `conversa.status === 'ia'` → `import('motorFluxo.js').processarConversa(conversa, mensagem)`.
4. Se `conversa.status === 'ativa'` e tem `agente_id` → `supervisoraIA.processarMensagemCliente` (sentimento).
5. `motorFluxo` roda o fluxo ativo (grafo do editor) ou cai em IA direta; gera `respostas[]`; `enviarResposta` persiste + broadcast + envia ao canal (Evolution para WhatsApp, telegram.js para Telegram).
- Evolution salva `canal_instancia` no body (essencial para responder de volta). Meta gera URLs de mídia `/api/media/:id` **mas não há rota `/api/media` montada** (gap — mídia oficial não carrega).

## motorFluxo.js (1032 LOC) — interpretador de grafo

- `estadosExecucao = Map<conversa_id, estado>` **em memória** (perde no restart). Estado: `{noAtual, contexto:{cliente}, historico, aguardando}`.
- `processarConversa`: busca `fluxos.where({ativo:true}).first()`; `parseDados` (suporta `dados:{nodes,edges}` novo e `nos`/`conexoes` legado; normaliza `tipo`/`config`); loop **máx 15 iterações/mensagem**; cada nó retorna `avancar(saida)` | `aguardar_input` | `fim`. `encontrarProximo` resolve aresta por `(from|source)` + `(port|sourceHandle)` → `(to|target)`.
- ~30 tipos de nó em 7 categorias: gatilhos (inicio, gatilho_keyword); mensagens (enviar_texto/cta/imagem/audio/arquivo/localizacao/botoes/lista, solicitar_localizacao); lógica (aguardar_resposta, condicao, condicao_multipla, definir_variavel, divisao_ab, aguardar_tempo); SGP (consultar_cliente, consultar_boleto, verificar_status, abrir_chamado, promessa_pagamento, listar_planos, consultar_historico); IA (ia_responde, ia_roteador); ações (transferir_agente, chamada_http, nota_interna, enviar_email[TODO], nps_inline, encerrar); stubs avançados (mudanca_endereco, mudar_plano, cadastrar_lead, cadastrar_condominio, registrar_ocorrencia_cond).
- `interpolar` resolve `{{cliente.x}}`, `{{boleto.x}}`, `{{chamado.x}}`, `{{promessa.x}}`, `{{planos.x}}`, `{{var}}`.
- `aguardar_tempo` apenas loga e avança (não há scheduler real).

## IA com tool calling

- `processarIAResponde` (nó `ia_responde`): carrega prompt via `resolverPrompt(slug)`; compõe system com contexto do cliente + regras de tool; **loop agêntico máx 5 rounds** (`ai.messages.create` com `tools`; trata `stop_reason` `end_turn`/`tool_use`); histórico por nó (últimos 20); `max_turnos` default 6. Tools default = lista de suporte; `precadastrar_cliente` fica de fora (sensível) salvo `cfg.tools_ativas`. Sentinelas `__TRANSFERIR__`/`__ENCERRAR__` retornadas por tools roteiam o fluxo.
- `processarIARoteador` (nó `ia_roteador`): classificador de intenção; detecta despedida por regex antes (economiza API); Claude responde `<rota>id</rota>`; valida contra `idsValidos`.
- `processarIADireta`: fallback sem fluxo ativo; usa prompt `outros` + últimas 8 mensagens.
- `iaTools.js`: **15 tools** Anthropic (`verificar_conexao`, `consultar_manutencao`, `criar_chamado`, `segunda_via_boleto`, `promessa_pagamento`, `historico_ocorrencias`, `status_rede`, `consultar_onu_acs`[stub ACS], `reiniciar_onu_acs`[stub ACS], `consultar_radius`, `listar_planos_ativos`[lê tabela `planos`], `listar_vencimentos`, `precadastrar_cliente`, `transferir_para_humano`, `encerrar_atendimento`). `executarTool` despacha cada uma; prioriza `input.contrato`, fallback `ctx.cliente.contrato`.
- `promptService.resolverPrompt(slug, clienteCtx)`: carrega `prompts_ia` slug + `regras` + `estilo` + planos + tipos em paralelo; substitui `[REGRAS]/[ESTILO]/[PLANOS]/[TIPOS_OCORRENCIA]`; injeta contexto cliente. Cache 3 min. Default modelo `claude-haiku-4-5-20251001`, temp 0.3.
- Prompts seed (migration 005): 8 slugs `regras/estilo/roteador/financeiro/suporte/comercial/faq/outros` — **fortemente NetGo (Natal/RN, fibra)**, com passos rígidos por setor.

## integrations.js (609 LOC) — SGP + Evolution

- Config SGP de `sistema_kv` (`sgp_url`, `sgp_app`, `sgp_token`), cache 5 min. SGP usa `x-www-form-urlencoded` com `app`+`token` em todo request (`sgpPost`/`sgpPostJSON`/`sgpGet`).
- Funções SGP: `consultarClientes` (`/api/ura/consultacliente/`, normaliza status 1-7, ordena contratos), `segundaViaBoleto` (`/api/ura/fatura2via/`, único/múltiplos), `promessaPagamento` (`/api/ura/liberacaopromessa/`, +3 dias), `criarChamado` (`/api/ura/chamado/`; tipos 5/200/13/23/22/3/14), `verificarConexao` (`/api/ura/verificaacesso/`), `historicoOcorrencias` (`/api/ura/ocorrencia/list/`), `listarPlanos` (`/api/ura/planos/`), `consultarManutencao` (`/api/ura/manutencao/list`), `statusRede` (proxy de manutenção), `consultarRadius` (`/ws/radius/radacct/list/all/`, PPPoE), `listarVencimentos` (`/api/precadastro/vencimento/list`), `precadastrarCliente` (`/api/precadastro/F`, cadastro PF completo).
- ACS (`consultarOnuAcs`, `reiniciarOnuAcs`) = stubs informativos (TR-069 não configurado).
- `getAnthropicClient()` lê `anthropic_api_key` do KV.
- Evolution: `evolutionRequest` (config KV `evolution_url`/`evolution_key`, header `apikey`); senders texto/botoes/lista/cta/imagem/audio/arquivo (`/message/send*`).
- **Acoplamento NetGo hardcoded** em `precadastrarCliente` e na tool `precadastrar_cliente`: IDs de plano (Essencial=12/30, Avançado=13/29, Premium=16/28), POP (Natal/Macaíba=1, S.M.Gostoso=3, S.Gonçalo=4), portador (16/18), senha default `'123456'`, uf=RN.

## Supervisora IA (283 LOC)

- Sentimento instantâneo por palavras-chave (`PALAVRAS_FRUSTRACAO`, `PALAVRAS_ESCALADA`) + CAPS/`!!`. Níveis: positivo/neutro/atencao/frustrado/critico.
- `processarMensagemCliente`: salva `sentimento`, alerta agente+supervisor (SSE) em frustrado/crítico, gera sugestão de resposta via Claude Haiku.
- `verificarDemoraAgente`: SLA — alerta em 5 min (atenção) e 15 min (crítica) sem resposta do agente.
- `analisarConversaEncerrada`: ao encerrar, Claude classifica `<sentimento>/<topico>/<resumo>` (XML) e grava em `conversas` — **mas o `encerrar` da rota de chat NÃO chama esta função** (só seria via nó `encerrar`? a verificar — possível gap).
- Monitor a cada 2 min (`iniciarMonitorSupervisora`, disparado no startup).

## Fila & SLA (filaService.js)

- `calcularUrgencia` (níveis ia/ok/atencao/critico por minutos+prioridade; crítico ≥15min ou prioridade≥2). `detectarPalavrasCriticas`. `getPosicaoNaFila`/`getTotalNaFila`/`getTempoMedioEspera`.
- `iniciarMonitorSLA` (a cada 60s): broadcast `sla_critico` (fila crítica) e `agente_fantasma` (assumiu mas sem `primeira_msg_agente_em` em 5min); dedup por `Set` com TTL.

## Realtime SSE (sseManager.js)

- `localClients: Map<agenteId, Set<res>>`; `addClient`/`removeClient`/`broadcast`(todos)/`sendToAgente`(direcionado).
- Redis pub/sub **opcional** (canal `maxxi:sse`) para multi-processo — **BUG:** `import('redis')` (node-redis) mas `package.json` declara `ioredis`; provável falha de import → sempre modo local (broadcast não cruza processos/instâncias).
- Rota SSE em `chat.js` (`GET /api/chat/sse`): aceita token via query; ping a cada 25s; cleanup no `close`.

## Auth & segurança

- `auth.js`: JWT `Bearer` ou `?token=` (SSE). **`JWT_SECRET` default hardcoded** `'maxxi-dev-secret-change-in-prod'`. Token expira em **30 dias** (README diz 7 — divergência). `adminMiddleware` checa `role==='admin'`.
- `auth.js` rota: login (bcrypt compare, marca online), me, logout, refresh. **Sem rate-limit específico de login** (só global 200/min em `server.js`).
- bcrypt nas senhas; `CAMPOS_PUBLICOS` em agentes oculta hash.

## Achados de segurança e bugs (consolidado)

- **CRÍTICO** `sysconfig.js`: `GET /api/sysconfig` e `/:chave` retornam `anthropic_api_key`, `openai_api_key`, `sgp_token`, `evolution_key`, `telegram_bot_token` **em texto plano** (sem mascaramento; restrito a admin).
- **CRÍTICO** credenciais em `sistema_kv` em plaintext (sem criptografia em repouso).
- **ALTO** `JWT_SECRET` default hardcoded se env ausente.
- **MÉDIO** mass-assignment `{...req.body}` em PUT de `ocorrencias`/`ordens`/`tarefas`.
- **MÉDIO** `tarefas` PUT/DELETE sem checagem de ownership (row-level só no GET).
- **BAIXO** SQL interpolado em `dashboard.js` (`INTERVAL '${days}'`, `${table}`) — atenuado por whitelist; LIKE sem escape de wildcard em `clientes.js`; race condition em número de OS (`ordens`) e protocolo de conversa (`conversaRepository`).
- **Bugs funcionais:** `sseManager` import `redis` vs `ioredis`; `evolutionEnviarLista` espera `labelBotao/tituloSecao` (camelCase) mas o motor envia `label_botao/titulo_secao` (rótulos perdidos); `ocorrencias POST /:id/notas` cria nota órfã; `monitor /ping` faz DDL em runtime e `alertas_rede` nunca é criada; Meta media `/api/media/:id` sem rota.
- **Frontend:** `Clientes.jsx` `useDebounce` usa `useState` no lugar de `useEffect` (busca não dispara) + `process.env` em vez de `import.meta.env`; `Tarefas.jsx` e `Financeiro.jsx` implementadas mas **sem rota** em App.jsx; `Cobertura.jsx` só lê/deleta zonas (sem ferramenta de desenho); `Topbar` lê `n.lida` mas store cria `read` (badge sempre 0); `FlowNode` linha 209 string literal não interpolada; fonte `DM Sans` usada inline mas não importada.
- **Resíduos do "CITmax"** (provedor do sistema de inspiração): tool `status_rede` ("rede CITmax"), `seed.js` resposta rápida `citmax.com.br/cliente`. Fluxo padrão do seed usa tipos legados (`mensagem`/`menu`, arestas `{origem,destino}`) que **não casam** com o motor atual — não-funcional; fluxos reais vêm do editor.

## Modelo de dados (7 migrations)

Tabelas: `sistema_kv`, `agentes`, `canais`, `conversas`, `mensagens`, `notas`, `respostas_rapidas`, `fluxos`, `agendamentos`, `tarefas`, `avaliacoes` (NPS 1-5), `ocorrencias`, `auditoria`, `zonas_cobertura`, `equipamentos_rede`, `alertas_rede`, `ordens_servico`, `consultas_cobertura`, `satisfacao` (NPS 0-10), `prompts_ia`, `planos`. **Zero `company_id`** (single-tenant). Runner próprio (`_migrations`, transacional, ordenado por nome).

## Frontend (React 19 + Vite)

- Estado: TanStack Query (server state) + Zustand (`maxxi-store` persistido: auth/token/role/permissoes; e `chat` não-persistido: conversas/mensagens/modo). `api.js` injeta JWT, auto-refresh em 401. SSE via `createSSE` (token na query).
- 21 páginas; núcleo de atendimento completo (Login, Chat[SSE], Dashboard, Agentes, Fluxos, FluxoEditor[xyflow, ~32 nós, import/export, Ctrl+S], Historico, MonitorRede, Configuracoes, PromptsIA, Canais, Ocorrencias, OrdensServico, Satisfacao); periféricos parciais/stub.
- **Design system = tema LIGHT** (branco predominante, navy `#2050B8` + laranja `#E8572A`; fontes Plus Jakarta Sans / JetBrains Mono / Syne). README/handoff descrevem tema escuro `#00E5A0` antigo — DESATUALIZADO. `#00E5A0` sobra só nas cores de nó do editor. Sidebar e editor de fluxo são superfícies escuras (tema misto).
