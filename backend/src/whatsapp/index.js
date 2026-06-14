// Fachada do módulo WhatsApp.
// - resolve provider via WHATSAPP_PROVIDER (noop | cloudapi | zapi)
// - emite notificações de pedidos quando habilitado

const PROVIDER_NAME = (process.env.WHATSAPP_PROVIDER || 'noop').toLowerCase();
const ENABLED = String(process.env.WHATSAPP_ENABLED || 'false').toLowerCase() === 'true';

let provider;
try {
    provider = require(`./providers/${PROVIDER_NAME}`);
} catch (e) {
    console.warn(`[whatsapp] provider "${PROVIDER_NAME}" não encontrado — usando noop.`);
    provider = require('./providers/noop');
}

console.log(`[whatsapp] provider=${PROVIDER_NAME} enabled=${ENABLED}`);

async function send(to, text) {
    if (!ENABLED) return;
    if (!to) return;
    try {
        await provider.sendMessage(to, text);
    } catch (e) {
        console.error('[whatsapp] falha ao enviar mensagem:', e);
    }
}

function formatBRL(value) {
    const n = Number(value) || 0;
    return 'R$ ' + n.toFixed(2).replace('.', ',');
}

function summarizeItems(items) {
    return items.map(i => `• ${i.quantity}x ${i.name}`).join('\n');
}

async function notifyOrderCreated(order) {
    if (!order || !order.phone) return;
    const msg =
        `✅ Pedido *${order.id}* recebido!\n\n` +
        `${summarizeItems(order.items)}\n\n` +
        `Total: *${formatBRL(order.total)}*\n` +
        `Pagamento: ${order.payment || '—'}\n` +
        `Entrega: ${order.address || '—'}\n\n` +
        `Status: ${order.status}.\nVocê receberá atualizações por aqui. 🍕`;
    await send(order.phone, msg);
}

async function notifyOrderStatus(order, previousStatus) {
    if (!order || !order.phone) return;
    if (order.status === previousStatus) return;

    let msg = null;
    switch (order.status) {
        case 'Em Preparo':
            msg = `🔥 Pedido *${order.id}* entrou em preparo!`;
            break;
        case 'Pronto':
            msg = `📦 Pedido *${order.id}* está pronto! Saindo para entrega em instantes.`;
            break;
        case 'Entregue':
            msg = `🎉 Pedido *${order.id}* foi entregue. Obrigado pela preferência!`;
            break;
        case 'Cancelado':
            msg = `❌ Pedido *${order.id}* foi cancelado. Em caso de dúvida, fale conosco.`;
            break;
    }
    if (msg) await send(order.phone, msg);
}

module.exports = {
    send,
    notifyOrderCreated,
    notifyOrderStatus,
    PROVIDER_NAME,
    ENABLED,
};
