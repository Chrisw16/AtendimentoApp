/**
 * conversaRepository.js
 * Toda query de conversa passa aqui — zero SQL espalhado nas rotas
 */
import { getDb } from '../config/db.js';
import { estadoStore } from '../services/estadoStore.js';

const CONVERSA_FIELDS = [
  'conversas.*',
  'agentes.nome as agente_nome',
  // FASE 5: sem isto a tela só saberia o `fila_id` (um uuid) e teria de buscar
  // o nome de novo. Quem usar CONVERSA_FIELDS precisa dos DOIS leftJoin.
  'filas.nome as fila_nome',
  'filas.cor as fila_cor',
];

export const conversaRepo = {
  // ── LISTAGEM ─────────────────────────────────────────────────
  async listar({ status, canal, agenteId, limit = 100, offset = 0 } = {}) {
    const db = getDb();
    let q = db('conversas')
      .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
      .leftJoin('filas',   'conversas.fila_id',   'filas.id')
      .select(CONVERSA_FIELDS)
      .orderBy('conversas.atualizado', 'desc')
      .limit(limit)
      .offset(offset);

    if (status)   q = q.where('conversas.status', status);
    if (canal)    q = q.where('conversas.canal', canal);
    if (agenteId) q = q.where('conversas.agente_id', agenteId);

    return q;
  },

  // ── BUSCAR POR ID ─────────────────────────────────────────────
  async porId(id) {
    return getDb()('conversas')
      .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
      .leftJoin('filas',   'conversas.fila_id',   'filas.id')
      .select(CONVERSA_FIELDS)
      .where('conversas.id', id)
      .first();
  },

  // ── BUSCAR POR TELEFONE/CANAL ─────────────────────────────────
  async porTelefoneCanal(telefone, canal) {
    return getDb()('conversas')
      .where({ telefone, canal })
      .whereNot({ status: 'encerrada' })
      .orderBy('criado_em', 'desc')
      .first();
  },

  // ── CRIAR ─────────────────────────────────────────────────────
  async criar(dados) {
    const db = getDb();
    // O contador é atômico, então em operação normal não há colisão. O retry é
    // rede de segurança para o contador nascer ATRÁS do que já está gravado
    // (restore de backup, seed torto): cada tentativa AVANÇA o contador, então
    // converge — diferente do `COUNT(*)+1` antigo, onde todos recontavam o mesmo.
    for (let tentativa = 1; ; tentativa++) {
      try {
        const [conv] = await db('conversas')
          .insert({ ...dados, protocolo: await _gerarProtocolo(db) })
          .returning('*');
        return conv;
      } catch (err) {
        const colisaoProtocolo = err?.code === '23505' && /protocolo/.test(err?.constraint || '');
        if (!colisaoProtocolo || tentativa >= 20) throw err;
      }
    }
  },

  // ── OBTER OU CRIAR ────────────────────────────────────────────
  // Os 3 webhooks faziam `porTelefoneCanal` → `criar`, um check-then-act: duas
  // mensagens simultâneas de um número novo passavam as duas pela checagem e
  // nasciam DUAS conversas, cada uma com sua execução de fluxo. A unique parcial
  // da migration 014 é a autoridade; aqui só se trata a corrida perdida.
  // Devolve `{ conversa, nova }` — os webhooks só emitem `nova_conversa` no SSE
  // quando de fato nasceu uma, e quem perde a corrida não pode emitir.
  async obterOuCriar(telefone, canal, dados = {}) {
    const existente = await conversaRepo.porTelefoneCanal(telefone, canal);
    if (existente) return { conversa: existente, nova: false };

    try {
      return { conversa: await conversaRepo.criar({ ...dados, telefone, canal }), nova: true };
    } catch (err) {
      if (err?.code !== '23505') throw err;
      // Outro processo criou entre a checagem e o insert — usa a dele.
      const dele = await conversaRepo.porTelefoneCanal(telefone, canal);
      if (dele) return { conversa: dele, nova: false };
      throw err;
    }
  },

  // ── ATUALIZAR ─────────────────────────────────────────────────
  async atualizar(id, dados) {
    const [conv] = await getDb()('conversas')
      .where({ id })
      .update({ ...dados, atualizado: getDb().fn.now() })
      .returning('*');
    return conv;
  },

  // ── ASSUMIR ───────────────────────────────────────────────────
  async assumir(id, agenteId) {
    return conversaRepo.atualizar(id, {
      status:           'ativa',
      agente_id:        agenteId,
      aguardando_desde: null,
    });
  },

  // ── DEVOLVER IA ───────────────────────────────────────────────
  async devolverIA(id) {
    return conversaRepo.atualizar(id, {
      status:    'ia',
      agente_id: null,
    });
  },

  // ── ENCERRAR ──────────────────────────────────────────────────
  async encerrar(id) {
    // Apaga a execução junto: enquanto o estado vivia em memória, encerrar pelo
    // painel se curava sozinho no restart. Em tabela, a linha ficaria e o
    // cliente que voltasse a escrever retomaria no meio do fluxo antigo.
    await estadoStore.delete(id).catch(() => {});
    const conv = await conversaRepo.atualizar(id, {
      status:    'encerrada',
      agente_id: null,
      // FASE 12: `atualizado` é bombardeado por `incrementarNaoLidas`, e o
      // `audit_log` só registra o encerramento HUMANO — o do nó `encerrar` do
      // motor não passa por lá. Sem esta coluna não há tempo médio, janela de
      // recontato nem resolução efetiva.
      encerrada_em: getDb().fn.now(),
    });

    // FASE 11 (§89): auditoria pós-atendimento. Entra como JOB e não inline
    // porque não pode segurar o encerramento — o agente clica "encerrar" e a
    // tela responde na hora; a nota sai depois. O atraso de 1 min deixa a
    // conversa assentar (mensagem em voo, último envio do outbox).
    //
    // Fica aqui, no único ponto por onde TODO encerramento passa (painel e nó
    // `encerrar` do motor), em vez de nos dois chamadores.
    if (conv) {
      const { agendar } = await import('../services/jobs.js');
      agendar({
        tipo: 'quality_audit', conversaId: id, noId: 'quality',
        executarEm: new Date(Date.now() + 60_000).toISOString(),
      }).catch(err => console.error('[Quality] não agendou auditoria:', err.message));
    }
    return conv;
  },

  // ── ZERAR NÃO LIDAS ───────────────────────────────────────────
  async zerarNaoLidas(id) {
    await getDb()('conversas').where({ id }).update({ nao_lidas: 0 });
  },

  // ── INCREMENTAR NÃO LIDAS ────────────────────────────────────
  async incrementarNaoLidas(id) {
    await getDb()('conversas')
      .where({ id })
      .increment('nao_lidas', 1)
      .update({ atualizado: getDb().fn.now() });
  },
};

