-- Sabores adicionados ao cardapio.
-- Idempotente: insere apenas se o nome ainda nao existir.

INSERT INTO flavors (name, description, price, filling_cost, cost_price, category, available)
SELECT v.name, v.description, v.price, v.filling_cost, v.filling_cost + b.base_cost, v.category, TRUE
FROM (
    VALUES
        ('Chocolate Branco com Morango', 'Chocolate branco cremoso com morangos frescos fatiados.', 9.99::numeric, 0::numeric, 'Doce'),
        ('Chocolate Branco', 'Chocolate branco cremoso em recheio generoso.', 9.99::numeric, 0::numeric, 'Doce'),
        ('Torta de Limao', 'Creme de limao com toque doce e finalizacao cremosa.', 8.99::numeric, 0::numeric, 'Doce'),
        ('Carne e Queijo', 'Carne moida temperada com queijo derretido.', 8.99::numeric, 0::numeric, 'Premium')
) AS v(name, description, price, filling_cost, category)
CROSS JOIN (
    SELECT COALESCE(SUM(amount), 0)::numeric AS base_cost FROM base_costs
) AS b
WHERE NOT EXISTS (
    SELECT 1
    FROM flavors f
    WHERE LOWER(f.name) = LOWER(v.name)
       OR REPLACE(LOWER(f.name), chr(227), 'a') = LOWER(v.name)
);
