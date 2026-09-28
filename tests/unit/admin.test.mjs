import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { aggregate, pageKey } = require('../../api/_lib/admin');
const { deriveSource } = require('../../api/_lib/events');
const { freshDb, call } = require('./helpers.cjs');

const DAY = 86400000;
const now = Date.parse('2026-10-31T12:00:00Z');

test('pageKey maps paths to known pages', () => {
  assert.equal(pageKey('/'), 'home');
  assert.equal(pageKey('/bridal-shower-games?utm_source=x'), 'bridal-shower-games');
  assert.equal(pageKey('/kings-cup-rules.html'), 'kings-cup-rules');
  assert.equal(pageKey('/wp-admin'), 'other');
});

test('deriveSource prefers utm_source, then referrer host families', () => {
  assert.equal(deriveSource({ utm_source: 'Etsy' }, 'https://google.com'), 'etsy');
  assert.equal(deriveSource({}, 'https://www.google.ca/search?q=x'), 'google');
  assert.equal(deriveSource({}, 'https://pin.it/abc'), 'pinterest');
  assert.equal(deriveSource({}, ''), 'direct');
});

test('aggregate: revenue by source/theme, conversion, AI cost; mock payments excluded', () => {
  const events = [
    { id: 'e1', source: 'google', theme: 'baby-shower', roomCreatedAt: 1, gamesPlayed: 2, aiCostUsd: 0.04, createdAt: now - 10 * DAY },
    { id: 'e2', source: 'etsy', theme: 'bridal-shower', roomCreatedAt: 1, gamesPlayed: 1, createdAt: now - 9 * DAY },
    { id: 'e3', source: 'google', theme: 'baby-shower', createdAt: now - 8 * DAY },
    { id: 'e4', source: 'direct', theme: 'kings-cup', createdAt: now - 8 * DAY },
  ];
  const purchases = [
    { eventId: 'e1', source: 'google', theme: 'baby-shower', amountCents: 1299, method: 'stripe' },
    { eventId: 'e2', source: 'etsy', theme: 'bridal-shower', amountCents: 1299, method: 'etsy_code' },
    { eventId: 'e3', source: 'google', theme: 'baby-shower', amountCents: 1299, method: 'mock' },
  ];
  const pageviews = [{ id: '2026-10-21', total: 30, p_home: 20, 'p_bridal-shower-games': 10 }];
  const s = aggregate({ events, purchases, aiCalls: [], pageviews }, now, '2026-10-21');
  assert.equal(s.totals.passesSold, 2);
  assert.equal(s.totals.revenueUsd, 25.98);
  assert.equal(s.totals.conversionFreeToPaid, 50);
  assert.deepEqual(s.revenueBySourceUsd, { google: 12.99, etsy: 12.99 });
  assert.deepEqual(s.revenueByThemeUsd, { 'baby-shower': 12.99, 'bridal-shower': 12.99 });
  assert.equal(s.totals.roomsCreated, 2);
  assert.equal(s.totals.gamesPlayed, 3);
  assert.equal(s.totals.aiCostPerPaidEventUsd, 0.02);
  assert.equal(s.conversionBySource.google, 50);
  assert.equal(s.daysSinceLaunch, 10);
  assert.equal(s.rules.day7.status, 'action'); // 30 visits < 100
  assert.equal(s.rules.day7.pages.length, 3);
  assert.ok(!s.rules.day7.pages.includes('home'));
  assert.equal(s.rules.day30.status, 'pending');
});

test('day-30 rule: <10 paid = kill, >=10 = double down', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ eventId: 'e' + i, amountCents: 1299, method: 'stripe' }));
  assert.equal(aggregate({ purchases: mk(9) }, now, '2026-09-30').rules.day30.status, 'kill');
  assert.equal(aggregate({ purchases: mk(10) }, now, '2026-09-30').rules.day30.status, 'double-down');
});

test('/api/admin requires the password', async () => {
  freshDb();
  const handler = require('../../api/admin.js');
  process.env.ADMIN_PASSWORD = 'correct horse';
  assert.equal((await call(handler, { method: 'GET', headers: { 'x-admin-password': 'nope' } })).statusCode, 401);
  const ok = await call(handler, { method: 'GET', headers: { 'x-admin-password': 'correct horse' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.storage.kind, 'memory');
  assert.equal(ok.body.config.stripe, 'not configured');
});
