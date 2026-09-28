'use strict';
/* POST — start a checkout.
 *   Party Pass:     {id, token}                                   (event host)
 *   Wedding Pass:   {kind:'wedding', w, token, plan:'wedding'|'plus', fromEvent?}  (wedding owner/co-host)
 *   DJ/MC licence:  {kind:'dj', licenceToken}                     (licence created via /api/licence)
 *   Test mode:      {action:'mock-complete', ...same fields}      (non-production without Stripe keys)
 */
const { handler, readJson, send, origin, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { requireHost, planOf, publicEvent } = require('./_lib/events');
const { createCheckout, mockPaymentsAllowed, handleStripeEvent } = require('./_lib/stripe');
const B = require('./_lib/billing');
const WD = require('./_lib/wedding');
const { site } = require('./_lib/config');

const mockSession = (id, over) => ({ type: 'checkout.session.completed', livemode: false, data: { object: { id: 'mock_' + id + '_' + Date.now(), payment_status: 'paid', status: 'complete', currency: site.pricing.currency, ...over } } });

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const db = getDb();
  const base = process.env.PUBLIC_BASE_URL || origin(req);
  const mock = body.action === 'mock-complete';
  if (mock && !mockPaymentsAllowed()) throw httpError(403, 'Mock payments are disabled');

  if (body.kind === 'wedding') {
    const { wedding: w } = await WD.requireHost(body.w, body.token, db);
    const plan = body.plan === 'plus' ? 'plus' : 'wedding';
    if (mock) {
      const r = await handleStripeEvent(mockSession(w.id, { amount_total: site.weddings.plans[plan].priceCents, client_reference_id: w.id, metadata: { kind: 'wedding', weddingId: w.id, plan, fromEvent: body.fromEvent || '' } }), db);
      return send(res, 200, { ...r, wedding: await WD.publicWedding(await db.get('weddings', w.id), db, { forHost: true }) });
    }
    return send(res, 200, await B.createWeddingCheckout(w, plan, base, body.fromEvent || null));
  }

  if (body.kind === 'dj') {
    const l = await B.licenceByToken(body.licenceToken, db);
    if (!l) throw httpError(403, 'Licence not found');
    if (mock) {
      const r = await handleStripeEvent(mockSession(l.id, { amount_total: site.weddings.plans.dj.priceCents, client_reference_id: l.id, customer: null, subscription: null, metadata: { kind: 'dj', licenceId: l.id } }), db);
      return send(res, 200, r);
    }
    if (B.licenceActive(l)) return send(res, 200, { alreadyActive: true });
    return send(res, 200, await B.createDjCheckout(l, base));
  }

  // Party Pass (showers & birthdays)
  const ev = await requireHost(body.id, body.token, db);
  if (mock) {
    const result = await handleStripeEvent(mockSession(ev.id, { amount_total: site.pricing.passPriceCents, metadata: { eventId: ev.id }, client_reference_id: ev.id }), db);
    return send(res, 200, { ...result, event: publicEvent(await db.get('events', ev.id)) });
  }
  if (planOf(ev) === 'pass') return send(res, 200, { alreadyPaid: true });
  const { url, mock: isMock } = await createCheckout(ev, base);
  return send(res, 200, { url, mock: isMock });
});
