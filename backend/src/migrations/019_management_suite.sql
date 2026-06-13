CREATE TABLE IF NOT EXISTS ingredients (
    id             SERIAL PRIMARY KEY,
    name           TEXT UNIQUE NOT NULL,
    unit           TEXT NOT NULL DEFAULT 'un',
    cost_per_unit  NUMERIC(12, 4) NOT NULL DEFAULT 0 CHECK (cost_per_unit >= 0),
    current_stock  NUMERIC(12, 3) NOT NULL DEFAULT 0,
    minimum_stock  NUMERIC(12, 3) NOT NULL DEFAULT 0 CHECK (minimum_stock >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS flavor_ingredients (
    flavor_id     INTEGER NOT NULL REFERENCES flavors(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (flavor_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
    id            BIGSERIAL PRIMARY KEY,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
    delta         NUMERIC(12, 3) NOT NULL CHECK (delta <> 0),
    reason        TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_ingredient ON stock_movements(ingredient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order ON stock_movements(order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS order_stock_deductions (
    order_id      TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity      NUMERIC(12, 3) NOT NULL CHECK (quantity > 0),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (order_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
    id               SERIAL PRIMARY KEY,
    name             TEXT NOT NULL,
    channel          TEXT NOT NULL DEFAULT '',
    investment       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (investment >= 0),
    orders_generated INTEGER NOT NULL DEFAULT 0 CHECK (orders_generated >= 0),
    revenue_generated NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (revenue_generated >= 0),
    start_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date         DATE,
    notes            TEXT NOT NULL DEFAULT '',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_dates ON campaigns(start_date, end_date);

CREATE TABLE IF NOT EXISTS monthly_goals (
    id             SERIAL PRIMARY KEY,
    month          DATE UNIQUE NOT NULL CHECK (month = date_trunc('month', month)::date),
    revenue_target NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (revenue_target >= 0),
    profit_target  NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (profit_target >= 0),
    orders_target  INTEGER NOT NULL DEFAULT 0 CHECK (orders_target >= 0),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
