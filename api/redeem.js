'use strict';
// POST {code, id?, token?} — redeem an Etsy access code. Without an event, a new paid event is created.
const { handler, readJson, send } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { requireHost, createEvent, publicEvent } = require('./_lib/events');
const { redeemCode, normalizeCode } = require('./_lib/codes');
const { httpError } = require('./_lib/http');

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const db = getDb();
  if (!normalizeCode(body.code)) throw httpError(400, 'That doesn\'t look like a PartyDeck code (PD-XXXX-XXXX-XXXX).', 'bad_format');
  let ev; let hostToken = null;
  if (body.id && body.token) ev = await requireHost(body.id, body.token, db);
  else { const c = await createEvent({ theme: body.theme, mode: body.mode, attribution: body.attribution }, db); ev = c.event; hostToken = c.hostToken; }
  const r = await redeemCode(body.code, ev.id, db);
  return send(res, 200, { ok: true, alreadyApplied: r.alreadyApplied, event: publicEvent(await db.get('events', ev.id)), hostToken });
});
