/**
 * ecosystem.config.cjs — Configuração PM2
 *
 * MODOS DE OPERAÇÃO:
 *
 * 1. INSTÂNCIA ÚNICA (padrão atual — recomendado até ~50 tenants)
 *    pm2 start ecosystem.config.cjs
 *    instances: 1
 *
 * 2. CLUSTER MODE (múltiplas instâncias no mesmo servidor)
 *    pm2 start ecosystem.config.cjs --env cluster
 *    instances: "max" (usa todos os núcleos disponíveis)
 *
 *    ⚠️  REQUISITOS PARA CLUSTER MODE:
 *    - Redis para compartilhar estado entre processos:
 *        messageBuffer, floodTimer → já em memória (TTL 8s, OK perder)
 *        SSE clients (logs, agentes) → cada processo tem sua conexão SSE
 *        Sem problema: sessões, timers, locks → já no banco (v9.2.0)
 *    - Se não tiver Redis: use instância única com mais RAM
 *
 * 3. MULTI-SERVIDOR (horizontal scaling)
 *    Use Docker + Coolify com múltiplas réplicas
 *    Requisitos: Redis (opcional, para SSE broadcast) + load balancer sticky sessions
 *    O banco PostgreSQL é compartilhado — sem problema.
 */

module.exports = {
  apps: [
    {
      name:    "maxxi",
      script:  "server.js",

      // ── Modo de instância ───────────────────────────────────────────────────
      // "1" = instância única (padrão)
      // "max" = cluster (um processo por CPU core)
      // Use "max" apenas se tiver Redis configurado
      instances: process.env.MAXXI_INSTANCES || 1,
      exec_mode: process.env.MAXXI_INSTANCES > 1 ? "cluster" : "fork",

      // ── Restart ─────────────────────────────────────────────────────────────
      autorestart:        true,
      watch:              false,
      max_memory_restart: process.env.MAXXI_MAX_MEM || "512M",
      restart_delay:      3000,  // aguarda 3s antes de reiniciar (evita loop)
      max_restarts:       10,    // desiste após 10 restarts seguidos

      // ── Logs ────────────────────────────────────────────────────────────────
      log_date_format: "DD/MM/YYYY HH:mm:ss",
      error_file:      "./logs/pm2-error.log",
      out_file:        "./logs/pm2-out.log",
      merge_logs:      true,     // em cluster, junta logs de todos os processos

      // ── Variáveis de ambiente ────────────────────────────────────────────────
      env: {
        NODE_ENV: "production",
        PORT:     3000,
      },

      // ── Graceful shutdown ────────────────────────────────────────────────────
      // Dá 15s para o processo terminar conexões abertas antes de matar
      kill_timeout:    15000,
      listen_timeout:  8000,

      // ── Node.js flags de produção ────────────────────────────────────────────
      // --max-old-space-size: aumenta heap para workloads pesados de IA
      node_args: "--max-old-space-size=768",
    },
  ],
};
