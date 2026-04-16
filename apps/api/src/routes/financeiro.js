import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getDb } from '../config/db.js';

export const financeiroRouter = Router();
financeiroRouter.use(authMiddleware, adminMiddleware);

// GET /api/financeiro/resumo
financeiroRouter.get('/resumo', asyncHandler(async (req, res) => {
  const { periodo = 'mes' } = req.query;
  const dias = { semana: 7, mes: 30, trimestre: 90 }[periodo] || 30;

  // Busca dados do ERP se disponível
  const erpUrl = process.env.ERP_URL;
  if (erpUrl) {
    try {
      const r = await fetch(`${erpUrl}/financeiro/resumo?dias=${dias}`, {
        headers: { Authorization: `Bearer ${process.env.ERP_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) return res.json(await r.json());
    } catch { /* fallback */ }
  }

  // Fallback: dados sintéticos / zeros
  res.json({
    resumo: {
      receita_recebida: 0,
      a_receber:        0,
      vencido:          0,
      qtd_vencidos:     0,
      inadimplencia:    0,
    },
    periodo,
  });
}));

// GET /api/financeiro/cobrancas
financeiroRouter.get('/cobrancas', asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  const erpUrl = process.env.ERP_URL;
  if (erpUrl) {
    try {
      const params = new URLSearchParams({ status: status || '', page, limit });
      const r = await fetch(`${erpUrl}/financeiro/cobrancas?${params}`, {
        headers: { Authorization: `Bearer ${process.env.ERP_API_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) return res.json(await r.json());
    } catch { /* fallback */ }
  }

  res.json({ cobrancas: [], total: 0 });
}));

// GET /api/financeiro/regua
financeiroRouter.get('/regua', asyncHandler(async (req, res) => {
  const db   = getDb();
  const kv   = await db('sistema_kv').where({ chave: 'regua_cobranca' }).first();
  const etapas = kv?.valor
    ? (typeof kv.valor === 'string' ? JSON.parse(kv.valor) : kv.valor)
    : _reguaPadrao();

  res.json({ etapas });
}));

// PUT /api/financeiro/regua
financeiroRouter.put('/regua', asyncHandler(async (req, res) => {
  const { etapas } = req.body;
  const db = getDb();
  await db('sistema_kv')
    .insert({ chave: 'regua_cobranca', valor: JSON.stringify(etapas) })
    .onConflict('chave').merge();
  res.json({ etapas });
}));

function _reguaPadrao() {
  return [
    { dias: -5,  nome: 'Pré-vencimento',  acao: 'WhatsApp lembrete', canal: 'whatsapp', ativo: true },
    { dias: 0,   nome: 'Vencimento',      acao: 'WhatsApp boleto',   canal: 'whatsapp', ativo: true },
    { dias: 3,   nome: '3 dias vencido',  acao: 'SMS cobrança',      canal: 'sms',      ativo: true },
    { dias: 7,   nome: '7 dias vencido',  acao: 'Suspensão',         canal: 'sistema',  ativo: false },
    { dias: 15,  nome: '15 dias vencido', acao: 'Bloqueio',          canal: 'sistema',  ativo: false },
  ];
}
