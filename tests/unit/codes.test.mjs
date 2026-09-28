import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { freshDb, call } = require('./helpers.cjs');
const C = require('../../api/_lib/codes');
const E = require('../../api/_lib/events');

async function setup() {
  const db = freshDb();
  const codes = [C.generateCode(), C.generateCode()];
  for (const c of codes) await db.set('codes', C.hashCode(C.normalizeCode(c)), { batch: 'test' });
  const { event, hostToken } = await E.createEvent({ theme: 'bridal-shower', attribution: { utm_source: 'etsy', referrer: 'https://www.etsy.com/listing/1' } }, db);
  return { db, codes, event, hostToken };
}

test('codes have the PD-XXXX-XXXX-XXXX shape and ~60 bits of entropy', () => {
  const c = C.generateCode();
  assert.match(c, /^PD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(new Set(Array.from({ length: 2000 }, C.generateCode)).size, 2000);
});

test('normalizeCode forgives case, spacing and look-alike letters', () => {
  assert.equal(C.normalizeCode('pd-ab12-cd34-ef56'), 'AB12CD34EF56');
  assert.equal(C.normalizeCode(' AB12 CD34 EF56 '), 'AB12CD34EF56');
  assert.equal(C.normalizeCode('PD-O0IL-0000-0000'), '001100000000');
  assert.equal(C.normalizeCode('PD-SHORT'), null);
  assert.equal(C.normalizeCode(''), null);
});

test('redeeming a valid code marks the event paid and records an etsy_code purchase with attribution', async () => {
  const { db, codes, event } = await setup();
  const r = await C.redeemCode(codes[0].toLowerCase(), event.id, db);
  assert.equal(r.alreadyApplied, false);
  const ev = await db.get('events', event.id);
  assert.equal(ev.paid, true);
  assert.equal(ev.paidVia, 'etsy_code');
  assert.ok(ev.expiresAt > Date.now() + 6.9 * 86400000);
  assert.equal(E.planOf(ev), 'pass');
  const purchases = await db.list('purchases');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].method, 'etsy_code');
  assert.equal(purchases[0].source, 'etsy');
  assert.equal(purchases[0].theme, 'bridal-shower');
  assert.equal(purchases[0].amountCents, 1299);
});

test('a code is single-use: another event gets 409, the same event is a no-op', async () => {
  const { db, codes, event } = await setup();
  await C.redeemCode(codes[0], event.id, db);
  const again = await C.redeemCode(codes[0], event.id, db);
  assert.equal(again.alreadyApplied, true);
  const other = await E.createEvent({}, db);
  await assert.rejects(C.redeemCode(codes[0], other.event.id, db), (e) => e.status === 409);
  assert.equal((await db.get('events', other.event.id)).paid, false);
  assert.equal((await db.list('purchases')).length, 1);
});

test('concurrent redemptions of one code: exactly one wins', async () => {
  const { db, codes } = await setup();
  const evs = await Promise.all(Array.from({ length: 5 }, () => E.createEvent({}, db)));
  const results = await Promise.allSettled(evs.map((e) => C.redeemCode(codes[1], e.event.id, db)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected' && r.reason.status === 409).length, 4);
});

test('malformed and unknown codes are rejected without touching the event', async () => {
  const { db, event } = await setup();
  await assert.rejects(C.redeemCode('hello', event.id, db), (e) => e.status === 400);
  await assert.rejects(C.redeemCode(C.generateCode(), event.id, db), (e) => e.status === 404);
  assert.equal((await db.get('events', event.id)).paid, false);
});

test('/api/redeem without an event creates a new paid event and returns a host token', async () => {
  const { codes } = await setup();
  const handler = require('../../api/redeem.js');
  const res = await call(handler, { body: { code: codes[1], theme: 'baby-shower' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.event.plan, 'pass');
  assert.equal(res.body.event.limits.maxPlayers, 40);
  assert.ok(res.body.hostToken);
  const bad = await call(handler, { body: { code: codes[1] } });
  assert.equal(bad.statusCode, 409);
});

test('/api/redeem with an event requires the host token', async () => {
  const { codes, event } = await setup();
  const handler = require('../../api/redeem.js');
  const res = await call(handler, { body: { code: codes[0], id: event.id, token: 'wrong' } });
  assert.equal(res.statusCode, 403);
});
