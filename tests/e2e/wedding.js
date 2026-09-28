// E2E: a wedding across two events with owner, co-host, projector and 6 guest
// phones (375px, separate browser contexts). Exercises the server-driven engine.
'use strict';
const fs = require('fs');
const path = require('path');
const { startStack, assert, ROOT } = require('./harness');

(async () => {
  const dataDir = path.join(ROOT, '.data/e2e-wedding');
  fs.rmSync(dataDir, { recursive: true, force: true });
  const s = await startStack({ port: 3104, peerPort: 9104, env: { DATA_DIR: dataDir, ALLOW_MOCK_PAYMENTS: '1', MOCK_AI: '1', ADMIN_PASSWORD: 'e2e-admin' }, allowFonts: true });
  const t0 = Date.now(); const step = (m) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
  const shot = (p, n) => p.screenshot({ path: `${s.shots}/wedding-${n}.png` });
  try {
    // ------------------------------------------------ owner creates the wedding
    const owner = await s.player('owner');
    await owner.goto(`${s.base}/wedding/setup?new=1`);
    await owner.fill('#cA', 'Asha'); await owner.fill('#cB', 'Rohan');
    await owner.click('#createBtn');
    await owner.waitForSelector('#vDash:not(.hidden)');
    const code = (await owner.textContent('#dCode')).trim();
    const hrefs = await owner.$$eval('#dEvents a', (as) => as.map((a) => a.getAttribute('href')));
    const [mehndiHref, sangeetHref, receptionHref] = hrefs;
    const wid = new URL(s.base + sangeetHref).searchParams.get('w');
    const eid = (h) => new URL(s.base + h).searchParams.get('e');
    assert(/^[A-Z2-9]{6}$/.test(code) && hrefs.length === 3, 'wedding created with 3 events');
    await shot(owner, 'dashboard-trial');
    step(`wedding ${code} created (trial) with mehndi, sangeet, reception`);

    await owner.click('[data-buy="plus"]');
    await owner.waitForSelector('#mockPay'); await owner.click('#mockPay');
    await owner.waitForFunction(() => /Plus/.test(document.querySelector('#planPill')?.textContent || ''));
    step('Wedding Pass Plus bought (test mode)');

    await owner.fill('#chName', 'Priya (planner)'); await owner.click('#addCh');
    await owner.waitForSelector('#chLink input');
    const cohostLink = await owner.inputValue('#chLink input');

    // ------------------------------------------------ owner prepares the sangeet (AI drafts + approval + languages)
    await owner.goto(s.base + sangeetHref);
    await owner.click('[data-mode="prep"]');
    await owner.selectOption('#evLang', 'hi'); await owner.selectOption('#evLang2', 'en'); await owner.click('#evSave');
    await owner.fill('#facts', 'They met at a friend\'s wedding in Jaipur\nAsha does a great Bollywood dance');
    const before = Number(await owner.textContent('#itemCount'));
    await owner.click('#genBtn');
    await owner.waitForSelector('#approveDrafts');
    const drafts = await owner.$$eval('#drafts [data-draft]', (x) => x.length);
    assert(Number(await owner.textContent('#itemCount')) === before, 'drafts are not live before approval');
    await owner.click('#approveDrafts');
    await owner.waitForFunction((n) => Number(document.querySelector('#itemCount').textContent) === n, before + drafts);
    await owner.click('#translateBtn');
    await owner.waitForFunction(() => /🌐/.test(document.querySelector('#prepItems').textContent), null, { timeout: 15000 });
    await shot(owner, 'host-prepare');
    step(`sangeet: ${drafts} AI drafts approved by host; rounds translated (hi + en)`);

    // ------------------------------------------------ co-host runs it; projector + guests
    const cohost = await s.player('cohost');
    await cohost.goto(cohostLink.replace(/^https?:\/\/[^/]+/, s.base));
    await cohost.waitForSelector('#evTabs button');
    await cohost.click(`[data-ev="${eid(sangeetHref)}"]`);
    const screen = await s.player('screen', { width: 1280, height: 720 });
    await screen.goto(`${s.base}/wedding/screen?w=${wid}&c=${code}`);

    const G = [['Anu', 'a'], ['Bilal', 'b'], ['Chitra', 'a'], ['Dev', 'b'], ['Eman', 'a'], ['The Kapoors', 'b']];
    const guests = [];
    for (const [i, [name, side]] of G.entries()) {
      const tj = Date.now();
      const g = await s.player(name);
      await g.goto(`${s.base}/w?c=${code}`);
      await g.waitForSelector('#jSides button');
      await g.fill('#jName', name); await g.click(`#jSides [data-side="${side}"]`);
      if (i === 5) { await g.click('label:has(#jGroup) .slider'); await g.fill('#jGroupSize', '4'); }
      await g.click('#jGo');
      await g.waitForSelector('#vPlay:not(.hidden)');
      guests.push(g);
      if (process.env.DEBUG) console.log('   join', name, Date.now() - tj, 'ms');
    }
    const guestCode3 = (await guests[3].textContent('#gCode')).trim();
    assert(/^\d{6}$/.test(guestCode3), 'guest code shown after joining');
    // Dev moves to another device with the 6-digit code.
    const dev2 = await s.player('Dev-phone2');
    await dev2.goto(`${s.base}/w?c=${code}`);
    await dev2.click('details summary'); await dev2.fill('#rCode', guestCode3); await dev2.click('#rGo');
    await dev2.waitForSelector('#vPlay:not(.hidden)');
    assert((await dev2.textContent('#gMe')).includes('Dev'), 'same identity on the second device');
    await guests[3].close(); // the old phone's secret was rotated by the resume
    guests[3] = dev2;
    // Eman plays in Urdu (RTL).
    await guests[4].selectOption('#gLang', 'ur').catch(() => {});
    step('6 guests joined (one family ×4); Dev resumed on a second phone with his guest code');

    await cohost.click('[data-do="start"]');
    await screen.waitForFunction(() => /Sangeet/.test(document.querySelector('#main').textContent));
    await shot(screen, 'screen-intro');

    // Round 1: dance-off vote (family counts ×4)
    await cohost.click('[data-do="open"][data-index="0"]');
    for (const [i, g] of guests.entries()) { await g.waitForSelector('#gStage .opt'); await g.click(`#gStage .opt[data-choice="${i === 5 || i === 1 ? 1 : 0}"]`); }
    await cohost.waitForFunction(() => Number(document.querySelector('#sAnswered').textContent) === 6, null, { timeout: 15000 });
    await cohost.click('[data-do="reveal"]');
    await screen.waitForSelector('.opt.correct');
    const counts = await screen.$$eval('.opt .cnt', (c) => c.map((x) => Number(x.textContent)));
    assert(counts[0] === 4 && counts[1] === 5, 'vote counts with family weight: ' + counts);
    await shot(screen, 'screen-vote-result');
    step(`dance-off vote tallied server-side: ${counts.join(' vs ')} (family ×4)`);

    // Round 2: emoji song — one guest offline, one refreshes mid-question
    await cohost.click('[data-do="open"][data-index="1"]');
    for (const g of guests) await g.waitForSelector('#gStage .emoji-clue');
    await shot(screen, 'screen-question');
    await guests[4].waitForFunction(() => document.body.dir === 'rtl');
    await shot(guests[4], 'guest-urdu-rtl');
    await guests[2].context().setOffline(true);
    await guests[2].click('#gStage .opt[data-choice="0"]');
    await guests[2].waitForSelector('#offlineBar:not(.hidden)');
    await shot(guests[2], 'guest-offline');
    await guests[1].reload();
    await guests[1].waitForSelector('#gStage .emoji-clue', { timeout: 15000 });
    for (const [i, g] of guests.entries()) if (i !== 2) await g.click('#gStage .opt[data-choice="0"]').catch(() => {});
    await guests[2].context().setOffline(false);
    await cohost.waitForFunction(() => Number(document.querySelector('#sAnswered').textContent) === 6, null, { timeout: 20000 });
    await guests[0].screenshot({ path: `${s.shots}/wedding-guest-locked.png` });
    await cohost.click('[data-do="reveal"]');
    await guests[2].waitForSelector('.banner');
    step('offline guest\'s queued answer arrived after reconnect; refreshed guest rejoined mid-question; all 6 answers counted');
    await cohost.click('[data-do="board"]');
    await screen.waitForSelector('.lb .row');
    await shot(screen, 'screen-board');
    await cohost.click('[data-do="end"]');

    // ------------------------------------------------ reception: shoe game + toasts with moderation
    await cohost.waitForSelector(`[data-ev="${eid(receptionHref)}"]`);
    await cohost.click(`[data-ev="${eid(receptionHref)}"]`);
    await cohost.click('[data-do="start"]');
    await cohost.click('[data-do="open"][data-index="0"]');
    for (const [i, g] of guests.entries()) { await g.waitForSelector('#gStage .opt'); await g.click(`#gStage .opt[data-choice="${i % 2}"]`); }
    await cohost.waitForSelector('[data-do="reveal"][data-correct="0"]');
    await cohost.click('[data-do="reveal"][data-correct="0"]');
    await screen.waitForSelector('.opt.correct');
    step('shoe game: guests voted, co-host revealed Asha\'s shoe');
    await cohost.click('#runItems [data-do="open"][data-index="8"]');
    const toasts = [[0, 'To a lifetime of laughter and chai!'], [1, 'Good luck surviving the mother-in-law, haha'], [4, 'شادی مبارک! ہمیشہ خوش رہیں']];
    for (const [i, text] of toasts) {
      await guests[i].waitForSelector('#promptWrite'); await guests[i].click('#promptWrite');
      await guests[i].fill('#noteText', text); await guests[i].click('#noteForm button[type=submit]');
      await guests[i].waitForSelector('#noteSheet.hidden', { state: 'attached' });
    }
    await cohost.click('[data-mode="mod"]');
    await cohost.waitForFunction(() => document.querySelectorAll('#pending [data-mod="approved"]').length === 1, null, { timeout: 10000 });
    assert(/mother-in-law/.test(await cohost.textContent('#pending')), 'the in-law joke was held for review');
    await cohost.click('#pending [data-mod="approved"]');
    await cohost.click('[data-mode="run"]');
    await cohost.click('[data-do="wall"]');
    await screen.waitForFunction(() => document.querySelectorAll('.toast-card').length === 3, null, { timeout: 10000 });
    await shot(screen, 'screen-toast-wall');
    step('toast wall: 2 auto-approved, 1 held for review then approved by co-host');

    await cohost.click('[data-do="finale"]');
    await screen.waitForSelector('.finale-winner', { timeout: 15000 });
    await screen.waitForTimeout(800);
    await shot(screen, 'screen-finale');
    for (const g of guests) await g.waitForFunction(() => /🏆/.test(document.querySelector('#gStage').textContent));
    step('finale reveal on the big screen and every phone');

    // ------------------------------------------------ keepsake book
    await owner.goto(`${s.base}/wedding/book?w=${wid}`);
    await owner.waitForSelector('.page');
    assert(await owner.$eval('#dl', (b) => b.disabled), 'direct PDF disabled when a wish is in Urdu');
    await owner.selectOption('#paper', 'photo8');
    await owner.waitForFunction(() => document.fonts.check('16px "Noto Nastaliq Urdu"', 'مبارک'), null, { timeout: 15000 }).catch(() => {});
    const fontOk = await owner.evaluate(() => document.fonts.check('16px "Noto Nastaliq Urdu"', 'مبارک'));
    await owner.evaluate(() => { window.print = () => {}; });
    await owner.click('#print');
    const pdf = await owner.pdf({ width: '8in', height: '8in', printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(`${s.shots}/wedding-book-8x8.pdf`, pdf);
    const pdfText = pdf.toString('latin1');
    const pages = (pdfText.match(/\/Type\s*\/Page[^s]/g) || []).length;
    assert(pages >= 3, 'book has cover + notes + scores pages: ' + pages);
    await owner.screenshot({ path: `${s.shots}/wedding-book.png`, fullPage: false });
    step(`keepsake book printed at 8×8 in (${pages} pages, Urdu font loaded: ${fontOk})`);

    // ------------------------------------------------ stats + admin
    await owner.goto(`${s.base}/wedding/setup?w=${wid}`);
    await owner.waitForSelector('#vDash:not(.hidden)');
    const stats = { guests: await owner.textContent('#stGuests'), run: await owner.textContent('#stRun'), peak: await owner.textContent('#stPeak'), more: await owner.textContent('#stMore') };
    assert(stats.guests === '6' && stats.run === '2' && Number(stats.peak) >= 5 && /1 keepsake download/.test(stats.more), 'wedding stats: ' + JSON.stringify(stats));
    const admin = await owner.evaluate(async () => (await fetch('/api/admin', { headers: { 'x-admin-password': 'e2e-admin' } })).json());
    const row = admin.weddings?.list?.find((x) => x.id === wid);
    assert(row && row.eventsRun === 2 && row.guestsJoined === 6 && row.purchaseFromEvent !== undefined, 'admin per-wedding tracking: ' + JSON.stringify(row));
    step(`stats: ${stats.guests} guests, ${stats.run} events run, peak ${stats.peak}, keepsake downloads tracked; admin shows the wedding`);

    // ------------------------------------------------ DJ/MC Pro licence
    const dj = await s.player('dj');
    await dj.goto(`${s.base}/dj`);
    await dj.fill('#email', 'dj@example.com'); await dj.fill('#brandName', 'DJ Nova'); await dj.click('#buy');
    await dj.waitForSelector('#mockPay'); await dj.click('#mockPay');
    await dj.waitForFunction(() => document.querySelector('#status')?.textContent === 'Active');
    await dj.click('#newWedding');
    await dj.waitForSelector('#djBox:not(.hidden)');
    await dj.fill('#cA', 'Lena'); await dj.fill('#cB', 'Omar'); await dj.click('#createBtn');
    await dj.waitForFunction(() => /DJ\/MC Pro/.test(document.querySelector('#planPill')?.textContent || ''));
    step('DJ/MC Pro licence bought (test mode, yearly) and used to create a Pro wedding');

    console.log(`PASS wedding: owner + co-host + projector + 6 guests, 2 events, votes, offline queue, reconnect, resume, RTL, moderation, finale, book, DJ licence (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  } catch (e) {
    for (const pg of s.browser.contexts().flatMap((c) => c.pages())) await pg.screenshot({ path: `${s.shots}/wedding-fail-${pg.tag || 'x'}.png` }).catch(() => {});
    console.error('FAIL', e.stack, '\nerrors:', s.errors, '\nlog:', s.log().slice(-2500));
    process.exitCode = 1;
  } finally {
    const real = s.errors.filter((e) => !/404 \(Not Found\)/.test(e));
    if (real.length) { console.error('Browser errors:', real); process.exitCode = 1; }
    await s.stop();
  }
})();
