-- Vincula consumo interno a despesas financeiras opcionais.
ALTER TABLE internal_consumption
ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_internal_consumption_expense_id
ON internal_consumption(expense_id);

-- Backfill: consumos antigos marcados como divulgacao/marketing viram despesa
-- pelo custo atual do sabor, sem receita.
DO $$
DECLARE
    marketing_category_id INTEGER;
    rec RECORD;
    new_expense_id INTEGER;
BEGIN
    SELECT id INTO marketing_category_id
    FROM expense_categories
    WHERE lower(name) LIKE '%divulga%' OR lower(name) LIKE '%marketing%'
    ORDER BY id
    LIMIT 1;

    IF marketing_category_id IS NULL THEN
        INSERT INTO expense_categories (name, icon, color, is_fixed)
        VALUES ('Divulgação/Marketing', 'megaphone', 'blue', FALSE)
        RETURNING id INTO marketing_category_id;
    END IF;

    FOR rec IN
        SELECT
            ic.id,
            ic.name,
            ic.quantity,
            ic.notes,
            ic.consumed_at,
            COALESCE(f.cost_price, 0)::numeric AS cost_price
        FROM internal_consumption ic
        LEFT JOIN flavors f ON f.id = ic.flavor_id
        WHERE ic.expense_id IS NULL
          AND (
            lower(ic.notes) LIKE '%divulga%'
            OR lower(ic.notes) LIKE '%marketing%'
          )
    LOOP
        INSERT INTO expenses (category_id, description, amount, date, source)
        VALUES (
            marketing_category_id,
            'Consumo interno - divulgação/marketing: ' || rec.quantity || 'x ' || rec.name,
            rec.quantity * rec.cost_price,
            (rec.consumed_at AT TIME ZONE 'America/Sao_Paulo')::date,
            'manual'
        )
        RETURNING id INTO new_expense_id;

        UPDATE internal_consumption
        SET expense_id = new_expense_id
        WHERE id = rec.id;
    END LOOP;
END $$;
