# GoCHAT — Plano Mestre de Evolução V1.0
## Especificação TO-BE + Plano de Execução

| Campo | Valor |
|---|---|
| Documento | Plano Mestre de Evolução GoCHAT |
| Versão | 2.0 |
| Data | 21/08/2026 |
| Documento-base AS-IS | `ERS-GoCHAT-v1.0.md` |
| Natureza | TO-BE / arquitetura / requisitos / roadmap de implementação |
| Estratégia | Evolução incremental sobre o GoCHAT existente |
| Modelo comercial inicial | Single-tenant por instância/provedor |
| Público principal | IA de programação, engenharia e responsável de produto |

---

# PARTE I — COMO USAR ESTE DOCUMENTO

## 1. Objetivo

Este documento consolida as decisões de produto, arquitetura e implementação aprovadas para a evolução do GoCHAT V1.0.

Ele deve ser utilizado em conjunto com o `ERS-GoCHAT-v1.0.md`:

- o **ERS** descreve o sistema **como ele existe hoje (AS-IS)**;
- este documento descreve **como o produto deve evoluir (TO-BE)**;
- em caso de dúvida sobre comportamento legado, o código e o ERS devem ser inspecionados antes da alteração;
- este documento não autoriza uma reescrita completa do sistema.

A implementação deve ser incremental, testável e compatível com a base existente sempre que isso for tecnicamente razoável.

## 2. Como a IA de programação deve trabalhar

A IA de programação NÃO deve tentar executar todo o documento de uma vez.

Este documento contém duas camadas:

1. **Especificação do produto e arquitetura** — define o estado-alvo.
2. **Plano de Execução** — divide o trabalho em fases e dependências.

Ao iniciar uma etapa, a IA deve:

1. Ler o ERS atual e este documento.
2. Inspecionar o código relacionado à fase solicitada.
3. Mapear impactos e compatibilidade.
4. Criar ou atualizar testes antes ou junto da mudança.
5. Criar migrations quando houver alteração persistente.
6. Implementar apenas a fase ou o conjunto de requisitos solicitado.
7. Validar critérios de aceite.
8. Atualizar documentação técnica quando o comportamento real mudar.

## 3. Regra central

> **O GoCHAT deve evoluir sobre a base atual. Não reescrever o produto do zero.**

Preservar, quando possível:

- fluxos existentes;
- histórico e conversas;
- integrações já validadas;
- compatibilidade com configurações legadas;
- rotas públicas necessárias;
- estratégia de deploy atual.

---

# PARTE II — VISÃO DE PRODUTO E DECISÕES APROVADAS

## 4. Visão do GoCHAT

O GoCHAT não será um ERP.

Seu papel é ser a **camada inteligente de atendimento do provedor**, posicionada entre os canais de comunicação, os clientes, os atendentes humanos e os sistemas operacionais do ISP.

O produto deve se especializar em:

- atendimento omnichannel;
- automação por fluxos;
- IA operacional para provedores;
- consultas e ações reais no ERP;
- suporte técnico assistido por IA;
- atendimento comercial assistido por IA;
- transferência contextual para humanos;
- apoio ao atendente com Copiloto;
- auditoria de qualidade com IA;
- base de conhecimento especializada em ISP;
- playbooks operacionais;
- métricas de eficiência, qualidade e resultado.

## 5. Decisões de produto aprovadas

### DEC-001 — GoCHAT não será ERP

O SGP/ERP continuará sendo fonte primária para dados e processos que já pertencem ao ERP, incluindo clientes, contratos, faturas, dados operacionais, chamados e demais registros oficiais.

O GoCHAT pode armazenar dados próprios necessários para:

- conversas;
- contexto de atendimento;
- execução de fluxos;
- auditoria;
- knowledge base;
- playbooks;
- qualidade;
- telemetria;
- filas;
- configurações de IA e ferramentas.

### DEC-002 — Single-tenant temporariamente

Cada provedor terá uma instância isolada:

- aplicação própria;
- PostgreSQL próprio;
- Redis próprio ou isolado;
- credenciais próprias;
- fluxos próprios;
- Knowledge Base própria;
- configurações próprias.

Não implementar `company_id` ou row-level multi-tenancy na V1.0.

### DEC-003 — Núcleo do produto

O coração tecnológico do GoCHAT será:

1. Conversation Engine.
2. Flow Engine.
3. AI Runtime.
4. Tool Registry.
5. Node Registry.
6. Knowledge Hub.
7. Playbook Engine.
8. Human Handoff / Filas.
9. Copilot.
10. Quality AI.
11. Analytics.

### DEC-004 — O Flow Engine continua existindo

A IA não substitui o Flow Engine.

O fluxo continua sendo responsável por:

- controlar a jornada;
- definir caminhos determinísticos;
- selecionar contexto/perfil;
- decidir entrada em IA;
- rotear para filas;
- disparar pós-atendimento;
- NPS;
- encerramento.

### DEC-005 — IA e nós podem usar a mesma Tool

Um nó visual e uma IA podem representar experiências diferentes, mas quando executarem a mesma operação externa devem reutilizar o mesmo executor do Tool Registry.

Exemplo:

```text
Nó Segunda Via ─┐
                ├─> Tool Registry: segunda_via_boleto ─> SGP
IA Financeiro ──┘
```

### DEC-006 — Filas com assunção manual

Na V1.0, o GoCHAT **não distribuirá automaticamente** conversas entre agentes.

O Flow Engine direciona a conversa para uma FILA. Agentes elegíveis visualizam as conversas e escolhem `Assumir`.

O sistema continua responsável por:

- elegibilidade;
- permissões;
- prioridade;
- SLA;
- ordenação;
- capacidade simultânea;
- horário da fila;
- transferência entre filas.

### DEC-007 — IA recomenda; humano decide em ações sensíveis

No atendimento humano, o Copiloto pode recomendar ações e respostas, mas não deve executar ações sensíveis sem intervenção adequada.

### DEC-008 — Comercial e Suporte são os primeiros domínios Quality AI

V1.0:

- Supervisora Comercial;
- Supervisora de Suporte.

Financeiro e Retenção ficam preparados arquiteturalmente, mas fora do escopo funcional inicial.

---

# PARTE III — ARQUITETURA ALVO

## 6. Arquitetura conceitual

```text
                         CANAIS
                 WhatsApp / Telegram
                           │
                           ▼
                        INBOX
                           │
                           ▼
                  CONVERSATION ENGINE
                           │
                  Conversation Context
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
      FLOW ENGINE       AI RUNTIME        FILAS
          │                │                │
          │        ┌───────┼────────┐       ▼
          │        ▼       ▼        ▼     HUMANOS
          │    KNOWLEDGE PLAYBOOK  TOOLS     │
          │        │       │        │        ▼
          │        └───────┼────────┘     COPILOT
          │                │
          └────────────────┼────────────────────┐
                           ▼                    │
                      TOOL REGISTRY             │
                           │                    │
                           ▼                    │
                   SGP / RADIUS / APIs          │
                                                │
                           ┌────────────────────┘
                           ▼
                       QUALITY AI
                  Comercial / Suporte
                           │
                           ▼
                        ANALYTICS
```

