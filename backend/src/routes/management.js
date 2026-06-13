const express = require('express');
const { query, withTx } = require('../db');

const router = express.Router();
const TZ = process.env.REPORT_TZ || 'America/Sao_Paulo';

const num = value => Number(value || 0);
const pct = (value, base) => base ? (value / base) * 100 : 0;
const deltaPct = (current, previous) => previous ? ((current - previous) / previous) * 100 : (current ? 100 : 0);

function normalizeIngredient(row) {
    return {
        id: row.id,
        name: row.name,
        unit: row.unit,
        costPerUnit: num(row.cost_per_unit),
        currentStock: num(row.current_stock),
        minimumStock: num(row.minimum_stock),
        lowStock: num(row.current_stock) <= num(row.minimum_stock),
        updatedAt: row.updated_at,
    };
}

function normalizeCampaign(row) {
    const investment = num(row.investment);
    const revenue = num(row.revenue_generated);
    return {
        id: row.id,
        name: row.name,
        channel: row.channel,
        investment,
        ordersGenerated: Number(row.orders_generated || 0),
        revenueGenerated: revenue,
        roi: investment > 0 ? ((revenue - investment) / investment) * 100 : 0,
        startDate: row.start_date,
        endDate: row.end_date,
        notes: row.notes,
    };
}

router.get('/ingredients', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM ingredients ORDER BY name');
        res.json(rows.map(normalizeIngredient));
    } catch (e) { next(e); }
});

router.post('/ingredients', async (req, res, next) => {
    try {
        const { name, unit = 'un', costPerUnit = 0, currentStock = 0, minimumStock = 0 } = req.body || {};
        if (!String(name || '').trim()) return res.status(400).json({ error: 'nome obrigatório' });
        const { rows } = await query(`
            INSERT INTO ingredients (name, unit, cost_per_unit, current_stock, minimum_stock)
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `, [String(name).trim(), String(unit).trim() || 'un', num(costPerUnit), num(currentStock), num(minimumStock)]);
        res.status(201).json(normalizeIngredient(rows[0]));
    } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'ingrediente já existe' });
        next(e);
    }
});

router.patch('/ingredients/:id', async (req, res, next) => {
    try {
        const allowed = {
            name: 'name', unit: 'unit', costPerUnit: 'cost_per_unit',
            currentStock: 'current_stock', minimumStock: 'minimum_stock',
        };
        const sets = [];
        const values = [];
        for (const [key, column] of Object.entries(allowed)) {
            if (req.body && req.body[key] !== undefined) {
                values.push(['costPerUnit', 'currentStock', 'minimumStock'].includes(key) ? num(req.body[key]) : String(req.body[key]).trim());
                sets.push(`${column} = $${values.length}`);
            }
        }
        if (!sets.length) return res.status(400).json({ error: 'nenhum campo informado' });
        values.push(req.params.id);
        const { rows } = await query(
            `UPDATE ingredients SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING *`,
            values
        );
        if (!rows.length) return res.status(404).json({ error: 'ingrediente não encontrado' });
        res.json(normalizeIngredient(rows[0]));
    } catch (e) { next(e); }
});

router.delete('/ingredients/:id', async (req, res, next) => {
    try {
        const result = await query('DELETE FROM ingredients WHERE id = $1', [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ error: 'ingrediente não encontrado' });
        res.status(204).end();
    } catch (e) { next(e); }
});

router.post('/ingredients/:id/movements', async (req, res, next) => {
    try {
        const delta = num(req.body && req.body.delta);
        const reason = String((req.body && req.body.reason) || 'Ajuste manual').trim();
        if (!delta) return res.status(400).json({ error: 'quantidade deve ser diferente de zero' });
        const ingredient = await withTx(async client => {
            const updated = await client.query(
                'UPDATE ingredients SET current_stock = current_stock + $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                [delta, req.params.id]
            );
            if (!updated.rows.length) return null;
            await client.query(
                'INSERT INTO stock_movements (ingredient_id, delta, reason) VALUES ($1, $2, $3)',
                [req.params.id, delta, reason]
            );
            return updated.rows[0];
        });
        if (!ingredient) return res.status(404).json({ error: 'ingrediente não encontrado' });
        res.json(normalizeIngredient(ingredient));
    } catch (e) { next(e); }
});

