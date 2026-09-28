import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { freshDb, call } = require('./helpers.cjs');
const WD = require('../../api/_lib/wedding');
const B = require('../../api/_lib/billing');
const C = require('../../api/_lib/codes');
const { scoreAnswer: partyScore } = await import('../../public/js/quiz-core.js');

async function setup(db, over = {}) {
  const { wedding, ownerToken } = await WD.createWedding({ couple: { names: ['Asha', 'Rohan'] }, events: [{ type: 'sangeet' }, { type: 'reception' }], ...over }, db);
  return { w: wedding, token: ownerToken };
}
async function joinN(db, code, n, sides = ['a', 'b']) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await WD.joinWedding({ code, name: 'G' + i, side: sides[i % sides.length] }, db));
  return out;
}
const mc = (text, correct = 1) => ({ kind: 'mc', text, options: ['A', 'B', 'C', 'D'], correct });

test('wedding scoring matches the party quiz scoring exactly', () => {
  for (const [c, ms] of [[true, 0], [true, 5000], [true, 20000], [false, 100], [true, 99999]]) assert.equal(WD.scoreAnswer({ correct: c, elapsedMs: ms }), partyScore({ correct: c, elapsedMs: ms }));
});

test('create: join code, default sides from the couple, pack defaults per event', async () => {
  const db = freshDb(); const { w } = await setup(db);
  assert.match(w.code, /^[A-Z2-9]{6}$/);
  assert.deepEqual(w.sides.map((s) => s.name), ["Asha's side", "Rohan's side"]);
  assert.equal(w.plan, 'trial');
  const [sangeet, reception] = await Promise.all(w.eventOrder.map((id) => db.get(WD.col.events(w.id), id)));
  assert.equal(sangeet.pack, 'sangeet');
  assert.ok(sangeet.items.some((i) => i.kind === 'vote') && sangeet.items.filter((i) => i.kind === 'emoji').length === 6);
  assert.ok(reception.items.filter((i) => i.kind === 'shoe').length >= 8);
  assert.deepEqual(reception.items.find((i) => i.kind === 'shoe').options, ['Asha', 'Rohan']);
  assert.ok(sangeet.items.every((i) => !/lyric/i.test(i.text)));
});

test('roles: owner vs co-host; up to 5 co-hosts; co-hosts cannot manage co-hosts', async () => {
  const db = freshDb(); const { w, token } = await setup(db);
  const tokens = [];
  for (let i = 0; i < 5; i++) tokens.push((await WD.addCohost(w.id, 'DJ ' + i, db)).token);
  await assert.rejects(WD.addCohost(w.id, 'one too many', db), /Up to 5/);
  assert.equal((await WD.requireHost(w.id, tokens[2], db)).role, 'cohost');
  assert.equal((await WD.requireHost(w.id, token, db)).role, 'owner');
  await assert.rejects(WD.requireHost(w.id, 'nope', db), (e) => e.status === 403);
  const handler = require('../../api/wedding.js');
  const r = await call(handler, { body: { action: 'add-cohost', w: w.id, token: tokens[0], name: 'x' } });
  assert.equal(r.statusCode, 403);
  const ok = await call(handler, { body: { action: 'start-event', w: w.id, token: tokens[0], eventId: w.eventOrder[0] } });
  assert.equal(ok.statusCode, 200, 'co-host can run an event');
});

test('guests keep one identity: resume on another device with the 6-digit code', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const j = await WD.joinWedding({ code: w.code.toLowerCase(), name: 'Meera', side: 'b', avatar: '🦚' }, db);
  assert.match(j.guestCode, /^\d{6}$/);
  const r = await WD.resumeGuest({ code: w.code, guestCode: j.guestCode }, db);
  assert.equal(r.guest.id, j.guest.id);
  assert.equal(r.guest.side, 'b');
  await assert.rejects(WD.requireGuest(w.id, j.guest.id, j.secret, db), (e) => e.status === 403, 'old device secret rotated');
  assert.ok(await WD.requireGuest(w.id, j.guest.id, r.secret, db));
  await assert.rejects(WD.resumeGuest({ code: w.code, guestCode: '000000' === j.guestCode ? '000001' : '000000' }, db), (e) => e.status === 404);
});

test('resume brute force is rate limited per wedding', async () => {
  const db = freshDb(); const { w } = await setup(db);
  for (let i = 0; i < 50; i++) await WD.resumeGuest({ code: w.code, guestCode: String(100000 + i) }, db).catch(() => {});
  await assert.rejects(WD.resumeGuest({ code: w.code, guestCode: '123456' }, db), (e) => e.status === 429);
});

