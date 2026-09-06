/**
 * anthropic.js — adapter da Anthropic. O formato interno É o dela, então este
 * adapter não traduz nada: só constrói o cliente e chama. A telemetria mora no
 * funil (`index.js:gerar`), não aqui — senão cada adapter teria a sua e o custo
 * seria contado de forma diferente por provedor.
 */
import { flagsDoModelo } from './llmHelpers.js';

export async function chamar({ apiKey, baseURL }, { system, messages, tools, modelo, temperatura, maxTokens }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  // Sonnet 5, Opus 5 e Fable 5.1 devolvem 400 para `temperature` ≠ 1.0
  // ("Models released after Claude Opus 4.6 do not support setting
  // temperature"). Haiku 4.5 e Sonnet 4.6 ainda aceitam 0–1.
  const { semTemperatura } = flagsDoModelo('anthropic', modelo);
  const cliente = new Anthropic({ apiKey, ...(baseURL ? { baseURL } : {}) });
  return cliente.messages.create({
    model: modelo,
    max_tokens: maxTokens,
    // Só quando há valor: a Anthropic aceita 0–1 e recusa `null`.
    ...(Number.isFinite(temperatura) && !semTemperatura ? { temperature: temperatura } : {}),
    ...(system ? { system } : {}),
    ...(tools?.length ? { tools } : {}),
    messages,
  });
}
