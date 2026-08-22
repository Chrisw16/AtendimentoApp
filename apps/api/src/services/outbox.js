/**
 * outbox.js — write-ahead de envio (§126).
 *
 * O sintoma: o motor grava o estado num `finally` e SÓ ENTÃO envia. Morte entre
 * as duas coisas deixa o banco dizendo "aguardando resposta do menu" com o
 * cliente nunca tendo visto o menu — e, desde a FASE 1, isso sobrevive ao
 * restart. Um outbox que só grava QUANDO O ENVIO FALHA não conserta nada:
 * morte de processo não lança exceção.
 *
 * Por isso a ordem é:
 *
 *     persiste linha 'pendente'  →  envia INLINE (como hoje)  →  marca 'enviada'
 *
 * A latência é a de hoje; o outbox é um log de intenção. Morte no meio deixa
 * linha `pendente` que o worker recupera.
 *
 * ── Ordem por conversa ──
 * `enviarResposta` engole o erro e o laço do motor continua, então uma resposta
 * que falha seguida de outra que passa entregaria **o menu antes da saudação**.
 * Regra: só sai inline quem é a linha viva mais antiga da conversa. Havendo
 * anterior em `pendente`/`processando`, a seguinte espera a vez no worker.
 *
 * ── Descarte silencioso ──
 * O dispatcher devolve `{despachado, motivo}`. Tipo que o canal não implementa
 * (a Evolution não manda `localizacao`, de propósito) vira `nao_suportada` —
 * visível — em vez de "a tela diz enviada e o cliente nunca recebe".
 */
import { getDb }              from '../config/db.js';
import { enviarPorCanal }     from './canais/index.js';
import { reivindicar }        from './filaDb.js';
import { auditar }            from './auditoria.js';
import { expiraEm, decidirFalhaEnvio } from './politicaRetry.js';

/**
 * Grava a intenção de envio.
 *
 * @returns {{linha: object, esperar: boolean}} `esperar` = há saída anterior
 *          ainda não entregue nesta conversa; quem chama NÃO deve enviar inline.
 */
export async function registrar(conversa, resp, destino, { db = getDb(), mensagemId = null } = {}) {
  const [linha] = await db('outbox')
    .insert({
      conversa_id: conversa.id,
      canal:       conversa.canal || 'whatsapp',
      payload:     JSON.stringify({ resp, destino, mensagemId }),
      status:      'pendente',
      expira_em:   expiraEm(conversa.canal),
    })
    .returning('*');

  const anterior = await db('outbox')
    .where({ conversa_id: conversa.id })
    .whereIn('status', ['pendente', 'processando'])
    // Ordem total: `criado_em` empata quando dois inserts caem no mesmo `now()`.
    .whereRaw('(criado_em, id) < (?, ?)', [linha.criado_em, linha.id])
    .first();

  if (anterior) return { linha, esperar: true };

  // O envio inline PRECISA reivindicar, igual ao worker: a linha nasce
  // `pendente` e o tick de 5 s que caísse durante o POST ao provedor pegaria a
  // MESMA linha e entregaria a mensagem duas vezes — janela de 100–500 ms a
  // cada 5 s, invisível no banco (as duas entregas terminam em `enviada`).
  // Se o worker chegar primeiro, o update não casa e quem envia é ele.
  const [reivindicada] = await db('outbox')
    .where({ id: linha.id, status: 'pendente' })
    .update({ status: 'processando', reivindicado_em: db.fn.now(), tentativas: db.raw('tentativas + 1') })
    .returning('*');

  return { linha: reivindicada || linha, esperar: !reivindicada };
}

/** Entrega uma linha e a marca. Único lugar que fala com o dispatcher. */
export async function entregar(linha, { db = getDb(), enviar = enviarPorCanal } = {}) {
  const { resp, destino } = linha.payload || {};
  if (!resp || !destino) {
    await marcar(db, linha.id, { status: 'falha', ultimo_erro: 'payload incompleto' });
    return { status: 'falha' };
  }

  try {
    const r = await enviar(linha.canal, destino, resp);

    if (r && r.despachado === false) {
      console.warn(`[Outbox] ${linha.canal} não despachou ${resp.tipo}: ${r.motivo}`);
      await marcar(db, linha.id, { status: 'nao_suportada', ultimo_erro: r.motivo });
      await marcarMensagem(db, linha, 'nao_suportada', r.motivo);
      return { status: 'nao_suportada', motivo: r.motivo };
    }

    await marcar(db, linha.id, { status: 'enviada', external_id: externalId(r), ultimo_erro: null });
    return { status: 'enviada' };
  } catch (err) {
    // O worker já contou esta passada ao reivindicar; o caminho inline (que não
    // reivindica) é a tentativa nº 1. `max` evita contar duas vezes.
    const tentativas = Math.max(1, linha.tentativas || 0);
    const d = decidirFalhaEnvio({ tentativas, expiraEm: linha.expira_em });
    console.error(`[Outbox] envio ${linha.canal} falhou (${tentativas}): ${err.message} → ${d.status}`);

    await marcar(db, linha.id, {
      status: d.status,
      tentativas,
      ultimo_erro: String(err.message).slice(0, 500),
      ...(d.proximaTentativaEm ? { proxima_tentativa_em: d.proximaTentativaEm } : {}),
    });

    if (d.status !== 'pendente') {
      await marcarMensagem(db, linha, d.status, err.message);
      auditar({
        actorType: 'system', actorId: 'outbox', action: 'dlq_saida',
        resource: `outbox:${linha.id}`, conversaId: linha.conversa_id,
        after: { status: d.status, canal: linha.canal, tipo: resp.tipo, erro: String(err.message).slice(0, 200) },
      });
    }
    return { status: d.status };
  }
}