## 7. Fontes de verdade

### 7.1 PostgreSQL

Fonte durável da verdade para:

- conversas;
- mensagens;
- execução de fluxo;
- eventos;
- auditoria;
- Knowledge Base;
- Playbooks;
- filas;
- Quality AI;
- configuração persistente.

### 7.2 Redis

Utilizar para:

- jobs;
- locks;
- cache;
- pub/sub;
- rate limiting;
- processamento temporário.

Redis não deve ser a única fonte da verdade para o estado de uma conversa.

### 7.3 ERP / SGP

Fonte da verdade para dados operacionais do cliente e processos oficiais integrados.

### 7.4 LLM

A LLM nunca é fonte de verdade para preço, contrato, boleto, cobertura, protocolo, manutenção, estado de conexão ou qualquer outro dado operacional vivo.

---

# PARTE IV — P0: FLOW ENGINE PERSISTENTE

## 8. Objetivo

Eliminar o estado volátil do motor e permitir que uma conversa sobreviva a:

- deploy;
- restart;
- falha do processo;
- troca de container;
- futura execução com mais de um worker/processo.

## 9. Modelo de execução persistente

Criar entidade `flow_executions` ou equivalente.

Campos conceituais mínimos:

```text
id
conversation_id
flow_id
flow_version
current_node_id
status
waiting_for
resume_node_id
context jsonb
playbook_state jsonb
revision
started_at
updated_at
completed_at
last_error
```

Status sugeridos:

```text
running
waiting_input
waiting_job
waiting_human
completed
failed
```

## 10. Concorrência

Implementar controle de concorrência por conversa.

Manter serialização lógica e adicionar persistência com `revision` ou mecanismo equivalente de optimistic locking.

Objetivo:

> duas mensagens simultâneas da mesma conversa não podem corromper o estado.

## 11. Conversa ≠ execução

A conversa representa a sessão de atendimento.

A execução representa a posição e contexto da automação.

Isso deve permitir:

```text
IA → Humano → IA → NPS → Encerramento
```

sem perder o Flow Execution original.

## 12. Versão fixa por conversa

Se uma conversa iniciou no fluxo v13, a publicação do v14 não deve alterar aquela execução.

Nova conversa utiliza a nova versão publicada.

## 13. Retornar para IA

Quando o humano assumir, a execução pode entrar em `waiting_human`.

O agente terá ações distintas:

- Encerrar atendimento;
- Retornar para automação/IA.

Ao retornar, o motor retoma no nó configurado ou na continuação persistida.

## 14. Critérios de aceite P0

- Restart do container não reinicia conversa em andamento.
- Deploy não perde contexto.
- Duas mensagens simultâneas não causam salto de nó.
- Conversa pode ir para humano e retornar ao fluxo.
- Nova versão do fluxo não altera execução já iniciada.
- Estado pode ser inspecionado no banco.
- Testes de integração cobrem persistência e retomada.

---

# PARTE V — NODE REGISTRY

## 15. Problema

Hoje catálogo visual, motor, validador, simulador e painel de propriedades podem divergir.

O objetivo é criar um **Node Registry como definição única do tipo de nó**.

## 16. Estrutura conceitual

```javascript
nodeRegistry = {
  consultar_cliente: {
    label: 'Consultar cliente',
    category: 'SGP',
    fields: {...},
    ports: [...],
    execute: ...,
    validate: ...,
    simulator: ...
  }
}
```

O formato final pode variar, desde que a informação não permaneça duplicada manualmente em várias camadas.

## 17. O Registry deve alimentar

- paleta do editor;
- painel de propriedades;
- portas;
- validação;
- schema de configuração;
- motor;
- simulador;
- documentação técnica.

## 18. Compatibilidade

Manter aliases/mapeamentos para propriedades legadas quando necessário.

Fluxos existentes não devem quebrar por simples renomeação interna.

## 19. Critérios de aceite

- Todo nó executável possui configuração visual ou é explicitamente `internal_only`.
- Editor e motor usam os mesmos nomes de configuração.
- Portas válidas derivam da mesma definição.
- Validador e simulador deixam de duplicar manualmente metadados de nós.

---

# PARTE VI — TOOL REGISTRY

## 20. Objetivo

Centralizar consultas e ações externas reutilizadas por:

- IA Atendente;
- nós do Flow Engine;
- Cliente 360;
- Copiloto;
- testes;
- futuras automações.

## 21. Metadados mínimos por Tool

```text
name
description
category
input_schema
output_schema
executor
is_write
risk_level
requires_confirmation
allowed_ai_profiles
allowed_roles
allowed_teams
allowed_in_sandbox
audit_required
idempotency_strategy
timeout
retry_policy
```

## 22. Níveis de risco

### Risk 0 — leitura

Exemplos:

- consultar cliente;
- consultar ONU;
- consultar RADIUS;
- consultar manutenção;
- listar planos.

### Risk 1 — baixo risco

Exemplo:

- gerar/enviar segunda via.

### Risk 2 — exige confirmação

Exemplos:

- criar chamado;
- promessa de pagamento;
- pré-cadastro.

### Risk 3 — sensível/crítico

Preparar arquitetura para operações futuras como alteração contratual ou cancelamento.

## 23. Tool de escrita e idempotência

Operações de escrita precisam de chave de idempotência ou proteção equivalente.

Retries não podem gerar:

- dois chamados;
- dois pré-cadastros;
- duas promessas;
- duas operações equivalentes.

## 24. Sandbox

Tools de leitura podem funcionar em modo real, conforme política.

Tools de escrita devem respeitar `allowed_in_sandbox` e normalmente ser bloqueadas/simuladas.

---

# PARTE VII — CLIENTE 360

## 25. Objetivo

Transformar a lateral da tela de atendimento em uma **Central Operacional do Assinante**, combinando dados do ERP com inteligência do GoCHAT.

Não deve ser apenas uma cópia de cadastro do SGP.

## 26. Layout conceitual

A tela de atendimento deve possuir:

```text
Conversas | Chat | Painel lateral
```

O painel lateral pode trabalhar com abas:

- Cliente;
- Copiloto;
- Playbook.

Dentro de Cliente 360, utilizar blocos/abas contextuais.

## 27. Visão Geral

Exibir, quando disponível:

- nome;
- CPF mascarado;
- telefone mascarado;
- contrato atual;
- outros contratos;
- status;
- plano;
- valor;
- endereço;
- cidade;
- POP;
- tempo de relacionamento;
- tags;
- situação financeira resumida;
- estado da conexão;
- chamados recentes;
- NPS;
- recorrência de atendimento.

## 28. Financeiro

Possíveis informações:

- títulos em aberto;
- títulos vencidos;
- próximo vencimento;
- último pagamento;
- valor atual;
- total em atraso.

