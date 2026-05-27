-- Adiciona taxa de entrega aos pedidos

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0);

