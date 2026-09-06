/**
 * anthropic.js — adapter da Anthropic. O formato interno É o dela, então este
 * adapter não traduz nada: só constrói o cliente e chama. A telemetria mora no
 * funil (`index.js:gerar`), não aqui — senão cada adapter teria a sua e o custo
 * seria contado de forma diferente por provedor.
 */
import { flagsDoModelo } from './llmHelpers.js';

export async function chamar({ apiKey, baseURL }, { system, messages, tools, modelo, temperatura, maxTokens }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const cliente = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  // A regra de temperatura é por FAMÍLIA (ver `flagsDoModelo`): modelos depois
  // do Opus 4.6 devolvem 400 para `temperature` ≠ 1.0 — inclusive um
  // `claude-opus-4-8` digitado à mão, fora do catálogo. Só Haiku 4.5, Sonnet
  // 4.6, Opus 4.6 e anteriores aceitam 0–1.
  const { semTemperatura, thinking } = flagsDoModelo('anthropic', modelo);
  return cliente.messages.create({
    model: modelo,
    // Modelo com thinking ligado gasta o orçamento raciocinando ANTES de
    // escrever: com 1024 ele estoura em `max_tokens` sem texto nenhum, e o
    // cliente fica sem resposta. 4x é folga para o raciocínio e o texto.
    max_tokens: thinking ? maxTokens * 4 : maxTokens,
    ...(Number.isFinite(temperatura) && !semTemperatura ? { temperature: temperatura } : {}),
    ...(system ? { system } : {}),
    ...(tools?.length ? { tools } : {}),
    messages,
  });
}
