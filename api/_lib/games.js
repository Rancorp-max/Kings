'use strict';
/* Party games for weddings, in the style of Jackbox: guests write, draw or guess
 * on their phones, the big screen puts the answers head to head, and the whole
 * room votes. Four games, each a small state machine the host advances:
 *
 *   quip   Quip Clash    write → [review] → clash ⇄ clashResult (×3) → gameOver
 *   fib    Fib Finder    write → [review] → pick → fibReveal
 *   doodle Doodle Duel   draw  → [review] → gallery → galleryResult
 *   pulse  Crowd Pulse   poll  → pulseReveal
 *
 * Scale: every submission and vote is its own doc (exclusive create, so retries
 * are safe). Tallies happen once per phase on the server. Only a few answers
 * ever reach the big screen, so only those are moderated (one batched model
 * call). If moderation is unavailable, the host approves them ("review").
 *
 * Private per-round state (authors, the truth, candidates) lives in
 * weddings/{wid}/games/{runId}; the public live doc only carries what screens
 * may show at the current phase.
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const { site } = require('./config');
const { httpError } = require('./http');
const { randomId, clip } = require('./events');
const { weddingHits } = require('./ai');

const KINDS = ['quip', 'fib', 'doodle', 'pulse'];
const FIRST = { quip: 'write', fib: 'write', doodle: 'draw', pulse: 'poll' };
const MS = { quip: 60000, fib: 45000, doodle: 75000, pulse: 25000, clash: 15000, clashResult: 7000, pick: 20000, gallery: 25000 };
const INPUT_STAGES = new Set(['write', 'draw', 'poll']);
const VOTE_STAGES = new Set(['clash', 'pick', 'gallery']);
const GAME_STAGES = new Set(['write', 'draw', 'poll', 'review', 'clash', 'clashResult', 'pick', 'fibReveal', 'gallery', 'galleryResult', 'pulseReveal', 'gameOver']);
const MAXLEN = { quip: 60, fib: 40 };
const MATCHUPS = 3; const LIES = 7; const FINALISTS = 6; const SAMPLE = 16;
const PALETTE = 8; const WIDTHS = 3;
const col = {
  games: (wid) => `weddings/${wid}/games`,
  subs: (wid, run) => `weddings/${wid}/gsubs_${run}`,
  votes: (wid, run, round) => `weddings/${wid}/gvotes_${run}_${round}`,
};
const now = () => Date.now();

// ---------------------------------------------------------------- pure helpers (unit-tested)
function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim(); }
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
// A lie that is really the truth (or a typo of it) is refused, like in Fibbage.
function tooClose(lie, truth) {
  const a = norm(lie); const b = norm(truth);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 4 && (a.includes(b) || (a.length >= 4 && b.includes(a)))) return true;
  return b.length >= 5 && editDistance(a, b) <= 2;
}
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(0, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

// Quip Clash: points for one matchup side. share = its fraction of the (weighted) votes.
function quipPoints(votes, other) {
  const total = votes + other;
  if (!total) return { pts: 250, win: false, sweep: false }; // nobody voted: both get something for writing
  const share = votes / total;
  const win = votes > other; const sweep = win && other === 0 && total >= 2;
  return { pts: Math.round(1000 * share) + (win ? 500 : 0) + (sweep ? 500 : 0), win, sweep };
}
// Fib Finder: each liar earns for everyone they fooled, scaled so a 500-guest room doesn't dwarf other rounds.
function liarPoints(fooled, pickers) { return Math.min(3000, Math.round(500 * fooled * Math.min(1, 20 / Math.max(1, pickers)))); }
const TRUTH_POINTS = 1000;
// Crowd Pulse: closeness to the real percentage.
function pulsePoints(guess, actual) { const d = Math.abs(guess - actual); return Math.max(0, Math.round(1000 - 20 * d)) + (d <= 2 ? 250 : 0); }
// Doodle Duel: share of the gallery vote + a winner bonus.
function doodlePoints(votes, total, win) { return (total ? Math.round(2000 * votes / total) : 0) + (win ? 1000 : 0); }

// Pair quips across sides where possible (bride's side vs groom's side makes a better show).
function pairUp(list, n = MATCHUPS) {
  const pool = shuffle(list); const out = [];
  while (pool.length >= 2 && out.length < n) {
    const a = pool.shift();
    let j = pool.findIndex((x) => x.side !== a.side && x.gid !== a.gid);
    if (j < 0) j = pool.findIndex((x) => x.gid !== a.gid);
    if (j < 0) break;
    out.push([a, pool.splice(j, 1)[0]]);
  }
  return out;
}

// Doodles: [{c: colour 0-7, w: width 0-2, p: [x,y,x,y,…] in a 0–255 grid}]
function cleanStrokes(strokes) {
  if (!Array.isArray(strokes)) return null;
  let points = 0; const out = [];
  for (const s of strokes.slice(0, 80)) {
    if (!s || !Array.isArray(s.p) || s.p.length < 2) continue;
    const p = s.p.slice(0, 1200).map((v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0))));
    if (p.length % 2) p.pop();
    points += p.length / 2; if (points > 2500) break;
    out.push({ c: Math.max(0, Math.min(PALETTE - 1, s.c | 0)), w: Math.max(0, Math.min(WIDTHS - 1, s.w | 0)), p });
  }
  return out.length ? { strokes: out, points } : null;
}
const validPng = (s) => typeof s === 'string' && s.length < 90000 && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s);

// ---------------------------------------------------------------- items
function cleanGameItem(it, clean) {
  const out = { kind: it.kind, text: clip(it.text, 160) };
  if (!out.text) return null;
  if (it.kind === 'fib') {
    out.answer = clip(it.answer, MAXLEN.fib); if (!out.answer) return null;
    out.decoys = (Array.isArray(it.decoys) ? it.decoys : []).map((d) => clip(d, MAXLEN.fib)).filter((d) => d && !tooClose(d, out.answer)).slice(0, 4);
  }
  if (it.kind === 'pulse') out.question = clip(it.question, 120) || out.text;
  return clean ? clean(out) : out;
}
const publicGameItem = ({ answer, decoys, ...rest }) => rest; // eslint-disable-line no-unused-vars

// ---------------------------------------------------------------- engine
function guestCard(g) { return { gid: g.gid || g.id, name: g.name, avatar: g.avatar, color: g.color, side: g.side }; }

async function openGame(wid, W, live, ev, it, index, db) {
  const run = randomId(8); const kind = it.kind; const ms = MS[kind]; const t = now();
  await db.set(col.games(wid), run, { id: run, kind, eventId: ev.id, index, phase: FIRST[kind], truth: it.answer || null, decoys: it.decoys || [], createdAt: t });
  return W.setLive(wid, (cur) => ({
    ...cur, stage: FIRST[kind], index, item: { ...publicGameItem(it), index }, openedAt: t, deadline: t + ms, durationMs: ms,
    reveal: null, board: null, answered: 0, recent: [], game: { kind, run, round: 0 },
  }), db);
}

/* Guest input for the current phase. Returns {ok, duplicate} or throws a friendly 4xx. */
async function submit(wid, g, b, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  const game = live?.game;
  if (!game || game.run !== b.run || live.stage !== b.stage || !(INPUT_STAGES.has(live.stage) || VOTE_STAGES.has(live.stage))) return { ok: false, reason: 'closed' };
  const t = now();
  if (live.deadline && t > live.deadline + site.weddings.answerGraceMs) return { ok: false, reason: 'late' };
  const who = { side: g.side, weight: g.group || 1, name: g.name, avatar: g.avatar, color: g.color, at: t };
  let doc; let path = col.subs(wid, game.run);
  if (live.stage === 'write') {
    const max = MAXLEN[game.kind] || 60;
    const text = clip(b.text, max);
    if (!text) throw httpError(400, 'Write something first.', 'empty');
    if (weddingHits(text).length) throw httpError(422, 'Let\'s keep it family-friendly — try another answer.', 'unkind');
    if (game.kind === 'fib') {
      const st = await db.get(col.games(wid), game.run);
      if (tooClose(text, st?.truth)) throw httpError(422, 'Too close to the real answer — write a sneakier lie!', 'too_close');
    }
    doc = { ...who, text };
  } else if (live.stage === 'draw') {
    const s = cleanStrokes(b.strokes);
    if (!s || s.points < 4) throw httpError(400, 'Draw something first.', 'empty');
    doc = { ...who, strokes: s.strokes, points: s.points, png: validPng(b.png) ? b.png : null };
  } else if (live.stage === 'poll') {
    const guess = Math.round(Number(b.guess));
    if (typeof b.yes !== 'boolean' || !(guess >= 0 && guess <= 100)) throw httpError(400, 'Answer yes or no and make a guess.', 'empty');
    doc = { ...who, yes: b.yes, guess };
  } else {
    const choice = Number(b.choice);
    const n = live.stage === 'clash' ? 2 : live.stage === 'pick' ? (game.options || []).length : (game.finalists || []).length;
    if (!Number.isInteger(choice) || choice < 0 || choice >= n) throw httpError(400, 'Invalid choice');
    const st = await db.get(col.games(wid), game.run);
    const own = live.stage === 'clash' ? st.matchups?.[game.round]?.some((q) => q.gid === g.id)
      : live.stage === 'pick' ? st.options?.[choice]?.authors?.some((a) => a.gid === g.id)
        : st.finalists?.[choice]?.gid === g.id;
    if (own && live.stage === 'clash') throw httpError(409, 'That\'s your quip — let the room decide!', 'own');
    if (own) throw httpError(409, live.stage === 'pick' ? 'That\'s your own lie!' : 'You can\'t vote for your own drawing.', 'own');
    path = col.votes(wid, game.run, game.round || 0);
    doc = { ...who, choice };
  }
  const created = await db.create(path, g.id, doc);
  return { ok: true, duplicate: !created };
}

