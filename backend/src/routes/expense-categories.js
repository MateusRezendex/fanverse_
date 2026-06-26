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
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'nome obrigatório' });
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

router.patch('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        const { name, icon, color } = req.body || {};
        const sets = [];
        const params = [];
        let i = 1;

        if (name !== undefined) {
            if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name inválido' });
            sets.push(`name = $${i++}`); params.push(name.trim());
        }
        if (icon !== undefined) {
            if (!icon || typeof icon !== 'string') return res.status(400).json({ error: 'icon inválido' });
            sets.push(`icon = $${i++}`); params.push(icon.trim());
        }
        if (color !== undefined) {
            if (!color || typeof color !== 'string') return res.status(400).json({ error: 'color inválido' });
            sets.push(`color = $${i++}`); params.push(color.trim());
        }

        if (sets.length === 0) return res.status(400).json({ error: 'sem campos para atualizar' });
        params.push(id);

        const { rows } = await query(
            `UPDATE expense_categories SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'categoria não encontrada' });
        const cat = normalize(rows[0]);
        broadcast('expense-category:updated', cat);
        res.json(cat);
    } catch (e) {
        if (e && e.code === '23505') return res.status(409).json({ error: 'categoria já existe' });
        next(e);
    }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        const existing = await query('SELECT id, is_fixed FROM expense_categories WHERE id = $1', [id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'categoria não encontrada' });
        if (existing.rows[0].is_fixed) return res.status(403).json({ error: 'categoria fixa não pode ser removida' });

        const { rowCount } = await query('DELETE FROM expense_categories WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'categoria não encontrada' });
        broadcast('expense-category:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;
