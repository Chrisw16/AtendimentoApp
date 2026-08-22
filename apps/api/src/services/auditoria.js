/**
 * auditoria.js — grava no audit_log (§119) sem NUNCA derrubar a operação.
 *
 * Fire-and-forget de propósito: auditoria que falha vira log de erro, não 500
 * na cara do agente. Quem chama não dá await — e não deve dar.
 *
 * Regra de ouro: `before`/`after` carregam o diff RELEVANTE, nunca segredo nem
 * PII desnecessária (§124). Auditoria de sysconfig grava nomes de chave, não
 * valores; auditoria de tool grava a tool e o contrato, não a ficha.
 */
import { getDb } from '../config/db.js';

export function auditar({ actorType, actorId = null, action, resource = null, before = null, after = null, conversaId = null, ip = null }) {
  return getDb()('audit_log')
    .insert({
      actor_type: actorType,
      actor_id:   actorId,
      action,
      resource,
      before:     before ? JSON.stringify(before) : null,
      after:      after ? JSON.stringify(after) : null,
      conversa_id: conversaId,
      ip,
    })
    .then(() => {})
    .catch(err => console.error('[Auditoria] falhou (operação seguiu normal):', err.message));
}

/** IP real atrás do Traefik — server.js já configura trust proxy 1. */
export function ipDe(req) {
  return req.ip || null;
}
