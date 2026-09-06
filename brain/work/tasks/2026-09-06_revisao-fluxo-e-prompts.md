# 2026-09-06 — Revisão do fluxo ativo e do uso da IA (prompts, perfis, playbooks)

Pedido do operador: *"revisar como está o fluxo e o uso da IA, organização dos prompts, de forma que fique mais estruturado e mais funcional, para o meu provedor"*.

Método: leitura direta do banco de produção por SSH (`fluxos`, `prompts_ia`, `ia_perfis`, `playbooks`, `playbook_etapas`, `filas`, `knowledge_*`, `ia_execucoes`, `telemetria`, `mensagens` das últimas conversas), validador estático nos dois fluxos (ativo e rascunho "Teste"), e leitura do caminho do código que monta o system prompt (`resolverPrompt` → `montarSystemPrompt` → `filtrarTools`).

Entregas: [fluxo-netgo-v3.json](../../../apps/api/examples/fluxo-netgo-v3.json) (importável, validador 0/0, 6 cenários simulados) e [prompts-netgo-v3.md](../../../apps/api/examples/prompts-netgo-v3.md) (os 7 prompts, perfis, playbooks, artigos e a ordem de ativação). Mais oito correções de código, abaixo (quatro da leitura, quatro da revisão adversarial).

## O que a produção mostrou

Volume: 65 conversas desde abril, 14 nos últimos 30 dias, **todas por Telegram** (a bateria de testes do operador). WhatsApp desligado nos dois canais. É pré-lançamento — o melhor momento para reestruturar.

### O fluxo ativo (24 nós, 45 arestas)

Validador: **0 erros, 10 avisos** — quatro menus sem a porta `saida` ligada e seis arestas mortas (portas que o motor nunca emite: `nao_encontrado` no `consultar_cliente`, `sou_cliente`/`quero_ser` do primeiro botão renomeado, `wifi`/`relocacao` de itens que saíram do menu). Lidos junto com o motor:

- **`menu_cliente` sem `saida` cai na primeira aresta, que é `gerar_boleto`.** "Minha internet caiu" digitado em vez de clicado devolve uma fatura. Já era o P0 anotado em 27/08 e seguia aberto.
- **Item "Quero contratar" do menu vai para um `transferir_agente` de config vazia**: sem fila, sem mensagem antes. O cliente identificado que quer upgrade vê o chat silenciar. O mesmo nó vazio recebe as portas mortas `wifi`/`relocacao`.
- **A transferência do suporte (`n_1774212658390`) também é vazia**: nem fila `suporte_tecnico` nem mensagem. Quem pede atendente é largado sem uma linha.
- **Marca errada em produção**: o boleto sai com título *"2ª Via de Boleto — CITmax"* e o encerramento comercial manda para `https://cit.net.br/app`. Resíduo do provedor de inspiração no fluxo que atende clientes da NetGo.
- **Texto de "fora do horário" cita horas** (Seg–Sáb 8–22, Dom 8–20) que não batem com a configuração (global 8–18 Seg–Sex, **inativa**; filas sem horário). Nunca dispara hoje; no dia em que alguém ativar o horário, a mensagem mente.
- **Contrato cancelado/inativo/novo recebe o mesmo menu** com suporte técnico e "informar pagamento". O fluxo de referência do repositório manda esses para humano.
- **`modelo: "sonnet"` nos dois nós de IA — campo que o motor nunca leu.** O seletor existia no painel e gravava no nó; o turno rodava no modelo global (Haiku até 05/09, `gpt-5.4-mini` desde então). A tela dizia uma coisa e o log `[IA] provedor=… modelo=…` outra.
- Sem NPS em lugar nenhum, e o dashboard lê `satisfacao`.

### Os prompts (8 slugs, 6 editados pelo operador)

A regra da casa é "um lugar para cada coisa"; o que havia era o oposto:

- **Duas personas completas por nó.** O prompt `comercial` da aba (8.127 caracteres, "Natália") e o campo `prompt` do nó (6.962, "Netzinha") são ambos roteiros inteiros, e o motor concatena os dois com o rótulo *"Instrução específica:"*. Contradições no mesmo system prompt: fidelidade ("12 meses" × "conforme a política vigente"), idade ("valide 18+" × "não calcule idade"), cobertura (lista de bairros de Natal × `listar_planos_ativos` por cidade). No suporte, a mesma dupla (3.169 + 7.867 caracteres) discorda do **id da ocorrência de Reparo**: `333` na aba, `200` no nó e no código. E discorda do perfil: o nó diz *"não transfira sem pedido explícito"*, o perfil diz *"transfira se irritação ou visita técnica"*.
- **Custo medido:** 8.200 a 9.700 tokens de entrada por chamada (telemetria de 01/09). Num cadastro comercial de 23 turnos isso é o prompt duplicado pago 23 vezes.
- **`[REGRAS]` manda usar ferramentas que não existem** — `consultar_clientes`, `wa_enviar_pix`, `wa_enviar_botoes`, `wa_enviar_lista` — e entra em suporte, financeiro e recepção. É pressão de alucinação de tool a cada turno.
- **`[ESTILO]` diz "máximo 3 linhas"** enquanto os próprios prompts pedem lista de planos e passo a passo de reinício.
- **`faq` e `outros` se apresentam como "Maxxi, da CITmax"**, com horário, Instagram e site da CITmax. `outros` é o fallback do motor quando um slug não bate.
- **Três roteiros de suporte diferentes** (aba, nó, playbook de 9 etapas) e **dois de venda** (prompt de 6 etapas, playbook de 11). O modelo recebe todos.
- **Política e SLA cravados no prompt** — "24h úteis", "10 minutos", "12 meses", "6.500 famílias", bairros — enquanto os artigos correspondentes na base ("Política de fidelidade", "de instalação", "de visita técnica") são esqueletos em rascunho.

