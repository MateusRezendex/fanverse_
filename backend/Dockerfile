FROM node:20-alpine

WORKDIR /app/backend

# Instala dependências de produção primeiro (cache friendly)
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Copia o código
COPY backend/src ./src

# Define onde o backend procura o frontend (sobrescreve o ".." padrão)
ENV FRONTEND_DIR=/app/frontend

# Copia o frontend para dentro da imagem (permite rodar sem bind-mounts)
WORKDIR /app
RUN mkdir -p /app/frontend
COPY index.html pedidos.html cozinha.html sabores.html clientes.html relatorios.html financeiro.html gestao.html /app/frontend/
COPY js /app/frontend/js

EXPOSE 3000

# Roda migrations e sobe o servidor. Como o compose espera o healthcheck do
# postgres antes de iniciar o backend, a migração não falha por BD indisponível.
WORKDIR /app/backend
CMD ["sh", "-c", "node src/migrate.js && node src/server.js"]
