---
title: Plano de Evolução V1.0 — status consolidado
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: active
priority: p1
knowledge_refs: ["systems/maxxi/overview"]
related: ["[[FASE 13 — Observabilidade e hardening]]", "[[FASE 12 — Conversation Events + Analytics]]", "[[FASE 11 — Quality AI V1]]", "[[Knowledge Hub]]", "[[Playbook Engine]]", "[[Cliente 360 e Copiloto]]", "[[FASE 10 — Copiloto V1]]", "[[FASE 9 — AI Runtime V1]]", "[[FASE 8 — Playbook Engine]]", "[[FASE 7 — Knowledge Hub]]", "[[FASE 6 — Cliente 360]]", "[[FASE 5 — Equipes, Filas e Human Handoff]]", "[[FASE 4 — Inbox, Outbox e Jobs]]", "[[FASE 0 — Reconciliação e linha de base]]", "[[FASE 1 — Fundação crítica / P0 (motor persistente)]]", "[[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]]", "[[FASE 3 — Segurança e governança base]]", "[[Maxxi v2 / GoCHAT — Visão geral]]"]
aliases: ["status do plano", "onde estamos", "roadmap V1.0", "progresso das fases"]
tags: [work, task, plano-evolucao, status, roadmap]
---

# Plano de Evolução V1.0 — status consolidado

Rastreador único de [docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md](../../../docs/ers/GoCHAT_Plano_Evolucao_V1_Completo.md)
(2579 linhas, 26 partes, 13 fases). Cada fase tem sua própria página com o
detalhe; aqui fica só o quadro.

## Placar

**✅ 13 de 13 fases entregues.** O Plano de Evolução V1.0 está completo. As 0–5 estão **em produção** (a FASE 5 confirmada
no ar em 2026-08-22 14:04 UTC — `GET /api/atendimento/filas` em 401 nas 12 de
12 requisições, e `/health/ready` em 200, provando as migrations até a 017).
A FASE 6 foi fechada em 2026-08-22 e sobe no mesmo push.

| Fase | Título | Estado | Página |
|:---:|---|---|---|
| 0 | Reconciliação e linha de base | ✅ | [[FASE 0 — Reconciliação e linha de base]] |
| 1 | Fundação crítica / P0 | ✅ | [[FASE 1 — Fundação crítica / P0 (motor persistente)]] |
| 2 | Registry Foundation | ✅ | [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] |
| 3 | Segurança e governança base | ✅ | [[FASE 3 — Segurança e governança base]] |
| 4 | Inbox, Outbox e Jobs | ✅ | [[FASE 4 — Inbox, Outbox e Jobs]] |
| 5 | Equipes, Filas e Human Handoff | ✅ | [[FASE 5 — Equipes, Filas e Human Handoff]] |
| 6 | Cliente 360 | ✅ | [[FASE 6 — Cliente 360]] |
| 7 | Knowledge Hub | ✅ | [[FASE 7 — Knowledge Hub]] |
| 8 | Playbook Engine | ✅ | [[FASE 8 — Playbook Engine]] |
| 9 | AI Runtime V1 | ✅ | [[FASE 9 — AI Runtime V1]] |
| 10 | Copilot V1 | ✅ | [[FASE 10 — Copiloto V1]] |
| 11 | Quality AI V1 | ✅ | [[FASE 11 — Quality AI V1]] |
| 12 | Conversation Events + Analytics | ✅ | [[FASE 12 — Conversation Events + Analytics]] |
| 13 | Observabilidade e hardening | ✅ | [[FASE 13 — Observabilidade e hardening]] |

Suítes ao fechar a FASE 10: **407 testes puros · 209 de integração**.
Migrations: **16 arquivos, até a 017** (014 `flow_executions`, 015 `audit_log`,
016 `inbox`/`outbox`/`jobs`, 017 `filas`/`agentes_filas`).

