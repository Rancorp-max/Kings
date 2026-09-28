#!/usr/bin/env node
/* Local stand-in for Vercel: serves public/ with clean URLs and routes /api/* to
 * the serverless handlers in api/. Optionally runs a PeerJS signalling server.
 *
 *   node scripts/dev-server.js [--port 3000] [--peer-port 9000]
 *
 * Env: reads .env.local then .env (KEY=value lines) without overriding real env.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const API = path.join(ROOT, 'api');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.join(ROOT, '.env.local'));
loadEnv(path.join(ROOT, '.env'));

const args = process.argv.slice(2);
const arg = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(arg('port', process.env.PORT || 3000));
const PEER_PORT = arg('peer-port', process.env.PEER_PORT);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon', '.pdf': 'application/pdf',
};

function resolveStatic(p) {
  const clean = path.normalize(decodeURIComponent(p)).replace(/^(\.\.[/\\])+/, '');
  const base = path.join(PUBLIC, clean);
  if (!base.startsWith(PUBLIC)) return null;
  const tries = [base, base + '.html', path.join(base, 'index.html')];
  for (const t of tries) { try { if (fs.statSync(t).isFile()) return t; } catch { /* next */ } }
  return null;
}

// Minimal Vercel-style req/res sugar so handlers written for Vercel run here too.
function decorate(req, res, url) {
  req.query = Object.fromEntries(url.searchParams);
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); return res; };
  res.send = (b) => { res.end(typeof b === 'object' && !Buffer.isBuffer(b) ? JSON.stringify(b) : b); return res; };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const rel = url.pathname.slice(5).replace(/\/$/, '');
      const file = path.join(API, rel + '.js');
      if (!file.startsWith(API) || path.basename(file).startsWith('_') || !fs.existsSync(file)) { res.statusCode = 404; res.end('Not found'); return; }
      decorate(req, res, url);
      const mod = require(file);
      const handler = typeof mod === 'function' ? mod : mod.default;
      await handler(req, res);
      return;
    }
    const file = resolveStatic(url.pathname);
    if (!file) {
      const nf = path.join(PUBLIC, '404.html');
      res.statusCode = 404;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(fs.existsSync(nf) ? fs.readFileSync(nf) : 'Not found');
      return;
    }
    // Mirror vercel.json cleanUrls: /foo.html -> /foo
    if (url.pathname.endsWith('.html')) {
      res.statusCode = 308; res.setHeader('location', url.pathname.replace(/(index)?\.html$/, '') + url.search); res.end(); return;
    }
    res.setHeader('content-type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', 'no-store');
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[dev-server]', e);
    if (!res.headersSent) { res.statusCode = 500; res.end('Server error'); }
  }
});

server.listen(PORT, () => console.log(`[dev-server] http://localhost:${PORT}`));

if (PEER_PORT) {
  // PeerJS signalling server for offline E2E tests (dev dependency in tests/).
  const { PeerServer } = require(path.join(ROOT, 'tests/node_modules/peer'));
  PeerServer({ port: Number(PEER_PORT), host: '0.0.0.0', path: '/' });
  console.log(`[dev-server] PeerServer on :${PEER_PORT}`);
}

module.exports = server;
