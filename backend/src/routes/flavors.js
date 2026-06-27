const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

const VALID_CATEGORIES = ['Salgada', 'Doce', 'Premium', 'Especial'];

async function getBaseCostSum(client) {
    const { rows } = await client.query('SELECT COALESCE(SUM(amount), 0)::numeric AS total FROM base_costs');
    return rows.length ? Number(rows[0].total) : 0;
}

function normalize(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        costPrice: Number(row.cost_price || 0),        // custo total (base + recheio)
        fillingCost: Number(row.filling_cost || 0),    // custo do recheio
        category: row.category,
        available: row.available,
    };
}

router.get('/', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM flavors ORDER BY LOWER(name) ASC, id ASC');
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { name, description = '', price, fillingCost, costPrice = 0, category, available = true } = req.body || {};
        const filling = fillingCost !== undefined ? Number(fillingCost) : Number(costPrice);

        if (!name || typeof name !== 'string')            return res.status(400).json({ error: 'name é obrigatório' });
        if (!(price >= 0))                                return res.status(400).json({ error: 'price inválido' });
        if (!(filling >= 0))                              return res.status(400).json({ error: 'fillingCost inválido' });
        if (!VALID_CATEGORIES.includes(category))         return res.status(400).json({ error: 'category inválida' });

        const flavor = await withTx(async (client) => {
            const baseSum = await getBaseCostSum(client);
            const { rows } = await client.query(
                `INSERT INTO flavors (name, description, price, filling_cost, cost_price, category, available)
                 VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
                [name.trim(), String(description), price, filling, (filling + baseSum), category, !!available]
            );
            return normalize(rows[0]);
        });

        broadcast('flavor:created', flavor);
        res.status(201).json(flavor);
    } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        const fieldMap = {
            name: 'name',
            description: 'description',
            price: 'price',
            fillingCost: 'filling_cost',
            category: 'category',
            available: 'available',
        };

        const sets = [];
        const values = [];
        let i = 1;
        let changedFilling = false;

        for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
            if (req.body[bodyKey] === undefined) continue;

            if (bodyKey === 'category' && !VALID_CATEGORIES.includes(req.body[bodyKey])) {
                return res.status(400).json({ error: 'category inválida' });
            }
            if ((bodyKey === 'price' || bodyKey === 'fillingCost') && !(req.body[bodyKey] >= 0)) {
                return res.status(400).json({ error: `${bodyKey} inválido` });
            }
            if (bodyKey === 'fillingCost') changedFilling = true;

            sets.push(`${dbCol} = $${i++}`);
            values.push(req.body[bodyKey]);
        }

        if (sets.length === 0) return res.status(400).json({ error: 'sem campos para atualizar' });

        const flavor = await withTx(async (client) => {
            values.push(id);
            const { rows } = await client.query(
                `UPDATE flavors SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
                values
            );
            if (rows.length === 0) return null;

            if (changedFilling) {
                const baseSum = await getBaseCostSum(client);
                const filling = Number(rows[0].filling_cost || 0);
                const { rows: updated } = await client.query(
                    'UPDATE flavors SET cost_price = $2 WHERE id = $1 RETURNING *',
                    [id, filling + baseSum]
                );
                return updated.length ? normalize(updated[0]) : normalize(rows[0]);
            }

            return normalize(rows[0]);
        });

        if (!flavor) return res.status(404).json({ error: 'sabor não encontrado' });

        broadcast('flavor:updated', flavor);
        res.json(flavor);
    } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        const { rowCount } = await query('DELETE FROM flavors WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'sabor não encontrado' });

        broadcast('flavor:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;

