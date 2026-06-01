const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');
const whatsapp = require('../whatsapp');

const router = express.Router();

const VALID_STATUS = ['Pendente', 'Em Preparo', 'Pronto', 'Entregue', 'Cancelado'];

function normalizeItem(row) {
    return {
        flavorId: row.flavor_id,
        name: row.name,
        quantity: row.quantity,
        price: Number(row.price),
    };
}

function normalizeOrder(orderRow, itemRows) {
    const deliveryFeeCustomer = Number(orderRow.delivery_fee || 0);
    const deliveryFeeCost = Number(orderRow.delivery_fee_cost || 0);
    return {
        id: orderRow.id,
        customer: orderRow.customer,
        phone: orderRow.phone,
        address: orderRow.address,
        neighborhood: orderRow.neighborhood || '',
        payment: orderRow.payment,
        source: orderRow.source || '',
        referrer: orderRow.referrer || '',
        deliveryFee: deliveryFeeCustomer,
        deliveryFeeCustomer,
        deliveryFeeCost,
        discount: Number(orderRow.discount || 0),
        total: Number(orderRow.total),
        status: orderRow.status,
        notes: orderRow.notes,
        createdAt: orderRow.created_at,
        acceptedAt: orderRow.accepted_at,
        readyAt: orderRow.ready_at,
        deliveredAt: orderRow.delivered_at,
        items: itemRows.map(normalizeItem),
    };
}

async function loadOrderById(client, id) {
    const o = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (o.rows.length === 0) return null;
    const items = await client.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY id ASC', [id]
    );
    return normalizeOrder(o.rows[0], items.rows);
}

router.get('/', async (_req, res, next) => {
    try {
        const orders = (await query('SELECT * FROM orders ORDER BY created_at ASC')).rows;
        const items  = (await query('SELECT * FROM order_items ORDER BY id ASC')).rows;
        const byOrder = new Map();
        for (const it of items) {
            if (!byOrder.has(it.order_id)) byOrder.set(it.order_id, []);
            byOrder.get(it.order_id).push(it);
        }
        res.json(orders.map(o => normalizeOrder(o, byOrder.get(o.id) || [])));
    } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
    try {
        const {
            customer,
            phone = '',
            address = '',
            neighborhood = '',
            deliveryFeeCustomer,
            deliveryFeeCost = 0,
            deliveryFee = 0, // compat (v1): equivale ao que o cliente paga
            discount = 0,
            payment = '',
            source = '',
            referrer = '',
            notes = '',
            items = [],
            status = 'Pendente',
        } = req.body || {};
        if (!customer || typeof customer !== 'string')          return res.status(400).json({ error: 'customer obrigatório' });
        if (!Array.isArray(items) || items.length === 0)        return res.status(400).json({ error: 'items vazio' });
        if (!VALID_STATUS.includes(status))                     return res.status(400).json({ error: 'status inválido' });

        const feeCustomer = Number(deliveryFeeCustomer ?? deliveryFee);
        const feeCost = Number(deliveryFeeCost);
        const disc = Number(discount);
        if (!isFinite(disc) || disc < 0) return res.status(400).json({ error: 'discount inválido' });
        if (!isFinite(feeCustomer) || feeCustomer < 0) return res.status(400).json({ error: 'deliveryFeeCustomer inválido' });
        if (!isFinite(feeCost) || feeCost < 0) return res.status(400).json({ error: 'deliveryFeeCost inválido' });

        for (const it of items) {
            if (!it || !it.name || !(it.quantity > 0) || !(it.price >= 0)) {
                return res.status(400).json({ error: 'item inválido', item: it });
            }
        }
        const itemsTotal = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
        const total = Math.max(0, itemsTotal + feeCustomer - disc);

        const order = await withTx(async (client) => {
            const { rows: [idRow] } = await client.query("SELECT '#' || nextval('order_id_seq') AS id");
            const id = idRow.id;
            await client.query(
                `INSERT INTO orders (id, customer, phone, address, neighborhood, delivery_fee, delivery_fee_cost, discount, payment, source, referrer, total, status, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                [id, customer.trim(), phone, address, neighborhood, feeCustomer, feeCost, disc, payment, source, referrer, total, status, notes]
            );
            for (const it of items) {
                await client.query(
                    `INSERT INTO order_items (order_id, flavor_id, name, quantity, price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [id, it.flavorId ?? null, it.name, it.quantity, it.price]
                );
            }
            return loadOrderById(client, id);
        });

        broadcast('order:created', order);
        whatsapp.notifyOrderCreated(order).catch(e => console.error('[whatsapp] notify:', e));
        res.status(201).json(order);
    } catch (e) { next(e); }
});

