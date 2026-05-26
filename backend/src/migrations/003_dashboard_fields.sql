-- Campos necessários para métricas avançadas do dashboard.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS accepted_at  TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS ready_at     TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS neighborhood TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_orders_neighborhood ON orders(neighborhood) WHERE neighborhood <> '';
CREATE INDEX IF NOT EXISTS idx_orders_phone        ON orders(phone) WHERE phone <> '';