test('guest cap follows the plan (trial 25, Wedding Pass 150)', async () => {
  const db = freshDb(); const { w } = await setup(db);
  await joinN(db, w.code, 25);
  await assert.rejects(WD.joinWedding({ code: w.code, name: 'late' }, db), (e) => e.code === 'full');
  await B.markWeddingPaid(w.id, { purchaseId: 'p1', plan: 'wedding', method: 'stripe', amountCents: 4900 }, db);
  assert.ok(await WD.joinWedding({ code: w.code, name: 'now ok' }, db));
  assert.equal(await WD.guestCount(w.id, db), 26);
});

test('engine: answers are scored on the server clock at reveal; late and duplicate answers are handled', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const ev = (await WD.addEvent(w.id, { type: 'welcome' }, db, { skipLimit: true }));
  await WD.updateEvent(w.id, ev.id, { items: [mc('Where did they meet?', 2)] }, db);
  const gs = await joinN(db, w.code, 4);
  await WD.startEvent(w.id, ev.id, db);
  const live = await WD.openItem(w.id, 0, db);
  assert.equal(live.stage, 'question');
  assert.equal(live.item.correct, undefined, 'correct answer never sent before reveal');
  // Backdate the question so the first answer looks 5 s old.
  await db.update('wedding_live', w.id, (l) => ({ ...l, openedAt: Date.now() - 5000 }));
  const g = (i) => ({ id: gs[i].guest.id, side: gs[i].guest.side, group: 1 });
  assert.equal((await WD.submitAnswer(w.id, g(0), { eventId: ev.id, index: 0, choice: 2 }, db)).ok, true);
  assert.equal((await WD.submitAnswer(w.id, g(0), { eventId: ev.id, index: 0, choice: 1 }, db)).duplicate, true, 'first answer wins');
  await WD.submitAnswer(w.id, g(1), { eventId: ev.id, index: 0, choice: 1 }, db);
  await WD.submitAnswer(w.id, g(2), { eventId: ev.id, index: 0, choice: 2 }, db);
  assert.equal(await WD.answeredCount(w.id, db), 3);
  await db.update('wedding_live', w.id, (l) => ({ ...l, deadline: Date.now() - 5000 }));
  assert.equal((await WD.submitAnswer(w.id, g(3), { eventId: ev.id, index: 0, choice: 2 }, db)).reason, 'late');
  const r = await WD.reveal(w.id, {}, db);
  assert.equal(r.stage, 'reveal');
  assert.deepEqual(r.reveal.counts, [0, 1, 2, 0]);
  assert.equal(r.reveal.correct, 2);
  const scores = await db.get('wedding_scores', w.id);
  assert.ok(scores.guests[gs[0].guest.id] >= 865 && scores.guests[gs[0].guest.id] <= 880, 'about 875 for a correct answer 5 s into a 20 s question');
  assert.equal(scores.guests[gs[1].guest.id], 0);
  assert.equal(r.board.top[0].id, gs[0].guest.id);
  assert.equal((await WD.submitAnswer(w.id, g(3), { eventId: ev.id, index: 0, choice: 2 }, db)).reason, 'closed');
});

test('side vs side: average by default (fair to smaller sides), total optional; vote bonus to the winning side', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const ev = await WD.addEvent(w.id, { type: 'sangeet' }, db, { skipLimit: true });
  await WD.updateEvent(w.id, ev.id, { items: [mc('Q', 0), { kind: 'vote', text: 'Best dance', options: ['Bride team', 'Groom team'], optionSides: ['a', 'b'] }] }, db);
  // side a: 1 player, side b: 3 players; everyone correct instantly.
  const gs = await joinN(db, w.code, 4, ['a', 'b', 'b', 'b']);
  await WD.startEvent(w.id, ev.id, db); await WD.openItem(w.id, 0, db);
  for (const j of gs) await WD.submitAnswer(w.id, { id: j.guest.id, side: j.guest.side }, { eventId: ev.id, index: 0, choice: 0 }, db);
  let r = await WD.reveal(w.id, {}, db);
  assert.ok(Math.abs(r.board.sides.a - r.board.sides.b) <= 5, 'averages are comparable: ' + JSON.stringify(r.board.sides));
  await WD.openItem(w.id, 1, db);
  for (const j of gs) await WD.submitAnswer(w.id, { id: j.guest.id, side: j.guest.side, group: 1 }, { eventId: ev.id, index: 1, choice: 1 }, db);
  r = await WD.reveal(w.id, {}, db);
  assert.equal(r.stage, 'voteResult');
  assert.deepEqual(r.reveal.winners, [1]);
  assert.equal(r.reveal.sideBonus.b, WD.VOTE_BONUS);
  assert.ok(r.board.sides.b > r.board.sides.a + 900);
  const scores = await db.get('wedding_scores', w.id);
  const tot = WD.sideTotals({ ...w, teamScoring: 'total' }, scores);
  assert.ok(tot.b > 3 * 900, 'total mode sums the side');
});

