'use strict';
/* Wedding billing: Wedding Pass / Plus (one-time), DJ/MC Pro licence (yearly
 * subscription), Etsy wedding codes. Party Pass billing lives in stripe.js.
 *
 *   licences/{lid}: { id, status: pending|active|past_due|canceled, tokenHash, email, brandName, logo,
 *                     stripeCustomerId, stripeSubscriptionId, currentPeriodEnd, createdAt }
 */
const { site, brand } = require('./config');
const { getDb } = require('./db');
const { httpError } = require('./http');
const { sha256, randomId, clip } = require('./events');
const { stripe, mockPaymentsAllowed } = require('./stripe');
const { normalizeCode, hashCode, productOf } = require('./codes');

const W = site.weddings;
const DAY = 86400000;
const RANK = { trial: 0, wedding: 1, plus: 2, dj: 3 };

// ---------------------------------------------------------------- wedding passes
async function markWeddingPaid(wid, { purchaseId, plan, method, amountCents, currency = 'usd', fromEvent = null, extra = {} }, db = getDb()) {
  if (!['wedding', 'plus'].includes(plan)) throw httpError(400, 'Unknown wedding plan');
  const w = await db.get('weddings', wid);
  if (!w) throw httpError(404, 'Wedding not found');
  const created = await db.create('purchases', purchaseId, {
    kind: 'wedding', weddingId: wid, eventId: null, theme: 'wedding', plan, amountCents, currency, method,
    source: w.source || 'direct', referrer: w.referrer || '', utm: w.utm || {}, fromEvent, createdAt: Date.now(), ...extra,
  });
  if (!created) return { applied: false, wedding: w };
  const now = Date.now();
  const next = await db.update('weddings', wid, (cur) => ({
    ...cur,
    plan: RANK[plan] >= RANK[cur.plan || 'trial'] ? plan : cur.plan, // an upgrade never downgrades
    paid: true, paidAt: now, paidVia: method,
    expiresAt: Math.max(now, cur.expiresAt || 0) + W.passValidDays * DAY,
    stats: { ...cur.stats, purchaseFromEvent: cur.stats?.purchaseFromEvent || fromEvent || null },
  }));
  return { applied: true, wedding: next };
}

async function createWeddingCheckout(w, plan, baseUrl, fromEvent) {
  const p = W.plans[plan];
  if (!p || !['wedding', 'plus'].includes(plan)) throw httpError(400, 'Unknown wedding plan');
  const success = `${baseUrl}/wedding/setup?w=${encodeURIComponent(w.id)}&paid=1`;
  const cancel = `${baseUrl}/wedding/setup?w=${encodeURIComponent(w.id)}&paid=0`;
  const s = stripe();
  if (!s) {
    if (!mockPaymentsAllowed()) throw httpError(503, 'Payments are not configured yet.', 'payments_unconfigured');
    return { url: `${baseUrl}/mock-checkout?kind=wedding&w=${encodeURIComponent(w.id)}&plan=${plan}${fromEvent ? `&from=${encodeURIComponent(fromEvent)}` : ''}`, mock: true };
  }
  const session = await s.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ quantity: 1, price_data: { currency: site.pricing.currency, unit_amount: p.priceCents, product_data: { name: `${brand.name} ${p.label} — ${w.title}`, description: `${p.maxEvents >= 999 ? 'Unlimited' : p.maxEvents} events · up to ${p.maxGuests} guests${p.languages ? ' · languages' : ''}${p.photobook ? ' · photo-book keepsake' : ''}` } } }],
    client_reference_id: w.id,
    metadata: { kind: 'wedding', weddingId: w.id, plan, fromEvent: fromEvent || '' },
    payment_intent_data: { metadata: { kind: 'wedding', weddingId: w.id, plan } },
    allow_promotion_codes: true, success_url: success, cancel_url: cancel,
  });
  return { url: session.url, mock: false };
}

