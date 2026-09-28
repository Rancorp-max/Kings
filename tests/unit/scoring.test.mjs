import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreAnswer, rankPlayers, tallyAnswers, validateQuestion, scorePredictions, QUESTION_MS } from '../../public/js/quiz-core.js';

test('wrong answers score zero regardless of speed', () => {
  assert.equal(scoreAnswer({ correct: false, elapsedMs: 0 }), 0);
});

test('correct answers: 1000 instantly, 500 at the buzzer, linear in between', () => {
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 0 }), 1000);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: QUESTION_MS }), 500);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: QUESTION_MS / 2 }), 750);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 5000, limitMs: 20000 }), 875);
});

test('elapsed time is clamped (late packets / clock skew never go below 500 or above 1000)', () => {
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 99999 }), 500);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: -50 }), 1000);
  assert.equal(scoreAnswer({ correct: true, elapsedMs: 'garbage' }), 1000);
});

test('rankPlayers uses competition ranking for ties', () => {
  const players = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bo' }, { id: 'c', name: 'Cy' }, { id: 'd', name: 'Di' }];
  const rows = rankPlayers({ a: 900, b: 1500, c: 900 }, players);
  assert.deepEqual(rows.map((r) => [r.id, r.rank, r.score]), [['b', 1, 1500], ['a', 2, 900], ['c', 2, 900], ['d', 4, 0]]);
});

test('tallyAnswers counts choices and correct players', () => {
  const t = tallyAnswers({ a: { choice: 1 }, b: { choice: 1 }, c: { choice: 3 }, d: { choice: 9 } }, 1);
  assert.deepEqual(t.counts, [0, 2, 0, 1]);
  assert.deepEqual(t.correctIds.sort(), ['a', 'b']);
});

test('validateQuestion catches incomplete host edits', () => {
  assert.equal(validateQuestion({ question: 'Q?', options: ['a', 'b', 'c', 'd'], correct: 2 }), null);
  assert.match(validateQuestion({ question: '', options: ['a', 'b', 'c', 'd'], correct: 0 }), /Write/);
  assert.match(validateQuestion({ question: 'Q', options: ['a', 'A', 'c', 'd'], correct: 0 }), /different/);
  assert.match(validateQuestion({ question: 'Q', options: ['a', '', 'c', 'd'], correct: 0 }), /Fill/);
  assert.match(validateQuestion({ question: 'Q', options: ['a', 'b', 'c', 'd'], correct: 4 }), /correct/);
  assert.equal(validateQuestion({ question: 'Who said it?', options: ['Mom', 'Dad'], correct: 1 }, { options: 2 }), null);
});

test('scorePredictions: closest guess wins each field, ties share, time wraps midnight', () => {
  const entries = [
    { name: 'Ann', answers: { date: '2026-11-10', time: '23:50', weight: '7.5', hair: 'Dark' } },
    { name: 'Bo', answers: { date: '2026-11-14', time: '00:30', weight: '7.1', hair: 'brown' } },
    { name: 'Cy', answers: { date: '2026-11-08', time: '12:00', weight: '7.1', hair: 'Blonde' } },
  ];
  const r = scorePredictions(entries, { date: '2026-11-12', time: '00:05', weight: '7.2', hair: 'Brown' });
  assert.deepEqual(r.perField.date.sort(), ['Ann', 'Bo']); // both 2 days away
  assert.deepEqual(r.perField.time, ['Ann']); // 15 min across midnight beats 25 min
  assert.deepEqual(r.perField.weight.sort(), ['Bo', 'Cy']);
  assert.deepEqual(r.perField.hair, ['Bo']); // case-insensitive exact match
  assert.deepEqual(r.perField.eyes, []);
  assert.equal(r.leaderboard[0].name, 'Bo');
  assert.equal(r.leaderboard[0].wins, 3);
});
