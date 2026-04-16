FROM node:20-alpine
WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install
COPY apps/api/ .
EXPOSE 4000
CMD ["npm", "run", "dev"]