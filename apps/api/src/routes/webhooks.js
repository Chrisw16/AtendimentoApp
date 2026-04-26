import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const webhookRouter = Router();

// Webhook Meta (WhatsApp/Instagram)
webhookRouter.post('/meta', asyncHandler(async (req, res) => {
  const { handleMeta } = await import('../services/webhooks/meta.js');
  await handleMeta(req.body);
  res.json({ ok: true });
}));

webhookRouter.get('/meta', (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.status(403).send('Forbidden');
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