test('family mode: one phone answers for a group — its vote counts for the group, its points count once', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const ev = await WD.addEvent(w.id, { type: 'sangeet' }, db, { skipLimit: true });
  await WD.updateEvent(w.id, ev.id, { items: [{ kind: 'vote', text: 'Best dance', options: ['X', 'Y'] }] }, db);
  const fam = await WD.joinWedding({ code: w.code, name: 'The Sharmas', side: 'a', groupSize: 5 }, db);
  const solo = await WD.joinWedding({ code: w.code, name: 'Solo', side: 'b' }, db);
  await WD.startEvent(w.id, ev.id, db); await WD.openItem(w.id, 0, db);
  await WD.submitAnswer(w.id, { id: fam.guest.id, side: 'a', group: fam.guest.group }, { eventId: ev.id, index: 0, choice: 0 }, db);
  await WD.submitAnswer(w.id, { id: solo.guest.id, side: 'b', group: 1 }, { eventId: ev.id, index: 0, choice: 1 }, db);
  const r = await WD.reveal(w.id, {}, db);
  assert.deepEqual(r.reveal.counts, [5, 1]);
});

test('shoe game: the host sets the couple\'s answer at reveal; points roll up across events; finale picks the winning side', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const [sangeetId, receptionId] = w.eventOrder;
  const gs = await joinN(db, w.code, 2, ['a', 'b']);
  await WD.updateEvent(w.id, sangeetId, { items: [mc('Q1', 3)] }, db);
  await WD.startEvent(w.id, sangeetId, db); await WD.openItem(w.id, 0, db);
  await WD.submitAnswer(w.id, { id: gs[0].guest.id, side: 'a' }, { eventId: sangeetId, index: 0, choice: 3 }, db);
  await WD.reveal(w.id, {}, db); await WD.endEvent(w.id, db);
  await WD.startEvent(w.id, receptionId, db); await WD.openItem(w.id, 0, db);
  await WD.submitAnswer(w.id, { id: gs[0].guest.id, side: 'a' }, { eventId: receptionId, index: 0, choice: 0 }, db);
  await WD.submitAnswer(w.id, { id: gs[1].guest.id, side: 'b' }, { eventId: receptionId, index: 0, choice: 1 }, db);
  await assert.rejects(WD.reveal(w.id, {}, db), /shoe/);
  await WD.reveal(w.id, { correct: 0 }, db); // the couple held up Asha's shoe
  const scores = await db.get('wedding_scores', w.id);
  assert.ok(scores.guests[gs[0].guest.id] > 1900, 'Asha-side guest scored in both events');
  assert.equal(scores.guests[gs[1].guest.id], 0);
  assert.ok(scores.byEvent[sangeetId] && scores.byEvent[receptionId]);
  const f = await WD.finale(w.id, db);
  assert.equal(f.stage, 'finale');
  assert.deepEqual(f.finale.winners, ['a']);
  assert.equal(Object.keys(f.finale.perEvent).length, 2);
  assert.equal((await db.get('weddings', w.id)).stats.eventsRun, 2);
});

test('presence is sharded per minute and drives peak concurrency', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const gs = await joinN(db, w.code, 12);
  for (const j of gs) await WD.touch(w.id, j.guest.id, db);
  const p = await WD.hostPulse(w.id, db);
  assert.equal(p.active, 12);
  assert.equal(p.guests, 12);
  assert.equal((await db.get('weddings', w.id)).stats.peakConcurrent, 12);
  const shards = (await db.list('wedding_presence')).length;
  assert.ok(shards > 1 && shards <= WD.SHARDS, 'writes spread over shards: ' + shards);
});

