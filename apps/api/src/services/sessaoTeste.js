/**
 * Estado das conversas do LINK PÚBLICO de teste (`/teste/<token>`), no servidor.
 *
 * A rota era stateless: devolvia o `estado` inteiro ao navegador e o recebia de
 * volta a cada turno. Só que esse blob carrega `contexto._contratos_sgp` — a
 * ficha crua do assinante: nome, endereço com lat/lng, senha do PPPoE e login e
 * senha da Central do Assinante. O link não pede login. Medido em produção em
 * 2026-08-27: qualquer pessoa com a URL digitava um CPF e recebia isso.
 *
 * Cifrar o blob foi descartado: `KV_SECRET` **não está setada** neste deploy
 * (a cripto do `kvSeguro` é oportunista, FASE 3), então a proteção seria um
 * no-op silencioso — o pior tipo de correção de segurança.
 *
 * O TTL é o mesmo do estado do fluxo (2 h), pelo mesmo motivo: quem abandona o
 * menu e volta horas depois não pode ter o "bom dia" lido como resposta ao
 * menu antigo.
 *
 * ponytail: Map em memória, um processo. É um link de TESTE — perder sessão em
 * restart é aceitável (o navegador já perdia no reload). Se um dia ele atender
 * atrás de mais de uma instância, troque por Redis com esta mesma interface.
 */
import { randomUUID } from 'node:crypto';

const TTL_MS = 2 * 60 * 60 * 1000;
const sessoes = new Map();

export function novoId() {
  return randomUUID();
}

/** `estado` null = conversa acabou: a sessão morre junto com a ficha. */
export function guardar(id, estado, agora = Date.now()) {
  // Purga na ESCRITA, não num timer: sem isso o link público vira um depósito
  // de fichas de assinante que só um restart esvazia.
  for (const [k, v] of sessoes) if (v.expira <= agora) sessoes.delete(k);
  if (!estado) { sessoes.delete(id); return null; }
  sessoes.set(id, { estado, expira: agora + TTL_MS });
  return id;
}

export function ler(id, agora = Date.now()) {
  const s = id && sessoes.get(id);
  if (!s) return null;
  if (s.expira <= agora) { sessoes.delete(id); return null; }
  return s.estado;
}

/** Só para o teste. */
export function _tamanho() { return sessoes.size; }
