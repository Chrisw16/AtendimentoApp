/**
 * routes/whatsappQR.js
 * Gerencia o canal WhatsApp QR Code via Evolution API.
 */
import { Router } from 'express';
import { authMiddleware, adminMiddleware } from '../middlewares/auth.js';
import { asyncHandler } from '../middlewares/errorHandler.js';
import { getStatus, conectar, desconectar, refreshQR, sincronizarStatus } from '../services/whatsappQR.js';

export const whatsappQRRouter = Router();
whatsappQRRouter.use(authMiddleware);

// GET /api/whatsapp-qr/status
// Sincroniza com a Evolution API e retorna o estado atual
whatsappQRRouter.get('/status', asyncHandler(async (_req, res) => {
  await sincronizarStatus();
  res.json(getStatus());
}));

// POST /api/whatsapp-qr/connect — admin only
whatsappQRRouter.post('/connect', adminMiddleware, asyncHandler(async (_req, res) => {
  await conectar();
  res.json(getStatus());
}));

// POST /api/whatsapp-qr/refresh — admin only
whatsappQRRouter.post('/refresh', adminMiddleware, asyncHandler(async (_req, res) => {
  await refreshQR();
  res.json(getStatus());
}));

// DELETE /api/whatsapp-qr/disconnect — admin only
whatsappQRRouter.delete('/disconnect', adminMiddleware, asyncHandler(async (_req, res) => {
  await desconectar();
  res.json(getStatus());
}));
