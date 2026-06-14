const baseUrl = (process.env.BASE_URL || process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');

const paths = [
    '/api/health',
    '/api/flavors',
    '/api/orders',
    '/api/neighborhoods',
    '/api/costs',
    '/api/expenses',
    '/api/expense-categories',
    '/api/recurring-expenses',
    '/api/internal-consumption',
    '/api/reports/profit',
    '/api/management/analytics',
    '/',
    '/pedidos.html',
    '/cozinha.html',
    '/sabores.html',
    '/clientes.html',
    '/relatorios.html',
    '/financeiro.html',
    '/gestao.html',
    '/js/db.js',
    '/js/sidebar.js',
];

async function run() {
    let failed = false;
    for (const route of paths) {
        try {
            const response = await fetch(baseUrl + route);
            console.log(`${response.status} ${route}`);
            if (!response.ok) failed = true;
        } catch (err) {
            failed = true;
            console.error(`FAIL ${route}: ${err.message}`);
        }
    }
    if (failed) process.exitCode = 1;
}

run();
