// Main E2E: baby-shower quiz with 1 host + 6 guests in separate browser
// contexts (375px phones) over WebRTC. Covers: free player cap, AI personalise
// (mock model), answering + scoring + leaderboard, a guest refreshing mid-game
// (reconnection), predictions, keepsake notes and the PDF download, the
// test-mode Party Pass purchase, and the "Host your own" referral link.
'use strict';
const fs = require('fs');
const { startStack, assert } = require('./harness');
const { hostParty, joinParty } = require('./flows');

const GUESTS = [['Ava', '🐼'], ['Ben', '🦁'], ['Cleo', '🦄'], ['Dev', '🤖'], ['Eli', '🐙'], ['Fay', '🦉']];

(async () => {
  const s = await startStack({ port: 3102, peerPort: 9102, env: { ALLOW_MOCK_PAYMENTS: '1', MOCK_AI: '1', ADMIN_PASSWORD: 'e2e-admin' } });
  const t0 = Date.now();
  const step = (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  try {
    const host = await s.player('host', { width: 768, height: 1024 }); // host = tablet/TV-ish screen
    const code = await hostParty(host, s.base, s.peerParam, {
      theme: 'baby-shower', mode: 'quiz', honoree: ['Sam', 'Alex'],
      before: async (p) => {
        // Free plan: one AI generation. Facts -> mock model -> 12 questions, first 5 playable.
        await p.fill('[data-fact="0"]', 'They met at a pottery class');
        await p.fill('[data-fact="1"]', 'Sam sings in the car');
        await p.click('#btnGenerate');
        await p.waitForFunction(() => document.querySelectorAll('.q-edit .src.ai').length === 12, null, { timeout: 15000 });
        const locked = await p.$$eval('.q-edit.locked', (e) => e.length);
        assert(locked === 7, 'free plan locks AI questions beyond 5, got ' + locked);
        // Swap one AI question for a spare, and add a custom one.
        await p.click('.q-edit [data-swap]');
        await p.click('#btnAddQuestion');
        const last = '.q-edit:last-child';
        await p.fill(`${last} textarea`, 'What colour is the nursery?');
        for (const [i, v] of ['Sage green', 'Sunny yellow', 'Sky blue', 'Soft grey'].entries()) await p.fill(`${last} [data-opt="${i}"]`, v);
        await p.check(`${last} [data-correct="0"]`);
        // Who said it round
        await p.click('label:has(#whoToggle) .slider');
        await p.click('#whoList [data-w="0"] [data-who="0"]');
        await p.click('#whoList [data-w="1"] [data-who="1"]');
        await p.screenshot({ path: `${s.shots}/quiz-setup.png`, fullPage: true });
        step('setup done: AI questions generated, custom question + who-said-it added');
      },
    });
    step(`room ${code} open`);

    // 6 guests join (free cap is 8 so all fit). Then a 9th person would exceed... cap tested below after upgrade check.
    const guests = [];
    for (const [name, av] of GUESTS) { const g = await s.player(name); await joinParty(g, s.base, s.peerParam, code, { name, avatar: av }); guests.push(g); }
    await host.waitForFunction(() => document.querySelectorAll('.player-tile').length === 7);
    step('6 guests joined (separate contexts, 375px)');

    // Keepsake notes from three guests before the game.
    for (const [i, text] of [[0, 'Sleep when the baby sleeps!'], [1, 'Wishing you endless giggles.'], [2, 'Baby will be a night owl like Sam.']]) {
      const g = guests[i];
      await g.click('#screen-lobby [data-keepsake]');
      await g.click(`#ksKind [data-kind="${['advice', 'wish', 'prediction'][i]}"]`);
      await g.fill('#ksText', text);
      await g.click('#keepsakeForm button[type=submit]');
    }
    await host.waitForFunction(() => document.querySelectorAll('.player-tile .tag.left').length === 3);
    step('3 keepsake notes received by host');
    await guests[0].screenshot({ path: `${s.shots}/quiz-lobby-guest.png` });

    await host.click('#btnStart');
    for (const p of [host, ...guests]) await p.waitForSelector('#screen-quiz.active');
    step('quiz started on all 7 screens');

    let q = 0; let refreshed = false;
    while (true) {
      // Wait for the next stage we care about on the host.
      const stage = await host.waitForFunction(() => {
        const st = window.__pdState; if (!st || st.phase !== 'playing') return st?.phase || 'x';
        return ['question', 'predict'].includes(st.quiz.stage) ? st.quiz.stage + ':' + st.quiz.index : false;
      }, null, { timeout: 30000, polling: 100 }).then((h) => h.jsonValue());
      if (!stage.startsWith('question')) { step('reached ' + stage); break; }
      const idx = Number(stage.split(':')[1]);
      q++;
      if (process.env.DEBUG) console.log('   saw', stage, 'total', await host.evaluate(() => window.__pdState.quiz.total));
      // Guest 5 refreshes mid-game on question 2 and must come back.
      if (idx === 1 && !refreshed) {
        refreshed = true;
        await guests[5].reload();
        await guests[5].waitForSelector('#screen-quiz.active', { timeout: 20000 });
        await guests[5].waitForSelector('#quizStage .tile', { timeout: 10000 });
        step('guest Fay refreshed mid-question and rejoined');
      }
      // Everyone answers: guest i picks option (i % n); guest 0 always picks correctly via host's secret (read from Host).
      const correct = await host.evaluate(() => window.__pdHost?.priv.quiz.items[window.__pdState.quiz.index].correct);
      for (const [i, g] of guests.entries()) {
        await g.waitForSelector('#quizStage .tile', { timeout: 10000 });
        const n = await g.$$eval('#quizStage .tile', (t) => t.length);
        const choice = i === 0 ? correct : i % n;
        await g.click(`#quizStage .tile[data-answer="${choice}"]`, { timeout: 5000 });
      }
      if (q === 1) { await guests[0].screenshot({ path: `${s.shots}/quiz-guest-answered.png` }); }
      await host.waitForFunction(() => window.__pdState.quiz.stage !== 'question', null, { timeout: 25000 });
      if (q === 1) {
        await host.screenshot({ path: `${s.shots}/quiz-host-reveal.png` });
        await guests[0].waitForSelector('.result-big');
        await guests[0].screenshot({ path: `${s.shots}/quiz-guest-reveal.png` });
        const res = await guests[0].textContent('.result-big');
        assert(/Correct/.test(res), 'guest 0 answered correctly: ' + res);
        await host.waitForFunction(() => window.__pdState.quiz.stage === 'board', null, { timeout: 10000 });
        await host.screenshot({ path: `${s.shots}/quiz-host-leaderboard.png` });
      }
      // Speed things up: host skips the reveal/board pauses (stage-aware so no question is skipped).
      if (await host.evaluate(() => window.__pdState.quiz.stage === 'reveal')) await host.click('[data-quiz="next"]');
      await host.waitForFunction(() => window.__pdState.quiz.stage === 'board');
      await host.click('[data-quiz="next"]');
    }
    step(`answered ${q} questions (expected 5 AI + 1 custom + 2 who-said-it = 8)`);
    assert(q === 8, 'question count ' + q);

    // Predictions round
    for (const g of guests.slice(0, 4)) {
      await g.waitForSelector('#predForm');
      await g.fill('#predForm [name=date]', '2026-11-12');
      await g.fill('#predForm [name=weight]', String(7 + Math.random()).slice(0, 3));
      await g.selectOption('#predForm [name=hair]', 'Brown');
      await g.click('#predForm button');
    }
    await guests[0].screenshot({ path: `${s.shots}/quiz-guest-predictions.png` });
    await host.waitForFunction(() => window.__pdState.quiz.predictionsIn.length === 4);
    await host.click('[data-quiz="next"]'); // finish
    for (const p of [host, ...guests]) await p.waitForSelector('#screen-over.active', { timeout: 10000 });
    step('podium on all screens');
    const title = await host.textContent('#overTitle');
    assert(/Ava knows Sam & Alex best!/.test(title), 'Ava (always correct) wins: ' + title);
    await host.screenshot({ path: `${s.shots}/quiz-host-podium.png` });
    await guests[1].screenshot({ path: `${s.shots}/quiz-guest-podium.png` });
    const ref = await guests[1].getAttribute('#referralLink', 'href');
    assert(/utm_medium=referral/.test(ref) && /utm_campaign=endscreen-baby-shower/.test(ref), 'referral link ' + ref);

    // Keepsake PDF (free -> watermark)
    const [dl] = await Promise.all([host.waitForEvent('download'), host.click('#btnKeepsake')]);
    const pdfPath = `${s.shots}/keepsake-free.pdf`; await dl.saveAs(pdfPath);
    const pdf = fs.readFileSync(pdfPath, 'latin1');
    assert(pdf.startsWith('%PDF') && (pdf.match(/\/Type \/Page /g) || []).length === 4, 'PDF has cover + 3 notes');
    assert(pdf.includes('upgrade to remove this watermark'), 'free keepsake watermarked');
    step('keepsake PDF downloaded (4 pages, watermarked)');

    // Predictions saved to the event for scoring after the birth.
    const evId = await host.evaluate(() => window.__pdState.eventId);
    const results = await s.player('results');
    await results.close();
    const res = await host.evaluate(async () => { const e = JSON.parse(localStorage.getItem('pd_event')); const r = await fetch(`/api/events?id=${e.id}&token=${e.token}`); return r.json(); });
    assert(res.event.predictions.entries.length === 4, 'predictions stored on the event: ' + JSON.stringify(res.event.predictions));
    step('4 predictions stored on event ' + evId);

    // Upgrade in test mode from the end screen flow: back to setup -> buy -> mock checkout -> pass.
    await host.goto(`${s.base}/play?host=1&${s.peerParam}`);
    await host.waitForSelector('#btnBuyPass');
    await host.click('#btnBuyPass');
    await host.waitForSelector('#mockPay');
    await host.screenshot({ path: `${s.shots}/mock-checkout.png` });
    await host.click('#mockPay');
    await host.waitForSelector('.plan.pass', { timeout: 15000 });
    step('Party Pass bought in test mode; setup shows pass');
    const locked = await host.$$eval('.q-edit.locked', (e) => e.length);
    assert(locked === 0, 'pass unlocks all AI questions');
    const admin = await host.evaluate(async () => (await fetch('/api/admin', { headers: { 'x-admin-password': 'e2e-admin' } })).json());
    assert(admin.totals.eventsCreated >= 1 && admin.totals.gamesPlayed >= 1, 'admin counts events/games: ' + JSON.stringify(admin.totals));
    assert(admin.recentPurchases.some((p) => p.method === 'mock'), 'mock purchase recorded');
    console.log(`PASS party quiz: 1 host + 6 guests, ${q} questions, reconnection, predictions, keepsake PDF, test-mode pass (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    console.error('FAIL', e.stack, '\nerrors:', s.errors, '\nlog:', s.log().slice(-2000));
    process.exitCode = 1;
  } finally {
    if (s.errors.length) { console.error('Browser errors:', s.errors); process.exitCode = 1; }
    await s.stop();
  }
})();
