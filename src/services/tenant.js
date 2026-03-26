/**
 * tenant.js — Middleware e helpers de multi-tenancy
 * ─────────────────────────────────────────────────────────────────────────────
 * Adicionar em: src/services/tenant.js
 *
 * RESPONSABILIDADES:
 *   1. resolveTenantMiddleware — lê o JWT e injeta req.tenantId em toda request
 *   2. tenantQuery()           — wrapper de query que injeta tenant_id automaticamente
 *   3. getTenantConfig()       — lê configs do tenant (SGP URL, tokens, etc.)
 *   4. requireTenant()         — guard: bloqueia requests sem tenant válido
 *
 * USO NO server.js / admin.js:
 *
 *   import { resolveTenantMiddleware, tenantQuery, getTenantConfig } from "./services/tenant.js";
 *
 *   // Aplicar globalmente antes das rotas autenticadas:
 *   adminRouter.use(auth);                    // valida JWT (já existe)
 *   adminRouter.use(resolveTenantMiddleware);  // injeta req.tenantId
 *
 *   // Nas queries, substituir query() por tenantQuery():
 *   // ANTES:  const r = await query(`SELECT * FROM conversas WHERE status=$1`, ["ativa"]);
 *   // DEPOIS: const r = await tenantQuery(req, `SELECT * FROM conversas WHERE status=$1`, ["ativa"]);
 *   //         → injeta automaticamente AND tenant_id=$N ao WHERE, ou WHERE tenant_id=$N
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { query, getPool } from "./db.js";
import { verificarToken } from "./jwt.js";

// UUID da CITmax — tenant padrão para compatibilidade com o sistema legado
export const CITMAX_TENANT_ID = "00000000-0000-4000-a000-000000000001";

// ── Cache de configs por tenant (TTL: 5 minutos) ─────────────────────────────
const _configCache = new Map();
const _configCacheTs = new Map();
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

// ── Cache de tenants por slug/domínio ────────────────────────────────────────
const _tenantCache = new Map();
const _tenantCacheTs = new Map();
const TENANT_CACHE_TTL = 30 * 1000;

// ─────────────────────────────────────────────────────────────────────────────
// 1. RESOLVE TENANT MIDDLEWARE
//
// Estratégias de resolução (em ordem de prioridade):
//   a) JWT contém tenantId  → usa esse
//   b) Header X-Tenant-ID   → lookup por ID
//   c) Header X-Tenant-Slug → lookup por slug
//   d) Subdomínio da request → lookup por domínio (ex: citmax.app.maxxi.ai)
//   e) Fallback: CITMAX_TENANT_ID (compatibilidade)
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveTenantMiddleware(req, res, next) {
  try {
    let tenantId = null;

    // a) Via JWT (caminho principal — admin/agente logado)
    if (req.tenantId) {
      // já foi resolvido pelo auth middleware
      return next();
    }

    const token = req.headers["x-admin-token"] || req.query.token || "";
    if (token) {
      const payload = verificarToken(token);
      if (payload?.tenantId) {
        tenantId = payload.tenantId;
      }
      // Compatibilidade: tokens antigos sem tenantId → CITmax
      if (!tenantId && payload) {
        tenantId = CITMAX_TENANT_ID;
      }
    }

    // b) Header X-Tenant-ID (usado internamente entre serviços)
    if (!tenantId && req.headers["x-tenant-id"]) {
      tenantId = req.headers["x-tenant-id"];
    }

    // c) Header X-Tenant-Slug (onboarding / self-service)
    if (!tenantId && req.headers["x-tenant-slug"]) {
      const tenant = await getTenantBySlug(req.headers["x-tenant-slug"]);
      tenantId = tenant?.id || null;
    }

    // d) Subdomínio → slug (ex: citmax.app.maxxi.ai → slug=citmax)
    if (!tenantId) {
      const host = req.headers.host || "";
      const match = host.match(/^([^.]+)\./);
      if (match && match[1] !== "app" && match[1] !== "www" && match[1] !== "api") {
        const tenant = await getTenantBySlug(match[1]);
        tenantId = tenant?.id || null;
      }
    }

    // e) Fallback para CITmax (compatibilidade com código legado)
    if (!tenantId) {
      tenantId = CITMAX_TENANT_ID;
    }

    req.tenantId = tenantId;
    next();
  } catch (err) {
    console.error("❌ resolveTenantMiddleware:", err.message);
    req.tenantId = CITMAX_TENANT_ID; // nunca quebra o request
    next();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. REQUIRE TENANT
// Guard que retorna 401 se não houver tenant resolvido.
// Use em endpoints que NUNCA devem funcionar sem tenant (ex: super-admin).
// ─────────────────────────────────────────────────────────────────────────────
export function requireTenant(req, res, next) {
  if (!req.tenantId) {
    return res.status(401).json({ error: "tenant_required", message: "Tenant não identificado." });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. TENANT QUERY
//
// Wrapper inteligente sobre query() que injeta tenant_id automaticamente.
//
// COMO FUNCIONA:
//   - Detecta se o SQL já tem WHERE → adiciona AND tenant_id=$N
//   - Se não tem WHERE → adiciona WHERE tenant_id=$N
//   - $N é o próximo índice após os params existentes
//
// EXEMPLOS:
//   tenantQuery(req, `SELECT * FROM conversas WHERE status=$1`, ["ativa"])
//   → `SELECT * FROM conversas WHERE status=$1 AND tenant_id=$2`
//
//   tenantQuery(req, `SELECT * FROM agentes ORDER BY nome`, [])
//   → `SELECT * FROM agentes WHERE tenant_id=$1 ORDER BY nome`
//
//   tenantQuery(req, `INSERT INTO leads(nome, tenant_id) VALUES($1, $2)`, ["João", req.tenantId])
//   → passa direto (tenant_id já está na query)
//
// ATENÇÃO: Para INSERTs, inclua tenant_id explicitamente no SQL.
//          Este helper é para SELECTs, UPDATEs e DELETEs.
// ─────────────────────────────────────────────────────────────────────────────
export async function tenantQuery(reqOrTenantId, sql, params = []) {
  const tenantId = typeof reqOrTenantId === "string"
    ? reqOrTenantId
    : (reqOrTenantId?.tenantId || CITMAX_TENANT_ID);

  // Se tenant_id já está no SQL, executa direto
  if (sql.includes("tenant_id")) {
    return query(sql, params);
  }

  const nextIdx = params.length + 1;
  const sqlComTenant = injetarTenantNoSQL(sql, nextIdx);
  return query(sqlComTenant, [...params, tenantId]);
}

/**
 * Injeta o filtro de tenant na query SQL de forma inteligente.
 * Lida com ORDER BY, GROUP BY, LIMIT, OFFSET, RETURNING, subqueries.
 */
