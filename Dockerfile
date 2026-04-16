# ── STAGE 1: Build do frontend ────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/web
COPY apps/web/package*.json ./
RUN npm install --legacy-peer-deps

# Copia TODO o conteúdo do frontend (incluindo index.html)
COPY apps/web/index.html ./
COPY apps/web/vite.config.js ./
COPY apps/web/src ./src

RUN npm run build

# ── STAGE 2: Runtime da API ───────────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

COPY apps/api/package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY apps/api/ ./

# Copia o frontend buildado
COPY --from=frontend-builder /build/web/dist ./apps/web/dist

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "src/server.js"]