Ações rápidas, conforme Tool Registry e permissão:

- segunda via;
- enviar boleto;
- enviar PIX;
- copiar PIX;
- linha digitável;
- promessa de pagamento.

## 29. Diagnóstico

Exibir, conforme integrações disponíveis:

- contrato ativo/inativo;
- PPPoE;
- sessão RADIUS;
- IP;
- ONU/ONT;
- sinal óptico;
- qualidade do sinal;
- uptime;
- última queda;
- manutenção regional;
- equipamento/CPE.

Criar ação:

### Diagnóstico Completo

Executar um conjunto coordenado de Tools de leitura, por exemplo:

```text
consultar_cliente
consultar_manutencao
consultar_radius
consultar_onu
consultar_historico
```

Gerar resultado resumido e evidências.

## 30. Histórico 360

Unificar timeline de relacionamento com eventos relevantes:

- conversas;
- chamados;
- OS quando disponíveis;
- pagamentos relevantes;
- alteração de plano;
- NPS;
- transferências;
- diagnósticos.

Não duplicar dados oficiais desnecessariamente; buscar do ERP quando apropriado.

## 31. Chamados

Permitir:

- visualizar chamados recentes;
- abrir chamado via Tool;
- preencher automaticamente contexto técnico;
- anexar resumo da conversa;
- anexar diagnóstico realizado;
- exibir protocolo retornado.

## 32. Comercial

Exibir:

- plano atual;
- planos elegíveis;
- diferença de preço;
- benefícios;
- oportunidade de upgrade;
- cobertura;
- pré-cadastro.

Preço e disponibilidade devem vir de fonte viva/Tool.

## 33. Ações rápidas

Ações configuráveis por equipe e permissão.

Exemplos:

- Enviar boleto;
- Diagnosticar;
- Abrir chamado;
- Consultar cobertura;
- Pré-cadastrar;
- Transferir para fila.

## 34. Context Cards

O sistema poderá gerar cartões inteligentes, por exemplo:

- cliente recorrente;
- risco de churn;
- oportunidade comercial;
- sinal óptico degradado;
- múltiplos chamados recentes;
- possível indisponibilidade coletiva.

## 35. Identificação progressiva

Quando houver vínculo confiável entre telefone e cliente, evitar solicitar CPF em todo atendimento.

Fluxo sugerido:

- telefone conhecido + contrato único → confirmar contrato;
- múltiplos contratos → cliente escolhe;
- identidade não confiável → solicitar validação adicional/CPF.

Operações sensíveis podem exigir validação adicional mesmo com identidade conhecida.

---

# PARTE VIII — EQUIPES, FILAS E SLA

## 36. Estruturas

### Equipe

Define quem atende.

Exemplos:

- Comercial;
- Suporte.

### Fila

Define o tipo de atendimento.

Exemplos:

- Novas Vendas;
- Upgrade;
- Suporte Residencial;
- Suporte Empresarial;
- Suporte N2.

Uma equipe pode atender mais de uma fila.

## 37. Flow Engine roteia para FILA

Regra arquitetural:

> **O Flow Engine define a fila. O agente elegível assume manualmente a conversa.**

O nó atual de transferência deve evoluir conceitualmente para `Transferir para Fila`, preservando compatibilidade com fluxos antigos.

Configurações desejadas:

- fila;
- prioridade;
- motivo;
- mensagem ao cliente;
- contexto/handoff;
- preservar Playbook;
- saída fora de horário;
- saída erro.

## 38. Sem agente livre não é erro

A conversa permanece em `aguardando` até ser assumida.

Não utilizar `sem_agente` como falha automática simplesmente porque ninguém está livre naquele instante.

## 39. Assunção manual

Agentes elegíveis visualizam a fila e clicam em `Assumir`.

Ao assumir:

- status → `ativa`;
- agente_id definido;
- `assumido_em` registrado;
- Cliente 360 carregado;
- Copiloto carregado;
- resumo de handoff disponível;
- Playbook preservado.

## 40. Ordenação da fila

Ordenar considerando:

1. prioridade;
2. criticidade/SLA;
3. tempo de espera.

O sistema deve destacar conversas críticas.

## 41. Capacidade simultânea

Configurar limite por agente/equipe.

Quando atingir limite, `Assumir` pode ser bloqueado.

## 42. Assumir Próximo

Adicionar opcionalmente `Assumir próximo`, escolhendo a conversa mais prioritária que o agente está autorizado a atender.

## 43. Horário por fila

O horário deixa de ser exclusivamente global.

Cada fila pode ter horário próprio.

Fora do horário, o Flow Engine segue pela porta `fora_horario`.

## 44. Transferência entre filas

Agente pode transferir a conversa para outra fila conforme permissão.

Ao transferir:

```text
status = aguardando
agent_id = null
fila = destino
```

Preservar todo contexto e registrar motivo.

## 45. Supervisor

Supervisor pode ter poderes adicionais:

- assumir;
- atribuir manualmente;
- elevar prioridade;
- transferir;
- visualizar todas as filas;
- intervir em SLA.

---

# PARTE IX — KNOWLEDGE HUB

## 46. Objetivo

Criar uma IA realmente especializada em ISP sem depender inicialmente de fine-tuning.

A especialização deve nascer da combinação:

```text
LLM
+ ISP Core Knowledge
+ Knowledge do provedor
+ Playbooks
+ Tools
+ Cliente 360
```

## 47. Separação obrigatória

### Prompt

Como a IA deve se comportar.

### Knowledge Base

O que a IA deve saber.

### Playbook

Como um procedimento deve ser executado.

### Tool

Como consultar/executar ações reais.

## 48. ISP Core Knowledge

Camada de conhecimento genérica de provedor.

Exemplos:

- fibra óptica;
- ONU/ONT;
- OLT;
- PPPoE;
- RADIUS;
- Wi-Fi 2.4/5 GHz;
- Mesh;
- DNS;
- CGNAT;
- IPv4/IPv6;
- latência;
- jitter;
- perda de pacotes;
- sinal óptico;
- conceitos de suporte ISP.

## 49. Knowledge específica do provedor

Exemplos:

- políticas;
- fidelidade;
- cidades;
- equipamentos utilizados;
- benefícios;
- regras comerciais;
- procedimentos internos;
- produtos;
- prazos;
- orientações.

## 50. Tipos de conteúdo

Suportar estrutura para:

- artigo;
- FAQ;
- manual de equipamento;
- política;
- argumentação comercial;
- documento importado;
- procedimento de referência.

## 51. Metadados

Cada item deve poder registrar:

- título;
- categoria;
- assunto;
- equipamento;
- produto;
- equipe;
- fonte;
- responsável;
- validade/revisão;
- versão;
- status.

## 52. Workflow editorial

```text
Rascunho → Revisão → Publicado → Arquivado
```

Somente conteúdo publicado entra na recuperação da IA.

## 53. Versionamento

