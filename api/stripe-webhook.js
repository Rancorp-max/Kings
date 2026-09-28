'use strict';
// Stripe -> POST here (configure in Dashboard: checkout.session.completed, checkout.session.async_payment_succeeded).
const { handler, readRaw, send } = require('./_lib/http');
const { verifyWebhook, handleStripeEvent } = require('./_lib/stripe');

module.exports = handler(['POST'], async (req, res) => {
  const raw = await readRaw(req, 1024 * 1024); // raw bytes are required for signature verification
  const event = verifyWebhook(raw, req.headers['stripe-signature']);
  const result = await handleStripeEvent(event);
  console.log('[stripe-webhook]', event.type, event.id, JSON.stringify(result));
  return send(res, 200, { received: true, ...result });
});
// Tell Vercel/Next-style runtimes not to pre-parse the body.
module.exports.config = { api: { bodyParser: false } };