async function lock(wid, run, expect, db) {
  return db.update(col.games(wid), run, (cur) => {
    if (!cur) throw httpError(404, 'Round not found');
    if (cur.phase !== expect) throw httpError(409, 'This round already moved on.', 'moved_on');
    if (cur.lock && now() - cur.lock < 20000) throw httpError(409, 'Working on it…', 'busy');
    return { ...cur, lock: now() };
  });
}
const unlock = (wid, run, patch, db) => db.update(col.games(wid), run, (cur) => ({ ...cur, ...patch, lock: 0 }));

/* Host: move the current game to its next phase. `moderator` = { texts(list) -> {ok: bool[]|null, usage}, images(list) -> … }. */
async function advance(wid, W, { moderator } = {}, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  const game = live?.game;
  if (!game || !GAME_STAGES.has(live.stage)) throw httpError(400, 'No party game is running.');
  if (['fibReveal', 'galleryResult', 'pulseReveal', 'gameOver'].includes(live.stage)) throw httpError(400, 'This game is finished — open the next round.', 'finished');
  if (live.stage === 'review') throw httpError(400, 'Approve the answers first.', 'needs_review');
  const st = await lock(wid, game.run, live.stage, db);
  try {
    return await step(wid, W, live, st, { moderator }, db);
  } catch (e) {
    await unlock(wid, game.run, {}, db);
    throw e;
  }
}

