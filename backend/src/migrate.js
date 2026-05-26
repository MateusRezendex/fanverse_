require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
    const dir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

    for (const file of files) {
        const sql = fs.readFileSync(path.join(dir, file), 'utf8');
        console.log(`▶  rodando ${file}...`);
        await pool.query(sql);
    }
    console.log('✔  migrations aplicadas com sucesso.');
    await pool.end();
}

run().catch(err => {
    console.error('✖  falha na migration:', err);
    process.exit(1);
});
