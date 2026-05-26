const { WebSocketServer, WebSocket } = require('ws');

let wss = null;

function attach(server, path = '/ws') {
    wss = new WebSocketServer({ server, path });
    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.send(JSON.stringify({ type: 'hello', payload: { ts: Date.now() } }));
    });

    // Heartbeat — fecha conexões mortas
    const interval = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        });
    }, 30000);
    wss.on('close', () => clearInterval(interval));

    return wss;
}

function broadcast(type, payload) {
    if (!wss) return;
    const msg = JSON.stringify({ type, payload });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

module.exports = { attach, broadcast };