test('guest notes: moderated before the big screen/keepsake; host can approve; 5 per event', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const [eid] = w.eventOrder;
  const j = await WD.joinWedding({ code: w.code, name: 'Tara', side: 'a' }, db);
  const g = { ...j.guest };
  const AI = require('../../api/_lib/ai');
  const mod = (t) => AI.moderateGuestText(t, {}); // no model: blocklist only
  const ok = await WD.addNote(w.id, g, { eventId: eid, kind: 'toast', text: 'To a lifetime of laughter!' }, mod, db);
  const bad = await WD.addNote(w.id, g, { eventId: eid, kind: 'toast', text: 'Good luck with the mother-in-law, haha' }, mod, db);
  assert.equal(ok.status, 'approved');
  assert.equal(bad.status, 'pending');
  await WD.startEvent(w.id, eid, db);
  let live = await WD.refreshWall(w.id, db);
  assert.deepEqual(live.wall.map((n) => n.text), ['To a lifetime of laughter!']);
  await WD.setNoteStatus(w.id, bad.id, 'approved', db);
  live = await WD.refreshWall(w.id, db);
  assert.equal(live.wall.length, 2);
  for (let i = 0; i < 3; i++) await WD.addNote(w.id, g, { eventId: eid, kind: 'wish', text: 'Wish ' + i }, mod, db);
  await assert.rejects(WD.addNote(w.id, g, { eventId: eid, kind: 'wish', text: 'one more' }, mod, db), (e) => e.status === 429);
});

test('moderateGuestText uses the model when available and fails safe to pending', async () => {
  const AI = require('../../api/_lib/ai');
  const client = AI.mockWeddingClient();
  assert.equal((await AI.moderateGuestText('Congratulations, you two!', { client })).status, 'approved');
  assert.equal((await AI.moderateGuestText('You are mean and stupid', { client })).status, 'pending');
  const broken = { messages: { create: async () => { throw new Error('down'); } } };
  assert.equal((await AI.moderateGuestText('Lovely day', { client: broken })).status, 'pending');
});

test('billing: wedding passes are idempotent, upgrade but never downgrade, and change limits', async () => {
  const db = freshDb(); const { w } = await setup(db);
  assert.equal(WD.limitsOf(w).maxEvents, 1);
  const r1 = await B.markWeddingPaid(w.id, { purchaseId: 's1', plan: 'plus', method: 'stripe', amountCents: 9900, fromEvent: w.eventOrder[1] }, db);
  const r2 = await B.markWeddingPaid(w.id, { purchaseId: 's1', plan: 'plus', method: 'stripe', amountCents: 9900 }, db);
  assert.equal(r1.applied, true); assert.equal(r2.applied, false);
  await B.markWeddingPaid(w.id, { purchaseId: 's2', plan: 'wedding', method: 'etsy_code', amountCents: 4900 }, db);
  const after = await db.get('weddings', w.id);
  assert.equal(WD.planOf(after), 'plus');
  assert.equal(WD.limitsOf(after).maxGuests, 500);
  assert.equal(after.stats.purchaseFromEvent, w.eventOrder[1], 'remembers which event the purchase started from');
  assert.ok(WD.limitsOf(after).languages);
});

test('languages are a Plus feature', async () => {
  const db = freshDb(); const { w } = await setup(db);
  await assert.rejects(WD.updateWedding(w.id, { languages: ['en', 'hi'] }, db), (e) => e.status === 402);
  await assert.rejects(WD.updateEvent(w.id, w.eventOrder[0], { language: 'ur' }, db), (e) => e.status === 402);
  await B.markWeddingPaid(w.id, { purchaseId: 'p', plan: 'plus', method: 'stripe', amountCents: 9900 }, db);
  const ev = await WD.updateEvent(w.id, w.eventOrder[0], { language: 'ur', secondLanguage: 'en' }, db);
  assert.equal(ev.language, 'ur'); assert.equal(ev.secondLanguage, 'en');
});

