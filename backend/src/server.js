require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');

const flavorsRouter             = require('./routes/flavors');
const ordersRouter              = require('./routes/orders');
const whatsappRouter            = require('./routes/whatsapp');
const expensesRouter            = require('./routes/expenses');
const expenseCategoriesRouter   = require('./routes/expense-categories');
const recurringExpensesRouter   = require('./routes/recurring-expenses');
const reportsRouter             = require('./routes/reports');
const neighborhoodsRouter       = require('./routes/neighborhoods');
const costsRouter               = require('./routes/costs');
const internalConsumptionRouter = require('./routes/internal-consumption');
const managementRouter          = require('./routes/management');
const { pool }                  = require('./db');
const ws = require('./ws');

const PORT = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();

app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '256kb' }));

// Health-check
app.get('/api/health', async (_req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, database: 'up', ts: Date.now() });
    } catch (err) {
        console.error('[health] banco indisponivel:', err.message);
        res.status(503).json({ ok: false, database: 'down', ts: Date.now() });
    }
});

// API
app.use('/api/flavors',             flavorsRouter);
app.use('/api/orders',              ordersRouter);
app.use('/api/expenses',            expensesRouter);
app.use('/api/expense-categories',  expenseCategoriesRouter);
app.use('/api/recurring-expenses',  recurringExpensesRouter);
app.use('/api/reports',             reportsRouter);
app.use('/api/neighborhoods',       neighborhoodsRouter);
app.use('/api/costs',               costsRouter);
app.use('/api/internal-consumption', internalConsumptionRouter);
app.use('/api/management',           managementRouter);

// Webhook do WhatsApp (agnóstico de provedor)
app.use('/webhook/whatsapp', whatsappRouter);

// Servir o frontend estático (HTMLs + js/). Em container, FRONTEND_DIR vem do env;
// em dev local, cai no diretório pai do backend.
const FRONTEND_DIR = process.env.FRONTEND_DIR
    ? path.resolve(process.env.FRONTEND_DIR)
    : path.resolve(__dirname, '..', '..');
app.use(express.static(FRONTEND_DIR, {
    index: 'index.html',
    extensions: ['html'],
}));

// 404 para chamadas /api/* não casadas
app.use('/api', (_req, res) => res.status(404).json({ error: 'rota não encontrada' }));

// Tratamento global de erros
app.use((err, _req, res, _next) => {
    console.error('[error]', err);
    const body = { error: 'erro interno' };
    if (process.env.NODE_ENV !== 'production') body.detail = err.message;
    res.status(500).json(body);
});

const server = http.createServer(app);
ws.attach(server, '/ws');

server.listen(PORT, async () => {
    console.log(`✔  servidor pronto em http://localhost:${PORT}`);
    console.log(`   API:        http://localhost:${PORT}/api`);
    console.log(`   WebSocket:  ws://localhost:${PORT}/ws`);
    console.log(`   Frontend:   servindo ${FRONTEND_DIR}`);

    // Gera despesas recorrentes que ainda não foram lançadas neste mês
    try {
        const r = await fetch(`http://localhost:${PORT}/api/recurring-expenses/run`, { method: 'POST' })
            .then(x => x.json())
            .catch(() => null);
        if (r && r.generated > 0) console.log(`   Recorrentes: ${r.generated} despesa(s) gerada(s) neste boot.`);
    } catch (_) { /* silencioso */ }
});

let shuttingDown = false;
function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} recebido; encerrando conexoes...`);

    const forceExit = setTimeout(() => {
        console.error('[shutdown] tempo limite excedido.');
        process.exit(1);
    }, 10000);
    forceExit.unref();

    server.close(async (err) => {
        try {
            await pool.end();
        } catch (poolErr) {
            console.error('[shutdown] falha ao fechar PostgreSQL:', poolErr);
        }
        if (err) console.error('[shutdown] falha ao fechar servidor:', err);
        process.exit(err ? 1 : 0);
    });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
