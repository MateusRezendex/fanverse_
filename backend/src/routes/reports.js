const express = require('express');
const { query } = require('../db');

const router = express.Router();

const REPORT_TZ = process.env.REPORT_TZ || 'America/Sao_Paulo';
const PAYMENT_FEE_RATES = {
    Pix: 0,
    'Cartão de Débito': 0.0057,
    'Cartão de Crédito': 0.0057,
    'Crédito 12x': 0.0797,
};

function isoDateInTz(date, timeZone) {
    // en-CA => YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

function addDaysIso(iso, days) {
    const [y, m, d] = String(iso).split('-').map(Number);
    const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + Number(days || 0)));
    return dt.toISOString().slice(0, 10);
}

function resolveRange({ period, from, to }) {
    if (from && to) return { fromDate: from, toDate: to };
    const toDate = isoDateInTz(new Date(), REPORT_TZ);

    if (period === 'today') return { fromDate: toDate, toDate };
    if (period === '7d')    return { fromDate: addDaysIso(toDate, -6), toDate };
    if (period === 'month') return { fromDate: toDate.slice(0, 8) + '01', toDate };

    return { fromDate: addDaysIso(toDate, -29), toDate };
}

// Calcula o intervalo "anterior" de mesma duração — janela imediatamente antes
function previousRange(fromDate, toDate) {
    const f = new Date(fromDate);
    const t = new Date(toDate);
    const days = Math.round((t - f) / 86400000) + 1;
    const prevTo   = new Date(f);   prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - (days - 1));
    return {
        fromDate: prevFrom.toISOString().slice(0, 10),
        toDate:   prevTo.toISOString().slice(0, 10),
    };
}

