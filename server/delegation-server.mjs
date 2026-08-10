#!/usr/bin/env node
/**
 * Serves the built app (dist/) and exposes a small HTTP + WebSocket bridge
 * so an external process (this app's browser fork) can read live simulation
 * state and send a few control actions, without the app needing a real
 * backend of its own. See src/integration/bridge/MonitorBridge.ts for the
 * client side of this.
 *
 * Usage: node server/delegation-server.mjs [--port=3210]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(__dirname, '..', 'dist');
const BASE_PATH = '/the-delegation/';

const portArg = process.argv.find((a) => a.startsWith('--port='));
const PORT = portArg ? Number(portArg.split('=')[1]) : 3210;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

// Last state snapshot received from the connected app tab, and the live
// connection itself (only one is meaningfully "the" monitored instance at a
// time - see the design doc's "known limitations" section).
let latestState = null;
let bridgeSocket = null;

async function serveStatic(req, res, urlPath) {
  let relativePath = urlPath.startsWith(BASE_PATH)
    ? urlPath.slice(BASE_PATH.length)
    : urlPath.slice(1);
  if (relativePath === '' || relativePath.endsWith('/')) {
    relativePath += 'index.html';
  }

  let filePath = path.normalize(path.join(DIST_DIR, relativePath));
  // Guard against path traversal escaping dist/.
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(filePath)) {
    // SPA fallback for any unknown path under the app's base.
    filePath = path.join(DIST_DIR, 'index.html');
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? JSON.parse(raw) : {};
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify(
        latestState !== null ? latestState : { connected: false },
      ),
    );
    return;
  }

  if (url.pathname === '/api/control' && req.method === 'POST') {
    if (!bridgeSocket || bridgeSocket.readyState !== bridgeSocket.OPEN) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'not connected' }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      console.log('[control] sending', body.action, body.payload);
      bridgeSocket.send(
        JSON.stringify({ type: 'control', action: body.action, payload: body.payload }),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: String(err) }));
    }
    return;
  }

  if (url.pathname === '/') {
    res.writeHead(302, { Location: BASE_PATH });
    res.end();
    return;
  }

  await serveStatic(req, res, url.pathname);
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);
  if (pathname !== '/__bridge') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    // A new tab connecting replaces whichever one was previously "the"
    // monitored instance - see the design doc's known limitations.
    bridgeSocket = ws;
    console.log('[bridge] tab connected');
    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'state') {
          latestState = msg.data;
        }
      } catch (err) {
        console.log('[bridge] failed to parse message from page:', err.message);
      }
    });
    ws.on('close', () => {
      console.log('[bridge] tab disconnected');
      if (bridgeSocket === ws) {
        bridgeSocket = null;
        latestState = null;
      }
    });
  });
});

server.listen(PORT, () => {
  console.log(`[delegation-server] listening on http://localhost:${PORT}`);
});
