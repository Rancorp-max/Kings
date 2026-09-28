'use strict';
/* Weddings: one paid container, many events, one guest identity across all of them.
 *
 * Unlike the peer-to-peer party games, weddings run server-side so they can reach
 * 500 guests: guests POST answers/votes, the host's actions drive a single public
 * "live" document per wedding, and tallies happen once per question at reveal.
 *
 * Collections (Firestore paths; the file store uses the same strings):
 *   weddings/{wid}                          wedding (plan, couple, sides, roles, stats)
 *   weddings/{wid}/events/{eid}             event config, approved items + AI drafts
 *   weddings/{wid}/guests/{gid}             guest identity (name, side, avatar, secret hash)
 *   weddings/{wid}/guestcodes/{code}        6-digit resume code -> gid (exclusive create)
 *   weddings/{wid}/answers_{eid}_{i}/{gid}  one doc per answer/vote (idempotent)
 *   weddings/{wid}/notes/{nid}              keepsake notes / toasts (moderated)
 *   wedding_codes/{CODE}                    join code -> wid
 *   wedding_live/{wid}                      public live state (the only doc screens follow)
 *   wedding_scores/{wid}                    points per guest + per side (one write per reveal)
 *   wedding_counters/{wid}_{shard}          sharded guest-join counter
 *   wedding_presence/{wid}_{minute}_{shard} who was active that minute (sharded; for peak players)
 */
const crypto = require('crypto');
const { getDb } = require('./db');
const { site } = require('./config');
const { httpError } = require('./http');
const { sha256, randomId, clip, cleanAttribution } = require('./events');

const W = site.weddings;
const SHARDS = 10;
const QUESTION_MS = 20000;
const STAGE_MS = { mc: 20000, who: 15000, emoji: 25000, shoe: 15000, vote: 30000, prompt: 120000 };
const VOTE_BONUS = 1000;
const SCORED = new Set(['mc', 'who', 'emoji', 'shoe']);

