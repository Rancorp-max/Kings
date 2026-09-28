// Wedding creation + owner dashboard.
import { $, $$, esc, params, store, api, hostCreds, saveHost, toast, qr, joinUrl, W, planLabel, money } from './common.js';
import { getAttribution, captureAttribution } from '../attribution.js';

captureAttribution();
let wid = params.get('w') || store.get('pdw_last_wedding');
let creds = wid ? hostCreds(wid) : null;
let wedding = null; let types = null;
const licenceToken = params.get('dj') ? store.get('pdw_licence') : null;
const SIDE_COLORS = ['#e2355c', '#2f6bdf', '#1c9a57', '#b98300', '#8b5cff', '#ff7a1c'];
let sides = [{ name: "Bride's side", color: SIDE_COLORS[0] }, { name: "Groom's side", color: SIDE_COLORS[1] }];
const host = (body) => api({ ...body, w: creds.w, token: creds.token });

async function eventTypes() { if (!types) { const r = await api(null, { method: 'GET', query: { action: 'packs' } }); types = r.eventTypes || {}; } return types; }

// ---------------------------------------------------------------- create
async function showCreate() {
  $('#vCreate').classList.remove('hidden'); $('#vDash').classList.add('hidden');
  $('#djBox').classList.toggle('hidden', !licenceToken);
  $('#planPill').textContent = licenceToken ? 'DJ/MC Pro' : 'Free trial — upgrade anytime';
  const et = await eventTypes();
  // ?events=sangeet,reception preselects events (used by the guide pages' buttons).
  const asked = (params.get('events') || '').split(',').filter((k) => et[k] && k !== 'custom');
  const defaults = asked.length ? asked : ['mehndi', 'sangeet', 'reception'];
  $('#evPresets').innerHTML = Object.entries(et).filter(([k]) => k !== 'custom').map(([k, v]) => `<label class="it" style="display:flex;gap:8px;align-items:center;background:rgba(255,255,255,.05);padding:8px;border-radius:12px">
    <input type="checkbox" data-ev="${k}" ${defaults.includes(k) ? 'checked' : ''} /><span style="flex:1">${v.emoji} ${esc(v.name)}</span><input class="input" type="date" data-evdate="${k}" style="max-width:150px" /></label>`).join('');
  $('#evLimitNote').textContent = licenceToken ? 'Unlimited events.' : `Tick the events you're having. The free trial runs 1 event with up to ${W.plans.trial.maxGuests} guests; a ${W.plans.wedding.label} (${money(W.plans.wedding.priceCents)}) covers ${W.plans.wedding.maxEvents} events and ${W.plans.wedding.maxGuests} guests; ${W.plans.plus.label} (${money(W.plans.plus.priceCents)}) is unlimited with 500 guests and languages.`;
  renderSidesEd('#sidesEd');
}
function renderSidesEd(sel) {
  $(sel).innerHTML = sides.map((s, i) => `<div class="row" style="margin-bottom:6px"><input type="color" value="${s.color}" data-scol="${i}" style="width:44px;height:40px;border:0;background:none" /><input class="input" data-sname="${i}" maxlength="30" value="${esc(s.name)}" />${sides.length > 2 ? `<button class="mini" data-sdel="${i}">✕</button>` : ''}</div>`).join('');
}
function readSides(sel) {
  $$(`${sel} [data-sname]`).forEach((inp) => { sides[Number(inp.dataset.sname)].name = inp.value; });
  $$(`${sel} [data-scol]`).forEach((inp) => { sides[Number(inp.dataset.scol)].color = inp.value; });
}

async function doCreate() {
  $('#createErr').textContent = '';
  readSides('#sidesEd');
  const a = $('#cA').value.trim(); const b = $('#cB').value.trim();
  if (!a) { $('#createErr').textContent = 'Add at least one name.'; return; }
  const events = $$('#evPresets [data-ev]').filter((c) => c.checked).map((c) => ({ type: c.dataset.ev, date: $(`[data-evdate="${c.dataset.ev}"]`).value || null }));
  if (!events.length) { $('#createErr').textContent = 'Pick at least one event.'; return; }
  const btn = $('#createBtn'); btn.disabled = true;
  const r = await api({ action: 'create', couple: { names: [a, b].filter(Boolean) }, title: $('#cTitle').value.trim(), sides, teamScoring: $('#teamTotal').checked ? 'total' : 'average', events, dates: events.map((e) => e.date).filter(Boolean), attribution: getAttribution(), licenceToken });
  btn.disabled = false;
  if (r.error) { $('#createErr').textContent = r.error; return; }
  wid = r.wedding.id; saveHost(wid, r.ownerToken); store.set('pdw_last_wedding', wid); store.set('pdw_owner_' + wid, true);
  creds = { w: wid, token: r.ownerToken };
  history.replaceState(null, '', `/wedding/setup?w=${wid}`);
  toast('💍 Your wedding is ready!'); showDash();
}

