import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { freshDb } = require('./helpers.cjs');
const WD = require('../../api/_lib/wedding');
const G = require('../../api/_lib/games');

const okAll = { texts: async (l) => ({ ok: l.map(() => true) }), images: async (l) => ({ ok: l.map(() => true) }) };

async function setup(items, n = 4) {
  const db = freshDb();
  const { wedding: w } = await WD.createWedding({ couple: { names: ['Asha', 'Rohan'] }, events: [{ type: 'sangeet' }] }, db);
  const eid = w.eventOrder[0];
  await WD.updateEvent(w.id, eid, { items }, db);
  const gs = [];
  for (let i = 0; i < n; i++) gs.push((await WD.joinWedding({ code: w.code, name: 'G' + i, side: i % 2 ? 'b' : 'a', avatar: '🦊' }, db)).guest);
  await WD.startEvent(w.id, eid, db);
  const live = await WD.openItem(w.id, 0, db);
  return { db, w, eid, gs, live };
}
const sub = (db, w, g, live, extra) => G.submit(w.id, g, { run: live.game.run, stage: live.stage, ...extra }, db);
const pts = async (db, w, g) => (await db.get('wedding_scores', w.id)).guests[g.id] || 0;

test('pure scoring: quip shares + sweep, liar scaling, pulse closeness, doodle share', () => {
  assert.deepEqual(G.quipPoints(3, 1), { pts: 1250, win: true, sweep: false });
  assert.deepEqual(G.quipPoints(4, 0), { pts: 2000, win: true, sweep: true });
  assert.equal(G.quipPoints(0, 0).pts, 250);
  assert.equal(G.liarPoints(2, 10), 1000);
  assert.equal(G.liarPoints(100, 500), 2000); // scaled down for big rooms
  assert.equal(G.liarPoints(50, 50), 3000); // capped
  assert.equal(G.pulsePoints(40, 40), 1250);
  assert.equal(G.pulsePoints(10, 60), 0);
  assert.equal(G.doodlePoints(3, 6, true), 2000);
});

test('fib: lies too close to the truth are refused (typos and containment too)', () => {
  assert.ok(G.tooClose('Pani puri', 'pani-puri'));
  assert.ok(G.tooClose('pani puree', 'Pani puri'));
  assert.ok(G.tooClose('spicy pani puri', 'Pani puri'));
  assert.ok(!G.tooClose('Dosa', 'Pani puri'));
});

test('game items: fib truth is hidden from the live doc; invalid items are dropped', async () => {
  assert.equal(WD.cleanItem({ kind: 'fib', text: 'They ate ___' }), null);
  const c = WD.cleanItem({ kind: 'fib', text: 'On their first date they ate ___', answer: 'Pani puri', decoys: ['Pizza', 'pani puri!'] });
  assert.deepEqual(c.decoys, ['Pizza']);
  const { live } = await setup([c]);
  assert.equal(live.stage, 'write'); assert.equal(live.item.answer, undefined); assert.equal(live.item.decoys, undefined);
});

test('Quip Clash: write → cross-side matchups → votes (own quip blocked) → points → game over', async () => {
  const { db, w, gs, live } = await setup([{ kind: 'quip', text: 'The real reason Rohan proposed: ___' }], 6);
  for (const [i, g] of gs.entries()) assert.equal((await sub(db, w, g, live, { text: `Answer number ${i}` })).ok, true);
  await assert.rejects(sub(db, w, gs[0], live, { text: 'too late to change' }).then((r) => { if (r.duplicate) throw new Error('dup'); }), /dup/);
  await assert.rejects(G.submit(w.id, gs[0], { run: live.game.run, stage: 'write', text: 'ask the dowry' }, db), /family-friendly/);
  let l = await G.advance(w.id, WD, { moderator: okAll }, db);
  assert.equal(l.stage, 'clash'); assert.equal(l.game.total, 3);
  assert.equal(l.game.matchup.a.gid, undefined, 'authors stay hidden while voting');
  const st = await db.get(G.col.games(w.id), l.game.run);
  for (const [a, b] of st.matchups) assert.notEqual(a.side, b.side, 'bride side vs groom side');
  const [A, B] = st.matchups[0];
  await assert.rejects(G.submit(w.id, gs.find((g) => g.id === A.gid), { run: l.game.run, stage: 'clash', choice: 0 }, db), /your quip/);
  const voters = gs.filter((g) => g.id !== A.gid && g.id !== B.gid);
  for (const g of voters) await G.submit(w.id, g, { run: l.game.run, stage: 'clash', choice: 0 }, db);
  l = await G.advance(w.id, WD, {}, db);
  assert.equal(l.stage, 'clashResult'); assert.equal(l.game.result.winner, 0); assert.equal(l.game.result.sweep, true);
  assert.equal(l.game.matchup.a.name.startsWith('G'), true, 'authors revealed after the vote');
  assert.equal(await pts(db, w, { id: A.gid }), 100 + 2000);
  await assert.rejects(G.advance(w.id, WD, {}, db).then(() => G.advance(w.id, WD, {}, db)).then(() => G.advance(w.id, WD, {}, db)).then(() => G.advance(w.id, WD, {}, db)).then(() => G.advance(w.id, WD, {}, db)).then(() => G.advance(w.id, WD, {}, db)), /finished/);
  const end = await db.get('wedding_live', w.id);
  assert.equal(end.stage, 'gameOver'); assert.ok(end.game.best.text);
});

