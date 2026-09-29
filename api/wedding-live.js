'use strict';
/* GET ?w=<weddingId> -> the public live state every screen follows.
 * Cached at the edge for 1 s, so 500 phones polling cost ~1 origin read/second
 * per wedding. (With FIREBASE web config set, clients can listen to
 * wedding_live/{wid} in Firestore directly instead.) */
const { handler, send, query, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');

const memo = new Map(); // per-instance micro-cache (same idea as the CDN cache)

module.exports = handler(['GET'], async (req, res) => {
  const q = query(req);
  // Doodle Duel finalists' drawings: fetched once per round, immutable, so cached for a long time.
  if (q.art) {
    const art = await getDb().get('wedding_art', String(q.art).slice(0, 20));
    if (!art) throw httpError(404, 'Not found');
    return send(res, 200, { art: art.art }, { 'cache-control': 'public, max-age=3600, s-maxage=86400, immutable' });
  }
  const wid = String(q.w || '').slice(0, 40);
  if (!wid) throw httpError(400, 'Missing wedding');
  const hit = memo.get(wid);
  let live;
  if (hit && Date.now() - hit.at < 700) live = hit.live;
  else {
    live = await getDb().get('wedding_live', wid);
    if (!live) throw httpError(404, 'Wedding not found');
    memo.set(wid, { at: Date.now(), live });
    if (memo.size > 500) memo.delete(memo.keys().next().value);
  }
  send(res, 200, { live, serverNow: Date.now() }, { 'cache-control': 'public, max-age=0, s-maxage=1, stale-while-revalidate=1' });
});
