const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const SECRET_KEY = "a9f3d2b7e8c14f5d9a7b3c6e0f1d2a4b";

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(__dirname));

const clients = new Map();

function broadcast(data) {
    const msg = JSON.stringify(data);
    console.log("[Broadcast] →", msg);
    for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    }
}

function broadcastMembers() {
    const memberList = [...clients.values()];
    broadcast({ type: 'members', list: memberList });
}

wss.on('connection', ws => {
    ws.username = null;
    ws.isAuthorized = false;

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'auth') {
                if (data.key !== SECRET_KEY) {
                    ws.send(JSON.stringify({ type: 'error', text: 'Invalid key' }));
                    ws.close();
                    return;
                }
                ws.isAuthorized = true;
                ws.send(JSON.stringify({ type: 'auth_success' }));
                return;
            }

            if (!ws.isAuthorized) {
                ws.send(JSON.stringify({ type: 'error', text: 'Not authorized' }));
                return;
            }

            if (data.type === 'join' && typeof data.username === 'string') {
                ws.username = data.username.trim().substring(0, 20);
                clients.set(ws, ws.username);
                broadcastMembers();
                broadcast({ type: 'message', message: { sender: 'System', text: `${ws.username} joined the chat` } });
                return;
            }

            if (!ws.username) return;

            if (data.type === 'message' && typeof data.text === 'string') {
                broadcast({ type: 'message', message: { sender: ws.username, text: data.text } });
                return;
            }

        } catch (err) {
            console.error('Error handling message:', err);
        }
    });

    ws.on('close', () => {
        if (ws.username) {
            clients.delete(ws);
            broadcastMembers();
            broadcast({ type: 'message', message: { sender: 'System', text: `${ws.username} left the chat` } });
        }
    });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
