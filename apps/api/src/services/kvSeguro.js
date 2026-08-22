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
export function lerValorKV(raw, chave = '?') {
  if (raw == null) return null;
  let texto = raw;
  if (estaCifrado(texto)) {
    try { texto = decifrar(texto); }
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
