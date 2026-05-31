-- Separa taxa de entrega em "cliente paga" (delivery_fee) e "custo" (delivery_fee_cost)

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_fee_cost NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (delivery_fee_cost >= 0);