// ── HELPERS ──────────────────────────────────────────────────────
/**
 * `AAAAMMDD-NNNN`, com NNNN reiniciando a cada dia.
 *
 * Era `COUNT(*) do dia + 1`, que é uma corrida: inserts simultâneos calculam o
 * mesmo número e o segundo bate na unique de `conversas.protocolo`. Retry na
 * aplicação não converge — todos recontam ao mesmo tempo (medido: 8 chamadas
 * concorrentes ainda colidiam na 5ª tentativa).
 *
 * Agora o contador é uma linha por dia e o incremento é UM statement atômico:
 * o `ON CONFLICT DO UPDATE` pega lock da linha, então N chamadas concorrentes
 * recebem N números distintos. Migration 014.
 */
async function _gerarProtocolo(db) {
  // O dia é o LOCAL, não `CURRENT_DATE`. Container em UTC + operação em BRT faria
  // o protocolo virar o dia seguinte às 21h da noite — o cliente que abre chamado
  // às 22h de 21/08 receberia `20260822-0001`. Produto é single-tenant para um
  // provedor de Natal/RN (ver acoplamento NetGo no CLAUDE.md); se um dia virar
  // multi-região, isto passa a ser config, não constante.
  const { rows } = await db.raw(`
    INSERT INTO protocolo_seq (dia, n)
    VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)
    ON CONFLICT (dia) DO UPDATE SET n = protocolo_seq.n + 1
    RETURNING n, to_char(dia, 'YYYYMMDD') AS prefixo
  `);
  const { n, prefixo } = rows[0];
  return `${prefixo}-${String(n).padStart(4, '0')}`;
}
