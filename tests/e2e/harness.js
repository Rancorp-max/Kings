// Shared E2E harness: boots the dev server + a local PeerServer and opens
// isolated browser contexts (one per player, like separate phones).
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');

async function waitForHttp(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = await fetch(url); if (r.status < 500) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start: ' + url);
}

async function startStack({ port = 3100, peerPort = 9100, env = {} } = {}) {
  const proc = spawn(process.execPath, ['scripts/dev-server.js', '--port', String(port), '--peer-port', String(peerPort)], {
    cwd: ROOT, env: { ...process.env, DATA_DIR: path.join(ROOT, '.data/e2e'), ...env }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  await waitForHttp(`http://localhost:${port}/`);
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-ui-for-media-stream'],
  });
  const base = `http://localhost:${port}`;
  const peerParam = `peer=localhost:${peerPort}`;
  const errors = [];
  async function player(tag, { width = 375, height = 812 } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, acceptDownloads: true });
    // Keep tests hermetic: only our own server is reachable.
    await ctx.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    ctx.on('page', (pg) => pg.on('dialog', (d) => d.accept()));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) errors.push(`${tag} console: ${m.text()}`); });
    page.tag = tag;
    return page;
  }
  async function stop() { await browser.close().catch(() => {}); proc.kill(); }
  const shots = path.join(ROOT, 'tests/results');
  require('fs').mkdirSync(shots, { recursive: true });
  return { base, peerParam, player, stop, errors, log: () => log, browser, shots };
}

function assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); }

module.exports = { startStack, assert, ROOT };
