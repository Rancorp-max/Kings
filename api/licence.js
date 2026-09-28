'use strict';
/* DJ/MC Pro licences.
 *   POST {action:'create', email, brandName}        -> {licenceToken} (then POST /api/checkout {kind:'dj'})
 *   POST {action:'get', licenceToken}                -> licence status + weddings created with it
 *   POST {action:'brand', licenceToken, brandName, logo}  -> update scoreboard branding (applies to its weddings)
 *   POST {action:'portal', licenceToken}             -> Stripe billing portal URL (manage/cancel)
 */
const { handler, readJson, send, origin, httpError } = require('./_lib/http');
const { getDb } = require('./_lib/db');
const B = require('./_lib/billing');
const WD = require('./_lib/wedding');
const { clip } = require('./_lib/events');

module.exports = handler(['POST'], async (req, res) => {
  const b = await readJson(req);
  const db = getDb();
  if (b.action === 'create') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(b.email || ''))) throw httpError(400, 'Enter a valid email for billing receipts.');
    const { id, token } = await B.createLicence(b, db);
    return send(res, 201, { licenceId: id, licenceToken: token });
  }
  const l = await B.licenceByToken(b.licenceToken, db);
  if (!l) throw httpError(403, 'Licence not found');
  switch (b.action) {
    case 'get': {
      const weddings = (await db.query('weddings', { field: 'licenceId', op: '==', value: l.id, limit: 200 })).map((w) => ({ id: w.id, title: w.title, code: w.code, createdAt: w.createdAt }));
      return send(res, 200, { licence: { id: l.id, status: l.status, active: B.licenceActive(l), email: l.email, brandName: l.brandName, logo: l.logo, currentPeriodEnd: l.currentPeriodEnd || null }, weddings });
    }
    case 'brand': {
      const logo = b.logo === '' ? '' : WD.validLogo(b.logo) ? b.logo : l.logo;
      const brandName = clip(b.brandName, 40);
      await db.update('licences', l.id, (cur) => ({ ...cur, brandName, logo }));
      for (const w of await db.query('weddings', { field: 'licenceId', op: '==', value: l.id, limit: 200 })) await db.merge('weddings', w.id, { brand: { name: brandName, logo } });
      return send(res, 200, { ok: true });
    }
    case 'portal': return send(res, 200, await B.createPortal(l, process.env.PUBLIC_BASE_URL || origin(req)));
    default: throw httpError(400, 'Unknown action');
  }
});