Nunca sobrescrever silenciosamente conhecimento oficial.

A conversa/auditoria deve conseguir identificar qual versão estava ativa.

## 54. RAG

Implementar recuperação com:

- busca semântica;
- filtros por metadados;
- status publicado;
- versão ativa;
- score de relevância;
- rastreabilidade da fonte utilizada.

Tecnologia sugerida inicialmente: PostgreSQL + pgvector, salvo melhor justificativa técnica após inspeção.

## 55. Rastreamento de uso

Registrar quais itens de Knowledge foram utilizados em uma resposta/auditoria.

## 56. Knowledge Gaps

Registrar perguntas/assuntos sem conhecimento suficiente.

Gerar visão administrativa de lacunas recorrentes.

Possibilitar gerar rascunho a partir de padrões de atendimentos, sempre exigindo revisão humana antes da publicação.

## 57. Feedback

Copiloto/administrador pode indicar:

- útil;
- incorreto;
- desatualizado;
- incompleto.

---

# PARTE X — PLAYBOOK ENGINE

## 58. Objetivo

Playbooks são a fonte oficial de **como executar um procedimento**.

O mesmo Playbook deve servir a:

- IA Atendente;
- Copiloto;
- Quality AI.

## 59. Estrutura

Um Playbook deve possuir:

- nome;
- domínio;
- versão;
- objetivo;
- gatilhos/intenção;
- etapas;
- condições;
- Tools associadas;
- classificação obrigatória/opcional/condicional;
- critérios de sucesso;
- critérios de transferência;
- exceções.

## 60. Exemplo Suporte — Sem Conexão

```text
1. Identificar cliente — obrigatória
2. Verificar contrato — obrigatória
3. Verificar manutenção — obrigatória
4. Consultar RADIUS — obrigatória
5. Consultar ONU — obrigatória
6. Avaliar sinal — condicional
7. Executar procedimento aplicável
8. Retestar
9. Abrir chamado — somente se necessário
```

## 61. Exceções justificadas

O Playbook não deve funcionar como checklist burro.

Quality AI pode reconhecer evidência suficiente para pular uma etapa.

Exemplo: cabo fisicamente rompido relatado com clareza pode justificar não executar determinadas verificações remotas.

## 62. Playbook Comercial

Exemplo Venda Residencial:

```text
1. Entender necessidade
2. Coletar endereço
3. Verificar cobertura
4. Qualificar perfil de uso
5. Recomendar plano
6. Apresentar benefícios
7. Tratar objeções
8. Pedir fechamento
9. Coletar dados
10. Pré-cadastrar
11. Informar próximo passo
```

## 63. Subplaybooks

Permitir estruturar procedimentos como tratamento de objeção de preço.

## 64. Versionamento/publicação

Playbooks devem possuir:

```text
Rascunho → Teste → Publicado → Arquivado
```

Execuções/auditorias antigas preservam referência à versão utilizada.

---

# PARTE XI — AI RUNTIME / IA ATENDENTE

## 65. Objetivo

Evoluir o motor agêntico atual para um runtime único, especializado por perfil.

Não criar motores duplicados por área.

## 66. Perfis iniciais

Preparar arquitetura para perfis, começando por:

- Comercial;
- Suporte;
- demais perfis já existentes que forem necessários para compatibilidade.

Cada perfil determina:

- prompt base;
- estilo;
- Knowledge disponível;
- Playbooks;
- Tools permitidas;
- limites;
- regras de transferência.

## 67. Hierarquia de confiança

Regra obrigatória:

```text
1. Dado vivo via Tool/ERP
2. Playbook ativo
3. Knowledge publicada
4. Contexto estruturado da conversa
5. Conhecimento geral do modelo
```

Dados vivos prevalecem sobre documentação estática.

## 68. Não inventar dados

IA não pode inventar:

- preço;
- protocolo;
- PIX;
- cobertura;
- prazo;
- status;
- sinal;
- manutenção;
- agendamento;
- plano elegível;
- valor de fatura.

Sem Tool válida, deve assumir indisponibilidade ou pedir ajuda humana.

## 69. Conversation Context estruturado

Evoluir a memória atual para uma estrutura persistente contendo, conforme necessário:

```text
customer
intent
current_goal
identified_contract
collected_data
tool_results
active_playbook
playbook_state
queue
sentiment
commercial_signals
support_diagnostics
pending_confirmation
```

Fatos não devem depender exclusivamente da janela textual do LLM.

## 70. IA orientada a objetivo

Cada execução deve possuir objetivo e condições estruturadas.

Exemplo Suporte:

```text
goal = resolver_suporte
success = problema resolvido
transfer = humano necessário
fail = dependência indisponível
```

## 71. Resolução estruturada

Não considerar `resolvido` apenas porque a IA finalizou texto.

Registrar motivo/status de conclusão.

## 72. Multi-intenção

Preparar o runtime para reconhecer múltiplos objetivos dentro da mesma conversa quando isso não conflitar com o Flow Engine.

## 73. Motivos de transferência

Usar valores estruturados, por exemplo:

```text
customer_requested_human
low_confidence
missing_knowledge
tool_failure
playbook_requires_human
sensitive_case
max_turns
customer_frustrated
commercial_opportunity
```

## 74. Handoff

Transferência da IA para humano inclui:

- resumo;
- intenção;
- contrato;
- diagnóstico;
- Tools executadas;
- resultados;
- Playbook e progresso;
- motivo da transferência;
- prioridade.

## 75. Guardrails ISP

A IA não deve orientar cliente a executar procedimentos perigosos, incluindo, entre outros:

- abrir ONU/ONT;
- manipular fibra/conector óptico de forma insegura;
- olhar diretamente para conector óptico;
- subir em poste;
- manipular rede elétrica;
- desmontar equipamento de risco.

## 76. LLM Gateway

Criar abstração para reduzir acoplamento ao provedor atual.

Interface conceitual:

```text
generate
toolLoop
classify
embed
```

V1.0 pode continuar usando Anthropic como principal, sem obrigatoriedade de implementar múltiplos provedores neste momento.

---

# PARTE XII — COPILOTO IA DO ATENDENTE

## 77. Objetivo

Ser um assistente operacional em tempo real para o atendente humano.

O Copiloto NÃO é o Quality AI.

- Copiloto ajuda.
- Quality AI audita.

## 78. Sugestão de resposta

Função central:

- gerar resposta contextual;
- `Inserir no campo`;
- `Editar`;
- `Enviar sugestão`.

Ao utilizar `Enviar sugestão`, a mensagem é enviada como mensagem do agente humano.

Registrar metadado indicando que foi gerada pelo Copiloto.

## 79. Próxima melhor ação

O Copiloto deve decidir se é melhor:

- responder;
- executar uma consulta;
- sugerir próxima etapa.

Não deve gerar texto inútil quando ainda faltam dados objetivos.

## 80. Execução de Tools

Exibir recomendações como:

