# ══════════════════════════════════════════════════════════════════════════════
# Maxxi SaaS — Dockerfile multi-stage
# Stage 1: Build do frontend React
# Stage 2: Imagem de produção com backend Node.js
# ══════════════════════════════════════════════════════════════════════════════

# ── Stage 1: Frontend ─────────────────────────────────────────────────────────
FROM node:22-alpine AS frontend

WORKDIR /build

# Instala deps primeiro (layer cache — só reinstala se package.json mudar)
COPY admin-ui/package.json admin-ui/package-lock.json* ./
RUN npm ci --prefer-offline

# Copia o restante do frontend e faz build
COPY admin-ui/ .
RUN npm run build

# Verifica que o build gerou os arquivos esperados
RUN test -f /build/dist/index.html || (echo "❌ Build React falhou" && exit 1)

# ── Stage 2: Backend ──────────────────────────────────────────────────────────
FROM node:22-alpine

# Metadados da imagem (preenchidos pelo CI)
ARG BUILD_DATE=unknown
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.created="${BUILD_DATE}"
LABEL org.opencontainers.image.revision="${GIT_SHA}"
LABEL org.opencontainers.image.title="Maxxi SaaS"
LABEL org.opencontainers.image.description="Plataforma de atendimento IA multi-tenant"

# Timezone Brasil (UTC-3 Fortaleza — sem horário de verão)
ENV TZ=America/Fortaleza
ENV NODE_ENV=production

WORKDIR /app

# Instala iputils (para ping no monitor de rede) e curl (para health checks)
RUN apk add --no-cache iputils curl

# Instala deps do backend primeiro (layer cache)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --prefer-offline

# Copia o código do backend
COPY src/ ./src/
COPY server.js ecosystem.config.cjs migrate-saas-tenancy.js ./
# Copia o build do React do stage 1
COPY --from=frontend /build/dist ./admin-dist

# Verifica que os arquivos críticos existem
RUN test -f /app/admin-dist/index.html && echo "✅ React build OK" || (echo "❌ React build MISSING" && exit 1)
RUN test -f /app/src/services/tenant.js && echo "✅ tenant.js OK" || (echo "❌ tenant.js MISSING" && exit 1)
RUN test -f /app/src/services/limites.js && echo "✅ limites.js OK" || (echo "❌ limites.js MISSING" && exit 1)

# Cria diretório para logs e dados
RUN mkdir -p /data /app/logs && chmod 777 /data /app/logs

# Healthcheck nativo do Docker
# Verifica a cada 30s se o servidor está respondendo
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1

EXPOSE 3000
EXPOSE 7547

CMD ["node", "server.js"]
