-- Itens de custo (composiÃ§Ã£o do custo de produÃ§Ã£o de cada sabor)
CREATE TABLE IF NOT EXISTS flavor_cost_items (
    id         SERIAL PRIMARY KEY,
    flavor_id  INTEGER NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
    item       TEXT NOT NULL,
    amount     NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_flavor_cost_items_flavor_id ON flavor_cost_items(flavor_id);
