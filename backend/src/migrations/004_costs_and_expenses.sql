-- Custo unitário dos sabores
ALTER TABLE flavors ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0);

-- Categorias de despesa
CREATE TABLE IF NOT EXISTS expense_categories (
    id        SERIAL PRIMARY KEY,
    name      TEXT UNIQUE NOT NULL,
    icon      TEXT NOT NULL DEFAULT 'circle',
    color     TEXT NOT NULL DEFAULT 'gray',
    is_fixed  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Despesas pontuais
CREATE TABLE IF NOT EXISTS expenses (
    id           SERIAL PRIMARY KEY,
    category_id  INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
    description  TEXT NOT NULL DEFAULT '',
    amount       NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    date         DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    source       TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'recurring'))
);

CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- Despesas recorrentes (geram expenses automaticamente)
CREATE TABLE IF NOT EXISTS recurring_expenses (
    id             SERIAL PRIMARY KEY,
    category_id    INTEGER REFERENCES expense_categories(id) ON DELETE SET NULL,
    description    TEXT NOT NULL,
    amount         NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    day_of_month   INTEGER NOT NULL CHECK (day_of_month BETWEEN 1 AND 28),
    active         BOOLEAN NOT NULL DEFAULT TRUE,
    last_generated DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed removido: sem dados mockados por padrão.
