---
title: FASE 11 — Quality AI V1
type: task
created: 2026-08-22
last_updated: 2026-08-22
status: done
priority: p1
knowledge_refs: ["systems/maxxi/components/playbook-engine", "systems/maxxi/components/cliente-360-e-copiloto"]
related: ["[[Plano de Evolução V1.0 — status consolidado]]", "[[FASE 10 — Copiloto V1]]", "[[Playbook Engine]]", "[[Supervisora IA]]"]
aliases: ["FASE 11", "Quality AI", "auditoria de atendimento", "scorecard", "coaching", "violação crítica"]
tags: [work, task, fase-11, plano-evolucao, qualidade, ia]
---

# FASE 11 — Quality AI V1

**Estado: implementada (2026-08-22).** Migration **023**. Suítes: **436 puros ·
237 de integração**.

## A regra que governa a fase: a conversa sozinha não basta (§90)

Auditar lendo só o texto **premiaria quem escreve bonito e puniria quem
resolveu rápido**. Por isso a evidência reunida inclui o que foi **executado**
(tools), o que o procedimento esperava, o desfecho estruturado da IA, os tempos
(primeira resposta, duração) e quantas vezes a base de conhecimento foi
consultada — nada disso se lê na conversa.

É também por isso que a FASE 8 rastreia etapa **pela tool executada**: a Quality
AI não pode auditar um procedimento acreditando no que o próprio modelo disse
ter feito.

## O que foi entregue

| Item do plano | Onde |
|---|---|
| Quality Engine | `services/quality.js` — reúne evidência, chama o modelo, calcula |
| Scorecards configuráveis (§91) | `quality_scorecards.criterios` jsonb: nome, peso, instrução, crítico |
| Perfil Suporte (§94) e Comercial (§92) | semeados pela 022, **inativos** |
| Auditoria pós-atendimento (§89) | job `quality_audit`, agendado no encerramento |
| Evidências (§90) | `reunirEvidencias` — 8 fontes, cada uma isolada |
| Violações críticas (§96) | mecanismo **separado** do score |
| Revisão humana (§98) | `ai_score`/`human_score`/`final_score` convivem |
| Coaching (§99) | padrões recorrentes por agente, sem ranking |
| Aderência ao playbook (§95) | `aderenciaPlaybook`, com exceção justificada |

## Decisões que valem mais que o código

- **A IA propõe, a aritmética é NOSSA.** O modelo devolve nota por critério e
  justificativa; a média ponderada, o teto por violação e o score final são
  calculados em `qualityHelpers.js` (puro, 29 testes). Deixar o modelo somar
  daria uma nota que ninguém consegue conferir nem reproduzir.
- **Violação crítica é TETO, não desconto** (§96). Subtrair pontos deixaria um
  atendimento excelente com promessa indevida ainda passando com nota alta.
  Prometer visita inexistente não é "perder alguns pontos de tom".
- **Penalizar sem justificativa não vale** (§97). Avaliação inválida é
  **descartada** do cálculo, não contada como zero — contar como zero puniria o
  atendente por um defeito do avaliador.
- **Critério não avaliado sai da conta** (numerador e denominador). Se a
  conversa não teve objeção, "tratamento de objeções" não pode arrastar a nota.
- **Exceção justificada não conta contra** (§95/§61). Punir quem pulou o teste
  remoto de um cabo comprovadamente rompido ensinaria o atendente a seguir o
  roteiro contra o bom senso.
- **O humano manda e o `ai_score` NÃO é apagado** (§98). A **divergência** é o
  dado mais valioso da fase: é ela que diz se o scorecard está mal escrito. E a
  revisão **exige justificativa** — nota mudada sem motivo deixa o atendente sem
  argumento e o scorecard sem calibração.
- **Coaching por padrão, não por ranking** (§99). Um tropeço isolado é um
  tropeço; só o que se repete vira ponto de melhoria. E a lista por agente na
  tela mostra **a contagem de auditorias junto** — média de duas auditorias não
  é média.
- **Os scorecards nascem DESLIGADOS.** Auditar custa uma chamada de IA por
  conversa encerrada; ligar isso sozinho num deploy seria gastar dinheiro do
  provedor sem ele pedir.
- **A auditoria é JOB, não inline.** O agente clica "encerrar" e a tela responde
  na hora; a nota sai depois, com 1 min de atraso para a conversa assentar
  (mensagem em voo, último envio do outbox). E ganha retry se a IA estiver fora.
- **Sem scorecard ativo, o job vira no-op** — não falha. Sem essa guarda, toda
  conversa encerrada viraria uma linha na DLQ e a DLQ deixaria de significar
  "algo deu errado".
- **`encerrar` zera `agente_id`**, e a auditoria roda depois: o agente é
  recuperado da última mensagem dele. Sem esse fallback, **toda auditoria
  automática ficaria sem dono** e o coaching nunca teria de quem falar.
- **O gancho fica em `conversaRepo.encerrar`**, o único ponto por onde todo
  encerramento passa (painel e nó `encerrar` do motor), em vez de nos dois
  chamadores.

## Efeito colateral corrigido

O teste `cliente que responde a tempo cancela o job` da FASE 4 contava **todas**
as linhas de `jobs`. Com a auditoria agendada no encerramento, passou a haver
duas. A asserção foi estreitada para o tipo `wait_timeout` — a intenção do teste
(o timer foi cancelado) é preservada; o que mudou foi o total da tabela.

## Tetos assumidos

- **Sem supervisão em tempo real** (§89, 1º nível): a `supervisoraIA` já faz
  sentimento e SLA; alertas seletivos de qualidade durante a conversa ficam
  para quando houver volume que justifique.
- **A geração da nota não é testada** — depende da Anthropic. O que decide o
  resultado antes e depois dela é.
- **Sem editor de critérios na tela**: a aba Scorecards lista, liga/desliga e
  mostra os pesos; editar critério é pela API. A régua vem semeada.
- **Sem histórico de evolução por agente** (curva no tempo): há média e padrões
  recorrentes na janela. Série temporal é FASE 12.
- **Reauditar SUBSTITUI** (unique em `conversa_id`): sem isso o painel somaria a
  mesma conversa duas vezes e a média mentiria.

## Arquivos

Novos: `migrations/versions/023_quality_ai.js`, `services/qualityHelpers.js`
(+`.test.js`), `services/quality.js`, `routes/quality.js`,
`tests/integracao/fase11-quality.test.js`,
`apps/web/src/pages/Qualidade.jsx` (+`.module.css`).

Tocados: `services/jobs.js` (tipo `quality_audit`),
`repositories/conversaRepository.js` (agenda no encerramento), `dadosIniciais.js`
(2 scorecards), `server.js`, `apps/web` (App, Sidebar, api).

## Sonda de deploy desta fase

`GET /api/quality/painel` — **404 = antigo, 401 = FASE 11 no ar**.

## See Also

- [[Plano de Evolução V1.0 — status consolidado]] · [[Playbook Engine]] · [[FASE 10 — Copiloto V1]]
