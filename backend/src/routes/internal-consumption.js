const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
    return {
        id: row.id,
        flavorId: row.flavor_id,
        name: row.name,
        quantity: row.quantity,
        notes: row.notes || '',
        expenseId: row.expense_id || null,
        consumedAt: row.consumed_at,
    };
}

function normalizeExpense(row) {
    const date = row.date instanceof Date
        ? row.date.toISOString().slice(0, 10)
        : String(row.date || '').slice(0, 10);
    return {
        id: row.id,
        categoryId: row.category_id,
        description: row.description,
        amount: Number(row.amount),
        date,
        createdAt: row.created_at,
        source: row.source,
    };
}

function shouldAutoMarketingExpense(notes) {
    const value = String(notes || '').toLowerCase();
    return value.includes('divulga') || value.includes('marketing');
}

router.get('/', async (req, res, next) => {
    try {
        const limit = Math.min(Math.max(parseInt(req.query.limit || '100', 10) || 100, 1), 500);
        const { rows } = await query(
            `SELECT * FROM internal_consumption
             ORDER BY consumed_at DESC, id DESC
             LIMIT $1`,
            [limit]
        );
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { items = [], notes = '', expenseCategoryId = null } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'lista de itens vazia' });
        }

        for (const it of items) {
            if (!it || !(Number(it.flavorId) > 0) || !(Number(it.quantity) > 0)) {
                return res.status(400).json({ error: 'item inválido', item: it });
            }
        }

        const inserted = await withTx(async (client) => {
            const rows = [];
            const expenses = [];
            let categoryId = Number(expenseCategoryId) || null;

            if (categoryId) {
                const category = await client.query('SELECT id FROM expense_categories WHERE id = $1', [categoryId]);
                if (category.rows.length === 0) {
                    const err = new Error('categoria financeira não encontrada');
                    err.status = 400;
                    throw err;
                }
            } else if (shouldAutoMarketingExpense(notes)) {
                const existingCategory = await client.query(
                    `SELECT id
                     FROM expense_categories
                     WHERE lower(name) LIKE '%divulga%' OR lower(name) LIKE '%marketing%'
                     ORDER BY id
                     LIMIT 1`
                );
                if (existingCategory.rows.length > 0) {
                    categoryId = existingCategory.rows[0].id;
                } else {
                    const { rows: [category] } = await client.query(
                        `INSERT INTO expense_categories (name, icon, color, is_fixed)
                         VALUES ('Divulgação/Marketing', 'megaphone', 'blue', FALSE)
                         RETURNING id`
                    );
                    categoryId = category.id;
                }
            }

            for (const it of items) {
                const flavorId = Number(it.flavorId);
                const quantity = Math.floor(Number(it.quantity));
                const flavor = await client.query('SELECT name, COALESCE(cost_price, 0)::numeric AS cost_price FROM flavors WHERE id = $1', [flavorId]);
                if (flavor.rows.length === 0) {
                    const err = new Error(`sabor não encontrado: ${flavorId}`);
                    err.status = 400;
                    throw err;
                }
                const flavorRow = flavor.rows[0];
                let expenseId = null;
                if (categoryId) {
                    const amount = quantity * Number(flavorRow.cost_price || 0);
                    const { rows: [expense] } = await client.query(
                        `INSERT INTO expenses (category_id, description, amount, date, source)
                         VALUES ($1, $2, $3, (NOW() AT TIME ZONE 'America/Sao_Paulo')::date, 'manual')
                         RETURNING *`,
                        [
                            categoryId,
                            `Consumo interno: ${quantity}x ${flavorRow.name}`,
                            amount,
                        ]
                    );
                    expenseId = expense.id;
                    expenses.push(normalizeExpense(expense));
                }
                const { rows: [row] } = await client.query(
                    `INSERT INTO internal_consumption (flavor_id, name, quantity, notes, expense_id)
                     VALUES ($1, $2, $3, $4, $5)
                     RETURNING *`,
                    [flavorId, flavorRow.name, quantity, notes, expenseId]
                );
                rows.push(normalize(row));
            }
            return { rows, expenses };
        });

        broadcast('internal-consumption:created', inserted.rows);
        inserted.expenses.forEach(expense => broadcast('expense:created', expense));
        res.status(201).json(inserted.rows);
    } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        next(e);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const existing = await query('SELECT expense_id FROM internal_consumption WHERE id = $1', [id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'registro não encontrado' });
        const expenseId = existing.rows[0].expense_id;
        await query('DELETE FROM internal_consumption WHERE id = $1', [id]);
        if (expenseId) {
            await query('DELETE FROM expenses WHERE id = $1', [expenseId]);
            broadcast('expense:deleted', { id: expenseId });
        }
        broadcast('internal-consumption:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;
