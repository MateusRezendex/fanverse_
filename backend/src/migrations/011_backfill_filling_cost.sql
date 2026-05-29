-- Backfill: sabores antigos que tinham cost_price direto
-- Considera que o custo antigo era do recheio (custos base eram 0)
UPDATE flavors
SET filling_cost = cost_price
WHERE filling_cost = 0 AND cost_price > 0;

