/**
 * conversaRepository.js
 * Toda query de conversa passa aqui — zero SQL espalhado nas rotas
 */
import { getDb } from '../config/db.js';
import { estadoStore } from '../services/estadoStore.js';

const CONVERSA_FIELDS = [
  'conversas.*',
  'agentes.nome as agente_nome',
];

export const conversaRepo = {
  // ── LISTAGEM ─────────────────────────────────────────────────
  async listar({ status, canal, agenteId, limit = 100, offset = 0 } = {}) {
    const db = getDb();
    let q = db('conversas')
      .leftJoin('agentes', 'conversas.agente_id', 'agentes.id')
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
    const [conv] = await db('conversas')
      .insert({ ...dados, protocolo: await _gerarProtocolo(db) })
      .returning('*');
    return conv;
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
    return conversaRepo.atualizar(id, {
      status:    'encerrada',
      agente_id: null,
    });
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
  const { rows } = await db.raw(`
    INSERT INTO protocolo_seq (dia, n) VALUES (CURRENT_DATE, 1)
    ON CONFLICT (dia) DO UPDATE SET n = protocolo_seq.n + 1
    RETURNING n, to_char(dia, 'YYYYMMDD') AS prefixo
  `);
  const { n, prefixo } = rows[0];
  return `${prefixo}-${String(n).padStart(4, '0')}`;
}