test('DJ/MC licence: subscription checkout activates it; its weddings get Pro limits + branding; cancellation stops new weddings; renewals are revenue', async () => {
  const db = freshDb();
  const { token, id } = await B.createLicence({ email: 'dj@example.com', brandName: 'DJ Nova' }, db);
  await assert.rejects(B.requireLicence(token, db), (e) => e.status === 402, 'unpaid licence is inactive');
  process.env.ALLOW_MOCK_PAYMENTS = '1';
  const checkout = require('../../api/checkout.js');
  const r = await call(checkout, { body: { action: 'mock-complete', kind: 'dj', licenceToken: token } });
  assert.equal(r.statusCode, 200);
  const lic = await B.requireLicence(token, db);
  const handler = require('../../api/wedding.js');
  const c = await call(handler, { body: { action: 'create', licenceToken: token, couple: { names: ['Ana', 'Leo'] } } });
  assert.equal(c.statusCode, 201);
  assert.equal(c.body.wedding.plan, 'dj');
  assert.equal(c.body.wedding.limits.maxGuests, 500);
  assert.equal(c.body.wedding.brand.name, 'DJ Nova');
  const S = require('../../api/_lib/stripe');
  await S.handleStripeEvent({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_1', status: 'canceled', metadata: { licenceId: lic.id } } } }, db);
  await assert.rejects(B.requireLicence(token, db), (e) => e.status === 402);
  await S.handleStripeEvent({ type: 'invoice.paid', data: { object: { id: 'in_1', billing_reason: 'subscription_cycle', amount_paid: 19900, currency: 'usd', subscription_details: { metadata: { licenceId: id } } } } }, db);
  const purchases = await db.list('purchases');
  assert.equal(purchases.filter((p) => p.kind === 'dj').length, 2);
  delete process.env.ALLOW_MOCK_PAYMENTS;
});

test('Etsy wedding codes: right product only, single use', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const wcode = C.generateCode(); const pcode = C.generateCode();
  await db.set('codes', C.hashCode(C.normalizeCode(wcode)), { product: 'wedding_plus' });
  await db.set('codes', C.hashCode(C.normalizeCode(pcode)), { product: 'party' });
  await assert.rejects(B.redeemWeddingCode(pcode, w.id, db), (e) => e.code === 'wrong_product');
  const { event } = await require('../../api/_lib/events').createEvent({}, db);
  await assert.rejects(C.redeemCode(wcode, event.id, db), (e) => e.code === 'wrong_product');
  const r = await B.redeemWeddingCode(wcode, w.id, db);
  assert.equal(r.plan, 'plus');
  assert.equal(WD.planOf(await db.get('weddings', w.id)), 'plus');
  const other = await setup(db);
  await assert.rejects(B.redeemWeddingCode(wcode, other.w.id, db), (e) => e.status === 409);
});

test('AI: generated items are drafts until the host approves; respectful blocklist; translations kept', async () => {
  const db = freshDb(); const { w, token } = await setup(db);
  await B.markWeddingPaid(w.id, { purchaseId: 'p', plan: 'plus', method: 'stripe', amountCents: 9900 }, db);
  const [eid] = w.eventOrder;
  await WD.updateEvent(w.id, eid, { language: 'hi', secondLanguage: 'en' }, db);
  process.env.MOCK_AI = '1';
  const handler = require('../../api/wedding.js');
  const before = (await db.get(WD.col.events(w.id), eid)).items.length;
  const g = await call(handler, { body: { action: 'generate', w: w.id, token, eventId: eid, facts: ['Met at a wedding in Jaipur'] } });
  assert.equal(g.statusCode, 200, JSON.stringify(g.body));
  assert.ok(g.body.drafts.length >= 5);
  assert.ok(g.body.drafts[0].translations.hi.text.startsWith('[hi]'));
  assert.equal((await db.get(WD.col.events(w.id), eid)).items.length, before, 'drafts are not live');
  const approved = await call(handler, { body: { action: 'approve', w: w.id, token, eventId: eid, items: g.body.drafts.slice(0, 3) } });
  assert.equal(approved.body.event.items.length, 3);
  assert.equal(approved.body.event.drafts.length, 0);
  const AI = require('../../api/_lib/ai');
  for (const t of ['Who will handle the dowry talk?', 'Which caste is better?', 'When is the baby coming?', 'Funniest mother-in-law story', 'Sing the lyrics of your song']) assert.ok(AI.weddingHits(t).length, t);
  assert.equal(AI.weddingHits('Where did Asha and Rohan meet?').length, 0);
  delete process.env.MOCK_AI;
});

test('shoe game split: nobody scores, the room vote still shows', async () => {
  const db = freshDb(); const { w } = await setup(db);
  const receptionId = w.eventOrder[1];
  const gs = await joinN(db, w.code, 2, ['a', 'b']);
  await WD.startEvent(w.id, receptionId, db); await WD.openItem(w.id, 0, db);
  await WD.submitAnswer(w.id, { id: gs[0].guest.id, side: 'a' }, { eventId: receptionId, index: 0, choice: 0 }, db);
  await WD.submitAnswer(w.id, { id: gs[1].guest.id, side: 'b' }, { eventId: receptionId, index: 0, choice: 1 }, db);
  const live = await WD.reveal(w.id, { correct: -1 }, db);
  assert.equal(live.reveal.split, true);
  assert.equal(live.reveal.correct, null);
  assert.deepEqual(live.reveal.counts, [1, 1]);
  const scores = await db.get('wedding_scores', w.id);
  assert.equal(Object.values(scores.guests).reduce((a, b) => a + b, 0), 0);
});
