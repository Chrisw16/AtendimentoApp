/**
 * disjuntor.js — circuit breaker (FASE 13).
 *
 * **Existe UM, e é o do SGP.** O critério não é "é externo", é *falha lenta +
 * chamador no caminho quente + degradação já prevista*:
 *
 *  - os timeouts do SGP são de 8–12 s e o motor os aguarda **dentro do turno do
 *    cliente**. Com o SGP fora, cada turno gasta 12 s antes de falhar, o lote
 *    paralelo do inbox enche e o cliente fica no silêncio;
 *  - o §133 já define o comportamento degradado, e a FASE 6 já trata `null` +
 *    aviso visível na tela. O disjuntor só torna a falha **rápida**.
 *
 * Onde NÃO vale, e por quê:
 *  - **Anthropic**: 429 pede backoff, não interrupção. Um disjuntor transforma
 *    um pico de rate limit em "a IA está desligada" por um minuto inteiro;
 *  - **Evolution/canais**: o `outbox` JÁ é o disjuntor — retry com backoff,
 *    `expira_em` por canal, DLQ e ordem por conversa. Um breaker por cima seria
 *    uma segunda política de reenvio para conciliar às 3 da manhã;
 *  - **Redis**: o `ioredis` reconecta sozinho e a degradação já é aceita;
 *  - **Postgres**: banco fora = sistema fora. Não há o que proteger.
 */

export const FECHADO = 'fechado';
export const ABERTO = 'aberto';
export const MEIO_ABERTO = 'meio_aberto';

/** Estado inicial. Puro: quem usa guarda o objeto e passa de volta. */
export function novo({ limite = 5, esperaMs = 45_000 } = {}) {
  return { estado: FECHADO, falhas: 0, abertoEm: null, limite, esperaMs, ultimoErro: null };
}

/**
 * Pode chamar agora?
 *
 * Aberto vira MEIO-ABERTO depois da espera: uma tentativa decide se volta. Sem
 * esse estado, ou o disjuntor nunca fecha sozinho, ou ele reabre a torneira
 * inteira em cima de um serviço que ainda está caindo.
 */
export function permite(d, agora = Date.now()) {
  if (!d || d.estado === FECHADO) return true;
  if (d.estado === MEIO_ABERTO) return true;
  return agora - (d.abertoEm || 0) >= d.esperaMs;
}

/** Transição ao permitir a passagem — expõe o MEIO_ABERTO. */
export function aoPassar(d, agora = Date.now()) {
  if (d.estado === ABERTO && agora - (d.abertoEm || 0) >= d.esperaMs) {
    return { ...d, estado: MEIO_ABERTO };
  }
  return d;
}

export function sucesso(d) {
  return { ...d, estado: FECHADO, falhas: 0, abertoEm: null, ultimoErro: null };
}

export function falha(d, erro = null, agora = Date.now()) {
  // Falha no meio-aberto reabre IMEDIATAMENTE: o serviço respondeu que ainda
  // não voltou, e insistir só devolve a lentidão ao cliente.
  if (d.estado === MEIO_ABERTO) {
    return { ...d, estado: ABERTO, falhas: d.limite, abertoEm: agora, ultimoErro: erro };
  }
  const falhas = d.falhas + 1;
  return falhas >= d.limite
    ? { ...d, estado: ABERTO, falhas, abertoEm: agora, ultimoErro: erro }
    : { ...d, falhas, ultimoErro: erro };
}

/** Só falha LENTA ou de indisponibilidade conta. */
export function contaComoFalha(err) {
  const status = err?.status || err?.response?.status;
  if (err?.name === 'TimeoutError' || /timeout|abort|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(String(err?.message || ''))) return true;
  if (status >= 500) return true;
  // 4xx é o SGP dizendo "esse contrato não existe" — o serviço está DE PÉ.
  // Abrir o disjuntor por isso tiraria do ar uma integração saudável.
  return false;
}
