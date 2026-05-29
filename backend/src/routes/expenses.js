const express = require('express');
const { query } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
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

router.get('/', async (req, res, next) => {
    try {
        const { from, to, category_id } = req.query || {};
        const where = [];
        const params = [];
        if (from)        { params.push(from);        where.push(`date >= $${params.length}`); }
        if (to)          { params.push(to);          where.push(`date <= $${params.length}`); }
        if (category_id) { params.push(category_id); where.push(`category_id = $${params.length}`); }
        const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
        const { rows } = await query(`SELECT * FROM expenses ${whereSql} ORDER BY date DESC, id DESC`, params);
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { categoryId, description = '', amount, date, source = 'manual' } = req.body || {};
        if (!(amount >= 0))                  return res.status(400).json({ error: 'amount inválido' });
        if (source !== 'manual' && source !== 'recurring') return res.status(400).json({ error: 'source inválido' });

        const { rows } = await query(
            `INSERT INTO expenses (category_id, description, amount, date, source)
             VALUES ($1, $2, $3, COALESCE($4, CURRENT_DATE), $5) RETURNING *`,
            [categoryId || null, String(description), amount, date || null, source]
        );
        const exp = normalize(rows[0]);
        broadcast('expense:created', exp);
        res.status(201).json(exp);
    } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });

        const map = { categoryId: 'category_id', description: 'description', amount: 'amount', date: 'date' };
        const sets = []; const params = []; let i = 1;
        for (const [k, col] of Object.entries(map)) {
            if (req.body[k] !== undefined) {
                if (k === 'amount' && !(req.body[k] >= 0)) return res.status(400).json({ error: 'amount inválido' });
                sets.push(`${col} = $${i++}`); params.push(req.body[k]);
            }
        }
        if (sets.length === 0) return res.status(400).json({ error: 'sem campos para atualizar' });
        params.push(id);

        const { rows } = await query(
            `UPDATE expenses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            params
        );
        if (rows.length === 0) return res.status(404).json({ error: 'despesa não encontrada' });
        const exp = normalize(rows[0]);
        broadcast('expense:updated', exp);
        res.json(exp);
    } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) return res.status(400).json({ error: 'id inválido' });
        const { rowCount } = await query('DELETE FROM expenses WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'despesa não encontrada' });
        broadcast('expense:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

module.exports = router;