- Consultar manutenção;
- Consultar RADIUS;
- Consultar ONU;
- Consultar cobertura.

Ao clicar, executar Tool respeitando permissão e risco.

## 81. Playbook em tempo real

Exibir:

```text
✓ etapas concluídas
○ etapas pendentes
```

Mostrar próxima ação recomendada.

## 82. Resumo vivo

Manter resumo atualizado da conversa e diagnóstico.

Útil para:

- troca de atendente;
- transferência de fila;
- retomada rápida.

## 83. Comercial

O Copiloto Comercial pode:

- identificar perfil;
- sugerir plano elegível;
- detectar objeção;
- detectar sinal de compra;
- sugerir fechamento;
- sugerir consulta de cobertura;
- sugerir pré-cadastro;
- detectar oportunidades de upsell/cross-sell.

Valores e condições devem vir de fonte real.

## 84. Suporte

Pode:

- interpretar diagnóstico;
- apontar degradação;
- sugerir próxima Tool;
- alertar manutenção ativa;
- identificar recorrência;
- sugerir abertura de chamado quando aplicável.

## 85. Transferência com contexto

Copiloto gera resumo de handoff para outra fila/agente.

## 86. Feedback

Permitir feedback opcional:

- positivo;
- negativo;
- motivo do feedback.

## 87. Métricas

Registrar:

- sugestões geradas;
- envio direto;
- sugestões editadas;
- ignoradas;
- ações recomendadas;
- ações executadas;
- feedback.

---

# PARTE XIII — QUALITY AI

## 88. Objetivo

Criar um **AI Quality Engine** genérico com perfis de auditoria.

V1.0 implementa:

- Supervisora Comercial;
- Supervisora Suporte.

## 89. Três níveis

### Supervisão em tempo real

Alertas seletivos baseados em eventos/regras e IA quando necessário.

### Auditoria pós-atendimento

Análise completa e oficial após encerramento.

### Supervisão gerencial

Agregação de resultados em dashboards.

## 90. Fontes de evidência

Quality AI deve analisar:

1. conversa;
2. eventos do sistema;
3. Tools executadas;
4. tempos;
5. Cliente 360;
6. Playbook;
7. Knowledge/políticas aplicáveis;
8. desfecho.

A conversa sozinha não é suficiente.

## 91. Scorecards configuráveis

Cada perfil possui critérios com:

- nome;
- descrição;
- peso;
- instrução de avaliação;
- evidências esperadas;
- flag crítico.

## 92. Supervisora Comercial

Avaliar, entre outros:

- primeira resposta;
- demora;
- investigação da necessidade;
- qualificação;
- oferta adequada;
- benefícios;
- objeções;
- convencimento;
- condução para fechamento;
- pedido de fechamento;
- cobertura;
- pré-cadastro;
- próximo passo;
- follow-up;
- oportunidade perdida;
- motivo da perda;
- tom;
- informação incorreta;
- promessa indevida.

## 93. Oportunidade perdida

Registrar de forma estruturada:

- tipo;
- evidência;
- confiança;
- momento da conversa;
- controlável/não controlável.

Tipos possíveis:

- fechamento;
- upsell;
- cross-sell;
- cobertura;
- follow-up;
- pré-cadastro.

## 94. Supervisora Suporte

Avaliar:

- identificação;
- contrato;
- manutenção;
- RADIUS;
- ONU;
- sinal;
- histórico;
- procedimento;
- reteste;
- necessidade de OS;
- abertura correta de chamado;
- transferência;
- perguntas repetidas;
- FCR;
- clareza;
- tom.

## 95. Aderência ao Playbook

Comparar:

```text
Playbook esperado
VS
Ações realmente executadas
```

Aceitar exceções justificadas por contexto.

## 96. Violações críticas

Criar mecanismo separado de score simples.

Exemplos:

- informar preço divergente da fonte oficial;
- prometer visita inexistente;
- compartilhar informação sensível inadequadamente;
- executar ação não autorizada.

## 97. Evidência obrigatória

Toda penalização relevante deve possuir justificativa e referência às evidências.

## 98. Revisão humana

Supervisor pode:

- concordar;
- discordar;
- reavaliar;
- alterar score final com justificativa.

Preservar:

```text
ai_score
human_score
final_score
```

## 99. Coaching

Quality AI deve produzir visão de evolução por agente:

- padrões recorrentes;
- pontos fortes;
- pontos de melhoria;
- sugestão de coaching.

Evitar ranking simplista como única forma de gestão.

---

# PARTE XIV — ANALYTICS E TELEMETRIA

## 100. Conversation Events

Criar camada explícita de eventos.

Eventos possíveis:

```text
conversation_created
customer_identified
flow_started
flow_node_entered
flow_node_finished
tool_called
tool_succeeded
tool_failed
knowledge_retrieved
playbook_started
playbook_step_completed
queue_entered
conversation_assumed
conversation_transferred
human_first_response
copilot_suggestion_generated
copilot_suggestion_used
copilot_suggestion_edited
copilot_action_executed
conversation_resolved
conversation_closed
quality_audit_completed
nps_received
```

Eventos devem guardar timestamp e metadata adequada.

## 101. Dashboard Executivo

Indicadores desejados:

- atendimentos;
- resolução IA;
- transferidos para humano;
- tempo médio;
- espera;
- FCR;
- recontato;
- NPS;
- Quality Score;
- comercial;
- suporte.

## 102. Resolução IA efetiva

Distinguir:

### Automação aparente

Não houve humano.

### Resolução efetiva

Não houve humano + caso resolvido + ausência de recontato equivalente dentro da janela configurada.

## 103. FCR e recontato

Medir:

- FCR geral;
- FCR IA;
- FCR humano;
- FCR por motivo;
- recontato 24h/48h/7d.

Quando possível, classificar se o recontato é pelo mesmo motivo.

## 104. Analytics IA

- atendimentos IA;
- resolução;
- transferência;
- motivo de transferência;
- tempo de resposta;
- tool calls;
- erros;
- tokens;
- custo;
- custo por atendimento resolvido.

## 105. Analytics Tools

Por Tool:

- execuções;
- sucesso;
- falha;
- timeout;
- latência;
- última falha.

## 106. Analytics Comercial

Funil sugerido:

```text
Entrada comercial
→ cobertura consultada
→ cobertura disponível
→ plano apresentado
→ pré-cadastro
→ conversão
```

Medir:

- conversão bruta;
- conversão sobre oportunidades elegíveis;
- motivo de perda;
- perdas controláveis;
- oportunidades perdidas;
- score por agente/equipe.

## 107. Analytics Suporte

Medir:

- motivos;
- resolução IA;
- resolução humana;
- FCR;
- OS/chamados;
- recorrência;
- tempo;
- Playbook;
- possível chamado evitado.

## 108. Custo evitado

Permitir estimativas configuráveis, claramente rotuladas como estimativas.

Exemplo:

- chamados/visitas potencialmente evitados;
- custo médio configurado;
- economia estimada.

