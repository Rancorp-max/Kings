// /admin — password-protected dashboard (password checked server-side).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const pw = document.getElementById('pw');
try { pw.value = sessionStorage.getItem('pd_admin') || ''; } catch { /* ignore */ }

function table(title, obj, fmt = (v) => v, head = ['', '']) {
  const rows = Object.entries(obj || {}).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...rows.map(([, v]) => v));
  return `<div class="panel"><h3>${title}</h3>${rows.length ? `<table><tr><th>${head[0]}</th><th class="num">${head[1]}</th><th></th></tr>${rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">${fmt(v)}</td><td style="width:40%"><div class="bar" style="width:${(v / max) * 100}%"></div></td></tr>`).join('')}</table>` : '<p class="small">No data yet.</p>'}</div>`;
}

async function load() {
  const r = await fetch('/api/admin', { headers: { 'x-admin-password': pw.value } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { document.getElementById('err').textContent = d.error || 'Failed'; return; }
  try { sessionStorage.setItem('pd_admin', pw.value); } catch { /* ignore */ }
  document.getElementById('err').textContent = '';
  const t = d.totals;
  const rule = (x, name) => `<div class="rule ${x.status}"><b>${name}:</b> ${esc(x.text)}</div>`;
  document.getElementById('dash').innerHTML = `
    ${d.storage.ephemeral ? '<div class="warn-box">⚠️ Storage is temporary (/tmp). Set FIREBASE_SERVICE_ACCOUNT on Vercel so data survives restarts.</div>' : ''}
    <p class="small">Storage: ${esc(d.storage.kind)} · Stripe: ${esc(d.config.stripe)} · Webhook secret: ${d.config.webhook ? 'set' : 'missing'} · Anthropic: ${d.config.anthropic ? 'set' : 'missing'} · Launch: ${esc(d.launch || 'not set')} (day ${d.daysSinceLaunch ?? '?'})</p>
    <div class="kpis">
      <div class="kpi"><b>${t.landingVisits}</b><span>Landing-page visits</span></div>
      <div class="kpi"><b>${t.eventsCreated}</b><span>Parties set up</span></div>
      <div class="kpi"><b>${t.roomsCreated}</b><span>Rooms opened</span></div>
      <div class="kpi"><b>${t.gamesPlayed}</b><span>Games played</span></div>
      <div class="kpi"><b>${t.passesSold}</b><span>Passes sold</span></div>
      <div class="kpi"><b>${money(t.revenueUsd)}</b><span>Revenue (USD)</span></div>
      <div class="kpi"><b>${t.conversionFreeToPaid}%</b><span>Free → paid</span></div>
      <div class="kpi"><b>${money(t.aiCostUsd)}</b><span>Anthropic cost · ${money(t.aiCostPerEventUsd)}/event using AI · ${money(t.aiCostPerPaidEventUsd)}/paid event</span></div>
    </div>
    <h2>Kill / double-down rules</h2>${rule(d.rules.day7, 'Day 7')}${rule(d.rules.day30, 'Day 30')}${d.rules.day30Weddings ? rule(d.rules.day30Weddings, 'Day 30 (weddings)') : ''}
    <h2>💍 Weddings</h2>
    <div class="kpis">
      <div class="kpi"><b>${d.weddings.created}</b><span>Weddings created</span></div>
      <div class="kpi"><b>${d.weddings.paid}</b><span>Paid weddings</span></div>
      <div class="kpi"><b>${money(d.weddings.revenueUsd)}</b><span>Wedding revenue</span></div>
      <div class="kpi"><b>${d.weddings.licencesActive}</b><span>Active DJ/MC licences · ${money(d.weddings.djRevenueUsd)}</span></div>
    </div>
    <div class="grid2">${table('Wedding revenue by plan', d.weddings.revenueByPlanUsd, money, ['Plan', 'USD'])}${table('Wedding revenue by source', d.weddings.revenueBySourceUsd, money, ['Source', 'USD'])}</div>
    <div class="panel" style="margin-top:14px"><h3>Per wedding</h3><table><tr><th>Wedding</th><th>Plan</th><th>Source</th><th class="num">Events run</th><th class="num">Guests</th><th class="num">Peak players</th><th class="num">Keepsake downloads</th><th>Purchase started from</th><th class="num">AI $</th></tr>
    ${d.weddings.list.map((w) => `<tr><td>${esc(w.title)}</td><td>${esc(w.plan)}${w.paid ? ' ✓' : ''}</td><td>${esc(w.source)}</td><td class="num">${w.eventsRun}</td><td class="num">${w.guestsJoined}</td><td class="num">${w.peakConcurrent}</td><td class="num">${w.keepsakeDownloads}</td><td>${esc(w.purchaseFromEvent || '—')}</td><td class="num">${money(w.aiCostUsd)}</td></tr>`).join('') || '<tr><td colspan="9">No weddings yet</td></tr>'}</table></div>
    <h2>🎉 Showers &amp; birthdays</h2>
    <div class="grid2">
      ${table('Revenue by source', d.revenueBySourceUsd, money, ['Source', 'USD'])}
      ${table('Revenue by theme', d.revenueByThemeUsd, money, ['Theme', 'USD'])}
      ${table('Conversion by source (%)', d.conversionBySource, (v) => v + '%', ['Source', 'Paid %'])}
      ${table('Parties by source', d.eventsBySource, (v) => v, ['Source', 'Parties'])}
      ${table('Parties by theme', d.eventsByTheme, (v) => v, ['Theme', 'Parties'])}
      ${table('Visits by page', d.visitsByPage, (v) => v, ['Page', 'Visits'])}
      ${table('Revenue by method', d.revenueByMethodUsd, money, ['Method', 'USD'])}
    </div>
    <div class="panel" style="margin-top:14px"><h3>Recent purchases</h3><table><tr><th>When</th><th>Theme</th><th>Method</th><th>Source</th><th>Referrer</th><th class="num">USD</th></tr>
    ${d.recentPurchases.map((p) => `<tr><td>${new Date(p.createdAt).toLocaleString()}</td><td>${esc(p.theme)}</td><td>${esc(p.method)}</td><td>${esc(p.source)}</td><td>${esc(p.referrer || '')}</td><td class="num">${money(p.amountUsd)}</td></tr>`).join('') || '<tr><td colspan="6">None yet</td></tr>'}</table></div>`;
}
document.getElementById('login').addEventListener('submit', (e) => { e.preventDefault(); load(); });
if (pw.value) load();
