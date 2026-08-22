/**
 * quality.js — auditoria de atendimento (FASE 11).
 *
 * A fronteira do §77, que este arquivo está do outro lado: **o Copiloto ajuda,
 * a Quality AI audita**. Nada aqui fala com o cliente e nada aqui ajuda o
 * atendente durante a conversa — isto roda DEPOIS, e o que produz é uma nota
 * com evidência, que uma pessoa pode contestar.
 *
 * §90 é explícito: **a conversa sozinha não é suficiente**. Auditar lendo só o
 * texto premiaria quem escreve bonito e puniria quem resolveu rápido. Por isso
 * a evidência reunida aqui inclui o que foi EXECUTADO (tools), o que o
 * procedimento esperava, o desfecho estruturado e os tempos.
 */
import { getDb } from '../config/db.js';
import { generateTexto } from './llmGateway.js';
import { montarFicha } from './cliente360.js';
import {
  calcularScore, aplicarViolacoes, aderenciaPlaybook, scoreFinal,
  padroesRecorrentes, avaliacaoValida,
} from './qualityHelpers.js';

/** Scorecard ativo do perfil; sem ele não há o que auditar. */
export async function scorecardDe(perfil) {
  const db = getDb();
  return db('quality_scorecards').where({ perfil, ativo: true }).first()
      || db('quality_scorecards').where({ ativo: true }).first();
}

/**
 * §90 — as oito fontes de evidência.
 *
 * Cada bloco falha isolado: um SGP fora do ar não pode impedir a auditoria de
 * acontecer, senão o dia em que a integração cai é o dia em que ninguém é
 * avaliado.
 */
export async function reunirEvidencias(conversa) {
  const db = getDb();
  const tentar = (fn) => fn().catch(() => null);

  const [mensagens, execucoesIA, playbookExec, usos, ficha] = await Promise.all([
    tentar(() => db('mensagens').where({ conversa_id: conversa.id, apagada: false })
      .orderBy('criado_em').select('origem', 'tipo', 'texto', 'criado_em')),
    tentar(() => db('ia_execucoes').where({ conversa_id: conversa.id }).orderBy('criado_em')),
    tentar(() => db('playbook_execucoes').where({ conversa_id: conversa.id }).orderBy('iniciado_em', 'desc').first()),
    tentar(() => db('knowledge_uso').where({ conversa_id: conversa.id })),
    tentar(() => montarFicha(conversa, { role: 'admin' })),
  ]);

  let playbook = null;
  if (playbookExec) {
    const [pb, etapas] = await Promise.all([
      db('playbooks').where({ id: playbookExec.playbook_id }).first().catch(() => null),
      db('playbook_etapas').where({ playbook_id: playbookExec.playbook_id }).orderBy('ordem').catch(() => []),
    ]);
    playbook = { playbook: pb, etapas, execucao: playbookExec };
  }

  // Tempos: primeira resposta e duração. O §92 avalia "primeira resposta" e
  // "demora", e nenhum dos dois se lê no texto da conversa.
  const msgs = mensagens || [];
  const primeiraCliente = msgs.find(m => m.origem === 'cliente');
  const primeiraResposta = msgs.find(m => (m.origem === 'agente' || m.origem === 'ia') &&
    primeiraCliente && new Date(m.criado_em) > new Date(primeiraCliente.criado_em));

  return {
    conversa,
    mensagens: msgs,
    execucoesIA: execucoesIA || [],
    tools: [...new Set((execucoesIA || []).flatMap(e => e.tools_usadas || []))],
    playbook,
    conhecimento: (usos || []).length,
    ficha,
    tempos: {
      primeira_resposta_seg: primeiraCliente && primeiraResposta
        ? Math.round((new Date(primeiraResposta.criado_em) - new Date(primeiraCliente.criado_em)) / 1000)
        : null,
      duracao_min: msgs.length >= 2
        ? Math.round((new Date(msgs.at(-1).criado_em) - new Date(msgs[0].criado_em)) / 60000)
        : null,
      mensagens: msgs.length,
    },
    desfecho: (execucoesIA || []).at(-1)?.desfecho || null,
  };
}