test('Fib Finder: truth + lies, own lie blocked, truth-finders and liars score', async () => {
  const item = WD.cleanItem({ kind: 'fib', text: 'On their first date, Asha and Rohan ate ___', answer: 'Pani puri', decoys: ['Pizza', 'Sushi'] });
  const { db, w, gs, live } = await setup([item], 4);
  await assert.rejects(sub(db, w, gs[0], live, { text: 'pani-puri' }), /sneakier/);
  await sub(db, w, gs[0], live, { text: 'Dosa' });
  await sub(db, w, gs[1], live, { text: 'dosa' }); // same lie: merged, both authors credited
  await sub(db, w, gs[2], live, { text: 'Ice cream' });
  let l = await G.advance(w.id, WD, { moderator: okAll }, db);
  assert.equal(l.stage, 'pick');
  const opts = l.game.options; assert.ok(opts.includes('Pani puri')); assert.ok(opts.includes('Pizza') || opts.includes('Sushi'), 'decoys fill a thin field');
  assert.equal(opts.filter((o) => o.toLowerCase() === 'dosa').length, 1);
  const dosa = opts.findIndex((o) => o.toLowerCase() === 'dosa'); const truth = opts.indexOf('Pani puri');
  await assert.rejects(G.submit(w.id, gs[0], { run: l.game.run, stage: 'pick', choice: dosa }, db), /own lie/);
  await G.submit(w.id, gs[2], { run: l.game.run, stage: 'pick', choice: dosa }, db);
  await G.submit(w.id, gs[3], { run: l.game.run, stage: 'pick', choice: truth }, db);
  l = await G.advance(w.id, WD, {}, db);
  assert.equal(l.stage, 'fibReveal');
  const r = l.game.reveal[dosa]; assert.equal(r.count, 1); assert.equal(r.authors.length, 2);
  assert.equal(await pts(db, w, gs[3]), 1000);
  assert.equal(await pts(db, w, gs[0]), 100 + 500);
  assert.equal(await pts(db, w, gs[1]), 100 + 500);
});

test('Doodle Duel without automatic moderation: the host reviews, then the gallery vote scores artists', async () => {
  const { db, w, gs, live } = await setup([{ kind: 'doodle', text: 'Draw Rohan\'s best dance move' }], 3);
  const line = (k) => [{ c: k, w: 1, p: [10, 10, 30, 30, 60, 60, 90, 50, 120, 40, 150, 90, 200, 200, 120, 210, 30, 220] }];
  await assert.rejects(sub(db, w, gs[0], live, { strokes: [] }), /Draw something/);
  for (const [i, g] of gs.entries()) await sub(db, w, g, live, { strokes: line(i) });
  let l = await G.advance(w.id, WD, { moderator: null }, db);
  assert.equal(l.stage, 'review');
  const hs = await G.hostState(w.id, db); assert.equal(hs.game.review.length, 3);
  l = await G.review(w.id, WD, [0, 1, 2], db);
  assert.equal(l.stage, 'gallery'); assert.equal(l.game.finalists.length, 3);
  const art = await db.get('wedding_art', l.game.art); assert.equal(art.art.length, 3);
  const st = await db.get(G.col.games(w.id), l.game.run);
  const target = st.finalists.findIndex((f) => f.gid !== gs[0].id && f.gid !== gs[1].id);
  await G.submit(w.id, gs[0], { run: l.game.run, stage: 'gallery', choice: target }, db);
  await G.submit(w.id, gs[1], { run: l.game.run, stage: 'gallery', choice: target }, db);
  l = await G.advance(w.id, WD, {}, db);
  assert.equal(l.stage, 'galleryResult'); assert.deepEqual(l.game.winners, [target]);
  assert.equal(await pts(db, w, { id: st.finalists[target].gid }), 100 + 3000);
});

test('Crowd Pulse: weighted yes %, closeness scoring, closest guesses', async () => {
  const { db, w, gs, live } = await setup([{ kind: 'pulse', text: 'Have you ever cried at a wedding?' }], 4);
  await sub(db, w, gs[0], live, { yes: true, guess: 50 });
  await sub(db, w, gs[1], live, { yes: false, guess: 10 });
  await sub(db, w, gs[2], live, { yes: true, guess: 75 });
  await sub(db, w, gs[3], live, { yes: true, guess: 90 });
  await assert.rejects(G.submit(w.id, gs[0], { run: live.game.run, stage: 'poll', yes: 'maybe', guess: 5 }, db), /yes or no/);
  const l = await G.advance(w.id, WD, {}, db);
  assert.equal(l.stage, 'pulseReveal'); assert.equal(l.game.actual, 75);
  assert.equal(l.game.closest[0].guess, 75);
  assert.equal(await pts(db, w, gs[2]), 1250);
  assert.equal(await WD.answeredCount(w.id, db), 0);
});

test('moderation removes flagged quips before they reach the screen; a double advance is refused', async () => {
  const { db, w, gs, live } = await setup([{ kind: 'quip', text: 'Best wedding snack: ___' }], 4);
  for (const [i, g] of gs.entries()) await sub(db, w, g, live, { text: i === 0 ? 'something rude' : `Samosa ${i}` });
  const flagRude = { texts: async (l) => ({ ok: l.map((t) => !/rude/.test(t)) }) };
  const [a, b] = await Promise.allSettled([G.advance(w.id, WD, { moderator: flagRude }, db), G.advance(w.id, WD, { moderator: flagRude }, db)]);
  assert.equal([a, b].filter((r) => r.status === 'rejected').length, 1);
  const st = await db.get(G.col.games(w.id), live.game.run);
  assert.ok(st.matchups.flat().every((q) => !/rude/.test(q.text)));
});
