import { Router } from 'express';
import { asyncHandler } from '../middlewares/errorHandler.js';

export const webhookRouter = Router();

/**
 * FASE 4 (§125): a rota PERSISTE o payload e responde. O `handle*` roda no
 * worker de inbox, com `await` de verdade no turno do motor.
 *
 * Ganho: durabilidade. O 200 nunca esperou a IA (os handlers já eram
 * fire-and-forget), mas até aqui, morte de processo no meio do turno = mensagem
 * gravada, reentrega do provedor deduplicada e motor que nunca rodou.
 *
 * O corpo CRU é a chave de dedup (`sha256(canal:corpo)`) — `req.rawBody` vem do
 * `verify` do `express.json` (server.js). O fallback re-serializado gera hash
 * diferente do cru; só existe para não perder a mensagem se o buffer faltar.
 * A verificação de assinatura continua ANTES do insert, em toda rota.
 */
async function enfileirar(canal, req) {
  const { receber } = await import('../services/inbox.js');
  const cru = req.rawBody?.toString('utf8') ?? JSON.stringify(req.body ?? null);
  const r = await receber(canal, cru, req.body);
  // Só o que o provedor precisa saber. O id da linha é interno.
  return { duplicada: r.duplicada };
}

// Webhook Meta (WhatsApp/Instagram)
webhookRouter.post('/meta', asyncHandler(async (req, res) => {
  const { verificarAssinaturaMeta } = await import('../services/webhooks/metaSeguranca.js');
  const r = verificarAssinaturaMeta(req.rawBody, req.headers['x-hub-signature-256'], process.env.META_APP_SECRET);
  if (!r.ok) return res.status(403).json({ error: 'Assinatura inválida' });
  if (r.motivo === 'nao_configurado') console.warn('[Webhook Meta] META_APP_SECRET ausente — POST aceito SEM validar assinatura');
  res.json({ ok: true, ...(await enfileirar('meta', req)) });
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
  res.json({ ok: true, ...(await enfileirar('evolution', req)) });
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
  res.json({ ok: true, ...(await enfileirar('telegram', req)) });
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