## ✅ O placar e a produção voltaram a bater (2026-08-22 04:26 UTC)

O push da FASE 4 (04:17 UTC) **deployou** em ~9 min. Confirmado por sonda de
rota: `GET /api/filas` → **401** (rota nascida na FASE 4) e `/health/ready` →
**200**, que também prova as migrations até a **016** aplicadas em produção.
As FASES 1 a 4 estão no ar.

**Uma requisição só não confirma nada** (aprendido na FASE 5): durante o
rollout a mesma URL devolveu `404 401 404` em três chamadas seguidas — duas
versões atendendo ao mesmo tempo atrás do balanceador. Sonde 6+ vezes e só
aceite se todas concordarem; um laço que para no primeiro status diferente do
antigo dá falso positivo.

**A sonda que esta doc recomendava estava errada.** O `last-modified` de
`GET /` NÃO se moveu com esse deploy (seguiu em 03:31) — dá falso negativo, e
foi provavelmente o que sustentou o diagnóstico de "o Coolify não deploya" de
21/08. A sonda confiável é uma **rota que só existe no código novo**: 404 =
antigo, 401/200 = novo. `/health` devolve `2.0.0` fixo e nunca serviu.

## Dívida que cada fase deixou explícita

Não são esquecimentos — foram decisões registradas com o motivo.

| Origem | Teto assumido | Fecha em |
|---|---|---|
| FASE 1 | Concorrência **entre processos** não resolvida (`filaPorChave` é intra-processo) | lock distribuído, quando houver multi-worker |
| ~~FASE 1~~ | ~~Morte no meio do turno perde o gatilho~~ | ✅ FASE 4 (`inbox`, §125) |
| FASE 1 | Estado é durável, **envio não** — pode ficar "aguardando menu" com o cliente sem ter visto o menu | **FASE 4** (Outbox, §126) |
| FASE 1 | `estado` carrega PII (CPF, contratos, PIX, 50 msgs) sem retenção | política de retenção, §116 |
| FASE 1 | Dreno de 8 s pode cortar turno longo de IA | subir junto com `stop_grace_period` |
| FASE 2 | Portas divergentes entre catálogo e motor (`enviar_email`) — **documentadas**, não renomeadas | exige mapa de migração |
| FASE 2 | Tool Registry **mínimo**: só `allowed_in_sandbox` | campos de risco/permissão na FASE 5+ |
| ~~FASE 3~~ | ~~Permissões granulares + Supervisor~~ | ✅ FASE 5 (`agentes_filas.supervisor` toma conversa alheia da própria fila) |
| FASE 5 | Capacidade checada **fora** de transação: dois cliques do mesmo agente estouram o teto em 1 | `SELECT ... FOR UPDATE` no agente, se doer |
| FASE 5 | SSE não é filtrado por fila — o evento vai para todos | filtro por assinatura de fila no `sseManager` |
| FASE 5 | Sem distribuição automática (round-robin/push): o agente **puxa** | roteamento ativo, se o volume exigir |
| ~~FASE 3~~ | ~~Mascarar CPF/telefone na UI~~ | ✅ FASE 6 — e mais forte: mascarado **no servidor**, não na tela |
| ~~FASE 6~~ | ~~Cliente multi-contrato: a ação age sempre no principal~~ | ✅ 2026-08-22 — seletor de contrato na lateral e no painel; a rota `/acao` já validava |
| ~~FASE 6~~ | ~~Sem endereço, tags e tempo de relacionamento~~ — **a premissa estava errada**: o `/api/ura/consultacliente/` SEMPRE devolveu endereço, serviço, WiFi e Central do Assinante; o código lia 8 campos e descartava o resto | ✅ 2026-08-22 (Painel do assinante) |
| FASE 13 | Sem OpenTelemetry/Prometheus e sem série temporal de métricas | 1 container, 1 processo, sem scraper |
| FASE 13 | Sem alerta ativo (o §140 pede tela, não alerta) | decisão de produto |
| FASE 13 | O drill de restore **nunca foi executado** | a tabela do runbook espera a primeira data |
| FASE 12 | `analytics_config` (custos unitários) só se configura pela API — falta tela | senão repete o defeito das categorias da FASE 7 |
| FASE 12 | Conversão comercial não existe: a venda fecha no SGP | o funil vai até o pré-cadastro, e o rótulo diz isso |
| FASE 11 | Sem supervisão em tempo real (1º nível do §89) — só auditoria pós-atendimento | quando houver volume |
| FASE 11 | Sem editor de critérios na tela (a régua vem semeada; editar é pela API) | quando alguém quiser calibrar de fato |
| FASE 10 | Sugestão sem streaming e resumo sem push (recalculado ao abrir o painel) | quando o volume justificar |
| FASE 10 | Sem detecção de upsell por DADO (só por texto do cliente) | cruzar plano atual × elegíveis |
| FASE 9 | O LLM Gateway existe mas não é o único caminho (motor e supervisora seguem diretos) | chamada nova nasce nele; migrar o laço é reescrita |
| FASE 9 | Multi-intenção (§72) não implementada — conflita com o Flow Engine hoje | quando o roteamento por intenção existir |
| FASE 8 | Sem score de aderência ao playbook | é FASE 11 (Quality AI) — não se inventa métrica antes de quem a consome |
| FASE 8 | Subplaybooks (§63) têm coluna, não têm UI nem execução aninhada | quando houver caso real |
| FASE 8 | Gatilhos por intenção são guardados e não roteiam | escolher playbook por intenção é FASE 9 |
| FASE 7 | Sem busca semântica: sinônimo sem raiz comum ("lerdo"/"lento") não casa | pgvector + embeddings, quando houver os dois |
| FASE 7 | Sem importação de PDF/DOCX e sem geração de rascunho a partir de atendimentos | trabalho editorial segue humano |
| FASE 6 | Timeline unificada é só local (sem pagamentos/troca de plano do ERP) | endpoint de histórico financeiro não mapeado |
| FASE 3 | Access/refresh token — encurtar TTL hoje desloga todo mundo | sessão dedicada a auth |
| FASE 3 | Cripto: chave mestra vive no env do **mesmo** container | protege contra dump de banco, não contra shell |

