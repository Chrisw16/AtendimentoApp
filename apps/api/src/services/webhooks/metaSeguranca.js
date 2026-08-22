/**
 * metaSeguranca.js — verificações do webhook da Meta (funções puras, testáveis).
 *
 * A rota GET /api/webhooks/meta é PÚBLICA e existe só para o handshake de
 * verificação. A versão original devolvia `hub.challenge` cru com
 * `res.send(...)`, o que faz o Express responder `text/html` — e comparava o
 * token com `token === process.env.META_VERIFY_TOKEN`. Com a env AUSENTE, os
 * dois lados viravam `undefined` e a comparação passava: qualquer pessoa
 * refletia HTML arbitrário na mesma origem do painel (XSS não autenticado).
 * Como o painel guarda o JWT em localStorage e a CSP está desligada, isso dava
 * caminho para roubo de sessão de admin.
 */
import { timingSafeEqual, createHmac } from 'node:crypto';

/** Comparação de tamanho-constante. Tolera tamanhos diferentes sem lançar. */
export function comparaSegura(a, b) {
  const bufA = Buffer.from(String(a ?? ''), 'utf8');
  const bufB = Buffer.from(String(b ?? ''), 'utf8');
  // timingSafeEqual LANÇA se os buffers têm tamanhos diferentes.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Valida o handshake de verificação da Meta.
 * Fail-closed: sem segredo configurado, RECUSA — nunca vira bypass.
 */
export function verificarHandshake({ mode, token, challenge } = {}, segredo) {
  if (!segredo)                        return { ok: false, motivo: 'nao_configurado' };
  if (mode !== 'subscribe')            return { ok: false, motivo: 'mode_invalido' };
  if (!comparaSegura(token, segredo))  return { ok: false, motivo: 'token_invalido' };
  // String(): o challenge vem do query string e pode chegar como array.
  return { ok: true, challenge: String(challenge ?? '') };
}

/**
 * Valida a assinatura do POST da Meta (§122): `X-Hub-Signature-256` é o HMAC
 * SHA-256 do CORPO CRU com o App Secret. Recalcular sobre o JSON re-serializado
 * falha (ordem de chave/unicode) — por isso a rota passa `req.rawBody`.
 *
 * Compat consciente: sem `META_APP_SECRET` no ambiente, aceita e a rota avisa
 * no log — endurecer sem a env viraria outage do canal no deploy. Com a env,
 * fail-closed.
 */
export function verificarAssinaturaMeta(corpoCru, assinaturaHeader, appSecret) {
  if (!appSecret) return { ok: true, motivo: 'nao_configurado' };
  if (!corpoCru || !assinaturaHeader) return { ok: false, motivo: 'sem_assinatura' };
  const esperada = 'sha256=' + createHmac('sha256', appSecret).update(corpoCru).digest('hex');
  return comparaSegura(assinaturaHeader, esperada)
    ? { ok: true }
    : { ok: false, motivo: 'assinatura_invalida' };
}
