// Reusable player flows for the E2E suites.
'use strict';

async function hostParty(page, base, peerParam, { name = 'Hana', avatar = '🦊', theme = 'baby-shower', mode = 'deck', honoree = ['Sam', 'Alex'], before } = {}) {
  await page.goto(`${base}/play?${peerParam}`);
  await page.click('#btnHost');
  await page.fill('#nameInput', name);
  await page.click(`[data-av="${avatar}"]`);
  await page.click('#btnProfileGo');
  await page.waitForSelector('#screen-setup.active');
  await page.waitForFunction(() => !/Loading your plan/.test(document.querySelector('#planBox').textContent), null, { timeout: 10000 });
  await page.click(`[data-theme="${theme}"]`);
  if (theme === 'kings-cup') { await page.click('#ageYes'); }
  if (theme !== 'kings-cup') {
    await page.click(`#modeSeg [data-mode="${mode}"]`);
    await page.fill('#honoree1', honoree[0]); await page.dispatchEvent('#honoree1', 'change');
    if (honoree[1] && await page.isVisible('#honoree2')) { await page.fill('#honoree2', honoree[1]); await page.dispatchEvent('#honoree2', 'change'); }
  }
  if (before) await before(page);
  await page.click('#btnOpenRoom');
  await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
  return (await page.textContent('#lobbyCode')).trim();
}

async function joinParty(page, base, peerParam, code, { name, avatar = '🐸', ageOk = true } = {}) {
  await page.goto(`${base}/play?room=${code}&${peerParam}`);
  await page.waitForSelector('#screen-profile.active');
  await page.fill('#nameInput', name);
  await page.click(`[data-av="${avatar}"]`);
  await page.click('#btnProfileGo');
  if (ageOk === 'gate') { await page.waitForSelector('#ageSheet:not(.hidden)'); await page.click('#ageYes'); }
  await page.waitForSelector('#screen-lobby.active', { timeout: 20000 });
}

module.exports = { hostParty, joinParty };
