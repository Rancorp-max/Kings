// /redeem — turn an Etsy code into a Party Pass for this browser's party.
import { redeemCode, eventStore } from './api.js';
import { SITE } from './site-config.js';

const form = document.getElementById('redeemForm');
const code = document.getElementById('code');
const pre = new URLSearchParams(location.search).get('code');
if (pre) code.value = pre;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = form.querySelector('button'); btn.disabled = true;
  document.getElementById('err').textContent = '';
  const r = await redeemCode(code.value);
  btn.disabled = false;
  if (r.error) { document.getElementById('err').textContent = r.error; return; }
  const until = r.event.expiresAt ? new Date(r.event.expiresAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }) : '';
  document.getElementById('okText').textContent = `Your ${SITE.pricing.passLabel} is active${until ? ` until ${until}` : ''} on this device — up to ${r.event.limits.maxPlayers} players, personalised questions and a keepsake without watermark.`;
  document.getElementById('ok').classList.remove('hidden');
  form.classList.add('hidden');
  eventStore.get();
});
