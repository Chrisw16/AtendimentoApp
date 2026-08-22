/**
 * playbook.js — carregamento, execução e curadoria de playbooks (FASE 8).
 *
 * A parte não-óbvia é o RASTREAMENTO. Um playbook que só vira texto no prompt
 * é uma sugestão; para virar procedimento auditável (§95, FASE 11) é preciso
 * saber o que foi de fato executado. Há dois caminhos, e cada um existe porque
 * o outro não cobre o caso:
 *
 *  - **por tool** (`registrarTool`): a etapa declara as tools que a evidenciam
 *    e é dada por cumprida quando uma delas roda. Não depende de a IA lembrar
 *    de se auto-reportar — e é o único sinal que a Quality AI pode auditar sem
 *    acreditar no que o modelo disse;
 *  - **explícito** (`concluirEtapa`): etapas conversacionais ("entender a
 *    necessidade", "tratar objeções") não têm tool que as prove. Para elas a IA
 *    chama `concluir_etapa_playbook`.
 */
import { getDb } from '../config/db.js';
import {
  podeTransicionar, erroTransicao, etapasDaTool, proximaEtapa,
  concluido, formatarParaPrompt,
} from './playbookHelpers.js';

/** Playbook publicado + etapas, pelo slug (é o que o nó do fluxo guarda). */
export async function carregar(slug, { permitirTeste = false } = {}) {
  if (!slug) return null;
  const db = getDb();
  const status = permitirTeste ? ['publicado', 'teste'] : ['publicado'];
  const playbook = await db('playbooks').where({ slug }).whereIn('status', status).first();
  if (!playbook) return null;
  const etapas = await db('playbook_etapas').where({ playbook_id: playbook.id }).orderBy('ordem');
  return { playbook, etapas };
}

/**
 * Execução viva desta conversa neste playbook, criando se não houver.
 *
 * `onConflict.merge` em vez de `ignore` porque precisamos da LINHA de volta —
 * e o cliente que volta ao mesmo procedimento continua de onde parou em vez de
 * recomeçar, que é o que o `unique(conversa_id, playbook_id)` garante.
 */
export async function obterExecucao(conversaId, playbook) {
  const db = getDb();
  const [exec] = await db('playbook_execucoes')
    .insert({
      conversa_id: conversaId, playbook_id: playbook.id,
      versao: playbook.versao, resultado: 'em_andamento',
    })
    .onConflict(['conversa_id', 'playbook_id'])
    .merge({ playbook_id: playbook.id })   // no-op que força o RETURNING
    .returning('*');
  return exec;
}

function normalizarFeitas(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

/** Marca etapas cumpridas, sem duplicar, e fecha a execução quando acabar. */
async function marcar(exec, etapas, ids, via) {
  if (!ids.length) return exec;
  const db     = getDb();
  const feitas = normalizarFeitas(exec.etapas_feitas);
  const jaTem  = new Set(feitas.map(f => f.etapa_id));
  const novas  = ids.filter(id => !jaTem.has(id));
  if (!novas.length) return exec;

  const agora = new Date().toISOString();
  const todas = [...feitas, ...novas.map(etapa_id => ({ etapa_id, via, em: agora }))];
  const patch = { etapas_feitas: JSON.stringify(todas) };

  if (concluido(etapas, todas)) {
    patch.resultado    = 'concluido';
    patch.concluido_em = db.fn.now();
  }

  const [atualizada] = await db('playbook_execucoes').where({ id: exec.id }).update(patch).returning('*');
  return atualizada;
}

/** Chamado a cada tool executada pela IA — o rastreamento que não depende do modelo. */
export async function registrarTool(exec, etapas, nomeTool) {
  return marcar(exec, etapas, etapasDaTool(etapas, nomeTool).map(e => e.id), 'tool');
}

/** Etapa conversacional, marcada explicitamente pela IA. */
export async function concluirEtapa(exec, etapas, referencia) {
  const alvo = etapas.find(e =>
    e.id === referencia ||
    String(e.ordem) === String(referencia) ||
    e.titulo?.toLowerCase() === String(referencia || '').toLowerCase());
  if (!alvo) return { erro: 'etapa_nao_encontrada', exec };
  return { exec: await marcar(exec, etapas, [alvo.id], 'manual'), etapa: alvo };
}

/**
 * O bloco de playbook para o system prompt + a execução usada.
 *
 * No sandbox NÃO cria execução: "Testar fluxo" encheria o histórico de
 * procedimentos com conversas que nunca existiram, e é esse histórico que a
 * auditoria vai ler. O prompt sai igual — só o registro não acontece.
 */
export async function prepararParaIA(slug, { conversaId = null, sandbox = false } = {}) {
  const carregado = await carregar(slug, { permitirTeste: sandbox });
  if (!carregado) return null;
  const { playbook, etapas } = carregado;

  if (sandbox || !conversaId) {
    return { playbook, etapas, exec: null, bloco: formatarParaPrompt(playbook, etapas, []) };
  }

  const exec = await obterExecucao(conversaId, playbook);
  return {
    playbook, etapas, exec,
    bloco: formatarParaPrompt(playbook, etapas, normalizarFeitas(exec.etapas_feitas)),
  };
}

/** A etapa em foco agora — usada pela tela e pelo copiloto (FASE 10). */
export function focoAtual(etapas, exec) {
  return proximaEtapa(etapas, normalizarFeitas(exec?.etapas_feitas));
}

// ── CURADORIA ─────────────────────────────────────────────────────

/**
 * §64: publicar congela o playbook INTEIRO (com etapas) num snapshot.
 *
 * Guardar só o número da versão não bastaria: a auditoria que abrir um
 * atendimento de três meses atrás precisa ver o procedimento COMO ELE ERA, e
 * reconstruir a partir das tabelas vivas mostraria o de hoje.
 */
export async function mudarStatus(playbookId, novoStatus, { agenteId = null } = {}) {
  const db = getDb();
  const pb = await db('playbooks').where({ id: playbookId }).first();
  if (!pb) return { erro: 'nao_encontrado' };
  if (!podeTransicionar(pb.status, novoStatus)) {
    return { erro: 'transicao_invalida', mensagem: erroTransicao(pb.status, novoStatus) };
  }

  return db.transaction(async trx => {
    const patch = { status: novoStatus, atualizado: trx.fn.now() };

    if (novoStatus === 'publicado') {
      const etapas = await trx('playbook_etapas').where({ playbook_id: pb.id }).orderBy('ordem');
      if (!etapas.length) return { erro: 'sem_etapas', mensagem: 'Playbook sem etapas não pode ir ao ar.' };

      await trx('playbook_versoes').insert({
        playbook_id: pb.id, versao: pb.versao,
        snapshot: JSON.stringify({ playbook: pb, etapas }),
        criado_por: agenteId,
      }).onConflict(['playbook_id', 'versao']).ignore();

      patch.publicado_em = trx.fn.now();
    }

    // Voltar ao teste abre versão nova: o que for editado agora não pode se
    // confundir com o que já rodou em atendimento real.
    if (pb.status === 'publicado' && novoStatus === 'teste') patch.versao = pb.versao + 1;

    const [atualizado] = await trx('playbooks').where({ id: pb.id }).update(patch).returning('*');
    return { playbook: atualizado };
  });
}