## FASE 4 — entregue (2026-08-22)

Detalhe em [[FASE 4 — Inbox, Outbox e Jobs]]. Os 14 critérios de aceite viraram
teste (`tests/integracao/fase4-filas.test.js`, 30 casos).

O que fechou: **gatilho perdido** (`inbox` guarda o payload cru e o worker roda
o `handle*` esperando o turno), **envio não durável** (`outbox` write-ahead, com
ordem por conversa) e **`aguardar_tempo` simulado** (job `flow_resume`, campo
`aguardandoTimer` e mensagem `tipo:'timer'`). De quebra, `aguardar_resposta`
ganhou `timeout`/`max_tentativas` e o descarte silencioso do dispatcher virou
`nao_suportada` visível.

Duas revisões adversariais entraram no resultado. A do PLANO, antes de
codificar, derrubou o Inbox que não fechava o próprio sintoma, o `jobs.chave`
sem `merge` (o timer dispararia uma vez só) e as portas novas como estáticas
(acusariam erro em todo fluxo existente). A do CÓDIGO, depois de pronto, pegou
dois críticos: o **envio inline não reivindicava a linha** — o tick que caísse
durante o POST entregava a mensagem duas vezes, e o critério de aceite passava
por acidente — e o **dreno do SIGTERM devolvia tudo a `pendente`**, violando a
própria regra de que turno de motor não se re-executa sozinho.

Tetos que ficam: reclaim de escrita vai para DLQ em vez de retentar (falta
idempotência de tool, §23); reprocessar entrada da Meta em lote re-executa turno
de mensagem já respondida; `aguardar_tempo → ia_responde` não é suportado (é AI
Runtime, FASE 9); `inbox.payload` guarda PII com purga de 7 dias.

