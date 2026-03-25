/**
 * jwt.js — JWT simples sem deps externas (HS256 com crypto nativo)
 */
import { createHmac } from "crypto";

const SECRET = () => process.env.JWT_SECRET || process.env.ADMIN_PASSWORD || "citmax2026";
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
  const header  = { alg: "HS256", typ: "JWT" };
  const agora   = Math.floor(Date.now() / 1000);
  return sign(header, { ...payload, iat: agora, exp: agora + EXPIRY_H * 3600 });
}

export function verificarToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, sig] = parts;
    // recompute signature
    const expected = createHmac("sha256", SECRET()).update(`${h}.${p}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(p, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null; // expirado
    return payload;
  } catch { return null; }
}
