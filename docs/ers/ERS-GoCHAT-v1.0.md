# ERS — Especificação de Requisitos de Software
## Maxxi v2 / GoCHAT — Plataforma de Atendimento Omnichannel com IA para ISP

| | |
|---|---|
| **Versão** | 1.1 |
| **Data** | 2026-08-26 |
| **Estado do documento** | Linha de base inicial + averbação de remoções (Apêndice D) |
| **Sistema** | Maxxi v2 (marca comercial **GoCHAT**) |
| **Versão do sistema** | 2.0.0 (`/health`) · commit base `32a558c` |
| **Repositório** | `github.com/Chrisw16/AtendimentoApp` |
| **Instância de produção** | `https://gochat.netgo.net.br` (NetGo Internet — Natal/RN) |
| **Natureza** | Documento **as-is** (engenharia reversa a partir do código-fonte) |

---

## 1. Introdução

### 1.1 Propósito

Este documento especifica os requisitos de software do **Maxxi v2 / GoCHAT** tal como o sistema **existe hoje**, em 21 de agosto de 2026. Ele serve como registro de engenharia: base para onboarding técnico, para decisões de evolução do produto e para o esforço de parametrização que a revenda a outros provedores vai exigir.

> **Nota terminológica.** *ERS* (Especificação de Requisitos de Software) é a tradução literal de *SRS* (Software Requirements Specification). São o mesmo artefato, e este documento atende às duas denominações. A estrutura segue a IEEE 830 modernizada com elementos da ISO/IEC/IEEE 29148:2018 — em particular, a Seção 2 absorve o conteúdo de nível de sistema (contexto operacional, interfaces externas, restrições de implantação) que a 29148 alocaria em um SyRS separado.

### 1.2 Natureza do documento: as-is, não to-be

Este é um documento **reconstruído a partir do código-fonte**. Ele descreve o sistema **como construído**, e não um conjunto de requisitos aprovados antes da construção. Isso tem três consequências práticas que o leitor deve manter em mente:

1. **Requisitos aqui são descritivos, não prescritivos.** Onde se lê "o sistema deve", entenda "o sistema, conforme implementado, faz". Divergências entre o comportamento implementado e a intenção de produto estão marcadas explicitamente.
2. **Comportamentos indesejados também são documentados.** Um requisito marcado ⚠ Divergente descreve o que o código faz, não o que deveria fazer. Isso é deliberado: a utilidade de uma ERS as-is está justamente em tornar visível a distância entre intenção e implementação.
3. **O nível de verificação varia.** Boa parte do sistema foi validada em execução real; outra parte foi verificada apenas por leitura estática. A distinção está registrada em cada caso e consolidada na Seção 8.

### 1.3 Escopo do produto

O GoCHAT é uma plataforma de **atendimento omnichannel com inteligência artificial para provedores de internet (ISP)**. O ciclo central do produto:

> Uma mensagem entra por um canal (WhatsApp via Evolution ou Meta Cloud API, ou Telegram) → vira uma **conversa** → um **motor de fluxo** interpreta um grafo de atendimento desenhado visualmente → a **IA (Claude, com tool calling)** resolve consultas reais no **SGP** (o ERP do provedor: boleto, conexão, chamado técnico, planos, pré-cadastro) → quando necessário, transfere para um **agente humano**, que atende por um painel web com chat em tempo real.

Está **dentro** do escopo: ingestão multicanal, execução de fluxos conversacionais, IA com acesso a ferramentas do ERP, atendimento humano com fila e SLA, supervisão assistida por IA, configuração completa por interface administrativa, ferramentas de teste de fluxo, e e um conjunto de módulos operacionais de ISP. ⛔ **Alterado em 2026-08-26:** ocorrências, ordens de serviço e monitor de rede **saíram do escopo** — o ERP desta operação é o SGP, e manter chamado nas duas bases sem conciliação criava duas verdades para o mesmo fato. Restam clientes (redefinido como histórico de contato) e cobertura. Ver `RF-OPS-002/004/007/008/011` e o Apêndice D.

Está **fora** do escopo desta versão: multi-tenancy row-level (a estratégia adotada é **uma instância isolada por provedor**), canais de e-mail/VoIP/SMS (presentes apenas como placeholders), e faturamento próprio (o financeiro é uma leitura do ERP).

### 1.4 Classes de requisitos e convenções de estado

Cada requisito recebe um identificador estável no formato `RF-<MÓDULO>-<NNN>` (funcionais) ou `RNF-<CATEGORIA>-<NNN>` (não funcionais), e um **estado de implementação**:

| Marca | Estado | Significado |
|:---:|---|---|
| ✅ | **Implementado** | Presente no código e coerente entre as camadas envolvidas. |
| ◐ | **Parcial** | Presente, mas incompleto — falta caminho de configuração, cobertura de casos ou uma dependência. |
| ⚠ | **Divergente** | Implementado de forma que contradiz a intenção aparente, ou inconsistente entre duas camadas que deveriam espelhar-se. |
| ✗ | **Não implementado** | Referenciado no código, na configuração ou na interface, mas sem implementação efetiva. |
| ⛔ | **Removido** | Existia na linha de base e foi **retirado do produto** depois dela. A linha **permanece**, com a data e o motivo. |

> **Sobre a marca ⛔.** Este é um documento *as-is* **datado**, e sua utilidade depende de ser rastreável: quem lê um commit, um log de produção ou um artigo antigo do brain precisa achar aqui o requisito que aquilo mencionava. Apagar a linha faria o requisito sumir sem deixar rastro — o leitor concluiria que nunca existiu, que é pior do que saber que existiu e por que saiu. Requisito removido, portanto, é **averbado**, não excluído. O que mudou desde a linha de base está consolidado no **Apêndice D**.

Um segundo eixo, **verificação**, aparece quando relevante: *validado em produção*, *validado em teste automatizado*, *verificado por leitura estática*.

### 1.5 Definições, acrônimos e abreviações

| Termo | Definição |
|---|---|
| **ISP** | *Internet Service Provider* — provedor de acesso à internet. O cliente-alvo do produto. |
| **SGP** | ERP de mercado usado por provedores brasileiros. É a fonte da verdade sobre clientes, contratos, faturas e chamados. |
| **URA** | Módulo do SGP historicamente voltado a atendimento automatizado; expõe a maior parte dos endpoints consumidos. |
| **Evolution API** | Gateway WhatsApp **não oficial** (baseado em Baileys). Cobertura de recursos maior e custo menor que a API oficial. |
| **Meta Cloud API** | API oficial do WhatsApp Business, operada pela Meta. |
| **Tool calling** | Capacidade do modelo de linguagem de invocar funções declaradas pelo sistema, recebendo o resultado e prosseguindo o raciocínio. |
| **Nó** | Unidade de execução do motor de fluxo; um passo do atendimento. Corresponde a um retângulo no editor visual. |
| **Porta** | Saída nomeada de um nó. Determina por qual aresta o fluxo prossegue. |
| **Estado de execução** | Posição corrente de uma conversa dentro do grafo, com o contexto acumulado. |
| **SSE** | *Server-Sent Events* — canal HTTP unidirecional servidor→cliente, usado para o tempo real do painel. |
| **NPS** | *Net Promoter Score* — métrica de satisfação. |
| **ONU** | *Optical Network Unit* — o equipamento de fibra na casa do assinante. |
| **PPPoE / RADIUS** | Protocolo de autenticação de banda larga e o servidor que o atende; fonte do estado de sessão do assinante. |
| **ACS** | *Auto Configuration Server* (TR-069) — gestão remota de CPE. |
| **CPE** | *Customer Premises Equipment* — equipamento na ponta do cliente. |
| **Sandbox** | Modo de execução do motor em que leituras são reais e escritas são simuladas. |
| **`sistema_kv`** | Tabela chave-valor que guarda a configuração e as credenciais de integração da instância. |

### 1.6 Referências

| Referência | Localização |
|---|---|
| Memória institucional do projeto (*brain*) | `brain/systems/maxxi/overview.md` |
| Guia operacional do repositório | `CLAUDE.md` |
| Decisão estratégica de base do produto | `brain/strategy/decisions/2026-06-30_adotar-maxxi-base.md` |
| Estudo completo da API do SGP (237 endpoints, 13 módulos) | `brain/domains/sgp-api/overview.md` |
| Auditoria profunda de código | `brain/work/bugs/2026-06-30_auditoria-profunda.md` |
| Auditoria SGP ↔ tools da IA | `brain/work/bugs/2026-07-02_auditoria-sgp-tools.md` |
| Design do canal WhatsApp API Oficial | `docs/superpowers/specs/2026-08-21-whatsapp-api-oficial-design.md` |
| Fluxo de referência validado | `apps/api/examples/fluxo-netgo-v2.json` |

---

## 2. Descrição geral

### 2.1 Perspectiva do produto

O GoCHAT é um **sistema novo, autocontido**, que se posiciona entre os canais de mensageria do provedor e o ERP que ele já opera. Não substitui o ERP: consome-o. Não substitui o WhatsApp: intermedia-o.

```
        CLIENTE FINAL                                    OPERAÇÃO DO PROVEDOR
             │                                                    │
    ┌────────┴────────┐                                 ┌──────────┴──────────┐
    │ WhatsApp        │                                 │  Painel web         │
    │ Telegram        │                                 │  (agente / admin)   │
    └────────┬────────┘                                 └──────────┬──────────┘
             │ webhook (público)                         REST + SSE │
             ▼                                                      ▼
    ╔═══════════════════════════════════════════════════════════════════════╗
    ║                        GoCHAT  (Node 20 + Express)                    ║
    ║                                                                       ║
    ║   Ingestão ──▶ Motor de Fluxo ──▶ IA (Claude + 16 tools) ──▶ Fila     ║
    ║       │              │                    │                   │       ║
    ║       └──────────────┴────────────────────┴───────────────────┘       ║
    ║                              PostgreSQL 16                            ║
    ╚═══════════════════════════════════════════════════════════════════════╝
             │                                    │
             ▼                                    ▼
    ┌─────────────────┐                  ┌──────────────────┐
    │ SGP (ERP)       │                  │ Anthropic Claude │
    │ API + banco RO  │                  │                  │
    └─────────────────┘                  └──────────────────┘
```

**Modelo de multi-tenancy: por instância.** O código é deliberadamente **single-tenant** — nenhuma tabela possui `company_id`. Cada provedor revendido recebe um deploy isolado, com seu próprio banco e sua própria configuração. O que viabiliza esse modelo é a decisão arquitetural de manter **as credenciais de integração no banco** (`sistema_kv`), configuráveis pela tela administrativa, e não em variáveis de ambiente.

### 2.2 Funções principais

| # | Função | Seção |
|---|---|---|
| F1 | Receber mensagens de WhatsApp e Telegram, deduplicar e materializar como conversas | 4.2 |
| F2 | Executar fluxos de atendimento desenhados visualmente (37 tipos de nó) | 4.3 |
| F3 | Conduzir a conversa por IA com acesso a 16 ferramentas reais do ERP | 4.4 |
| F4 | Consultar e gravar no SGP: cliente, boleto, conexão, chamado, promessa, planos, pré-cadastro | 4.5 |
| F5 | Transferir para agente humano com fila priorizada e monitoramento de SLA | 4.6 |
| F6 | Assistir o agente humano com análise de sentimento e sugestões de resposta | 4.7 |
| F7 | Entregar eventos ao painel em tempo real | 4.8 |
| F8 | Editar, validar, simular e compartilhar fluxos de atendimento | 4.9 |
| F9 | Editar os prompts da IA em tempo de execução | 4.10 |
| F10 | Configurar integrações, canais, planos e horário de atendimento pela interface | 4.11 |
| F11 | Apresentar métricas de atendimento, produtividade e NPS | 4.12 |
| F12 | Operar processos de ISP: clientes (histórico de contato) e cobertura. ⛔ *Ocorrências, ordens de serviço e rede removidos em 2026-08-26.* | 4.13 |

### 2.3 Classes de usuário

| Classe | Acesso | Características e frequência |
|---|---|---|
| **Cliente final** | Nenhum — interage exclusivamente pelo canal de mensageria | Não autenticado no sistema. É identificado por telefone e, opcionalmente, por CPF. Não sabe que o GoCHAT existe. Volume esperado: o maior de todos. |
| **Agente de atendimento** (`role: agente`) | Painel web, token JWT | Uso contínuo durante o expediente. Vê apenas as próprias conversas. Possui permissões granulares (`chat`, `historico`, `tarefas`, `financeiro`, `clientes`, `frota`, `ocorrencias`) — ver ⚠ `RNF-SEG-004`. |
| **Administrador** (`role: admin`) | Painel web completo | Configura fluxos, prompts, canais, credenciais, planos e agentes. Uso episódico e de alto impacto. Acesso a todas as conversas. |
| **Testador de fluxo anônimo** | Link público `/teste/<token>`, sem login | Convidado a exercitar um fluxo em modo sandbox. Token revogável por fluxo. |
| **Sistemas externos** | Webhooks públicos | Evolution, Meta e Telegram entregam eventos em `POST /api/webhooks/*`, sem autenticação (ver ⚠ `RNF-SEG-005`). |

### 2.4 Ambiente operacional

