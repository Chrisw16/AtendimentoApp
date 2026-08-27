/**
 * kvSeguro.js — criptografia em repouso das credenciais do `sistema_kv` (§117).
 *
 * Desenho OPORTUNISTA, decidido na FASE 3:
 * - a chave mestra é `KV_SECRET` do ambiente (fora do banco, como §117 manda);
 * - SEM a env, tudo segue em texto plano como sempre foi — nenhuma migração
 *   criptografa nada, porque isso exigiria a env já setada no Coolify no
 *   momento do deploy, e sem ela as credenciais de produção ficariam ilegíveis
 *   (SGP/IA fora do ar);
 * - COM a env, cada credencial re-salva pela tela é gravada cifrada
 *   (`enc:v1:...`) e a leitura descriptografa. Texto plano antigo continua
 *   legível — ativação gradual, rollback trivial (apagar a env só impede ler
 *   o que já foi cifrado; o log grita qual chave e o operador re-salva).
 *
 * AES-256-GCM: cifra autenticada — valor adulterado no banco falha na tag em
 * vez de virar credencial silenciosamente corrompida. IV aleatório por escrita.
 *
 * ponytail: a chave vive no env do MESMO container (onde DATABASE_URL já
 * vive). O ganho real deste desenho é contra dump/backup do banco vazado — que
 * é o cenário do §117 — não contra quem já tem shell no container.
 */
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

const PREFIXO = 'enc:v1:';

/** Deriva 32 bytes de qualquer segredo textual. */
function chaveDe(segredo) {
  return createHash('sha256').update(String(segredo)).digest();
}

export function estaCifrado(valor) {
  return typeof valor === 'string' && valor.startsWith(PREFIXO);
}

/** Cifra um texto. Sem segredo, devolve o texto como veio (modo compat). */
export function cifrar(texto, segredo = process.env.KV_SECRET) {
  if (!segredo || typeof texto !== 'string') return texto;
  const iv     = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', chaveDe(segredo), iv);
  const corpo  = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  const tag    = cipher.getAuthTag();
  return PREFIXO + Buffer.concat([iv, tag, corpo]).toString('base64');
}

/**
 * Decifra um valor `enc:v1:`. Texto plano passa direto.
 * Valor cifrado sem segredo (ou com segredo errado/adulterado) → lança com a
 * mensagem dizendo O QUE fazer — melhor um erro alto que uma credencial vazia
 * indo para o SGP.
 */
export function decifrar(valor, segredo = process.env.KV_SECRET) {
  if (!estaCifrado(valor)) return valor;
  if (!segredo) {
    throw new Error('Valor cifrado no sistema_kv mas KV_SECRET não está no ambiente. Defina a env ou re-salve a credencial pela tela.');
  }
  const bruto = Buffer.from(valor.slice(PREFIXO.length), 'base64');
  const iv    = bruto.subarray(0, 12);
  const tag   = bruto.subarray(12, 28);
  const corpo = bruto.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', chaveDe(segredo), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(corpo), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Falha ao decifrar credencial do sistema_kv — KV_SECRET mudou ou o valor foi adulterado. Re-salve a credencial pela tela.');
  }
}

// ── LEITURA ÚNICA + MÁSCARA ──────────────────────────────────────

/**
 * Interpreta um valor cru vindo do `sistema_kv`/`canais.config`.
 *
 * A ordem IMPORTA e é o motivo deste helper existir: os 4 leitores faziam
 * `try { JSON.parse } catch { valor cru }` — um `enc:v1:...` não é JSON, caía
 * no catch e o CIPHERTEXT virava "o valor", indo como token para o SGP num 403
 * opaco. Aqui: decifra PRIMEIRO (se cifrado), parseia depois.
 *
 * `chave` entra só para a mensagem de erro dizer O QUE re-salvar.
 */
export function lerValorKV(raw, chave = '?', segredo = process.env.KV_SECRET) {
  if (raw == null) return null;
  let texto = raw;
  if (estaCifrado(texto)) {
    try { texto = decifrar(texto, segredo); }
    catch (err) { throw new Error(`[${chave}] ${err.message}`); }
  }
  if (typeof texto !== 'string') return texto;   // jsonb já veio objeto
  try { return JSON.parse(texto); } catch { return texto; }
}

/**
 * Máscara de credencial (§117: o frontend nunca recebe o segredo de volta).
 * Sempre contém `•`, que é o que o PUT usa para reconhecer e ignorar.
 */
export function mascarar(valor) {
  const s = String(valor ?? '');
  if (!s) return '';
  return s.length > 8 ? `••••••••${s.slice(-4)}` : '••••••••';
}

/**
 * true = o cliente devolveu a máscara (campo intocado na tela) e o valor real
 * NÃO deve ser sobrescrito. Checa por conteúdo, não igualdade: máscara editada
 * pela metade (colar no meio de `••••1234`) também não pode virar credencial.
 */
export function ehMascara(valor) {
  return typeof valor === 'string' && valor.includes('•');
}

// ── QUAIS CHAVES SÃO CREDENCIAL ──────────────────────────────────

/**
 * As chaves do `sistema_kv` que são SEGREDO — mascaradas no GET e cifradas na
 * escrita quando há `KV_SECRET`.
 *
 * Deliberadamente menor que `CHAVES_PUBLICAS`: URL, usuário e nome de empresa
 * não são credencial, e mascarar isso só cegaria o operador na tela de
 * Configurações sem proteger nada.
 */
export const CHAVES_SECRETAS = new Set([
  'anthropic_api_key', 'openai_api_key', 'sgp_token',
  'evolution_key', 'telegram_bot_token', 'sgpdb_password',
]);

export function ehSecreta(chave) {
  return CHAVES_SECRETAS.has(chave);
}

/** Aplica máscara nas credenciais de um objeto de config (§117). */
export function mascararConfig(config) {
  const saida = {};
  for (const [chave, valor] of Object.entries(config || {})) {
    saida[chave] = ehSecreta(chave) && valor ? mascarar(valor) : valor;
  }
  return saida;
}

/**
 * Decide o que o PUT deve gravar numa chave.
 *
 * `{ gravar: false }` = a tela devolveu a máscara (campo intocado); sobrescrever
 * ali destruiria a credencial real — é o modo mais fácil de perder um segredo
 * sem perceber, porque a tela continua mostrando `••••1234` depois.
 *
 * O `valor` devolvido já vai no formato da coluna, que é **jsonb**: por isso o
 * ciphertext é serializado de novo (`enc:v1:...` cru NÃO é JSON válido e o
 * Postgres recusaria). Sem `KV_SECRET`, grava exatamente como sempre gravou.
 */
export function valorParaGravar(chave, valor, segredo = process.env.KV_SECRET) {
  if (ehSecreta(chave) && ehMascara(valor)) return { gravar: false };
  // Credencial colada da documentação vem com espaço/quebra de linha grudado.
  // O header sai literal e o provedor devolve 401 "API key is invalid" — que
  // lê como chave errada, não como chave suja, e manda o operador caçar no
  // lugar errado. Só nas secretas: `prompt_ia` e `saudacao` são texto do
  // operador, e o espaço ali pode ser dele.
  if (ehSecreta(chave) && typeof valor === 'string') valor = valor.trim();
  const json = JSON.stringify(valor);
  if (!ehSecreta(chave) || !segredo) return { gravar: true, valor: json };
  return { gravar: true, valor: JSON.stringify(cifrar(json, segredo)) };
}