async function computeProfit(fromDate, toDate) {

        // RECEITA (apenas pedidos entregues)
        const revenueRow = (await query(`
            SELECT
                COALESCE(SUM(total), 0)::numeric AS gross,
                COUNT(*)::int AS orders_count
            FROM orders
            WHERE status = 'Entregue'
              AND COALESCE((delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
        `, [fromDate, toDate])).rows[0];

        const byPayment = (await query(`
            SELECT COALESCE(NULLIF(payment, ''), '—') AS payment,
                   COALESCE(SUM(total), 0)::numeric AS revenue
            FROM orders
            WHERE status = 'Entregue'
              AND COALESCE((delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
            GROUP BY payment
            ORDER BY revenue DESC
        `, [fromDate, toDate])).rows.map(r => ({ payment: r.payment, revenue: Number(r.revenue) }));

        // TAXAS DE PAGAMENTO (cartão etc.) — percentuais sobre o total do pedido (inclui entrega cobrada do cliente)
        const processingFeesRow = (await query(`
            SELECT COALESCE(SUM(
                total * CASE
                    WHEN payment = 'Cartão de Débito'  THEN 0.0057
                    WHEN payment = 'Cartão de Crédito' THEN 0.0057
                    WHEN payment = 'Crédito 12x'       THEN 0.0797
                    ELSE 0
                END
            ), 0)::numeric AS total
            FROM orders
            WHERE status = 'Entregue'
              AND COALESCE((delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
        `, [fromDate, toDate])).rows[0];

        // CPV — custo do produto vendido (qty * cost_price snapshot fica em order_items?
        // No nosso schema NÃO temos snapshot de cost_price. Vamos usar o cost_price atual do
        // flavor associado, com fallback para 0 se o flavor foi removido.
        const cogsRow = (await query(`
            SELECT COALESCE(SUM(oi.quantity * COALESCE(f.cost_price, 0)), 0)::numeric AS cogs
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            LEFT JOIN flavors f ON f.id = oi.flavor_id
            WHERE o.status = 'Entregue'
              AND COALESCE((o.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
        `, [fromDate, toDate])).rows[0];

        // DESPESAS
        const expensesRow = (await query(`
            SELECT COALESCE(SUM(amount), 0)::numeric AS total
            FROM expenses
            WHERE date BETWEEN $1::date AND $2::date
        `, [fromDate, toDate])).rows[0];

        // CUSTO DE ENTREGA (o que pagamos para a plataforma/terceiro)
        const deliveryCostRow = (await query(`
            SELECT COALESCE(SUM(delivery_fee_cost), 0)::numeric AS total
            FROM orders
            WHERE status = 'Entregue'
              AND COALESCE((delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
        `, [fromDate, toDate])).rows[0];

        const expensesByCategory = (await query(`
            SELECT c.id, c.name, c.icon, c.color, c.is_fixed,
                   COALESCE(SUM(e.amount), 0)::numeric AS total,
                   COUNT(e.id)::int AS count
            FROM expense_categories c
            LEFT JOIN expenses e
              ON e.category_id = c.id
             AND e.date BETWEEN $1::date AND $2::date
            GROUP BY c.id
            HAVING COUNT(e.id) > 0
            ORDER BY total DESC
        `, [fromDate, toDate])).rows.map(r => ({
            id: r.id, name: r.name, icon: r.icon, color: r.color, isFixed: r.is_fixed,
            total: Number(r.total), count: r.count,
        }));

        // PER-DAY (série temporal completa: receita, cpv, despesas, lucro)
        const perDay = (await query(`
            WITH days AS (
                SELECT generate_series($1::date, $2::date, INTERVAL '1 day')::date AS day
            ),
            rev AS (
                SELECT COALESCE((o.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS day,
                       COALESCE(SUM(o.total), 0)::numeric AS revenue,
                       COALESCE(SUM(oi.quantity * COALESCE(f.cost_price, 0)), 0)::numeric AS cogs,
                       COALESCE(SUM(o.delivery_fee_cost), 0)::numeric AS delivery_cost,
                       COALESCE(SUM(
                           o.total * CASE
                               WHEN o.payment = 'Cartão de Débito'  THEN 0.0057
                               WHEN o.payment = 'Cartão de Crédito' THEN 0.0057
                               WHEN o.payment = 'Crédito 12x'       THEN 0.0797
                               ELSE 0
                           END
                       ), 0)::numeric AS processing_fees
                FROM orders o
                LEFT JOIN order_items oi ON oi.order_id = o.id
                LEFT JOIN flavors f      ON f.id = oi.flavor_id
                WHERE o.status = 'Entregue'
                  AND COALESCE((o.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
                GROUP BY COALESCE((o.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date)
            ),
            exp AS (
                SELECT date AS day, COALESCE(SUM(amount), 0)::numeric AS expenses
                FROM expenses
                WHERE date BETWEEN $1::date AND $2::date
                GROUP BY date
            )
            SELECT days.day,
                   COALESCE(rev.revenue, 0)::numeric AS revenue,
                   COALESCE(rev.cogs, 0)::numeric AS cogs,
                   COALESCE(exp.expenses, 0)::numeric AS expenses,
                   COALESCE(rev.delivery_cost, 0)::numeric AS delivery_cost,
                   COALESCE(rev.processing_fees, 0)::numeric AS processing_fees
            FROM days
            LEFT JOIN rev ON rev.day = days.day
            LEFT JOIN exp ON exp.day = days.day
            ORDER BY days.day
        `, [fromDate, toDate])).rows.map(r => {
            const revenue = Number(r.revenue);
            const cogs = Number(r.cogs);
            const expensesOperational = Number(r.expenses);
            const deliveryCost = Number(r.delivery_cost);
            const processingFees = Number(r.processing_fees);
            const expenses = expensesOperational + deliveryCost + processingFees;
            return { day: r.day, revenue, cogs, expenses, profit: revenue - cogs - expenses };
        });

        // Margem por sabor (top 10) — útil para responder "que sabor dá lucro de verdade?"
        const flavorMargins = (await query(`
            SELECT f.id, f.name, f.price::numeric AS price, f.cost_price::numeric AS cost,
                   COALESCE(SUM(oi.quantity), 0)::int AS qty_sold,
                   COALESCE(SUM(oi.quantity * (oi.price - COALESCE(f.cost_price, 0))), 0)::numeric AS profit
            FROM flavors f
            LEFT JOIN order_items oi ON oi.flavor_id = f.id
            LEFT JOIN orders o ON o.id = oi.order_id
                              AND o.status = 'Entregue'
                              AND COALESCE((o.delivered_at AT TIME ZONE 'America/Sao_Paulo')::date, (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date) BETWEEN $1::date AND $2::date
            GROUP BY f.id
            ORDER BY profit DESC
            LIMIT 10
        `, [fromDate, toDate])).rows.map(r => {
            const price = Number(r.price), cost = Number(r.cost);
            return {
                id: r.id, name: r.name, price, cost,
                marginAbs: price - cost,
                marginPct: price > 0 ? ((price - cost) / price) * 100 : 0,
                qtySold: r.qty_sold,
                profit: Number(r.profit),
            };
        });

        const revenue = Number(revenueRow.gross);
        const cogs = Number(cogsRow.cogs);
        const expensesOperationalTotal = Number(expensesRow.total);
        const deliveryCostTotal = Number(deliveryCostRow.total);
        const processingFeesTotal = Number(processingFeesRow.total);
        const expensesTotal = expensesOperationalTotal + deliveryCostTotal + processingFeesTotal;
        const grossProfit = revenue - cogs;
        const netProfit = grossProfit - expensesTotal;
        const margin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

        return {
            period: { from: fromDate, to: toDate },
            revenue: { gross: revenue, ordersCount: revenueRow.orders_count, byPayment },
            cogs,
            expenses: {
                total: expensesTotal,
                operationalTotal: expensesOperationalTotal,
                deliveryCost: deliveryCostTotal,
                processingFees: processingFeesTotal,
                byCategory: expensesByCategory,
            },
            grossProfit,
            netProfit,
            margin,
            perDay,
            flavorMargins,
            paymentFeeRates: PAYMENT_FEE_RATES,
        };
}