| Camada | Tecnologia | Versão |
|---|---|---|
| Runtime | Node.js, ESM (`"type":"module"`) | 20 |
| Framework HTTP | Express | ^4.19 |
| Banco | PostgreSQL | 16 |
| Acesso a dados | Knex (query builder) + `pg` | ^3.1 / ^8.12 |
| Cache / pub-sub | Redis via `ioredis` | 7 / ^5.3 |
| IA | Anthropic Claude (`@anthropic-ai/sdk`), modelo `claude-haiku-4-5-20251001` | ^0.27 |
| Frontend | React + Vite | 19 / ^5.2 |
| Roteamento FE | React Router | 6 |
| Estado FE | TanStack Query (servidor) + Zustand (sessão/chat) | ^5.28 / ^4.5 |
| Editor de grafo | `@xyflow/react` | ^12.3 |
| Autenticação | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) | ^9.0 / ^2.4 |
| Empacotamento | Docker multi-stage; orquestração Coolify | — |

**Topologia de produção:** um único container serve API e frontend na porta 4000. O `Dockerfile` raiz compila `apps/web` e copia o `dist` para dentro da imagem da API, que o serve como estático. Migrations rodam em background no boot; `/health` responde antes disso.

**Topologia de desenvolvimento:** `docker-compose` com quatro serviços — `postgres:5432`, `redis:6379`, `api:4000`, `web:3000` (Vite com proxy `/api`→4000).

### 2.5 Restrições de projeto e implementação

Estas restrições não são preferências: são propriedades vigentes do sistema que condicionam qualquer evolução.

| # | Restrição | Consequência |
|---|---|---|
| **RES-01** | **O estado de execução dos fluxos vive em memória do processo** (`Map` em `motorFluxo.js`). | Reinício do container faz toda conversa em andamento recomeçar. É a limitação estrutural nº 1. |
| **RES-02** | **Um processo por instância.** Decorre de RES-01 somado ao fato de o pub/sub Redis nunca ter sido validado em execução. | Não é possível escalar horizontalmente sem antes persistir o estado e comprovar o pub/sub. |
| **RES-03** | **Single-tenant absoluto** — zero `company_id` no schema. | Cada provedor exige um deploy e um banco próprios. |
| **RES-04** | **Credenciais de integração vivem no banco**, não em ambiente. | Habilita a configuração por tela (e portanto a revenda), mas concentra segredos em texto plano no banco (⚠ `RNF-SEG-001`). |
| **RES-05** | **`motorFluxo.js` não é importável em teste unitário** — importa `config/db.js`, que instancia Knex no topo do módulo. | Toda lógica testável precisa ser extraída para módulos puros ao lado. Isso moldou a arquitetura de testes (Seção 5.4). |
| **RES-06** | **Acoplamento à NetGo Internet** — IDs de POP, portador, NAS (`53`), UF e os oito prompts seed são específicos do provedor de origem. | Revenda exige parametrização prévia. A API do SGP já oferece os endpoints `list` necessários para de-hardcodar. |
| **RES-07** | **Migrations são rastreadas por nome de arquivo**, em runner próprio. | Renomear uma migration já aplicada faz com que ela rode de novo. Toda migration precisa ser idempotente. A sequência tem um vão proposital no `010`. |
| **RES-08** | **Não há agendador (scheduler).** | Nós e recursos que dependem de tempo futuro (`aguardar_tempo`, `timeout` de `aguardar_resposta`) não podem funcionar como especificados. |

### 2.6 Suposições e dependências

**Dependências externas críticas** — a indisponibilidade de qualquer uma degrada o produto:

- **SGP** (API HTTP + banco PostgreSQL 11 em leitura) — sem ele a IA não tem o que consultar e o atendimento vira encaminhamento manual.
- **Evolution API** ou **Meta Cloud API** — sem um dos dois não há WhatsApp, que é o canal dominante.
- **Anthropic API** — sem ela os nós de IA falham e o fluxo só opera na parte determinística (menus).
- **PostgreSQL 16** — indispensável.
- **Redis** — opcional na topologia atual de processo único.

**Suposições assumidas pelo desenho:**

1. O provedor opera o SGP e pode emitir credenciais de API (`app` + `token`) para o GoCHAT.
2. Existe um número de WhatsApp dedicado ao atendimento.
3. O volume cabe em um único processo Node (premissa hoje não testada sob carga — ver Seção 8.3).
4. Agentes humanos estão disponíveis dentro do horário configurado; fora dele, o fluxo tem tratamento próprio.
5. O cliente final se identifica por CPF quando a consulta exige dado de contrato.

### 2.7 Documentação de usuário

Não há manual de usuário final nem material de treinamento de agente. A documentação existente é **técnica e voltada ao desenvolvedor**: o `CLAUDE.md` (guia operacional) e o diretório `brain/` (memória institucional, ~30 documentos organizados por sistema, componente, domínio e decisão). Isso é uma lacuna conhecida para o cenário de revenda — ver `RNF-USA-003`.

---

## 3. Interfaces externas

### 3.1 Interface de usuário

Painel web em React, responsivo a desktop, organizado em **quatro grupos de menu** e **21 páginas**:

| Grupo | Telas |
|---|---|
| **Atendimento** | Chat · Histórico · Satisfação |
| **Configuração** | Dashboard · Agentes · Fluxos (+ Editor) · Canais · Analytics · Prompts IA · Configurações |
| **Operações** | Clientes · Cobertura — ⛔ *Ocorrências e Ordens de Serviço removidas em 2026-08-26* |
| ~~**Infraestrutura**~~ | ⛔ *Grupo extinto em 2026-08-26: com o Monitor de Rede removido, restava só Saúde do Sistema, que passou a **Configuração**.* |
| **Sem rota** | Tarefas · Financeiro (implementadas, inacessíveis — ⚠ `RF-OPS-010`) |
| **Stubs vazios** | Analytics · Dispositivos · E-mail · VoIP · Frota |

**Guardas de rota:** `PrivateRoute` exige token válido; `AdminRoute` exige `role === 'admin'`; `SmartRedirect` encaminha admin para `/dashboard` e demais para `/chat`. A rota `/teste/:token` fica deliberadamente fora do `PrivateRoute`.

**Design system:** tema light — branco predominante, acentos navy `#2050B8` e laranja `#E8572A`; barra lateral escura `#0F1828` por contraste. Tipografia Plus Jakarta Sans (corpo), JetBrains Mono (código), Syne (display). Tokens centralizados em `apps/web/src/styles/tokens.css`.

### 3.2 Interfaces de hardware

Não aplicável. O sistema não interage diretamente com hardware. O diagnóstico de ONU e o estado de sessão PPPoE chegam **mediados** pelo SGP (API e banco), nunca por acesso direto a equipamento.

### 3.3 Interfaces de software

| Sistema externo | Protocolo | Autenticação | Uso | Timeout |
|---|---|---|---|---|
| **SGP — API URA/pré-cadastro** | HTTP POST `form-urlencoded`, POST JSON, GET | `app` + `token` em **todo** request | 11 operações de negócio (Seção 4.5) | 10–12 s |
| **SGP — banco PostgreSQL 11** | TCP, pool `pg` dedicado, **somente leitura** | usuário/senha em `sistema_kv` (`sgpdb_*`) | Diagnóstico óptico da ONU (sinal Rx, status, uptime) — dado que a API não expõe | — |
| **Evolution API** | HTTP REST, header `apikey` | chave em `sistema_kv` | Envio WhatsApp: texto, botões, lista, CTA, imagem, áudio, arquivo | 8 s |
| **Meta Cloud API** | HTTP REST + webhook | `META_VERIFY_TOKEN` (verificação), token de acesso | WhatsApp oficial: recepção de mensagens e status | — |
| **Telegram Bot API** | HTTP REST + webhook | `bot_token` (`canais.config` ou `sistema_kv`) | Recepção e envio, botões inline, `parse_mode: Markdown` | — |
| **Anthropic API** | HTTPS, SDK oficial | `anthropic_api_key` em `sistema_kv` | Conversação com tool calling, roteamento de intenção, análise de sentimento | — |
| **Nominatim / OpenStreetMap** | HTTP GET | Nenhuma | Geocodificação na tela de Cobertura | — |
| **ERP genérico** (`ERP_URL`) | HTTP | `ERP_API_KEY` | Módulo Financeiro — ◐ parcial | — |

**Compatibilidade defensiva com o SGP.** A camada de integração tolera variações entre versões do ERP: o número de protocolo é extraído tentando cinco nomes de campo distintos, listas aceitam `raw.planos` ou `raw.data`, o CPF é tentado em dois formatos. Isso é intencional — o SGP varia entre instalações.

### 3.4 Interfaces de comunicação

| Interface | Descrição |
|---|---|
| **REST/JSON** | 95 endpoints em 19 routers, sob `/api/*`, na linha de base. Corpo limitado a 10 MB. ⛔ *Em 2026-08-26 saíram os routers `ocorrencias` e `ordens` (12 endpoints) e duas rotas de `monitor`; `clientes` passou de 3 endpoints para 2.* |
| **SSE** | `GET /api/chat/sse` — canal servidor→painel. Autenticado por token na *query string*, porque `EventSource` não envia cabeçalhos. Ping a cada 25 s; o cliente reconecta em 3 s. |
| **Webhooks de entrada** | `POST /api/webhooks/{evolution,meta,telegram}` — públicos. `GET /api/webhooks/meta` responde ao desafio de verificação da Meta. |
| **Redis pub/sub** | Canal `maxxi:sse`, para propagar broadcast entre processos. Implementado sobre `ioredis`; **conexão real ainda não validada** (Seção 8.2). |
| **HTTP estático** | Em produção, a própria API serve o bundle do frontend. |
| **CORS** | Origem em `CORS_ORIGIN`; permissivo (`true`) quando ausente. |

---

## 4. Requisitos funcionais

### 4.1 `RF-AUT` — Autenticação e autorização

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-AUT-001` | O sistema autentica agentes por **login e senha**, comparando a senha com hash **bcrypt** armazenado em `agentes.senha_hash`. | ✅ |
| `RF-AUT-002` | Autenticação bem-sucedida emite um **JWT com validade de 30 dias** e marca o agente como `online`. | ✅ |
| `RF-AUT-003` | O token é aceito em `Authorization: Bearer <jwt>` ou, para o canal SSE, em `?token=` na query string. | ✅ |
| `RF-AUT-004` | O segredo de assinatura vem de `JWT_SECRET`. Em `NODE_ENV=production` sem a variável, **o boot falha**; fora de produção, um segredo aleatório é gerado a cada boot. Não existe segredo fixo no código. | ✅ |
| `RF-AUT-005` | Rotas administrativas exigem `role === 'admin'` (`adminMiddleware`). | ✅ |
| `RF-AUT-006` | Agentes não administradores enxergam apenas as conversas atribuídas a si. | ✅ |
| `RF-AUT-007` | O sistema oferece `GET /auth/me`, `GET /auth/refresh` e `POST /auth/logout`. O cliente HTTP do frontend **renova o token automaticamente em resposta 401** e repete a requisição original. | ✅ |
| `RF-AUT-008` | Agentes possuem permissões granulares em `agentes.permissoes` (jsonb): `chat`, `historico`, `tarefas`, `financeiro`, `clientes`, `frota`, `ocorrencias`. | ◐ |
| `RF-AUT-009` | As permissões granulares governam a **interface**, via `hasPerm`, mas **não são verificadas no roteamento do backend** — rotas não administrativas checam apenas a validade do token. | ⚠ |
| `RF-AUT-010` | `tarefas` é o único recurso com filtro *row-level* por agente — e apenas no `GET`. `PUT` e `DELETE` não verificam propriedade. | ⚠ |
| `RF-AUT-011` | O seed cria `admin/admin123` e `agente01/agente123`. Credenciais previsíveis, sem troca obrigatória no primeiro acesso. | ⚠ |

### 4.2 `RF-CAN` — Ingestão de mensagens e canais

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-CAN-001` | O sistema recebe mensagens por três canais reais: **Evolution** (WhatsApp não oficial), **Meta Cloud API** (WhatsApp oficial) e **Telegram**. | ✅ |
| `RF-CAN-002` | Cada handler extrai telefone/`chatId`, nome, conteúdo (texto, tipo, URL, MIME) e o identificador externo da mensagem. | ✅ |
| `RF-CAN-003` | Mensagens são **deduplicadas por `external_id`** antes de qualquer processamento, tornando o webhook idempotente sob reentrega. | ◐ |
| `RF-CAN-004` | A conversa é localizada por telefone + canal, **ignorando conversas encerradas** — uma mensagem após o encerramento abre conversa nova. Não havendo, cria-se uma, e o painel recebe `nova_conversa`. | ✅ |
| `RF-CAN-005` | A mensagem é persistida com `origem = 'cliente'`, o contador de não lidas é incrementado e os eventos `mensagem` e `conversa_atualizada` são difundidos. | ✅ |
| `RF-CAN-006` | Conversa em `status = 'ia'` é encaminhada ao motor de fluxo; conversa em `status = 'ativa'` com agente é encaminhada à Supervisora IA. | ✅ |
| `RF-CAN-007` | O handler Evolution trata `messages.upsert`, `messages.update` (confirmação de leitura) e `connection.update`; ignora mensagens próprias (`fromMe`). Extrai texto simples, texto estendido, imagem, áudio/PTT, vídeo, documento, localização e respostas de botão e de lista. | ✅ |
| `RF-CAN-008` | O handler Evolution **persiste `canal_instancia`** na conversa — a instância é indispensável para responder pelo número correto. | ✅ |
| `RF-CAN-009` | O handler Meta trata `entry.changes[].messages` e `statuses`, e responde ao desafio de verificação em `GET /api/webhooks/meta` com `META_VERIFY_TOKEN`. | ✅ |
| `RF-CAN-010` | Mídia recebida pela Meta é referenciada como `/api/media/:id`. **Essa rota não existe** no servidor — mídia do canal oficial não é recuperável. | ✗ |
| `RF-CAN-011` | O handler Telegram trata `message`, `edited_message` e `callback_query` (botão inline convertido em texto, com `answerCallbackQuery`). `POST /webhooks/telegram/setup` registra o webhook do bot. | ✅ |
| `RF-CAN-012` | A tela **Canais** administra seis tipos (`whatsapp`, `telegram`, `widget`, `email`, `voip`, `sms`) com `ativo` e `config` jsonb por tipo. | ◐ |
| `RF-CAN-013` | `email`, `voip` e `sms` existem como registro de configuração, **sem qualquer implementação de transporte**. | ✗ |

