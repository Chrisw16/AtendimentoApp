/**
 * limites.js — Verificação de limites por tenant (plano SaaS)
 *
 * Cada plano tem limites configurados na tabela tenants:
 *   limite_agentes       — máximo de agentes ativos simultâneos
 *   limite_canais        — máximo de canais ativos
 *   limite_conversas_mes — máximo de conversas iniciadas no mês corrente
 *
 * USO:
 *   import { verificarLimite } from "./limites.js";
 *
 *   await verificarLimite(tenantId, "agentes");
 *   await verificarLimite(tenantId, "canais");
 *   await verificarLimite(tenantId, "conversas_mes");
 *   // Lança LimitError se o limite foi atingido.
 *
 * TENANT ENTERPRISE ou status diferente de ativo/trial:
 *   Limites >= 999 são tratados como ilimitados (sem verificação).
 */

import { query } from "./db.js";
import { CITMAX_TENANT_ID } from "./db.js";

// Erro específico de limite — distingue de outros erros no caller
export class LimitError extends Error {
  constructor(msg, recurso, usado, limite) {
    super(msg);
    this.name = "LimitError";
    this.recurso = recurso;
    this.usado   = usado;
    this.limite  = limite;
    this.status  = 429; // Too Many Requests
  }
}

// Cache leve (30s) para não bater no banco a cada mensagem
const _cache = new Map();
const _cacheTs = new Map();
const CACHE_TTL = 30_000;

async function getTenant(tenantId) {
  const key = `tenant:${tenantId}`;
  const ts  = _cacheTs.get(key) || 0;
  if (_cache.has(key) && Date.now() - ts < CACHE_TTL) return _cache.get(key);
  const r = await query(`SELECT * FROM tenants WHERE id=$1`, [tenantId]);
  const tenant = r.rows[0] || null;
  _cache.set(key, tenant);
  _cacheTs.set(key, Date.now());
  return tenant;
}

export function invalidarCacheLimites(tenantId) {
  _cache.delete(`tenant:${tenantId}`);
  _cacheTs.delete(`tenant:${tenantId}`);
}

// ── Verificador principal ─────────────────────────────────────────────────────
export async function verificarLimite(tenantId = CITMAX_TENANT_ID, recurso) {
  // Tenant CITmax (legado) — sem limites
  if (tenantId === CITMAX_TENANT_ID) return;

  const tenant = await getTenant(tenantId);
  if (!tenant) return; // tenant não encontrado — deixa passar (segurança conservadora)

  // Tenants suspensos ou cancelados — bloqueia tudo
  if (tenant.status === "suspenso") {
    throw new LimitError(
      "Conta suspensa. Entre em contato com o suporte.",
      "conta", 0, 0
    );
  }
  if (tenant.status === "cancelado") {
    throw new LimitError(
      "Conta cancelada. Entre em contato para reativação.",
      "conta", 0, 0
    );
  }

  // Trial expirado
  if (tenant.status === "trial" && tenant.trial_ate) {
    if (new Date(tenant.trial_ate) < new Date()) {
      throw new LimitError(
        "Período de trial encerrado. Faça upgrade para continuar.",
        "trial", 0, 0
      );
    }
  }

  switch (recurso) {

    case "agentes": {
      const limite = parseInt(tenant.limite_agentes || 3);
      if (limite >= 999) return; // ilimitado
      const r = await query(
        `SELECT COUNT(*) as c FROM agentes WHERE tenant_id=$1 AND ativo=true`,
        [tenantId]
      );
      const usado = parseInt(r.rows[0]?.c || 0);
      if (usado >= limite) {
        throw new LimitError(
          `Limite de agentes atingido (${usado}/${limite}). Faça upgrade do plano para adicionar mais.`,
          "agentes", usado, limite
        );
      }
      break;
    }

    case "canais": {
      const limite = parseInt(tenant.limite_canais || 2);
      if (limite >= 99) return; // ilimitado
      const r = await query(
        `SELECT COUNT(*) as c FROM canais WHERE tenant_id=$1 AND ativo=true`,
        [tenantId]
      );
      const usado = parseInt(r.rows[0]?.c || 0);
      if (usado >= limite) {
        throw new LimitError(
          `Limite de canais ativos atingido (${usado}/${limite}). Faça upgrade do plano para ativar mais canais.`,
          "canais", usado, limite
        );
      }
      break;
    }

    case "conversas_mes": {
      const limite = parseInt(tenant.limite_conversas_mes || 500);
      if (limite >= 999999) return; // ilimitado
      const r = await query(
        `SELECT COUNT(*) as c FROM conversas
         WHERE tenant_id=$1
           AND criado_em >= date_trunc('month', NOW())`,
        [tenantId]
      );
      const usado = parseInt(r.rows[0]?.c || 0);
      if (usado >= limite) {
        throw new LimitError(
          `Limite mensal de conversas atingido (${usado}/${limite}). Faça upgrade do plano ou aguarde o próximo mês.`,
          "conversas_mes", usado, limite
        );
      }
      break;
    }

    default:
      // Recurso desconhecido — não bloqueia
      break;
  }
}

// ── Helper: retorna o uso atual de todos os recursos ─────────────────────────
export async function getUsoAtual(tenantId = CITMAX_TENANT_ID) {
  const tenant = await getTenant(tenantId);
  if (!tenant) return null;

  const [agentesR, canaisR, conversasR] = await Promise.all([
    query(`SELECT COUNT(*) as c FROM agentes   WHERE tenant_id=$1 AND ativo=true`, [tenantId]),
    query(`SELECT COUNT(*) as c FROM canais     WHERE tenant_id=$1 AND ativo=true`, [tenantId]),
    query(`SELECT COUNT(*) as c FROM conversas  WHERE tenant_id=$1 AND criado_em >= date_trunc('month', NOW())`, [tenantId]),
  ]);

  return {
    agentes:       { usado: parseInt(agentesR.rows[0]?.c || 0),   limite: tenant.limite_agentes       || 3 },
    canais:        { usado: parseInt(canaisR.rows[0]?.c  || 0),   limite: tenant.limite_canais        || 2 },
    conversas_mes: { usado: parseInt(conversasR.rows[0]?.c || 0), limite: tenant.limite_conversas_mes || 500 },
    plano:         tenant.plano,
    status:        tenant.status,
    trial_ate:     tenant.trial_ate,
  };
}
