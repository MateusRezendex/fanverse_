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
        consumedAt: row.consumed_at,
    };
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
        const { items = [], notes = '' } = req.body || {};
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'items vazio' });
        }

        for (const it of items) {
            if (!it || !(Number(it.flavorId) > 0) || !(Number(it.quantity) > 0)) {
                return res.status(400).json({ error: 'item invalido', item: it });
            }
        }

        const inserted = await withTx(async (client) => {
            const rows = [];
            for (const it of items) {
                const flavorId = Number(it.flavorId);
                const quantity = Math.floor(Number(it.quantity));
                const flavor = await client.query('SELECT name FROM flavors WHERE id = $1', [flavorId]);
                if (flavor.rows.length === 0) {
                    const err = new Error(`sabor nao encontrado: ${flavorId}`);
                    err.status = 400;
                    throw err;
                }
                const { rows: [row] } = await client.query(
                    `INSERT INTO internal_consumption (flavor_id, name, quantity, notes)
                     VALUES ($1, $2, $3, $4)
                     RETURNING *`,
                    [flavorId, flavor.rows[0].name, quantity, notes]
                );
                rows.push(normalize(row));
            }
            return rows;
        });

        broadcast('internal-consumption:created', inserted);
        res.status(201).json(inserted);
    } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message });
        next(e);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        const { rowCount } = await query('DELETE FROM internal_consumption WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'registro nao encontrado' });
        broadcast('internal-consumption:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;
