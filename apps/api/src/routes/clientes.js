import { Router } from 'express';
import { authMiddleware }          from '../middlewares/auth.js';
import { asyncHandler, HttpError } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';
import { consultarClientes } from '../services/integrations.js';

export const clientesRouter = Router();
clientesRouter.use(authMiddleware);

// GET /api/clientes
clientesRouter.get('/', asyncHandler(async (req, res) => {
  const { q, limit = 30, offset = 0 } = req.query;

  // Tenta SGP primeiro
  if (q) {
    try {
      const data = await consultarClientes(q);
      if (!data.erro && data.contratos?.length) {
        return res.json([{
          id:         data.cpfcnpj,
          nome:       data.nome,
          telefone:   data.fone,
          email:      data.email,
          contrato_id: data.contratos[0]?.id,
          status:     data.contratos[0]?.status,
        }]);
      }
    } catch { /* fallback local */ }
  }

  // Fallback: conversas no banco local
  const db = getDb();
  let query = db('conversas')
    .whereNotNull('nome')
    .select(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .groupBy(['id','nome','telefone','email','cidade','canal','contrato_id'])
    .orderBy('nome')
    .limit(Number(limit))
    .offset(Number(offset));

  if (q) {
    query = query.where(b =>
      b.whereLike('nome', `%${q}%`)
       .orWhereLike('telefone', `%${q}%`)
       .orWhereLike('email', `%${q}%`)
    );
  }

  res.json(await query);
}));

// GET /api/clientes/buscar?q=
clientesRouter.get('/buscar', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  try {
    const data = await consultarClientes(q);
    if (!data.erro && data.contratos?.length) {
      return res.json([{
        id:          data.cpfcnpj,
        nome:        data.nome,
        telefone:    data.fone,
        email:       data.email,
        contrato_id: data.contratos[0]?.id,
      }]);
    }
  } catch { /* fallback */ }

  const db = getDb();
  const r = await db('conversas').whereNotNull('nome')
    .where(b => b.whereLike('nome', `%${q}%`).orWhereLike('telefone', `%${q}%`))
    .select(['id','nome','telefone','email','contrato_id']).limit(10);
  res.json(r);
}));

// GET /api/clientes/:id — busca por CPF/CNPJ no SGP
clientesRouter.get('/:id', asyncHandler(async (req, res) => {
  try {
    const data = await consultarClientes(req.params.id);
    if (!data.erro) return res.json(data);
    throw new HttpError(404, data.mensagem || 'Cliente não encontrado');
  } catch (err) {
    if (err.status) throw err;
    throw new HttpError(503, `SGP indisponível: ${err.message}`);
  }
}));
