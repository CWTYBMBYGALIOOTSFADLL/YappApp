const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const SECRET_KEY = "a9f3d2b7e8c14f5d9a7b3c6e0f1d2a4b";
const IMGBB_KEY = "YOUR_IMGBB_API_KEY"; // replace with your key

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
  console.log("[Members] →", memberList);
  broadcast({ type: 'members', list: memberList });
}

async function uploadToImgbb(base64, name) {
  const form = new URLSearchParams();
  form.append('key', IMGBB_KEY);
  form.append('image', base64);
  form.append('name', name);

  const res = await fetch('https://api.imgbb.com/1/upload', {
    method: 'POST',
    body: form
  });
  const data = await res.json();
  if (data.success) return data.data.url;
  throw new Error('Upload failed');
}

wss.on('connection', ws => {
  console.log("[WS] New connection");
  ws.username = null;
  ws.isAuthorized = false;

  ws.on('message', async message => {
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

      if (data.type === 'file' && data.data && data.name && data.mime) {
        try {
          const url = await uploadToImgbb(data.data, data.name);
          broadcast({
            type: 'message',
            message: { sender: ws.username, text: `[file:${url}]::${data.mime}::${data.name}` }
          });
        } catch (err) {
          ws.send(JSON.stringify({ type: 'error', text: 'File upload failed' }));
        }
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
