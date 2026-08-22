/**
 * jobs.js — agendamento de retomada do fluxo (§127).
 *
 * Dois tipos, os dois com o mesmo efeito no motor (entregar uma mensagem
 * `{tipo:'timer'}` na conversa parada) e nomes distintos porque o que se quer
 * saber ao olhar a tabela é POR QUE aquilo está agendado:
 *
 *   - `flow_resume`  — `aguardar_tempo` acabou de expirar;
 *   - `wait_timeout` — `aguardar_resposta` estourou sem o cliente responder.
 *
 * `chave` (`conversa:no`) é UNIQUE e o insert é upsert: o cliente que escreve
 * durante a espera não pode agendar um segundo job, e a mesma conversa
 * chegando de novo ao mesmo nó (loop, nova execução) precisa REVIVER a linha —
 * sem o `merge`, a chave ficaria ocupada por um job `ok` e o timer dispararia
 * uma vez só, para sempre.
 */
import { getDb }       from '../config/db.js';
import { reivindicar } from './filaDb.js';
import { auditar }     from './auditoria.js';

export async function agendar({ tipo, conversaId, noId, executarEm, payload = {}, db = getDb() }) {
  const chave = `${conversaId}:${noId}`;
  await db('jobs')
    .insert({
      tipo, chave,
      payload:     JSON.stringify({ conversaId, noId, ...payload }),
      executar_em: executarEm,
      status:      'pendente',
      tentativas:  0,
    })
    .onConflict('chave')
    .merge(['tipo', 'payload', 'executar_em', 'status', 'tentativas', 'reivindicado_em', 'ultimo_erro']);
  console.log(`[Jobs] ${tipo} agendado para ${new Date(executarEm).toISOString()} (${chave})`);
  return chave;
}

/**
 * Cancela o job daquele nó — a espera foi resolvida antes da hora.
 *
 * Quem chama precisa dar `await`: solto, o DELETE pode cair DEPOIS do upsert do
 * job seguinte (fluxo que volta ao mesmo `aguardar_resposta` para repergunta) e
 * apagar o timer recém-agendado — cliente parado para sempre.
 */
export function cancelar(conversaId, noId, { db = getDb() } = {}) {
  return db('jobs').where({ chave: `${conversaId}:${noId}`, status: 'pendente' }).del();
}

/**
 * Audita uma conversa encerrada. Devolve `false` — e NÃO lança — quando não há
 * o que auditar: sem scorecard ativo, cada conversa encerrada viraria uma linha
 * de falha na DLQ, e a DLQ deixaria de significar "algo deu errado".
 */
async function auditarConversa(conversaId, db) {
  const { conversaRepo } = await import('../repositories/conversaRepository.js');
  const conversa = await conversaRepo.porId(conversaId);
  if (!conversa) return false;

  const { auditar: auditarQualidade } = await import('./quality.js');
  const r = await auditarQualidade(conversa, { origem: 'automatica' });
  return !r.erro;
}

/** Executa os jobs vencidos. Chamado só pelo worker. */
export async function processarVencidos({ db = getDb(), limite = 10, aoReivindicar } = {}) {
  const linhas = await reivindicar(db, 'jobs', {
    onde: 'executar_em <= now()', ordem: 'executar_em', limite,
  });
  if (!linhas.length) return [];
  aoReivindicar?.(linhas.map(l => l.id));

  // Paralelo pelo mesmo motivo do inbox: conversas distintas não se esperam.
  return Promise.all(linhas.map(job => executar(job, db)));
}

async function executar(job, db) {
  try {
    const { conversaId, noId } = job.payload || {};

    // FASE 11: auditoria pós-atendimento (§89). Entra como job pelo mesmo
    // motivo dos timers — é trabalho que não pode segurar o encerramento da
    // conversa e que precisa de retry se a IA estiver fora do ar.
    if (job.tipo === 'quality_audit') {
      const feito = await auditarConversa(conversaId, db);
      await db('jobs').where({ id: job.id })
        .update({ status: 'ok', reivindicado_em: null, ultimo_erro: feito ? null : 'no-op: sem scorecard ativo ou conversa vazia' });
      return { id: job.id, tipo: job.tipo, auditou: feito };
    }

    const { retomarTimer } = await import('./motorFluxo.js');
    // `retomarTimer` é no-op silencioso quando a espera já foi resolvida (o
    // cliente respondeu, o estado expirou, um humano assumiu a conversa).
    const retomou = await retomarTimer(conversaId, noId);

    await db('jobs').where({ id: job.id })
      .update({ status: 'ok', reivindicado_em: null, ultimo_erro: retomou ? null : 'no-op: espera já resolvida' });
    return { id: job.id, tipo: job.tipo, retomou };
  } catch (err) {
    console.error(`[Jobs] ${job.tipo} ${job.id} falhou:`, err.message);
    await db('jobs').where({ id: job.id })
      .update({ status: 'falha', reivindicado_em: null, ultimo_erro: String(err.message).slice(0, 500) })
      .catch(() => {});
    auditar({
      actorType: 'system', actorId: 'jobs', action: 'dlq_job',
      resource: `jobs:${job.id}`, after: { tipo: job.tipo, erro: String(err.message).slice(0, 200) },
    });
    return { id: job.id, tipo: job.tipo, erro: err.message };
  }
}