/** O dossiê que vai para o modelo. Sem PII: a auditoria julga conduta, não ficha. */
function montarDossie(ev, scorecard) {
  const criterios = (scorecard.criterios || []).map((c, i) =>
    `${i + 1}. [${c.id}] ${c.nome} (peso ${c.peso ?? 1}${c.critico ? ', CRÍTICO' : ''})
   ${c.descricao || ''}
   Como avaliar: ${c.instrucao || 'julgue pelo que está nas evidências.'}`).join('\n');

  const pb = ev.playbook;
  const feitas = new Set((pb?.execucao?.etapas_feitas || []).map(f => f.etapa_id));

  return [
    `## CRITÉRIOS\n${criterios}`,
    `## O QUE FOI EXECUTADO (ferramentas)\n${ev.tools.length ? ev.tools.join(', ') : 'nenhuma ferramenta foi executada'}`,
    pb?.playbook
      ? `## PROCEDIMENTO ESPERADO: ${pb.playbook.nome}\n${pb.etapas.map(e =>
          `${feitas.has(e.id) ? '[x]' : '[ ]'} ${e.ordem}. ${e.titulo} (${e.obrigatoriedade})`).join('\n')}` +
        (pb.playbook.excecoes ? `\nExceções aceitáveis: ${pb.playbook.excecoes}` : '')
      : '## PROCEDIMENTO\nNenhum procedimento estava ativo nesta conversa.',
    `## TEMPOS\nPrimeira resposta: ${ev.tempos.primeira_resposta_seg ?? '?'}s · Duração: ${ev.tempos.duracao_min ?? '?'}min · ${ev.tempos.mensagens} mensagens`,
    `## DESFECHO REGISTRADO\n${ev.desfecho || 'não registrado'}`,
    `## BASE DE CONHECIMENTO\n${ev.conhecimento} consulta(s) durante o atendimento`,
    `## CONVERSA\n${ev.mensagens.map(m => `${m.origem}: ${m.texto || '[mídia]'}`).join('\n')}`,
  ].join('\n\n');
}

const SYSTEM = `Você audita atendimentos de um provedor de internet. Seja rigoroso e JUSTO.

REGRAS INEGOCIÁVEIS:
- Avalie o que FOI FEITO, com base nas evidências. A conversa sozinha não basta:
  quem resolveu rápido e escreveu pouco pode ter feito um ótimo atendimento.
- TODA nota abaixo da máxima exige justificativa concreta citando a evidência.
  Sem justificativa, a nota não vale.
- Não penalize etapa de procedimento pulada quando o contexto justificar
  (ex.: cabo rompido relatado dispensa teste remoto). Registre como exceção.
- Violação crítica é OUTRA coisa, não um critério: informar preço divergente da
  fonte oficial, prometer visita inexistente, expor dado sensível ou executar
  ação não autorizada. Só registre se houver evidência clara.

Responda APENAS com JSON válido, sem markdown, neste formato:
{"avaliacoes":[{"criterio_id":"...","nota":0-10,"justificativa":"...","evidencias":["..."]}],
 "violacoes":[{"tipo":"...","descricao":"...","evidencia":"..."}],
 "oportunidades":[{"tipo":"fechamento|upsell|cross_sell|cobertura|follow_up|pre_cadastro","evidencia":"...","confianca":"alta|media|baixa","controlavel":true}],
 "excecoes_playbook":[{"etapa_id":"...","motivo":"..."}],
 "resumo":"2 frases sobre o atendimento",
 "coaching":"1 sugestão prática para este atendente"}`;

/** Extrai JSON mesmo quando o modelo embrulha em cerca de markdown. */
function lerJSON(bruto) {
  const texto = String(bruto || '').replace(/^```(?:json)?|```$/gm, '').trim();
  const ini = texto.indexOf('{');
  const fim = texto.lastIndexOf('}');
  if (ini === -1 || fim <= ini) throw new Error('a IA não devolveu JSON');
  return JSON.parse(texto.slice(ini, fim + 1));
}