## FASE 5 — entregue (2026-08-22)

Detalhe em [[FASE 5 — Equipes, Filas e Human Handoff]]. **"Equipe" e "fila"
viraram a mesma tabela**: o plano pedia as duas mais a associação
agente→equipe→fila, e a indireção não respondia nenhuma pergunta do produto
num provedor de 6 agentes. `equipe_id` em `filas` continua possível depois.

O que fechou: SLA e horário **por fila**, capacidade simultânea por agente,
"assumir próximo" com claim atômico (`SKIP LOCKED`), transferência entre filas
preservando a Flow Execution, e o nó `transferir_agente` finalmente **lendo**
`cfg.fila` — era campo de texto livre que o motor nunca leu.

De brinde, um **P0 em produção**: `routes/chat.js` chamava `auditar`/`ipDe` sem
importar desde a FASE 3, então `assumir`, `devolver-ia` e `encerrar` devolviam
500 — o handoff humano inteiro. Em ESM isso não aparece no boot nem no
`node --check`. Ficou a guarda `tests/imports-de-rota.test.js`, verificada
reintroduzindo o defeito.

## FASE 6 — entregue (2026-08-22)

Detalhe em [[FASE 6 — Cliente 360]]. **Nenhum endpoint novo do SGP foi
escrito** — a regra do plano ("não criar integrações paralelas quando a
operação já puder ser executada por Tool") foi seguida literalmente: o painel
lê por `integrations.js` e toda ação passa por `executarTool`, com
`actorType: human`.

Fechou três dívidas: **CPF/telefone mascarados** (e no servidor, não na tela),
**`agentes.permissoes` finalmente com leitor** — o campo existia desde a
migration 001 e nada nunca leu, então o admin marcava caixas e todo mundo
seguia podendo tudo — e **`agentes.capacidade` ganhou tela** (a FASE 5 criou o
limite sem porta de entrada).

A revisão adversarial pegou dois: um **IDOR nas ações** (o corpo da requisição
ia inteiro para `executarTool`, que prefere `input.contrato` ao contexto — dava
para puxar o boleto de outro assinante pela conversa deste) e um **vazamento de
histórico** entre conversas sem telefone (`where({telefone: null})` casa com
todas). Os dois viraram teste.

## FASE 7 — entregue (2026-08-22)

Detalhe em [[FASE 7 — Knowledge Hub]]. **pgvector foi descartado** com a
licença que o próprio plano deu (§54, "salvo melhor justificativa técnica após
inspeção"): a extensão não existe neste Postgres, a Anthropic não tem
embeddings e `openai_api_key` nunca foi lida por linha nenhuma do código. Entrou
full-text nativo em português, e a porta para embeddings ficou aberta dentro de
`knowledge.buscar()`.

Os dois achados que só apareceram escrevendo os testes: **acento** e **hífen**
esvaziariam a base aos olhos de quem pergunta — `conexao` não acha `conexão`, e
`wifi` não acha `Wi-Fi`, que é *a* palavra do suporte de ISP. Os dois foram
resolvidos numa função IMMUTABLE usada pelo índice **e** pela consulta.

A IA ganhou a tool `buscar_conhecimento` (no `TOOLS_PADRAO`): o "não achei" é
uma resposta útil, porque é ela que impede a IA de inventar procedimento.

## FASE 8 — entregue (2026-08-22)

Detalhe em [[FASE 8 — Playbook Engine]]. A decisão que define a fase: **a etapa
é provada pela tool que a evidencia, não pelo relato da IA**. Pedir para o
modelo se auto-reportar não serve porque a Quality AI (FASE 11) não pode
auditar um procedimento acreditando no que o próprio modelo disse ter feito.

Etapas conversacionais — quase todo o playbook comercial — não têm tool que as
prove e usam `concluir_etapa_playbook`. São dois mecanismos porque são dois
tipos de etapa.

Os dois playbooks nomeados pelo plano (§60 "Sem conexão" e §62 "Venda
residencial") entraram no seed, em rascunho: são estrutura definida pelo próprio
documento, não fato sobre o provedor — ao contrário dos artigos de conhecimento,
que não se semeiam.

## FASE 9 — entregue (2026-08-22)

Detalhe em [[FASE 9 — AI Runtime V1]]. A regra do plano ("evoluir, não
reescrever") foi seguida à risca: a mecânica do laço agêntico não foi tocada.

O que entrou e não existia: **três blocos de prompt que nenhum nó desliga** —
hierarquia de confiança (dado vivo vence documento), lista **nominal** do que
não se inventa, e guardrails de campo que proíbem orientar o cliente a abrir
ONU, mexer em fibra ou subir em poste **mesmo que ele peça**.

E o **motivo de transferência virou enum**: a IA escreve "cliente nervoso",
"está bravo", "furioso" — três strings, o mesmo fato. `normalizarMotivo`
colapsa, e o motivo vira **prioridade na fila da FASE 5**: quem chega escalado
não espera atrás de quem quer 2ª via.

De quebra, o **handoff** diz ao agente humano, em uma linha, quem é o cliente,
o que a IA já consultou (para ele não repetir) e onde parou o procedimento.

**Correção de percurso da FASE 7:** as categorias de conhecimento não tinham
tela de cadastro — a API existia e o seed criava cinco, mas o seed **não roda no
deploy**, então em produção a lista nascia vazia e sem porta de entrada. Agora
há uma aba **Categorias** em Conhecimento.

## FASE 13 — entregue (2026-08-22) · PLANO COMPLETO

Detalhe em [[FASE 13 — Observabilidade e hardening]]. Design revisado por agente
especialista contra o plano antes de codar.

O truque que evitou reescrever ~200 chamadas de log: **substituir o `console` no
boot**. E a peça que fez o correlation ID valer: o `x-request-id` do webhook
**morre no 200** — o turno roda depois, no worker —, então a âncora durável é o
**`inbox.id`**, e o `AsyncLocalStorage` leva o contexto por toda a cadeia de
`await` sem uma única edição.

**Existe UM disjuntor, e é o do SGP** — o único cujo timeout (8–12 s) é
aguardado dentro do turno do cliente. Anthropic não (429 pede backoff),
Evolution não (o outbox já é o disjuntor).

E os testes pegaram um defeito que uma tela de saúde não pode ter: a query de
fila usava `criado_em` para as três tabelas, mas **`inbox` usa `recebido_em`** —
o Postgres recusava a query, o `catch` devolvia lista vazia e a tela diria "fila
normal" enquanto a DLQ enchia.

## FASE 12 — entregue (2026-08-22)

Detalhe em [[FASE 12 — Conversation Events + Analytics]]. Design revisado por
agente especialista contra o plano antes de codar, e a conclusão dele mudou a
fase: **não existe event store**. 21 dos 24 eventos do §100 já tinham casa
tipada; duplicá-los criaria duas verdades para o mesmo fato e nasceria vazio.
O que faltava era leitura — duas views e uma camada de agregação.

**O defeito que a fase consertou antes de medir qualquer coisa:** o KPI
"resolução IA" do dashboard dava ~100% **por construção**. Ele contava
`status='encerrada' AND agente_id IS NULL`, e `conversaRepo.encerrar` **zera** o
`agente_id` — então toda conversa encerrada entrava, inclusive as atendidas por
humano do começo ao fim.

Regra que a fase impôs: **nenhum número sem contexto**. Taxa vem com a base,
qualidade com a cobertura, custo com `precos_configurados`, e o que não se sabe
é `null`, não zero.

## FASE 11 — entregue (2026-08-22)

Detalhe em [[FASE 11 — Quality AI V1]]. A regra que governa a fase é o §90: **a
conversa sozinha não basta**. Auditar lendo só o texto premiaria quem escreve
bonito e puniria quem resolveu rápido — por isso a evidência inclui o que foi
**executado**, o procedimento esperado, o desfecho e os tempos.

A IA propõe nota e justificativa; **a aritmética é nossa**. Violação crítica é
**teto**, não desconto. Penalização sem evidência é descartada, não vira zero. E
o `ai_score` sobrevive à revisão humana — a divergência é o que calibra a régua.

## Carga inicial da base de conhecimento (2026-08-22)

Migration **024**: 15 categorias e **55 artigos** fornecidos pelo operador do provedor —
44 publicados, **11 esqueletos em rascunho** ("preencher com as regras oficiais":
fidelidade, cancelamento, instalação, visita técnica, manuais). Publicar um esqueleto
faria a IA responder ao cliente com *"Existe fidelidade? Qual o período?"* como se fosse
a política; há teste garantindo que a busca **nunca** devolve um.

É a **única migration que insere texto editorial**, e só existe porque a autoria é do
operador — conhecimento escrito por quem faz o código viraria "política da casa" que
ninguém redigiu.

**A carga expôs um defeito real da busca da FASE 7:** `websearch_to_tsquery` faz **E**
entre todos os termos, e a IA passa a fala do cliente inteira. *"o cliente disse que achou
caro"* virava `client & diss & car`, e "disse" — ausente de todo artigo — derrubava a
busca com o artigo de objeção de preço bem ali. Só apareceu com conteúdo de verdade: os
artigos sintéticos dos testes geravam consultas curtas que casavam. A busca passou a fazer
**E primeiro e OU só quando o E volta vazio**.

## ⚠️ O `seed` nunca rodou em produção (achado em 2026-08-22)

O boot aplica **migrations e mais nada**. Então filas (F5), categorias de
conhecimento (F7), playbooks (F8) e perfis de IA (F9) foram entregues e **nunca
existiram em produção** — as telas abriam vazias sem que nada estivesse
quebrado, que é o pior tipo de defeito: silencioso.

Corrigido pela **migration 022**, que semeia os catálogos no boot (precedente: a
005 semeia `prompts_ia`). Resolve esta instância e toda revenda futura, sem
ninguém precisar lembrar de rodar comando.

**O que ela NÃO faz, de propósito:** criar usuário, canal, fluxo ou artigo de
conhecimento. Rodar o `seed.js` completo num ambiente que já atende inseriria um
**fluxo legado com `ativo: true`** — e o motor escolhe o fluxo com
`where({ativo:true}).first()` **sem `ORDER BY`**, então o Postgres poderia
entregar esse fluxo para toda conversa nova. O `seed.js` ganhou guarda, mas a
regra que fica é: **catálogo novo se semeia por migration**.

## FASE 10 — entregue (2026-08-22)

Detalhe em [[FASE 10 — Copiloto V1]]. O que separa um copiloto de um botão que
chama o LLM é o §79: decidir se a hora é de **responder**, **consultar** ou
**avançar o procedimento** — e não escrever parágrafo bonito quando ainda faltam
dados. Essa decisão é determinística e **não passa pelo modelo**; o modelo só
entra quando o atendente pede um texto.

A execução de tool recomendada **não ganhou rota nova**: reusa a do Cliente 360,
que já tem allowlist, permissão e auditoria. Duplicar abriria um segundo caminho
para o mesmo poder, e um deles ficaria sem a checagem do outro.

E a chamada ao modelo **nasceu no `llmGateway`** — era a promessa registrada na
FASE 9.

## See Also

- [[FASE 0 — Reconciliação e linha de base]] · [[FASE 1 — Fundação crítica / P0 (motor persistente)]] · [[FASE 2 — Registry Foundation (Node Registry + Tool Registry)]] · [[FASE 3 — Segurança e governança base]]
