'use strict';
// POST {path} — anonymous page-view counter (no cookies, no IPs stored). Feeds the Day-7 visit rule.
const { handler, readJson, send } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { pageKey } = require('./_lib/admin');

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const ua = String(req.headers['user-agent'] || '');
  if (/bot|crawl|spider|lighthouse|headless/i.test(ua)) return send(res, 204, {});
  const day = new Date().toISOString().slice(0, 10);
  await getDb().increment('pageviews', day, { total: 1, ['p_' + pageKey(body.path)]: 1 });
  return send(res, 200, { ok: true });
});
