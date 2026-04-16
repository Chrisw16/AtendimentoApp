import { Router } from 'express';
import { metaWebhook } from '../services/webhooks/meta.js';
import { evolutionWebhook } from '../services/webhooks/evolution.js';
import { telegramWebhook } from '../services/webhooks/telegram.js';

export const webhookRouter = Router();

webhookRouter.get('/meta',      metaWebhook.verify);
webhookRouter.post('/meta',     metaWebhook.receive);
webhookRouter.post('/evolution',evolutionWebhook.receive);
webhookRouter.post('/telegram', telegramWebhook.receive);