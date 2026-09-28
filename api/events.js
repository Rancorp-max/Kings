'use strict';
// POST {action:'create'|'update'|'room'|'played'|'predictions'} and GET ?id=&token= — event lifecycle.
const { handler, readJson, send, query, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const E = require('./_lib/events');

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const db = getDb();
  if (req.method === 'GET') {
    const q = query(req);
    const ev = await E.requireHost(q.id, q.token, db);
    return send(res, 200, { event: E.publicEvent(ev) });
  }
  const body = await readJson(req);
  if (body.action === 'create') {
    const { event, hostToken } = await E.createEvent(body, db);
    return send(res, 201, { event: E.publicEvent(event), hostToken });
  }
  const ev = await E.requireHost(body.id, body.token, db);
  switch (body.action) {
    case 'update': {
      const patch = {};
      if (E.THEMES.includes(body.theme)) patch.theme = body.theme;
      if (E.MODES.includes(body.mode)) patch.mode = body.mode;
      if (body.honoree) patch.honoree = E.cleanHonoree(body.honoree);
      await db.merge('events', ev.id, patch);
      break;
    }
    case 'room': // a live room was opened for this event
      await db.merge('events', ev.id, { roomCreatedAt: ev.roomCreatedAt || Date.now(), roomCode: E.clip(body.code, 8) });
      break;
    case 'played': { // a game started
      const n = Math.max(0, Math.min(200, Number(body.players) || 0));
      await db.update('events', ev.id, (cur) => ({ ...cur, gamesPlayed: (cur.gamesPlayed || 0) + 1, lastPlayedAt: Date.now(), maxPlayersSeen: Math.max(cur.maxPlayersSeen || 0, n) }));
      break;
    }
    case 'predictions': { // baby-shower predictions (and, later, actual results)
      const clean = (arr) => (Array.isArray(arr) ? arr.slice(0, 60) : []).map((p) => ({
        name: E.clip(p.name, 40), avatar: E.clip(p.avatar, 8), answers: Object.fromEntries(Object.entries(p.answers || {}).slice(0, 12).map(([k, v]) => [E.clip(k, 20), E.clip(String(v), 40)])),
      }));
      const actual = body.actual ? Object.fromEntries(Object.entries(body.actual).slice(0, 12).map(([k, v]) => [E.clip(k, 20), E.clip(String(v), 40)])) : undefined;
      await db.update('events', ev.id, (cur) => ({ ...cur, predictions: { entries: body.entries ? clean(body.entries) : (cur.predictions?.entries || []), actual: actual ?? cur.predictions?.actual ?? null, updatedAt: Date.now() } }));
      break;
    }
    default: throw httpError(400, 'Unknown action');
  }
  return send(res, 200, { event: E.publicEvent(await db.get('events', ev.id)) });
});