async function step(wid, W, live, st, { moderator }, db) {
  const game = live.game; const w = await db.get('weddings', wid); const t = now();
  const go = async (stage, gamePatch, { ms = 0, statePatch = {}, gains = null, played = [] } = {}) => {
    if (gains) await addPoints(wid, W, live.eventId, gains, played, db);
    await unlock(wid, game.run, { ...statePatch, phase: stage }, db);
    return W.setLive(wid, (cur) => ({ ...cur, stage, game: { ...cur.game, ...gamePatch }, deadline: ms ? t + ms : null, durationMs: ms || null, openedAt: t, answered: 0, recent: [] }), db);
  };

  switch (live.stage) {
    case 'write': case 'draw': {
      const subs = await db.list(col.subs(wid, game.run));
      const played = subs.map((s) => ({ id: s.id, side: s.side }));
      const participation = Object.fromEntries(subs.map((s) => [s.id, { pts: 100, side: s.side }])); // for playing
      let cands;
      if (game.kind === 'fib') {
        const groups = new Map();
        for (const s of subs) { const k = norm(s.text); if (!k) continue; if (!groups.has(k)) groups.set(k, { text: s.text, authors: [] }); groups.get(k).authors.push(guestCard(s)); }
        cands = shuffle([...groups.values()]).slice(0, SAMPLE);
      } else if (game.kind === 'quip') {
        const seen = new Set();
        cands = shuffle(subs).filter((s) => { const k = norm(s.text); if (!k || seen.has(k)) return false; seen.add(k); return true; }).slice(0, SAMPLE)
          .map((s) => ({ ...guestCard(s), text: s.text }));
      } else {
        cands = shuffle(subs.filter((s) => s.points >= 8)).slice(0, 12).map((s) => ({ ...guestCard(s), strokes: s.strokes, png: s.png }));
      }
      let ok = null;
      if (cands.length && moderator) {
        const m = game.kind === 'doodle' ? await moderator.images(cands.map((c) => c.png)) : await moderator.texts(cands.map((c) => c.text));
        ok = m?.ok || null;
      }
      if (cands.length && !ok) {
        // No automatic check available: the host approves what goes on the big screen.
        await addPoints(wid, W, live.eventId, participation, played, db);
        await unlock(wid, game.run, { phase: 'review', review: cands }, db);
        return W.setLive(wid, (cur) => ({ ...cur, stage: 'review', deadline: null, durationMs: null, game: { ...cur.game, reviewCount: cands.length } }), db);
      }
      const approved = cands.length ? cands.filter((_, i) => ok[i]) : [];
      return proceed(wid, W, live, st, approved, { go, gains: participation, played }, db);
    }
    case 'clash': {
      const m = st.matchups[game.round];
      const votes = await db.list(col.votes(wid, game.run, game.round));
      const counts = [0, 0]; const voters = [[], []];
      for (const v of votes) { counts[v.choice] += v.weight || 1; if (voters[v.choice].length < 14) voters[v.choice].push({ avatar: v.avatar, color: v.color }); }
      const ra = quipPoints(counts[0], counts[1]); const rb = quipPoints(counts[1], counts[0]);
      const gains = {}; add(gains, m[0], ra.pts); add(gains, m[1], rb.pts);
      const result = { counts, winner: ra.win ? 0 : rb.win ? 1 : -1, sweep: ra.sweep || rb.sweep, pts: [ra.pts, rb.pts] };
      const results = [...(st.results || [])]; results[game.round] = { ...result, a: m[0], b: m[1] };
      return go('clashResult', { matchup: { a: m[0], b: m[1] }, result, voters }, { ms: MS.clashResult, statePatch: { results }, gains, played: votes.map((v) => ({ id: v.id, side: v.side })) });
    }
    case 'clashResult': {
      const next = game.round + 1;
      if (next < st.matchups.length) {
        const m = st.matchups[next];
        return go('clash', { round: next, matchup: { a: { text: m[0].text }, b: { text: m[1].text } }, result: null, voters: null }, { ms: MS.clash });
      }
      const all = (st.results || []).flatMap((r) => [{ ...r.a, pts: r.pts[0], votes: r.counts[0], total: r.counts[0] + r.counts[1] }, { ...r.b, pts: r.pts[1], votes: r.counts[1], total: r.counts[0] + r.counts[1] }]);
      const best = all.sort((x, y) => y.pts - x.pts || y.votes - x.votes)[0] || null;
      return go('gameOver', { best, recap: all.slice(0, 6).map(({ text, name, avatar, color, side, pts }) => ({ text, name, avatar, color, side, pts })) });
    }
    case 'pick': {
      const votes = await db.list(col.votes(wid, game.run, 0));
      const opts = st.options; const counts = opts.map(() => 0); const pickers = opts.map(() => []);
      let total = 0;
      for (const v of votes) { const wgt = v.weight || 1; counts[v.choice] += wgt; total += wgt; if (pickers[v.choice].length < 12) pickers[v.choice].push({ avatar: v.avatar, color: v.color, name: v.name }); }
      const gains = {};
      for (const v of votes) if (opts[v.choice]?.truth) add(gains, v, TRUTH_POINTS);
      opts.forEach((o, i) => { if (!o.truth) for (const a of o.authors) add(gains, a, liarPoints(counts[i], total)); });
      const reveal = opts.map((o, i) => ({ text: o.text, truth: !!o.truth, count: counts[i], pickers: pickers[i], authors: o.authors.slice(0, 5), more: Math.max(0, o.authors.length - 5), pts: o.truth ? TRUTH_POINTS : liarPoints(counts[i], total) }));
      return go('fibReveal', { reveal, total }, { gains, played: votes.map((v) => ({ id: v.id, side: v.side })) });
    }
    case 'gallery': {
      const votes = await db.list(col.votes(wid, game.run, 0));
      const f = st.finalists; const counts = f.map(() => 0); let total = 0;
      for (const v of votes) { counts[v.choice] += v.weight || 1; total += v.weight || 1; }
      const best = Math.max(0, ...counts); const winners = best ? counts.map((c, i) => (c === best ? i : -1)).filter((i) => i >= 0) : [];
      const gains = {}; f.forEach((a, i) => add(gains, a, doodlePoints(counts[i], total, winners.includes(i))));
      return go('galleryResult', { counts, winners, total, artists: f.map(({ gid, name, avatar, color, side }) => ({ gid, name, avatar, color, side })), pts: f.map((a, i) => doodlePoints(counts[i], total, winners.includes(i))) },
        { gains, played: votes.map((v) => ({ id: v.id, side: v.side })) });
    }
    case 'poll': {
      const subs = await db.list(col.subs(wid, game.run));
      let yes = 0; let total = 0;
      for (const s of subs) { total += s.weight || 1; if (s.yes) yes += s.weight || 1; }
      const actual = total ? Math.round((100 * yes) / total) : 0;
      const gains = {}; const scored = subs.map((s) => ({ ...guestCard(s), guess: s.guess, diff: Math.abs(s.guess - actual), pts: pulsePoints(s.guess, actual) }));
      for (const s of scored) add(gains, s, s.pts);
      const closest = [...scored].sort((a, b) => a.diff - b.diff).slice(0, 5).map(({ name, avatar, color, side, guess, diff, pts }) => ({ name, avatar, color, side, guess, diff, pts }));
      const guesses = shuffle(scored).slice(0, 80).map((s) => ({ g: s.guess, avatar: s.avatar, color: s.color }));
      return go('pulseReveal', { actual, yes, total, closest, guesses }, { gains, played: subs.map((s) => ({ id: s.id, side: s.side })) });
    }
    default: throw httpError(400, 'Nothing to advance.');
  }
}