## 109. Analytics Copiloto

- taxa de uso;
- envio direto;
- edição;
- rejeição;
- ações executadas;
- correlação com Quality Score.

## 110. Analytics Knowledge

- artigos mais utilizados;
- artigos sem uso;
- feedback;
- Knowledge Gaps;
- conteúdo vencendo;
- taxa de resolução associada.

## 111. Analytics Filas

Medir separadamente:

```text
entrada na fila
assunção
primeira resposta humana
```

Isso permite separar:

- espera na fila;
- demora do atendente após assumir.

## 112. NPS

Unificar a fonte de NPS existente antes de expandir o Analytics.

Permitir cortes por:

- IA/humano;
- fila;
- assunto;
- agente;
- tipo de resolução.

---

# PARTE XV — SEGURANÇA, PERMISSÕES E GOVERNANÇA

## 113. Modelo de acesso

Estrutura:

```text
Usuário → Role → Equipe → Permissões
```

Roles iniciais:

- Administrador;
- Supervisor;
- Agente.

## 114. Permissões no backend

Toda permissão de interface precisa possuir correspondente enforcement no backend.

Nunca confiar apenas em esconder botões.

## 115. Domínios de permissão

Exemplos:

```text
cliente.visualizar
cliente.visualizar_cpf
financeiro.visualizar
financeiro.enviar_boleto
suporte.diagnosticar
suporte.abrir_chamado
comercial.consultar_cobertura
comercial.precadastrar
chat.assumir
chat.transferir
chat.encerrar
quality.visualizar_equipe
quality.revisar_auditoria
knowledge.editar
knowledge.publicar
playbook.editar
fluxo.editar
configuracao.editar
```

## 116. Dados sensíveis

Mostrar CPF/telefone mascarados por padrão quando possível.

Acesso a dado completo pode gerar auditoria.

## 117. Segredos

Credenciais de integração devem ser criptografadas em repouso.

A chave mestre não deve estar no mesmo banco.

Frontend nunca deve receber novamente o segredo completo depois de salvo.

Exibir apenas máscara.

## 118. IA não é admin

Perfis de IA recebem somente Tools necessárias.

Exemplo:

- IA Comercial não recebe Tools técnicas desnecessárias;
- IA Suporte não recebe ações comerciais desnecessárias.

## 119. Audit Log

Registrar ações relevantes com:

```text
actor_type
actor_id
action
resource
before
after
conversation_id
request_id
ip
metadata
timestamp
```

`actor_type`:

- human;
- ai;
- system.

## 120. Conversation Timeline

Além do Audit Log técnico, exibir timeline amigável no atendimento.

## 121. Governança de Knowledge, Playbooks e Fluxos

Todos devem possuir ciclo de publicação/versionamento.

Mudanças não devem afetar retroativamente conversas/auditorias antigas.

## 122. Webhooks

Implementar validação de origem/assinatura quando o canal suportar.

Manter:

- deduplicação;
- idempotência;
- rate limit;
- validação de payload.

## 123. Autenticação

Evoluir o JWT longo para modelo de access token + refresh token ou solução equivalente.

Eliminar seeds previsíveis em produção.

Adicionar política específica de tentativa de login.

## 124. Logs sem PII desnecessária

Remover:

- CPF completo;
- senhas;
- tokens;
- chaves;
- payload sensível desnecessário.

---

# PARTE XVI — RESILIÊNCIA E EXECUÇÃO ASSÍNCRONA

## 125. Inbox

Adicionar persistência de entrada de webhooks.

Fluxo:

```text
Webhook
→ validar
→ deduplicar
→ persistir Inbox
→ responder HTTP rapidamente
→ processar
```

Campos conceituais:

```text
id
channel
external_id
payload
status
attempts
received_at
processed_at
last_error
```

## 126. Outbox

Mensagens de saída devem poder ser persistidas antes do envio.

Campos conceituais:

```text
id
conversation_id
channel
payload
status
attempts
next_attempt_at
expires_at
external_id
last_error
```

## 127. Jobs / Scheduler

Implementar worker assíncrono.

Tecnologia sugerida inicialmente: BullMQ + Redis, salvo justificativa melhor após avaliação.

Jobs possíveis:

- send_message;
- tool_retry;
- flow_resume;
- wait_timeout;
- sla_check;
- quality_audit;
- conversation_summary;
- knowledge_index;
- followup.

## 128. `aguardar_tempo`

Deve passar a funcionar usando job agendado.

## 129. Timeout de resposta

`aguardar_resposta` pode criar job de timeout e seguir porta específica se não houver resposta.

## 130. Retry

Centralizar política de retry.

Leituras podem aceitar retry mais livre.

Escritas exigem idempotência.

## 131. Circuit breaker

Preparar ou implementar mecanismo para dependências críticas:

- SGP;
- LLM;
- Evolution/Meta;
- banco de leitura do SGP.

Falha externa deve degradar a função afetada, não derrubar desnecessariamente o atendimento humano.

## 132. Dead Letter / Falhas pendentes

Após tentativas esgotadas, registrar falha para inspeção/reprocessamento.

## 133. Modo degradado

Exemplos:

- LLM fora → atendimento humano continua;
- SGP fora → chat humano continua, recursos de ERP degradados;
- PostgreSQL fora → sistema indisponível;
- canal de saída fora → Outbox retenta quando apropriado.

---

# PARTE XVII — OBSERVABILIDADE, SAÚDE E OPERAÇÃO

## 134. Health endpoints

Separar:

### `/health/live`

Processo vivo.

### `/health/ready`

Aplicação pronta para operar.

### `/health/dependencies`

Visão detalhada de dependências.

## 135. Migrations no boot

Não declarar aplicação `ready` antes das migrations essenciais concluírem com sucesso.

## 136. Logs estruturados

Adotar logs JSON/estruturados com níveis.

Campos de correlação:

```text
request_id
correlation_id
conversation_id
flow_execution_id
tool_call_id
job_id
```

## 137. Correlation ID

Uma entrada deve poder ser rastreada ponta a ponta:

```text
webhook → flow → IA → Tool → ERP → outbox
```

## 138. Métricas técnicas

Monitorar:

- HTTP;
- webhooks;
- Flow Engine;
- Tools;
- LLM;
- jobs;
- filas;
- SSE;
- banco;
- Redis.

## 139. Error tracking

Integrar solução de error tracking como Sentry ou equivalente.

## 140. Tela Saúde do Sistema

Exibir:

- API;
- PostgreSQL;
- Redis;
- SGP;
- banco SGP;
- LLM;
- canais;
- jobs pendentes;
- falhas.

## 141. Graceful shutdown

No SIGTERM:

- parar de aceitar novos jobs;
- concluir/persistir operações em andamento;
- fechar conexões;
- encerrar adequadamente.

## 142. Backup e restauração

Antes de comercialização ampla:

- backup automático PostgreSQL;
- retenção definida;
- documentação de restore;
- teste periódico de restauração.

