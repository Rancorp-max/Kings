// First-touch attribution (UTM params + external referrer), captured once per
// browser and attached to the event when a host creates a party. Also sends an
// anonymous page-view beacon (no cookies, no personal data).
const KEY = 'pd_attr';

export function captureAttribution() {
  try {
    const existing = localStorage.getItem(KEY);
    const p = new URLSearchParams(location.search);
    const utm = {};
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) if (p.get(k)) utm[k] = p.get(k).slice(0, 100);
    let referrer = document.referrer || '';
    try { if (referrer && new URL(referrer).host === location.host) referrer = ''; } catch { referrer = ''; }
    // First touch wins, but a later visit that carries UTM params overrides a bare direct visit.
    const prev = existing ? JSON.parse(existing) : null;
    if (!prev || (!prev.utm_source && !prev.referrer && (utm.utm_source || referrer))) {
      localStorage.setItem(KEY, JSON.stringify({ ...utm, referrer: referrer.slice(0, 300), landing: location.pathname, ts: Date.now() }));
    }
  } catch { /* storage blocked */ }
}

export function getAttribution() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

export function trackPageview() {
  try {
    if (navigator.webdriver) return; // skip automated browsers
    const body = JSON.stringify({ path: location.pathname });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    else fetch('/api/track', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* ignore */ }
}
