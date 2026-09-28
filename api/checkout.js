'use strict';
// POST {id, token} -> Stripe Checkout URL.  POST {action:'mock-complete', id, token} -> test-mode payment (non-production only).
const { handler, readJson, send, origin, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const { requireHost, planOf, publicEvent } = require('./_lib/events');
const { createCheckout, mockPaymentsAllowed, handleStripeEvent } = require('./_lib/stripe');
const { site } = require('./_lib/config');

module.exports = handler(['POST'], async (req, res) => {
  const body = await readJson(req);
  const db = getDb();
  const ev = await requireHost(body.id, body.token, db);
  if (body.action === 'mock-complete') {
    if (!mockPaymentsAllowed()) throw httpError(403, 'Mock payments are disabled');
    // Same code path as the real webhook, minus the signature check.
    const result = await handleStripeEvent({
      type: 'checkout.session.completed', livemode: false,
      data: { object: { id: 'mock_' + ev.id + '_' + Date.now(), payment_status: 'paid', amount_total: site.pricing.passPriceCents, currency: site.pricing.currency, metadata: { eventId: ev.id }, client_reference_id: ev.id } },
    }, db);
    return send(res, 200, { ...result, event: publicEvent(await db.get('events', ev.id)) });
  }
  if (planOf(ev) === 'pass') return send(res, 200, { alreadyPaid: true });
  const { url, mock } = await createCheckout(ev, process.env.PUBLIC_BASE_URL || origin(req));
  return send(res, 200, { url, mock });
});