---

# PARTE XVIII — TESTES E QUALIDADE DE ENGENHARIA

## 143. Testes unitários

Continuar fortalecendo módulos puros.

Obrigatórios para:

- Node Registry;
- Tool Registry;
- Playbooks;
- scoring;
- políticas de risco;
- helpers;
- filas;
- eventos.

## 144. Testes de integração

Adicionar cobertura real para:

- API ↔ PostgreSQL;
- migrations;
- Flow Execution;
- retomada;
- Inbox;
- Outbox;
- auth/permissões;
- jobs;
- Tool Registry.

## 145. E2E crítico

Criar alguns caminhos prioritários.

Exemplos:

### Suporte

```text
mensagem
→ IA
→ diagnóstico
→ fila
→ agente assume
→ Copiloto
→ retorno IA
→ NPS
```

### Comercial

```text
lead
→ cobertura
→ qualificação
→ plano
→ pré-cadastro
→ fila/humano quando necessário
```

## 146. CI

Pipeline mínimo:

```text
lint
→ testes
→ build
→ validação
→ deploy
```

Fluxos publicados podem ter validador integrado à pipeline quando aplicável.

## 147. Teste de carga

Antes de definir sizing comercial, testar cenários de concorrência.

Objetivo: conhecer capacidade e gargalos, não apenas atingir um número máximo.

---

# PARTE XIX — EXPERIÊNCIA ADMINISTRATIVA

## 148. Novos módulos/telas previstos

A V1.0 pode exigir telas ou áreas para:

- Cliente 360 dentro do Chat;
- Copiloto dentro do Chat;
- Equipes;
- Filas;
- Knowledge Hub;
- Playbooks;
- Quality AI;
- Analytics;
- Auditoria;
- Saúde do Sistema.

## 149. Priorizar UX operacional

Evitar excesso de informação simultânea.

No atendimento, considerar lateral com abas:

```text
Cliente | Copiloto | Playbook
```

O conteúdo pode se adaptar ao contexto da conversa.

---

# PARTE XX — ESCOPO EXPLICITAMENTE FORA DA V1.0

## 150. Não priorizar agora

- multi-tenancy row-level;
- ERP próprio;
- CRM completo;
- Frota;
- Financeiro completo concorrente do SGP;
- Supervisora Financeira;
- Supervisora Retenção;
- distribuição automática obrigatória para agentes;
- Kafka/RabbitMQ/NATS sem necessidade demonstrada;
- Kubernetes;
- microserviços como objetivo por si só;
- execução autônoma de operações críticas;
- fine-tuning como primeira estratégia de especialização;
- múltiplos provedores LLM implementados apenas por variedade;
- Analytics conversacional avançado como requisito de lançamento.

## 151. Preparar para o futuro

A arquitetura pode deixar pontos de extensão para:

- novas Supervisoras;
- novas equipes;
- novas Tools;
- novos canais;
- LLM local;
- múltiplos providers de LLM;
- horizontal scaling;
- provisionamento automático de ISPs;
- central de monitoramento de todas as instâncias.

---

# PARTE XXI — PLANO DE EXECUÇÃO

> Esta seção define COMO a IA de programação deve dividir a implementação. A especificação funcional permanece nas partes anteriores.

## FASE 0 — Reconciliação e linha de base

### Objetivo

Garantir que a implementação seja feita sobre o comportamento real.

### Trabalhos

- rodar testes atuais;
- mapear migrations;
- validar schema real;
- registrar versão atual;
- corrigir/confirmar deduplicação pendente;
- validar Redis real;
- remover logs de PII imediatamente;
- documentar incompatibilidades descobertas entre ERS e código.

### Critério de saída

Baseline confiável antes das grandes mudanças.

---

## FASE 1 — Fundação crítica / P0

### Objetivo

Tornar o núcleo resiliente.

### Trabalhos

1. Persistência do Flow Engine.
2. Versionamento fixo da execução.
3. Concorrência/locking.
4. Retomar após restart.
5. Waiting human + retorno para IA.
6. Correção de protocolo concorrente.
7. Migrations bloqueando readiness em falha.
8. Graceful shutdown.

### Não avançar sem

- testes de integração;
- restart testado;
- deploy testado com conversa em andamento.

---

## FASE 2 — Registry Foundation

### Objetivo

Eliminar divergência estrutural.

### Trabalhos

1. Node Registry.
2. Compatibilidade com nós antigos.
3. Painel de propriedades derivado.
4. Validador derivado.
5. Tool Registry.
6. Policies de risco/permissão.
7. Migrar Tools existentes para Registry.
8. Nós que executam operações reais passam a reutilizar Tools.

### Critério de saída

Editor, motor, simulador, validador e Tools deixam de depender de catálogos manuais conflitantes.

---

## FASE 3 — Segurança e governança base

### Trabalhos

- permissões no backend;
- roles/equipes;
- criptografia de secrets;
- mascaramento de secrets;
- credenciais seguras;
- Audit Log;
- actor human/ai/system;
- validação de webhooks;
- melhorias de autenticação;
- políticas de Tool.

---

## FASE 4 — Inbox, Outbox e Jobs

### Trabalhos

- Inbox idempotente;
- Outbox;
- worker;
- scheduler;
- retry central;
- timeout de espera;
- `aguardar_tempo` real;
- falhas pendentes/DLQ;
- política de expiração de mensagem.

---

## FASE 5 — Equipes, Filas e Human Handoff

### Trabalhos

- tabelas de equipes;
- tabelas de filas;
- associação agente/equipe/fila;
- SLA;
- capacidade simultânea;
- assunção manual;
- `Assumir próximo` opcional;
- transferência entre filas;
- horário por fila;
- nó `Transferir para Fila`;
- preservar contexto e Flow Execution.

---

## FASE 6 — Cliente 360

### Trabalhos

- identidade/contratos;
- visão geral;
- financeiro;
- diagnóstico;
- histórico;
- chamados;
- comercial;
- ações rápidas;
- Context Cards;
- permissões de visualização;
- integração com Tool Registry.

### Regra

Não criar integrações paralelas quando a operação já puder ser executada por Tool.

---

## FASE 7 — Knowledge Hub

### Trabalhos

- schema;
- categorias;
- artigos;
- documentos;
- metadados;
- workflow;
- versionamento;
- embeddings;
- pgvector/RAG;
- rastreamento de fonte;
- feedback;
- Knowledge Gaps básicos.

---

## FASE 8 — Playbook Engine

### Trabalhos

- schema de Playbook;
- etapas;
- condições;
- Tools associadas;
- obrigatório/opcional/condicional;
- versionamento;
- publicação;
- Playbook Comercial inicial;
- Playbooks de Suporte prioritários.

---

## FASE 9 — AI Runtime V1

### Trabalhos