// ---------------------------------------------------------------- DJ / MC licence
async function createLicence({ email, brandName } = {}, db = getDb()) {
  const id = randomId(8); const token = randomId(20);
  await db.set('licences', id, { id, status: 'pending', tokenHash: sha256(token), email: clip(email, 120), brandName: clip(brandName, 40), logo: '', createdAt: Date.now() });
  return { id, token };
}

async function licenceByToken(token, db = getDb()) {
  if (!token) return null;
  const [l] = await db.query('licences', { field: 'tokenHash', op: '==', value: sha256(token), limit: 1 });
  return l || null;
}

function licenceActive(l, t = Date.now()) {
  return !!l && (l.status === 'active' || l.status === 'past_due') && (!l.currentPeriodEnd || l.currentPeriodEnd + 3 * DAY > t);
}

async function requireLicence(token, db = getDb()) {
  const l = await licenceByToken(token, db);
  if (!l) throw httpError(403, 'Licence not found', 'bad_licence');
  if (!licenceActive(l)) throw httpError(402, 'Your DJ/MC Pro licence is not active. Renew it from the DJ page.', 'licence_inactive');
  return l;
}

async function createDjCheckout(licence, baseUrl) {
  const p = W.plans.dj;
  const success = `${baseUrl}/dj?paid=1`; const cancel = `${baseUrl}/dj?paid=0`;
  const s = stripe();
  if (!s) {
    if (!mockPaymentsAllowed()) throw httpError(503, 'Payments are not configured yet.', 'payments_unconfigured');
    return { url: `${baseUrl}/mock-checkout?kind=dj&l=${encodeURIComponent(licence.id)}`, mock: true };
  }
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ quantity: 1, price_data: { currency: site.pricing.currency, unit_amount: p.priceCents, recurring: { interval: 'year' }, product_data: { name: `${brand.name} ${p.label} licence`, description: 'Unlimited weddings, 500 guests, languages, photo-book keepsake, your logo on the scoreboard.' } } }],
    client_reference_id: licence.id,
    customer_email: licence.email || undefined,
    metadata: { kind: 'dj', licenceId: licence.id },
    subscription_data: { metadata: { kind: 'dj', licenceId: licence.id } },
    allow_promotion_codes: true, success_url: success, cancel_url: cancel,
  });
  return { url: session.url, mock: false };
}

async function createPortal(licence, baseUrl) {
  const s = stripe();
  if (!s || !licence.stripeCustomerId) throw httpError(503, 'Billing portal is not available for this licence.', 'portal_unavailable');
  const session = await s.billingPortal.sessions.create({ customer: licence.stripeCustomerId, return_url: `${baseUrl}/dj` });
  return { url: session.url };
}

async function activateLicence(lid, { customer, subscription, periodEnd, amountCents, purchaseId, method = 'stripe' }, db = getDb()) {
  const l = await db.get('licences', lid);
  if (!l) throw httpError(404, 'Licence not found');
  const created = await db.create('purchases', purchaseId, { kind: 'dj', licenceId: lid, eventId: null, theme: 'dj', plan: 'dj', amountCents, currency: site.pricing.currency, method, source: 'dj', referrer: '', createdAt: Date.now() });
  if (!created) return { applied: false };
  await db.update('licences', lid, (cur) => ({ ...cur, status: 'active', stripeCustomerId: customer || cur.stripeCustomerId || null, stripeSubscriptionId: subscription || cur.stripeSubscriptionId || null, currentPeriodEnd: periodEnd || Date.now() + 365 * DAY, activatedAt: cur.activatedAt || Date.now() }));
  return { applied: true };
}

async function syncSubscription(sub, db = getDb()) {
  const lid = sub.metadata?.licenceId; if (!lid) return { handled: false, reason: 'no_licence' };
  const status = sub.status === 'active' || sub.status === 'trialing' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'canceled';
  const end = sub.current_period_end || sub.items?.data?.[0]?.current_period_end;
  await db.update('licences', lid, (cur) => (cur ? { ...cur, status, currentPeriodEnd: end ? end * 1000 : cur.currentPeriodEnd, stripeSubscriptionId: sub.id } : undefined));
  return { handled: true, licenceId: lid, status };
}

