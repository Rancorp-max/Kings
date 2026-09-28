'use strict';
// GET with header x-admin-password (env ADMIN_PASSWORD) -> dashboard stats.
const crypto = require('crypto');
const { handler, send, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { aggregate } = require('./_lib/admin');

function checkPassword(given) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) throw httpError(503, 'ADMIN_PASSWORD is not set on the server.');
  const a = crypto.createHash('sha256').update(String(given || '')).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  if (!crypto.timingSafeEqual(a, b)) throw httpError(401, 'Wrong password');
}

module.exports = handler(['GET'], async (req, res) => {
  checkPassword(req.headers['x-admin-password']);
  const db = getDb();
  const [events, purchases, aiCalls, pageviews, weddings, licences] = await Promise.all(['events', 'purchases', 'ai_calls', 'pageviews', 'weddings', 'licences'].map((c) => db.list(c)));
  // Per-wedding extras: sharded guest counters and the name of the event a purchase started from.
  const WD = require('./_lib/wedding');
  for (const w of weddings.slice(0, 100)) {
    w.guestsJoined = await WD.guestCount(w.id, db);
    if (w.stats?.purchaseFromEvent) { const e = await db.get(WD.col.events(w.id), w.stats.purchaseFromEvent); w.purchaseFromEventName = e?.name || w.stats.purchaseFromEvent; }
  }
  const stats = aggregate({ events, purchases, aiCalls, pageviews, weddings, licences });
  stats.storage = { kind: db.kind, ephemeral: !!db.ephemeral };
  stats.config = {
    stripe: process.env.STRIPE_SECRET_KEY ? (process.env.STRIPE_SECRET_KEY.startsWith('sk_live') ? 'live' : 'test') : 'not configured',
    webhook: !!process.env.STRIPE_WEBHOOK_SECRET, anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
  stats.recentPurchases = purchases.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20)
    .map(({ eventId, theme, amountCents, method, source, referrer, createdAt }) => ({ eventId, theme, amountUsd: (amountCents || 0) / 100, method, source, referrer, createdAt }));
  send(res, 200, stats);
});