router.patch('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const { customer, phone, address, neighborhood, deliveryFeeCustomer, deliveryFeeCost, deliveryFee, discount, payment, source, referrer, notes, status, items } = req.body || {};
        let previousStatus = null;

        if (status !== undefined && !VALID_STATUS.includes(status)) {
            return res.status(400).json({ error: 'status inválido' });
        }

        const rawFeeCustomer = (deliveryFeeCustomer !== undefined) ? deliveryFeeCustomer : deliveryFee;
        const feeCustomer = rawFeeCustomer !== undefined ? Number(rawFeeCustomer) : null;
        if (rawFeeCustomer !== undefined && (!isFinite(feeCustomer) || feeCustomer < 0)) {
            return res.status(400).json({ error: 'deliveryFeeCustomer inválido' });
        }

        const feeCost = deliveryFeeCost !== undefined ? Number(deliveryFeeCost) : null;
        if (deliveryFeeCost !== undefined && (!isFinite(feeCost) || feeCost < 0)) {
            return res.status(400).json({ error: 'deliveryFeeCost inválido' });
        }
        const disc = discount !== undefined ? Number(discount) : null;
        if (discount !== undefined && (!isFinite(disc) || disc < 0)) {
            return res.status(400).json({ error: 'discount inválido' });
        }

        if (items !== undefined) {
            if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'items vazio' });
            for (const it of items) {
                if (!it || !it.name || !(it.quantity > 0) || !(it.price >= 0)) {
                    return res.status(400).json({ error: 'item inválido', item: it });
                }
            }
        }

        const order = await withTx(async (client) => {
            const existing = await client.query('SELECT * FROM orders WHERE id = $1', [id]);
            if (existing.rows.length === 0) return null;
            previousStatus = existing.rows[0].status;

            const sets = [];
            const values = [];
            let i = 1;
            const pushSet = (col, val) => { sets.push(`${col} = $${i++}`); values.push(val); };

            if (customer     !== undefined) pushSet('customer', customer);
            if (phone        !== undefined) pushSet('phone', phone);
            if (address      !== undefined) pushSet('address', address);
            if (neighborhood !== undefined) pushSet('neighborhood', neighborhood);
            if (payment      !== undefined) pushSet('payment', payment);
            if (source       !== undefined) pushSet('source', source);
            if (referrer     !== undefined) pushSet('referrer', referrer);
            if (notes        !== undefined) pushSet('notes', notes);
            if (rawFeeCustomer !== undefined) pushSet('delivery_fee', feeCustomer);
            if (deliveryFeeCost !== undefined) pushSet('delivery_fee_cost', feeCost);
            if (discount     !== undefined) pushSet('discount', disc);
            if (status       !== undefined) {
                pushSet('status', status);
                const now = new Date();
                // Preenche timestamps de transição na primeira vez que o status atinge cada estágio
                if (status === 'Em Preparo' && !existing.rows[0].accepted_at) pushSet('accepted_at', now);
                if (status === 'Pronto'     && !existing.rows[0].ready_at)    pushSet('ready_at', now);
                if (status === 'Entregue')                                    pushSet('delivered_at', now);
                else if (previousStatus === 'Entregue')                       pushSet('delivered_at', null);
            }

            if (items !== undefined || rawFeeCustomer !== undefined || discount !== undefined) {
                const baseFeeCustomer = Number(existing.rows[0].delivery_fee || 0);
                const nextFeeCustomer = (rawFeeCustomer !== undefined) ? feeCustomer : baseFeeCustomer;

                const baseDisc = Number(existing.rows[0].discount || 0);
                const nextDisc = (discount !== undefined) ? disc : baseDisc;

                let itemsTotal;
                if (items !== undefined) {
                    itemsTotal = items.reduce((acc, x) => acc + x.price * x.quantity, 0);
                } else {
                    const { rows: [r] } = await client.query(
                        'SELECT COALESCE(SUM(quantity * price), 0)::numeric AS subtotal FROM order_items WHERE order_id = $1',
                        [id]
                    );
                    itemsTotal = Number(r.subtotal);
                }
                pushSet('total', Math.max(0, itemsTotal + nextFeeCustomer - nextDisc));
            }

            if (sets.length > 0) {
                values.push(id);
                await client.query(
                    `UPDATE orders SET ${sets.join(', ')} WHERE id = $${i}`,
                    values
                );
            }

            if (items !== undefined) {
                await client.query('DELETE FROM order_items WHERE order_id = $1', [id]);
                for (const it of items) {
                    await client.query(
                        `INSERT INTO order_items (order_id, flavor_id, name, quantity, price)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [id, it.flavorId ?? null, it.name, it.quantity, it.price]
                    );
                }
            }

            return loadOrderById(client, id);
        });

        if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
        broadcast('order:updated', order);
        if (status !== undefined && status !== previousStatus) {
            whatsapp.notifyOrderStatus(order, previousStatus).catch(e => console.error('[whatsapp] notify:', e));
        }
        res.json(order);
    } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
    try {
        const id = req.params.id;
        const { rowCount } = await query('DELETE FROM orders WHERE id = $1', [id]);
        if (rowCount === 0) return res.status(404).json({ error: 'pedido não encontrado' });
        broadcast('order:deleted', { id });
        res.status(204).end();
    } catch (e) { next(e); }
});

// Endpoint utilitÃ¡rio: clientes derivados dos pedidos (agregados em SQL)
router.get('/customers/aggregate', async (_req, res, next) => {
    try {
        const { rows } = await query(`
            WITH agg AS (
                SELECT
                    COALESCE(NULLIF(phone, ''), customer) AS key,
                    MAX(customer) AS name,
                    COALESCE(NULLIF(phone, ''), '') AS phone,
                    COUNT(*)::int AS total_orders,
                    COALESCE(SUM(total), 0)::numeric AS total_spent,
                    MAX(created_at) AS last_buy
                FROM orders
                WHERE status <> 'Cancelado'
                GROUP BY key, COALESCE(NULLIF(phone, ''), '')
            ),
            last_order AS (
                SELECT DISTINCT ON (COALESCE(NULLIF(phone, ''), customer))
                    COALESCE(NULLIF(phone, ''), customer) AS key,
                    address,
                    neighborhood,
                    source
                FROM orders
                WHERE status <> 'Cancelado'
                ORDER BY COALESCE(NULLIF(phone, ''), customer), created_at DESC
            )
            SELECT
                agg.*,
                COALESCE(last_order.address, '') AS address,
                COALESCE(last_order.neighborhood, '') AS neighborhood,
                COALESCE(last_order.source, '') AS source
            FROM agg
            LEFT JOIN last_order ON last_order.key = agg.key
            ORDER BY agg.total_spent DESC
        `);
        res.json(rows.map(r => ({
            name: r.name,
            phone: r.phone,
            address: r.address,
            neighborhood: r.neighborhood,
            source: r.source,
            totalOrders: r.total_orders,
            totalSpent: Number(r.total_spent),
            lastBuy: r.last_buy,
        })));
    } catch (e) { next(e); }
});

// Dashboard: agregação completa em um único endpoint
// Query param ?period=today|7d|30d — afeta apenas rankings (sabores, bairros, clientes)
router.get('/stats/dashboard', async (req, res, next) => {
    try {
        const percentile = (arr, p) => {
            if (!arr || arr.length === 0) return 0;
            const list = [...arr].sort((a, b) => a - b);
            const idx = Math.max(0, Math.min(list.length - 1, (list.length - 1) * p));
            const lo = Math.floor(idx);
            const hi = Math.ceil(idx);
            if (lo === hi) return list[lo];
            const w = idx - lo;
            return list[lo] * (1 - w) + list[hi] * w;
        };

        const period = ['today', '7d', '30d'].includes(req.query.period) ? req.query.period : '30d';
        const periodSql =
            period === 'today' ? "CURRENT_DATE"
          : period === '7d'    ? "CURRENT_DATE - INTERVAL '6 days'"
          :                      "CURRENT_DATE - INTERVAL '30 days'";

        // Pedidos de hoje (com itens e categorias)
        const todayOrders = (await query(`
            SELECT o.*, COALESCE(json_agg(json_build_object(
                'flavor_id', oi.flavor_id, 'name', oi.name, 'quantity', oi.quantity, 'price', oi.price,
                'category', f.category
            )) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            LEFT JOIN flavors f      ON f.id = oi.flavor_id
            WHERE o.created_at::date = CURRENT_DATE
            GROUP BY o.id
            ORDER BY o.created_at ASC
        `)).rows;

        // Pedidos de ontem com horário-corte: comparamos apenas até o mesmo momento
        // do dia (ex.: às 11h da manhã, comparamos com até 11h de ontem).
        // Isso evita que "hoje" sempre pareça pior só porque o dia ainda não acabou.
        const yesterdayOrders = (await query(`
            SELECT o.*, COALESCE(SUM(oi.quantity), 0) AS items_count
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            WHERE o.created_at >= (CURRENT_DATE - INTERVAL '1 day')::timestamp
              AND o.created_at <  CURRENT_TIMESTAMP - INTERVAL '1 day'
            GROUP BY o.id
        `)).rows;

        // -- Métricas operacionais (hoje) --
        const active = todayOrders.filter(o => !['Cancelado', 'Entregue'].includes(o.status));
        const now = Date.now();
        const lateOrders = active
            .map(o => {
                const ageMin = (now - new Date(o.created_at).getTime()) / 60000;
                let threshold = null;
                if (o.status === 'Pendente'  ) threshold = 15;
                if (o.status === 'Em Preparo') threshold = 25;
                if (o.status === 'Pronto'    ) threshold = 15;
                return { o, ageMin, threshold };
            })
            .filter(x => x.threshold && x.ageMin > x.threshold)
            .map(x => ({
                id: x.o.id,
                customer: x.o.customer,
                status: x.o.status,
                ageMin: Math.round(x.ageMin),
                threshold: x.threshold,
            }));

        // Tempo médio de preparo (do created_at ao ready_at) — hoje
        const preparedToday = todayOrders.filter(o => o.ready_at);
        const avgPrepMs = preparedToday.length > 0
            ? preparedToday.reduce((acc, o) => acc + (new Date(o.ready_at) - new Date(o.created_at)), 0) / preparedToday.length
            : 0;

        // Mesmo, mas para ontem
        const preparedYesterday = yesterdayOrders.filter(o => o.ready_at);
        const avgPrepMsYesterday = preparedYesterday.length > 0
            ? preparedYesterday.reduce((acc, o) => acc + (new Date(o.ready_at) - new Date(o.created_at)), 0) / preparedYesterday.length
            : 0;

        // Tempo até finalizar atendimento (do created_at ao delivered_at) — hoje/ontem
        const deliveredToday = todayOrders.filter(o => o.status === 'Entregue' && o.delivered_at);
        const serviceMinutesToday = deliveredToday
            .map(o => (new Date(o.delivered_at) - new Date(o.created_at)) / 60000)
            .filter(x => isFinite(x) && x >= 0);
        const avgServiceMinutes = serviceMinutesToday.length > 0
            ? serviceMinutesToday.reduce((a, x) => a + x, 0) / serviceMinutesToday.length
            : 0;

        const deliveredYesterday = yesterdayOrders.filter(o => o.status === 'Entregue' && o.delivered_at);
        const serviceMinutesYesterday = deliveredYesterday
            .map(o => (new Date(o.delivered_at) - new Date(o.created_at)) / 60000)
            .filter(x => isFinite(x) && x >= 0);
        const avgServiceMinutesYesterday = serviceMinutesYesterday.length > 0
            ? serviceMinutesYesterday.reduce((a, x) => a + x, 0) / serviceMinutesYesterday.length
            : 0;

        // Espera atual (pedidos em andamento)
        const activeWaitMinutes = active
            .map(o => (now - new Date(o.created_at).getTime()) / 60000)
            .filter(x => isFinite(x) && x >= 0);
        const avgActiveWaitMinutes = activeWaitMinutes.length > 0
            ? activeWaitMinutes.reduce((a, x) => a + x, 0) / activeWaitMinutes.length
            : 0;
        const maxActiveWaitMinutes = activeWaitMinutes.length > 0 ? Math.max(...activeWaitMinutes) : 0;

        // Pedidos por hora — hoje
        const ordersByHour = new Array(24).fill(0);
        todayOrders.forEach(o => {
            const h = new Date(o.created_at).getHours();
            ordersByHour[h] += 1;
        });
        const peakHour = ordersByHour.indexOf(Math.max(...ordersByHour));

        // Doce vs Salgado vs Premium — hoje
        const categoryBreakdown = { Salgada: 0, Doce: 0, Premium: 0, Outros: 0 };
        todayOrders.forEach(o => {
            if (o.status === 'Cancelado') return;
            (o.items || []).forEach(i => {
                const c = i.category || 'Outros';
                if (categoryBreakdown[c] === undefined) categoryBreakdown.Outros += i.quantity;
                else categoryBreakdown[c] += i.quantity;
            });
        });

        // Origem dos pedidos no período (para o card de aquisição)
        const sourceBreakdown = (await query(`
            SELECT COALESCE(NULLIF(source, ''), 'Não informado') AS source,
                   COUNT(*)::int AS orders,
                   COALESCE(SUM(total), 0)::numeric AS revenue
            FROM orders
            WHERE created_at >= ${periodSql}
              AND status <> 'Cancelado'
            GROUP BY source
            ORDER BY orders DESC
        `)).rows.map(r => ({ source: r.source, orders: r.orders, revenue: Number(r.revenue) }));

        // Comparação hoje vs ontem
        const todayActive  = todayOrders.filter(o => o.status !== 'Cancelado');
        const yestActive   = yesterdayOrders.filter(o => o.status !== 'Cancelado');
        const todayRevenue = todayOrders.filter(o => o.status === 'Entregue').reduce((a, o) => a + Number(o.total), 0);
        const yestRevenue  = yesterdayOrders.filter(o => o.status === 'Entregue').reduce((a, o) => a + Number(o.total), 0);
        const todayTicket  = todayActive.length ? todayActive.reduce((a, o) => a + Number(o.total), 0) / todayActive.length : 0;
        const yestTicket   = yestActive.length  ? yestActive.reduce((a, o) => a + Number(o.total), 0)  / yestActive.length  : 0;
        const todayCancRate = todayOrders.length ? (todayOrders.filter(o => o.status === 'Cancelado').length / todayOrders.length) * 100 : 0;
        const yestCancRate  = yesterdayOrders.length ? (yesterdayOrders.filter(o => o.status === 'Cancelado').length / yesterdayOrders.length) * 100 : 0;

        // Top bairros (período variável, não cancelados)
        const topNeighborhoods = (await query(`
            SELECT neighborhood, COUNT(*)::int AS orders, COALESCE(SUM(total), 0)::numeric AS revenue
            FROM orders
            WHERE created_at >= ${periodSql}
              AND status <> 'Cancelado'
              AND neighborhood <> ''
            GROUP BY neighborhood
            ORDER BY orders DESC
            LIMIT 5
        `)).rows.map(r => ({ neighborhood: r.neighborhood, orders: r.orders, revenue: Number(r.revenue) }));

        // Ranking de sabores por VOLUME e por FATURAMENTO (período variável)
        const flavorStats = (await query(`
            SELECT oi.name,
                   SUM(oi.quantity)::int AS qty,
                   SUM(oi.quantity * oi.price)::numeric AS revenue
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= ${periodSql}
              AND o.status <> 'Cancelado'
            GROUP BY oi.name
        `)).rows;
        const topByQuantity = [...flavorStats]
            .sort((a, b) => b.qty - a.qty).slice(0, 5)
            .map(r => ({ name: r.name, qty: r.qty, revenue: Number(r.revenue) }));
        const topByRevenue = [...flavorStats]
            .sort((a, b) => Number(b.revenue) - Number(a.revenue)).slice(0, 5)
            .map(r => ({ name: r.name, qty: r.qty, revenue: Number(r.revenue) }));

        // Top clientes (período variável)
        const topCustomers = (await query(`
            SELECT COALESCE(NULLIF(phone, ''), customer) AS key,
                   MAX(customer) AS name,
                   COALESCE(NULLIF(phone, ''), '') AS phone,
                   COUNT(*)::int AS orders,
                   COALESCE(SUM(total), 0)::numeric AS spent,
                   MAX(created_at) AS last_buy
            FROM orders
            WHERE created_at >= ${periodSql}
              AND status <> 'Cancelado'
            GROUP BY key, COALESCE(NULLIF(phone, ''), '')
            ORDER BY spent DESC
            LIMIT 5
        `)).rows.map(r => ({
            name: r.name, phone: r.phone, orders: r.orders,
            spent: Number(r.spent), lastBuy: r.last_buy,
        }));

        res.json({
            period,
            late: lateOrders,
            avgPrepMinutes: avgPrepMs / 60000,
            avgPrepMinutesYesterday: avgPrepMsYesterday / 60000,
            avgServiceMinutes,
            avgServiceMinutesYesterday,
            medianServiceMinutes: percentile(serviceMinutesToday, 0.5),
            p90ServiceMinutes: percentile(serviceMinutesToday, 0.9),
            avgActiveWaitMinutes,
            maxActiveWaitMinutes,
            ordersByHour,
            peakHour,
            categoryBreakdown,
            comparison: {
                cutoffTime: new Date().toTimeString().slice(0, 5),
                today: {
                    orders: todayOrders.length,
                    revenue: todayRevenue,
                    ticket: todayTicket,
                    cancellationRate: todayCancRate,
                },
                yesterday: {
                    orders: yesterdayOrders.length,
                    revenue: yestRevenue,
                    ticket: yestTicket,
                    cancellationRate: yestCancRate,
                },
            },
            topNeighborhoods,
            topByQuantity,
            topByRevenue,
            topCustomers,
            sourceBreakdown,
        });
    } catch (e) { next(e); }
});

// Stats: faturamento dos últimos 7 dias (pedidos entregues)
router.get('/stats/weekly', async (_req, res, next) => {
    try {
        const { rows } = await query(`
            WITH days AS (
                SELECT generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day')::date AS d
            )
            SELECT
                days.d AS day,
                COALESCE(SUM(o.total), 0)::numeric AS revenue
            FROM days
            LEFT JOIN orders o
              ON o.status = 'Entregue'
             AND (o.delivered_at::date = days.d OR (o.delivered_at IS NULL AND o.created_at::date = days.d))
            GROUP BY days.d
            ORDER BY days.d
        `);
        res.json(rows.map(r => ({ day: r.day, revenue: Number(r.revenue) })));
    } catch (e) { next(e); }
});

module.exports = router;
