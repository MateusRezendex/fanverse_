-- Controle de sugestao e uso real de caixas por pedido.

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS caixa_sugerida TEXT NOT NULL DEFAULT 'Média',
    ADD COLUMN IF NOT EXISTS caixa_utilizada TEXT NOT NULL DEFAULT 'Média',
    ADD COLUMN IF NOT EXISTS ocupacao_total NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (ocupacao_total >= 0);

WITH occupancy AS (
    SELECT
        o.id,
        COALESCE(SUM(
            oi.quantity * CASE WHEN LOWER(COALESCE(f.category, '')) = 'doce' THEN 1.5 ELSE 1 END
        ), 0)::numeric AS points
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN flavors f ON f.id = oi.flavor_id
    GROUP BY o.id
),
suggestions AS (
    SELECT
        id,
        points,
        CASE
            WHEN points <= 6 THEN 'Média'
            WHEN points <= 10 THEN 'Grande'
            ELSE 'Múltiplas Caixas'
        END AS suggested
    FROM occupancy
)
UPDATE orders o
SET
    ocupacao_total = s.points,
    caixa_sugerida = s.suggested,
    caixa_utilizada = CASE
        WHEN o.caixa_utilizada IS NULL OR o.caixa_utilizada = '' OR o.caixa_utilizada = 'Média'
        THEN s.suggested
        ELSE o.caixa_utilizada
    END
FROM suggestions s
WHERE o.id = s.id;

CREATE INDEX IF NOT EXISTS idx_orders_caixa_utilizada ON orders(caixa_utilizada);
CREATE INDEX IF NOT EXISTS idx_orders_caixa_sugerida ON orders(caixa_sugerida);
