const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml'
};
const rooms = new Map();

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function roomSize(room) {
  return room ? room.clients.size : 0;
}

function broadcast(room, message, except) {
  if (!room) return;
  for (const client of room.clients) {
    if (client !== except) send(client, message);
  }
}

function findClient(room, id) {
  return [...room.clients].find((client) => client.id === id);
}

function removeClient(socket) {
  const room = socket.room;
  if (!room) return;
  room.clients.delete(socket);
  broadcast(room, { type: 'peer-left' }, socket);
  if (room.clients.size === 0) rooms.delete(room.id);
  socket.room = null;
}

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);

  if (requestPath === '/api/qr') {
    const text = new URL(request.url, `http://${request.headers.host}`).searchParams.get('text');
    if (!text || text.length > 2000) {
      response.writeHead(400, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'QR text is missing or too long.' }));
      return;
    }
    QRCode.toDataURL(text, { margin: 1, width: 320 }, (error, dataUrl) => {
      if (error) {
        response.writeHead(500, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: 'Could not generate QR code.' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ dataUrl }));
    });
    return;
  }

  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(PUBLIC_DIR, relativePath);

  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500);
      response.end(error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] || 'application/octet-stream' });
    response.end(content);
  });
});

const webSocketServer = new WebSocketServer({ noServer: true });

webSocketServer.on('connection', (socket, request) => {
  const query = new URL(request.url, `http://${request.headers.host}`).searchParams;
  const id = (query.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const role = query.get('role') === 'host' ? 'host' : 'viewer';

  if (!id) {
    send(socket, { type: 'error', message: 'A room code is required.' });
    socket.close();
    return;
  }

  let room = rooms.get(id);
  if (!room) {
    room = { id, clients: new Set(), host: null };
    rooms.set(id, room);
  }
  if (role === 'host' && room.host && room.host.readyState === room.host.OPEN) {
    send(socket, { type: 'error', message: 'This room already has a host.' });
    socket.close();
    return;
  }

  socket.room = room;
  socket.role = role;
  socket.id = Math.random().toString(36).slice(2, 10);
  socket.name = (query.get('name') || 'Viewer').replace(/[^a-zA-Z0-9 _.-]/g, '').trim().slice(0, 32) || 'Viewer';
  socket.controlGranted = false;
  room.clients.add(socket);
  if (role === 'host') room.host = socket;
  send(socket, { type: 'joined', role, id: socket.id, name: socket.name, viewers: roomSize(room) - (room.host ? 1 : 0) });
  if (role === 'viewer' && room.host) send(room.host, { type: 'viewer-joined', viewerId: socket.id, viewerName: socket.name });

  socket.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!socket.room) return;
    const target = message.to ? findClient(socket.room, message.to) : null;
    if (message.type === 'signal') {
      const payload = { type: 'signal', data: message.data, from: socket.id };
      if (target) send(target, payload); else broadcast(socket.room, payload, socket);
      return;
    }
    if (message.type === 'control-request' && socket.role === 'viewer' && socket.room.host) {
      send(socket.room.host, { type: 'control-request', viewerId: socket.id, viewerName: socket.name });
      return;
    }
    if (message.type === 'control-response' && socket.role === 'host') {
      const recipient = findClient(socket.room, message.to);
      if (recipient && recipient.role === 'viewer') {
        recipient.controlGranted = Boolean(message.granted);
        send(recipient, { type: 'control-response', granted: recipient.controlGranted });
      }
      return;
    }
    if (message.type === 'control-event' && socket.role === 'viewer' && socket.controlGranted && socket.room.host) {
      send(socket.room.host, { type: 'control-event', event: message.event, viewerId: socket.id });
    }
  });
  socket.on('close', () => {
    if (room.host === socket) room.host = null;
    removeClient(socket);
  });
  socket.on('error', () => removeClient(socket));
});

server.on('upgrade', (request, socket, head) => {
  if (request.url.startsWith('/ws')) {
    webSocketServer.handleUpgrade(request, socket, head, (client) => webSocketServer.emit('connection', client, request));
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Screen Share is running at http://localhost:${PORT}`);
  console.log('Use the computer\'s local network address for another device on the same Wi-Fi.');
});