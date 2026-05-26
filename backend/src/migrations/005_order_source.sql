-- Origem do cliente (como chegou até a loja)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source) WHERE source <> '';
