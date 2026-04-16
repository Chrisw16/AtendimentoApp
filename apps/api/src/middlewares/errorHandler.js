/**
 * errorHandler.js — middleware global de erros
 * Captura todos os erros lançados nas rotas e retorna JSON padronizado
 */
export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Erro interno do servidor';

  if (status >= 500) {
    console.error(`❌ [${req.method}] ${req.path}`, err);
  }

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

// Wrapper para async route handlers — elimina try/catch repetitivo
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Erro HTTP tipado
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
