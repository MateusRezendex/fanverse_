// Endpoint para receber pedidos via WhatsApp.
//
// O webhook é agnóstico do provedor — qualquer integração (Cloud API, Z-API, Twilio,
// n8n, Zapier) pode chamar este endpoint, desde que mande os campos:
//
//   POST /webhook/whatsapp
//   Headers: X-Webhook-Secret: <segredo>
//   Body:    { "from": "+5581999999999", "text": "Nome: ...\n..." }
//
// O backend parseia, cria o pedido e envia confirmação ao cliente via o provider
// configurado em WHATSAPP_PROVIDER.

const express = require('express');
const { query, withTx } = require('../db');
const { broadcast } = require('../ws');
const { parseOrderText } = require('../whatsapp/parser');
const whatsapp = require('../whatsapp');
const { calculatePackaging } = require('../packaging');

const router = express.Router();

function checkSecret(req, res) {
    const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!expected) return true; // sem segredo configurado, libera
    const provided = req.header('X-Webhook-Secret');
    if (provided !== expected) {
        res.status(401).json({ error: 'unauthorized' });
        return false;
    }
    return true;
}

// GET — usado pela verificação de webhook do WhatsApp Cloud API
router.get('/', (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode      = req.query['hub.mode'];
    const token     = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && verifyToken && token === verifyToken) {
        return res.status(200).type('text/plain').send(challenge || '');
    }
    res.sendStatus(403);
});

// POST — recebe mensagem e cria pedido
router.post('/', async (req, res, next) => {
    if (!checkSecret(req, res)) return;
    try {
        const { from, text } = req.body || {};
        if (!from || !text) {
            return res.status(400).json({ error: 'from e text são obrigatórios' });
        }

        const { rows: flavors } = await query('SELECT * FROM flavors WHERE available = TRUE');
        const flavorsNormalized = flavors.map(f => ({ ...f, price: Number(f.price) }));

        const { order: parsed, unknownItems, errors } = parseOrderText(text, flavorsNormalized);

        if (errors.length > 0) {
            const reply =
                `Não consegui interpretar seu pedido 😕\n\n` +
                `Problemas: ${errors.join('; ')}\n\n` +
                `Use o formato:\n` +
                `Nome: <seu nome>\n` +
                `Endereço: <rua, número, bairro>\n` +
                `Pagamento: Pix | Cartão | Dinheiro\n` +
                `<quantidade>x <sabor>\n` +
                `Obs: <opcional>`;
            await whatsapp.send(from, reply);
            return res.status(422).json({ error: 'pedido inválido', detail: errors, unknownItems });
        }

        // Usa o "from" como telefone canônico se não vier na mensagem
        const phone = parsed.phone || from;
        const total = parsed.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
        const packaging = calculatePackaging(parsed.items.map(item => {
            const flavor = flavorsNormalized.find(f => f.id === item.flavorId);
            return { ...item, category: flavor ? flavor.category : 'Salgada' };
        }));

        const order = await withTx(async (client) => {
            const { rows: [idRow] } = await client.query("SELECT '#' || nextval('order_id_seq') AS id");
            const id = idRow.id;
            await client.query(
                `INSERT INTO orders (
                    id, customer, phone, address, payment, source, total, status, notes,
                    caixa_sugerida, caixa_utilizada, ocupacao_total
                 )
                 VALUES ($1, $2, $3, $4, $5, 'WhatsApp', $6, 'Pendente', $7, $8, $9, $10)`,
                [
                    id, parsed.customer, phone, parsed.address, parsed.payment, total, parsed.notes,
                    packaging.suggestedBox, packaging.suggestedBox, packaging.occupancyTotal,
                ]
            );
            for (const it of parsed.items) {
                await client.query(
                    `INSERT INTO order_items (order_id, flavor_id, name, quantity, price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [id, it.flavorId, it.name, it.quantity, it.price]
                );
            }
            const o = (await client.query('SELECT * FROM orders WHERE id = $1', [id])).rows[0];
            const items = (await client.query('SELECT * FROM order_items WHERE order_id = $1', [id])).rows;
            return {
                id: o.id,
                customer: o.customer,
                phone: o.phone,
                address: o.address,
                payment: o.payment,
                total: Number(o.total),
                status: o.status,
                notes: o.notes,
                caixaSugerida: o.caixa_sugerida || 'Média',
                caixaUtilizada: o.caixa_utilizada || o.caixa_sugerida || 'Média',
                ocupacaoTotal: Number(o.ocupacao_total || 0),
                createdAt: o.created_at,
                deliveredAt: o.delivered_at,
                items: items.map(i => ({
                    flavorId: i.flavor_id,
                    name: i.name,
                    quantity: i.quantity,
                    price: Number(i.price),
                })),
            };
        });

        broadcast('order:created', order);
        // Aviso assíncrono ao cliente — não bloqueia a resposta
        whatsapp.notifyOrderCreated(order).catch(e => console.error('[whatsapp] notify falhou:', e));

        if (unknownItems.length > 0) {
            const reply =
                `Pedido *${order.id}* criado, mas alguns itens não foram encontrados no cardápio:\n` +
                unknownItems.map(i => `• ${i.quantity}x ${i.requested}`).join('\n') +
                `\n\nQuer adicionar/corrigir algum?`;
            whatsapp.send(from, reply).catch(() => {});
        }

        res.status(201).json({ order, unknownItems });
    } catch (e) { next(e); }
});

module.exports = router;