> **Nota de verificação — `RF-CAN-003`.** A deduplicação foi endurecida com um índice único (migration `008`) e cláusula `onConflict`. A migration **ainda não foi exercitada contra um PostgreSQL real**: a máquina de desenvolvimento não tem banco local e a validação ficou pendente. Até que rode, a idempotência sob concorrência é uma expectativa, não um fato.

### 4.3 `RF-MOT` — Motor de fluxo

O motor (`motorFluxo.js`, 1.112 linhas) é o componente central do produto: um **interpretador de grafo** que executa o fluxo desenhado no editor visual.

#### 4.3.1 Modelo de execução

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-MOT-001` | O motor carrega **o fluxo marcado como ativo** (`fluxos.ativo = true`). A ativação é exclusiva: apenas um fluxo ativo por vez. | ✅ |
| `RF-MOT-002` | Não havendo fluxo ativo ou nós, o motor cai em **IA direta** (prompt `outros` mais histórico) — a rede de segurança que impede o cliente de ficar sem resposta. | ✅ |
| `RF-MOT-003` | O grafo é normalizado em `{nodes, edges}`. Nós aceitam variações de formato (`tipo`/`type`, `config`/`data.config`); arestas aceitam o formato do editor (`{from, to, port}`) e o legado (`{source, target, sourceHandle}`). | ✅ |
| `RF-MOT-004` | `encontrarProximo` resolve o próximo nó em **três níveis de fallback**: porta exata → porta `saida` → **primeira aresta qualquer do nó**. | ⚠ |
| `RF-MOT-005` | A execução é um **laço de até 15 iterações** por mensagem recebida, como trava contra ciclo infinito. | ✅ |
| `RF-MOT-006` | Cada nó devolve um de três resultados: `avancar(porta)` (segue o laço), `aguardar()` (persiste o estado e para, à espera da próxima mensagem) ou `fim()` (limpa o estado e encerra). | ✅ |
| `RF-MOT-007` | As respostas acumuladas no contexto são despachadas ao final do processamento, traduzidas para o canal de origem. | ✅ |
| `RF-MOT-008` | O estado de execução por conversa (`{noAtual, contexto, historico, aguardando}`) reside em um `Map` **em memória do processo**. | ⚠ |
| `RF-MOT-009` | O acesso ao estado é **serializado por conversa** por uma fila FIFO por chave (`filaPorChave.js`): mensagens da mesma conversa processam uma por vez, em ordem; conversas distintas seguem em paralelo. Falha em uma tarefa não trava a fila. | ✅ |

> **`RF-MOT-004` é uma armadilha operacional, não um detalhe.** O terceiro fallback significa que uma porta não conectada **não interrompe** o atendimento: manda o cliente para um ramo arbitrário, em silêncio. É por isso que a porta `saida` dos menus deve ser sempre ligada, e por isso que o validador estático classifica porta desconectada como aviso (o cliente vai para o lugar errado) e apenas nó sem nenhuma aresta como erro (o cliente é abandonado).

> **`RF-MOT-009` documenta a correção de uma condição de corrida real.** Os três webhooks invocam o motor sem `await`. Duas mensagens seguidas do mesmo cliente entravam simultaneamente na janela entre a leitura e a gravação do estado, corrompendo-o — saltos de nó e respostas duplicadas. O teste `filaPorChave.test.js` reproduz deliberadamente a corrida **sem** a fila, para documentar o defeito que motivou o módulo. Isto **não substitui** persistir o estado: `RES-01` continua vigente.

#### 4.3.2 Padrão "enviar e aguardar"

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-MOT-010` | Nós que solicitam algo ao cliente executam **em duas passagens**, discriminadas por `estado.aguardando === no.id`: na primeira perguntam e marcam a espera; quando o cliente responde, o mesmo nó é reexecutado, agora processando a resposta e avançando. | ✅ |
| `RF-MOT-011` | Usam esse padrão: `enviar_botoes`, `enviar_lista`, `aguardar_resposta`, `nps_inline`, `solicitar_localizacao` e `consultar_cliente`. | ✅ |

#### 4.3.3 Contexto e interpolação

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-MOT-012` | O contexto acumula dados ao longo da conversa e é interpolado nos textos dos nós via `{{caminho}}`, com leitura aninhada. | ✅ |
| `RF-MOT-013` | Chaves de contexto reservadas: `cliente.*` (`consultar_cliente`), `boleto.*`, `chamado.protocolo`, `promessa.*`, `planos.lista`, `historico.resumo`; `{{var}}` resolve variável livre ou campo da conversa. | ✅ |

#### 4.3.4 Catálogo de nós

O motor implementa **37 tipos de nó**; o catálogo visual do editor declara **32** (os cinco stubs herdados não são oferecidos na paleta).

**Gatilho**

| Tipo | Função | Portas | Config | Estado |
|---|---|---|---|:---:|
| `inicio` | Ponto de entrada, único por fluxo; **reinicia o contexto**. | `saida` | — | ✅ |
| `gatilho_keyword` | Deveria disparar em palavra específica. **O filtro de palavra é inerte** — o motor não avalia `cfg.palavra`. | `saida` | `palavra` | ⚠ |

**Mensagens**

| Tipo | Função | Portas | Config | Estado |
|---|---|---|---|:---:|
| `enviar_texto` | Texto com interpolação. | `saida` | `texto` | ✅ |
| `enviar_cta` | Texto com botão de URL. | `saida` | `corpo`, `label`, `url` | ◐ |
| `enviar_imagem` | Imagem com legenda. | `saida` | `url`, `legenda` | ✅ |
| `enviar_audio` | Áudio. | `saida` | `url` | ✅ |
| `enviar_arquivo` | Documento. | `saida` | `url`, `filename` | ✅ |
| `enviar_localizacao` | Ponto no mapa. | `saida` | `nome`, `address`, `lat`, `lng` | ✅ |
| `enviar_botoes` | Botões de resposta rápida; **porta dinâmica por botão** mais `saida` como fallback. | dinâmicas | `corpo`, `botoes[]`, `ia_menu_ativo` | ✅ |
| `enviar_lista` | Lista de opções; porta dinâmica por item. Casa texto digitado **ou número**. | dinâmicas | `corpo`, `label_botao`, `titulo_secao`, `itens[]` | ✅ |
| `solicitar_localizacao` | Solicita GPS e grava em variável. | `localizacao_recebida`, `sem_localizacao`, `erro` | `mensagem`, `variavel` | ◐ |

**Lógica**

| Tipo | Função | Portas | Config | Estado |
|---|---|---|---|:---:|
| `aguardar_resposta` | Aguarda a próxima mensagem e grava em variável. | `saida` | `mensagem`, `variavel` | ◐ |
| `condicao` | Bifurca por condição. Operadores: `==`, `!=`, `>`, `<`, `contem`, `nao_contem`, `vazio`, `nao_vazio`, com apelidos em português. | `sim`, `nao` | `variavel`, `operador`, `valor` | ✅ |
| `condicao_multipla` | Cascata de condições; a primeira que casar vence. | dinâmicas + `default` | `ramos[]` | ⚠ |
| `definir_variavel` | Define variável, com interpolação. | `saida` | `variavel`, `valor` | ✅ |
| `divisao_ab` | Divisão percentual para teste A/B. | `a`, `b` | `pct_a` | ✅ |
| `aguardar_tempo` | Deveria pausar N segundos. **Avança imediatamente** — não há agendador. | `saida` | `segundos` | ✗ |

**SGP / ERP**

| Tipo | Função | Portas | Estado |
|---|---|---|:---:|
| `consultar_cliente` | Identifica por CPF e popula `contexto.cliente`, com nova tentativa em caso de CPF inválido. | `encontrado`, `multiplos_contratos`, `max_tentativas` | ⚠ |
| `consultar_boleto` | Segunda via; popula `contexto.boleto`. | `encontrado`, `nao_encontrado` | ⚠ |
| `verificar_status` | Bifurca pelo status do contrato. **Não chama a API** — lê `contexto.cliente.status`. | `ativo`, `inativo`, `cancelado`, `suspenso`, `inviabilidade`, `novo`, `reduzido` | ⚠ |
| `abrir_chamado` | Abre chamado técnico; popula `contexto.chamado`. | `sucesso`, `erro` | ⚠ |
| `promessa_pagamento` | Libera acesso por promessa de pagamento. | `sucesso`, `adimplente`, `erro` | ⚠ |
| `listar_planos` | Planos da cidade → `contexto.planos.lista`. | `saida` | ⚠ |
| `consultar_historico` | Histórico de chamados → `contexto.historico.resumo`. | `saida` | ⚠ |

> **⚠ Defeito de alto impacto — nós de SGP não são configuráveis pela interface.** Nenhum desses sete tipos possui bloco correspondente no painel de propriedades do editor. A consequência mais grave está em `consultar_cliente`: o motor lê `cfg.pergunta` para saber o que perguntar, e **não há como definir esse campo pela tela**. Na prática, o nó de entrada de dado fica em silêncio, esperando um CPF que nunca foi solicitado. O contorno existente é editar o JSON do fluxo diretamente — funciona e sobrevive ao salvamento.

**IA**

| Tipo | Função | Portas | Config | Estado |
|---|---|---|---|:---:|
| `ia_responde` | Agente conversacional autônomo com tool calling (Seção 4.4). | `resolvido`, `transferir`, `max_turnos` | `contexto`, `instrucao`/`prompt`, `max_turns`, `tools_ativas[]` | ✅ |
| `ia_roteador` | Classificador de intenção; a IA escolhe a rota. | dinâmicas + `nao_entendeu` + `encerrar` | `mensagem`, `rotas[]` | ✅ |

**Ações**

| Tipo | Função | Portas | Estado |
|---|---|---|:---:|
| `transferir_agente` | Envia à fila humana, verificando o **horário de atendimento** (`sistema_kv.horario`). | `transferido`, `fora_horario`, `sem_agente` | ◐ |
| `chamada_http` | Requisição HTTP a serviço externo; grava a resposta em variável. | `sucesso`, `erro` | ✅ |
| `nota_interna` | Registra nota interna na conversa. | `saida` | ✅ |
| `enviar_email` | **Não implementado** — apenas registra em log. | `sucesso` | ✗ |
| `nps_inline` | Solicita nota e grava em `satisfacao`, com faixas por escala. | `promotor`, `neutro`, `detrator` | ✅ |

> **⚠ `transferir_agente` não envia mensagem alguma ao transferir.** A transferência é silenciosa do ponto de vista do cliente. Todo fluxo precisa colocar um `enviar_texto` imediatamente antes — sem isso, a conversa simplesmente para na cara do cliente. As portas `transferido` e `sem_agente` são, além disso, **portas mortas**: o motor não as emite, e arestas ligadas a elas ficam inertes.

**Fim e stubs**

| Tipo | Função | Estado |
|---|---|:---:|
| `encerrar` | Despede-se, encerra a conversa e limpa o estado. | ✅ |
| `mudanca_endereco`, `mudar_plano`, `cadastrar_lead`, `cadastrar_condominio`, `registrar_ocorrencia_cond` | Herdados do sistema de inspiração. Enviam uma mensagem e avançam. | ✗ |

#### 4.3.5 Espelhamento editor ↔ motor

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-MOT-014` | O catálogo visual (`nodeTypes.js`) e o `switch` de `processarNo` devem permanecer espelhados em tipos, portas e **nomes de campo de configuração**. | ⚠ |
| `RF-MOT-015` | Divergências históricas de nomenclatura são absorvidas por `fluxoHelpers.js`, que lê o nome do editor com recuo para o nome antigo — preservando fluxos já salvos. Resolvidos: `enviar_lista`, `abrir_chamado`, `ia_responde`, `nps_inline`. | ✅ |
| `RF-MOT-016` | Permanecem divergentes: `gatilho_keyword` (filtro inerte), `aguardar_resposta` (`timeout` e `max_tentativas` ignorados), `condicao_multipla` (sem editor; porta por `ramo.id` × `ramo.porta`), portas mortas de `solicitar_localizacao` e `transferir_agente`, e `rodape` de `enviar_cta`. | ⚠ |

