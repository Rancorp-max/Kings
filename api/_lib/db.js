'use strict';
/* Storage adapter.
 *
 *  - Firestore (production): set FIREBASE_SERVICE_ACCOUNT to the service-account JSON
 *    (raw or base64). FIRESTORE_EMULATOR_HOST + FIREBASE_PROJECT_ID also work.
 *  - File store (local dev/tests): JSON file under DATA_DIR (default .data/).
 *  - On Vercel without Firestore credentials, falls back to /tmp — NOT durable,
 *    flagged as `ephemeral` so the admin page can warn about it.
 *
 * All timestamps are epoch milliseconds so both adapters behave identically.
 */
const fs = require('fs');
const path = require('path');

class FileDb {
  constructor(file, { ephemeral = false } = {}) {
    this.file = file; this.kind = file ? 'file' : 'memory'; this.ephemeral = ephemeral;
    this.data = {}; this.chain = Promise.resolve();
    if (file && fs.existsSync(file)) { try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { this.data = {}; } }
  }
  // Serialise every operation so read-modify-write sequences are atomic in-process.
  _op(fn) {
    const run = this.chain.then(() => fn());
    this.chain = run.catch(() => {});
    return run;
  }
  _save() {
    if (!this.file || this._pending) return;
    // Coalesce bursts (e.g. 500 answers in a second) into one disk write.
    this._pending = setTimeout(() => { this._pending = null; this._flush(); }, 50);
  }
  _flush() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
  _col(c) { return (this.data[c] ||= {}); }
  get(c, id) { return this._op(() => { const d = this._col(c)[id]; return d ? structuredClone(d) : null; }); }
  set(c, id, data) { return this._op(() => { this._col(c)[id] = structuredClone(data); this._save(); }); }
  merge(c, id, data) { return this._op(() => { const col = this._col(c); col[id] = { ...(col[id] || {}), ...structuredClone(data) }; this._save(); }); }
  create(c, id, data) {
    return this._op(() => { const col = this._col(c); if (col[id]) return false; col[id] = structuredClone(data); this._save(); return true; });
  }
  increment(c, id, fields) {
    return this._op(() => {
      const col = this._col(c); const doc = (col[id] ||= {});
      for (const [k, v] of Object.entries(fields)) doc[k] = (Number(doc[k]) || 0) + v;
      this._save();
    });
  }
  // fn(current|null) -> next (or throws to abort). Returns next.
  update(c, id, fn) {
    return this._op(async () => {
      const col = this._col(c); const cur = col[id] ? structuredClone(col[id]) : null;
      const next = await fn(cur);
      if (next !== undefined) { col[id] = structuredClone(next); this._save(); }
      return next;
    });
  }
  list(c) { return this._op(() => Object.entries(this._col(c)).map(([id, d]) => ({ id, ...structuredClone(d) }))); }
  count(c) { return this._op(() => Object.keys(this._col(c)).length); }
  // Minimal filtered read: docs where d[field] > value (or ==), newest first, capped.
  query(c, { field, op = '>', value, limit = 500 } = {}) {
    return this._op(() => Object.entries(this._col(c)).map(([id, d]) => ({ id, ...structuredClone(d) }))
      .filter((d) => (op === '==' ? d[field] === value : d[field] > value))
      .sort((a, b) => (b[field] > a[field] ? 1 : -1)).slice(0, limit));
  }
}

class FirestoreDb {
  constructor() {
    const { initializeApp, getApps, cert } = require('firebase-admin/app');
    const { getFirestore, FieldValue } = require('firebase-admin/firestore');
    this.FieldValue = FieldValue; this.kind = 'firestore'; this.ephemeral = false;
    if (!getApps().length) {
      const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (raw) {
        const json = JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
        initializeApp({ credential: cert(json), projectId: json.project_id });
      } else {
        initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID || 'partydeck-dev' });
      }
    }
    this.db = getFirestore();
  }
  ref(c, id) { return this.db.collection(c).doc(id); }
  async get(c, id) { const s = await this.ref(c, id).get(); return s.exists ? s.data() : null; }
  async set(c, id, data) { await this.ref(c, id).set(data); }
  async merge(c, id, data) { await this.ref(c, id).set(data, { merge: true }); }
  async create(c, id, data) {
    try { await this.ref(c, id).create(data); return true; } catch (e) { if (e.code === 6 || /already exists/i.test(e.message)) return false; throw e; }
  }
  async increment(c, id, fields) {
    const upd = {}; for (const [k, v] of Object.entries(fields)) upd[k] = this.FieldValue.increment(v);
    await this.ref(c, id).set(upd, { merge: true });
  }
  update(c, id, fn) {
    return this.db.runTransaction(async (t) => {
      const r = this.ref(c, id); const s = await t.get(r);
      const next = await fn(s.exists ? s.data() : null);
      if (next !== undefined) t.set(r, next);
      return next;
    });
  }
  async list(c) { const s = await this.db.collection(c).get(); return s.docs.map((d) => ({ id: d.id, ...d.data() })); }
  async count(c) { const s = await this.db.collection(c).count().get(); return s.data().count; }
  async query(c, { field, op = '>', value, limit = 500 } = {}) {
    const s = await this.db.collection(c).where(field, op, value).orderBy(field, 'desc').limit(limit).get();
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

let instance = null;
function getDb() {
  if (instance) return instance;
  if (process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIRESTORE_EMULATOR_HOST) instance = new FirestoreDb();
  else if (process.env.VERCEL) {
    console.warn('[db] FIREBASE_SERVICE_ACCOUNT not set — using ephemeral /tmp storage');
    instance = new FileDb('/tmp/partydeck-db.json', { ephemeral: true });
  } else {
    const dir = process.env.DATA_DIR || path.join(__dirname, '../../.data');
    instance = new FileDb(path.join(dir, 'db.json'));
  }
  return instance;
}
function setDb(db) { instance = db; }

module.exports = { getDb, setDb, FileDb, FirestoreDb };