### Perfis, playbooks, tools, base

- **A base de conhecimento nunca foi lida.** `knowledge_uso` = 0 e nenhuma linha de `buscar_conhecimento` na telemetria, desde sempre, com 44 artigos publicados e a tool sempre-ativa desde 27/08. Com um prompt de 15 mil caracteres que responde tudo, o modelo não tem motivo para consultar.
- **Os três perfis têm `tools = []`**, que cai na lista padrão de suporte. O nó comercial do fluxo ativo (sem `tools_ativas` próprio, perfil sem tools) **não tem `listar_planos_ativos`, `listar_vencimentos` nem `precadastrar_cliente`** — o prompt manda usá-las e elas não estão na chamada. As execuções de 01/09 que as usaram são anteriores ao último salvamento do fluxo (20:06). O suporte, por sua vez, carrega `promessa_pagamento` e `segunda_via_boleto` sem precisar.
- **Perfil `financeiro` sem playbook** (o operador zerou o campo) e **playbook financeiro em rascunho**; o nó financeiro do rascunho "Teste" não aponta perfil. O financeiro roda sem procedimento e com as tools do suporte.
- **Playbook de suporte: 3 execuções, todas 0/9.** A etapa 1 exige `identificar_cliente`, mas no fluxo real quem identifica é o nó `consultar_cliente`, antes da IA — a tool nunca é chamada e o foco fica na etapa 1 para sempre. Comercial: 8 execuções, melhor caso 1/11 — o prompt seguia o roteiro dele, não o do playbook.
- **`reiniciar_onu_acs` como etapa obrigatória** (etapa 7) empurra a IA a reiniciar a ONU em todo atendimento; RADIUS (etapa 4) idem.
- **A descrição da tool `precadastrar_cliente` cravava ids de plano** (Essencial=12, Avançado=13, Premium=16, São Miguel do Gostoso…) enquanto a tabela `planos` da NetGo tem 726–730. Um modelo que confiasse na descrição cadastraria o plano errado no SGP.
- O transcript de 01/09 mostra o efeito acumulado: o cliente conta o problema ao menu, o suporte abre com *"Vou verificar sua conexão agora"* (proibido em três lugares do prompt) e depois pergunta *"qual é o problema?"* — o histórico da recepção é por nó e não atravessa a aresta.

## Decisões

- **Recepção por IA como primeiro nó** (`inicio → ia_roteador`, sem `cfg.mensagem`). É o desenho que a entrega de 05/09 construiu e o rascunho "Teste" do operador já caminha para ele. CPF só é pedido pelo ramo que precisa, e pulado quando a recepção já identificou.
- **Suspenso/reduzido no suporte vai ao financeiro**, com uma frase explicando. Deterministico, sem pedir à IA que perceba.
- **Toda transferência tem mensagem e fila.** `transferido` volta para "posso ajudar em algo mais?".
- **NPS de 1–5 antes de encerrar**, e todos os desfechos vão para `fim` (detrator para humano seria beco fora do horário).
- **Prompts curtos, sem roteiro, sem política, sem lista de tools.** Roteiro é do playbook, política é da base, tools são do perfil. O nó só aponta `perfil`.
- **Os fatos que estavam nos prompts viram artigos a confirmar**, não artigos publicados por mim: é a política que a IA vai repetir, e dois prompts discordavam do horário.
- **O id de ocorrência fica como pendência explícita** (333 do operador × 200 do código): não há como confirmar sem o SGP.

## As correções de código (branch `revisao-fluxo-ia`)

