// E2E: bridal-shower card deck. Free cap (8 players) turns a 9th guest away;
// the host redeems an Etsy code on /redeem, the room (re)loads with the Party
// Pass, the 9th guest gets in, themed cards sync to every phone, and the
// keepsake PDF comes out without the watermark.
'use strict';
const fs = require('fs');
const path = require('path');
const { startStack, assert, ROOT } = require('./harness');
const { hostParty, joinParty } = require('./flows');
const C = require('../../api/_lib/codes');

(async () => {
  // Seed a test-only code into the local store (never one of the real Etsy batch).
  const dataDir = path.join(ROOT, '.data/e2e-deck');
  fs.rmSync(dataDir, { recursive: true, force: true }); fs.mkdirSync(dataDir, { recursive: true });
  const code = C.generateCode();
  fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ codes: { [C.hashCode(C.normalizeCode(code))]: { batch: 'e2e' } } }));
  const s = await startStack({ port: 3103, peerPort: 9103, env: { DATA_DIR: dataDir, ALLOW_MOCK_PAYMENTS: '1' } });
  const t0 = Date.now(); const step = (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  try {
    const host = await s.player('host');
    const room = await hostParty(host, s.base, s.peerParam, { theme: 'bridal-shower', mode: 'deck', honoree: ['Priya', 'Jordan'] });
    step('room ' + room);
    const guests = [];
    for (let i = 0; i < 7; i++) { const g = await s.player('g' + i); await joinParty(g, s.base, s.peerParam, room, { name: 'Guest' + (i + 1) }); guests.push(g); }
    await host.waitForFunction(() => document.querySelectorAll('.player-tile').length === 8);
    assert((await host.textContent('#lobbyCap')).includes('/ 8'), 'free cap shown');
    step('8 players in (free cap)');

    const ninth = await s.player('ninth');
    await ninth.goto(`${s.base}/play?room=${room}&${s.peerParam}`);
    await ninth.fill('#nameInput', 'Late Larry'); await ninth.click('#btnProfileGo');
    await ninth.waitForFunction(() => /room is full/i.test(document.querySelector('#toasts').textContent), null, { timeout: 15000 });
    await ninth.waitForSelector('#screen-home.active');
    step('9th guest turned away: "room is full" + upgrade hint');

    // Host redeems an Etsy code in another tab, then comes back to the room.
    const tab = await host.context().newPage();
    await tab.goto(`${s.base}/redeem`);
    await tab.fill('#code', code.toLowerCase().replace(/-/g, ' '));
    await tab.click('#redeemForm button');
    await tab.waitForSelector('#ok:not(.hidden)');
    await tab.screenshot({ path: `${s.shots}/redeem-ok.png` });
    await tab.close();
    await host.reload(); // host refresh: room resumes from local state, guests reconnect
    await host.waitForSelector('#screen-lobby.active', { timeout: 30000 });
    await host.waitForFunction(() => window.__pdState?.plan === 'pass' && document.querySelector('#lobbyCap').textContent.includes('/ 40'), null, { timeout: 15000 });
    await host.waitForFunction(() => window.__pdState.players.filter((p) => p.online).length === 8, null, { timeout: 30000 });
    step('code redeemed; host reloaded; room resumed on the Pass (cap 40), all 7 guests reconnected');

    await ninth.goto(`${s.base}/play?room=${room}&${s.peerParam}`);
    await ninth.click('#btnProfileGo');
    await ninth.waitForSelector('#screen-lobby.active', { timeout: 20000 });
    step('9th guest joins after upgrade');

    for (const g of guests.slice(0, 2)) { await g.click('#screen-lobby [data-keepsake]'); await g.fill('#ksText', 'So happy for you both — may every day feel like this one!'); await g.click('#keepsakeForm button[type=submit]'); }
    await host.waitForFunction(() => window.__pdState.keepsakeBy.length === 2);

    await host.click('#btnStart');
    const all = [host, ...guests, ninth];
    for (const p of all) await p.waitForSelector('#screen-game.active');
    for (let d = 1; d <= 5; d++) {
      let drawer = null;
      for (const p of all) if (!(await p.$eval('#deck', (x) => x.disabled))) drawer = p;
      assert(drawer, 'someone can draw');
      await drawer.click('#deck');
      for (const p of all) await p.waitForFunction((n) => window.__pdState.seq === n, d);
    }
    const text = await guests[3].textContent('#ruleDesc');
    assert(text.length > 20 && !/\{name/.test(text), 'themed prompt shown with names filled: ' + text);
    assert(await guests[3].isVisible('.card-rank-face.themed .theme-card'), 'themed card face');
    await guests[3].waitForTimeout(600);
    await guests[3].screenshot({ path: `${s.shots}/deck-guest.png` });
    step('5 themed cards drawn and synced to 9 screens: "' + text.slice(0, 60) + '…"');

    await host.click('[data-menu]'); await host.click('#mEnd'); // confirm() auto-accepted below
    await host.waitForSelector('#screen-over.active', { timeout: 10000 });
    const [dl] = await Promise.all([host.waitForEvent('download'), host.click('#btnKeepsake')]);
    const pdfPath = `${s.shots}/keepsake-pass.pdf`; await dl.saveAs(pdfPath);
    const pdf = fs.readFileSync(pdfPath, 'latin1');
    assert(!pdf.includes('watermark') && (pdf.match(/\/Type \/Page /g) || []).length === 3, 'pass keepsake: no watermark, cover + 2 notes');
    step('keepsake PDF without watermark');
    console.log(`PASS party deck: free cap, Etsy code redeem, host reload + guest reconnect, 9 players, themed deck, clean keepsake (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    console.error('FAIL', e.stack, '\nerrors:', s.errors, '\nlog:', s.log().slice(-2000));
    process.exitCode = 1;
  } finally {
    if (s.errors.length) { console.error('Browser errors:', s.errors); process.exitCode = 1; }
    await s.stop();
  }
})();
