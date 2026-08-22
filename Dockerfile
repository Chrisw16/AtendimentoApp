# ── STAGE 1: Build do frontend ────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /build/web
COPY apps/web/package*.json ./
RUN npm install --legacy-peer-deps

# Copia TODO o conteúdo do frontend (incluindo index.html)
COPY apps/web/index.html ./
COPY apps/web/vite.config.js ./
COPY apps/web/src ./src

# Teto de heap do V8 no BUILD.
#
# Sem isto o V8 cresce até o que a máquina tiver (medido: ~620 MB de RSS numa
# máquina folgada, embora 256 MB bastem para este bundle) e, num cgroup
# apertado, o kernel manda SIGKILL. O sintoma é traiçoeiro: o log para logo
# depois de "modules transformed" e **não imprime erro nenhum** — quando é o
# próprio V8 que estoura, ele cospe um stack dump gigante; silêncio é o OOM
# killer. Foi assim que o deploy de 22/08/2026 falhou.
ENV NODE_OPTIONS=--max-old-space-size=512

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

HEALTHCHECK --interval=15s --timeout=5s --start-period=120s --retries=3 \
  CMD wget -qO- http://localhost:4000/health/ready || exit 1

CMD ["node", "src/server.js"]