router.get('/recipes', async (_req, res, next) => {
    try {
        const { rows } = await query(`
            SELECT f.id AS flavor_id, f.name AS flavor_name,
                   COALESCE(json_agg(json_build_object(
                       'ingredientId', i.id, 'name', i.name, 'unit', i.unit,
                       'quantity', fi.quantity, 'cost', fi.quantity * i.cost_per_unit
                   ) ORDER BY i.name) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS ingredients
            FROM flavors f
            LEFT JOIN flavor_ingredients fi ON fi.flavor_id = f.id
            LEFT JOIN ingredients i ON i.id = fi.ingredient_id
            GROUP BY f.id
            ORDER BY f.name
        `);
        res.json(rows.map(r => ({
            flavorId: r.flavor_id,
            flavorName: r.flavor_name,
            ingredients: r.ingredients.map(i => ({ ...i, quantity: num(i.quantity), cost: num(i.cost) })),
        })));
    } catch (e) { next(e); }
});

router.put('/recipes/:flavorId', async (req, res, next) => {
    try {
        const items = Array.isArray(req.body && req.body.ingredients) ? req.body.ingredients : [];
        await withTx(async client => {
            await client.query('DELETE FROM flavor_ingredients WHERE flavor_id = $1', [req.params.flavorId]);
            for (const item of items) {
                if (!(num(item.quantity) > 0)) continue;
                await client.query(`
                    INSERT INTO flavor_ingredients (flavor_id, ingredient_id, quantity)
                    VALUES ($1, $2, $3)
                `, [req.params.flavorId, item.ingredientId, num(item.quantity)]);
            }
        });
        res.status(204).end();
    } catch (e) { next(e); }
});

router.get('/campaigns', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM campaigns ORDER BY start_date DESC, id DESC');
        res.json(rows.map(normalizeCampaign));
    } catch (e) { next(e); }
});

router.post('/campaigns', async (req, res, next) => {
    try {
        const b = req.body || {};
        if (!String(b.name || '').trim()) return res.status(400).json({ error: 'nome obrigatório' });
        const { rows } = await query(`
            INSERT INTO campaigns (name, channel, investment, orders_generated, revenue_generated, start_date, end_date, notes)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6::date, CURRENT_DATE), $7::date, $8)
            RETURNING *
        `, [String(b.name).trim(), b.channel || '', num(b.investment), Number(b.ordersGenerated || 0),
            num(b.revenueGenerated), b.startDate || null, b.endDate || null, b.notes || '']);
        res.status(201).json(normalizeCampaign(rows[0]));
    } catch (e) { next(e); }
});

router.delete('/campaigns/:id', async (req, res, next) => {
    try {
        const result = await query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
        if (!result.rowCount) return res.status(404).json({ error: 'campanha não encontrada' });
        res.status(204).end();
    } catch (e) { next(e); }
});

router.get('/goals', async (_req, res, next) => {
    try {
        const { rows } = await query('SELECT * FROM monthly_goals ORDER BY month DESC');
        res.json(rows.map(r => ({
            id: r.id, month: r.month, revenueTarget: num(r.revenue_target),
            profitTarget: num(r.profit_target), ordersTarget: Number(r.orders_target),
        })));
    } catch (e) { next(e); }
});

router.put('/goals/:month', async (req, res, next) => {
    try {
        const b = req.body || {};
        const month = `${req.params.month.slice(0, 7)}-01`;
        const { rows } = await query(`
            INSERT INTO monthly_goals (month, revenue_target, profit_target, orders_target)
            VALUES ($1::date, $2, $3, $4)
            ON CONFLICT (month) DO UPDATE SET
                revenue_target = EXCLUDED.revenue_target,
                profit_target = EXCLUDED.profit_target,
                orders_target = EXCLUDED.orders_target,
                updated_at = NOW()
            RETURNING *
        `, [month, num(b.revenueTarget), num(b.profitTarget), Number(b.ordersTarget || 0)]);
        res.json({
            id: rows[0].id, month: rows[0].month, revenueTarget: num(rows[0].revenue_target),
            profitTarget: num(rows[0].profit_target), ordersTarget: Number(rows[0].orders_target),
        });
    } catch (e) { next(e); }
});

