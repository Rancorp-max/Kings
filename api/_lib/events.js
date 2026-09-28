'use strict';
/* Events = one party. Created when a host opens setup; carries plan, limits,
 * attribution, AI usage and (for baby showers) predictions.
 *
 * Firestore collections:
 *   events/{eventId}       — see createEvent()
 *   purchases/{purchaseId} — eventId, theme, amountCents, currency, method (stripe|etsy_code|mock), source, referrer, createdAt
 *   ai_calls/{autoId}      — eventId, model, purpose, inputTokens, outputTokens, costUsd, ok, createdAt
 *   redemptions/{codeHash} — eventId, createdAt  (existence = code used)
 *   pageviews/{YYYY-MM-DD} — total + one counter per landing page
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const { site, limitsFor } = require('./config');
const { httpError } = require('./http');

const THEMES = ['baby-shower', 'bridal-shower', 'milestone-birthday', 'kings-cup'];
const MODES = ['deck', 'quiz'];
const DAY = 24 * 3600 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const randomId = (bytes = 12) => crypto.randomBytes(bytes).toString('base64url');

function clip(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : ''; }

// Attribution captured client-side on first visit (UTM + referrer).
function cleanAttribution(a = {}) {
  const utm = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (a[k]) utm[k] = clip(a[k], 100);
  const referrer = clip(a.referrer, 300);
  return { utm, referrer, landing: clip(a.landing, 200), firstSeen: Number(a.ts) || null, source: deriveSource(utm, referrer) };
}

function deriveSource(utm = {}, referrer = '') {
  if (utm.utm_source) return utm.utm_source.toLowerCase();
  if (!referrer) return 'direct';
  let host = '';
  try { host = new URL(referrer).hostname.replace(/^www\./, ''); } catch { return 'unknown'; }
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/(^|\.)bing\.com$/.test(host)) return 'bing';
  if (/duckduckgo\.com$/.test(host)) return 'duckduckgo';
  if (/(^|\.)pinterest\./.test(host) || host === 'pin.it') return 'pinterest';
  if (/(^|\.)etsy\.com$/.test(host)) return 'etsy';
  if (/(^|\.)(facebook|fb)\.com$|(^|\.)instagram\.com$/.test(host)) return 'meta';
  if (/(^|\.)reddit\.com$/.test(host)) return 'reddit';
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok';
  return host;
}

function planOf(ev, now = Date.now()) {
  return ev && ev.paid && (!ev.expiresAt || ev.expiresAt > now) ? 'pass' : 'free';
}

function publicEvent(ev, now = Date.now()) {
  const plan = planOf(ev, now);
  const limits = limitsFor(plan);
  return {
    id: ev.id, theme: ev.theme, mode: ev.mode, plan,
    paid: !!ev.paid, expiresAt: ev.expiresAt || null, paidVia: ev.paidVia || null,
    limits, generationsUsed: ev.generations || 0, generationsLeft: Math.max(0, limits.generations - (ev.generations || 0)),
    predictions: ev.predictions || null, honoree: ev.honoree || null,
  };
}

async function createEvent({ theme, mode, attribution, honoree } = {}, db = getDb()) {
  const id = randomId(9);
  const hostToken = randomId(18);
  const now = Date.now();
  const ev = {
    id, createdAt: now, theme: THEMES.includes(theme) ? theme : 'baby-shower', mode: MODES.includes(mode) ? mode : 'deck',
    hostTokenHash: sha256(hostToken), paid: false, paidAt: null, expiresAt: null, paidVia: null,
    generations: 0, aiCostUsd: 0, gamesPlayed: 0, maxPlayersSeen: 0, roomCreatedAt: null,
    honoree: honoree ? cleanHonoree(honoree) : null,
    ...cleanAttribution(attribution),
  };
  await db.set('events', id, ev);
  return { event: ev, hostToken };
}

function cleanHonoree(h = {}) {
  return { names: (Array.isArray(h.names) ? h.names : []).slice(0, 2).map((n) => clip(n, 40)).filter(Boolean), age: Number(h.age) || null, date: clip(h.date, 20) };
}

async function requireHost(eventId, token, db = getDb()) {
  if (!eventId || !token) throw httpError(401, 'Missing event credentials');
  const ev = await db.get('events', String(eventId).slice(0, 40));
  if (!ev) throw httpError(404, 'Event not found');
  const a = Buffer.from(ev.hostTokenHash || '', 'hex'); const b = Buffer.from(sha256(token), 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw httpError(403, 'Not the host of this event');
  return ev;
}

/* Marks an event paid exactly once per purchase id (idempotent for webhook retries).
 * Returns { applied: boolean, event }. */
async function markEventPaid(eventId, { purchaseId, method, amountCents, currency = site.pricing.currency, extra = {} }, db = getDb()) {
  const now = Date.now();
  const ev = await db.get('events', eventId);
  if (!ev) throw httpError(404, 'Event not found');
  const created = await db.create('purchases', purchaseId, {
    eventId, theme: ev.theme, mode: ev.mode, amountCents, currency, method,
    source: ev.source || 'direct', referrer: ev.referrer || '', utm: ev.utm || {}, createdAt: now, ...extra,
  });
  if (!created) return { applied: false, event: await db.get('events', eventId) };
  const next = await db.update('events', eventId, (cur) => ({
    ...cur, paid: true, paidAt: now, paidVia: method,
    // A pass lasts passDays from purchase; buying again extends from the later of now/expiry.
    expiresAt: Math.max(now, cur.expiresAt || 0) + site.pricing.passDays * DAY,
  }));
  return { applied: true, event: next };
}

// Charges one AI generation against the event's allowance (atomic). Returns the updated event.
async function reserveGeneration(eventId, db = getDb()) {
  return db.update('events', eventId, (ev) => {
    if (!ev) throw httpError(404, 'Event not found');
    const limit = limitsFor(planOf(ev)).generations;
    if ((ev.generations || 0) >= limit) {
      throw httpError(429, planOf(ev) === 'pass' ? 'You have used all AI generations for this event.' : 'Free events get 1 AI generation — upgrade to a Party Pass for more.', 'generation_limit');
    }
    return { ...ev, generations: (ev.generations || 0) + 1 };
  });
}

async function refundGeneration(eventId, db = getDb()) {
  return db.update('events', eventId, (ev) => (ev ? { ...ev, generations: Math.max(0, (ev.generations || 0) - 1) } : undefined));
}

async function recordAiCost(eventId, entry, db = getDb()) {
  await db.set('ai_calls', randomId(10), { eventId, createdAt: Date.now(), ...entry });
  if (entry.costUsd) await db.increment('events', eventId, { aiCostUsd: entry.costUsd });
}

module.exports = {
  THEMES, MODES, DAY, sha256, randomId, clip, cleanAttribution, deriveSource, planOf, publicEvent,
  createEvent, requireHost, markEventPaid, reserveGeneration, refundGeneration, recordAiCost, cleanHonoree,
};
