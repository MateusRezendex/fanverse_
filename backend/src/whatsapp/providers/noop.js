// Provider "no-op": apenas loga. Default quando WHATSAPP_PROVIDER não está setado.

async function sendMessage(to, text) {
    console.log(`[whatsapp:noop] → ${to}: ${text}`);
}

module.exports = { sendMessage };