function marcar(db, id, campos) {
  return db('outbox').where({ id }).update({ reivindicado_em: null, ...campos });
}

/**
 * Conta à TELA que a mensagem não chegou.
 *
 * `enviarResposta` persiste a mensagem e faz `broadcast('mensagem')` ANTES do
 * despacho — o agente vê "enviada" mesmo quando a Evolution descartou o tipo.
 * Marcar só a coluna do outbox conserta o banco e deixa a tela mentindo.
 */
async function marcarMensagem(db, linha, entrega, motivo) {
  const id = linha.payload?.mensagemId;
  if (!id) return;
  const meta = { entrega, motivo: String(motivo || '').slice(0, 200) };
  const [msg] = await db('mensagens').where({ id })
    .update({ meta: JSON.stringify(meta) }).returning('*').catch(() => []);
  if (msg) {
    const { broadcast } = await import('./sseManager.js');
    broadcast('mensagem_atualizada', { ...msg, conversa_id: linha.conversa_id });
  }
}

/**
 * Id do provedor, quando ele devolve algum (§126). Cada canal responde numa
 * forma; o dispatcher embrulha em `{despachado, retorno}`.
 */
function externalId(resposta) {
  const r = resposta?.retorno ?? resposta;
  const id = r?.key?.id ?? r?.result?.message_id ?? r?.messages?.[0]?.id ?? r?.id;
  return id ? String(id).slice(0, 255) : null;
}

/**
 * Passada do worker: a linha viva mais antiga de CADA conversa, e só ela.
 *
 * `DISTINCT ON` sobre `pendente|processando` é o que preserva a ordem: se a
 * primeira ainda está em backoff (ou em voo em outro tick), a segunda não passa
 * na frente — simplesmente não é escolhida nesta rodada.
 */
export async function processarPendentes({ db = getDb(), limite = 20, aoReivindicar, enviar = enviarPorCanal } = {}) {
  // Sem LIMIT no SQL de propósito: `DISTINCT ON` obriga `ORDER BY conversa_id`,
  // então cortar aqui starvaria para sempre as conversas de uuid alto. O corte
  // é por IDADE, feito abaixo — a saída mais antiga é a mais urgente.
  const { rows } = await db.raw(
    `SELECT DISTINCT ON (conversa_id) id, status, criado_em, proxima_tentativa_em, expira_em
       FROM outbox
      WHERE status IN ('pendente', 'processando')
      ORDER BY conversa_id, criado_em, id`,
  );
  rows.sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));

  const agora = Date.now();
  const prontas = [], expiradas = [];
  for (const r of rows) {
    if (r.status !== 'pendente') continue;                              // em voo: a vez é dela
    if (new Date(r.expira_em).getTime() <= agora) { expiradas.push(r.id); continue; }
    if (prontas.length >= limite) continue;
    if (new Date(r.proxima_tentativa_em).getTime() <= agora) prontas.push(r.id);
  }

  if (expiradas.length) {
    await db('outbox').whereIn('id', expiradas)
      .update({ status: 'expirada', ultimo_erro: 'prazo de entrega vencido' });
    console.warn(`[Outbox] ${expiradas.length} saída(s) expirada(s) sem entrega`);
  }
  if (!prontas.length) return [];

  const linhas = await reivindicar(db, 'outbox', {
    onde: 'id = ANY(?)', binds: [prontas], ordem: 'criado_em', limite: prontas.length,
  });
  aoReivindicar?.(linhas.map(l => l.id));

  // Em paralelo: é UMA linha por conversa, então não há ordem a violar aqui —
  // e uma conversa lenta não pode segurar a saída de todas as outras.
  return Promise.all(linhas.map(linha => entregar(linha, { db, enviar })));
}