router.get('/profit', async (req, res, next) => {
    try {
        const { fromDate, toDate } = resolveRange(req.query || {});
        const report = await computeProfit(fromDate, toDate);

        // Comparação com período anterior (mesma duração imediatamente antes)
        if (String(req.query.compare || '').toLowerCase() === 'true') {
            const prev = previousRange(fromDate, toDate);
            const previous = await computeProfit(prev.fromDate, prev.toDate);
            // Devolve só os agregados (não a série completa, pra payload menor)
            report.previous = {
                period: previous.period,
                revenue: { gross: previous.revenue.gross, ordersCount: previous.revenue.ordersCount },
                cogs: previous.cogs,
                expenses: { total: previous.expenses.total },
                grossProfit: previous.grossProfit,
                netProfit: previous.netProfit,
                margin: previous.margin,
            };
        }
        res.json(report);
    } catch (e) { next(e); }
});

// Exportação CSV — type=expenses | summary | flavors
router.get('/export.csv', async (req, res, next) => {
    try {
        const { fromDate, toDate } = resolveRange(req.query || {});
        const type = req.query.type || 'summary';

        let csv;
        let filename;

        if (type === 'expenses') {
            const rows = (await query(`
                SELECT e.date, c.name AS category, e.description, e.amount, e.source
                FROM expenses e
                LEFT JOIN expense_categories c ON c.id = e.category_id
                WHERE e.date BETWEEN $1::date AND $2::date
                ORDER BY e.date ASC, e.id ASC
            `, [fromDate, toDate])).rows;
            csv = 'data;categoria;descricao;valor;origem\n' +
                rows.map(r => [
                    toIsoDate(r.date),
                    csvEscape(r.category || '—'),
                    csvEscape(r.description || ''),
                    Number(r.amount).toFixed(2).replace('.', ','),
                    r.source,
                ].join(';')).join('\n');
            filename = `despesas_${fromDate}_${toDate}.csv`;

        } else if (type === 'flavors') {
            const report = await computeProfit(fromDate, toDate);
            csv = 'sabor;preco;custo;margem_pct;qty_vendida;lucro\n' +
                report.flavorMargins.map(f => [
                    csvEscape(f.name),
                    f.price.toFixed(2).replace('.', ','),
                    f.cost.toFixed(2).replace('.', ','),
                    f.marginPct.toFixed(1).replace('.', ','),
                    f.qtySold,
                    f.profit.toFixed(2).replace('.', ','),
                ].join(';')).join('\n');
            filename = `sabores_${fromDate}_${toDate}.csv`;

        } else { // summary
            const report = await computeProfit(fromDate, toDate);
            csv = 'data;receita;cpv;despesas;lucro\n' +
                report.perDay.map(d => [
                    toIsoDate(d.day),
                    d.revenue.toFixed(2).replace('.', ','),
                    d.cogs.toFixed(2).replace('.', ','),
                    d.expenses.toFixed(2).replace('.', ','),
                    d.profit.toFixed(2).replace('.', ','),
                ].join(';')).join('\n');
            filename = `resumo_${fromDate}_${toDate}.csv`;
        }

        // BOM utf-8 para Excel abrir com acento certo
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send('﻿' + csv);
    } catch (e) { next(e); }
});

function csvEscape(value) {
    const s = String(value == null ? '' : value);
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
}

function toIsoDate(d) {
    if (!d) return '';
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
}

module.exports = router;
