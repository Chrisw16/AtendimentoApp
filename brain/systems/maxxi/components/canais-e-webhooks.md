---
title: Canais e Webhooks
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Motor de Fluxo]]", "[[Realtime SSE]]", "[[Integração SGP]]", "[[Supervisora IA]]", "[[Modelo de Dados]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Canais e Webhooks", "webhooks", "canais", "Evolution webhook", "Meta webhook", "Telegram webhook", "ingestão"]
tags: [backend, canais, webhooks, whatsapp, telegram]
---

# Canais e Webhooks

A ingestão de mensagens entra por `POST /api/webhooks/{evolution|meta|telegram}` (rotas **públicas**, sem auth). Cada handler em `apps/api/src/services/webhooks/` converte o payload do canal em `conversa`/`mensagem` internas e dispara o atendimento. Três canais reais hoje: **Evolution** (WhatsApp não-oficial, melhor cobertura), **Meta** (WhatsApp oficial), **Telegram**.

## Fluxo comum dos handlers

1. Extrai `telefone`/`chatId`, `nome`, conteúdo (`texto`/`tipo`/`url`/`mime`) e `external_id`.
2. **Dedup** por `external_id` (`mensagemRepo.porExternalId`) — ignora reprocessos.
3. Acha ou cria a conversa (`conversaRepo.porTelefoneCanal`, que ignora encerradas → nova mensagem após encerrar abre nova conversa). Broadcast `nova_conversa`.
4. Cria a `mensagem` (origem `cliente`), `incrementarNaoLidas`, broadcast `mensagem` + `conversa_atualizada` ([[Realtime SSE]]).
5. Se `status === 'ia'` → `import('motorFluxo.js').processarConversa` ([[Motor de Fluxo]]).
6. Se `status === 'ativa'` e tem `agente_id` → `supervisoraIA.processarMensagemCliente` ([[Supervisora IA]]).

## Diferenças por canal

- **Evolution** (`evolution.js`): eventos `messages.upsert` / `messages.update` (READ) / `connection.update`. Ignora `fromMe`. **Salva `canal_instancia`** do body — essencial para responder pela instância certa. Extração rica: conversation, extendedText, image, audio/ptt, video, document, location, respostas de botão/lista.
- **Meta** (`meta.js`): `entry.changes[].messages` + `statuses`. Verificação do webhook em `GET /api/webhooks/meta` com `META_VERIFY_TOKEN`. Mídia referenciada como `/api/media/:id` — **mas não há rota `/api/media` montada** no server, então mídia oficial não carrega (gap, ver [[Achados de código (2026-06-30)]]).
- **Telegram** (`telegram.js`): `message`/`edited_message` + `callback_query` (botão inline vira texto, com `answerCallbackQuery`). Envio via `services/telegram.js` (Bot API, `parse_mode: Markdown`; sem lista nativa → botões/numerado). `POST /api/webhooks/telegram/setup` registra o webhook do bot.

## Configuração de canal

Tela **Canais** (admin) define 6 canais (`whatsapp`, `telegram`, `widget`, `email`, `voip`, `sms`) com `ativo` + `config` jsonb por `tipo`. O token do Telegram pode vir de `canais.config.bot_token` ou de `sistema_kv.telegram_bot_token`. `widget` vem ativo no seed; `email`/`voip`/`sms` são placeholders. As credenciais de cada canal ficam no banco — ver [[Maxxi v2 / GoCHAT — Visão geral]].

## See Also

- [[Motor de Fluxo]] · [[Realtime SSE]] · [[Supervisora IA]]
