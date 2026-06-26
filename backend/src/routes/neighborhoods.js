const express = require('express');
const { query } = require('../db');
const { broadcast } = require('../ws');

const router = express.Router();

function normalize(row) {
    return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
    };
}

router.get('/', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM neighborhoods ORDER BY LOWER(name) ASC, id ASC');
        res.json(rows.map(normalize));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const { name } = req.body || {};
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'nome obrigatório' });
        const trimmed = name.trim();
        if (!trimmed) return res.status(400).json({ error: 'nome obrigatório' });

        const { rows } = await query(
            `INSERT INTO neighborhoods (name)
             VALUES ($1)
             ON CONFLICT (LOWER(name)) DO UPDATE SET name = EXCLUDED.name
             RETURNING *`,
            [trimmed]
        );
        const n = normalize(rows[0]);
        broadcast('neighborhood:created', n);
        res.status(201).json(n);
    } catch (e) { next(e); }
});

module.exports = router;
