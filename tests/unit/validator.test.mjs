import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const AI = require('../../api/_lib/ai');
const { freshDb, call } = require('./helpers.cjs');
const E = require('../../api/_lib/events');

const q = (i, over = {}) => ({ question: `Question ${i}?`, options: [`A${i}`, `B${i}`, `C${i}`, `D${i}`], correct: i % 4, ...over });
const c = (i, over = {}) => ({ title: `Card ${i}`, text: `Do a fun thing number ${i}`, ...over });
const goodDeck = () => ({ questions: Array.from({ length: 16 }, (_, i) => q(i)), cards: Array.from({ length: 20 }, (_, i) => c(i)) });

test('validateDeck accepts a well-formed deck and trims whitespace', () => {
  const d = goodDeck(); d.questions[0].question = '  Spaced   out?  ';
  const v = AI.validateDeck(d);
  assert.equal(v.ok, true);
  assert.equal(v.value.questions.length, 16);
  assert.equal(v.value.cards.length, 20);
  assert.equal(v.value.questions[0].question, 'Spaced out?');
});

test('validateDeck drops bad items and reports why', () => {
  const d = goodDeck();
  d.questions[1] = q(1, { options: ['a', 'b', 'c'] });
  d.questions[2] = q(2, { correct: 4 });
  d.questions[3] = q(3, { options: ['x', 'X', 'y', 'z'] });
  d.questions[4] = q(4, { correct: 1.5 });
  d.cards[0] = c(0, { text: '' });
  d.cards[1] = c(1, { title: 'x'.repeat(41) });
  const v = AI.validateDeck(d);
  assert.equal(v.ok, true); // enough good items survive
  assert.equal(v.value.questions.length, 12);
  assert.equal(v.value.cards.length, 18);
  assert.ok(v.errors.some((e) => /questions\[1\]: needs exactly 4 options/.test(e)));
  assert.ok(v.errors.some((e) => /questions\[3\]: duplicate options/.test(e)));
  assert.ok(v.errors.some((e) => /questions\[4\]: correct index/.test(e)));
});

test('validateDeck rejects non-objects and decks with too few valid items', () => {
  assert.equal(AI.validateDeck(null).ok, false);
  assert.equal(AI.validateDeck([]).ok, false);
  assert.equal(AI.validateDeck({ questions: [q(1)], cards: [] }).ok, false);
  assert.equal(AI.validateDeck({ questions: 'nope', cards: {} }).ok, false);
});

test('blocklist catches body/weight, pregnancy loss, ex-partners, and sexual content by theme', () => {
  assert.ok(AI.blocklistHits('Who has gained the most weight?', 'baby-shower').length);
  assert.ok(AI.blocklistHits('Remember the miscarriage scare?', 'baby-shower').length);
  assert.ok(AI.blocklistHits("Name the bride's ex-boyfriend", 'bridal-shower').length);
  assert.ok(AI.blocklistHits('Sexy lingerie guessing game', 'bridal-shower').length);
  assert.ok(AI.blocklistHits('Who takes the most tequila shots?', 'baby-shower').length);
  assert.equal(AI.blocklistHits('What was her first job?', 'bridal-shower').length, 0);
  assert.equal(AI.blocklistHits('Take two sips', 'kings-cup').length, 0);
});

function fakeClient(responses) {
  const calls = [];
  return {
    calls,
    messages: { async create(p) { calls.push(p); const r = responses.shift(); if (r instanceof Error) throw r; return typeof r === 'function' ? r(p) : r; } },
  };
}
const msg = (obj, stop = 'end_turn') => ({ stop_reason: stop, usage: { input_tokens: 1000, output_tokens: 2000 }, content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] });
const clean = msg({ flagged: [] });

test('generateDeck sends the schema to claude-sonnet-5 and returns 12 questions + spares + 20 cards', async () => {
  const client = fakeClient([msg(goodDeck()), clean]);
  const out = await AI.generateDeck({ theme: 'baby-shower', honoree: { names: ['Sam', 'Alex'] }, facts: ['Met in Lisbon'] }, { client });
  assert.equal(client.calls[0].model, 'claude-sonnet-5');
  assert.equal(client.calls[0].output_config.format.type, 'json_schema');
  assert.deepEqual(client.calls[0].output_config.format.schema, AI.DECK_SCHEMA);
  assert.match(client.calls[0].messages[0].content, /<facts>\n1\. Met in Lisbon\n<\/facts>/);
  assert.equal(client.calls[1].model, 'claude-haiku-4-5');
  assert.equal(out.questions.length, 12);
  assert.equal(out.spares.length, 4);
  assert.equal(out.cards.length, 20);
  assert.equal(out.attempts, 1);
  // 2 calls: sonnet 1000 in / 2000 out = $0.022, haiku = $0.011
  assert.equal(Math.round(out.costUsd * 1000), 33);
});