async function periodSummary(fromSql, toSql) {
    const { rows: [r] } = await query(`
        WITH scoped AS (
            SELECT *, COALESCE((delivered_at AT TIME ZONE '${TZ}')::date, (created_at AT TIME ZONE '${TZ}')::date) AS sale_date
            FROM orders WHERE status = 'Entregue'
        )
        SELECT COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::numeric AS revenue,
               COUNT(DISTINCT COALESCE(NULLIF(phone, ''), customer))::int AS customers
        FROM scoped WHERE sale_date BETWEEN ${fromSql} AND ${toSql}
    `);
    return { orders: r.orders, revenue: num(r.revenue), customers: r.customers, ticket: r.orders ? num(r.revenue) / r.orders : 0 };
}

router.get('/analytics', async (_req, res, next) => {
    try {
        const currentMonth = await periodSummary("date_trunc('month', CURRENT_DATE)::date", 'CURRENT_DATE');
        const previousMonth = await periodSummary(
            "(date_trunc('month', CURRENT_DATE) - INTERVAL '1 month')::date",
            "(date_trunc('month', CURRENT_DATE) - INTERVAL '1 day')::date"
        );
        const today = await periodSummary('CURRENT_DATE', 'CURRENT_DATE');
        const yesterday = await periodSummary("CURRENT_DATE - INTERVAL '1 day'", "CURRENT_DATE - INTERVAL '1 day'");
        const thisWeek = await periodSummary("date_trunc('week', CURRENT_DATE)::date", 'CURRENT_DATE');
        const previousWeek = await periodSummary(
            "(date_trunc('week', CURRENT_DATE) - INTERVAL '1 week')::date",
            "(date_trunc('week', CURRENT_DATE) - INTERVAL '1 day')::date"
        );

        const [daily, weekly, monthly, weekdays, ticketsByChannel, topCustomers, flavorStats, marketing, financial, marginMonthly, customers, campaigns, goalRows, stockRows] = await Promise.all([
            query(`
                WITH days AS (
                    SELECT generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, '1 day')::date AS sale_day
                )
                SELECT d.sale_day, COALESCE(SUM(o.total), 0)::numeric revenue, COUNT(o.id)::int orders
                FROM days d LEFT JOIN orders o ON o.status='Entregue'
                  AND COALESCE((o.delivered_at AT TIME ZONE '${TZ}')::date, (o.created_at AT TIME ZONE '${TZ}')::date)=d.sale_day
                GROUP BY d.sale_day ORDER BY d.sale_day
            `),
            query(`
                WITH weeks AS (
                    SELECT generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '11 weeks', date_trunc('week', CURRENT_DATE), '1 week')::date AS week_start
                )
                SELECT w.week_start, COALESCE(SUM(o.total), 0)::numeric revenue, COUNT(o.id)::int orders
                FROM weeks w LEFT JOIN orders o ON o.status='Entregue'
                  AND date_trunc('week', COALESCE(o.delivered_at, o.created_at) AT TIME ZONE '${TZ}')::date=w.week_start
                GROUP BY w.week_start ORDER BY w.week_start
            `),
            query(`
                WITH months AS (
                    SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), '1 month')::date AS month_start
                )
                SELECT m.month_start, COALESCE(SUM(o.total), 0)::numeric revenue, COUNT(o.id)::int orders
                FROM months m LEFT JOIN orders o ON o.status='Entregue'
                  AND date_trunc('month', COALESCE(o.delivered_at, o.created_at) AT TIME ZONE '${TZ}')::date=m.month_start
                GROUP BY m.month_start ORDER BY m.month_start
            `),
            query(`
                SELECT EXTRACT(ISODOW FROM COALESCE(delivered_at, created_at) AT TIME ZONE '${TZ}')::int weekday,
                       COUNT(*)::int orders, COALESCE(SUM(total),0)::numeric revenue
                FROM orders WHERE status='Entregue'
                  AND COALESCE(delivered_at, created_at) >= CURRENT_DATE - INTERVAL '90 days'
                GROUP BY weekday ORDER BY weekday
            `),
            query(`
                SELECT COALESCE(NULLIF(source,''),'Não informado') channel, COUNT(*)::int orders,
                       COALESCE(SUM(total),0)::numeric revenue
                FROM orders WHERE status='Entregue'
                GROUP BY channel ORDER BY revenue DESC
            `),
            query(`
                SELECT MAX(customer) name, COALESCE(NULLIF(phone,''), customer) customer_key,
                       COUNT(*)::int orders, COALESCE(SUM(total),0)::numeric spent, MAX(created_at) last_buy
                FROM orders WHERE status <> 'Cancelado'
                GROUP BY COALESCE(NULLIF(phone,''), customer)
                ORDER BY spent DESC LIMIT 20
            `),
            query(`
                SELECT oi.name, COALESCE(f.category,'Outros') category, SUM(oi.quantity)::int quantity,
                       COALESCE(SUM(oi.quantity*oi.price),0)::numeric revenue,
                       COALESCE(SUM(oi.quantity*(oi.price-COALESCE(f.cost_price,0))),0)::numeric profit,
                       CASE WHEN SUM(oi.quantity*oi.price)>0 THEN
                           SUM(oi.quantity*(oi.price-COALESCE(f.cost_price,0)))/SUM(oi.quantity*oi.price)*100 ELSE 0 END::numeric margin
                FROM order_items oi JOIN orders o ON o.id=oi.order_id
                LEFT JOIN flavors f ON f.id=oi.flavor_id
                WHERE o.status='Entregue'
                GROUP BY oi.name, f.category
            `),
            query(`
                SELECT COALESCE(NULLIF(source,''),'Não informado') source, COUNT(*)::int orders,
                       COALESCE(SUM(total),0)::numeric revenue
                FROM orders WHERE status <> 'Cancelado'
                  AND created_at >= date_trunc('month', CURRENT_DATE)
                GROUP BY source ORDER BY revenue DESC
            `),
            query(`
                WITH rev AS (
                    SELECT COALESCE(SUM(total),0)::numeric revenue,
                           COALESCE(SUM(delivery_fee_cost),0)::numeric delivery,
                           COALESCE(SUM(total * CASE WHEN payment IN ('Cartão de Débito','Cartão de Crédito') THEN .0057 WHEN payment='Crédito 12x' THEN .0797 ELSE 0 END),0)::numeric fees
                    FROM orders WHERE status='Entregue'
                      AND COALESCE((delivered_at AT TIME ZONE '${TZ}')::date,(created_at AT TIME ZONE '${TZ}')::date)>=date_trunc('month',CURRENT_DATE)::date
                ), cogs AS (
                    SELECT COALESCE(SUM(oi.quantity*COALESCE(f.cost_price,0)),0)::numeric value
                    FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN flavors f ON f.id=oi.flavor_id
                    WHERE o.status='Entregue' AND COALESCE((o.delivered_at AT TIME ZONE '${TZ}')::date,(o.created_at AT TIME ZONE '${TZ}')::date)>=date_trunc('month',CURRENT_DATE)::date
                ), exp AS (
                    SELECT COALESCE(SUM(e.amount),0)::numeric operational,
                           COALESCE(SUM(e.amount) FILTER (WHERE lower(c.name) LIKE '%embalag%'),0)::numeric packaging,
                           COALESCE(SUM(e.amount) FILTER (WHERE lower(c.name) LIKE '%marketing%' OR lower(c.name) LIKE '%divulga%'),0)::numeric marketing
                    FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id
                    WHERE e.date>=date_trunc('month',CURRENT_DATE)::date
                )
                SELECT * FROM rev CROSS JOIN cogs CROSS JOIN exp
            `),
            query(`
                WITH months AS (
                    SELECT generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months', date_trunc('month', CURRENT_DATE), '1 month')::date AS month_start
                ), rev AS (
                    SELECT date_trunc('month', COALESCE(delivered_at, created_at) AT TIME ZONE '${TZ}')::date AS month_start,
                           SUM(total)::numeric AS revenue, SUM(delivery_fee_cost)::numeric AS delivery,
                           SUM(total * CASE WHEN payment IN ('Cartão de Débito','Cartão de Crédito') THEN .0057 WHEN payment='Crédito 12x' THEN .0797 ELSE 0 END)::numeric AS fees
                    FROM orders WHERE status='Entregue'
                    GROUP BY 1
                ), cogs AS (
                    SELECT date_trunc('month', COALESCE(o.delivered_at, o.created_at) AT TIME ZONE '${TZ}')::date AS month_start,
                           SUM(oi.quantity * COALESCE(f.cost_price,0))::numeric AS value
                    FROM order_items oi JOIN orders o ON o.id=oi.order_id LEFT JOIN flavors f ON f.id=oi.flavor_id
                    WHERE o.status='Entregue' GROUP BY 1
                ), exp AS (
                    SELECT date_trunc('month', date)::date AS month_start, SUM(amount)::numeric AS value
                    FROM expenses GROUP BY 1
                )
                SELECT m.month_start, COALESCE(r.revenue,0)::numeric revenue,
                       (COALESCE(r.revenue,0)-COALESCE(c.value,0)-COALESCE(e.value,0)-COALESCE(r.delivery,0)-COALESCE(r.fees,0))::numeric profit
                FROM months m LEFT JOIN rev r USING(month_start) LEFT JOIN cogs c USING(month_start) LEFT JOIN exp e USING(month_start)
                ORDER BY m.month_start
            `),
            query(`
                WITH customer_orders AS (
                    SELECT COALESCE(NULLIF(phone,''),customer) customer_key, MIN(created_at)::date first_buy,
                           COUNT(*)::int orders, COALESCE(SUM(total),0)::numeric spent
                    FROM orders WHERE status <> 'Cancelado'
                    GROUP BY customer_key
                )
                SELECT COUNT(*)::int total,
                       COUNT(*) FILTER (WHERE first_buy>=date_trunc('month',CURRENT_DATE)::date)::int new_customers,
                       COUNT(*) FILTER (WHERE orders>1)::int recurring,
                       COALESCE(AVG(orders),0)::numeric frequency,
                       COALESCE(AVG(spent),0)::numeric ltv
                FROM customer_orders
            `),
            query('SELECT * FROM campaigns ORDER BY start_date DESC'),
            query("SELECT * FROM monthly_goals WHERE month=date_trunc('month',CURRENT_DATE)::date LIMIT 1"),
            query('SELECT * FROM ingredients ORDER BY current_stock <= minimum_stock DESC, name'),
        ]);

        const fin = financial.rows[0] || {};
        const revenue = num(fin.revenue);
        const cogs = num(fin.value);
        const operational = num(fin.operational);
        const packaging = num(fin.packaging);
        const delivery = num(fin.delivery);
        const marketingCost = num(fin.marketing);
        const operationalOther = Math.max(0, operational - packaging - marketingCost);
        const fees = num(fin.fees);
        const netProfit = revenue - cogs - operational - delivery - fees;
        const customerData = customers.rows[0] || {};
        const goal = goalRows.rows[0] || {};
        const campaignList = campaigns.rows.map(normalizeCampaign);
        const campaignInvestment = campaignList.reduce((a, c) => a + c.investment, 0);
        const flavorList = flavorStats.rows.map(r => ({
            name: r.name, category: r.category, quantity: r.quantity, revenue: num(r.revenue),
            profit: num(r.profit), margin: num(r.margin),
        }));
        const dayNames = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
        const weekdayList = dayNames.map((name, i) => {
            const row = weekdays.rows.find(r => r.weekday === i + 1) || {};
            return { name, orders: Number(row.orders || 0), revenue: num(row.revenue) };
        });
        const bestDay = [...weekdayList].sort((a, b) => b.revenue - a.revenue)[0];
        const topFlavor = [...flavorList].sort((a, b) => b.profit - a.profit)[0];
        const elapsedDays = new Date().getDate();
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const revenueForecast = elapsedDays ? currentMonth.revenue / elapsedDays * daysInMonth : 0;
        const profitForecast = revenue ? netProfit / elapsedDays * daysInMonth : 0;
        const ordersForecast = elapsedDays ? currentMonth.orders / elapsedDays * daysInMonth : 0;
        const recurring = Number(customerData.recurring || 0);
        const totalCustomers = Number(customerData.total || 0);
        const newCustomers = Number(customerData.new_customers || 0);

        const comparisons = [
            { label: 'Hoje vs Ontem', current: today, previous: yesterday },
            { label: 'Esta semana vs Semana anterior', current: thisWeek, previous: previousWeek },
            { label: 'Este mês vs Mês anterior', current: currentMonth, previous: previousMonth },
        ].map(c => ({ ...c, revenueDelta: deltaPct(c.current.revenue, c.previous.revenue), ordersDelta: deltaPct(c.current.orders, c.previous.orders) }));

        const insights = [];
        if (bestDay && bestDay.orders) insights.push(`Seu melhor dia é ${bestDay.name.toLowerCase()}, com ${bestDay.orders} pedidos no histórico recente.`);
        if (topFlavor) insights.push(`${topFlavor.name} é o sabor com maior lucro acumulado (${topFlavor.margin.toFixed(1)}% de margem).`);
        const leadingSource = marketing.rows[0];
        if (leadingSource && currentMonth.orders) insights.push(`${leadingSource.source} lidera as vendas do mês com ${leadingSource.orders} pedidos.`);
        const ticketChange = deltaPct(currentMonth.ticket, previousMonth.ticket);
        if (previousMonth.ticket) insights.push(`Seu ticket médio ${ticketChange >= 0 ? 'subiu' : 'caiu'} ${Math.abs(ticketChange).toFixed(1)}% neste mês.`);
        if (stockRows.rows.some(r => num(r.current_stock) <= num(r.minimum_stock))) insights.push('Existem ingredientes abaixo ou no estoque mínimo que precisam de reposição.');

        res.json({
            generatedAt: new Date().toISOString(),
            kpis: {
                revenue: currentMonth.revenue, profit: netProfit, ticket: currentMonth.ticket,
                orders: currentMonth.orders, customers: currentMonth.customers, newCustomers,
                recurringCustomers: recurring, growth: deltaPct(currentMonth.revenue, previousMonth.revenue),
                revenueGoalProgress: pct(currentMonth.revenue, num(goal.revenue_target)),
            },
            comparisons,
            sales: {
                daily: daily.rows.map(r => ({ date: r.sale_day, revenue: num(r.revenue), orders: r.orders })),
                weekly: weekly.rows.map(r => ({ date: r.week_start, revenue: num(r.revenue), orders: r.orders })),
                monthly: monthly.rows.map(r => ({ date: r.month_start, revenue: num(r.revenue), orders: r.orders })),
                weekdays: weekdayList,
            },
            tickets: {
                general: currentMonth.ticket,
                monthly: monthly.rows.map(r => ({ date: r.month_start, ticket: r.orders ? num(r.revenue) / r.orders : 0 })),
                byChannel: ticketsByChannel.rows.map(r => ({ channel: r.channel, orders: r.orders, revenue: num(r.revenue), ticket: r.orders ? num(r.revenue) / r.orders : 0 })),
            },
            customers: {
                total: totalCustomers, new: newCustomers, recurring,
                retentionRate: pct(recurring, totalCustomers),
                averageFrequency: num(customerData.frequency),
                ltv: num(customerData.ltv),
                ranking: topCustomers.rows.map(r => ({ name: r.name, orders: r.orders, spent: num(r.spent), lastBuy: r.last_buy })),
            },
            products: {
                top: [...flavorList].sort((a, b) => b.quantity - a.quantity).slice(0, 10),
                bottom: [...flavorList].filter(x => x.quantity > 0).sort((a, b) => a.quantity - b.quantity).slice(0, 10),
                highestMargin: [...flavorList].sort((a, b) => b.margin - a.margin).slice(0, 10),
                lowestMargin: [...flavorList].sort((a, b) => a.margin - b.margin).slice(0, 10),
                combos: [...flavorList].filter(x => /combo/i.test(x.name) || /combo/i.test(x.category)).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
            },
            financial: {
                grossRevenue: revenue, cogs, operationalExpenses: operationalOther,
                packaging, delivery, marketing: marketingCost, fees, netProfit,
                margin: pct(netProfit, revenue),
                marginEvolution: marginMonthly.rows.map(r => ({ date: r.month_start, margin: pct(num(r.profit), num(r.revenue)) })),
            },
            marketing: marketing.rows.map(r => ({
                source: r.source, orders: r.orders, revenue: num(r.revenue),
                ticket: r.orders ? num(r.revenue) / r.orders : 0, conversion: null,
            })),
            campaigns: campaignList,
            goals: {
                month: goal.month || new Date().toISOString().slice(0, 7) + '-01',
                revenue: { target: num(goal.revenue_target), current: currentMonth.revenue, progress: pct(currentMonth.revenue, num(goal.revenue_target)) },
                profit: { target: num(goal.profit_target), current: netProfit, progress: pct(netProfit, num(goal.profit_target)) },
                orders: { target: Number(goal.orders_target || 0), current: currentMonth.orders, progress: pct(currentMonth.orders, Number(goal.orders_target || 0)) },
            },
            insights,
            forecast: { revenue: revenueForecast, profit: profitForecast, orders: Math.round(ordersForecast) },
            strategic: {
                ticket: currentMonth.ticket,
                cac: newCustomers ? campaignInvestment / newCustomers : 0,
                ltv: num(customerData.ltv),
                repurchaseRate: pct(recurring, totalCustomers),
                netMargin: pct(netProfit, revenue),
                monthlyGrowth: deltaPct(currentMonth.revenue, previousMonth.revenue),
                campaignRoi: campaignInvestment ? pct(campaignList.reduce((a, c) => a + c.revenueGenerated, 0) - campaignInvestment, campaignInvestment) : 0,
                activeCustomers: currentMonth.customers,
            },
            stock: stockRows.rows.map(normalizeIngredient),
        });
    } catch (e) { next(e); }
});

