const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const SECRET_KEY = "a9f3d2b7e8c14f5d9a7b3c6e0f1d2a4b";

const app = express();
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(__dirname));

const clients = new Map();

function broadcast(data) {
  const msg = JSON.stringify(data);
  console.log("[Broadcast] →", msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function broadcastMembers() {
  const memberList = [...clients.values()];
  console.log("[Members] →", memberList);
  broadcast({ type: 'members', list: memberList });
}

wss.on('connection', ws => {
  console.log("[WS] New connection");
  ws.username = null;
  ws.isAuthorized = false;

  ws.on('message', message => {
    console.log("[WS] Received message:", message.toString());
    try {
      const data = JSON.parse(message);

      if (data.type === 'auth') {
        console.log("[Auth Attempt] key:", data.key);
        if (data.key !== SECRET_KEY) {
          ws.send(JSON.stringify({ type: 'error', text: 'Invalid key' }));
          ws.close();
          return;
        }
        ws.isAuthorized = true;
        ws.send(JSON.stringify({ type: 'auth_success' }));
        console.log("[Auth Success]");
        return;
      }

      if (!ws.isAuthorized) {
        ws.send(JSON.stringify({ type: 'error', text: 'Not authorized' }));
        return;
      }

      if (data.type === 'join' && typeof data.username === 'string') {
        ws.username = data.username.trim().substring(0, 20);
        clients.set(ws, ws.username);
        console.log(`[Join] ${ws.username}`);
        broadcastMembers();
        broadcast({
          type: 'message',
          message: { sender: 'System', text: `${ws.username} joined the chat` }
        });
        return;
      }

      if (!ws.username) return;

      if (data.type === 'message' && typeof data.text === 'string') {
        console.log(`[Chat] ${ws.username}: ${data.text}`);
        broadcast({
          type: 'message',
          message: { sender: ws.username, text: data.text }
        });
        return;
      }

      if (data.type === 'file' && data.data && data.name && (data.fileType || data.mime)) {
    const ext = path.extname(data.name) || '.dat';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const filePath = path.join(UPLOAD_DIR, safeName);

    fs.writeFile(filePath, Buffer.from(data.data, 'base64'), err => {
        if (err) {
            console.error('Error saving file:', err);
            ws.send(JSON.stringify({ type: 'error', text: 'File upload failed' }));
            return;
        }

        const fileUrl = `/uploads/${safeName}`;

        broadcast({
            type: 'message',
            message: { 
                sender: ws.username, 
                text: `[file:${fileUrl}]::${data.fileType || data.mime}::${data.name}`
            }
        });

        console.log(`[File Saved] ${filePath}`);
    });
}




    } catch (err) {
      console.error('Error handling message:', err);
    }
  });

  ws.on('close', () => {
    if (ws.username) {
      console.log(`[Disconnect] ${ws.username}`);
      clients.delete(ws);
      broadcastMembers();
      broadcast({
        type: 'message',
        message: { sender: 'System', text: `${ws.username} left the chat` }
      });
    } else {
      console.log("[Disconnect] Unauthenticated user");
    }
  });
});

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
