/**
 * workerFilas.js — o tique-taque das três filas da FASE 4.
 *
 * Idioma dos monitores que já existem (`filaService`, `supervisoraIA`): um
 * `setInterval`, sem processo separado nem dependência nova. Cada tick:
 *
 *   1. reclaim  — devolve o que ficou preso em `processando` (worker morto);
 *   2. inbox    — entradas que a cutucada do webhook não pegou (ou que falharam);
 *   3. outbox   — saídas pendentes, uma por conversa, na ordem;
 *   4. jobs     — `aguardar_tempo`/`aguardar_resposta` que venceram;
 *   5. purga    — de hora em hora, apaga o que já foi processado há dias.
 *
 * ⚠️ O caminho normal do inbox NÃO é este tick: `inbox.receber` cutuca o
 * processamento na hora, senão toda mensagem de cliente esperaria até 5 s para
 * ser respondida. Aqui é rede de segurança.
 *
 * ponytail: um `setInterval` global, não um worker por fila. As três filas
 * rodam em sequência dentro do tick (mas o LOTE de cada uma vai em paralelo —
 * conversas distintas não se esperam). Com um container, é barato. Se um dia a
 * fila de saída atrasar por causa da de entrada, aí sim separe os timers.
 */
import { getDb }         from '../config/db.js';
import { reclamarLeases, liberar } from './filaDb.js';
import * as inbox        from './inbox.js';
import * as outbox       from './outbox.js';
import * as jobs         from './jobs.js';

const INTERVALO_MS = 5_000;
const PURGA_MS     = 3600_000;      // de hora em hora
const RETENCAO_DIAS = 7;
// A DLQ fica muito mais tempo (é ela que um humano vai investigar), mas não
// para sempre: `inbox.payload` é o webhook CRU, com telefone e texto do cliente.
const RETENCAO_DLQ_DIAS = 30;

let timer      = null;
let rodando    = false;             // impede ticks sobrepostos
let parando    = false;
let ultimaPurga = 0;

/** ids reivindicados AGORA, por tabela — o dreno do SIGTERM devolve estes. */
const emVoo = { inbox: new Set(), outbox: new Set(), jobs: new Set() };

const rastrear = (tabela) => (ids) => ids.forEach(id => emVoo[tabela].add(id));

export async function tick({ db = getDb() } = {}) {
  if (rodando || parando) return;
  rodando = true;
  try {
    for (const tabela of ['inbox', 'outbox', 'jobs']) {
      const devolvidas = await reclamarLeases(db, tabela);
      if (devolvidas.length) {
        console.warn(`[Worker] ${devolvidas.length} linha(s) de ${tabela} com lease vencido → ${devolvidas[0].status}`);
      }
    }

    await inbox.processarPendentes({ db, aoReivindicar: rastrear('inbox') });
    await outbox.processarPendentes({ db, aoReivindicar: rastrear('outbox') });
    await jobs.processarVencidos({ db, aoReivindicar: rastrear('jobs') });

    if (Date.now() - ultimaPurga > PURGA_MS) {
      ultimaPurga = Date.now();
      await purgar(db);
    }
  } catch (err) {
    console.error('[Worker] tick falhou:', err.message);
  } finally {
    for (const s of Object.values(emVoo)) s.clear();
    rodando = false;
  }
}

/**
 * Retenção (§153). Sem isto, `inbox` guarda TODO payload de webhook para sempre
 * — é a tabela que mais cresce no sistema, e ninguém olha entrada de duas
 * semanas atrás. A DLQ (`falha`) sobrevive muito mais, mas não para sempre:
 * o payload cru carrega telefone e texto do cliente (§124).
 */
async function purgar(db) {
  const corte    = new Date(Date.now() - RETENCAO_DIAS * 86400_000);
  const corteDlq = new Date(Date.now() - RETENCAO_DLQ_DIAS * 86400_000);

  const n1 = await db('inbox').where({ status: 'ok' }).where('recebido_em', '<', corte).del();
  const n2 = await db('jobs').where({ status: 'ok' }).where('criado_em', '<', corte).del();
  const n3 = await db('outbox').whereIn('status', ['enviada', 'nao_suportada'])
    .where('criado_em', '<', corte).del();

  const n4 = await db('inbox').where({ status: 'falha' }).where('recebido_em', '<', corteDlq).del();
  const n5 = await db('outbox').whereIn('status', ['falha', 'expirada'])
    .where('criado_em', '<', corteDlq).del();
  const n6 = await db('jobs').where({ status: 'falha' }).where('criado_em', '<', corteDlq).del();

  if (n1 + n2 + n3) console.log(`[Worker] purga: ${n1} inbox, ${n2} jobs, ${n3} outbox`);
  if (n4 + n5 + n6) console.warn(`[Worker] purga da DLQ (>${RETENCAO_DLQ_DIAS}d): ${n4} inbox, ${n5} outbox, ${n6} jobs`);
}

export function iniciarWorker({ intervaloMs = INTERVALO_MS } = {}) {
  if (timer) return timer;
  parando = false;
  timer = setInterval(() => { tick().catch(() => {}); }, intervaloMs);
  timer.unref?.();     // não segura o event loop sozinho
  console.log(`✅ Worker de filas iniciado (a cada ${intervaloMs / 1000}s)`);
  return timer;
}

/**
 * Dreno do SIGTERM: para de reivindicar e resolve o lote em voo.
 *
 * Sem isto, todo deploy deixa linhas `processando` que só o reclaim de 2 min
 * resolve — e nesses 2 min a mensagem do cliente fica parada.
 *
 * O destino de cada linha é o mesmo do reclaim (`destinoLease`), não `pendente`
 * para tudo: o `server.js` já esperou 8 s pela `filaConversa` antes de chegar
 * aqui, então o que ainda está reivindicado é turno interrompido de verdade —
 * e turno de motor não se re-executa sozinho (§23).
 */
export async function pararWorker({ db = getDb(), limiteMs = 3000 } = {}) {
  parando = true;
  if (timer) { clearInterval(timer); timer = null; }

  const ate = Date.now() + limiteMs;
  while (rodando && Date.now() < ate) await new Promise(r => setTimeout(r, 50));

  let devolvidas = 0;
  for (const [tabela, ids] of Object.entries(emVoo)) {
    if (!ids.size) continue;
    devolvidas += await liberar(db, tabela, [...ids]).catch(() => 0);
    ids.clear();
  }
  if (devolvidas) console.log(`   ✓ ${devolvidas} linha(s) de fila resolvida(s) no dreno`);
  return devolvidas;
}
