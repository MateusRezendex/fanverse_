# Sabor que Vicia

Sistema de gestão para esfiharia: dashboard, pedidos, cozinha (kanban), cardápio, clientes e relatórios.

## Arquitetura

- **Frontend:** HTML estático + Tailwind (CDN) + Lucide Icons.
- **Backend:** Node.js + Express + PostgreSQL.
- **Tempo real:** WebSocket — quando o caixa cria um pedido, a cozinha vê na hora.

```
fanverse_/
├── docker-compose.yml         — Postgres + aplicacao em Docker
├── .env.example               — variáveis do compose
├── index.html, pedidos.html, cozinha.html, sabores.html, clientes.html, relatorios.html
├── js/db.js                   — cliente HTTP + WS com cache local
└── backend/
    ├── Dockerfile
    ├── src/
    │   ├── server.js          — Express + WS + serve estático
    │   ├── db.js, ws.js, migrate.js
    │   ├── migrations/*.sql
    │   └── routes/            — flavors.js, orders.js
    └── README.md
```

## Como rodar

Existem dois cenários. Escolha um.

> Se alguma porta estiver ocupada na sua máquina, ajuste `POSTGRES_PORT` e/ou `BACKEND_PORT` no `.env` (raiz) e/ou `PORT` no `backend/.env`.

### Cenário A — só o **Postgres** em Docker, backend local (recomendado em dev)

```bash
# 1. Sobe só o banco
docker compose up -d postgres

# 2. Backend local
cd backend
npm install
cp .env.example .env           # já vem apontando para localhost:5432
npm run migrate                # cria tabelas + seed inicial
npm start
```

Abra http://localhost:3000 (ou a porta definida em `PORT` no `backend/.env`).

### Cenário B — **tudo** em Docker (sem precisar de Node instalado)

```bash
# (opcional) copia .env.example para .env e ajusta credenciais
cp .env.example .env

docker compose up -d --build
```

O backend roda as migrations automaticamente no startup e fica disponível em `http://localhost:${BACKEND_PORT}` (default `3000`).

## Comandos úteis

```bash
# parar tudo
docker compose down

# parar e apagar o volume (zera o banco)
docker compose down -v

# logs do backend em container
docker compose logs -f backend

# acessar o psql do banco em container
docker compose exec postgres psql -U postgres -d sabor

# rodar migrations manualmente no host (cenário A)
cd backend && npm run migrate
```

## Documentação da API e WebSocket

Veja [backend/README.md](backend/README.md).