> O helper de compatibilidade é **rede de segurança, não licença para divergir**. A regra do projeto é manter os nomes idênticos nas duas faces; toda nova leitura de configuração entra em `fluxoHelpers.js` **com teste escrito primeiro**.

### 4.4 `RF-IA` — Inteligência artificial com tool calling

#### 4.4.1 Laço agêntico

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-IA-001` | O nó `ia_responde` executa um **laço agêntico de até 5 rodadas** por turno: a IA pode encadear várias chamadas de ferramenta antes de formular a resposta. | ✅ |
| `RF-IA-002` | O prompt de sistema é composto por `resolverPrompt(slug)` a partir de `cfg.contexto`, somado à instrução específica do nó, aos dados do cliente identificado e a regras explícitas de uso de ferramenta (executar em silêncio; jamais inventar contrato, CPF ou protocolo). | ✅ |
| `RF-IA-003` | O histórico por nó (`_ia_hist_<id>`) é uma janela deslizante de **50 mensagens** (≈ 25 trocas), usada para preservar o tom da conversa. | ✅ |
| `RF-IA-004` | Um contador de turnos por nó (`max_turns`, padrão **6**) desvia pela porta `max_turnos` ao ser excedido. | ✅ |
| `RF-IA-005` | Os resultados sentinela `__TRANSFERIR__` e `__ENCERRAR__` roteiam o fluxo pelas portas `transferir` e `resolvido`. | ✅ |
| `RF-IA-006` | **Texto que acompanha uma chamada de ferramenta é enviado ao cliente e registrado no histórico.** | ✅ |

> **`RF-IA-006` corrige um defeito que travava conversas reais.** O laço só capturava a fala do modelo quando `stop_reason` era `end_turn`. Quando a IA emitia texto **junto** de uma chamada de ferramenta — típico no encerramento de um cadastro ("confirmo seus dados, posso finalizar?" acompanhado de `salvar_dado`) — o texto era descartado e o turno terminava com zero respostas geradas. O cliente ficava sem retorno.

#### 4.4.2 Memória estruturada

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-IA-007` | A ferramenta `salvar_dado` grava, em lote, os dados que o cliente informa como **variáveis de fluxo** em `estado.contexto`, com a chave normalizada para ASCII. | ✅ |
| `RF-IA-008` | `salvar_dado` é interceptada pelo próprio motor (não passa pelo executor comum, porque precisa mutar o estado) e **está sempre disponível**, independentemente de `tools_ativas` — memória não é desativável por configuração de nó. | ✅ |
| `RF-IA-009` | Chaves reservadas (`cliente`, `boleto`, `chamado`, `promessa`, …) são protegidas contra sobrescrita. | ✅ |
| `RF-IA-010` | `montarFichaColetada` reinjeta o bloco `## DADOS JÁ COLETADOS` no prompt de sistema **a cada turno**, de modo que os fatos sobrevivam ao deslizamento da janela de histórico. | ✅ |
| `RF-IA-011` | Nós de cadastro longo requerem `max_turns ≈ 25`. Configurar acima de ~25 é incoerente com a janela de 50 mensagens. | ✅ |

> **Por que a memória estruturada existe.** Antes dela, os dados coletados viviam apenas como texto no histórico. Em um cadastro comercial longo, cidade e plano informados no início saíam da janela e a IA os perguntava de novo. Ampliar a janela era paliativo; extrair os fatos para variáveis é a correção estrutural — e é ela que torna seguro elevar `max_turns`, porque sem ela mais turnos significam simplesmente mais esquecimento.
>
> **⏳ Pendência de verificação.** Até a última anotação do projeto, a memória estruturada havia sido validada no **pré-cadastro isolado** (tela Testar Tools), não em uma conversa real completa com a IA.

#### 4.4.3 Configuração do nó de IA

Três campos com papéis distintos — fonte recorrente de erro operacional:

| Campo | O que é | Efeito |
|---|---|---|
| `contexto` | O **slug** de um prompt da tabela `prompts_ia` | Torna-se a **base** do prompt de sistema. Slug inexistente cai no genérico de recuo. |
| `instrucao` (o motor lê `cfg.instrucao ?? cfg.prompt`) | Instrução específica daquele nó | É **somada por cima** da base. |
| `tools_ativas[]` | Lista de nomes de ferramenta | Define **quais** ferramentas a IA pode chamar. **O prompt não registra ferramenta alguma** — apenas orienta quando usá-las. |

> **Armadilha vista em produção.** Nós que colocam o prompt inteiro em `instrucao` e definem `contexto` com um rótulo humano em vez do slug (`"Suporte Técnico"` em vez de `suporte`) fazem a base cair no genérico — e editar o prompt na tela **não afeta o nó**. Mitigação aplicada: o campo virou um menu suspenso alimentado pelos slugs reais, e valores legados inválidos aparecem sinalizados.

#### 4.4.4 Catálogo de ferramentas

O sistema declara **16 ferramentas** no formato da API Anthropic.

| # | Ferramenta | Categoria | Origem do dado | Estado |
|---|---|---|---|:---:|
| 1 | `verificar_conexao` | Diagnóstico | SGP `verificaacesso/` | ✅ |
| 2 | `consultar_manutencao` | Diagnóstico | SGP `manutencao/list` | ✅ |
| 3 | `status_rede` | Diagnóstico | Proxy de `consultar_manutencao` (não há endpoint próprio) | ◐ |
| 4 | `consultar_onu_acs` | Diagnóstico | **Banco do SGP em leitura direta** — sinal óptico Rx, status e uptime da ONU | ✅ |
| 5 | `reiniciar_onu_acs` | Diagnóstico | ACS/TR-069 — **stub**, devolve orientação | ✗ |
| 6 | `consultar_radius` | Diagnóstico | SGP `/ws/radius/radacct/list/all/` — sessão PPPoE | ✅ |
| 7 | `criar_chamado` | Atendimento | SGP `chamado/` — **grava** | ✅ |
| 8 | `historico_ocorrencias` | Atendimento | SGP `ocorrencia/list/` | ◐ |
| 9 | `segunda_via_boleto` | Financeiro | SGP `fatura2via/` | ✅ |
| 10 | `promessa_pagamento` | Financeiro | SGP `liberacaopromessa/` — **grava** | ◐ |
| 11 | `listar_vencimentos` | Comercial | SGP `precadastro/vencimento/list` | ✅ |
| 12 | `listar_planos_ativos` | Comercial | **Tabela local `planos`** | ✅ |
| 13 | `precadastrar_cliente` | Comercial | SGP `precadastro/F` — **grava** | ✅ |
| 14 | `salvar_dado` | Memória | Estado do fluxo | ✅ |
| 15 | `transferir_para_humano` | Controle | Sentinela de fluxo | ✅ |
| 16 | `encerrar_atendimento` | Controle | Sentinela de fluxo | ✅ |

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-IA-012` | Sem `tools_ativas` explícito, vale uma lista padrão de doze ferramentas de suporte. **`precadastrar_cliente`, `listar_planos_ativos` e `listar_vencimentos` ficam deliberadamente fora do padrão** e precisam ser ativadas no ramo comercial. | ✅ |
| `RF-IA-013` | Quatro ferramentas são classificadas como **de escrita** (`criar_chamado`, `promessa_pagamento`, `precadastrar_cliente`, `reiniciar_onu_acs`) e ficam sujeitas ao bloqueio de sandbox. | ✅ |
| `RF-IA-014` | Cada ferramenta formata um texto amigável de retorno para a IA. Esse texto **deve ler os campos que a função de integração realmente devolve**. | ⚠ |
| `RF-IA-015` | `diagnosticoOnu` é *fail-safe*: nunca propaga exceção. Sem configuração do banco do SGP, devolve orientação em vez de falhar. | ✅ |
| `RF-IA-016` | O sinal óptico é classificado em faixas (bom / atenção / ruim / crítico) e leitura com mais de 7 dias é sinalizada como desatualizada. | ✅ |

> **⚠ `RF-IA-014` descreve uma classe de defeito, não um caso isolado.** As ferramentas foram escritas depois dos nós, e algumas divergiram dos campos reais. Caso corrigido: `segunda_via_boleto` lia `link`, `pix` e `valor`, enquanto o retorno traz `link_cobranca`, `pix_copia_cola` e `valor_cobrado` — e a ferramenta respondia **sempre** "não encontrei boleto". A correção extraiu a formatação para `iaToolsHelpers.js`, módulo puro sob teste. Permanecem sob suspeita, por auditoria: `historico_ocorrencias`, os campos extras de `criar_chamado` e o nó `promessa_pagamento`.

#### 4.4.5 Composição de prompts

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-IA-017` | `resolverPrompt(slug, clienteCtx)` carrega em paralelo o prompt do slug, os blocos `regras` e `estilo`, os planos e os tipos de ocorrência, e substitui os marcadores `[REGRAS]`, `[ESTILO]`, `[PLANOS]` e `[TIPOS_OCORRENCIA]`. | ✅ |
| `RF-IA-018` | Devolve `{system, modelo, provedor, temperatura}` — modelo e temperatura são por prompt, não globais. | ✅ |
| `RF-IA-019` | Oito prompts são semeados pela migration `005`: `regras`, `estilo`, `roteador`, `financeiro`, `suporte`, `comercial`, `faq`, `outros`. Todos **fortemente acoplados à NetGo**. | ⚠ |
| `RF-IA-020` | Existem **dois mecanismos de cache independentes** — `promptService` (TTL de 3 minutos) e `invalidateConfigCache` de `integrations`. Editar um prompt invalida apenas o segundo; o motor pode servir prompt desatualizado por até 3 minutos. | ⚠ |
| `RF-IA-021` | `ia_roteador` detecta despedida por expressão regular **antes** de chamar a API, e pede ao modelo uma resposta em `<rota>id</rota>` com `max_tokens: 30`. | ✅ |

### 4.5 `RF-SGP` — Integração com o ERP

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-SGP-001` | Credenciais (`sgp_url`, `sgp_app`, `sgp_token`) vêm de `sistema_kv`, com cache de 5 minutos. A URL é higienizada (remoção de barra e `/api` finais, imposição de `https://`). Credencial ausente produz erro explícito. | ✅ |
| `RF-SGP-002` | Toda requisição ao SGP carrega `app` e `token` — a autenticação do ERP é independente do JWT do painel. | ✅ |
| `RF-SGP-003` | Três transportes: POST `form-urlencoded` (12 s), POST JSON (12 s) e GET (10 s). | ✅ |
| `RF-SGP-004` | Os retornos toleram variação de versão do SGP, com recuo entre múltiplos nomes de campo. | ✅ |

**Operações implementadas**

| Função | Endpoint | Retorno | Estado |
|---|---|---|:---:|
| `consultarClientes(cpf)` | `consultacliente/` | Nome, CPF/CNPJ, e-mail, telefone e contratos; tenta dois formatos de CPF, ordena por status e limita a 8 | ✅ |
| `segundaViaBoleto(cpf, contrato)` | `fatura2via/` | Três formas: sem boleto, múltiplos boletos, ou boleto único com link, PIX e linha digitável | ✅ |
| `promessaPagamento(contrato)` | `liberacaopromessa/` | Liberação, prazo, protocolo e data | ◐ |
| `criarChamado(contrato, tipo, conteudo)` | `chamado/` | Protocolo e confirmação | ✅ |
| `verificarConexao(contrato)` | `verificaacesso/` | Estado on-line e status da conexão | ✅ |
| `historicoOcorrencias(contrato)` | `ocorrencia/list/` | Lista de ocorrências | ◐ |
| `listarPlanos(cidade)` | `precadastro/plano/list` | Planos com id, descrição, valor e velocidade | ✅ |
| `consultarManutencao()` | `manutencao/list` | Manutenção ativa, cidades afetadas e previsão (fuso America/Fortaleza) | ✅ |
| `consultarRadius(cpf)` | `/ws/radius/radacct/list/all/` | Sessão PPPoE ativa, IP, usuário e até 3 sessões | ✅ |
| `listarVencimentos()` | `precadastro/vencimento/list` | Dias de vencimento disponíveis | ✅ |
| `precadastrarCliente(dados)` | `precadastro/F` | Cadastro em **modo lead** | ✅ |
| `diagnosticoOnu(contrato)` | Banco do SGP (leitura) | Sinal Rx, status, uptime e motivo da última queda | ✅ |

**Códigos de status de contrato:** `1` ativo · `2` inativo · `3` cancelado · `4` suspenso · `5` inviabilidade · `6` novo · `7` ativo com velocidade reduzida.

