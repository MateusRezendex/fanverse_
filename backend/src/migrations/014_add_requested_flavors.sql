-- Sabores adicionados ao cardapio.
-- Idempotente: insere apenas se o nome ainda nao existir.

INSERT INTO flavors (name, description, price, filling_cost, cost_price, category, available)
SELECT v.name, v.description, v.price, v.filling_cost, v.filling_cost + b.base_cost, v.category, TRUE
FROM (
    VALUES
        ('Banoffe', 'Banana com doce de leite e toque cremoso.', 8.99::numeric, 0::numeric, 'Doce'),
        ('Lombo com Cream Cheese', 'Lombo fatiado com cream cheese.', 9.99::numeric, 0::numeric, 'Premium')
) AS v(name, description, price, filling_cost, category)
CROSS JOIN (
    SELECT COALESCE(SUM(amount), 0)::numeric AS base_cost FROM base_costs
) AS b
WHERE NOT EXISTS (
    SELECT 1 FROM flavors f WHERE LOWER(f.name) = LOWER(v.name)
);