1. **`motivo_contato` atravessa a aresta.** Ao encaminhar por `direcionar_atendimento`, o motor grava em `estado.contexto.motivo_contato` o que o cliente disse à recepção (`resumirMotivoContato`, pura, testada: só falas do cliente, teto de 300 caracteres, CPF/CNPJ mascarado). A ficha `## DADOS JÁ COLETADOS` já reinjeta o campo no agente seguinte sem mais nada mudar. Determinístico de propósito: pedir à IA que chame `salvar_dado` antes de encaminhar é a garantia que o CLAUDE.md já mediu falhar.
2. **Etapa "Identificar o cliente" marcada quando o nó identificou.** `prepararParaIA` recebe `jaIdentificado` (verdadeiro quando `contexto.cliente.contrato` existe ao entrar) e registra `identificar_cliente` antes de montar o bloco. `marcar` deduplica, então repetir por turno é no-op.
3. **Descrições de tool que contradiziam o produto**: `precadastrar_cliente` sem ids de plano/POP (vêm de `listar_planos_ativos`), `criar_chamado` sem os ids da CITmax (o id vem do prompt), `transferir_para_humano` alinhada com as regras de transferência dos perfis.
4. **Seletor de modelo removido do painel do `ia_responde`**, com a frase de onde o modelo vem.

5. **`concluir_etapa_playbook` acompanha o procedimento, não a lista.** `filtrarTools` a entrega sempre que há playbook ativo, mesmo com `perfil.tools`/`cfg.tools_ativas` explícitos — toda lista explícita a omitia, e sem ela nenhuma etapa conversacional marca e nenhum playbook conclui (a mesma armadilha do `cfg.tools_ativas`, uma casa adiante).
6. **O CPF cru não entra mais no histórico da IA.** Quando o `ia_responde` entra no mesmo turno em que o nó identificou, a "primeira fala" era o documento — e ia para `_ia_hist_*` e daí para as `ultimas_mensagens` do handoff. Agora vira o marcador `[o cliente informou o CPF/CNPJ e já está identificado]` (`falaEhDocumento`, pura, testada).
7. **`nps_inline` não trava mais.** Resposta que não é número recebe uma repergunta; na segunda, segue por `neutro` sem gravar nota. Antes ficava em `aguardar()` calado e a conversa pendurava aberta até o TTL.
8. **`resumirMotivoContato` usa `redigirTexto`** (CPF, telefone, e-mail) — a mesma redação do log; e o texto de `nao_entendeu` no bloco de rotas manda pedido de atendente para `transferir_para_humano`, que registra handoff e prioridade (o `nao_entendeu` só roteia).

Suítes: 645 puros e 311 de integração, verdes (com teste de integração para `jaIdentificado`).

## O que a revisão adversarial mudou

Um revisor leu o diff e a proposta contra o motor. Do que apontou:

- **Procedeu e virou código**: `motivo_contato` ficava velho na revisita da recepção (agora sobrescreve, e a visita nova zera antes de ler a ficha); `concluir_etapa_playbook` fora de toda lista explícita; CPF cru no histórico e no handoff; NPS que travava; máscara só de CPF.
- **Procedeu e virou conteúdo**: cobertura não pode ser inferida de `listar_planos_ativos` (plano sem cidade vale para todas) — o prompt comercial consulta a base; múltiplos contratos ganharam um `definir_variavel` com aviso na ficha; o desvio suspenso→financeiro reescreve o `motivo_contato`; "fora do horário" não promete retomar (o `encerrar` apaga a execução); rótulo "Não" em vez de "Não, obrigado" (o cliente digita "não" e não casava); `regras` ganhou "não pergunte se precisa de mais algo, o fluxo pergunta"; o roteador manda pedido de atendente por `transferir_para_humano`; `outros` não nomeia tool (o modo direto roda sem tools).
- **Não procedeu**: "a fila `suporte_tecnico` não existe" — existe em produção, criada pelo operador em 22/08 (o catálogo semeado dizia `suporte`). Ficou uma nota no doc: o slug do nó tem de bater com a tela Filas, e o validador não confere.
- **Tetos aceitos**: a etapa marcada por `jaIdentificado` grava `via: 'tool'` (a Quality AI lê "identificou pela tool"); `direcionar_atendimento.resumo` é campo que o motor não lê; o marcador de mídia ("[o cliente enviou um áudio]") entra como fala no `motivo_contato`.

## Tetos e o que fica

- A conversa de ponta a ponta com o modelo no fluxo v3 **não foi exercitada** — é dado de produção (prompts, perfis, playbook) que só o operador aplica, e a identificação por IA é recusada no sandbox. A ordem de ativação está no `prompts-netgo-v3.md`, com as sondas de log que dizem se pegou.
- A recepção custa uma chamada por mensagem até encaminhar. Com `gpt-5.4-mini` e prompt curto é fração de centavo; com volume real, medir em `GET /api/analytics/executivo`.
- `motivo_contato` é gravado uma vez por conversa (não sobrescreve). Cliente que volta pelo "posso ajudar em algo mais?" com assunto novo carrega o motivo antigo na ficha — teto aceito; limpar na reentrada do `ia_roteador` é a próxima linha se incomodar.
- Os artigos da seção 4 dependem de o operador confirmar o conteúdo. Até lá, a IA responde política com "vou confirmar com a equipe", que é o comportamento certo para o que não está escrito.
