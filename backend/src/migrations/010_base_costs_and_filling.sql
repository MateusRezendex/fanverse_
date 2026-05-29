-- Custos base (iguais para todas as esfihas): massa, embalagem e gÃ¡s
CREATE TABLE IF NOT EXISTS base_costs (
    key    TEXT PRIMARY KEY,
    label  TEXT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0)
);

-- seed idempotente
INSERT INTO base_costs (key, label, amount) VALUES
  ('dough',     'Massa',      0),
  ('packaging', 'Embalagem',  0),
  ('gas',       'Gás',        0)
ON CONFLICT (key) DO NOTHING;

-- Custo do recheio (varia por sabor)
ALTER TABLE flavors
  ADD COLUMN IF NOT EXISTS filling_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (filling_cost >= 0);

