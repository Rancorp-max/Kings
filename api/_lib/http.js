'use strict';
// Tiny request/response helpers that work on Vercel's Node runtime and the local dev server.

function readRaw(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readRaw(req);
  if (!raw.length) return {};
  try { return JSON.parse(raw.toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function send(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

function query(req) {
  if (req.query) return req.query;
  const u = new URL(req.url, 'http://x');
  return Object.fromEntries(u.searchParams);
}

function origin(req) {
  const proto = req.headers['x-forwarded-proto'] || (req.connection && req.connection.encrypted ? 'https' : 'http');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${String(proto).split(',')[0]}://${host}`;
}

// Wraps a handler: method allow-list + uniform error responses.
function handler(methods, fn) {
  return async (req, res) => {
    if (!methods.includes(req.method)) return send(res, 405, { error: 'Method not allowed' }, { allow: methods.join(', ') });
    try { await fn(req, res); } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api]', e);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? 'Server error' : e.message, code: e.code });
    }
  };
}

function httpError(status, message, code) { return Object.assign(new Error(message), { status, code }); }

module.exports = { readRaw, readJson, send, query, origin, handler, httpError };
