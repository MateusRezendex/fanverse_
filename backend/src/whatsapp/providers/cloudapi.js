// WhatsApp Cloud API (Meta).
// Variáveis necessárias:
//   WHATSAPP_PHONE_NUMBER_ID   (id do número Business)
//   WHATSAPP_ACCESS_TOKEN      (token permanente)
//   WHATSAPP_API_VERSION       (opcional, default "v18.0")

async function sendMessage(to, text) {
    const phoneId  = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const token    = process.env.WHATSAPP_ACCESS_TOKEN;
    const version  = process.env.WHATSAPP_API_VERSION || 'v18.0';

    if (!phoneId || !token) {
        console.warn('[whatsapp:cloudapi] credenciais ausentes — mensagem não enviada');
        return;
    }

    const r = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: text },
        }),
    });

    if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error(`[whatsapp:cloudapi] ${r.status}: ${body}`);
    }
}

module.exports = { sendMessage };