#### 4.5.1 Pré-cadastro em modo lead

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-SGP-005` | O pré-cadastro grava em **modo lead** (`precadastro_ativar = 0`): apenas dados do cliente, com plano e vencimento desejados na observação. A equipe do provedor monta o contrato. | ✅ |
| `RF-SGP-006` | Nesse modo, o SGP exige somente `nome` e `logradouro`. O ramo de cadastro definitivo permanece no código, preservado para uso futuro. | ✅ |
| `RF-SGP-007` | `datanasc` é normalizada para `AAAA-MM-DD` antes do envio, aceitando entradas em `DD/MM/AAAA` e variantes. | ✅ |
| `RF-SGP-008` | CPF duplicado (`HTTP 402`) é detectado e traduzido em aviso ao cliente. | ✅ |
| `RF-SGP-009` | O endereço é coletado em campos separados (`logradouro`, `numero`, `bairro`). | ✅ |

> **A decisão pelo modo lead é de produto, não técnica.** Todos os campos de plano, NAS, login e ordem de instalação são marcados pelo SGP como "para criação de contrato". Um chatbot não tem como decidir CTO, IP, técnico ou agenda — dados físicos e operacionais. Registrar o lead e deixar o contrato para a equipe é a divisão correta de responsabilidade.

#### 4.5.2 Acoplamento ao provedor de origem

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-SGP-010` | O pré-cadastro carrega identificadores **fixos da NetGo**: POP por cidade (Natal e Macaíba = 1, São Miguel do Gostoso = 3, São Gonçalo = 4), portador (16/18), `uf = RN`, senha padrão `123456`, `nas_id = 53` e `formacobranca_id = 1`. | ⚠ |
| `RF-SGP-011` | A API do SGP oferece os endpoints `list` necessários para parametrizar cada um desses valores por instância (NAS, POP, portador, plano). **Ainda não utilizados.** | ✗ |

> Este é o **maior ponto de acoplamento single-tenant fora dos prompts**, e um bloqueador direto de revenda. Vale registrar o histórico: o `nas_id` era `2`, o que produzia "NAS não encontrado" no SGP real; e o endpoint de planos era `/api/ura/planos/`, que respondia 404. Ambos só apareceram na validação contra o ERP de produção — nenhum teste estático os teria encontrado.

### 4.6 `RF-ATD` — Atendimento humano, fila e SLA

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-ATD-001` | Uma conversa assume um de quatro estados: `ia` (conduzida pelo motor), `aguardando` (na fila), `ativa` (com agente) ou `encerrada`. | ✅ |
| `RF-ATD-002` | Toda conversa nasce com um **protocolo único** no formato `AAAAMMDD-NNNN`. | ⚠ |
| `RF-ATD-003` | O agente dispõe das ações: assumir, devolver à IA, encerrar, transferir a outro agente, enviar mensagem, registrar nota interna, reagir e usar resposta rápida. | ✅ |
| `RF-ATD-004` | Existe um **modo global bot/humano** (`sistema_kv.modo`), alternável por administrador, que suspende a condução automática. | ✅ |
| `RF-ATD-005` | A urgência de cada conversa é calculada a partir do tempo de espera e da prioridade: **crítico** com prioridade ≥ 2 ou espera ≥ 15 min; **atenção** com espera ≥ 5 min ou prioridade ≥ 1. | ✅ |
| `RF-ATD-006` | A fila ordena por prioridade decrescente e tempo de espera crescente, e expõe posição, total e tempo médio. | ✅ |
| `RF-ATD-007` | O sistema detecta **palavras críticas** ("procon", "advogado", "cancelar", …) e as usa para elevar a prioridade. | ✅ |
| `RF-ATD-008` | Um monitor de SLA roda **a cada 60 segundos** e emite dois alertas com deduplicação por TTL: `sla_critico` (espera em nível crítico) e `agente_fantasma` (agente assumiu mas não enviou a primeira resposta em 5 minutos). | ✅ |
| `RF-ATD-009` | O envio de mensagem pelo agente usa **atualização otimista** na interface. | ✅ |
| `RF-ATD-010` | A conversa registra marcos de SLA: `assumido_em`, `primeira_msg_agente_em`, `ultima_msg_agente_em`. | ✅ |
| `RF-ATD-011` | O **Histórico** reutiliza os mesmos endpoints do Chat como leitura filtrável (status, canal, busca por nome, telefone ou protocolo), sem escrita. | ✅ |

> **⚠ `RF-ATD-002`.** O protocolo é gerado por `COUNT(*) + 1`, o que é uma condição de corrida sob concorrência — duas conversas simultâneas podem disputar o mesmo número. O `numero` das ordens de serviço tem o mesmo defeito. Em modo sandbox o protocolo é fabricado como `AAAAMMDD-TESTE`.

### 4.7 `RF-SUP` — Supervisora IA

Camada de IA que assiste o **agente humano**, distinta da IA que atende o cliente. Atua sobre conversas em `status = 'ativa'`.

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-SUP-001` | Classificação de sentimento **instantânea e sem IA**, por listas de palavras e sinais de urgência (caixa alta, exclamações múltiplas), em cinco níveis: positivo, neutro, atenção, frustrado, crítico. | ✅ |
| `RF-SUP-002` | O sentimento é persistido na conversa a cada mensagem do cliente. | ✅ |
| `RF-SUP-003` | Em sentimento frustrado ou crítico, o sistema emite `supervisora_alerta` ao agente e alerta em difusão ao supervisor. | ✅ |
| `RF-SUP-004` | Em paralelo, gera uma **sugestão de resposta empática** via Claude, entregue como `supervisora_sugestao`; a interface oferece cópia com um clique. | ✅ |
| `RF-SUP-005` | Detecção de demora do agente: atenção aos 5 minutos, crítico aos 15, por monitor próprio que varre conversas ativas **a cada 2 minutos**. | ✅ |
| `RF-SUP-006` | Ao encerrar, uma análise profunda deveria gravar sentimento, tópico e resumo na conversa. **A função é importada pela rota de encerramento mas não é invocada.** | ✗ |

### 4.8 `RF-RT` — Tempo real

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-RT-001` | O painel abre uma conexão SSE em `GET /api/chat/sse`, autenticada por token na query string. | ✅ |
| `RF-RT-002` | O gerenciador mantém as conexões por agente e oferece difusão geral e envio dirigido a um agente. | ✅ |
| `RF-RT-003` | Eventos emitidos: `nova_conversa`, `mensagem`, `conversa_atualizada`, `mensagem_atualizada`, `mensagem_removida`, `modo_alterado`, `sla_critico`, `agente_fantasma`, `supervisora_alerta`, `supervisora_sugestao`, `nota_criada`. | ✅ |
| `RF-RT-004` | Ping a cada 25 segundos; limpeza no fechamento; o cliente reconecta em 3 segundos após erro. | ✅ |
| `RF-RT-005` | Pub/sub Redis no canal `maxxi:sse` para propagar difusão entre processos, com **supressão do eco da própria instância** para evitar entrega duplicada. | ◐ |

> **`RF-RT-005` foi corrigido, mas não comprovado.** O código importava o pacote `redis` enquanto o projeto declara `ioredis` — o import falhava e o sistema caía silenciosamente em modo local. A migração para a API do `ioredis` está feita e a supressão de eco é coberta por testes unitários, mas **a conexão real a um Redis nunca foi exercitada**. Enquanto isso não acontecer, `RES-02` continua valendo.

### 4.9 `RF-EDT` — Editor de fluxos e ferramentas de teste

#### 4.9.1 Editor visual

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-EDT-001` | Editor de grafo sobre `@xyflow/react` v12, com paleta arrastável de 32 tipos, conexão por portas, painel de propriedades por tipo, importação e exportação JSON e salvamento por `Ctrl+S`. | ◐ |
| `RF-EDT-002` | Nós de portas dinâmicas exigem **remedição dos handles** (`useUpdateNodeInternals`) quando as portas mudam; sem isso o arraste de conexão quebra na v12. | ✅ |
| `RF-EDT-003` | O importador aceita `{nome, nodes, edges}` com `posX`/`posY`; o formato salvo é `{id, tipo, config, posX, posY}` mais `{from, to, port}`. | ✅ |
| `RF-EDT-004` | A ativação de fluxo é **exclusiva** — ativar um desativa o anterior. | ✅ |
| `RF-EDT-005` | O painel de propriedades efetivo é uma função **inline** dentro de `FluxoEditor.jsx`. O arquivo `components/fluxo/PropsPanel.jsx` é **código morto** — editá-lo não afeta o editor. | ⚠ |
| `RF-EDT-006` | Sete tipos de nó de SGP **não possuem bloco no painel de propriedades** e são inconfiguráveis pela interface (ver 4.3.4). | ⚠ |

#### 4.9.2 Validador estático

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-EDT-007` | O validador analisa o grafo **sem executá-lo**, a partir de um catálogo que declara, por tipo, quais portas o motor pode emitir — incluindo as dinâmicas e os **recuos implícitos que o editor esquece** (`saida` dos menus, `default` da condição múltipla, `nao_entendeu` e `encerrar` do roteador). | ✅ |
| `RF-EDT-008` | Diagnósticos emitidos: `sem_entrada` (erro), `beco_sem_saida` (erro), `porta_nao_conectada` (aviso), `no_inalcancavel` (aviso), `aresta_orfa` (aviso), `loop_sem_espera` (aviso). | ✅ |
| `RF-EDT-009` | Disponível como CLI (`fluxoValidador.cli.js`, saída 1 em caso de erro, adequado a integração contínua) e como `POST /fluxos/:id/validar`. | ✅ |
| `RF-EDT-010` | **Critério de aceitação de fluxo: zero erros e zero avisos** antes de ativar. | ✅ |

#### 4.9.3 Simulação

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-EDT-011` | `motorLoop.js` extrai o laço real do motor como função pura, classificando o desfecho em `concluido`, `aguardando`, `perdido`, `travado` ou `erro`. É espelho fiel, pronto para ser religado no motor — religamento **deferido** por exigir Docker para validação. | ◐ |
| `RF-EDT-012` | `motorSimulador.js` executa conversas multi-turno sobre esse laço: fiel nos nós determinísticos, **roteirizado** nos de entrada/saída, IA e SGP. Disponível como CLI e como `POST /fluxos/:id/simular`. | ✅ |
| `RF-EDT-013` | `POST /fluxos/:id/simular-real` executa **o motor de verdade**, com SGP e IA reais, em **modo sandbox**. | ✅ |
| `RF-EDT-014` | Em sandbox, **leituras são reais e escritas são simuladas**: os nós `abrir_chamado`, `promessa_pagamento`, `transferir_agente`, `nota_interna`, `nps_inline` e `encerrar`, além das quatro ferramentas de escrita, ficam bloqueados. | ✅ |
| `RF-EDT-015` | A rota de sandbox é **retomável por turno** (`{mensagem, estado}` → `{respostas, estado, status}`), o que mantém a conversa sem estado no servidor. | ✅ |
| `RF-EDT-016` | O simulador diverge do motor na leitura de `consultar_cliente`: lê `cfg.mensagem` **com valor padrão embutido**, enquanto o motor lê `cfg.pergunta`. | ⚠ |

> **`RF-EDT-016` é um falso positivo de confiança no pior lugar possível.** A aba de simulação exibe a pergunta de CPF que o motor real **não enviaria** — precisamente no nó de entrada de dado, e precisamente no nó que não pode ser configurado pela tela (`RF-EDT-006`). Os dois defeitos se reforçam: a ferramenta de teste esconde o defeito de produção.

#### 4.9.4 Link público de teste

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-EDT-017` | Um administrador gera `/teste/<token>` para compartilhar o chat de teste **sem exigir login**; o token é por fluxo e revogável. | ✅ |
| `RF-EDT-018` | A rota pública `GET/POST /api/chat-teste/:token` roda o mesmo sandbox, fora da autenticação, com limite de 60 requisições por 5 minutos. É **sem estado no servidor**, suportando vários testadores simultâneos. | ✅ |
| `RF-EDT-019` | O link opera em modo **real**: consome tokens de IA por uso e, em fluxos com `consultar_cliente`, exporia dado real de cliente. É seguro para o fluxo **comercial** (leads), não para o de suporte. | ⚠ |

### 4.10 `RF-PRM` — Gestão de prompts

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-PRM-001` | Os prompts são editáveis em tempo de execução pela tela Prompts IA, incluindo conteúdo, provedor, modelo e temperatura. | ✅ |
| `RF-PRM-002` | `regras` e `estilo` são blocos reutilizáveis, injetados nos demais por marcador. | ✅ |
| `RF-PRM-003` | "Restaurar padrão" devolve `conteudo` ao valor de `padrao`. | ✅ |
| `RF-PRM-004` | A aba **Catálogo** apresenta as ferramentas em modo somente leitura. É uma **lista fixa no frontend**, espelho manual do backend, e **omite a categoria Comercial**. | ⚠ |
| `RF-PRM-005` | A aba **Testar Tools** executa ferramentas contra o SGP **de verdade**, por `POST /sysconfig/tools/test`. As de escrita são sinalizadas e **gravam dados reais** — é o equivalente manual do bloqueio de sandbox, sem o bloqueio. | ⚠ |

