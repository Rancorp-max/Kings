'use strict';
/* Stripe Checkout (one-time Party Pass per event) + webhook handling. */
const { site, brand, pricing } = require('./config');
const { markEventPaid } = require('./events');
const { getDb } = require('./db');
const { httpError } = require('./http');

let client = null;
function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!client) { const Stripe = require('stripe'); client = new Stripe(process.env.STRIPE_SECRET_KEY); }
  return client;
}

// Without Stripe keys, non-production deployments simulate payment so the whole flow can be exercised.
function mockPaymentsAllowed() {
  if (process.env.STRIPE_SECRET_KEY) return false;
  if (process.env.ALLOW_MOCK_PAYMENTS === '1') return true;
  return !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production';
}

const THEME_LABEL = { 'baby-shower': 'Baby shower', 'bridal-shower': 'Bridal shower', 'milestone-birthday': 'Milestone birthday', 'kings-cup': "King's Cup" };

async function createCheckout(ev, baseUrl) {
  const s = stripe();
  const success = `${baseUrl}/play?event=${encodeURIComponent(ev.id)}&paid=1`;
  const cancel = `${baseUrl}/play?event=${encodeURIComponent(ev.id)}&paid=0`;
  if (!s) {
    if (!mockPaymentsAllowed()) throw httpError(503, 'Payments are not configured yet.', 'payments_unconfigured');
    return { url: `${baseUrl}/mock-checkout?event=${encodeURIComponent(ev.id)}`, mock: true };
  }
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: pricing.currency,
        unit_amount: pricing.passPriceCents,
        product_data: {
          name: `${brand.name} ${pricing.passLabel} — ${THEME_LABEL[ev.theme] || 'Party'}`,
          description: `Up to ${site.limits.pass.maxPlayers} players, personalised questions, keepsake without watermark. Valid ${pricing.passDays} days.`,
        },
      },
    }],
    client_reference_id: ev.id,
    metadata: { eventId: ev.id, theme: ev.theme, source: ev.source || 'direct' },
    payment_intent_data: { metadata: { eventId: ev.id } },
    allow_promotion_codes: true,
    success_url: success,
    cancel_url: cancel,
  });
  return { url: session.url, mock: false };
}

// Verifies the signature and returns the parsed Stripe event (throws 400 on failure).
function verifyWebhook(rawBody, signature, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  if (!secret) throw httpError(503, 'Webhook secret not configured');
  const Stripe = require('stripe');
  try {
    return Stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    throw httpError(400, 'Invalid signature: ' + e.message, 'bad_signature');
  }
}

/* Applies a verified Stripe event. Idempotent: purchases are keyed by the
 * Checkout Session id, so retries and duplicate deliveries are no-ops. */
async function handleStripeEvent(event, db = getDb()) {
  if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.async_payment_succeeded') {
    return { handled: false, reason: 'ignored_type' };
  }
  const session = event.data && event.data.object;
  if (!session) return { handled: false, reason: 'no_session' };
  if (session.payment_status !== 'paid') return { handled: false, reason: 'not_paid' };
  const eventId = (session.metadata && session.metadata.eventId) || session.client_reference_id;
  if (!eventId) return { handled: false, reason: 'no_event_id' };
  const { applied } = await markEventPaid(eventId, {
    purchaseId: 'stripe_' + session.id,
    method: session.id.startsWith('mock_') ? 'mock' : 'stripe',
    amountCents: session.amount_total ?? pricing.passPriceCents,
    currency: session.currency || pricing.currency,
    extra: { stripeSessionId: session.id, livemode: !!event.livemode },
  }, db);
  return { handled: true, applied, eventId };
}

module.exports = { stripe, mockPaymentsAllowed, createCheckout, verifyWebhook, handleStripeEvent };
