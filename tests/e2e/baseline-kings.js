// Regression: King's Cup still works end-to-end (host/join/draw) across separate
// browser contexts over real WebRTC, including the 19+ gate for guests.
'use strict';
const { startStack, assert } = require('./harness');
const { hostParty, joinParty } = require('./flows');

(async () => {
  const s = await startStack({ port: 3101, peerPort: 9101, env: { ALLOW_MOCK_PAYMENTS: '1' } });
  try {
    const host = await s.player('host');
    const code = await hostParty(host, s.base, s.peerParam, { theme: 'kings-cup' });
    const guests = [];
    for (const name of ['Gus', 'Gia']) {
      const g = await s.player(name);
      await joinParty(g, s.base, s.peerParam, code, { name, ageOk: 'gate' });
      guests.push(g);
    }
    await host.waitForFunction(() => document.querySelectorAll('.player-tile').length === 3);
    assert(await host.isVisible('#gentleRow'), 'gentle mode toggle visible for King\'s Cup');
    await host.click('#btnStart');
    const all = [host, ...guests];
    for (const p of all) await p.waitForSelector('#screen-game.active');
    let draws = 0;
    for (let i = 0; i < 8; i++) {
      const who = [];
      for (const p of all) if (!(await p.$eval('#deck', (d) => d.disabled))) who.push(p);
      assert(who.length === 1, 'exactly one player can draw, got ' + who.length);
      await who[0].click('#deck');
      draws++;
      for (const p of all) await p.waitForFunction((n) => document.querySelectorAll('#history .mini').length === n, draws);
      const pick = await who[0].$('#ruleAction button');
      if (pick) await pick.click();
    }
    const rank = await guests[0].textContent('#history .mini span');
    assert(/^(A|[2-9]|10|J|Q|K)$/.test(rank.trim()), 'playing card shown: ' + rank);
    assert(await host.isVisible('.cup-meter'), 'kings cup meter visible');
    await host.screenshot({ path: `${s.shots}/kings-host.png` });
    console.log(`PASS King's Cup regression: 3 players, ${draws} draws synced, 19+ gate for guests`);
  } catch (e) {
    console.error('FAIL', e.stack, '\nerrors:', s.errors, '\nlog:', s.log().slice(-1500));
    process.exitCode = 1;
  } finally {
    if (s.errors.length) { console.error('Browser errors:', s.errors); process.exitCode = 1; }
    await s.stop();
  }
})();
