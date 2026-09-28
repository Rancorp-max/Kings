// DJ/MC Pro licence page.
import { $, esc, params, store, api, toast, W, money } from './common.js';

let token = store.get('pdw_licence'); let logo = null;
const lic = (body) => api({ ...body, licenceToken: token }, { path: '/api/licence' });

async function show() {
  $('#priceLine').textContent = `${money(W.plans.dj.priceCents)} per year`;
  if (!token) { $('#vBuy').classList.remove('hidden'); $('#vPro').classList.add('hidden'); return; }
  const r = await lic({ action: 'get' });
  if (r.error) { if (r.status === 403) { store.del('pdw_licence'); token = null; } toast(r.error); return show(); }
  const l = r.licence;
  $('#vBuy').classList.add('hidden'); $('#vPro').classList.remove('hidden');
  $('#status').textContent = l.active ? 'Active' : l.status; $('#status').className = 'pill ' + (l.active ? 'ok' : 'warn');
  $('#period').textContent = l.currentPeriodEnd ? `Renews ${new Date(l.currentPeriodEnd).toLocaleDateString()}` : '';
  $('#keyShow').value = token;
  $('#finish').classList.toggle('hidden', l.active);
  $('#newWedding').classList.toggle('hidden', !l.active);
  $('#bName').value = l.brandName || ''; logo = l.logo || '';
  $('#logoPrev').innerHTML = logo ? `<img src="${esc(logo)}" alt="" style="max-height:60px;background:#fff;border-radius:8px;padding:4px" />` : '';
  $('#wList').innerHTML = r.weddings.map((w) => `<div class="it"><span class="tx"><b>${esc(w.title)}</b><small>Code ${esc(w.code)} · ${new Date(w.createdAt).toLocaleDateString()}</small></span><a class="btn btn-ghost btn-sm" href="/wedding/setup?w=${w.id}">Open</a></div>`).join('') || '<p class="small muted">No weddings yet.</p>';
}

async function checkout() {
  const r = await api({ kind: 'dj', licenceToken: token }, { path: '/api/checkout' });
  if (r.url) { location.href = r.url; return; }
  if (r.alreadyActive) return show();
  toast(r.error || 'Checkout unavailable', 4000);
}

$('#buy').addEventListener('click', async () => {
  $('#buyErr').textContent = '';
  const r = await api({ action: 'create', email: $('#email').value, brandName: $('#brandName').value }, { path: '/api/licence' });
  if (r.error) { $('#buyErr').textContent = r.error; return; }
  token = r.licenceToken; store.set('pdw_licence', token);
  checkout();
});
$('#restore').addEventListener('click', () => { token = $('#restoreKey').value.trim(); store.set('pdw_licence', token); show(); });
$('#finish').addEventListener('click', checkout);
$('#portal').addEventListener('click', async () => { const r = await lic({ action: 'portal' }); if (r.url) location.href = r.url; else toast(r.error || 'Unavailable', 4000); });
// Resize the logo in the browser so it stays small (stored with the licence).
$('#bLogo').addEventListener('change', (e) => {
  const f = e.target.files[0]; if (!f) return;
  const img = new Image();
  img.onload = () => {
    const s = Math.min(1, 360 / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    logo = c.toDataURL('image/png');
    $('#logoPrev').innerHTML = `<img src="${logo}" alt="" style="max-height:60px;background:#fff;border-radius:8px;padding:4px" />`;
  };
  img.src = URL.createObjectURL(f);
});
$('#bSave').addEventListener('click', async () => { const r = await lic({ action: 'brand', brandName: $('#bName').value, logo }); toast(r.error || 'Branding saved ✓ — it shows on all your weddings'); });

if (params.get('paid') === '1') toast('🎉 Licence purchase complete!', 4000);
show();
