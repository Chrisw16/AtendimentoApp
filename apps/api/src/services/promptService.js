/**
 * promptService.js
 * Carrega prompts do banco e resolve placeholders:
 *   [REGRAS]           → conteúdo do slug 'regras'
 *   [ESTILO]           → conteúdo do slug 'estilo'
 *   [PLANOS]           → lista de planos do banco
 *   [TIPOS_OCORRENCIA] → tipos de chamado SGP
 *
 * Uso no motorFluxo:
 *   const { system, modelo, provedor, temperatura } = await resolverPrompt('suporte', ctx);
 */
import { getDb } from '../config/db.js';

// Cache em memória com TTL de 3 minutos
const _cache = new Map();
const TTL = 3 * 60 * 1000;

async function getPrompt(slug) {
  const now = Date.now();
  if (_cache.has(slug) && now - _cache.get(slug).ts < TTL) return _cache.get(slug).val;
  const db = getDb();
  const row = await db('prompts_ia').where({ slug }).first();
  _cache.set(slug, { val: row || null, ts: now });
  return row || null;
}

export function invalidarCachePrompts() { _cache.clear(); }

async function getPlanos() {
  try {
    const db = getDb();
    const rows = await db('sistema_kv').where({ chave: 'planos_texto' }).first();
    if (rows?.valor) return typeof rows.valor === 'string' ? JSON.parse(rows.valor) : rows.valor;

    // Fallback: busca da tabela planos se existir
    const hasTable = await db.schema.hasTable('planos');
    if (hasTable) {
      const planos = await db('planos').where({ ativo: true }).orderBy('valor');
      if (planos.length) {
        return planos.map(p => `${p.nome} — ${p.velocidade}${p.unidade || 'M'} — R$ ${Number(p.valor).toFixed(2)}`).join('\n');
      }
    }
    return 'Consulte os planos disponíveis em nosso site.';
  } catch { return 'Consulte os planos disponíveis em nosso site.'; }
}

async function getTiposOcorrencia() {
  try {
    const db = getDb();
    const row = await db('sistema_kv').where({ chave: 'tipos_ocorrencia' }).first();
    if (row?.valor) return typeof row.valor === 'string' ? JSON.parse(row.valor) : row.valor;
    return '200=Reparo, 5=Outros, 13=Mudança de endereço, 23=Mudança de plano, 22=Problema de fatura';
  } catch { return '200=Reparo, 5=Outros, 13=Mudança de endereço, 23=Mudança de plano'; }
}

/**
 * Resolve o prompt de um slug injetando os placeholders e o contexto do cliente.
 * @param {string} slug — ex: 'suporte', 'financeiro', 'faq'
 * @param {object} clienteCtx — { nome, cpf, contrato, plano, status, cidade, telefone }
 * @returns {{ system: string, modelo: string, provedor: string, temperatura: number }}
 */
export async function resolverPrompt(slug, clienteCtx = {}) {
  const [promptRow, regrasRow, estiloRow, planos, tipos] = await Promise.all([
    getPrompt(slug),
    getPrompt('regras'),
    getPrompt('estilo'),
    getPlanos(),
    getTiposOcorrencia(),
  ]);

  // Fallback se o slug não existir no banco
  const conteudo = promptRow?.conteudo || `Você é um assistente de atendimento da NetGo Internet. Seja cordial e objetivo.`;
  const modelo      = promptRow?.modelo      || 'claude-haiku-4-5-20251001';
  const provedor    = promptRow?.provedor    || 'anthropic';
  const temperatura = Number(promptRow?.temperatura ?? 0.3);

  // Substitui placeholders
  let system = conteudo
    .replace(/\[REGRAS\]/g,           regrasRow?.conteudo || '')
    .replace(/\[ESTILO\]/g,           estiloRow?.conteudo || '')
    .replace(/\[PLANOS\]/g,           String(planos))
    .replace(/\[TIPOS_OCORRENCIA\]/g, String(tipos));

  // Injeta contexto do cliente no final (como no sistema de inspiração)
  if (clienteCtx && Object.keys(clienteCtx).length > 0) {
    const partes = [];
    if (clienteCtx.nome)     partes.push(`[Nome: ${clienteCtx.nome}]`);
    if (clienteCtx.cpf)      partes.push(`[CPF do cliente: ${clienteCtx.cpf}]`);
    if (clienteCtx.telefone) partes.push(`[Telefone do cliente: ${clienteCtx.telefone}]`);
    if (clienteCtx.contrato) partes.push(`[Contrato ativo: ${clienteCtx.contrato}]`);
    if (clienteCtx.plano)    partes.push(`[Plano: ${clienteCtx.plano}]`);
    if (clienteCtx.status)   partes.push(`[Status: ${clienteCtx.status}]`);
    if (clienteCtx.cidade)   partes.push(`[Cidade: ${clienteCtx.cidade}]`);
    if (partes.length) system += '\n\n' + partes.join('\n');
  }

  return { system, modelo, provedor, temperatura };
}
