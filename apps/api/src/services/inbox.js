/**
 * inbox.js — o webhook grava o payload ANTES de processá-lo (§125).
 *
 * O que isto conserta: até aqui a rota chamava `handle*` direto, e o `handle*`
 * disparava o motor sem `await`. Processo morto no meio do turno = mensagem já
 * persistida (e deduplicada por `external_id`), reentrega do provedor
 * descartada, e **o motor nunca roda para aquela mensagem**. O cliente fica
 * falando sozinho e não há vestígio.
 *
 * O ganho é DURABILIDADE, não latência — os três handlers já eram
 * fire-and-forget, então o 200 nunca esperou a IA. Para não PERDER latência,
 * `receber` cutuca o processamento na hora (sem `await`); o tick do worker é a
 * rede de segurança, não o caminho normal.
 *
 * Dedup por `sha256(canal:corpo_cru)` e não por `external_id`: a Meta entrega N
 * mensagens num POST, `messages.update` da Evolution é um array sem id e
 * `connection.update` não tem id nenhum. Reentrega de webhook é byte-idêntica
 * por definição — é o mesmo payload reenviado.
 *
 * ⚠️ Reprocessar uma entrada RE-EXECUTA o turno do motor. Por isso o reclaim de
 * lease manda para `falha`, não para `pendente` (ver `politicaRetry`). Aqui só
 * há retry quando um humano pede pela rota de reprocessamento (§132).
 */
import { createHash } from 'node:crypto';
import { getDb }      from '../config/db.js';
import { reivindicar } from './filaDb.js';
import { auditar }    from './auditoria.js';

/** Canal → handler. Mesma função que a rota chamava antes; nada nelas mudou. */
const HANDLERS = {
  meta:      () => import('./webhooks/meta.js').then(m => m.handleMeta),
  evolution: () => import('./webhooks/evolution.js').then(m => m.handleEvolution),
  telegram:  () => import('./webhooks/telegram.js').then(m => m.handleTelegram),
};

export function hashEntrada(canal, corpoCru) {
  return createHash('sha256').update(`${canal}:${corpoCru}`).digest('hex');
}

/**
 * Persiste a entrada e cutuca o processamento. A rota responde 200 logo depois.
 *
 * @returns {{id?: string, duplicada: boolean}}
 */
export async function receber(canal, corpoCru, payload, { db = getDb(), cutucar = true } = {}) {
  const [linha] = await db('inbox')
    .insert({
      canal,
      dedup_hash: hashEntrada(canal, corpoCru),
      payload:    JSON.stringify(payload ?? null),
      status:     'pendente',
    })
    .onConflict('dedup_hash').ignore()
    .returning(['id']);

  // Sem linha = a unique barrou: é reentrega do MESMO payload. Não reprocessa.
  if (!linha) return { duplicada: true };

  if (cutucar) {
    processarPendentes().catch(err => console.error('[Inbox] cutucada falhou:', err.message));
  }
  return { id: linha.id, duplicada: false };
}

/** Processa um lote de entradas pendentes. Chamado pela cutucada e pelo worker. */
export async function processarPendentes({ db = getDb(), limite = 10, aoReivindicar } = {}) {
  const linhas = await reivindicar(db, 'inbox', { ordem: 'recebido_em', limite });
  if (!linhas.length) return [];
  aoReivindicar?.(linhas.map(l => l.id));

  const resultados = [];
  for (const linha of linhas) {
    resultados.push(await processarEntrada(linha, db));
  }
  return resultados;
}

async function processarEntrada(linha, db) {
  try {
    const carregar = HANDLERS[linha.canal];
    if (!carregar) throw new Error(`canal desconhecido: ${linha.canal}`);
    const handler = await carregar();

    // Segunda passada = replay pedido por um humano (§132). O handler precisa
    // saber: no caminho normal, todo `handle*` aborta quando a mensagem já
    // existe — e é justamente o turno dela que se quer recuperar.
    // `tentativas` é incrementado na reivindicação, então 1 = primeira vez.
    const reprocessando = (linha.tentativas || 0) > 1;

    // `await` de verdade: é isto que faz a linha só virar `ok` DEPOIS do turno.
    // (Os `handle*` passaram a esperar o motor pelo mesmo motivo — sem isso o
    // inbox marcaria sucesso enquanto o turno ainda podia morrer no meio.)
    await handler(linha.payload, { reprocessando });

    await db('inbox').where({ id: linha.id })
      .update({ status: 'ok', processado_em: db.fn.now(), reivindicado_em: null, ultimo_erro: null });
    return { id: linha.id, status: 'ok' };
  } catch (err) {
    console.error(`[Inbox] ${linha.canal} ${linha.id} falhou:`, err.message);
    await db('inbox').where({ id: linha.id })
      .update({
        status: 'falha', reivindicado_em: null,
        ultimo_erro: String(err.message).slice(0, 500),
      })
      .catch(() => {});
    // DLQ é evento auditável (§119): sem isto, mensagem de cliente some do radar.
    auditar({
      actorType: 'system', actorId: 'inbox', action: 'dlq_entrada',
      resource: `inbox:${linha.id}`, after: { canal: linha.canal, erro: String(err.message).slice(0, 200) },
    });
    return { id: linha.id, status: 'falha', erro: err.message };
  }
}