// Stripe event router for wedding + DJ products (called from stripe.handleStripeEvent).
async function handleBillingEvent(event, db = getDb()) {
  const o = event.data?.object || {};
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const kind = o.metadata?.kind;
    if (kind === 'wedding') {
      if (o.payment_status !== 'paid') return { handled: false, reason: 'not_paid' };
      const r = await markWeddingPaid(o.metadata.weddingId || o.client_reference_id, { purchaseId: 'stripe_' + o.id, plan: o.metadata.plan, method: o.id.startsWith('mock_') ? 'mock' : 'stripe', amountCents: o.amount_total, currency: o.currency, fromEvent: o.metadata.fromEvent || null, extra: { stripeSessionId: o.id } }, db);
      return { handled: true, applied: r.applied, weddingId: o.metadata.weddingId };
    }
    if (kind === 'dj') {
      if (o.payment_status !== 'paid' && o.status !== 'complete') return { handled: false, reason: 'not_paid' };
      const r = await activateLicence(o.metadata.licenceId || o.client_reference_id, { customer: o.customer, subscription: o.subscription, amountCents: o.amount_total, purchaseId: 'stripe_' + o.id, method: o.id.startsWith('mock_') ? 'mock' : 'stripe' }, db);
      return { handled: true, applied: r.applied, licenceId: o.metadata.licenceId };
    }
    return null; // not ours: party pass
  }
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.created') return syncSubscription(o, db);
  if (event.type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
    // Renewal revenue: record it as a purchase so /admin revenue stays right.
    const lid = o.subscription_details?.metadata?.licenceId || o.parent?.subscription_details?.metadata?.licenceId || o.lines?.data?.[0]?.metadata?.licenceId;
    if (!lid) return { handled: false, reason: 'no_licence' };
    const created = await db.create('purchases', 'stripe_inv_' + o.id, { kind: 'dj', licenceId: lid, theme: 'dj', plan: 'dj', amountCents: o.amount_paid, currency: o.currency, method: 'stripe', source: 'dj-renewal', createdAt: Date.now() });
    return { handled: true, applied: created };
  }
  return null;
}

// ---------------------------------------------------------------- Etsy wedding codes
async function redeemWeddingCode(code, wid, db = getDb()) {
  const norm = normalizeCode(code);
  if (!norm) throw httpError(400, 'That doesn\'t look like a PartyDeck code (PD-XXXX-XXXX-XXXX).', 'bad_format');
  const hash = hashCode(norm);
  const product = await productOf(hash, db);
  if (!product) throw httpError(404, 'We couldn\'t find that code. Check for typos.', 'unknown_code');
  if (product === 'party') throw httpError(400, 'That\'s a Party Pass code — redeem it at /redeem for a shower or birthday party.', 'wrong_product');
  const fresh = await db.create('redemptions', hash, { weddingId: wid, createdAt: Date.now() });
  if (!fresh) {
    const r = await db.get('redemptions', hash);
    if (r?.weddingId === wid) return { alreadyApplied: true };
    throw httpError(409, 'This code has already been used.', 'used');
  }
  const plan = product === 'wedding_plus' ? 'plus' : 'wedding';
  await markWeddingPaid(wid, { purchaseId: 'etsy_' + hash.slice(0, 24), plan, method: 'etsy_code', amountCents: W.plans[plan].priceCents, extra: { codeHashPrefix: hash.slice(0, 8) } }, db);
  return { alreadyApplied: false, plan };
}

module.exports = {
  markWeddingPaid, createWeddingCheckout, createLicence, licenceByToken, licenceActive, requireLicence,
  createDjCheckout, createPortal, activateLicence, syncSubscription, handleBillingEvent, redeemWeddingCode,
};
