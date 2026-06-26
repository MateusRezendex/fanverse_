const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
    return {
        id: row.id,
        categoryId: row.category_id,
        description: row.description,
        amount: Number(row.amount),
        dayOfMonth: row.day_of_month,
        active: row.active,
        lastGenerated: row.last_generated,
    };
}

router.get('/', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM recurring_expenses ORDER BY day_of_month ASC');
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { categoryId, description, amount, dayOfMonth, active = true } = req.body || {};
        if (!description || typeof description !== 'string') return res.status(400).json({ error: 'descrição obrigatória' });
        if (!(amount >= 0))                                  return res.status(400).json({ error: 'amount inválido' });
        if (!(dayOfMonth >= 1 && dayOfMonth <= 28))          return res.status(400).json({ error: 'dayOfMonth deve estar entre 1 e 28' });

        const { rows } = await query(
            `INSERT INTO recurring_expenses (category_id, description, amount, day_of_month, active)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [categoryId || null, description.trim(), amount, dayOfMonth, !!active]
        );
        const rec = normalize(rows[0]);
        broadcast('recurring-expense:created', rec);
        res.status(201).json(rec);
    } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const map = { categoryId: 'category_id', description: 'description', amount: 'amount', dayOfMonth: 'day_of_month', active: 'active' };
        const sets = []; const params = []; let i = 1;
        for (const [k, col] of Object.entries(map)) {
            if (req.body[k] !== undefined) {
                sets.push(`${col} = $${i++}`); params.push(req.body[k]);
            }
        }
        if (sets.length === 0) return res.status(400).json({ error: 'sem campos para atualizar' });
        params.push(id);
        const { rows } = await query(`UPDATE recurring_expenses SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
        if (rows.length === 0) return res.status(404).json({ error: 'recorrente não encontrada' });
        const rec = normalize(rows[0]);
        broadcast('recurring-expense:updated', rec);
        res.json(rec);
    } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id, 10);
        const { rowCount } = await query('DELETE FROM recurring_expenses WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'recorrente não encontrada' });
        broadcast('recurring-expense:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

// POST /run — gera expenses para todas as recorrentes que ainda não foram lançadas
// neste mês e cuja day_of_month já passou. Idempotente: pode ser chamado várias vezes.
router.post('/run', async (_req, res, next) => {
    try {
        const created = await withTx(async (client) => {
            const today = new Date();
            const yyyymm = today.toISOString().slice(0, 7); // "2026-05"
            const todayDay = today.getDate();

            const { rows: recurrings } = await client.query('SELECT * FROM recurring_expenses WHERE active = TRUE');
            const result = [];
            for (const r of recurrings) {
                if (r.day_of_month > todayDay) continue;
                if (r.last_generated && r.last_generated.toISOString().slice(0, 7) === yyyymm) continue;

                const scheduledDate = `${yyyymm}-${String(r.day_of_month).padStart(2, '0')}`;
                const { rows: [exp] } = await client.query(
                    `INSERT INTO expenses (category_id, description, amount, date, source)
                     VALUES ($1, $2, $3, $4, 'recurring') RETURNING *`,
                    [r.category_id, r.description, r.amount, scheduledDate]
                );
                await client.query('UPDATE recurring_expenses SET last_generated = $1 WHERE id = $2', [scheduledDate, r.id]);
                result.push(exp);
            }
            return result;
        });
        created.forEach(exp => broadcast('expense:created', {
            id: exp.id, categoryId: exp.category_id, description: exp.description,
            amount: Number(exp.amount), date: exp.date, createdAt: exp.created_at, source: exp.source,
        }));
        res.json({ generated: created.length });
    } catch (e) { next(e); }
});

module.exports = router;