// After moderation (automatic or the host's review): build the voting phase.
async function proceed(wid, W, live, st, approved, { go, gains = null, played = [] }, db) {
  const game = live.game;
  if (game.kind === 'quip') {
    const matchups = pairUp(approved);
    if (!matchups.length) return go('gameOver', { best: null, recap: [], few: true }, { gains, played });
    const m = matchups[0];
    return go('clash', { round: 0, total: matchups.length, matchup: { a: { text: m[0].text }, b: { text: m[1].text } } }, { ms: MS.clash, statePatch: { matchups, results: [] }, gains, played });
  }
  if (game.kind === 'fib') {
    let lies = approved.slice(0, LIES);
    for (const d of shuffle(st.decoys || [])) { if (lies.length >= 3) break; if (!lies.some((l) => norm(l.text) === norm(d))) lies.push({ text: d, authors: [] }); }
    const options = shuffle([{ text: st.truth, truth: true, authors: [] }, ...lies]);
    return go('pick', { options: options.map((o) => o.text) }, { ms: MS.pick, statePatch: { options }, gains, played });
  }
  if (game.kind === 'doodle') {
    const finalists = approved.slice(0, FINALISTS).map(({ png, ...f }) => f); // eslint-disable-line no-unused-vars
    if (finalists.length < 2) return go('gameOver', { best: null, recap: [], few: true }, { gains, played });
    await db.set('wedding_art', game.run, { id: game.run, wid, art: finalists.map((f) => f.strokes), createdAt: now() });
    return go('gallery', { finalists: finalists.map(() => 1), art: game.run }, { ms: MS.gallery, statePatch: { finalists }, gains, played });
  }
  throw httpError(400, 'Nothing to review.');
}

