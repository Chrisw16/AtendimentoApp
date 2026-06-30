---
title: Design System Maxxi
type: component
created: 2026-06-30
last_updated: 2026-06-30
status: active
related: ["[[Maxxi v2 / GoCHAT — Visão geral]]", "[[Frontend Maxxi]]"]
sources: ["2026-06-30_estudo-codigo-maxxi"]
aliases: ["Design System Maxxi", "design system", "tokens", "tema", "cores", "paleta", "fontes"]
tags: [frontend, design, css, tokens]
---

# Design System Maxxi

Tokens em `apps/web/src/styles/tokens.css` + reset/base em `global.css`. **O tema atual é LIGHT** (branco predominante), apesar de o README descrever um tema escuro antigo — o README está desatualizado nesse ponto.

## Paleta (tema light atual)

- Acentos: **navy `#2050B8`** (`--brand-blue`, = `--accent`) e **laranja `#E8572A`** (`--brand-orange`). Também navy escuro `#1B3A8C`, verde `#3DB845`.
- Fundos: base `#F4F6FA`, superfície `#FFFFFF`, overlay/subtle em tons de cinza-azulado.
- **Sidebar é escura** (`#0F1828`) — contraste proposital contra o corpo light. O editor de fluxo (`FlowNode`/`PropsPanel`) e a Supervisora IA também usam superfícies escuras → **tema misto**.
- Status de conversa: ia `#7C3AED` (roxo), aguardando `#D97706`, ativa `#2050B8`, encerrada `#9CA3AF`.
- Semânticos: success `#16A34A`, warning `#D97706`, danger `#DC2626`, info `#2050B8`.

## Tipografia e escala

- Fontes: **Plus Jakarta Sans** (corpo), **JetBrains Mono** (código), **Syne** (display). Importadas via Google Fonts.
- Escala de texto 11→28px; espaçamento base 4px; radius 4→16px; sombras sutis (a `--shadow-brand` é azul).

## Notas

- O acento `#00E5A0` (verde) que o README/handoff citam é **legado**; hoje só aparece nas cores de grupo de nó do editor de fluxo (`gatilho`).
- `FlowNode`/`PropsPanel` usam `DM Sans` inline, fonte **não importada** em `tokens.css` → cai para sans-serif. Ver [[Achados de código (2026-06-30)]].

## See Also

- [[Frontend Maxxi]] · [[Maxxi v2 / GoCHAT — Visão geral]]
