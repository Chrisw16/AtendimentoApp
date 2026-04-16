# ── STAGE 1: Build do frontend ────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/web
COPY apps/web/package*.json ./
RUN npm install
COPY apps/web/ ./
RUN npm run build

# ── STAGE 2: Runtime da API + frontend estático ───────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Instala dependências da API
COPY apps/api/package*.json ./
RUN npm install --omit=dev

# Copia código da API
COPY apps/api/ ./

# Copia o frontend buildado para onde o server.js espera encontrá-lo
COPY --from=frontend-builder /build/web/dist ./apps/web/dist

# Porta exposta (deve bater com PORT no Coolify)
EXPOSE 4000

# Variáveis de ambiente com valores padrão seguros
ENV NODE_ENV=production
ENV PORT=4000

# Healthcheck para o Coolify saber quando o container está pronto
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