// Host review when automatic moderation was unavailable: keep = indices of approved candidates.
async function review(wid, W, keep, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (live?.stage !== 'review') throw httpError(400, 'Nothing to review.');
  const st = await lock(wid, live.game.run, 'review', db);
  const set = new Set((Array.isArray(keep) ? keep : []).map(Number));
  const approved = (st.review || []).filter((_, i) => set.has(i));
  const t = now();
  const go = async (stage, gamePatch, { ms = 0, statePatch = {} } = {}) => {
    await unlock(wid, live.game.run, { ...statePatch, phase: stage, review: null }, db);
    return W.setLive(wid, (cur) => ({ ...cur, stage, game: { ...cur.game, ...gamePatch }, deadline: ms ? t + ms : null, durationMs: ms || null, openedAt: t, answered: 0, recent: [] }), db);
  };
  try { return await proceed(wid, W, { ...live, stage: live.stage }, st, approved, { go }, db); } catch (e) { await unlock(wid, live.game.run, {}, db); throw e; }
}

function add(gains, who, pts) { const id = who.gid || who.id; if (!id || !pts) return; gains[id] = { pts: (gains[id]?.pts || 0) + pts, side: who.side }; }
async function addPoints(wid, W, eid, gains, played, db) {
  if (!gains || !Object.keys(gains).length) return;
  await db.update('wedding_scores', wid, (cur) => W.applyScores(cur || { guests: {}, sides: {}, byEvent: {} }, { gains, sideBonus: {} }, eid, played));
}

