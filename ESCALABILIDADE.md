# Guia de Escalabilidade — Maxxi SaaS

## Estado atual (v9.x)

O sistema está preparado para rodar em **instância única** de forma robusta:

- Estado de conversas persistido no banco (v9.2.0 — sem Maps em memória)
- Timers de follow-up/encerramento persistidos (`conv_timers`)
- Locks de processamento no banco (`conversas.processando`)
- Transações em operações críticas (v9.3.0)

Isso significa que **reinicializações não perdem estado** — o sistema retoma exatamente de onde parou.

---

## Capacidade estimada por configuração

| Config | Tenants | Conversas simultâneas | RAM necessária |
|---|---|---|---|
| 1 instância, 2 cores, 2GB | até 20 | ~200 | 512MB |
| 1 instância, 4 cores, 4GB | até 50 | ~500 | 1GB |
| Cluster 4 processos, 8GB | até 200 | ~2000 | 2GB+ |
| Multi-servidor (2+ VPS) | ilimitado | ilimitado | por servidor |

---

## Como escalar — em ordem de facilidade

### Nível 1: Aumentar recursos do servidor (mais simples)

O gargalo mais comum não é o código — é a RAM e a CPU do servidor.

```bash
# Aumentar limite de memória do PM2
MAXXI_MAX_MEM=1024M pm2 start ecosystem.config.cjs

# Ou editar ecosystem.config.cjs:
max_memory_restart: "1G"
```

Monitore com:
```bash
pm2 monit
pm2 logs maxxi --lines 100
```

---

### Nível 2: Cluster mode (mesma VPS, mais cores)

Usa todos os CPUs disponíveis sem Redis:

```bash
MAXXI_INSTANCES=4 pm2 start ecosystem.config.cjs
```

**O que funciona sem Redis em cluster:**
- ✅ Sessões, locks, timers — no banco PostgreSQL
- ✅ Rate limiting — `express-rate-limit` com MemoryStore é por processo, mas cada processo tem seu próprio limiter (aceitável)
- ✅ Atendimento de conversas — sem estado compartilhado necessário

**O que perde em cluster sem Redis:**
- ⚠️ SSE (Server-Sent Events para logs e agentes) — cada processo tem seus próprios clientes SSE. Um agente conectado ao processo A não recebe eventos gerados pelo processo B
- ⚠️ `messageBuffer` e `floodTimer` (anti-flood, TTL 8s) — por processo. Rajadas podem ser processadas em duplicata se a mesma conversa atingir processos diferentes

**Solução para SSE em cluster:** use sticky sessions no load balancer (Nginx/Traefik) para garantir que o mesmo cliente sempre vai para o mesmo processo.

---

### Nível 3: Multi-servidor (horizontal scaling com Docker)

Múltiplas instâncias Docker atrás de um load balancer:

```yaml
# docker-compose.yml (para staging/produção manual)
services:
  maxxi-1:
    image: ghcr.io/seu-usuario/maxxi-saas:latest
    environment:
      DATABASE_URL: postgres://...
      INSTANCE_ID: "1"
    ports: ["3001:3000"]

  maxxi-2:
    image: ghcr.io/seu-usuario/maxxi-saas:latest
    environment:
      DATABASE_URL: postgres://...
      INSTANCE_ID: "2"
    ports: ["3002:3000"]

  nginx:
    image: nginx:alpine
    # ... sticky sessions por IP
```

**Requisitos para funcionar corretamente:**
1. **Banco compartilhado** — já funciona (PostgreSQL centralizado)
2. **Sticky sessions** — o Nginx/Traefik deve rotear o mesmo IP para o mesmo backend (para SSE)
3. **Redis (opcional)** — para broadcast de eventos entre instâncias

---

### Nível 4: Redis para SSE broadcast (opcional)

Se precisar que eventos de uma instância cheguem a clientes conectados em outra:

```bash
# Instalar
npm install ioredis

# Variável de ambiente
REDIS_URL=redis://localhost:6379
```

Então em `logger.js`, publicar eventos no Redis e fazer subscribe em todos os processos. **Não está implementado** — adicione apenas se o nível 2 com sticky sessions não for suficiente.

---

## Monitoramento em produção

### Logs em tempo real
```bash
pm2 logs maxxi --lines 200
```

### Métricas do processo
```bash
pm2 monit
```

### Health check externo
```bash
# Verificação rápida
curl https://app.maxxi.ai/health

# Verificação detalhada
curl https://app.maxxi.ai/health/detail
```

### Banco de dados

Queries lentas — rode periodicamente:
```sql
SELECT pid, now() - pg_stat_activity.query_start AS duracao, query
FROM pg_stat_activity
WHERE state = 'active' AND now() - pg_stat_activity.query_start > interval '5 seconds';
```

Conexões abertas:
```sql
SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active';
```

Índices mais usados (valida que os índices de tenant_id estão sendo usados):
```sql
SELECT relname, indexrelname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan > 0
ORDER BY idx_scan DESC LIMIT 20;
```

---

## Checklist antes de ir para produção com múltiplos tenants

- [ ] `JWT_SECRET` definido e seguro (`openssl rand -hex 32`)
- [ ] `DATABASE_URL` aponta para PostgreSQL de produção (não o de dev)
- [ ] `node migrate-saas-tenancy.js` rodou com sucesso no banco de produção
- [ ] Super-admin criado via `POST /admin/api/super-admin/setup`
- [ ] Health check respondendo: `GET /health` retorna `{ "status": "ok" }`
- [ ] Rate limiting testado: `curl -X POST /admin/api/login` 6 vezes → deve retornar 429 na 6ª
- [ ] Logs estruturados visíveis: `pm2 logs maxxi | grep tenantId`
- [ ] Backup automático do PostgreSQL configurado
