FROM node:20-alpine AS frontend-builder
WORKDIR /build/web
COPY apps/web/package*.json ./
RUN NODE_ENV=development npm install
COPY apps/web/ ./
RUN npm run build
FROM node:20-alpine AS runtime
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install --omit=dev
COPY apps/api/ ./
COPY --from=frontend-builder /build/web/dist ./apps/web/dist
EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000
CMD ["node", "src/server.js"]