### 4.11 `RF-CFG` — Configuração do sistema

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-CFG-001` | A tela Configurações reúne seis abas: Geral, IA & Bot, Planos, Horário, Notificações e Integrações. | ✅ |
| `RF-CFG-002` | As credenciais de **todas** as integrações são gravadas em `sistema_kv`: SGP (URL, app, token), banco do SGP (`sgpdb_*`), Evolution (URL, chave), Anthropic, OpenAI e Telegram. | ✅ |
| `RF-CFG-003` | Do ambiente vem **apenas infraestrutura**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT`, `CORS_ORIGIN`, `NODE_ENV`, `META_VERIFY_TOKEN`, `ERP_URL`, `ERP_API_KEY`. | ✅ |
| `RF-CFG-004` | Diversas variáveis do `.env.example` (IMAP, SMTP, Asterisk, VAPID, `META_ACCESS_TOKEN`) **não são lidas pelo código** — são aspiracionais. | ⚠ |
| `RF-CFG-005` | O **horário de atendimento** é configurável e consumido por `transferir_agente`. | ✅ |
| `RF-CFG-006` | A aba **Planos** administra o catálogo comercial local: nome, valor, velocidade, cidade, `plano_id_sgp`, valor promocional, meses de promoção e benefícios. | ✅ |
| `RF-CFG-007` | Cidade vazia significa **todas as cidades**; múltiplas cidades são separadas por vírgula. | ✅ |
| `RF-CFG-008` | `GET /api/sysconfig` devolve as chaves de API **em texto plano**, sem mascaramento. | ⚠ |

### 4.12 `RF-MET` — Métricas, dashboard e NPS

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-MET-001` | O Dashboard apresenta: total de atendimentos, percentual resolvido pela IA, percentual com humano, conversas ativas, NPS, série temporal por dia, volume por canal e agentes on-line (atualizados a cada 30 s). | ✅ |
| `RF-MET-002` | As faixas de NPS têm **fonte única** em `fluxoHelpers.js` (`agregarNps`/`avaliarNps`). O dashboard **não** classifica em SQL. | ✅ |
| `RF-MET-003` | `satisfacao.escala` registra a escala de cada resposta; linhas anteriores à migration `009` são tratadas como escala 10. Faixas: escala 10 → promotor ≥ 9, neutro ≥ 7; escala 5 → promotor ≥ 4, neutro = 3. | ✅ |
| `RF-MET-004` | **Coexistem duas tabelas e duas escalas de NPS**: `satisfacao` (0–10), preenchida pelo nó `nps_inline` e lida pelo Dashboard; e `avaliacoes` (1–5), lida pela tela Satisfação. | ⚠ |

> **⚠ `RF-MET-004` é uma divergência de produto, não só de dados.** A tela Satisfação lê uma tabela que o fluxo **não preenche**. Um provedor que colete NPS pelo chatbot verá o número no Dashboard e a tela de Satisfação vazia. As duas fontes precisam ser reconciliadas.

### 4.13 `RF-OPS` — Módulos operacionais de ISP

| ID | Requisito | Estado |
|---|---|:---:|
| `RF-OPS-001` | **Clientes** — ⛔ **redefinido em 2026-08-26.** Deixou de ser busca híbrida no SGP e passou a ser o **histórico de contato**: quem já falou com a plataforma, quantas vezes, e se há vínculo telefone↔CPF/contrato reconhecido. Lê a view `clientes_contato` (migration `028`), que agrega `conversas` por `COALESCE(telefone, id::text)`. Não consulta o SGP: a consulta ao ERP por CPF é atribuição do Cliente 360, **dentro** de uma conversa e com a lista de contratos permitidos. | ✅ |
| `RF-OPS-002` | ⛔ **REMOVIDO em 2026-08-26** (migration `027` dropa `ocorrencias`). Era: *Ocorrências — tickets locais com lista filtrável, timeline, fechamento e notas, vinculados a `conversa_id`, `contrato_id` e `agente_id`.* Motivo: o ERP desta operação é o SGP; o mesmo chamado nas duas bases, sem conciliação, produz duas verdades para o mesmo fato. | ⛔ |
| `RF-OPS-003` | ⛔ **Sem objeto desde 2026-08-26.** Registrava que as ocorrências locais eram registros **distintos** dos chamados do SGP abertos pelo nó `abrir_chamado` e pela ferramenta `criar_chamado`. Removidas as locais, resta uma única base de chamados — a do SGP. As ferramentas de IA **não foram afetadas**: sempre falaram com o SGP por HTTP. | ⛔ |
| `RF-OPS-004` | ⛔ **REMOVIDO em 2026-08-26** (migration `027` dropa `ordens_servico`). Era: *Ordens de Serviço — OS de campo com máquina de estados (aberta → agendada → em campo → concluída), endereço, coordenadas, agendamento e técnico.* Mesmo motivo de `RF-OPS-002`: a OS é fechada no SGP, onde estão contrato, estoque e cobrança. | ⛔ |
| `RF-OPS-005` | **Cobertura** — mapa de zonas sobre Leaflet/OpenStreetMap, com geocodificação Nominatim. Hoje **apenas visualiza e remove** zonas: falta a ferramenta de desenho. | ◐ |
| `RF-OPS-006` | `GET /api/cobertura/check` é **público**, pensado para consulta de cobertura a partir do site ou de um widget. | ✅ |
| `RF-OPS-007` | ⛔ **REMOVIDO em 2026-08-26** (migration `027` dropa `equipamentos_rede` e `alertas_rede`; rotas `GET /monitor/status` e `POST /monitor/ping` excluídas). Era: *Monitor de Rede — indicadores de equipamentos e alertas, com atualização a cada 30 s.* Motivo: era um NMS que ninguém alimentava — `alertas_rede` nunca era escrita, e o status de rede que a IA usa vem do SGP (`status_rede`). O router `monitor` **continua existindo** e serve a tela Saúde do Sistema (`GET /erros`, `PUT /erros/:id`, `GET /saude`). | ⛔ |
| `RF-OPS-008` | ⛔ **RESOLVIDO POR REMOÇÃO em 2026-08-26.** Era: *`POST /monitor/ping` executa DDL em tempo de execução (`createTableIfNotExists`).* Com a rota, saiu o **último `createTableIfNotExists` do código**. A ordem importou: enquanto a rota existisse, a migration `027` dropava a tabela e o primeiro POST a ressuscitaria vazia. | ⛔ |
| `RF-OPS-009` | **Financeiro** — indicadores, cobranças e régua de cobrança. A régua é real; resumo e cobranças dependem de `ERP_URL`. | ◐ |
| `RF-OPS-010` | **Tarefas** e **Financeiro** estão implementadas mas **não possuem rota** em `App.jsx` — são inacessíveis pela navegação, embora a permissão `tarefas` exista e o backend responda. | ⚠ |
| `RF-OPS-011` | `PUT` de `tarefas` aplicava **atribuição em massa** (`{...req.body}`) — corrigido na FASE 3 com lista de campos permitidos e verificação de propriedade. O mesmo valia para `ocorrencias` e `ordens`; ⛔ **as duas rotas deixaram de existir em 2026-08-26.** | ✅ |
| `RF-OPS-012` | Dispositivos, E-mail, VoIP e Frota são **telas vazias**. (Analytics deixou de ser stub na FASE 12.) | ✗ |

---

## 5. Requisitos não funcionais

### 5.1 `RNF-DES` — Desempenho e capacidade

| ID | Requisito | Valor | Estado |
|---|---|---|:---:|
| `RNF-DES-001` | Limite global de requisições por IP | 200 por minuto | ✅ |
| `RNF-DES-002` | Limite do link público de teste | 60 por 5 minutos | ✅ |
| `RNF-DES-003` | Tamanho máximo de corpo de requisição | 10 MB | ✅ |
| `RNF-DES-004` | Tempo limite de chamadas ao SGP | 10 s (GET) / 12 s (POST) | ✅ |
| `RNF-DES-005` | Tempo limite de chamadas à Evolution | 8 s | ✅ |
| `RNF-DES-006` | Teto de iterações do motor por mensagem | 15 nós | ✅ |
| `RNF-DES-007` | Teto de rodadas do laço agêntico por turno | 5 | ✅ |
| `RNF-DES-008` | Janela de histórico da IA | 50 mensagens | ✅ |
| `RNF-DES-009` | Cache de credenciais de integração | 5 min | ✅ |
| `RNF-DES-010` | Cache de prompts | 3 min | ⚠ |
| `RNF-DES-011` | Intervalo do monitor de fila/SLA | 60 s | ✅ |
| `RNF-DES-012` | Intervalo do monitor da Supervisora | 120 s | ✅ |
| `RNF-DES-013` | Ping do canal SSE / reconexão do cliente | 25 s / 3 s | ✅ |
| `RNF-DES-014` | Capacidade concorrente sustentada | **Não determinada** — nunca houve teste de carga | ✗ |

### 5.2 `RNF-CON` — Confiabilidade e disponibilidade

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-CON-001` | `/health` responde **antes** de migrations e monitores, que sobem em segundo plano — o container fica saudável mesmo com o boot em andamento. | ✅ |
| `RNF-CON-002` | Migrations rodam **em transação**, na ordem do nome do arquivo, com registro em `_migrations`. | ✅ |
| `RNF-CON-003` | Não havendo fluxo ativo, o atendimento recua para IA direta em vez de silenciar. | ✅ |
| `RNF-CON-004` | O diagnóstico de ONU é *fail-safe*: falha de banco ou ausência de configuração devolve orientação, nunca exceção. | ✅ |
| `RNF-CON-005` | Falha em uma tarefa da fila por conversa não trava as demais; o erro sobe a quem chamou. | ✅ |
| `RNF-CON-006` | Webhooks são idempotentes por `external_id`. | ◐ |
| `RNF-CON-007` | **O estado de execução não sobrevive a reinício.** Toda conversa em meio de fluxo recomeça no próximo deploy. | ⚠ |
| `RNF-CON-008` | Geração de protocolo e de número de OS por `COUNT(*) + 1` é sujeita a corrida sob concorrência. | ⚠ |
| `RNF-CON-009` | Não há política de retentativa, fila de mensagens mortas nem *circuit breaker* para as integrações externas. | ✗ |
| `RNF-CON-010` | Não há rotina de backup, plano de recuperação nem procedimento de restauração documentados. | ✗ |

### 5.3 `RNF-SEG` — Segurança

