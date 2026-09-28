// Integration check of the Firestore adapter against the emulator (run manually:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 node --test tests/unit/firestore.emulator.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

test('Firestore adapter: create is exclusive, update is transactional, increments are atomic', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const { FirestoreDb, setDb } = require('../../api/_lib/db');
  const db = new FirestoreDb(); setDb(db);
  const E = require('../../api/_lib/events');
  const C = require('../../api/_lib/codes');
  const S = require('../../api/_lib/stripe');
  const run = Date.now().toString(36);

  assert.equal(await db.create('t_' + run, 'a', { x: 1 }), true);
  assert.equal(await db.create('t_' + run, 'a', { x: 2 }), false);
  assert.deepEqual(await db.get('t_' + run, 'a'), { x: 1 });

  await Promise.all(Array.from({ length: 20 }, () => db.increment('pageviews_' + run, 'd', { total: 1, p_home: 1 })));
  assert.equal((await db.get('pageviews_' + run, 'd')).total, 20);

  const { event, hostToken } = await E.createEvent({ theme: 'baby-shower', attribution: { utm_source: 'pinterest' } }, db);
  assert.equal((await E.requireHost(event.id, hostToken, db)).id, event.id);
  // Only one of many parallel generation reservations fits the free allowance.
  const res = await Promise.allSettled(Array.from({ length: 5 }, () => E.reserveGeneration(event.id, db)));
  assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1);

  const code = C.generateCode();
  await db.set('codes', C.hashCode(C.normalizeCode(code)), { batch: 'emu' });
  const evs = await Promise.all(Array.from({ length: 4 }, () => E.createEvent({}, db)));
  const red = await Promise.allSettled(evs.map((e) => C.redeemCode(code, e.event.id, db)));
  assert.equal(red.filter((r) => r.status === 'fulfilled').length, 1);

  const evt = { type: 'checkout.session.completed', data: { object: { id: 'cs_emu_' + run, payment_status: 'paid', amount_total: 1299, currency: 'usd', metadata: { eventId: event.id } } } };
  const [a, b] = await Promise.all([S.handleStripeEvent(evt, db), S.handleStripeEvent(evt, db)]);
  assert.equal([a.applied, b.applied].filter(Boolean).length, 1);
  assert.equal(E.planOf(await db.get('events', event.id)), 'pass');
  const purchases = (await db.list('purchases')).filter((p) => p.eventId === event.id);
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0].source, 'pinterest');
});