const EVENT_TYPES = {
  mehndi: { name: 'Mehndi', emoji: '🌿', pack: 'mehndi-haldi' },
  haldi: { name: 'Haldi', emoji: '💛', pack: 'mehndi-haldi' },
  sangeet: { name: 'Sangeet', emoji: '💃', pack: 'sangeet' },
  welcome: { name: 'Welcome party', emoji: '👋', pack: 'rehearsal-welcome' },
  rehearsal: { name: 'Rehearsal dinner', emoji: '🍽️', pack: 'rehearsal-welcome' },
  ceremony: { name: 'Ceremony', emoji: '💒', pack: 'rehearsal-welcome' },
  reception: { name: 'Reception', emoji: '🥂', pack: 'reception' },
  brunch: { name: 'Brunch', emoji: '🥞', pack: 'rehearsal-welcome' },
  custom: { name: 'Event', emoji: '🎉', pack: 'rehearsal-welcome' },
};
const PACKS = ['mehndi-haldi', 'sangeet', 'rehearsal-welcome', 'reception'];
const LANGS = Object.keys(W.languages);
const SIDE_COLORS = ['#e2355c', '#2f6bdf', '#1c9a57', '#b98300', '#8b5cff', '#ff7a1c'];
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// ---------------------------------------------------------------- helpers
const now = () => Date.now();
const planOf = (w, t = now()) => {
  if (w?.licenceId && w.plan === 'dj') return 'dj'; // licence status is checked when the wedding is created/renewed
  return w && w.paid && (!w.expiresAt || w.expiresAt > t) ? w.plan : 'trial';
};
const limitsOf = (w) => W.plans[planOf(w)] || W.plans.trial;
const tokenOk = (hash, token) => {
  if (!hash || !token) return false;
  const a = Buffer.from(hash, 'hex'); const b = Buffer.from(sha256(token), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const minute = (t = now()) => Math.floor(t / 60000);
const shardOf = (id) => parseInt(sha256(id).slice(0, 6), 16) % SHARDS;
const col = {
  events: (wid) => `weddings/${wid}/events`, guests: (wid) => `weddings/${wid}/guests`, guestcodes: (wid) => `weddings/${wid}/guestcodes`,
  answers: (wid, eid, i) => `weddings/${wid}/answers_${eid}_${i}`, notes: (wid) => `weddings/${wid}/notes`,
};

function randomCode(n = 6) { return Array.from(crypto.randomBytes(n), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join(''); }

/* Points for one answer — identical to the party quiz (public/js/quiz-core.js). */
function scoreAnswer({ correct, elapsedMs, limitMs = QUESTION_MS }) {
  if (!correct) return 0;
  const t = Math.min(Math.max(Number(elapsedMs) || 0, 0), limitMs);
  return 500 + Math.round(500 * (1 - t / limitMs));
}

function cleanSides(sides, couple) {
  const names = couple?.names || [];
  const list = Array.isArray(sides) && sides.length >= 2 ? sides : [{ name: names[0] ? `${names[0]}'s side` : "Bride's side" }, { name: names[1] ? `${names[1]}'s side` : "Groom's side" }];
  return list.slice(0, 6).map((s, i) => ({ id: 'abcdef'[i], name: clip(s.name, 30) || `Team ${i + 1}`, color: /^#[0-9a-f]{6}$/i.test(s.color || '') ? s.color : SIDE_COLORS[i] }));
}

function cleanEvent(e = {}, existing = {}) {
  const type = EVENT_TYPES[e.type] ? e.type : existing.type || 'custom';
  const lang = LANGS.includes(e.language) ? e.language : existing.language || 'en';
  const second = LANGS.includes(e.secondLanguage) && e.secondLanguage !== lang ? e.secondLanguage : null;
  return {
    ...existing,
    type, name: clip(e.name, 40) || existing.name || EVENT_TYPES[type].name,
    date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : existing.date || null,
    time: /^\d{2}:\d{2}$/.test(e.time || '') ? e.time : existing.time || null,
    theme: clip(e.theme, 40) || existing.theme || '',
    pack: PACKS.includes(e.pack) ? e.pack : existing.pack || EVENT_TYPES[type].pack,
    language: lang, secondLanguage: e.secondLanguage === null ? null : (second ?? existing.secondLanguage ?? null),
  };
}

// ---------------------------------------------------------------- items
function cleanItem(it) {
  if (!it || !['mc', 'who', 'emoji', 'shoe', 'vote', 'prompt'].includes(it.kind)) return null;
  const text = clip(it.text, 220); if (!text) return null;
  const out = { kind: it.kind, text };
  if (it.kind === 'prompt') { out.noteKind = ['advice', 'wish', 'prediction', 'toast', 'story'].includes(it.noteKind) ? it.noteKind : 'wish'; }
  else {
    const opts = (Array.isArray(it.options) ? it.options : []).map((o) => clip(typeof o === 'string' ? o : o?.label, 80)).filter(Boolean).slice(0, 8);
    const need = it.kind === 'mc' || it.kind === 'emoji' ? 4 : it.kind === 'vote' ? 2 : 2;
    if (opts.length < need || new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return null;
    out.options = it.kind === 'mc' || it.kind === 'emoji' ? opts.slice(0, 4) : opts;
    if (it.kind === 'vote') out.optionSides = (it.optionSides || []).slice(0, opts.length).map((s) => ('abcdef'.includes(s) && s ? s : null));
    if (SCORED.has(it.kind) && it.kind !== 'shoe') {
      if (!Number.isInteger(it.correct) || it.correct < 0 || it.correct >= out.options.length) return null;
      out.correct = it.correct;
    }
    if (it.kind === 'shoe' && Number.isInteger(it.correct)) out.correct = it.correct; // usually set live by the host
    if (it.kind === 'emoji') out.emoji = clip(it.emoji, 40);
  }
  if (it.translations && typeof it.translations === 'object') {
    out.translations = {};
    for (const [lang, tr] of Object.entries(it.translations)) {
      if (!LANGS.includes(lang) || !tr) continue;
      out.translations[lang] = { text: clip(tr.text, 300), ...(Array.isArray(tr.options) ? { options: tr.options.map((o) => clip(o, 100)).slice(0, out.options?.length || 0) } : {}) };
    }
  }
  return out;
}

// What guests/screens may see of an item before the reveal (no correct answer).
function publicItem(it) {
  const { correct, ...rest } = it; // eslint-disable-line no-unused-vars
  return rest;
}

// ---------------------------------------------------------------- weddings
async function createWedding(input = {}, db = getDb(), { licence } = {}) {
  const wid = randomId(9);
  const ownerToken = randomId(18);
  let code = null;
  for (let i = 0; i < 8 && !code; i++) { const c = randomCode(6); if (await db.create('wedding_codes', c, { wid, createdAt: now() })) code = c; }
  if (!code) throw httpError(500, 'Could not allocate a join code');
  const couple = { names: (input.couple?.names || []).slice(0, 2).map((n) => clip(n, 30)).filter(Boolean) };
  const langs = (Array.isArray(input.languages) ? input.languages : ['en']).filter((l) => LANGS.includes(l)).slice(0, 4);
  const w = {
    id: wid, code, createdAt: now(), couple, title: clip(input.title, 60) || (couple.names.length ? couple.names.join(' & ') : 'Our wedding'),
    dates: (input.dates || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 10),
    languages: langs.length ? langs : ['en'],
    sides: cleanSides(input.sides, couple), teamScoring: input.teamScoring === 'total' ? 'total' : 'average',
    plan: licence ? 'dj' : 'trial', paid: !!licence, paidVia: licence ? 'dj_licence' : null, paidAt: licence ? now() : null, expiresAt: null,
    licenceId: licence ? licence.id : null, brand: licence ? { name: licence.brandName || '', logo: licence.logo || '' } : null,
    ownerTokenHash: sha256(ownerToken), cohosts: [], eventOrder: [], generations: {},
    stats: { eventsRun: 0, peakConcurrent: 0, keepsakeDownloads: 0, purchaseFromEvent: null },
    ...cleanAttribution(input.attribution),
  };
  await db.set('weddings', wid, w);
  await db.set('wedding_live', wid, { v: 1, wid, stage: 'idle', updatedAt: now() });
  await db.set('wedding_scores', wid, { guests: {}, sides: {}, byEvent: {} });
  for (const e of (input.events || []).slice(0, 12)) await addEvent(wid, e, db, { skipLimit: true });
  return { wedding: await db.get('weddings', wid), ownerToken };
}

/* Owner or co-host. Returns { wedding, role, actor }. */
async function requireHost(wid, token, db = getDb()) {
  const w = wid && await db.get('weddings', String(wid).slice(0, 40));
  if (!w) throw httpError(404, 'Wedding not found');
  if (tokenOk(w.ownerTokenHash, token)) return { wedding: w, role: 'owner', actor: 'owner' };
  const ch = (w.cohosts || []).find((c) => tokenOk(c.tokenHash, token));
  if (ch) return { wedding: w, role: 'cohost', actor: ch.id };
  throw httpError(403, 'Not a host of this wedding');
}
async function requireOwner(wid, token, db = getDb()) {
  const r = await requireHost(wid, token, db);
  if (r.role !== 'owner') throw httpError(403, 'Only the wedding owner can do that');
  return r;
}

async function publicWedding(w, db = getDb(), { forHost = false } = {}) {
  const plan = planOf(w); const limits = W.plans[plan];
  const events = [];
  for (const eid of w.eventOrder || []) { const e = await db.get(col.events(w.id), eid); if (e) events.push(forHost ? e : { id: e.id, type: e.type, name: e.name, date: e.date, time: e.time, language: e.language, secondLanguage: e.secondLanguage, status: e.status }); }
  const out = {
    id: w.id, code: w.code, title: w.title, couple: w.couple, dates: w.dates, languages: w.languages, sides: w.sides, teamScoring: w.teamScoring,
    plan, limits, paid: !!w.paid, expiresAt: w.expiresAt, brand: limits.brand ? w.brand : null, events,
  };
  if (forHost) {
    out.cohosts = (w.cohosts || []).map(({ id, name, createdAt }) => ({ id, name, createdAt }));
    out.stats = { ...w.stats, guestsJoined: await guestCount(w.id, db) };
    out.generations = w.generations || {};
  }
  return out;
}

async function updateWedding(wid, patch, db = getDb()) {
  return db.update('weddings', wid, (w) => {
    const next = { ...w };
    if (patch.couple) next.couple = { names: (patch.couple.names || []).slice(0, 2).map((n) => clip(n, 30)).filter(Boolean) };
    if (patch.title) next.title = clip(patch.title, 60);
    if (patch.sides) next.sides = cleanSides(patch.sides, next.couple);
    if (patch.teamScoring) next.teamScoring = patch.teamScoring === 'total' ? 'total' : 'average';
    if (Array.isArray(patch.languages)) {
      const langs = patch.languages.filter((l) => LANGS.includes(l)).slice(0, 4);
      if (langs.some((l) => l !== 'en') && !limitsOf(w).languages) throw httpError(402, 'Extra languages are part of Wedding Pass Plus.', 'needs_plus');
      next.languages = langs.length ? langs : ['en'];
    }
    if (Array.isArray(patch.dates)) next.dates = patch.dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 10);
    if (patch.brand && limitsOf(w).brand) next.brand = { name: clip(patch.brand.name, 40), logo: validLogo(patch.brand.logo) ? patch.brand.logo : (w.brand?.logo || '') };
    return next;
  });
}

function validLogo(s) { return typeof s === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length < 140000; }

async function addEvent(wid, e, db = getDb(), { skipLimit = false } = {}) {
  const w = await db.get('weddings', wid);
  if (!skipLimit && (w.eventOrder || []).length >= limitsOf(w).maxEvents) throw httpError(402, `Your plan includes ${limitsOf(w).maxEvents} event(s). Upgrade to add more.`, 'event_limit');
  const eid = randomId(6);
  const ev = { id: eid, createdAt: now(), status: 'draft', items: defaultItems(cleanEvent(e).pack, w), drafts: [], runs: 0, ...cleanEvent(e) };
  await db.set(col.events(wid), eid, ev);
  await db.update('weddings', wid, (cur) => ({ ...cur, eventOrder: [...(cur.eventOrder || []), eid] }));
  return ev;
}

async function updateEvent(wid, eid, patch, db = getDb()) {
  const w = await db.get('weddings', wid);
  return db.update(col.events(wid), eid, (ev) => {
    if (!ev) throw httpError(404, 'Event not found');
    const next = cleanEvent(patch, ev);
    if ((next.language !== 'en' || next.secondLanguage) && !limitsOf(w).languages) throw httpError(402, 'Other languages are part of Wedding Pass Plus.', 'needs_plus');
    if (Array.isArray(patch.items)) next.items = patch.items.map(cleanItem).filter(Boolean).slice(0, 60);
    return next;
  });
}

async function removeEvent(wid, eid, db = getDb()) {
  await db.update('weddings', wid, (w) => ({ ...w, eventOrder: (w.eventOrder || []).filter((x) => x !== eid) }));
}

async function addCohost(wid, name, db = getDb()) {
  const token = randomId(18); const id = randomId(5);
  await db.update('weddings', wid, (w) => {
    if ((w.cohosts || []).length >= W.maxCohosts) throw httpError(400, `Up to ${W.maxCohosts} co-hosts per wedding.`);
    return { ...w, cohosts: [...(w.cohosts || []), { id, name: clip(name, 30) || 'Co-host', tokenHash: sha256(token), createdAt: now() }] };
  });
  return { id, token };
}
async function removeCohost(wid, id, db = getDb()) {
  await db.update('weddings', wid, (w) => ({ ...w, cohosts: (w.cohosts || []).filter((c) => c.id !== id) }));
}

// ---------------------------------------------------------------- packs (defaults)
let PACK_CACHE = null;
function loadPacks() {
  if (!PACK_CACHE) {
    const fs = require('fs'); const path = require('path');
    PACK_CACHE = {};
    for (const p of PACKS) PACK_CACHE[p] = JSON.parse(fs.readFileSync(path.join(__dirname, '../_data/packs', `${p}.json`), 'utf8'));
  }
  return PACK_CACHE;
}
// Default items: the pack's no-answer-needed rounds (votes, prompts) plus
// classic questions whose answers the host confirms before going live.
function defaultItems(pack, w) {
  const p = loadPacks()[pack]; if (!p) return [];
  const [a, b] = w?.couple?.names?.length ? [w.couple.names[0], w.couple.names[1] || 'Partner'] : ['Bride', 'Groom'];
  const fillNames = (s) => String(s).replace(/\{a\}/g, a).replace(/\{b\}/g, b).replace(/\{couple\}/g, `${a} & ${b}`);
  return (p.defaults || []).map((it) => cleanItem({
    ...it, text: fillNames(it.text), options: it.kind === 'who' || it.kind === 'shoe' ? [a, b] : (it.options || []).map(fillNames),
    optionSides: it.optionSides,
  })).filter(Boolean);
}

// ---------------------------------------------------------------- guests
async function guestCount(wid, db = getDb()) {
  let n = 0;
  for (let s = 0; s < SHARDS; s++) { const d = await db.get('wedding_counters', `${wid}_${s}`); n += d?.n || 0; }
  return n;
}

async function joinWedding({ code, name, side, avatar, color, groupSize }, db = getDb()) {
  const map = code && await db.get('wedding_codes', String(code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
  if (!map) throw httpError(404, 'Wedding code not found — check the code on the screen.', 'bad_code');
  const w = await db.get('weddings', map.wid);
  const limits = limitsOf(w);
  if (await guestCount(w.id, db) >= limits.maxGuests) throw httpError(403, `This wedding is full (${limits.maxGuests} guests on its plan). Ask the hosts to upgrade.`, 'full');
  const gid = randomId(8); const secret = randomId(16);
  let guestCode = null;
  for (let i = 0; i < 12 && !guestCode; i++) {
    const c = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    if (await db.create(col.guestcodes(w.id), c, { gid, createdAt: now() })) guestCode = c;
  }
  if (!guestCode) throw httpError(503, 'Busy — please try again.');
  const g = {
    id: gid, name: clip(name, 24) || 'Guest', side: w.sides.some((s) => s.id === side) ? side : w.sides[0].id,
    avatar: clip(avatar, 8) || '🙂', color: /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#8b5cff',
    group: Math.max(1, Math.min(20, Number(groupSize) || 1)), secretHash: sha256(secret), guestCode, joinedAt: now(), lastSeen: now(),
  };
  await db.set(col.guests(w.id), gid, g);
  await db.increment('wedding_counters', `${w.id}_${shardOf(gid)}`, { n: 1 });
  return { wedding: w, guest: publicGuest(g), secret, guestCode };
}

// Resume on any device with the wedding code + 6-digit guest code.
async function resumeGuest({ code, guestCode }, db = getDb()) {
  const map = code && await db.get('wedding_codes', String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''));
  if (!map) throw httpError(404, 'Wedding code not found.', 'bad_code');
  const w = await db.get('weddings', map.wid);
  const win = 10 * 60000;
  const fails = w.resumeFails && now() - w.resumeFails.since < win ? w.resumeFails.n : 0;
  if (fails >= 50) throw httpError(429, 'Too many attempts — ask a host for help.');
  const gc = /^\d{6}$/.test(String(guestCode)) && await db.get(col.guestcodes(w.id), String(guestCode));
  if (!gc) {
    await db.update('weddings', w.id, (cur) => ({ ...cur, resumeFails: cur.resumeFails && now() - cur.resumeFails.since < win ? { since: cur.resumeFails.since, n: cur.resumeFails.n + 1 } : { since: now(), n: 1 } }));
    throw httpError(404, 'That guest code doesn\'t match — check the 6 digits.', 'bad_guest_code');
  }
  const secret = randomId(16);
  const g = await db.update(col.guests(w.id), gc.gid, (cur) => ({ ...cur, secretHash: sha256(secret), lastSeen: now() }));
  return { wedding: w, guest: publicGuest(g), secret, guestCode: g.guestCode };
}

function publicGuest(g) { const { secretHash, ...rest } = g; return rest; } // eslint-disable-line no-unused-vars

async function requireGuest(wid, gid, secret, db = getDb()) {
  const g = wid && gid && await db.get(col.guests(String(wid).slice(0, 40)), String(gid).slice(0, 40));
  if (!g || !tokenOk(g.secretHash, secret)) throw httpError(403, 'Please re-join the wedding.', 'bad_guest');
  return g;
}

// Presence: one merge-write per guest per minute bucket, sharded to stay under
// Firestore's ~1 write/sec/doc guidance even at 500 guests.
async function touch(wid, gid, db = getDb(), t = now()) {
  await db.merge('wedding_presence', `${wid}_${minute(t)}_${shardOf(gid)}`, { ['g_' + gid]: 1 });
}
async function activeCount(wid, db = getDb(), t = now()) {
  const ids = new Set();
  for (const m of [minute(t), minute(t) - 1]) {
    for (let s = 0; s < SHARDS; s++) {
      const d = await db.get('wedding_presence', `${wid}_${m}_${s}`);
      if (d) for (const k of Object.keys(d)) if (k.startsWith('g_')) ids.add(k);
    }
  }
  return ids.size;
}

// ---------------------------------------------------------------- live engine (host-driven)
async function setLive(wid, fn, db = getDb()) {
  return db.update('wedding_live', wid, (cur) => ({ ...fn(cur || { v: 0, wid }), v: (cur?.v || 0) + 1, updatedAt: now() }));
}

async function startEvent(wid, eid, db = getDb()) {
  const w = await db.get('weddings', wid);
  const ev = await db.get(col.events(wid), eid);
  if (!ev) throw httpError(404, 'Event not found');
  if (!ev.items.length) throw httpError(400, 'Add and approve at least one round first.');
  const firstRun = !ev.runs;
  await db.update(col.events(wid), eid, (cur) => ({ ...cur, status: 'live', runs: (cur.runs || 0) + 1, startedAt: now() }));
  if (firstRun) await db.update('weddings', wid, (cur) => ({ ...cur, stats: { ...cur.stats, eventsRun: (cur.stats?.eventsRun || 0) + 1 } }));
  const limits = limitsOf(w);
  return setLive(wid, () => ({
    wid, stage: 'intro', eventId: eid, eventName: ev.name, eventType: ev.type, index: -1, total: ev.items.length,
    lang: ev.language, secondLang: ev.secondLanguage, sides: w.sides, couple: w.couple, brand: limits.brand ? w.brand : null, watermark: !!limits.watermark, code: w.code, title: w.title,
    item: null, reveal: null, board: null, finale: null, wall: [], deadline: null, openedAt: null,
  }), db);
}

async function openItem(wid, index, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (!live?.eventId) throw httpError(400, 'Start an event first.');
  const ev = await db.get(col.events(wid), live.eventId);
  const i = Number.isInteger(index) ? index : (live.index ?? -1) + 1;
  const it = ev.items[i];
  if (!it) throw httpError(400, 'No more rounds in this event — show the scoreboard or the finale.');
  const ms = STAGE_MS[it.kind] || QUESTION_MS; const t = now();
  const stage = it.kind === 'vote' ? 'vote' : it.kind === 'prompt' ? 'prompt' : 'question';
  return setLive(wid, (cur) => ({ ...cur, stage, index: i, item: { ...publicItem(it), index: i }, openedAt: t, deadline: t + ms, durationMs: ms, reveal: null, board: null, answered: 0 }), db);
}

/* Server-side aggregation: read every answer for the open item once, tally,
 * score, and write the scores doc + live doc once. */
async function reveal(wid, { correct } = {}, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (!live || !['question', 'vote'].includes(live.stage)) throw httpError(400, 'Nothing to reveal right now.');
  const w = await db.get('weddings', wid);
  const ev = await db.get(col.events(wid), live.eventId);
  const it = { ...ev.items[live.index] };
  let split = false;
  if (it.kind === 'shoe') {
    // correct === -1: the couple held up different shoes — show the room's vote, score nobody.
    if (correct === -1) { split = true; it.correct = null; } else if (!Number.isInteger(correct) || correct < 0 || correct >= it.options.length) throw httpError(400, 'Tap which of the couple held up their shoe.');
    else it.correct = correct;
  }
  const answers = await db.list(col.answers(wid, live.eventId, live.index));
  const res = tally(it, answers, { durationMs: live.durationMs, sides: w.sides });
  const scores = await db.update('wedding_scores', wid, (cur) => applyScores(cur || { guests: {}, sides: {}, byEvent: {} }, res, live.eventId, answers));
  const board = await leaderboard(w, scores, db);
  return setLive(wid, (cur) => ({ ...cur, stage: live.stage === 'vote' ? 'voteResult' : 'reveal', reveal: { correct: it.correct ?? null, split, counts: res.counts, total: answers.length, winners: res.winners, sideBonus: res.sideBonus }, board, deadline: null }), db);
}

function tally(it, answers, { durationMs = QUESTION_MS } = {}) {
  const n = it.options?.length || 0; const counts = Array(n).fill(0);
  const gains = {};
  for (const a of answers) {
    if (a.choice >= 0 && a.choice < n) counts[a.choice] += a.weight || 1;
    if (SCORED.has(it.kind)) gains[a.id] = { pts: scoreAnswer({ correct: a.choice === it.correct, elapsedMs: a.ms, limitMs: durationMs }), side: a.side };
  }
  let winners = []; const sideBonus = {};
  if (it.kind === 'vote' && answers.length) {
    const max = Math.max(...counts); winners = counts.map((c, i) => (c === max ? i : -1)).filter((i) => i >= 0);
    for (const i of winners) { const s = it.optionSides?.[i]; if (s) sideBonus[s] = (sideBonus[s] || 0) + Math.round(VOTE_BONUS / winners.length); }
  }
  return { counts, gains, winners, sideBonus };
}

function applyScores(cur, res, eid, answers) {
  const next = { guests: { ...cur.guests }, sides: { ...cur.sides }, bonus: { ...(cur.bonus || {}) }, byEvent: { ...cur.byEvent } };
  const evs = next.byEvent[eid] = { ...(next.byEvent[eid] || {}), sides: { ...(next.byEvent[eid]?.sides || {}) } };
  for (const [gid, g] of Object.entries(res.gains)) {
    next.guests[gid] = (next.guests[gid] || 0) + g.pts;
    next.sides[g.side] = (next.sides[g.side] || 0) + g.pts;
    evs.sides[g.side] = (evs.sides[g.side] || 0) + g.pts;
  }
  for (const [s, b] of Object.entries(res.sideBonus)) { next.bonus[s] = (next.bonus[s] || 0) + b; evs.sides[s] = (evs.sides[s] || 0) + b; }
  // Remember who has played for per-side averages.
  const played = new Set([...(cur.played || []), ...answers.map((a) => a.id)]);
  next.played = [...played];
  next.playedBySide = { ...(cur.playedBySide || {}) };
  // A family phone is one player for scoring (its points count once), so it counts once here too.
  for (const a of answers) if (!(cur.played || []).includes(a.id)) next.playedBySide[a.side] = (next.playedBySide[a.side] || 0) + 1;
  return next;
}

// Side scores: 'average' (default) divides points by players on that side so a
// bigger family doesn't win by headcount; vote bonuses are added on top.
function sideTotals(w, scores) {
  const out = {};
  for (const s of w.sides) {
    const raw = scores.sides?.[s.id] || 0; const played = Math.max(1, scores.playedBySide?.[s.id] || 0);
    out[s.id] = Math.round((w.teamScoring === 'total' ? raw : raw / played) + (scores.bonus?.[s.id] || 0));
  }
  return out;
}

async function leaderboard(w, scores, db = getDb(), n = 10) {
  const top = Object.entries(scores.guests || {}).sort((a, b) => b[1] - a[1]).slice(0, n);
  const rows = [];
  for (const [gid, pts] of top) { const g = await db.get(col.guests(w.id), gid); if (g) rows.push({ id: gid, name: g.name, avatar: g.avatar, color: g.color, side: g.side, group: g.group, pts }); }
  return { top: rows, sides: sideTotals(w, scores) };
}

async function showBoard(wid, db = getDb()) {
  const w = await db.get('weddings', wid); const scores = await db.get('wedding_scores', wid);
  const board = await leaderboard(w, scores, db);
  return setLive(wid, (cur) => ({ ...cur, stage: 'board', board }), db);
}

async function finale(wid, db = getDb()) {
  const w = await db.get('weddings', wid); const scores = await db.get('wedding_scores', wid);
  const board = await leaderboard(w, scores, db, 5);
  const sides = board.sides; const best = Math.max(...Object.values(sides));
  const winners = Object.entries(sides).filter(([, v]) => v === best).map(([k]) => k);
  const perEvent = {};
  for (const eid of w.eventOrder || []) { const e = await db.get(col.events(wid), eid); if (scores.byEvent?.[eid]) perEvent[eid] = { name: e?.name || 'Event', sides: scores.byEvent[eid].sides }; }
  return setLive(wid, (cur) => ({ ...cur, stage: 'finale', board, finale: { sides, winners, perEvent, top: board.top }, deadline: null }), db);
}

async function endEvent(wid, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (live?.eventId) await db.update(col.events(wid), live.eventId, (e) => (e ? { ...e, status: 'done', endedAt: now() } : undefined));
  return setLive(wid, (cur) => ({ ...cur, stage: 'idle', eventId: null, item: null, reveal: null, deadline: null }), db);
}

// ---------------------------------------------------------------- guest actions
/* Idempotent answer/vote. clientTs is ignored for scoring (server time only). */
async function submitAnswer(wid, g, { eventId, index, choice }, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (!live || !['question', 'vote'].includes(live.stage) || live.eventId !== eventId || live.index !== index) return { ok: false, reason: 'closed' };
  const t = now();
  if (live.deadline && t > live.deadline + W.answerGraceMs) return { ok: false, reason: 'late' };
  const n = live.item?.options?.length || 0;
  if (!Number.isInteger(choice) || choice < 0 || choice >= n) throw httpError(400, 'Invalid choice');
  const created = await db.create(col.answers(wid, eventId, index), g.id, { choice, ms: t - live.openedAt, side: g.side, weight: live.stage === 'vote' ? (g.group || 1) : 1, at: t });
  if (!g.lastSeen || t - g.lastSeen > 30000) { await touch(wid, g.id, db, t); }
  return { ok: true, duplicate: !created };
}

async function answeredCount(wid, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  if (!live || !['question', 'vote', 'reveal', 'voteResult'].includes(live.stage)) return 0;
  return db.count(col.answers(wid, live.eventId, live.index));
}

async function guestSummary(w, g, db = getDb()) {
  const scores = await db.get('wedding_scores', w.id) || { guests: {} };
  const pts = scores.guests?.[g.id] || 0;
  const rank = 1 + Object.values(scores.guests || {}).filter((p) => p > pts).length;
  return { guest: publicGuest(g), points: pts, rank, players: Object.keys(scores.guests || {}).length, sides: sideTotals(w, scores) };
}

// Host polling: answered count + active players (updates peak concurrency).
async function hostPulse(wid, db = getDb()) {
  const [answered, active] = await Promise.all([answeredCount(wid, db), activeCount(wid, db)]);
  const w = await db.get('weddings', wid);
  if (active > (w.stats?.peakConcurrent || 0)) await db.update('weddings', wid, (cur) => ({ ...cur, stats: { ...cur.stats, peakConcurrent: Math.max(active, cur.stats?.peakConcurrent || 0) } }));
  const guests = await guestCount(wid, db);
  // Mirror the counts into the live doc so screens/guests see them — at most one write per host poll.
  const live = await db.get('wedding_live', wid);
  if (live && (live.answered !== answered || live.active !== active || live.guests !== guests)) await setLive(wid, (cur) => ({ ...cur, answered, active, guests }), db);
  return { answered, active, guests };
}

// ---------------------------------------------------------------- notes / toasts
async function addNote(wid, g, { eventId, kind, text }, moderate, db = getDb()) {
  const body = clip(text, 300); if (!body) throw httpError(400, 'Write something first.');
  const mine = await db.query(col.notes(wid), { field: 'gid', op: '==', value: g.id, limit: 50 });
  if (mine.filter((n) => n.eventId === eventId).length >= 5) throw httpError(429, 'You\'ve already left 5 notes at this event — thank you!');
  const verdict = await moderate(body);
  const id = randomId(8);
  const note = { id, gid: g.id, name: g.name, avatar: g.avatar, side: g.side, eventId: eventId || null, kind: ['advice', 'wish', 'prediction', 'toast', 'story'].includes(kind) ? kind : 'wish', text: body, status: verdict.status, reason: verdict.reason || null, createdAt: now() };
  await db.set(col.notes(wid), id, note);
  return note;
}

async function setNoteStatus(wid, nid, status, db = getDb()) {
  return db.update(col.notes(wid), nid, (n) => (n ? { ...n, status: status === 'approved' ? 'approved' : 'rejected', reviewedAt: now() } : undefined));
}

// Toast wall: host screen refreshes the approved toasts for the current event (one live write).
async function refreshWall(wid, db = getDb()) {
  const live = await db.get('wedding_live', wid);
  const notes = (await db.query(col.notes(wid), { field: 'createdAt', op: '>', value: 0, limit: 300 }))
    .filter((n) => n.status === 'approved' && (!live?.eventId || n.eventId === live.eventId)).slice(0, 12)
    .map(({ id, name, avatar, side, text, kind }) => ({ id, name, avatar, side, text, kind }));
  return setLive(wid, (cur) => ({ ...cur, wall: notes }), db);
}

module.exports = {
  EVENT_TYPES, PACKS, LANGS, SHARDS, VOTE_BONUS, col, planOf, limitsOf, scoreAnswer, cleanItem, publicItem, cleanEvent, cleanSides,
  createWedding, requireHost, requireOwner, publicWedding, updateWedding, addEvent, updateEvent, removeEvent, addCohost, removeCohost,
  defaultItems, loadPacks, guestCount, joinWedding, resumeGuest, requireGuest, touch, activeCount,
  setLive, startEvent, openItem, reveal, tally, applyScores, sideTotals, leaderboard, showBoard, finale, endEvent,
  submitAnswer, answeredCount, guestSummary, hostPulse, addNote, setNoteStatus, refreshWall, validLogo,
};
