FROM node:20-alpine

WORKDIR /app

# Instala dependências de produção primeiro (cache friendly)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copia o código
COPY src ./src

# Define onde o backend procura o frontend (sobrescreve o ".." padrão)
ENV FRONTEND_DIR=/app/frontend

EXPOSE 3000

# Roda migrations e sobe o servidor. Como o compose espera o healthcheck do
# postgres antes de iniciar o backend, a migração não falha por BD indisponível.
CMD ["sh", "-c", "node src/migrate.js && node src/server.js"]
