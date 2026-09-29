// Servidor: sirve el juego (archivos estáticos) y gestiona las salas online por WebSocket en /ws.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { WebSocketServer } from 'ws';
import { RoomManager } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const PLANCK_FILE = path.join(path.dirname(require.resolve('planck')), 'planck.mjs');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function resolveFile(urlPath) {
  if (urlPath === '/vendor/planck.mjs') return PLANCK_FILE;
  let rel = decodeURIComponent(urlPath);
  let base = path.join(ROOT, 'client');
  if (rel.startsWith('/shared/')) {
    base = path.join(ROOT, 'shared');
    rel = rel.slice('/shared'.length);
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(base, rel));
  if (!file.startsWith(base + path.sep)) return null; // evita salir de la carpeta
  return file;
}

export function createServer({ port = 3000, host, matchDuration } = {}) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      return res.end('ok');
    }
    const file = resolveFile(url.pathname);
    if (!file) {
      res.writeHead(403);
      return res.end();
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('No encontrado');
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
      });
      res.end(data);
    });
  });

  const rooms = new RoomManager({ matchDuration });
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 });

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => rooms.handle(ws, data.toString()));
    ws.on('close', () => rooms.leave(ws));
    ws.on('error', () => {});
  });

  // cierra conexiones muertas (por ejemplo, alguien que perdió el wifi)
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 10000);

  server.on('close', () => {
    clearInterval(heartbeat);
    rooms.shutdown();
  });

  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, wss, rooms, port: server.address().port }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3000;
  createServer({ port, host: process.env.HOST, matchDuration: Number(process.env.MATCH_DURATION) || undefined }).then(({ port: p }) => {
    console.log(`Servidor listo en http://localhost:${p}`);
  });
}
