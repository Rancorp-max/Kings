import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Stripe = require('stripe');
const { freshDb, call } = require('./helpers.cjs');
const E = require('../../api/_lib/events');
const S = require('../../api/_lib/stripe');

const SECRET = 'whsec_test_unit';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;

function sessionEvent(eventId, over = {}) {
  return {
    id: 'evt_' + Math.random().toString(36).slice(2), type: 'checkout.session.completed', livemode: false,
    data: { object: { id: 'cs_test_' + Math.random().toString(36).slice(2), object: 'checkout.session', payment_status: 'paid', amount_total: 1299, currency: 'usd', client_reference_id: eventId, metadata: { eventId }, ...over } },
  };
}
const sign = (payload) => Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });

test('valid signed checkout.session.completed marks the event paid with attribution', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({ theme: 'baby-shower', attribution: { referrer: 'https://www.google.com/' } }, db);
  const payload = JSON.stringify(sessionEvent(event.id));
  const res = await call(require('../../api/stripe-webhook.js'), { raw: payload, headers: { 'stripe-signature': sign(payload) } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.applied, true);
  const ev = await db.get('events', event.id);
  assert.equal(ev.paid, true);
  assert.equal(ev.paidVia, 'stripe');
  assert.equal(E.publicEvent(ev).limits.maxPlayers, 40);
  const [p] = await db.list('purchases');
  assert.equal(p.method, 'stripe');
  assert.equal(p.source, 'google');
  assert.equal(p.amountCents, 1299);
});

test('duplicate deliveries are idempotent (one purchase, expiry not extended twice)', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({}, db);
  const evt = sessionEvent(event.id);
  const r1 = await S.handleStripeEvent(evt, db);
  const exp1 = (await db.get('events', event.id)).expiresAt;
  const r2 = await S.handleStripeEvent(evt, db);
  assert.equal(r1.applied, true);
  assert.equal(r2.applied, false);
  assert.equal((await db.get('events', event.id)).expiresAt, exp1);
  assert.equal((await db.list('purchases')).length, 1);
});

test('tampered payload or wrong secret is rejected with 400 and changes nothing', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({}, db);
  const payload = JSON.stringify(sessionEvent(event.id));
  const header = sign(payload);
  const tampered = payload.replace('"amount_total":1299', '"amount_total":1');
  const res = await call(require('../../api/stripe-webhook.js'), { raw: tampered, headers: { 'stripe-signature': header } });
  assert.equal(res.statusCode, 400);
  const res2 = await call(require('../../api/stripe-webhook.js'), { raw: payload, headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' }) } });
  assert.equal(res2.statusCode, 400);
  const res3 = await call(require('../../api/stripe-webhook.js'), { raw: payload, headers: {} });
  assert.equal(res3.statusCode, 400);
  assert.equal((await db.get('events', event.id)).paid, false);
});

test('unpaid sessions and unrelated event types are acknowledged but ignored', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({}, db);
  assert.equal((await S.handleStripeEvent(sessionEvent(event.id, { payment_status: 'unpaid' }), db)).reason, 'not_paid');
  assert.equal((await S.handleStripeEvent({ type: 'payment_intent.created', data: { object: {} } }, db)).reason, 'ignored_type');
  assert.equal((await db.get('events', event.id)).paid, false);
});

test('async payment success (delayed methods) also unlocks the pass', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({}, db);
  const r = await S.handleStripeEvent({ ...sessionEvent(event.id), type: 'checkout.session.async_payment_succeeded' }, db);
  assert.equal(r.applied, true);
});

test('a pass expires after 7 days and falls back to free limits', async () => {
  const db = freshDb();
  const { event } = await E.createEvent({}, db);
  await S.handleStripeEvent(sessionEvent(event.id), db);
  const ev = await db.get('events', event.id);
  assert.equal(E.planOf(ev), 'pass');
  assert.equal(E.planOf(ev, Date.now() + 8 * 86400000), 'free');
  assert.equal(E.publicEvent(ev, Date.now() + 8 * 86400000).limits.maxPlayers, 8);
});

test('mock checkout completes only when mock payments are allowed', async () => {
  const db = freshDb();
  const { event, hostToken } = await E.createEvent({}, db);
  const handler = require('../../api/checkout.js');
  delete process.env.ALLOW_MOCK_PAYMENTS;
  const denied = await call(handler, { body: { action: 'mock-complete', id: event.id, token: hostToken } });
  assert.equal(denied.statusCode, 403);
  process.env.ALLOW_MOCK_PAYMENTS = '1';
  const ok = await call(handler, { body: { action: 'mock-complete', id: event.id, token: hostToken } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.event.plan, 'pass');
  const [p] = await db.list('purchases');
  assert.equal(p.method, 'mock');
  const url = await call(handler, { body: { id: (await E.createEvent({}, db)).event.id, token: 'x' } });
  assert.equal(url.statusCode, 403);
  delete process.env.ALLOW_MOCK_PAYMENTS;
});
