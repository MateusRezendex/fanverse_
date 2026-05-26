-- Schema do banco "Sabor que Vicia"

CREATE TABLE IF NOT EXISTS flavors (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price       NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    category    TEXT NOT NULL,
    available   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sequência para IDs amigáveis "#1001", "#1002", ...
CREATE SEQUENCE IF NOT EXISTS order_id_seq START 1001;

CREATE TABLE IF NOT EXISTS orders (
    id           TEXT PRIMARY KEY,
    customer     TEXT NOT NULL,
    phone        TEXT NOT NULL DEFAULT '',
    address      TEXT NOT NULL DEFAULT '',
    payment      TEXT NOT NULL DEFAULT '',
    total        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    status       TEXT NOT NULL DEFAULT 'Pendente'
                 CHECK (status IN ('Pendente', 'Em Preparo', 'Pronto', 'Entregue', 'Cancelado')),
    notes        TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id        SERIAL PRIMARY KEY,
    order_id  TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    flavor_id INTEGER REFERENCES flavors(id) ON DELETE SET NULL,
    name      TEXT NOT NULL,
    quantity  INTEGER NOT NULL CHECK (quantity > 0),
    price     NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_status     ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