/**
 * Audita uma conversa. Substitui a auditoria anterior se houver — reauditar
 * não pode somar a mesma conversa duas vezes no painel.
 */
export async function auditar(conversa, { origem = 'automatica', scorecard = null } = {}) {
  const db = getDb();

  // `conversaRepo.encerrar` zera `agente_id` — e a auditoria roda DEPOIS do
  // encerramento. Sem este fallback, toda auditoria automática ficaria sem
  // dono e o coaching por agente (§99) nunca teria de quem falar.
  const agenteId = conversa.agente_id
    || (await db('mensagens').where({ conversa_id: conversa.id, origem: 'agente' })
          .whereNotNull('agente_id').orderBy('criado_em', 'desc').first().catch(() => null))?.agente_id
    || null;
  const perfil = conversa.fila_id
    ? (await db('filas').where({ id: conversa.fila_id }).first().catch(() => null))?.slug
    : null;

  const sc = scorecard || await scorecardDe(perfil === 'comercial' ? 'comercial' : 'suporte');
  if (!sc) return { erro: 'sem_scorecard' };
  if (!(sc.criterios || []).length) return { erro: 'scorecard_vazio' };

  const ev = await reunirEvidencias(conversa);
  if (!ev.mensagens.length) return { erro: 'conversa_vazia' };

  const bruto = await generateTexto({
    system: SYSTEM,
    messages: [{ role: 'user', content: montarDossie(ev, sc) }],
    temperatura: 0,
    maxTokens: 2000,
  });

  const r = lerJSON(bruto);

  // A IA propõe; a aritmética é NOSSA. Deixar o modelo calcular a média daria
  // uma nota que ninguém consegue conferir nem reproduzir.
  const validas = (r.avaliacoes || []).filter(a => avaliacaoValida(a));
  const bruta = calcularScore(sc.criterios, validas);
  const ai = aplicarViolacoes(bruta, r.violacoes);
  const notas = scoreFinal({ ai });

  const aderencia = ev.playbook
    ? aderenciaPlaybook(ev.playbook.etapas, ev.playbook.execucao?.etapas_feitas, r.excecoes_playbook)
    : null;

  const [auditoria] = await db('quality_auditorias')
    .insert({
      conversa_id: conversa.id,
      agente_id: agenteId,
      scorecard_id: sc.id,
      scorecard_versao: sc.versao,
      perfil: sc.perfil,
      ai_score: notas.ai_score,
      final_score: notas.final_score,
      avaliacoes: JSON.stringify(validas),
      violacoes: JSON.stringify(r.violacoes || []),
      oportunidades: JSON.stringify(r.oportunidades || []),
      aderencia: aderencia ? JSON.stringify(aderencia) : null,
      resumo: r.resumo || null,
      coaching: r.coaching || null,
      origem,
    })
    .onConflict('conversa_id')
    .merge()
    .returning('*');

  return { auditoria };
}

/** §98 — o supervisor revisa. `ai_score` NÃO é sobrescrito. */
export async function revisar(auditoriaId, { humanScore, observacao, agenteId }) {
  const db = getDb();
  const atual = await db('quality_auditorias').where({ id: auditoriaId }).first();
  if (!atual) return { erro: 'nao_encontrada' };

  const notas = scoreFinal({ ai: atual.ai_score, humano: humanScore });
  const [auditoria] = await db('quality_auditorias').where({ id: auditoriaId })
    .update({
      human_score: notas.human_score,
      final_score: notas.final_score,
      observacao_humana: observacao || null,
      revisado_por: agenteId,
      revisado_em: db.fn.now(),
    })
    .returning('*');
  return { auditoria, divergencia: notas.divergencia };
}

/** §99 — coaching por padrão. Sem ranking. */
export async function coaching(agenteId, { dias = 30 } = {}) {
  const auditorias = await getDb()('quality_auditorias')
    .where({ agente_id: agenteId })
    .whereRaw(`criado_em > now() - interval '${Math.min(Number(dias) || 30, 365)} days'`)
    .orderBy('criado_em', 'desc');
  return { agente_id: agenteId, dias, ...padroesRecorrentes(auditorias) };
}