// What the host panel needs beyond the live doc: candidates under review.
async function hostState(wid, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (!live?.game) return { game: null };
  const st = await db.get(col.games(wid), live.game.run);
  return { game: { kind: st?.kind, phase: st?.phase, review: st?.phase === 'review' ? (st.review || []).map((c) => ({ text: c.text, strokes: c.strokes, name: c.name || c.authors?.[0]?.name, avatar: c.avatar || c.authors?.[0]?.avatar })) : null, truth: st?.truth || null } };
}

// Counters for the host pulse / big screen.
function countPath(wid, live) {
  const g = live?.game; if (!g) return null;
  if (INPUT_STAGES.has(live.stage)) return col.subs(wid, g.run);
  if (VOTE_STAGES.has(live.stage)) return col.votes(wid, g.run, g.round || 0);
  return null;
}
async function recentAvatars(wid, live, db) {
  const p = countPath(wid, live); if (!p || !INPUT_STAGES.has(live.stage)) return null;
  const rows = await db.query(p, { field: 'at', op: '>', value: now() - 20000, limit: 24 });
  return rows.map((r) => ({ avatar: r.avatar, color: r.color }));
}

module.exports = {
  KINDS, FIRST, MS, GAME_STAGES, INPUT_STAGES, VOTE_STAGES, MAXLEN, col,
  norm, tooClose, shuffle, quipPoints, liarPoints, pulsePoints, doodlePoints, pairUp, cleanStrokes, cleanGameItem, publicGameItem,
  openGame, submit, advance, review, hostState, countPath, recentAvatars,
};
