ALTER TABLE orders
ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'sale'
CHECK (price_mode IN ('sale', 'cost'));