// ---------------------------------------------------------------- dashboard
async function showDash() {
  $('#vCreate').classList.add('hidden'); $('#vDash').classList.remove('hidden');
  const r = await host({ action: 'get' });
  if (r.error) { toast(r.error, 5000); if (r.status === 403 || r.status === 404) { store.del('pdw_last_wedding'); showCreate(); } return; }
  wedding = r.wedding; const owner = r.role === 'owner';
  $$('.owner-only').forEach((el) => el.classList.toggle('hidden', !owner));
  $('#dTitle').textContent = wedding.title;
  $('#planPill').textContent = planLabel(wedding.plan) + (wedding.expiresAt ? ` · until ${new Date(wedding.expiresAt).toLocaleDateString()}` : '');
  $('#dCode').textContent = wedding.code;
  const url = joinUrl(wedding.code); $('#dJoinLink').href = url; $('#dJoinLink').textContent = url.replace(/^https?:\/\//, '');
  qr($('#dQR'), url, 180);
  $('#dScreen').href = `/wedding/screen?w=${wid}&c=${wedding.code}`;
  $('#dBook').href = `/wedding/book?w=${wid}`;
  const s = wedding.stats || {};
  $('#stGuests').textContent = s.guestsJoined || 0; $('#stRun').textContent = s.eventsRun || 0; $('#stPeak').textContent = s.peakConcurrent || 0;
  $('#stMore').textContent = `${s.keepsakeDownloads || 0} keepsake download(s) · up to ${wedding.limits.maxGuests} guests · ${wedding.limits.maxEvents >= 999 ? 'unlimited' : wedding.limits.maxEvents} event(s) on this plan`;
  const et = await eventTypes();
  $('#dEvents').innerHTML = wedding.events.map((e) => `<div class="it"><span class="k">${et[e.type]?.emoji || '🎉'}</span><span class="tx"><b>${esc(e.name)}</b><small>${e.date || 'date TBC'}${e.time ? ' · ' + e.time : ''} · ${e.items?.length || 0} rounds · ${e.status}</small></span>
    <span class="ops"><a class="btn btn-gold btn-sm" href="/wedding/host?w=${wid}&e=${e.id}">Host</a>${owner ? `<button class="mini" data-rmev="${e.id}">✕</button>` : ''}</span></div>`).join('');
  $('#newEvType').innerHTML = Object.entries(et).map(([k, v]) => `<option value="${k}">${v.emoji} ${esc(v.name)}</option>`).join('');
  renderPlan(owner);
  $('#chCount').textContent = `${(wedding.cohosts || []).length}/${W.maxCohosts}`;
  $('#dCohosts').innerHTML = (wedding.cohosts || []).map((c) => `<div class="it"><span class="tx">${esc(c.name)}</span><button class="mini" data-rmch="${c.id}">Remove</button></div>`).join('');
  sides = wedding.sides.map((x) => ({ name: x.name, color: x.color })); renderSidesEd('#dSides');
}

function renderPlan(owner) {
  const p = wedding.plan; const card = $('#planCard');
  const opt = (id) => `<div class="card" style="margin:0"><b>${W.plans[id].label} — ${money(W.plans[id].priceCents)}</b><ul class="small">${id === 'wedding' ? `<li>Up to ${W.plans.wedding.maxEvents} events</li><li>Up to ${W.plans.wedding.maxGuests} guests</li><li>Keepsake book without watermark</li>` : '<li>Unlimited events</li><li>Up to 500 guests</li><li>8 languages + bilingual screens</li><li>Photo-book (8×8) keepsake</li>'}</ul><button class="btn btn-gold btn-block" data-buy="${id}">Get ${W.plans[id].label}</button></div>`;
  if (p === 'plus' || p === 'dj') { card.innerHTML = `<h2>✨ ${planLabel(p)}</h2><p class="small">Unlimited events, 500 guests, languages and the photo-book keepsake are unlocked.</p>`; return; }
  card.innerHTML = `<h2>${p === 'wedding' ? `✅ ${W.plans.wedding.label} active` : '🎁 Free trial'}</h2>
    <p class="small muted">${p === 'wedding' ? 'Upgrade to Plus for unlimited events, 500 guests, languages and the photo-book keepsake.' : `Trial: 1 event, ${W.plans.trial.maxGuests} guests, watermark on the screen and keepsake.`}</p>
    <div class="grid2">${p === 'trial' ? opt('wedding') : ''}${opt('plus')}</div>
    <details style="margin-top:10px"><summary>🎟️ I have a wedding code</summary><div class="row"><input class="input" id="wCode" placeholder="PD-XXXX-XXXX-XXXX" /><button class="btn btn-ghost btn-sm" id="wRedeem">Redeem</button></div><p class="err" id="wCodeErr"></p></details>`;
  if (!owner) card.querySelectorAll('button').forEach((b) => { b.disabled = true; });
}

// ---------------------------------------------------------------- events
$('#addSide').addEventListener('click', () => { readSides('#sidesEd'); if (sides.length < 6) sides.push({ name: `Team ${sides.length + 1}`, color: SIDE_COLORS[sides.length] }); renderSidesEd('#sidesEd'); });
$('#sidesEd').addEventListener('click', (e) => { const i = e.target.dataset.sdel; if (i !== undefined) { readSides('#sidesEd'); sides.splice(Number(i), 1); renderSidesEd('#sidesEd'); } });
$('#createBtn').addEventListener('click', doCreate);
$('#addEv').addEventListener('click', async () => {
  $('#evErr').textContent = '';
  const r = await host({ action: 'add-event', event: { type: $('#newEvType').value, date: $('#newEvDate').value || null, time: $('#newEvTime').value || null } });
  if (r.error) { $('#evErr').textContent = r.error; return; }
  showDash();
});
$('#dEvents').addEventListener('click', async (e) => { const id = e.target.dataset.rmev; if (id && confirm('Remove this event?')) { await host({ action: 'remove-event', eventId: id }); showDash(); } });
$('#addCh').addEventListener('click', async () => {
  const r = await host({ action: 'add-cohost', name: $('#chName').value });
  if (r.error) { toast(r.error, 4000); return; }
  const link = `${location.origin}/wedding/host?w=${wid}#t=${r.cohost.token}`;
  $('#chLink').innerHTML = `<div class="note"><b>Send this private link to ${esc($('#chName').value || 'your co-host')}:</b><br><input class="input" readonly value="${esc(link)}" onclick="this.select()" /></div>`;
  $('#chName').value = ''; showDash();
});
$('#dCohosts').addEventListener('click', async (e) => { const id = e.target.dataset.rmch; if (id) { await host({ action: 'remove-cohost', id }); showDash(); } });
$('#saveSides').addEventListener('click', async () => { readSides('#dSides'); const r = await host({ action: 'update', patch: { sides } }); if (r.error) toast(r.error); else toast('Teams saved ✓'); });
$('#planCard').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-buy]');
  if (b) {
    b.disabled = true; b.textContent = 'Opening secure checkout…';
    const r = await api({ kind: 'wedding', w: wid, token: creds.token, plan: b.dataset.buy, fromEvent: wedding.events.find((x) => x.status === 'live')?.id || null }, { path: '/api/checkout' });
    if (r.url) { location.href = r.url; return; }
    toast(r.error || 'Checkout unavailable', 4000); showDash();
  }
  if (e.target.id === 'wRedeem') {
    const r = await host({ action: 'redeem', code: $('#wCode').value });
    if (r.error) { $('#wCodeErr').textContent = r.error; return; }
    toast(`🎉 ${planLabel(r.plan || r.wedding.plan)} unlocked!`); showDash();
  }
});

// ---------------------------------------------------------------- boot
if (params.get('paid') === '1') toast('🎉 Payment received — thank you!', 4000);
if (params.get('paid') === '0') toast('Checkout cancelled.');
if (creds && !params.get('new')) showDash(); else showCreate();
