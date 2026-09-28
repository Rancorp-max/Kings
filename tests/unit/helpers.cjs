'use strict';
// Test helpers: in-memory DB and fake req/res for calling Vercel-style handlers directly.
const { Readable } = require('stream');
const { FileDb, setDb } = require('../../api/_lib/db');

function freshDb() { const db = new FileDb(null); setDb(db); return db; }

function fakeReq({ method = 'POST', body, raw, headers = {}, query = {} } = {}) {
  const buf = raw !== undefined ? Buffer.from(raw) : Buffer.from(body === undefined ? '' : JSON.stringify(body));
  const req = Readable.from(buf.length ? [buf] : []);
  req.method = method; req.headers = { host: 'localhost:3000', ...headers }; req.query = query; req.url = '/';
  return req;
}

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: null, headersSent: false };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
  res.getHeader = (k) => res.headers[k.toLowerCase()];
  res.end = (b) => { res.headersSent = true; res.raw = b; try { res.body = JSON.parse(b); } catch { res.body = b; } };
  return res;
}

async function call(handler, reqOpts) { const res = fakeRes(); await handler(fakeReq(reqOpts), res); return res; }

module.exports = { freshDb, fakeReq, fakeRes, call };
