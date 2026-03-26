/**
 * jwt.js — JWT simples sem deps externas (HS256 com crypto nativo)
 *
 * Payload esperado (SaaS):
 *   { id, login, nome, role, tenantId, iat, exp }
 *
 * tenantId é obrigatório em todos os tokens novos.
 * Tokens antigos sem tenantId assumem CITMAX_TENANT_ID no middleware.
 */
import { createHmac } from "crypto";
import { CITMAX_TENANT_ID } from "./db.js";

const SECRET = () => {
  const s = process.env.JWT_SECRET || process.env.ADMIN_PASSWORD;
  if (!s) console.warn("⚠️  JWT_SECRET não definido — usando fallback inseguro. Defina JWT_SECRET em produção!");
  return s || "maxxi-saas-insecure-fallback-change-me";
};
const EXPIRY_H = 8; // horas

function b64url(str) {
  return Buffer.from(str).toString("base64url");
}
function sign(header, payload) {
  const data = b64url(JSON.stringify(header)) + "." + b64url(JSON.stringify(payload));
  const sig  = createHmac("sha256", SECRET()).update(data).digest("base64url");
  return data + "." + sig;
}

export function gerarToken(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const agora  = Math.floor(Date.now() / 1000);
  // Garante que tenantId sempre está no token
  const tenantId = payload.tenantId || CITMAX_TENANT_ID;
  return sign(header, { ...payload, tenantId, iat: agora, exp: agora + EXPIRY_H * 3600 });
}

export function verificarToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    const expected = createHmac("sha256", SECRET()).update(`${h}.${p}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expirado
    // Compatibilidade: tokens antigos sem tenantId → CITmax
    if (!payload.tenantId) payload.tenantId = CITMAX_TENANT_ID;
    return payload;
  } catch { return null; }
}
