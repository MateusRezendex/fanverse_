const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
    return {
        key: row.key,
        label: row.label,
        amount: Number(row.amount),
    };
}

async function getBaseSum(client) {
    const { rows } = await client.query('SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM base_costs');
    return rows.length ? Number(rows[0].total) : 0;
}

router.get('/', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM base_costs ORDER BY key ASC');
        const total = rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);
        res.json({ items: rows.map(normalize), total: Number(total) });
    } catch (e) { next(e); }
});

router.patch('/', async (req, res, next) => {
    try {
        const { items } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items inválido' });
        }

        const result = await withTx(async (client) => {
            for (const it of items) {
                if (!it || typeof it.key !== 'string') return { bad: true, msg: 'key inválido' };
                const key = it.key.trim();
                const amount = Number(it.amount);
                if (!isFinite(amount) || amount < 0) return { bad: true, msg: 'amount inválido' };
                const updated = await client.query(
                    'UPDATE base_costs SET amount = $2 WHERE key = $1 RETURNING *',
                    [key, amount]
                );
                if (updated.rows.length === 0) return { bad: true, msg: `key desconhecida: ${key}` };
            }

            const baseSum = await getBaseSum(client);

            // Recalcula o cost_price de todos os sabores: filling_cost + baseSum
            const { rows: flavorRows } = await client.query(
                `UPDATE flavors
                 SET cost_price = (COALESCE(filling_cost, 0) + $1)
                 RETURNING *`,
                [baseSum]
            );

            return { baseSum, updatedFlavors: flavorRows };
        });

        if (result.bad) return res.status(400).json({ error: result.msg });

        // Notifica sabores (para UI atualizar margem/custo em tempo real)
        for (const f of result.updatedFlavors) {
            broadcast('flavor:updated', {
                id: f.id,
                name: f.name,
                description: f.description,
                price: Number(f.price),
                costPrice: Number(f.cost_price || 0),
                fillingCost: Number(f.filling_cost || 0),
                category: f.category,
                available: f.available,
            });
        }

        const { rows } = await query('SELECT * FROM base_costs ORDER BY key ASC');
        res.json({ items: rows.map(normalize), total: Number(result.baseSum) });
    } catch (e) { next(e); }
});

module.exports = router;