- profiles;
- Conversation Context;
- Goal/Outcome estruturado;
- hierarquia de fontes;
- integração Knowledge;
- integração Playbook;
- Tool policies;
- handoff estruturado;
- motivos de transferência;
- LLM Gateway;
- guardrails ISP.

### Regra

Preservar funcionalidades válidas do laço agêntico atual; evoluir, não reescrever sem necessidade.

---

## FASE 10 — Copilot V1

### Trabalhos

- sugestão de resposta;
- Inserir;
- Editar;
- Enviar sugestão;
- próxima ação;
- execução de Tool;
- Playbook visível;
- resumo vivo;
- suporte e comercial;
- handoff;
- feedback;
- eventos de uso.

---

## FASE 11 — Quality AI V1

### Trabalhos

1. Quality Engine.
2. Scorecards configuráveis.
3. Perfil Comercial.
4. Perfil Suporte.
5. Auditoria pós-atendimento.
6. Alertas em tempo real selecionados.
7. Evidências.
8. Violações críticas.
9. Revisão humana.
10. Coaching.

---

## FASE 12 — Conversation Events + Analytics

### Trabalhos

- event store/telemetria;
- indicadores executivos;
- IA;
- Tools;
- Comercial;
- Suporte;
- filas;
- agentes;
- Copiloto;
- Knowledge;
- Quality;
- NPS unificado.

### Observação

Alguns eventos deverão ser introduzidos antes desta fase pelos módulos anteriores. Nesta fase consolida-se a modelagem e a experiência de Analytics.

---

## FASE 13 — Observabilidade e hardening operacional

### Trabalhos

- health live/ready/dependencies;
- logs estruturados;
- correlation ID;
- error tracking;
- métricas técnicas;
- Saúde do Sistema;
- circuit breaker quando necessário;
- backup/restore documentado;
- teste de carga;
- CI completo.

---

# PARTE XXII — DEPENDÊNCIAS ENTRE MÓDULOS

## 152. Dependências principais

```text
Flow Persistence
      ↓
Node/Tool Registry
      ↓
Security / Jobs / Filas
      ↓
Cliente 360
      ↓
Knowledge + Playbooks
      ↓
AI Runtime
      ↓
Copilot
      ↓
Quality AI
      ↓
Analytics consolidado
```

Nem toda implementação precisa ser 100% sequencial, mas uma fase não deve assumir recursos inexistentes de uma dependência anterior.

---

# PARTE XXIII — DEFINITION OF DONE GLOBAL

## 153. Uma funcionalidade só é considerada concluída quando

- possui implementação backend quando necessária;
- possui enforcement de permissão;
- possui tratamento de erro;
- possui logs/auditoria compatíveis com o risco;
- possui migration quando aplicável;
- possui testes adequados;
- não quebra fluxo legado sem estratégia de migração;
- possui critérios de aceite validados;
- eventos/telemetria necessários são emitidos;
- documentação foi atualizada.

## 154. Regras de qualidade

- não adicionar segredo em código;
- não logar PII desnecessária;
- não duplicar integração já disponível no Tool Registry;
- não criar nova definição de nó fora do Node Registry após migração;
- não adicionar nova fonte manual de NPS;
- não adicionar regra de negócio crítica somente em prompt quando ela puder ser codificada;
- não permitir ação sensível só porque a LLM solicitou;
- não publicar Knowledge/Playbook sem versionamento.

---

# PARTE XXIV — CRITÉRIOS DE SUCESSO DA V1.0

## 155. Produto

A V1.0 será considerada bem-sucedida quando for possível demonstrar, em ambiente real:

1. Cliente inicia pelo WhatsApp.
2. Conversa sobrevive a restart/deploy.
3. IA identifica contexto e usa Tools reais.
4. Knowledge e Playbook orientam a IA.
5. Suporte pode executar diagnóstico estruturado.
6. Comercial pode consultar cobertura/plano e conduzir pré-cadastro.
7. Quando necessário, Flow Engine envia para fila correta.
8. Agente assume manualmente.
9. Cliente 360 mostra dados úteis do ERP.
10. Copiloto sugere resposta e permite `Enviar sugestão`.
11. Copiloto recomenda ações e executa consultas permitidas.
12. Humano pode devolver conversa à automação.
13. Quality AI audita Comercial e Suporte com evidências.
14. Analytics mede resolução, qualidade e principais resultados.
15. Falhas de LLM/SGP degradam a função afetada sem derrubar desnecessariamente o chat humano.
16. Ações relevantes são auditáveis.

---

# PARTE XXV — INSTRUÇÃO SUGERIDA PARA A IA DE PROGRAMAÇÃO

## 156. Prompt de início

Utilizar a instrução abaixo como ponto de partida, adaptando a fase solicitada:

> Leia integralmente `ERS-GoCHAT-v1.0.md` e `GoCHAT_Plano_Evolucao_V1_Completo.md`. O ERS representa o estado AS-IS; o Plano representa o estado TO-BE aprovado. Não reescreva o sistema. Antes de alterar código, inspecione a implementação real relacionada à fase solicitada e identifique impactos, migrations, compatibilidade e testes. Implemente exclusivamente a fase indicada, preservando comportamento válido existente. Toda alteração persistente deve usar migration. Toda regra de autorização deve ser aplicada no backend. Toda nova operação externa deve passar pelo Tool Registry quando aplicável. Toda mudança em nós deve respeitar o Node Registry quando ele já estiver implantado. Execute e atualize os testes pertinentes e apresente ao final: arquivos alterados, migrations, testes, riscos, pendências e critérios de aceite validados.

### Exemplo

> Execute apenas a FASE 1 — Fundação crítica / P0. Não avance para as fases posteriores. Primeiro inspecione o Flow Engine atual e proponha a menor alteração arquitetural capaz de persistir a execução sem quebrar os fluxos existentes. Depois implemente com migration, testes de integração e teste de retomada após restart.

---

# PARTE XXVI — RESUMO EXECUTIVO

O GoCHAT V1.0 deixa de ser apenas um sistema de chat com automações e passa a ser uma **plataforma especializada de atendimento para provedores**, construída sobre seis pilares:

1. **Orquestração confiável** — Flow Engine persistente e versionado.
2. **Ação real** — Tool Registry integrado ao ERP.
3. **Especialização ISP** — Knowledge Hub + Playbooks.
4. **Humano aumentado por IA** — Cliente 360 + Copilot.
5. **Gestão de qualidade** — Quality AI Comercial e Suporte.
6. **Gestão por dados** — Conversation Events + Analytics.

A especialização não depende inicialmente de fine-tuning. Ela nasce da combinação de dados reais, conhecimento oficial, procedimentos operacionais e ferramentas capazes de atuar no ecossistema do provedor.

O sistema permanece single-tenant por instância na V1.0 e não deve evoluir para ERP, microserviços ou multi-tenancy apenas por sofisticação técnica.

> **Regra final de produto:** toda evolução deve aumentar a capacidade do GoCHAT de entender, resolver, orientar, encaminhar, auditar ou medir um atendimento de ISP.