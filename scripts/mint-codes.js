#!/usr/bin/env node
/* Mint single-use Party Pass codes for Etsy.
 *
 *   npm run mint-codes -- --count 500 --batch etsy-2026-09
 *
 * Writes the plaintext codes to private/codes-<batch>.csv (git-ignored — upload
 * that file to Etsy as the digital download / use it to fulfil orders) and
 * appends only their SHA-256 hashes to api/_data/code-hashes.json. Commit and
 * deploy that JSON for the codes to become redeemable.
 * Add --db to store the hashes in Firestore (`codes` collection) instead, which
 * makes them live immediately without a redeploy.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { generateCode, normalizeCode, hashCode, HASH_FILE } = require('../api/_lib/codes');

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const count = Math.min(10000, Math.max(1, Number(arg('count', 500))));
const batch = arg('batch', 'batch-' + new Date().toISOString().slice(0, 10));
const toDb = args.includes('--db');

(async () => {
  const codes = new Set();
  while (codes.size < count) codes.add(generateCode());
  const list = [...codes];
  const hashes = list.map((c) => hashCode(normalizeCode(c)));

  const outDir = path.join(__dirname, '../private');
  fs.mkdirSync(outDir, { recursive: true });
  const csv = path.join(outDir, `codes-${batch}.csv`);
  fs.writeFileSync(csv, 'code,batch\n' + list.map((c) => `${c},${batch}`).join('\n') + '\n');

  if (toDb) {
    const { getDb } = require('../api/_lib/db');
    const db = getDb();
    for (const h of hashes) await db.set('codes', h, { batch, createdAt: Date.now() });
    console.log(`Stored ${hashes.length} hashes in ${db.kind} storage.`);
  } else {
    const data = fs.existsSync(HASH_FILE) ? JSON.parse(fs.readFileSync(HASH_FILE, 'utf8')) : { batches: [] };
    if (data.batches.some((b) => b.id === batch)) throw new Error(`Batch ${batch} already exists`);
    data.batches.push({ id: batch, createdAt: new Date().toISOString(), count: hashes.length, hashes });
    fs.writeFileSync(HASH_FILE, JSON.stringify(data, null, 1) + '\n');
    console.log(`Appended ${hashes.length} hashes to ${path.relative(process.cwd(), HASH_FILE)} — commit + deploy to activate.`);
  }
  console.log(`Plaintext codes: ${path.relative(process.cwd(), csv)} (keep private).`);
})().catch((e) => { console.error(e.message); process.exit(1); });
