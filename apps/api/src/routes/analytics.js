/**
 * analytics.js — indicadores (FASE 12).
 *
 * GET /api/analytics/executivo    — §101 §102 §103 §108
 * GET /api/analytics/ia           — §104 §105 (IA, tools, tokens, custo)
 * GET /api/analytics/filas        — §111
 * GET /api/analytics/conhecimento — §110
 * GET /api/analytics/nps          — §112 (?corte=resolucao|fila|topico|origem)
 *
 * Tudo admin, como o dashboard. Nenhuma rota devolve número sem contexto: taxa
 * vem com a base, nota de qualidade vem com a cobertura e custo vem com
 * `precos_configurados` — indicador sem denominador é a forma mais fácil de
 * mentir com dado verdadeiro.
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { executivo, iaETools, filas, conhecimento, nps } from '../services/analytics.js';

export const analyticsRouter = Router();
analyticsRouter.use(authMiddleware, adminMiddleware);

const dias = (req) => Number(req.query.dias) || 30;

analyticsRouter.get('/executivo',    asyncHandler(async (req, res) => res.json(await executivo({ dias: dias(req) }))));
analyticsRouter.get('/ia',           asyncHandler(async (req, res) => res.json(await iaETools({ dias: dias(req) }))));
analyticsRouter.get('/filas',        asyncHandler(async (req, res) => res.json(await filas({ dias: dias(req) }))));
analyticsRouter.get('/conhecimento', asyncHandler(async (req, res) => res.json(await conhecimento({ dias: dias(req) }))));
analyticsRouter.get('/nps',          asyncHandler(async (req, res) => res.json(await nps({ dias: dias(req), corte: req.query.corte || null }))));
