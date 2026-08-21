import jwt from 'jsonwebtoken';
import { randomBytes } from 'node:crypto';

/**
 * Resolve o segredo de assinatura do JWT.
 *
 * Antes havia um fallback fixo ('maxxi-dev-secret-change-in-prod') versionado
 * no repositório: sem JWT_SECRET no ambiente, produção assinava com um segredo
 * público e qualquer um que lesse o código forjava um token de admin.
 *
 * Agora não existe segredo conhecido em lugar nenhum:
 *  - JWT_SECRET definida  → usa ela;
 *  - produção sem ela     → erro de configuração, falha alto;
 *  - resto               → aleatório por boot (sessões caem no restart, mas
 *                          nunca há um segredo adivinhável).
 */
export function resolverSegredo(env = process.env) {
  if (env.JWT_SECRET) return { segredo: env.JWT_SECRET, origem: 'env' };

  if (env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET é obrigatório em produção. Defina a variável de ambiente antes de subir.'
    );
  }

  return { segredo: randomBytes(32).toString('hex'), origem: 'aleatorio' };
}

const { segredo: SECRET, origem: ORIGEM_SEGREDO } = resolverSegredo();

if (ORIGEM_SEGREDO === 'aleatorio') {
  console.warn(
    '⚠️  JWT_SECRET não definida — usando segredo ALEATÓRIO gerado no boot.\n' +
    '    Todas as sessões caem a cada restart. Defina JWT_SECRET no ambiente.'
  );
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  const token  = header?.startsWith('Bearer ') ? header.slice(7) : null;

  // Suporte a SSE via query param
  const qToken = req.query.token;
  const t = token || qToken;

  if (!t) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const payload = jwt.verify(t, SECRET);
    req.agente = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

export function adminMiddleware(req, res, next) {
  if (req.agente?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores' });
  }
  next();
}

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}
