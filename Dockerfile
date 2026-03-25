FROM node:22-alpine AS frontend

WORKDIR /build
COPY admin-ui/package.json admin-ui/package-lock.json* ./
RUN npm install
COPY admin-ui/ .
RUN npm run build

# ─── Backend ──────────────────────────────────────────────
FROM node:22-alpine

# Timezone Brasil (UTC-3)
ENV TZ=America/Fortaleza

WORKDIR /app

COPY package.json ./
RUN npm install --production

RUN apk add --no-cache iputils

COPY . .

# Copia o build do React para /app/admin-dist (DEPOIS do COPY . . para não ser sobrescrito)
COPY --from=frontend /build/dist ./admin-dist

# Verifica que o build existe
RUN ls -la /app/admin-dist/index.html && echo "✅ React build OK" || (echo "❌ React build MISSING" && exit 1)

RUN mkdir -p /data && chmod 777 /data

EXPOSE 3000
EXPOSE 7547

CMD ["node", "server.js"]
