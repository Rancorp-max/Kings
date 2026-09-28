'use strict';
/* Single-use access codes sold on Etsy.
 * Format: PD-XXXX-XXXX-XXXX (Crockford base32, 60 bits of entropy).
 * Only SHA-256 hashes are stored (api/_data/code-hashes.json, or the `codes`
 * collection); a code is spent by atomically creating redemptions/{hash}.
 */
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { getDb } = require('./db');
const { site } = require('./config');
const { httpError } = require('./http');
const { markEventPaid } = require('./events');

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: no I, L, O, U
const HASH_FILE = path.join(__dirname, '../_data/code-hashes.json');

function generateCode() {
  const bytes = crypto.randomBytes(12);
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
  return `PD-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

// Forgiving input: case, spaces, dashes, and look-alike letters.
function normalizeCode(input) {
  let s = String(input || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.startsWith('PD')) s = s.slice(2);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(s) ? s : null;
}

const hashCode = (normalized) => crypto.createHash('sha256').update('partydeck-code:' + normalized).digest('hex');

// Products a code can unlock: 'party' (Party Pass), 'wedding', 'wedding_plus'.
const PRODUCTS = ['party', 'wedding', 'wedding_plus'];
let fileHashes = null;
function knownHashes() {
  if (!fileHashes) {
    fileHashes = new Map();
    if (fs.existsSync(HASH_FILE)) for (const b of JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')).batches || []) for (const h of b.hashes) fileHashes.set(h, b.product || 'party');
  }
  return fileHashes;
}
function resetCache() { fileHashes = null; }

// Returns the product the code unlocks, or null if it isn't a real code.
async function productOf(hash, db = getDb()) {
  if (knownHashes().has(hash)) return knownHashes().get(hash);
  const d = await db.get('codes', hash);
  return d ? (d.product || 'party') : null;
}
async function isValidHash(hash, db = getDb()) { return !!(await productOf(hash, db)); }

/* Redeems a code for an event. Throws 400 (malformed), 404 (unknown), 409 (already used). */
async function redeemCode(code, eventId, db = getDb()) {
  const norm = normalizeCode(code);
  if (!norm) throw httpError(400, 'That doesn\'t look like a PartyDeck code (PD-XXXX-XXXX-XXXX).', 'bad_format');
  const hash = hashCode(norm);
  const product = await productOf(hash, db);
  if (!product) throw httpError(404, 'We couldn\'t find that code. Check for typos.', 'unknown_code');
  if (product !== 'party') throw httpError(400, 'That\'s a wedding code — redeem it from your wedding dashboard.', 'wrong_product');
  const fresh = await db.create('redemptions', hash, { eventId, createdAt: Date.now() });
  if (!fresh) {
    const r = await db.get('redemptions', hash);
    if (r && r.eventId === eventId) return { alreadyApplied: true };
    throw httpError(409, 'This code has already been used.', 'used');
  }
  const { event } = await markEventPaid(eventId, {
    purchaseId: 'etsy_' + hash.slice(0, 24), method: 'etsy_code', amountCents: site.pricing.etsyCodeRevenueCents,
    extra: { codeHashPrefix: hash.slice(0, 8) },
  }, db);
  return { alreadyApplied: false, event };
}

module.exports = { PRODUCTS, productOf, ALPHABET, HASH_FILE, generateCode, normalizeCode, hashCode, redeemCode, isValidHash, resetCache };
