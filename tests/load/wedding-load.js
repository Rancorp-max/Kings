// Load test: 500 simulated guests in one wedding event.
//   node tests/load/wedding-load.js [--guests 500] [--port 3130]
// Env FIRESTORE_EMULATOR_HOST=… runs the server against the Firestore emulator instead of the file store.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const N = Number(arg('guests', 500)); const PORT = Number(arg('port', 3130));
const ROOT = path.resolve(__dirname, '../..'); const BASE = `http://127.0.0.1:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lat = {}; const errors = {}; let refused = 0;
const rec = (k, ms) => (lat[k] ||= []).push(ms);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };

async function call(kind, body, { method = 'POST', path: p = '/api/wedding', query } = {}) {
  const t = Date.now();
  try {
    const r = await fetch(BASE + p + (query ? '?' + new URLSearchParams(query) : ''), { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    rec(kind, Date.now() - t);
    if (!r.ok) { if (r.status === 409 && d.code === 'own') refused++; else errors[kind] = (errors[kind] || 0) + 1; return { error: d.error, status: r.status }; }
    return d;
  } catch (e) { errors[kind] = (errors[kind] || 0) + 1; return { error: e.message }; }
}
async function pool(items, size, fn) { const q = [...items]; await Promise.all(Array.from({ length: size }, async () => { while (q.length) await fn(q.shift()); })); }

(async () => {
  const dataDir = path.join(ROOT, '.data/load'); fs.rmSync(dataDir, { recursive: true, force: true });
  const env = { ...process.env, DATA_DIR: dataDir, ALLOW_MOCK_PAYMENTS: '1', FIREBASE_PROJECT_ID: 'partydeck-load' };
  const srv = spawn(process.execPath, ['scripts/dev-server.js', '--port', String(PORT)], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let slog = ''; srv.stdout.on('data', (d) => { slog += d; }); srv.stderr.on('data', (d) => { slog += d; });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/'); break; } catch { await sleep(200); } }
  const storage = process.env.FIRESTORE_EMULATOR_HOST ? `Firestore emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : 'file store';
  console.log(`Load test: ${N} guests, server on ${BASE}, storage: ${storage}`);
  try {
    // Wedding with Plus (500 guests) and one event: a question + a vote.
    const c = await call('setup', { action: 'create', couple: { names: ['Asha', 'Rohan'] }, events: [{ type: 'sangeet' }] });
    const w = c.wedding; const token = c.ownerToken; const host = (b) => call('host', { ...b, w: w.id, token });
    await call('setup', { action: 'mock-complete', kind: 'wedding', w: w.id, token, plan: 'plus' }, { path: '/api/checkout' });
    const eid = w.events[0].id;
    await host({ action: 'approve', eventId: eid, items: [
      { kind: 'mc', text: 'Where did they meet?', options: ['Jaipur', 'Toronto', 'London', 'Online'], correct: 0 },
      { kind: 'vote', text: 'Best dance', options: ['Bride team', 'Groom team'], optionSides: ['a', 'b'] },
      { kind: 'quip', text: 'The secret to a happy marriage is ___' },
      { kind: 'pulse', text: 'Have you ever cried at a wedding?' },
    ] });

    // 1) Join: 500 guests, 100 concurrent (a crowd scanning the QR at once).
    const guests = [];
    const t0 = Date.now();
    await pool(Array.from({ length: N }, (_, i) => i), 100, async (i) => {
      const r = await call('join', { action: 'join', code: w.code, name: 'Guest ' + i, side: i % 3 === 0 ? 'b' : 'a', groupSize: i % 50 === 0 ? 4 : 1 });
      if (!r.error) guests.push({ i, gid: r.guest.id, secret: r.secret, side: r.guest.side, group: r.guest.group });
    });
    console.log(`  joined ${guests.length}/${N} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // Everyone polls the live state like the phones do (1.2–1.8 s with jitter) for the rest of the test.
    let polling = true; let polls = 0;
    const pollers = guests.map(async () => { await sleep(Math.random() * 1500); while (polling) { const r = await call('live-poll', null, { method: 'GET', path: '/api/wedding-live', query: { w: w.id } }); if (!r.error) polls++; await sleep(1200 + Math.random() * 600); } });
    const pulse = setInterval(() => host({ action: 'pulse' }), 2500);
    await Promise.all(guests.map((g) => call('ping', { action: 'ping', w: w.id, gid: g.gid, secret: g.secret })));

    // 2) Question: answers spread over ~15 s (1 in 4 wrong), host reveals at the buzzer.
    await host({ action: 'start-event', eventId: eid });
    await host({ action: 'open', index: 0 });
    const liveBefore = (await call('live-poll', null, { method: 'GET', path: '/api/wedding-live', query: { w: w.id } })).live.v;
    await Promise.all(guests.map(async (g) => { await sleep(300 + Math.random() * 15000); await call('answer', { action: 'answer', w: w.id, gid: g.gid, secret: g.secret, eventId: eid, index: 0, choice: g.i % 4 === 3 ? 1 : 0 }); }));
    const liveAfterAnswers = (await call('live-poll', null, { method: 'GET', path: '/api/wedding-live', query: { w: w.id } })).live.v;
    const tr = Date.now(); const rev = await host({ action: 'reveal' }); const revealMs = Date.now() - tr;
    const counts = rev.live.reveal.counts; const expectWrong = guests.filter((g) => g.i % 4 === 3).length;
    const okQ = counts[0] === guests.length - expectWrong && counts[1] === expectWrong;
    console.log(`  question: counts ${JSON.stringify(counts)} (expected ${guests.length - expectWrong}/${expectWrong}) ${okQ ? '✓' : '✗'}; reveal (tally ${guests.length} answers + scores) took ${revealMs} ms`);
    console.log(`  live-doc writes during ${guests.length} answers: ${liveAfterAnswers - liveBefore} (host pulses only — answers never write the shared doc)`);

    // 3) Vote with family groups weighted.
    await host({ action: 'open', index: 1 });
    await Promise.all(guests.map(async (g) => { await sleep(Math.random() * 8000); await call('vote', { action: 'answer', w: w.id, gid: g.gid, secret: g.secret, eventId: eid, index: 1, choice: g.side === 'a' ? 0 : 1 }); }));
    const rv = await host({ action: 'reveal' });
    const expA = guests.filter((g) => g.side === 'a').reduce((s, g) => s + g.group, 0); const expB = guests.filter((g) => g.side === 'b').reduce((s, g) => s + g.group, 0);
    const okV = rv.live.reveal.counts[0] === expA && rv.live.reveal.counts[1] === expB;
    console.log(`  vote: counts ${JSON.stringify(rv.live.reveal.counts)} (expected ${expA}/${expB} with family weights) ${okV ? '✓' : '✗'}`);

    // 4) Quip Clash: 500 answers, host review (no AI key in this run), 500 votes on the first clash.
    const sub = (kind, g, body) => call(kind, { action: 'submit', w: w.id, gid: g.gid, secret: g.secret, ...body });
    let lq = (await host({ action: 'open', index: 2 })).live;
    await Promise.all(guests.map(async (g) => { await sleep(Math.random() * 10000); await sub('quip-write', g, { run: lq.game.run, stage: 'write', text: `Answer ${g.i} — lots of chai` }); }));
    const ta = Date.now(); lq = (await host({ action: 'advance' })).live; const closeMs = Date.now() - ta;
    const hs = await host({ action: 'game' });
    lq = (await host({ action: 'review', keep: [0, 1, 2, 3, 4, 5] })).live;
    const clash = await host({ action: 'game' }); // (state not exposed for clash; authors are hidden from the live doc)
    await Promise.all(guests.map(async (g) => { await sleep(Math.random() * 6000); await sub('quip-vote', g, { run: lq.game.run, stage: 'clash', choice: g.i % 3 ? 0 : 1 }); }));
    const rq = (await host({ action: 'advance' })).live;
    const votesCounted = rq.game.result.counts[0] + rq.game.result.counts[1];
    const allWeight = guests.reduce((a, g) => a + g.group, 0);
    const okQuip = lq.stage === 'clash' && hs.game.review.length > 0 && refused === 2 && votesCounted >= allWeight - 8 && votesCounted <= allWeight - 2;
    console.log(`  quip: 500 answers closed in ${closeMs} ms (dedupe + sample ${hs.game.review.length} for review), clash votes counted ${votesCounted} (weighted; the 2 authors were refused a vote on their own clash: ${refused}) ${okQuip ? '✓' : '✗'}`);
    void clash;
    // 5) Crowd Pulse: 500 yes/no + guesses.
    let lp = (await host({ action: 'open', index: 3 })).live;
    await Promise.all(guests.map(async (g) => { await sleep(Math.random() * 8000); await sub('pulse', g, { run: lp.game.run, stage: 'poll', yes: g.i % 5 < 2, guess: (g.i * 7) % 101 }); }));
    lp = (await host({ action: 'advance' })).live;
    const yesW = guests.filter((g) => g.i % 5 < 2).reduce((a, g) => a + g.group, 0); const allW = guests.reduce((a, g) => a + g.group, 0);
    const okPulse = lp.game.actual === Math.round((100 * yesW) / allW) && lp.game.total === allW;
    console.log(`  pulse: ${lp.game.actual}% said yes of ${lp.game.total} (weighted) ${okPulse ? '✓' : '✗'}`);

    // 6) 150 notes at once (moderation path, blocklist only here).
    await pool(guests.slice(0, 150), 50, (g) => call('note', { action: 'note', w: w.id, gid: g.gid, secret: g.secret, eventId: eid, kind: 'wish', text: `Congratulations from guest ${g.i}!` }));
    const board = await host({ action: 'board' });
    const p = await host({ action: 'pulse' });
    polling = false; clearInterval(pulse); await Promise.race([Promise.all(pollers), sleep(3000)]);
    console.log(`  leaderboard top: ${board.live.board.top[0]?.name} ${board.live.board.top[0]?.pts}; sides ${JSON.stringify(board.live.board.sides)}; active players ${p.active}; guests ${p.guests}`);
    console.log(`  live polls served: ${polls}`);
    console.log('\n  latency ms            p50    p95    max    n');
    for (const [k, a] of Object.entries(lat)) console.log(`  ${k.padEnd(18)} ${String(pct(a, 0.5)).padStart(6)} ${String(pct(a, 0.95)).padStart(6)} ${String(Math.max(...a)).padStart(6)} ${String(a.length).padStart(6)}`);
    const errTotal = Object.values(errors).reduce((a, b) => a + b, 0);
    console.log(`\n  errors: ${errTotal ? JSON.stringify(errors) : 'none'}`);
    const pass = okQ && okV && okQuip && okPulse && guests.length === N && p.guests === N && errTotal === 0;
    console.log(pass ? `PASS load: ${N} guests, exact server-side tallies, no errors` : 'FAIL load');
    process.exitCode = pass ? 0 : 1;
  } catch (e) { console.error('FAIL', e, slog.slice(-1500)); process.exitCode = 1; } finally { srv.kill(); }
})();