Esta é a área que mais exige endurecimento antes de qualquer revenda.

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-SEG-001` | **Credenciais de integração em texto plano** em `sistema_kv` — token do SGP, chave da Evolution, chave da Anthropic, token do Telegram, senha do banco do SGP. Sem cifragem em repouso. | ⚠ |
| `RNF-SEG-002` | **`GET /api/sysconfig` devolve as chaves sem mascaramento.** A rota é restrita a administrador, portanto não há exposição pública — mas **uma sessão de administrador comprometida entrega todas as credenciais de integração de uma só vez**. | ⚠ |
| `RNF-SEG-003` | Não existe segredo de JWT versionado no repositório. Em produção sem `JWT_SECRET`, o boot falha. | ✅ |
| `RNF-SEG-004` | As permissões granulares de agente **não são aplicadas no backend**; rotas não administrativas verificam apenas a validade do token. | ⚠ |
| `RNF-SEG-005` | Os webhooks são públicos e **não validam assinatura de origem**. Qualquer requisição bem formada a `POST /api/webhooks/*` injeta uma mensagem no sistema. | ⚠ |
| `RNF-SEG-006` | Não há limite específico para tentativas de login — vale apenas o limite global de 200/min. | ⚠ |
| `RNF-SEG-007` | Atribuição em massa nos `PUT` de `ocorrencias`, `ordens` e `tarefas`; `tarefas` sem verificação de propriedade em `PUT`/`DELETE`. **Fechado na FASE 3** (lista de campos permitidos + propriedade em `tarefas`); ⛔ `ocorrencias` e `ordens` **removidas em 2026-08-26**. | ✅ |
| `RNF-SEG-008` | SQL interpolado por string no dashboard, atenuado por lista de valores permitidos; `LIKE` sem escape na busca de clientes. | ⚠ |
| `RNF-SEG-009` | Senhas com hash **bcrypt**; nunca trafegam nem são armazenadas em claro. | ✅ |
| `RNF-SEG-010` | `helmet` ativo, com CSP e COEP desabilitados para permitir o frontend embutido. | ◐ |
| `RNF-SEG-011` | CORS assume origem permissiva (`true`) quando `CORS_ORIGIN` não é definida. | ⚠ |
| `RNF-SEG-012` | Credenciais do seed são previsíveis (`admin/admin123`) e não há troca obrigatória no primeiro acesso. | ⚠ |
| `RNF-SEG-013` | Token com validade de 30 dias, sem revogação por lista de bloqueio. | ⚠ |
| `RNF-SEG-014` | **Registros de depuração contendo PII e a senha padrão do pré-cadastro permanecem ativos no console** (`[SGP] precadastro/F params:`, `[SGP] precadastro/F resposta:`, `[IA] salvar_dado →`), ligados durante a validação e ainda não removidos. | ⚠ |
| `RNF-SEG-015` | Não há trilha de auditoria efetiva: a tabela `auditoria` existe, mas não é alimentada de forma sistemática. | ✗ |
| `RNF-SEG-016` | O link público de teste opera em modo real; apontado a um fluxo com `consultar_cliente`, exporia dado de cliente a quem tiver o link. | ⚠ |

> **Nota de contexto.** O repositório foi público durante parte de sua história. Documentar essas falhas foi o que motivou a decisão de torná-lo privado antes de versionar a memória institucional junto ao código.

### 5.4 `RNF-MAN` — Manutenibilidade e testabilidade

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-MAN-001` | **148 testes automatizados**, todos passando, sobre o executor nativo `node --test`, **sem dependência de teste alguma**. | ✅ |
| `RNF-MAN-002` | Distribuição: `fluxoHelpers` 43 · `fluxoValidador` 38 · `sgpHelpers` 29 · `motorLoop` 9 · `motorSimulador` 9 · `filaPorChave` 7 · `iaToolsHelpers` 6 · `sseManager` 3. | ✅ |
| `RNF-MAN-003` | Como `motorFluxo.js` não é importável em teste (`RES-05`), **toda lógica testável é extraída para módulos puros ao lado dele**, escritos com teste primeiro. Esse padrão é a arquitetura de testes do projeto, não uma conveniência. | ✅ |
| `RNF-MAN-004` | **Nenhum teste de integração ou ponta a ponta.** Não há cobertura de rotas HTTP, de banco, nem das integrações externas. | ✗ |
| `RNF-MAN-005` | Não há execução de testes em integração contínua; a CLI do validador foi desenhada para isso (saída 1 em erro), mas não está conectada. | ✗ |
| `RNF-MAN-006` | Toda mudança de schema exige uma migration nova e idempotente. `ALTER TABLE` avulso é proibido. | ✅ |
| `RNF-MAN-007` | As consultas de conversa e mensagem estão concentradas em repositórios — não há SQL espalhado por rotas nesses domínios. | ✅ |
| `RNF-MAN-008` | Tratamento de erro centralizado (`asyncHandler`, `HttpError`, `errorHandler` global). | ✅ |
| `RNF-MAN-009` | **Validação de entrada é manual.** `zod` está declarado como dependência mas não é usado. | ⚠ |
| `RNF-MAN-010` | Dependências declaradas e não utilizadas: `imapflow`, `nodemailer`, `mercadopago`, `ssh2`, `web-push`, `openai`, `zod`, `ws`. Superfície de dependência maior que a necessária. | ⚠ |
| `RNF-MAN-011` | Código morto identificado: `components/fluxo/PropsPanel.jsx`; laço do motor duplicado entre `motorFluxo.js` e `motorLoop.js` (unificação deferida). | ⚠ |
| `RNF-MAN-012` | Resíduos do provedor de inspiração ("CITmax") persistem no seed e na ferramenta `status_rede`. O fluxo padrão do seed é legado e **não executa** no motor atual. | ⚠ |

### 5.5 `RNF-POR` — Portabilidade e implantação

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-POR-001` | Imagem Docker multi-stage única, servindo API e frontend na porta 4000. | ✅ |
| `RNF-POR-002` | Desenvolvimento por `docker-compose` com quatro serviços; também operável sem Docker. | ✅ |
| `RNF-POR-003` | Implantação em Coolify, acompanhando o branch `main`. | ✅ |
| `RNF-POR-004` | Configuração de instância pela interface administrativa, sem alterar imagem ou variáveis — este é o mecanismo que habilita a revenda. | ✅ |
| `RNF-POR-005` | **Prompts e identificadores do provedor de origem impedem, hoje, uma revenda sem trabalho de código.** | ⚠ |
| `RNF-POR-006` | Não existe automação de provisionamento de nova instância. | ✗ |

### 5.6 `RNF-USA` — Usabilidade

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-USA-001` | Design system com tokens centralizados; tipografia e paleta consistentes. | ◐ |
| `RNF-USA-002` | O tema é **misto** por decisão: corpo claro, barra lateral escura, e superfícies escuras no editor de fluxo e na Supervisora. | ◐ |
| `RNF-USA-003` | **Não há documentação de usuário final nem material de treinamento de agente.** | ✗ |
| `RNF-USA-004` | Interface exclusivamente em português do Brasil; não há internacionalização. | ◐ |
| `RNF-USA-005` | Acessibilidade não foi avaliada — não há registro de auditoria de contraste, navegação por teclado ou leitores de tela. | ✗ |
| `RNF-USA-006` | Layout voltado a desktop; não há adaptação para uso em dispositivo móvel. | ◐ |

### 5.7 `RNF-OBS` — Observabilidade

| ID | Requisito | Estado |
|---|---|:---:|
| `RNF-OBS-001` | Registro em `console`, sem estruturação, sem níveis e sem correlação por requisição. | ⚠ |
| `RNF-OBS-002` | Não há métricas exportadas, rastreamento distribuído nem agregação de erros. | ✗ |
| `RNF-OBS-003` | `/health` reporta apenas estado, versão e horário — não verifica banco, Redis nem integrações. | ◐ |
| `RNF-OBS-004` | Registros de depuração com PII permanecem ativos (ver `RNF-SEG-014`). | ⚠ |

---

## 6. Modelo de dados

PostgreSQL 16 via Knex. **21 tabelas** definidas por **12 migrations**, mais a tabela de controle `_migrations`. Chaves primárias são `uuid` (`gen_random_uuid()`), exceto `prompts_ia` e `planos` (sequenciais) e `canais` (chave lógica por `tipo`). Praticamente toda tabela carrega `criado_em`/`atualizado` e colunas `jsonb`. **Nenhuma tabela possui `company_id`.**

### 6.1 Tabelas por domínio

**Atendimento (núcleo)**

| Tabela | Papel | Campos determinantes |
|---|---|---|
| `conversas` | Uma conversa/atendimento | `canal`, `telefone`, `nome`, `status` (`ia`/`aguardando`/`ativa`/`encerrada`), `agente_id`, `protocolo` (único), `prioridade`, `aguardando_desde`, `canal_instancia`, `cpf`, `contrato_id`, `sentimento`, `topico`, `resumo_ia`, `assumido_em`, `primeira_msg_agente_em`, `ultima_msg_agente_em` |
| `mensagens` | Mensagem individual | `conversa_id`, `origem` (`cliente`/`agente`/`ia`/`sistema`), `tipo`, `texto`, `url`, `mime`, `external_id` (deduplicação), `reacoes`, `apagada` |
| `notas` | Notas internas | `conversa_id`, `agente_id` |
| `respostas_rapidas` | Modelos de resposta | — |
| `agendamentos` | Agendamentos de contato | — |
| `agentes` | Operadores do painel | `login`, `senha_hash`, `role`, `online`, `permissoes` (jsonb) |

**Automação e IA**

| Tabela | Papel | Campos determinantes |
|---|---|---|
| `fluxos` | Grafo do editor | `dados` (jsonb `{nodes, edges}`), `nos`/`conexoes` (legado), `ativo`, `gatilho`, `publicado`, `versao`, `share_token` |
| `prompts_ia` | Prompts editáveis em runtime | `slug`, `conteudo`, `padrao`, `provedor`, `modelo`, `temperatura` |
| `planos` | Catálogo comercial local | `plano_id_sgp`, `nome`, `valor`, `velocidade`, `cidade`, `valor_promocional`, `promo_meses`, `beneficios` |
| `sistema_kv` | Configuração e **credenciais** | `chave`, `valor` |

**Operações ISP**

| Tabela | Papel |
|---|---|
| ~~`ocorrencias`~~ | ⛔ **Dropada em 2026-08-26** (migration `027`). Tickets locais (distintos dos chamados do SGP). |
| ~~`ordens_servico`~~ | ⛔ **Dropada em 2026-08-26** (migration `027`). OS de campo com coordenadas e máquina de estados. |
| `tarefas` | Quadro kanban interno |
| `zonas_cobertura` | Polígonos GeoJSON de cobertura |
| `consultas_cobertura` | Registro de consultas públicas |
| ~~`equipamentos_rede`~~ | ⛔ **Dropada em 2026-08-26** (migration `027`). Inventário do monitor de rede. |
| ~~`alertas_rede`~~ | ⛔ **Dropada em 2026-08-26** (migration `027`). Alertas do monitor de rede — nunca escrita pelo código. |
| `clientes_contato` *(view)* | ➕ **Acrescentada em 2026-08-26** (migration `028`). Agrega `conversas` por `COALESCE(telefone, id::text)`: histórico de contato e vínculo telefone↔CPF/contrato. **Não é tabela de propósito** — os fatos já moram em `conversas`; uma tabela seria segunda verdade e nasceria vazia (mesmo argumento com que a FASE 12 recusou um event store). |
| `avaliacoes` | NPS em **escala 1–5** (tela Satisfação) |
| `satisfacao` | NPS em **escala 0–10** (nó `nps_inline` e Dashboard) |
| `auditoria` | Registro de ações — existe, não é alimentada sistematicamente |

### 6.2 Migrations

| Arquivo | Conteúdo |
|---|---|
| `001_schema_inicial` | Núcleo de atendimento |
| `002_tabelas_adicionais` | Operações ISP, rede e cobertura |
| `003_fluxos_dados` | Coluna `dados` jsonb do editor |
| `004_chat_melhorias` | Reações, notas e campos de SLA |
| `005_prompts_ia` | Tabela e **seed dos 8 prompts** (acoplados à NetGo) |
| `006_supervisora_ia` | Campos de sentimento, tópico e resumo |
| `007_planos` | Catálogo comercial local |
| `008_dedup_mensagens` | Índice único de `external_id` — ⏳ não validado contra banco real |
| `009_satisfacao_escala` | Coluna `escala` |
| `011_planos_promocao` | Valor promocional e duração |
| `012_planos_beneficios` | Benefícios do plano |
| `013_fluxos_share_token` | Token do link público de teste |

> **O vão no `010` é proposital.** As migrations `011`–`013` foram renumeradas na reconciliação de 21/08/2026; as originais (`008`–`010`) já constavam no `_migrations` de produção. Como o runner rastreia **por nome de arquivo**, renumerar em vez de reutilizar foi a única forma de não reaplicar migrations já executadas.

---

## 7. Superfície da API

**95 endpoints** em **19 routers**, mais `GET /health`. Guardas: **P** público · **A** autenticado · **AD** administrador.

| Router | Método e caminho | Guarda |
|---|---|:---:|
| `/health` | `GET /health` | P |
| **auth** | `POST /login` · `GET /me` · `POST /logout` · `GET /refresh` | P |
| **webhooks** | `POST /evolution` · `POST /meta` · `GET /meta` · `POST /telegram` · `POST /telegram/setup` | P |
| **chat-teste** | `GET /:token` · `POST /:token` | P |
| **cobertura** | `GET /check` | P |
| **cobertura** | `GET /zonas` · `POST /zonas` · `PUT /zonas/:id` · `DELETE /zonas/:id` | A |
| **chat** | `GET /sse` · `GET /conversas` · `GET /conversas/:id` · `GET /conversas/:id/mensagens` · `POST /conversas/:id/mensagens` · `POST /conversas/:id/assumir` · `POST /conversas/:id/devolver-ia` · `POST /conversas/:id/encerrar` · `POST /conversas/:id/transferir` · `GET /fila` · `POST /conversas/:id/notas` · `GET /conversas/:id/notas` · `POST /mensagens/:msgId/reacao` · `DELETE /mensagens/:msgId` · `GET /respostas-rapidas` · `GET /stats` | A |
| **chat** | `PUT /modo` | AD |
| **clientes** | `GET /` · `GET /:conversaId` — ⛔ *`GET /buscar` removido em 2026-08-26; ambas passaram a ler a view `clientes_contato` e a exigir a capacidade `cliente360`* | A |
| ~~**ocorrencias**~~ | ⛔ **Router removido em 2026-08-26.** Era: `GET /` · `GET /tipos` · `GET /:id` · `POST /` · `PUT /:id` · `POST /:id/fechar` · `POST /:id/notas`. | — |
| ~~**ordens**~~ | ⛔ **Router removido em 2026-08-26.** Era: `GET /` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id`. | — |
| **tarefas** | `GET /` · `POST /` · `PUT /:id` · `DELETE /:id` | A |
| **satisfacao** | `GET /resumo` · `GET /avaliacoes` · `POST /avaliacoes` | A |
| **agentes** | `GET /` · `GET /online` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id` | AD |
| **fluxos** | `GET /` · `GET /:id` · `POST /` · `PUT /:id` · `DELETE /:id` · `POST /:id/ativar` · `POST /:id/despublicar` · `POST /:id/validar` · `POST /:id/simular` · `POST /:id/simular-real` · `POST /:id/compartilhar` · `DELETE /:id/compartilhar` | AD |
| **prompts** | `GET /` · `PUT /:slug` · `POST /:slug/restaurar` | AD |
| **sysconfig** | `GET /` · `PUT /` · `GET /:chave` · `POST /tools/test` | AD |
| **planos** | `GET /` · `POST /` · `PUT /:id` · `DELETE /:id` | AD |
| **canais** | `GET /` · `PUT /:tipo` | AD |
| **dashboard** | `GET /kpis` · `GET /serie` · `GET /agentes` | AD |
| **financeiro** | `GET /resumo` · `GET /cobrancas` · `GET /regua` · `PUT /regua` | AD |
| **monitor** | `GET /status` · `POST /ping` | AD |

> **Observação sobre `POST /api/monitor/ping`.** ⛔ **Endpoint removido em 2026-08-26**, junto com `GET /api/monitor/status`. O registro fica porque descrevia uma incoerência real: o endpoint destinava-se a receber pings de equipamentos, mas estava sob guarda de administrador — um agente coletor precisaria de credencial de administrador para reportar. O router `monitor` permanece, servindo `GET /erros`, `PUT /erros/:id` e `GET /saude` (tela Saúde do Sistema).

---

## 8. Estado de implementação

### 8.1 Matriz de maturidade por módulo

| Módulo | Maturidade | Verificação | Observação |
|---|---|---|---|
| Autenticação | ●●●●○ | Produção | Falta aplicar permissões no backend |
| Ingestão e canais | ●●●●○ | Produção (Evolution, Telegram) | Meta sem rota de mídia; dedup não validada em banco |
| Motor de fluxo | ●●●●○ | Produção | Estado volátil; nós de SGP inconfiguráveis pela tela |
| IA com tool calling | ●●●●○ | Produção | Memória estruturada não validada em conversa completa |
| Integração SGP | ●●●●○ | Produção | Acoplada à NetGo |
| Diagnóstico de ONU | ●●●●○ | Testes unitários | Requer credencial do banco do SGP |
| Atendimento e fila | ●●●●○ | Produção | Corrida na geração de protocolo |
| Supervisora IA | ●●●○○ | Parcial | Análise ao encerrar não é invocada |
| Tempo real (SSE) | ●●●●○ | Produção (modo local) | Pub/sub Redis não exercitado |
| Editor de fluxos | ●●●○○ | Produção | Sem painel para nós de SGP; PropsPanel duplicado |
| Ferramentas de teste | ●●●●○ | Testes unitários | Divergência do simulador em `consultar_cliente` |
| Prompts | ●●●●○ | Produção | Dois caches; catálogo desatualizado |
| Configuração | ●●●●○ | Produção | Chaves sem mascaramento |
| Métricas e NPS | ●●●○○ | Produção | Duas tabelas de NPS |
| Operações ISP | ●●○○○ | Parcial | Duas telas sem rota; atribuição em massa |
| Multi-tenancy | ○○○○○ | — | Inexistente por decisão (`RES-03`) |
| E-mail / VoIP / SMS | ○○○○○ | — | Apenas placeholders |

### 8.2 Itens verificados apenas por leitura estática

Estes itens estão implementados no código mas **nunca foram exercitados no ambiente em que importam**. Tratá-los como funcionais é uma aposta, não uma conclusão.

> **Atualização de 2026-08-21 (FASE 0 do Plano de Evolução).** Os dois primeiros itens deixaram de ser aposta: foram exercitados contra PostgreSQL 16 e Redis 7 reais, com testes de integração em `apps/api/tests/integracao/`. Permanecem na tabela, marcados, para que o registro do que era desconhecido não se perca.

| Item | Por que não foi validado | Risco se estiver errado |
|---|---|---|
| ~~Migration `008` e cláusula `onConflict` de deduplicação~~ **✅ VALIDADO 2026-08-21** | ~~Máquina de desenvolvimento sem PostgreSQL local~~ — resolvido com PostgreSQL nativo (não há Docker na máquina) | Risco eliminado. Descoberto no caminho: `onConflict` é incondicional, então sem o índice da `008` **todo** insert de mensagem falha, não só o duplicado |
| ~~Conexão Redis pub/sub (`ioredis`)~~ **✅ VALIDADO 2026-08-21** | ~~Nunca houve execução com Redis real~~ — exercitado com duas instâncias do módulo contra Redis 7.4.8 | Risco eliminado. Broadcast cruza instâncias, `sendToAgente` respeita o destinatário e `ehEcoProprio` impede entrega dupla |
| Análise profunda de sentimento ao encerrar | Depende de execução da rota | Sentimento, tópico e resumo permanecem vazios |
| Religamento de `motorLoop` no motor | Exige Docker para validar | Laço duplicado continua a divergir com o tempo |
| Memória estruturada em conversa longa real | Validada apenas no pré-cadastro isolado | IA volta a re-perguntar em cadastro extenso |
| Capacidade sob carga | Nunca houve teste de carga | Premissa de processo único pode não se sustentar |

### 8.3 Dívida técnica priorizada

| # | Item | Impacto | Esforço |
|:---:|---|---|---|
| **1** | **Persistir o estado de execução** (banco ou Redis, por `conversa_id`) | Elimina `RES-01` e destrava `RES-02`; hoje todo deploy derruba conversas em andamento | Alto |
| **2** | **Mascarar `GET /sysconfig` e cifrar `sistema_kv`** | Uma sessão de administrador comprometida deixa de entregar todas as credenciais | Médio |
| **3** | **Painel de propriedades para os nós de SGP** | Destrava `consultar_cliente`, hoje mudo em produção | Médio |
| **4** | **Remover os registros de depuração com PII** | Para de gravar CPF, endereço e senha padrão no console | Baixo |
| **5** | **Validar migration `008` e o Redis contra serviços reais** | Converte duas apostas em fatos | Baixo |
| **6** | **Aplicar as permissões granulares no backend** e corrigir a atribuição em massa | Fecha a lacuna entre a interface e a autorização real | Médio |
| **7** | **Reconciliar as duas tabelas de NPS** | Elimina a contradição entre Dashboard e tela de Satisfação | Médio |
| **8** | **Parametrizar o acoplamento à NetGo** (NAS, POP, portador, prompts) | Pré-requisito de revenda | Alto |
| **9** | **Fechar os mismatches editor↔motor restantes** | `gatilho_keyword`, `aguardar_resposta`, `condicao_multipla`, portas mortas | Médio |
| **10** | **Corrigir a divergência do simulador em `consultar_cliente`** | Remove um falso positivo de confiança | Baixo |
| **11** | **Montar `/api/media`** | Habilita mídia no canal WhatsApp oficial | Baixo |
| **12** | **Dar rota a Tarefas e Financeiro, ou removê-las** | Elimina código inacessível | Baixo |
| **13** | **Validar assinatura de origem nos webhooks** | Impede injeção de mensagem por terceiros | Médio |
| **14** | **Implementar um agendador** | Destrava `aguardar_tempo` e os timeouts de espera | Alto |
| **15** | **Testes de integração e integração contínua** | Hoje toda validação de rota, banco e integração é manual | Alto |

### 8.4 Requisitos aspiracionais não implementados

Referenciados em configuração, dependências ou interface, sem implementação efetiva. Registrados aqui para que não sejam confundidos com funcionalidade existente.

| Área | Evidência de intenção | Realidade |
|---|---|---|
| Canal de e-mail | `imapflow`, `nodemailer`, nó `enviar_email`, tela E-mail, variáveis IMAP/SMTP | Nó apenas registra em log; tela vazia |
| Canal VoIP | Tela VoIP, variáveis de Asterisk | Placeholder |
| Canal SMS | Tipo de canal configurável | Sem transporte |
| Notificações push | `web-push`, variáveis VAPID | Não implementado |
| Pagamentos | `mercadopago` | Não utilizado |
| Acesso SSH a equipamento | `ssh2` | Não utilizado |
| ACS / TR-069 | `consultar_onu_acs`, `reiniciar_onu_acs`, tela Dispositivos | Reinício é stub; a consulta foi substituída por leitura do banco do SGP |
| Analytics | Tela roteada | Vazia |
| Gestão de frota | Permissão e tela | Vazia |
| Multi-tenancy | — | Inexistente por decisão |

### 8.5 Estado operacional

O sistema **está em produção** em VPS gerida por Coolify, atendendo em `https://gochat.netgo.net.br`. O SGP responde de verdade, a IA comercial opera com tool calling, e o pré-cadastro, a listagem de planos e a memória estruturada já foram exercitados em conversa real.

Ainda assim, **o volume real é aproximadamente zero** — o painel reporta trinta dias sem movimento significativo. O sistema está de pé, mas ainda não em operação de fato. O caminho ponta a ponta com um cliente real é a próxima fronteira, e é ele que vai converter boa parte da Seção 8.2 em conhecimento.

---

## 9. Apêndices

### Apêndice A — Rastreabilidade: requisito → código

| Grupo | Implementação principal |
|---|---|
| `RF-AUT` | `apps/api/src/middlewares/auth.js` · `routes/auth.js` |
| `RF-CAN` | `services/webhooks/{evolution,meta,telegram}.js` · `routes/webhooks.js` |
| `RF-MOT` | `services/motorFluxo.js` · `fluxoHelpers.js` · `filaPorChave.js` · `motorLoop.js` |
| `RF-IA` | `services/iaTools.js` · `iaToolsHelpers.js` · `promptService.js` · `motorFluxo.js` (`processarIAResponde`) |
| `RF-SGP` | `services/integrations.js` · `sgpHelpers.js` · `sgpDb.js` |
| `RF-ATD` | `services/filaService.js` · `routes/chat.js` · `repositories/*` |
| `RF-SUP` | `services/supervisoraIA.js` |
| `RF-RT` | `services/sseManager.js` |
| `RF-EDT` | `services/fluxoValidador.js` · `motorSimulador.js` · `routes/fluxos.js` · `routes/chatTeste.js` · `apps/web/src/pages/FluxoEditor.jsx` |
| `RF-PRM` | `routes/prompts.js` · `apps/web/src/pages/PromptsIA.jsx` |
| `RF-CFG` | `routes/sysconfig.js` · `routes/canais.js` · `routes/planos.js` |
| `RF-MET` | `routes/dashboard.js` · `routes/satisfacao.js` · `fluxoHelpers.js` (NPS) |
| `RF-OPS` | `routes/{clientes,tarefas,cobertura,monitor,financeiro}.js` · `services/clientesHelpers.js` · `migrations/versions/{027,028}_*.js` — ⛔ `routes/{ocorrencias,ordens}.js` removidos em 2026-08-26 |
| Catálogo de nós | `apps/web/src/lib/nodeTypes.js` ↔ `services/motorFluxo.js` (`processarNo`) |
| Modelo de dados | `apps/api/src/migrations/versions/*.js` |

### Apêndice B — Ambiente versus configuração em banco

**Do ambiente (infraestrutura):**

`DATABASE_URL` · `REDIS_URL` · `JWT_SECRET` · `PORT` · `NODE_ENV` · `CORS_ORIGIN` · `META_VERIFY_TOKEN` · `ERP_URL` · `ERP_API_KEY`

**De `sistema_kv` (configuração da instância, pela tela administrativa):**

`sgp_url` · `sgp_app` · `sgp_token` · `sgpdb_host` · `sgpdb_port` · `sgpdb_name` · `sgpdb_user` · `sgpdb_password` · `evolution_url` · `evolution_key` · `anthropic_api_key` · `openai_api_key` · `telegram_bot_token` · `modo` · `horario` · `planos_texto` · `tipos_ocorrencia`

**Declaradas no `.env.example` e não lidas pelo código:** variáveis de IMAP, SMTP, Asterisk, VAPID e `META_ACCESS_TOKEN`.

### Apêndice C — Convenções operacionais herdadas da prática

Regras aprendidas na operação e que condicionam a montagem de qualquer fluxo novo. Não são preferências de estilo: cada uma corresponde a um defeito já vivido.

1. **Ligue sempre a porta `saida` dos menus.** Solta, o motor cai no terceiro recuo de `encontrarProximo` e manda o cliente para um ramo arbitrário, em silêncio.
2. **Coloque um `enviar_texto` antes de todo `transferir_agente`.** A transferência não envia mensagem alguma; sem isso a conversa morre na cara do cliente.
3. **Dimensione `max_turns` pelo caso de uso.** Cadastro comercial exige ≈ 25; suporte com diagnóstico, ≈ 12. O padrão de 6 encerra um cadastro no meio.
4. **`contexto` do nó de IA precisa ser o slug exato.** `suporte`, não `"Suporte Técnico"`.
5. **Ative `precadastrar_cliente` apenas no ramo comercial.** Ela fica fora do padrão de propósito.
6. **Rode o validador antes de ativar.** O alvo é zero erros e zero avisos.
7. **Nós de SGP se configuram pelo JSON do fluxo**, não pela tela — o contorno sobrevive ao salvamento.

### Apêndice D — Histórico de revisões

| Versão | Data | Alterações | Autor |
|---|---|---|---|
| 1.0 | 2026-08-21 | Linha de base inicial. Reconstrução as-is a partir do código no commit `32a558c`, com verificação direta de endpoints, tipos de nó, ferramentas, schema e suíte de testes. | Engenharia GoCHAT |
| 1.1 | 2026-08-26 | **Averbação de remoções.** Migrations `027` (drop de `ocorrencias`, `ordens_servico`, `equipamentos_rede`, `alertas_rede`) e `028` (view `clientes_contato`). Requisitos `RF-OPS-002`, `RF-OPS-003`, `RF-OPS-004`, `RF-OPS-007` e `RF-OPS-008` marcados ⛔ **Removido**, com a redação original preservada e o motivo registrado; `RF-OPS-001` **redefinido** (Clientes = histórico de contato); `RF-OPS-011` e `RNF-SEG-007` fechados. Nenhuma linha foi excluída — o documento é histórico e precisa continuar rastreável a partir de commits e logs antigos. Detalhe em `brain/work/tasks/2026-08-26_remocao-erp-e-clientes-historico.md`. | Engenharia GoCHAT |

---

*Documento gerado a partir da inspeção direta do código-fonte e da memória institucional do projeto (`brain/`). Onde as duas fontes divergiram, prevaleceu o código — e a divergência foi registrada.*
