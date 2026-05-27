const express = require('express');
const { query } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

const VALID_CATEGORIES = ['Salgada', 'Doce', 'Premium', 'Especial'];

function normalize(row) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number(row.price),
        costPrice: Number(row.cost_price || 0),
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
        const { name, description = '', price, costPrice = 0, category, available = true } = req.body || {};
        if (!name || typeof name !== 'string')           return res.status(400).json({ error: 'name é obrigatório' });
        if (!(price >= 0))                               return res.status(400).json({ error: 'price inválido' });
        if (!(costPrice >= 0))                           return res.status(400).json({ error: 'costPrice inválido' });
        if (!VALID_CATEGORIES.includes(category))        return res.status(400).json({ error: 'category inválida' });

        const { rows } = await query(
            `INSERT INTO flavors (name, description, price, cost_price, category, available)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [name.trim(), String(description), price, costPrice, category, !!available]
        );
        const flavor = normalize(rows[0]);
        broadcast('flavor:created', flavor);
        res.status(201).json(flavor);
    } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        // mapeamento body → coluna no banco
        const fieldMap = {
            name: 'name', description: 'description', price: 'price',
            costPrice: 'cost_price', category: 'category', available: 'available',
        };
        const sets = [];
        const values = [];
        let i = 1;
        for (const [bodyKey, dbCol] of Object.entries(fieldMap)) {
            if (req.body[bodyKey] !== undefined) {
                if (bodyKey === 'category' && !VALID_CATEGORIES.includes(req.body[bodyKey])) {
                    return res.status(400).json({ error: 'category inválida' });
                }
                if ((bodyKey === 'price' || bodyKey === 'costPrice') && !(req.body[bodyKey] >= 0)) {
                    return res.status(400).json({ error: `${bodyKey} inválido` });
                }
                sets.push(`${dbCol} = $${i++}`);
                values.push(req.body[bodyKey]);
            }
        }
        if (sets.length === 0) return res.status(400).json({ error: 'sem campos para atualizar' });
        values.push(id);

        const { rows } = await query(
            `UPDATE flavors SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            values
        );
        if (rows.length === 0) return res.status(404).json({ error: 'sabor não encontrado' });

        const flavor = normalize(rows[0]);
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
