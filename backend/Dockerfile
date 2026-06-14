FROM node:20-alpine

WORKDIR /app/backend

# Instala dependências de produção primeiro (cache friendly)
COPY --chown=node:node backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

# Copia o código
COPY --chown=node:node backend/src ./src
COPY --chown=node:node backend/scripts ./scripts

# Define onde o backend procura o frontend (sobrescreve o ".." padrão)
ENV FRONTEND_DIR=/app/frontend
ENV NODE_ENV=production

# Copia o frontend para dentro da imagem (permite rodar sem bind-mounts)
WORKDIR /app
RUN mkdir -p /app/frontend && chown node:node /app/frontend
COPY --chown=node:node index.html pedidos.html cozinha.html sabores.html clientes.html relatorios.html financeiro.html gestao.html /app/frontend/
COPY --chown=node:node js /app/frontend/js

EXPOSE 3000

# Roda migrations e sobe o servidor. Como o compose espera o healthcheck do
# postgres antes de iniciar o backend, a migração não falha por BD indisponível.
WORKDIR /app/backend
USER node
CMD ["sh", "-c", "node src/migrate.js && node src/server.js"]
