const express = require('express');
const { query } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
    return {
        id: row.id,
        name: row.name,
        icon: row.icon,
        color: row.color,
        isFixed: row.is_fixed,
    };
}

router.get('/', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM expense_categories ORDER BY is_fixed DESC, name ASC');
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { name, icon = 'circle', color = 'gray', isFixed = false } = req.body || {};
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name é obrigatório' });
        const { rows } = await query(
            `INSERT INTO expense_categories (name, icon, color, is_fixed)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (name) DO NOTHING
             RETURNING *`,
            [name.trim(), icon, color, !!isFixed]
        );
        if (rows.length === 0) return res.status(409).json({ error: 'categoria já existe' });
        const cat = normalize(rows[0]);
        broadcast('expense-category:created', cat);
        res.status(201).json(cat);
    } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
        const { rowCount } = await query('DELETE FROM expense_categories WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'categoria não encontrada' });
        broadcast('expense-category:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;
