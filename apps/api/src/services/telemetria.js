/**
 * telemetria.js — o que custou e o que demorou (FASE 12).
 *
 * Dois pontos de instrumentação no sistema inteiro, e só dois: `executarTool` e
 * a chamada ao modelo. É o que basta porque os dois já são funil — motor,
 * Cliente 360, Copiloto e Quality passam por eles.
 *
 * Regra inegociável: **telemetria nunca derruba atendimento**. Todo insert é
 * fire-and-forget com catch, e o sandbox não grava nada — "Testar fluxo"
 * poluiria custo e taxa de erro com conversas que nunca existiram.
 */
import { getDb } from '../config/db.js';
import { ehUuid } from './estadoStore.js';

/**
 * Normaliza o erro para poder AGRUPAR. Mensagem crua vira mil variações do
 * mesmo problema e a métrica de erro deixa de somar — e ainda carrega ficha do
 * assinante (o corpo de erro do SGP traz dado do cliente).
 */
export function classificarErro(err) {
  if (!err) return null;
  const nome = err.name || '';
  const msg  = String(err.message || err);
  if (nome === 'TimeoutError' || /timeout|abort/i.test(msg)) return 'timeout';
  const status = err.status || err.response?.status;
  if (status >= 500) return 'http_5xx';
  if (status === 429) return 'rate_limit';
  if (status >= 400)  return 'http_4xx';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(msg)) return 'rede';
  return 'erro';
}

export function registrar({
  tipo, nome, origem = null, conversaId = null, agenteId = null,
  ok = true, erro = null, ms = null, tokensIn = null, tokensOut = null,
} = {}) {
  // O sandbox usa ids `sandbox:<uuid>`/`share:<uuid>`, que não são uuid — o
  // insert estouraria por tipo, além de sujar o dado.
  const conversa = conversaId && ehUuid(conversaId) ? conversaId : null;
  if (conversaId && !conversa) return;

  getDb()('telemetria').insert({
    tipo, nome: String(nome || '?').slice(0, 120), origem,
    conversa_id: conversa, agente_id: agenteId && ehUuid(agenteId) ? agenteId : null,
    ok, erro: erro ? String(erro).slice(0, 60) : null,
    ms: Number.isFinite(ms) ? Math.round(ms) : null,
    tokens_in: tokensIn ?? null, tokens_out: tokensOut ?? null,
  }).catch(err => console.error('[Telemetria]', err.message));
}

/** Envelopa uma chamada medindo tempo e desfecho. Repassa erro e resultado. */
export async function medir({ tipo, nome, origem, conversaId, agenteId }, fn) {
  const inicio = Date.now();
  try {
    const r = await fn();
    registrar({ tipo, nome, origem, conversaId, agenteId, ok: true, ms: Date.now() - inicio });
    return r;
  } catch (err) {
    registrar({ tipo, nome, origem, conversaId, agenteId, ok: false, erro: classificarErro(err), ms: Date.now() - inicio });
    throw err;
  }
}
