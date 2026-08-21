---
title: WhatsApp API Oficial — estado e pendências
type: task
created: 2026-08-21
last_updated: 2026-08-21
status: active
priority: p1
knowledge_refs: ["systems/maxxi/components/canais-e-webhooks", "systems/maxxi/components/auth-e-seguranca"]
related: ["[[Canais e Webhooks]]", "[[Auth e Segurança]]", "[[Motor de Fluxo]]", "[[Fechamento 2026-08-21 + pauta]]"]
aliases: ["WhatsApp API Oficial", "Meta Cloud API", "canal oficial", "registry de canais"]
tags: [work, task, whatsapp, meta, canais, seguranca]
---

# WhatsApp API Oficial — estado e pendências

Design completo em [`docs/superpowers/specs/2026-08-21-whatsapp-api-oficial-design.md`](../../../docs/superpowers/specs/2026-08-21-whatsapp-api-oficial-design.md).

**Decisões:** Evolution e Oficial **convivem** · todos os 8 tipos de mensagem, incluindo mídia · **templates** com envio **individual** (massa fora de escopo) · assinatura do webhook entra junto · abordagem **registry de adapters**.

## Fases

| Fase | O que é | Estado |
|---|---|---|
| 1 | Registry de canais (adapters + dispatcher) | ✅ feito, branch `feat/canais-registry`, **não mergeado** |
| 2 | Canal Meta (adapter, credenciais, card, assinatura, `/api/media`) | ⬜ |
| 3 | Janela de 24h | ⬜ |
| 4 | Templates (listagem + envio individual) | ⬜ |

A Fase 1 é **estritamente inobservável**: só o `switch` de despacho saiu do `motorFluxo.enviarResposta`. 30 testes de caracterização escritos antes da extração.

## Pendências a resolver antes da Fase 2

Levantadas por três revisões (arquitetura contra o código, segurança, e verificação da doc da Meta).

### Bloqueiam a implementação
1. **`Canais.jsx` não renderiza a partir do banco** — itera o catálogo hardcoded `CANAL_META` (`Canais.jsx:216`). Uma linha `canais.tipo='whatsapp_oficial'` no seed **não aparece na tela**. As Fases 2 e 4 exigem editar `CANAL_META`.
2. **Já existe UI de credencial Meta, inerte** — o card `whatsapp` tem `provider: ['meta','evolution']`, `phone_number_id` e `access_token` gravando em `canais.config`, e **nada lê**. Decidir: remover ou usar. Ainda: `routes/canais.js` PUT **não chama** `invalidateConfigCache()`.
3. **`chat.js` engole conversa de canal desconhecido** — `if whatsapp / else if telegram`, sem `else`. Uma conversa `whatsapp_oficial` persiste a mensagem, atualiza SLA, faz broadcast, devolve 201 — e **não envia nada, sem log**. Falha silenciosa com confirmação visual falsa.
4. **Vocabulário de tipos inconsistente** — entrada gera `'doc'`/`'video'`, saída usa `'arquivo'`; `ConversaView` só renderiza `imagem` e `audio`. Definir vocabulário canônico.

### Segurança (a spec já incorporou; validar na implementação)
5. **`/api/media/:id`** — `<img src>` não manda header, então `authMiddleware` puro quebraria toda mídia. Precisa de token curto assinado + ownership check + **allowlist de MIME** (um `document` com `text/html` vira XSS armazenado) + validação `^\d+$` do id (Express decodifica `%2F`, virando outro endpoint da Graph com o nosso token) + cap de tamanho.
6. **Baixar mídia no ingest, não proxy sob demanda** — a URL da Meta expira em ~5 min e o `media_id` de webhook em 7 dias; proxy sob demanda faz mídia antiga virar link morto de novo.
7. **Parser de corpo cru escopado**, não `verify` global no `express.json` (que copiaria o Buffer de toda requisição da API).
8. **Segredos no `sysconfig`** — introduzir `CHAVES_SECRETAS` com semântica *write-only* (GET devolve `{configurado, preview}`), estendido aos segredos que já estão lá.
9. **Envio de template precisa de autorização** — hoje só o `PUT` do `canaisRouter` tem `adminMiddleware`; sem isso qualquer agente dispararia template para qualquer número. Exigir destino de conversa existente, rate limit por agente e auditoria.

### Comportamento
10. **Truncar rótulo de botão quebra o menu** — título na Meta é 20 chars e **precisa ser único**; o motor casa a resposta comparando o texto de volta com o `label` (`motorFluxo.js:175`). Truncar faz o match falhar e cair na porta `saida` em silêncio. Decidir: rejeitar na validação de fluxo ou casar por `id`.
11. **Conversas Meta antigas** — as criadas antes da mudança ficam rotuladas `'whatsapp'` e passariam a responder pela Evolution para sempre. Verificar o banco e, se houver, fazer backfill.
12. **Sandbox** — o canal `sandbox` só é seguro hoje porque `opts.enviar` intercepta antes do dispatcher. A nota de sistema da Fase 3 não pode gravar em conversa fabricada (id `sandbox:*`, sem FK).
13. **Webhook responde depois de processar** — `await handleMeta(req.body)` antes do 200; a Meta penaliza webhook lento. Padrão é responder 200 e processar depois.

## Fatos da Meta verificados na doc oficial

- Botões: **máx. 3**, título **20 chars** e **único** entre eles.
- Lista: até 10 seções, mas **10 linhas somadas**; título de linha 24, descrição 72.
- Janela de 24h: **chamada do cliente também abre/reseta**, não só mensagem.
- Mídia: URL expira em **5 min**; `media_id` de webhook vale **7 dias**.
- **`interactive/cta_url` EXISTE** como service message (1 botão) — a spec original errava ao dizer que `cta` precisaria degradar.
- Meta **recomenda enviar mídia por `id`, não por `link`**. Limites: imagem 5 MB, áudio/vídeo 16 MB, documento 100 MB.
- **A partir de 1º/10/2026 mensagens de sessão passam a ser cobradas.** Hoje são gratuitas dentro da janela. Incide direto no `max_turnos: 25` do nó comercial — até 25 idas e voltas por cadastro. Confirmar com a Meta por envolver preço.
- Fixar a **versão da Graph API na URL**: quando expira, a Meta redireciona em silêncio para uma versão mais antiga.

## See Also

- [[Canais e Webhooks]] · [[Auth e Segurança]] · [[Motor de Fluxo]] · [[Fechamento 2026-08-21 + pauta]]
