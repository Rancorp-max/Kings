'use strict';
/* Admin analytics: pure aggregation (unit-testable) + the kill/double-down rules
 * from docs/RULES.md. */
const { site } = require('./config');

const LANDING_PAGES = ['home', 'baby-shower-games-on-phones', 'who-knows-mommy-best', 'bridal-shower-games', '40th-birthday-party-games', 'kings-cup-rules', 'kings-cup-online'];
const APP_PAGES = ['play', 'redeem'];
const DAY = 86400000;

function pageKey(p) {
  const slug = String(p || '/').split(/[?#]/)[0].replace(/^\/+|\/+$/g, '').replace(/\.html$/, '').toLowerCase();
  if (!slug || slug === 'index') return 'home';
  return LANDING_PAGES.includes(slug) || APP_PAGES.includes(slug) ? slug : 'other';
}

const inc = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
const round2 = (n) => Math.round(n * 100) / 100;

function aggregate({ events = [], purchases = [], aiCalls = [], pageviews = [] }, now = Date.now(), launchDate = site.launchDate) {
  const paidEvents = new Set();
  const revenueBySource = {}; const revenueByTheme = {}; const revenueByMethod = {}; const passesBySource = {};
  let revenueCents = 0;
  for (const p of purchases) {
    if (p.method === 'mock') continue; // test-mode clicks are not revenue
    paidEvents.add(p.eventId);
    revenueCents += p.amountCents || 0;
    inc(revenueBySource, p.source || 'direct', p.amountCents || 0);
    inc(revenueByTheme, p.theme || 'unknown', p.amountCents || 0);
    inc(revenueByMethod, p.method || 'unknown', p.amountCents || 0);
    inc(passesBySource, p.source || 'direct');
  }
  const eventsBySource = {}; const eventsByTheme = {};
  let rooms = 0; let games = 0; let aiCost = 0; let aiEvents = 0;
  for (const e of events) {
    inc(eventsBySource, e.source || 'direct'); inc(eventsByTheme, e.theme || 'unknown');
    if (e.roomCreatedAt) rooms++;
    games += e.gamesPlayed || 0;
    if (e.aiCostUsd) { aiCost += e.aiCostUsd; aiEvents++; }
  }
  const aiCallCost = aiCalls.reduce((s, c) => s + (c.costUsd || 0), 0);
  const visitsByPage = {}; const visitsByDay = {};
  for (const d of pageviews) {
    visitsByDay[d.id] = d.total || 0;
    for (const [k, v] of Object.entries(d)) if (k.startsWith('p_')) inc(visitsByPage, k.slice(2), v);
  }
  const landingVisits = LANDING_PAGES.reduce((s, k) => s + (visitsByPage[k] || 0), 0);

  const firstSeen = [...events.map((e) => e.createdAt), ...pageviews.map((d) => Date.parse(d.id))].filter(Boolean);
  const launch = launchDate ? Date.parse(launchDate) : (firstSeen.length ? Math.min(...firstSeen) : null);
  const daysSinceLaunch = launch ? Math.floor((now - launch) / DAY) : null;

  return {
    totals: {
      eventsCreated: events.length, roomsCreated: rooms, gamesPlayed: games,
      passesSold: paidEvents.size, revenueUsd: round2(revenueCents / 100),
      conversionFreeToPaid: events.length ? round2((paidEvents.size / events.length) * 100) : 0,
      aiCostUsd: round2(Math.max(aiCost, aiCallCost)), aiCostPerEventUsd: aiEvents ? round2(aiCost / aiEvents) : 0,
      aiCostPerPaidEventUsd: paidEvents.size ? round2(events.filter((e) => paidEvents.has(e.id)).reduce((s, e) => s + (e.aiCostUsd || 0), 0) / paidEvents.size) : 0,
      landingVisits,
    },
    revenueBySourceUsd: mapCents(revenueBySource), revenueByThemeUsd: mapCents(revenueByTheme), revenueByMethodUsd: mapCents(revenueByMethod),
    passesBySource, eventsBySource, eventsByTheme, visitsByPage, visitsByDay,
    conversionBySource: Object.fromEntries(Object.entries(eventsBySource).map(([s, n]) => [s, round2(((passesBySource[s] || 0) / n) * 100)])),
    rules: evaluateRules({ daysSinceLaunch, landingVisits, visitsByPage, paidEventCount: paidEvents.size }),
    launch: launch ? new Date(launch).toISOString().slice(0, 10) : null, daysSinceLaunch,
  };
}

function mapCents(o) { return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round2(v / 100)])); }

function evaluateRules({ daysSinceLaunch, landingVisits, visitsByPage, paidEventCount }) {
  const weakest = LANDING_PAGES.map((p) => [p, visitsByPage[p] || 0]).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([p]) => p);
  const d = daysSinceLaunch;
  const day7 = d === null || d < 7
    ? { status: 'pending', text: `Day 7 check in ${d === null ? '?' : 7 - d} day(s): ${landingVisits} landing visits so far (target ≥ 100).` }
    : landingVisits < 100
      ? { status: 'action', text: `Only ${landingVisits} landing visits by day 7 → rewrite titles/meta for: ${weakest.join(', ')}.`, pages: weakest }
      : { status: 'ok', text: `${landingVisits} landing visits by day 7 — keep going.` };
  const day30 = d === null || d < 30
    ? { status: 'pending', text: `Day 30 check in ${d === null ? '?' : 30 - d} day(s): ${paidEventCount} paid event(s) so far (threshold 10).` }
    : paidEventCount < 10
      ? { status: 'kill', text: `${paidEventCount} paid events by day 30 → drop the paid tier; keep the free game as a traffic feeder.` }
      : { status: 'double-down', text: `${paidEventCount} paid events by day 30 → add retirement + anniversary themes and test US$14.99 pricing.` };
  return { day7, day30 };
}

module.exports = { LANDING_PAGES, pageKey, aggregate, evaluateRules };