router.get('/export.csv', async (req, res, next) => {
    try {
        const from = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : null;
        const to = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.to || '')) ? req.query.to : null;
        const { rows } = await query(`
            SELECT COALESCE((delivered_at AT TIME ZONE '${TZ}')::date,(created_at AT TIME ZONE '${TZ}')::date) date,
                   id, customer, phone, source, payment, total
            FROM orders
            WHERE status='Entregue'
              AND ($1::date IS NULL OR COALESCE((delivered_at AT TIME ZONE '${TZ}')::date,(created_at AT TIME ZONE '${TZ}')::date) >= $1::date)
              AND ($2::date IS NULL OR COALESCE((delivered_at AT TIME ZONE '${TZ}')::date,(created_at AT TIME ZONE '${TZ}')::date) <= $2::date)
            ORDER BY date DESC, id DESC
        `, [from, to]);
        const esc = value => `"${String(value == null ? '' : value).replace(/"/g, '""')}"`;
        const csv = ['data;pedido;cliente;telefone;origem;pagamento;total']
            .concat(rows.map(r => [String(r.date).slice(0, 10), r.id, esc(r.customer), esc(r.phone), esc(r.source), esc(r.payment), num(r.total).toFixed(2).replace('.', ',')].join(';')))
            .join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="gestao_vendas.csv"');
        res.send('\ufeff' + csv);
    } catch (e) { next(e); }
});

module.exports = router;
