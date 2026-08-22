import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const webhookRouter = Router();

// Webhook Meta (WhatsApp/Instagram)
webhookRouter.post('/meta', asyncHandler(async (req, res) => {
  const { verificarAssinaturaMeta } = await import('../services/webhooks/metaSeguranca.js');
  const r = verificarAssinaturaMeta(req.rawBody, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET);
  if (!r.ok) return res.status(403).json({ error: 'Assinatura inválida' });
  if (r.motivo === 'nao_configurado') console.warn('[Webhook Meta] META_APP_SECRET ausente — POST aceito SEM validar assinatura');
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

// Webhook Evolution API — a Evolution não assina; o segredo vai na URL
// (`.../evolution?token=X`, configurável no painel dela). Sem a env, aceita
// como sempre aceitou.
webhookRouter.post('/evolution', asyncHandler(async (req, res) => {
  if (process.env.EVOLUTION_WEBHOOK_TOKEN) {
    const { comparaSegura } = await import('../services/webhooks/metaSeguranca.js');
    if (!comparaSegura(req.query.token, process.env.EVOLUTION_WEBHOOK_TOKEN)) {
      return res.status(403).json({ error: 'Token inválido' });
    }
  }
  const { handleEvolution } = await import('../services/webhooks/evolution.js');
  await handleEvolution(req.body);
  res.json({ ok: true });
}));

// Webhook Telegram — o `setWebhook` do Telegram manda o secret no header
// `X-Telegram-Bot-Api-Secret-Token` quando configurado com `secret_token`.
webhookRouter.post('/telegram', asyncHandler(async (req, res) => {
  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    const { comparaSegura } = await import('../services/webhooks/metaSeguranca.js');
    if (!comparaSegura(req.headers['x-telegram-bot-api-secret-token'], process.env.TELEGRAM_WEBHOOK_SECRET)) {
      return res.status(403).json({ error: 'Secret inválido' });
    }
  }
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
