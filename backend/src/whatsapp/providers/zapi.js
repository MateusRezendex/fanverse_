// Z-API (provedor brasileiro não-oficial).
// Variáveis:
//   ZAPI_INSTANCE_ID
//   ZAPI_TOKEN
//   ZAPI_CLIENT_TOKEN  (opcional, header Client-Token)

async function sendMessage(to, text) {
    const instance = process.env.ZAPI_INSTANCE_ID;
    const token    = process.env.ZAPI_TOKEN;
    const clientTk = process.env.ZAPI_CLIENT_TOKEN;

    if (!instance || !token) {
        console.warn('[whatsapp:zapi] credenciais ausentes — mensagem não enviada');
        return;
    }

    // Z-API normalmente espera número sem símbolos (5581999...)
    const phone = String(to).replace(/\D/g, '');

    const headers = { 'Content-Type': 'application/json' };
    if (clientTk) headers['Client-Token'] = clientTk;

    const r = await fetch(`https://api.z-api.io/instances/${instance}/token/${token}/send-text`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ phone, message: text }),
    });

    if (!r.ok) {
        const body = await r.text().catch(() => '');
        console.error(`[whatsapp:zapi] ${r.status}: ${body}`);
    }
}

module.exports = { sendMessage };
