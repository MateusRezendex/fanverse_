const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString || String(connectionString).trim() === '') {
    throw new Error('DATABASE_URL não definido (ex: postgres://postgres:postgres@localhost:5432/sabor)');
}

const pool = new Pool({
    connectionString,
});

pool.on('error', (err) => {
    console.error('[pg] erro inesperado no pool:', err);
});

async function query(text, params) {
    return pool.query(text, params);
}

async function withTx(fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { pool, query, withTx };
