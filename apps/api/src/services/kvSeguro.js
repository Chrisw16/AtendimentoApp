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
