import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'maxxi-dev-secret-change-in-prod';

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
