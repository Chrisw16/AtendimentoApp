# Maxxi SaaS — Guia de Migração

## O que mudou nesta versão (v9.0.0)

Esta versão introduz **multi-tenancy completo** no banco de dados.
O sistema está pronto para atender múltiplos clientes (tenants) de forma isolada.

### Novos arquivos
- `migrate-saas-tenancy.js` — migration única que transforma o banco para multi-tenant
- `src/services/tenant.js` — middleware e helpers de isolamento por tenant

### Arquivos modificados
| Arquivo | O que mudou |
|---|---|
| `src/services/db.js` | Exporta `CITMAX_TENANT_ID`, `tenantQuery()` e `kvGet/kvSet` tenant-aware |
| `src/services/jwt.js` | Inclui `tenantId` no payload de todos os tokens |
| `src/services/memoria.js` | Todas as funções aceitam `tenantId` (default: CITmax) |
| `src/services/erp.js` | URL e credenciais do SGP são lidas por tenant via `tenant_configs` |
| `src/services/chatInterno.js` | `loginAgente` filtra por `tenant_id` |
| `src/admin.js` | `auth` injeta `req.tenantId`; login inclui `tenantId` no token |
| `src/webhook.js` | `handleWebhook` recebe e propaga `tenantId` |
| `src/agent.js` | `runMaxxi` recebe e propaga `tenantId` |
| `.env.example` | Atualizado para SaaS |
| `package.json` | v9.0.0, novo script `migrate:saas` |

---

## Como executar a migration

**Faça backup do banco antes.**

```bash
# 1. Backup
pg_dump $DATABASE_URL > backup-pre-saas-$(date +%Y%m%d).sql

# 2. Migration (roda em transação — seguro)
node migrate-saas-tenancy.js

# 3. Verificar
psql $DATABASE_URL -c "SELECT id, nome, slug FROM tenants;"
```

A CITmax vira automaticamente o tenant `00000000-0000-4000-a000-000000000001`
e **continua funcionando sem nenhuma alteração de configuração**.

---

## Como criar um novo tenant

Após a migration, use o endpoint (a ser implementado na Fase 2):

```http
POST /api/super-admin/tenants
Authorization: Bearer <super-admin-token>

{
  "nome": "Fibra Norte",
  "slug": "fibranorte",
  "email": "admin@fibranorte.com.br",
  "plano": "pro"
}
```

Por enquanto, insira diretamente no banco:

```sql
INSERT INTO tenants (nome, slug, email, plano)
VALUES ('Fibra Norte', 'fibranorte', 'admin@fibranorte.com.br', 'pro');
```

E configure as integrações em `tenant_configs`:

```sql
INSERT INTO tenant_configs (tenant_id, chave, valor, sensivel)
VALUES
  ('<UUID>', 'sgp_url',        'https://fibranorte.sgp.net.br', true),
  ('<UUID>', 'sgp_token',      'TOKEN_DO_SGP',                  true),
  ('<UUID>', 'chatwoot_url',   'https://chat.fibranorte.com',   false),
  ('<UUID>', 'chatwoot_api_token', 'TOKEN_CHATWOOT',            true),
  ('<UUID>', 'bot_nome',       'Fibra',                         false),
  ('<UUID>', 'empresa_nome',   'Fibra Norte',                   false);
```

---

## Login no SaaS

O login agora aceita `tenantSlug` no body para identificar o tenant:

```http
POST /api/login
Content-Type: application/json

{
  "login": "admin",
  "senha": "senha123",
  "tenantSlug": "fibranorte"
}
```

Ou via header:
```http
X-Tenant-ID: <UUID do tenant>
```

O token JWT retornado contém `tenantId` e garante isolamento automático
em todas as queries.

---

## Roadmap das próximas fases

### Fase 2 — Painel Super-Admin (próximo)
- Endpoint CRUD de tenants
- Configuração de integrações pelo painel
- Painel de uso e billing por tenant

### Fase 3 — Onboarding self-service
- Página de cadastro de novo tenant
- Wizard de configuração (WhatsApp, ERP, prompts)
- Planos e limites automáticos

### Fase 4 — Billing e infraestrutura
- Integração com gateway de pagamento
- Métricas por tenant
- CI/CD multi-ambiente
