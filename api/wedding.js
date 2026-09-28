'use strict';
/* Weddings API. One function with routed actions (keeps the Vercel function count low).
 *
 *   GET  ?action=packs                         -> event pack catalogue (public, cached)
 *   POST {action, ...}
 *     owner/co-host (w + token): get, update, add-event, update-event, remove-event, add-cohost, remove-cohost,
 *       generate, approve, translate, start-event, open, reveal, board, finale, end-event, pulse,
 *       notes, moderate-note, wall, keepsake, redeem
 *     public: create, join, resume
 *     guest (w + gid + secret): me, answer, note, ping
 */
const { handler, readJson, send, query, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const WD = require('./_lib/wedding');
const AI = require('./_lib/ai');
const { randomId } = require('./_lib/events');
const { site } = require('./_lib/config');

const HOST_ACTIONS = new Set(['get', 'update', 'add-event', 'update-event', 'remove-event', 'add-cohost', 'remove-cohost', 'generate', 'approve', 'translate',
  'start-event', 'open', 'reveal', 'board', 'finale', 'end-event', 'pulse', 'notes', 'moderate-note', 'wall', 'keepsake', 'redeem']);
const OWNER_ACTIONS = new Set(['update', 'add-cohost', 'remove-cohost', 'redeem']);
const GUEST_ACTIONS = new Set(['me', 'answer', 'note', 'ping']);

async function logAi(wid, usage, ok, db) {
  for (const u of usage || []) await db.set('ai_calls', randomId(10), { ...u, ok, weddingId: wid, createdAt: Date.now() });
  const cost = (usage || []).reduce((s, u) => s + (u.costUsd || 0), 0);
  if (cost) await db.increment('weddings', wid, { aiCostUsd: cost });
}

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const db = getDb();
  if (req.method === 'GET') {
    const q = query(req);
    if (q.action === 'packs') {
      const packs = WD.loadPacks();
      return send(res, 200, { packs, eventTypes: WD.EVENT_TYPES }, { 'cache-control': 'public, max-age=300, s-maxage=3600' });
    }
    throw httpError(400, 'Unknown action');
  }
  const b = await readJson(req);
  const a = b.action;

  // ---------------------------------------------------------------- public
  if (a === 'create') {
    let licence = null;
    if (b.licenceToken) {
      const { requireLicence } = require('./_lib/billing');
      licence = await requireLicence(b.licenceToken, db);
    }
    const { wedding, ownerToken } = await WD.createWedding(b, db, { licence });
    return send(res, 201, { wedding: await WD.publicWedding(wedding, db, { forHost: true }), ownerToken });
  }
  if (a === 'lookup') { // public summary for the join screen (sides, couple, languages)
    const map = b.code && await db.get('wedding_codes', String(b.code).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8));
    if (!map) throw httpError(404, 'Wedding code not found — check the code on the screen.', 'bad_code');
    const w = await db.get('weddings', map.wid);
    return send(res, 200, { wedding: await WD.publicWedding(w, db) });
  }
  if (a === 'join') {
    const r = await WD.joinWedding(b, db);
    return send(res, 201, { wedding: await WD.publicWedding(r.wedding, db), guest: r.guest, secret: r.secret, guestCode: r.guestCode });
  }
  if (a === 'resume') {
    const r = await WD.resumeGuest(b, db);
    return send(res, 200, { wedding: await WD.publicWedding(r.wedding, db), guest: r.guest, secret: r.secret, guestCode: r.guestCode });
  }

  // ---------------------------------------------------------------- guests
  if (GUEST_ACTIONS.has(a)) {
    const w = await db.get('weddings', String(b.w || '').slice(0, 40));
    if (!w) throw httpError(404, 'Wedding not found');
    const g = await WD.requireGuest(w.id, b.gid, b.secret, db);
    switch (a) {
      case 'me': return send(res, 200, { ...(await WD.guestSummary(w, g, db)), wedding: await WD.publicWedding(w, db) });
      case 'ping': await WD.touch(w.id, g.id, db); return send(res, 200, { ok: true });
      case 'answer': return send(res, 200, await WD.submitAnswer(w.id, g, { eventId: b.eventId, index: b.index, choice: b.choice }, db));
      case 'note': {
        const client = AI.getWeddingClient();
        const note = await WD.addNote(w.id, g, b, async (text) => {
          const v = await AI.moderateGuestText(text, { client });
          if (v.usage) await logAi(w.id, [{ purpose: 'note-moderation', ...v.usage }], true, db);
          return v;
        }, db);
        return send(res, 201, { note: { id: note.id, status: note.status, kind: note.kind } });
      }
      default: break;
    }
  }

  // ---------------------------------------------------------------- hosts
  if (!HOST_ACTIONS.has(a)) throw httpError(400, 'Unknown action');
  const { wedding: w, role } = await WD.requireHost(b.w, b.token, db);
  if (OWNER_ACTIONS.has(a) && role !== 'owner') throw httpError(403, 'Only the wedding owner can do that');
  const wid = w.id;
  const done = async (extra = {}) => send(res, 200, { ok: true, ...extra });
  switch (a) {
    case 'get': return send(res, 200, { wedding: await WD.publicWedding(w, db, { forHost: true }), role, live: await db.get('wedding_live', wid) });
    case 'update': await WD.updateWedding(wid, b.patch || {}, db); return send(res, 200, { wedding: await WD.publicWedding(await db.get('weddings', wid), db, { forHost: true }) });
    case 'add-event': return send(res, 201, { event: await WD.addEvent(wid, b.event || {}, db) });
    case 'update-event': return send(res, 200, { event: await WD.updateEvent(wid, b.eventId, b.patch || {}, db) });
    case 'remove-event': await WD.removeEvent(wid, b.eventId, db); return done();
    case 'add-cohost': { const c = await WD.addCohost(wid, b.name, db); return send(res, 201, { cohost: c }); }
    case 'remove-cohost': await WD.removeCohost(wid, b.id, db); return done();

    case 'generate': {
      const client = AI.getWeddingClient();
      if (!client) throw httpError(503, 'AI personalisation is not configured yet.', 'ai_unconfigured');
      const ev = await db.get(WD.col.events(wid), b.eventId); if (!ev) throw httpError(404, 'Event not found');
      const limits = WD.limitsOf(w);
      // Reserve one generation for this event (atomic), refund on failure.
      await db.update('weddings', wid, (cur) => {
        const used = cur.generations?.[ev.id] || 0;
        if (used >= limits.generationsPerEvent) throw httpError(429, `You've used the ${limits.generationsPerEvent} AI generation(s) for this event on your plan.`, 'generation_limit');
        return { ...cur, generations: { ...(cur.generations || {}), [ev.id]: used + 1 } };
      });
      const langs = limits.languages ? [ev.language, ev.secondLanguage].filter(Boolean) : ['en'];
      try {
        const out = await AI.generateWeddingItems({ pack: ev.pack, couple: w.couple.names, facts: b.facts, languages: langs, eventName: ev.name }, { client, cleanItem: WD.cleanItem, log: (m) => console.log(`[wedding ${wid}] ${m}`) });
        await logAi(wid, out.usage, true, db);
        // Nothing generated goes live until a host approves it.
        const drafts = out.items.map((it) => ({ ...it, draftId: randomId(5) }));
        await db.update(WD.col.events(wid), ev.id, (cur) => ({ ...cur, drafts }));
        return send(res, 200, { drafts, moderation: out.moderation, removedCount: out.removedCount, generationsLeft: limits.generationsPerEvent - ((await db.get('weddings', wid)).generations?.[ev.id] || 0) });
      } catch (e) {
        await db.update('weddings', wid, (cur) => ({ ...cur, generations: { ...(cur.generations || {}), [ev.id]: Math.max(0, (cur.generations?.[ev.id] || 1) - 1) } }));
        await logAi(wid, e.usage, false, db);
        throw e.status ? e : httpError(502, 'The AI service had a problem. Please try again.');
      }
    }
    case 'approve': { // host-approved list of items becomes the event's rounds
      const items = (Array.isArray(b.items) ? b.items : []).map(WD.cleanItem).filter(Boolean).slice(0, 60);
      const ev = await db.update(WD.col.events(wid), b.eventId, (cur) => { if (!cur) throw httpError(404, 'Event not found'); return { ...cur, items, drafts: b.keepDrafts ? cur.drafts : [] }; });
      return send(res, 200, { event: ev });
    }
    case 'translate': {
      if (!WD.limitsOf(w).languages) throw httpError(402, 'Languages are part of Wedding Pass Plus.', 'needs_plus');
      const client = AI.getWeddingClient(); if (!client) throw httpError(503, 'AI translation is not configured yet.', 'ai_unconfigured');
      const ev = await db.get(WD.col.events(wid), b.eventId); if (!ev) throw httpError(404, 'Event not found');
      const langs = [ev.language, ev.secondLanguage].filter((l) => l && l !== 'en');
      try {
        const out = await AI.translateItems(ev.items, langs, { client, couple: w.couple.names });
        await logAi(wid, out.usage, true, db);
        const next = await db.update(WD.col.events(wid), ev.id, (cur) => ({ ...cur, items: out.items.map(WD.cleanItem).filter(Boolean) }));
        return send(res, 200, { event: next });
      } catch (e) { await logAi(wid, e.usage, false, db); throw e; }
    }
    // live controls
    case 'start-event': return send(res, 200, { live: await WD.startEvent(wid, b.eventId, db) });
    case 'open': return send(res, 200, { live: await WD.openItem(wid, b.index, db) });
    case 'reveal': return send(res, 200, { live: await WD.reveal(wid, { correct: b.correct }, db) });
    case 'board': return send(res, 200, { live: await WD.showBoard(wid, db) });
    case 'finale': return send(res, 200, { live: await WD.finale(wid, db) });
    case 'end-event': return send(res, 200, { live: await WD.endEvent(wid, db) });
    case 'pulse': return send(res, 200, await WD.hostPulse(wid, db));
    case 'wall': return send(res, 200, { live: await WD.refreshWall(wid, db) });
    case 'notes': {
      const notes = await db.query(WD.col.notes(wid), { field: 'createdAt', op: '>', value: Number(b.since) || 0, limit: 500 });
      return send(res, 200, { notes });
    }
    case 'moderate-note': return send(res, 200, { note: await WD.setNoteStatus(wid, b.noteId, b.status, db) });
    case 'keepsake': {
      const notes = (await db.list(WD.col.notes(wid))).filter((n) => n.status === 'approved').sort((x, y) => x.createdAt - y.createdAt);
      const scores = await db.get('wedding_scores', wid);
      const board = await WD.leaderboard(w, scores || { guests: {} }, db, 10);
      const events = (await WD.publicWedding(w, db)).events;
      if (b.download) await db.update('weddings', wid, (cur) => ({ ...cur, stats: { ...cur.stats, keepsakeDownloads: (cur.stats?.keepsakeDownloads || 0) + 1 } }));
      return send(res, 200, { wedding: await WD.publicWedding(w, db), events, notes: notes.map(({ name, side, eventId, kind, text }) => ({ name, side, eventId, kind, text })), board });
    }
    case 'redeem': {
      const { redeemWeddingCode } = require('./_lib/billing');
      const r = await redeemWeddingCode(b.code, wid, db);
      return send(res, 200, { ok: true, ...r, wedding: await WD.publicWedding(await db.get('weddings', wid), db, { forHost: true }) });
    }
    default: throw httpError(400, 'Unknown action');
  }
});