test('generateDeck retries once on invalid JSON, then succeeds', async () => {
  const client = fakeClient([msg('{not json'), msg(goodDeck()), clean]);
  const out = await AI.generateDeck({ theme: 'bridal-shower', facts: [] }, { client });
  assert.equal(out.attempts, 2);
  assert.match(client.calls[1].messages[0].content, /avoid these: invalid JSON/);
});

test('generateDeck retries when validation fails and gives up after the second failure', async () => {
  const client = fakeClient([msg({ questions: [], cards: [] }), msg({ questions: [q(1)], cards: [] })]);
  await assert.rejects(AI.generateDeck({ theme: 'baby-shower', facts: [] }, { client }), (e) => e.status === 502 && e.usage.length === 2);
});

test('refusals and truncation count as failures', async () => {
  const client = fakeClient([msg('', 'refusal'), msg('{"questions":[', 'max_tokens')]);
  await assert.rejects(AI.generateDeck({ theme: 'baby-shower', facts: [] }, { client }), /safe, complete deck/);
});

test('blocklisted and reviewer-flagged items are removed before returning', async () => {
  const d = goodDeck();
  d.questions[0] = q(0, { question: 'Guess her pre-pregnancy weight?' });
  d.cards[3] = c(3, { text: 'Tell us about your ex' });
  // Reviewer ids index the deck it was shown (after the blocklist removed q0), so q1 = "Question 2?".
  const client = fakeClient([msg(d), msg({ flagged: [{ id: 'q1', reason: 'mentions a celebrity' }] })]);
  const out = await AI.generateDeck({ theme: 'baby-shower', facts: [] }, { client });
  const all = [...out.questions, ...out.spares].map((x) => x.question);
  assert.ok(!all.some((t) => /weight/.test(t)));
  assert.ok(!all.includes('Question 2?'));
  assert.ok(all.includes('Question 1?'));
  assert.equal(all.length, 14);
  assert.ok(!out.cards.some((x) => /ex\b/.test(x.text)));
  assert.equal(out.removedCount, 3);
});

test('if filtering leaves too little, it regenerates with the reasons', async () => {
  const bad = goodDeck(); bad.questions = bad.questions.map((x, i) => (i < 10 ? q(i, { question: `How much weight ${i}?` }) : x));
  const client = fakeClient([msg(bad), clean, msg(goodDeck()), clean]);
  const out = await AI.generateDeck({ theme: 'baby-shower', facts: [] }, { client });
  assert.equal(out.attempts, 2);
  assert.match(client.calls[2].messages[0].content, /blocklist: weight/);
});

test('moderation outage is fail-open but reported', async () => {
  const client = fakeClient([msg(goodDeck()), new Error('overloaded')]);
  const out = await AI.generateDeck({ theme: 'baby-shower', facts: [] }, { client });
  assert.equal(out.moderation, 'unavailable');
});

test('/api/generate-deck: free events get 1 generation, failures are refunded, cost is logged', async () => {
  const db = freshDb();
  const ai = require('../../api/_lib/ai');
  let mode = 'fail';
  ai.getClient = () => (mode === 'fail' ? fakeClient([msg('x'), msg('y')]) : fakeClient([msg(goodDeck()), clean]));
  const handler = require('../../api/generate-deck.js');
  const { event, hostToken } = await E.createEvent({ theme: 'baby-shower' }, db);
  const body = { id: event.id, token: hostToken, facts: ['Loves hiking'] };
  const failed = await call(handler, { body });
  assert.equal(failed.statusCode, 502);
  assert.equal((await db.get('events', event.id)).generations, 0); // refunded
  mode = 'ok';
  const ok = await call(handler, { body });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.questions.length, 12);
  assert.equal(ok.body.event.generationsLeft, 0);
  const limited = await call(handler, { body });
  assert.equal(limited.statusCode, 429);
  const ev = await db.get('events', event.id);
  assert.ok(ev.aiCostUsd > 0);
  const calls = await db.list('ai_calls');
  assert.equal(calls.length, 4); // 2 failed + generate + moderate
  assert.ok(calls.every((x) => typeof x.costUsd === 'number' && x.model));
  const wrong = await call(handler, { body: { ...body, token: 'nope' } });
  assert.equal(wrong.statusCode, 403);
});

test('/api/generate-deck: a paid event gets 3 generations', async () => {
  const db = freshDb();
  const ai = require('../../api/_lib/ai');
  ai.getClient = () => fakeClient([msg(goodDeck()), clean]);
  const handler = require('../../api/generate-deck.js');
  const { event, hostToken } = await E.createEvent({}, db);
  await E.markEventPaid(event.id, { purchaseId: 'p1', method: 'stripe', amountCents: 1299 }, db);
  const codes = [];
  for (let i = 0; i < 4; i++) codes.push((await call(handler, { body: { id: event.id, token: hostToken } })).statusCode);
  assert.deepEqual(codes, [200, 200, 200, 429]);
});
