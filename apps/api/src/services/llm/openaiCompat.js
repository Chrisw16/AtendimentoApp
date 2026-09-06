/**
 * openaiCompat.js — UM adapter para OpenAI, DeepSeek, Gemini, Groq e OpenRouter.
 *
 * O que muda entre eles é `baseURL` e a chave; o contrato `chat.completions` é
 * o mesmo. A tradução (formato Anthropic ↔ OpenAI) é pura e testada em
 * `llmHelpers.js` — este arquivo só liga o SDK a ela.
 *
 * O pacote `openai` está instalado desde o início do projeto e nunca tinha sido
 * importado — como a `openai_api_key` da tela, que nenhuma linha lia.
 */
import { paraOpenAI, deOpenAI } from './llmHelpers.js';

export async function chamar({ apiKey, baseURL, provedor }, params) {
  const { default: OpenAI } = await import('openai');
  const cliente = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const res = await cliente.chat.completions.create(paraOpenAI({ ...params, provedor }));
  return deOpenAI(res);
}
