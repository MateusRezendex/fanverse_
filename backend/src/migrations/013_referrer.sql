-- Campo para guardar quem indicou o cliente (quando source = 'Indicação')

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS referrer TEXT NOT NULL DEFAULT '';