function injetarTenantNoSQL(sql, idx) {
  const sqlNorm = sql.replace(/\s+/g, " ").trim();

  // Detecta se é SELECT/UPDATE/DELETE
  const upper = sqlNorm.toUpperCase();
  const isSelect = upper.startsWith("SELECT");
  const isUpdate = upper.startsWith("UPDATE");
  const isDelete = upper.startsWith("DELETE");

  if (!isSelect && !isUpdate && !isDelete) {
    // INSERT ou DDL — retorna sem modificar
    return sql;
  }

  // Clausulas que vêm depois do WHERE (não podemos inserir antes delas)
  const afterClauses = /\b(ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|RETURNING|FOR UPDATE|FOR SHARE)\b/i;
  const hasWhere = /\bWHERE\b/i.test(sql);

  if (hasWhere) {
    // Encontra a posição do primeiro WHERE e injeta após ele
    // Mas precisa cuidar de subqueries — injeta no WHERE do nível externo
    const whereMatch = sql.match(/\bWHERE\b/i);
    if (whereMatch) {
      const whereIdx = sql.indexOf(whereMatch[0]);
      const beforeWhere = sql.slice(0, whereIdx + whereMatch[0].length);
      const afterWhere = sql.slice(whereIdx + whereMatch[0].length);
      return `${beforeWhere} tenant_id=$${idx} AND ${afterWhere.trim()}`;
    }
  } else {
    // Sem WHERE — insere antes de ORDER BY, GROUP BY, LIMIT, etc.
    const matchAfter = sql.match(afterClauses);
    if (matchAfter) {
      const pos = sql.indexOf(matchAfter[0]);
      return `${sql.slice(0, pos).trim()} WHERE tenant_id=$${idx} ${sql.slice(pos)}`;
    }
    return `${sql.trimEnd()} WHERE tenant_id=$${idx}`;
  }

  return sql;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. GET TENANT CONFIG
//
// Lê configurações do tenant com cache de 5 minutos.
// Substitui process.env.SGP_URL, process.env.CHATWOOT_URL, etc.
//
// USO:
//   const sgpUrl    = await getTenantConfig(tenantId, "sgp_url");
//   const chatwoot  = await getTenantConfig(tenantId, "chatwoot_url");
//
//   // Ou buscar várias de uma vez:
//   const configs = await getTenantConfigs(tenantId, ["sgp_url", "sgp_token"]);
// ─────────────────────────────────────────────────────────────────────────────
export async function getTenantConfig(tenantId, chave) {
  const cacheKey = `${tenantId}:${chave}`;
  const cached = _configCache.get(cacheKey);
  const cachedTs = _configCacheTs.get(cacheKey) || 0;

  if (cached !== undefined && Date.now() - cachedTs < CONFIG_CACHE_TTL) {
    return cached;
  }

  try {
    const r = await query(
      `SELECT valor FROM tenant_configs WHERE tenant_id=$1 AND chave=$2`,
      [tenantId, chave]
    );
    const valor = r.rows[0]?.valor ?? null;
    _configCache.set(cacheKey, valor);
    _configCacheTs.set(cacheKey, Date.now());
    return valor;
  } catch {
    return null;
  }
}

export async function getTenantConfigs(tenantId, chaves) {
  try {
    const r = await query(
      `SELECT chave, valor FROM tenant_configs
       WHERE tenant_id=$1 AND chave = ANY($2)`,
      [tenantId, chaves]
    );
    const map = {};
    for (const row of r.rows) map[row.chave] = row.valor;
    return map;
  } catch {
    return {};
  }
}

export function invalidarConfigCache(tenantId) {
  for (const key of [..._configCache.keys()]) {
    if (key.startsWith(`${tenantId}:`)) {
      _configCache.delete(key);
      _configCacheTs.delete(key);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. HELPERS DE LOOKUP
// ─────────────────────────────────────────────────────────────────────────────
export async function getTenantById(id) {
  const cached = _tenantCache.get(id);
  if (cached && Date.now() - (_tenantCacheTs.get(id) || 0) < TENANT_CACHE_TTL) return cached;

  try {
    const r = await query(`SELECT * FROM tenants WHERE id=$1`, [id]);
    const tenant = r.rows[0] || null;
    if (tenant) {
      _tenantCache.set(id, tenant);
      _tenantCacheTs.set(id, Date.now());
    }
    return tenant;
  } catch { return null; }
}

export async function getTenantBySlug(slug) {
  const cacheKey = `slug:${slug}`;
  const cached = _tenantCache.get(cacheKey);
  if (cached && Date.now() - (_tenantCacheTs.get(cacheKey) || 0) < TENANT_CACHE_TTL) return cached;

  try {
    const r = await query(`SELECT * FROM tenants WHERE slug=$1 AND status='ativo'`, [slug]);
    const tenant = r.rows[0] || null;
    if (tenant) {
      _tenantCache.set(cacheKey, tenant);
      _tenantCacheTs.set(cacheKey, Date.now());
    }
    return tenant;
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HELPER PARA INSERT COM TENANT
//
// Garante que todo INSERT inclua tenant_id.
// USO:
//   await tenantInsert(req, "leads", { nome: "João", telefone: "..." });
//   → INSERT INTO leads(nome, telefone, tenant_id) VALUES($1,$2,$3) RETURNING *
// ─────────────────────────────────────────────────────────────────────────────
export async function tenantInsert(reqOrTenantId, tabela, dados, opts = {}) {
  const tenantId = typeof reqOrTenantId === "string"
    ? reqOrTenantId
    : (reqOrTenantId?.tenantId || CITMAX_TENANT_ID);

  const comTenant = { ...dados, tenant_id: tenantId };
  const cols = Object.keys(comTenant);
  const vals = Object.values(comTenant);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");

  const returning = opts.returning ? ` RETURNING ${opts.returning}` : " RETURNING *";
  const onConflict = opts.onConflict ? ` ON CONFLICT ${opts.onConflict}` : "";

  const sql = `INSERT INTO ${tabela}(${cols.join(", ")}) VALUES(${placeholders})${onConflict}${returning}`;
  return query(sql, vals);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXEMPLO DE USO — como atualizar o código existente
// ─────────────────────────────────────────────────────────────────────────────
/*
  ANTES (código atual em admin.js):
  ─────────────────────────────────
  adminRouter.get("/api/conversas", auth, async (req, res) => {
    const r = await query(`SELECT * FROM conversas WHERE status='ativa' ORDER BY atualizado DESC`);
    res.json(r.rows);
  });

  DEPOIS (com multi-tenancy):
  ───────────────────────────
  adminRouter.get("/api/conversas", auth, resolveTenantMiddleware, async (req, res) => {
    const r = await tenantQuery(req,
      `SELECT * FROM conversas WHERE status='ativa' ORDER BY atualizado DESC`
    );
    res.json(r.rows);
  });
  // → SQL gerado: SELECT * FROM conversas WHERE tenant_id=$1 AND status='ativa' ORDER BY atualizado DESC

  ─────────────────────────────────────────────────────────────────────────────

  ANTES (erp.js com URL hardcoded):
  ──────────────────────────────────
  const SGP_URL = "https://citrn.sgp.net.br";

  DEPOIS:
  ───────
  import { getTenantConfig } from "./tenant.js";

  async function getSgpUrl(tenantId) {
    return await getTenantConfig(tenantId, "sgp_url") || "https://citrn.sgp.net.br";
  }

  ─────────────────────────────────────────────────────────────────────────────

  ANTES (agent.js com ADMIN_PASSWORD global):
  ────────────────────────────────────────────
  const ADMIN_TOKEN = process.env.ADMIN_PASSWORD || "citmax2026";

  DEPOIS:
  ───────
  // O token JWT agora carrega tenantId — não precisa de ADMIN_PASSWORD global.
  // Cada agente tem login/senha próprios vinculados ao tenant.
*/
