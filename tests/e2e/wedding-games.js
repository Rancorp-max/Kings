// E2E: the four party games (Quip Clash, Fib Finder, Doodle Duel, Crowd Pulse) with a
// host panel, a 1280×720 projector and 5 guest phones (375px, separate contexts).
'use strict';
const fs = require('fs');
const path = require('path');
const { startStack, assert, ROOT } = require('./harness');

(async () => {
  const dataDir = path.join(ROOT, '.data/e2e-games');
  fs.rmSync(dataDir, { recursive: true, force: true });
  const s = await startStack({ port: 3106, peerPort: 9106, env: { DATA_DIR: dataDir, ALLOW_MOCK_PAYMENTS: '1', MOCK_AI: '1' }, allowFonts: true });
  const t0 = Date.now(); const step = (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  const shot = (p, n) => p.screenshot({ path: `${s.shots}/games-${n}.png` });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  try {
    // ------------------------------------------------ set up a wedding with the four games
    const owner = await s.player('owner', { width: 430, height: 900 });
    await owner.goto(`${s.base}/wedding/setup?new=1`);
    await owner.fill('#cA', 'Asha'); await owner.fill('#cB', 'Rohan');
    await owner.click('#createBtn');
    await owner.waitForSelector('#vDash:not(.hidden)');
    const code = (await owner.textContent('#dCode')).trim();
    const href = (await owner.$$eval('#dEvents a', (as) => as.map((a) => a.getAttribute('href'))))[1]; // sangeet
    const wid = new URL(s.base + href).searchParams.get('w'); const eid = new URL(s.base + href).searchParams.get('e');
    const token = await owner.evaluate((w) => JSON.parse(localStorage.getItem('pdw_hosts'))[w], wid);
    const api = (body) => fetch(`${s.base}/api/wedding`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ w: wid, token, ...body }) }).then((r) => r.json());
    const ev = (await api({ action: 'get' })).wedding.events.find((e) => e.id === eid);
    const kinds = ev.items.map((i) => i.kind);
    assert(['quip', 'doodle', 'pulse'].every((k) => kinds.includes(k)), 'sangeet pack includes party games by default');
    const r = await api({ action: 'approve', eventId: eid, items: [
      { kind: 'quip', text: 'The name of Asha and Rohan\'s dance crew would be ___' },
      { kind: 'fib', text: 'On their first date, Asha and Rohan ate ___', answer: 'Pani puri', decoys: ['Pizza', 'Tacos'] },
      { kind: 'doodle', text: 'Draw Rohan\'s signature dance move' },
      { kind: 'pulse', text: 'Did you practise a dance for tonight?' },
    ] });
    assert(r.event.items.length === 4, 'four game rounds approved');

    await owner.goto(`${s.base}${href}`);
    await owner.waitForSelector('[data-do="start"]');
    await owner.$eval('#autoReveal', (c) => { c.checked = false; });
    const screen = await s.player('screen', { width: 1280, height: 720 });
    await screen.goto(`${s.base}/wedding/screen?w=${wid}&c=${code}`);

    const names = [['Anu', 'a'], ['Bilal', 'b'], ['Chitra', 'a'], ['Dev', 'b'], ['Eman', 'a']];
    const guests = [];
    for (const [name, side] of names) {
      const g = await s.player(name);
      await g.goto(`${s.base}/w?c=${code}`);
      await g.waitForSelector('#jSides button');
      await g.fill('#jName', name); await g.click(`#jSides [data-side="${side}"]`); await g.click('#jGo');
      await g.waitForSelector('#vPlay:not(.hidden)');
      guests.push(g);
    }
    step('wedding + 4 game rounds; projector and 5 guests joined');

    const advance = async (sel) => { await owner.click('[data-do="advance"]'); if (sel) await screen.waitForSelector(sel, { timeout: 10000 }); };
    const answered = async (n) => screen.waitForFunction((k) => Number(document.querySelector('#gCount')?.textContent) >= k, n, { timeout: 15000 });
    await owner.click('[data-do="start"]');
    await owner.waitForSelector('[data-do="open"]');

    // ------------------------------------------------ 1. Quip Clash
    await owner.click('#controls [data-do="open"]');
    await screen.waitForSelector('.g-splash');
    await guests[0].waitForSelector('#gpText');
    await guests[0].fill('#gpText', 'Ask about the dowry'); await guests[0].click('#gpSend');
    await guests[0].waitForSelector('.toast'); await guests[0].waitForSelector('#gpText');
    assert(/family-friendly/.test(await guests[0].textContent('#toasts')), 'blocked words are refused with a friendly message, and the guest can retry');
    const quips = ['The Shaadi Shufflers', 'Bhangra Bandits', 'Something rude', 'Twirl Power', 'The Dhol Patrol'];
    for (const [i, g] of guests.entries()) { await g.waitForSelector('#gpText'); await g.fill('#gpText', quips[i]); await g.click('#gpSend'); await g.waitForSelector('.gp-done'); }
    await answered(5); await sleep(3600); // let the splash finish
    await shot(screen, 'quip-write'); await shot(guests[1], 'guest-quip-sent');
    await advance('.clash');
    const clashTexts = await screen.$$eval('.qcard .qtext', (x) => x.map((e) => e.textContent));
    assert(!clashTexts.some((q) => /rude/i.test(q)), 'the moderation check keeps flagged answers off the big screen');
    await sleep(1400); await shot(screen, 'quip-clash');
    let votes = 0;
    for (const g of guests) {
      await g.waitForSelector('.gp-big button, .gp-result');
      if (await g.$('.gp-big button:not([disabled])')) { await g.click('.gp-big button[data-pick="0"]'); votes++; } else await shot(g, 'guest-quip-own');
    }
    await shot(guests.find(async () => true), 'guest-quip-vote');
    await answered(votes);
    await advance('.qpct'); await sleep(2600);
    await shot(screen, 'quip-result');
    await advance('.clash'); await sleep(900);
    for (const g of guests) if (await g.$('.gp-big button:not([disabled])')) await g.click('.gp-big button[data-pick="1"]');
    await advance('.qpct'); await sleep(2400);
    await advance('.spot'); await sleep(1500);
    await shot(screen, 'quip-best');
    step(`Quip Clash: blocked word refused, flagged quip filtered, 2 clashes voted (${clashTexts.join(' vs ')}), quip of the round`);

    // ------------------------------------------------ 2. Fib Finder
    await owner.click('#controls [data-do="open"]');
    await guests[0].waitForSelector('#gpText');
    await guests[0].fill('#gpText', 'pani-puri'); await guests[0].click('#gpSend');
    await guests[0].waitForFunction(() => /sneakier/.test(document.querySelector('#toasts').textContent));
    const lies = ['Dosa', 'Chole bhature', 'Momos', 'dosa', 'Paneer tikka'];
    for (const [i, g] of guests.entries()) { await g.waitForSelector('#gpText'); await g.fill('#gpText', lies[i]); await g.click('#gpSend'); await g.waitForSelector('.gp-done'); }
    await answered(5); await sleep(3000);
    await advance('.fib-grid'); await sleep(1500);
    await shot(screen, 'fib-pick');
    const opts = await screen.$$eval('.ftile span', (x) => x.map((e) => e.textContent));
    assert(opts.includes('Pani puri') && opts.filter((o) => o.toLowerCase() === 'dosa').length === 1, 'truth + merged lies on screen');
    const ownDisabled = await guests[0].$eval('.gp-big', (b) => [...b.querySelectorAll('button')].some((x) => x.disabled && /dosa/i.test(x.textContent)));
    assert(ownDisabled, 'a guest cannot pick their own lie');
    await shot(guests[0], 'guest-fib-pick');
    for (const [i, g] of guests.entries()) {
      const want = i % 2 ? 'Pani puri' : 'Momos';
      const btn = await g.$(`.gp-big button:not([disabled]):has-text("${want}")`) || await g.$('.gp-big button:not([disabled])');
      await btn.click();
    }
    await answered(5);
    await advance('.ftile.static');
    await screen.waitForSelector('.ftile.truth', { timeout: 20000 }); await sleep(900);
    await shot(screen, 'fib-reveal');
    await guests[1].waitForSelector('.gp-result.good'); await shot(guests[1], 'guest-fib-result');
    step('Fib Finder: too-close lie refused, own lie locked, duplicate lies merged, truth revealed');

    // ------------------------------------------------ 3. Doodle Duel
    await owner.click('#controls [data-do="open"]');
    for (const [i, g] of guests.entries()) {
      const cv = await g.waitForSelector('#gpPad'); await sleep(150);
      const b = await cv.boundingBox();
      if (i === 1) await g.click('[data-col="1"]');
      if (i === 2) await g.click('[data-w="2"]');
      await g.mouse.move(b.x + 40, b.y + 60); await g.mouse.down();
      for (let k = 0; k <= 24; k++) await g.mouse.move(b.x + 40 + k * 10, b.y + 60 + Math.sin(k / 3 + i) * 60 + k * 4, { steps: 2 });
      await g.mouse.up();
      await g.mouse.move(b.x + 100, b.y + 250); await g.mouse.down(); await g.mouse.move(b.x + 200 + i * 10, b.y + 200, { steps: 8 }); await g.mouse.move(b.x + 250, b.y + 280, { steps: 8 }); await g.mouse.up();
      if (i === 0) await shot(g, 'guest-doodle-draw');
      await g.click('#gpSend'); await g.waitForSelector('.gp-done');
    }
    await answered(5);
    await advance('.gallery'); await sleep(4200);
    await shot(screen, 'doodle-gallery');
    await guests[3].waitForSelector('#gpGallery svg'); await shot(guests[3], 'guest-doodle-vote');
    for (const g of guests) { await g.waitForSelector('#gpGallery svg'); const b = await g.$('#gpGallery button:not([disabled])'); await b.click(); }
    await answered(5);
    await advance('.frame .fvotes'); await sleep(2200);
    await shot(screen, 'doodle-result');
    step('Doodle Duel: 5 drawings, gallery replay, votes, winner crowned');

    // ------------------------------------------------ 4. Crowd Pulse (one guest offline: the answer queues and arrives)
    await owner.click('#controls [data-do="open"]');
    for (const [i, g] of guests.entries()) {
      await g.waitForSelector('[data-yn]');
      if (i === 4) await g.context().setOffline(true);
      await g.click(`[data-yn="${i < 3 ? 1 : 0}"]`);
      await g.$eval('#gpRange', (el, v) => { el.value = v; el.dispatchEvent(new Event('input')); }, 40 + i * 10);
      await g.click('#gpSend'); await g.waitForSelector('.gp-done');
    }
    await shot(guests[2], 'guest-pulse');
    await guests[4].context().setOffline(false);
    await answered(5); await sleep(1500);
    await shot(screen, 'pulse-poll');
    await advance('.gauge'); await sleep(4600);
    await shot(screen, 'pulse-reveal');
    const actual = await screen.textContent('#pulseN');
    assert(actual.trim() === '60%', `crowd pulse shows 60% said yes (got ${actual})`);
    await guests[2].reload(); await guests[2].waitForSelector('.gp-result');
    assert(/60%/.test(await guests[2].textContent('#gStage')), 'a reloaded phone restores its game state');
    step('Crowd Pulse: offline answer queued and delivered, 60% yes, reload restores state');

    await owner.click('[data-do="board"]'); await screen.waitForSelector('.lb .row');
    const board = await api({ action: 'board' });
    assert(board.live.board.top.length === 5 && board.live.board.top[0].pts > 0, 'everyone scored');
    await shot(screen, 'board');
    const errs = s.errors.filter((e) => !/status of (422|409)/.test(e)); // refusals the test provokes on purpose
    if (errs.length) throw new Error('Page errors:\n' + errs.join('\n'));
    console.log(`PASS wedding games: Quip Clash, Fib Finder, Doodle Duel, Crowd Pulse with projector + 5 phones (${Math.round((Date.now() - t0) / 1000)}s)`);
  } catch (e) {
    console.error('FAIL', e.message); console.error(s.log().slice(-2500)); if (s.errors.length) console.error(s.errors.join('\n'));
    process.exitCode = 1;
  } finally { await s.stop(); }
})();
