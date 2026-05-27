-- Adiciona desconto aos pedidos (valor fixo em R$)

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS discount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0);

