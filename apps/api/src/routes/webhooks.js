import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const webhookRouter = Router();

// Webhook Meta (WhatsApp/Instagram)
webhookRouter.post('/meta', asyncHandler(async (req, res) => {
  const { handleMeta } = await import('../services/webhooks/meta.js');
  await handleMeta(req.body);
  res.json({ ok: true });
}));

webhookRouter.get('/meta', async (req, res) => {
  const { verificarHandshake } = await import('../services/webhooks/metaSeguranca.js');
  const r = verificarHandshake({
    mode:      req.query['hub.mode'],
    token:     req.query['hub.verify_token'],
    challenge: req.query['hub.challenge'],
  }, process.env.META_VERIFY_TOKEN);

  if (!r.ok) {
    if (r.motivo === 'nao_configurado') {
      console.warn('[Webhook Meta] handshake recusado: META_VERIFY_TOKEN não configurada');
    }
    return res.status(403).type('text/plain').send('Forbidden');
  }
  // type('text/plain'): `res.send(string)` responde text/html e transformava
  // esta rota pública num refletor de HTML na origem do painel.
  res.type('text/plain').send(r.challenge);
});

// Webhook Evolution API
webhookRouter.post('/evolution', asyncHandler(async (req, res) => {
  const { handleEvolution } = await import('../services/webhooks/evolution.js');
  await handleEvolution(req.body);
  res.json({ ok: true });
}));

// Webhook Telegram
webhookRouter.post('/telegram', asyncHandler(async (req, res) => {
  const { handleTelegram } = await import('../services/webhooks/telegram.js');
  await handleTelegram(req.body);
  res.json({ ok: true });
}));

// POST /api/webhooks/telegram/setup — configura o webhook do bot no Telegram
import { Router as _R } from 'express';
webhookRouter.post('/telegram/setup', asyncHandler(async (req, res) => {
  const { tgSetWebhook, tgGetMe } = await import('../services/telegram.js');
  const url = `${req.protocol}://${req.get('host')}/api/webhooks/telegram`;
  await tgSetWebhook(url);
  const me = await tgGetMe();
  res.json({ ok: true, bot: me.result || me, webhook_url: url });
}));
