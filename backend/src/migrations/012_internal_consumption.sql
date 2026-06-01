-- Consumo interno: esfihas assadas para a equipe/familia, sem entrar como venda.
CREATE TABLE IF NOT EXISTS internal_consumption (
    id          SERIAL PRIMARY KEY,
    flavor_id   INTEGER REFERENCES flavors(id) ON DELETE SET NULL,
    name        TEXT NOT NULL,
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    notes       TEXT NOT NULL DEFAULT '',
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_internal_consumption_consumed_at ON internal_consumption(consumed_at);
CREATE INDEX IF NOT EXISTS idx_internal_consumption_flavor_id   ON internal_consumption(flavor_id);
