/**
 * routes/whatsappQR.js
 * Gerencia o canal WhatsApp QR Code embutido (Baileys).
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getStatus, conectar, desconectar, refreshQR } from '../services/whatsappQR.js';

export const whatsappQRRouter = Router();
whatsappQRRouter.use(authMiddleware);

// GET /api/whatsapp-qr/status
// Retorna status da conexão e QR code (se disponível)
whatsappQRRouter.get('/status', asyncHandler(async (_req, res) => {
  res.json(getStatus());
}));

// POST /api/whatsapp-qr/connect — admin only
// Inicia o socket Baileys e gera o QR
whatsappQRRouter.post('/connect', adminMiddleware, asyncHandler(async (_req, res) => {
  await conectar();
  res.json(getStatus());
}));

// POST /api/whatsapp-qr/refresh — admin only
// Solicita novo QR Code à Evolution (útil quando o anterior expirou)
whatsappQRRouter.post('/refresh', adminMiddleware, asyncHandler(async (_req, res) => {
  await refreshQR();
  res.json(getStatus());
}));

// DELETE /api/whatsapp-qr/disconnect — admin only
// Faz logout e remove a instância Evolution
whatsappQRRouter.delete('/disconnect', adminMiddleware, asyncHandler(async (_req, res) => {
  await desconectar();
  res.json({ status: 'disconnected' });
}));
