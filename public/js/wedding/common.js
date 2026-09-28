// Shared client code for the wedding pages.
import { SITE } from '../site-config.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const params = new URLSearchParams(location.search);
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};
export const W = SITE.weddings;
export const AVATARS = ['🦚', '🌸', '🪷', '🌼', '🦋', '🐘', '🦁', '🐯', '🦊', '🐼', '🦄', '🐬', '🌟', '🎶', '💃', '🕺', '🥁', '🎺', '💍', '👑', '🎉', '🍬', '🥭', '☕'];
export const COLORS = ['#e2355c', '#ff7a1c', '#e8b100', '#1c9a57', '#12a4b8', '#2f6bdf', '#8b5cff', '#c13dff'];

export function toast(msg, ms = 2600) {
  let box = $('#toasts'); if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div'); el.className = 'toast'; el.textContent = msg; box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
}

export async function api(body, { method = 'POST', path = '/api/wedding', query } = {}) {
  try {
    const r = await fetch(path + (query ? '?' + new URLSearchParams(query) : ''), { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return { error: d.error || `Request failed (${r.status})`, code: d.code, status: r.status };
    return d;
  } catch { return { error: 'offline', status: 0 }; }
}

// Host credentials (owner or co-host) per wedding: {w, token}. Co-host links carry #t=…
export function hostCreds(wid) {
  const all = store.get('pdw_hosts', {});
  const hash = new URLSearchParams(location.hash.slice(1));
  if (wid && hash.get('t')) { all[wid] = hash.get('t'); store.set('pdw_hosts', all); history.replaceState(null, '', location.pathname + location.search); }
  return wid && all[wid] ? { w: wid, token: all[wid] } : null;
}
export function saveHost(wid, token) { const all = store.get('pdw_hosts', {}); all[wid] = token; store.set('pdw_hosts', all); }

/* Follow the live state. Polls the edge-cached endpoint (fast during rounds,
 * slower when idle, with jitter so 500 phones don't sync up). If Firebase web
 * config is present, listens to Firestore instead and falls back to polling. */
export function followLive(wid, onLive) {
  let stopped = false; let last = null; let offset = 0; let timer = null;
  const deliver = (live, serverNow) => {
    if (serverNow) offset = serverNow - Date.now();
    if (!last || live.v !== last.v) { const prev = last; last = live; onLive(live, prev, () => Date.now() + offset); }
  };
  const poll = async () => {
    if (stopped) return;
    const r = await api(null, { method: 'GET', path: '/api/wedding-live', query: { w: wid } });
    if (!r.error) deliver(r.live, r.serverNow);
    const busy = last && ['question', 'vote', 'prompt', 'reveal'].includes(last.stage);
    const next = (busy ? 1200 : 2500) + Math.random() * 600;
    timer = setTimeout(poll, r.error === 'offline' ? 3000 : next);
  };
  const viaFirestore = async () => {
    const cfg = SITE.firebaseWeb; if (!cfg) return false;
    try {
      const v = '10.12.3';
      const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-app.js`);
      const { getFirestore, doc, onSnapshot } = await import(`https://www.gstatic.com/firebasejs/${v}/firebase-firestore.js`);
      const db = getFirestore(initializeApp(cfg, 'pdw'));
      onSnapshot(doc(db, 'wedding_live', wid), (snap) => { if (snap.exists()) deliver(snap.data(), null); }, () => poll());
      // Clock offset still comes from our API once.
      const r = await api(null, { method: 'GET', path: '/api/wedding-live', query: { w: wid } }); if (!r.error) deliver(r.live, r.serverNow);
      return true;
    } catch { return false; }
  };
  viaFirestore().then((ok) => { if (!ok) poll(); });
  addEventListener('online', () => { clearTimeout(timer); poll(); });
  return { stop() { stopped = true; clearTimeout(timer); }, now: () => Date.now() + offset, refresh() { clearTimeout(timer); poll(); } };
}

/* Guest answer queue: optimistic UI + retry with backoff on bad venue wifi.
 * Each answer is idempotent server-side (one doc per guest per round). */
export function answerQueue(creds, onResult) {
  const KEY = 'pdw_queue_' + creds.w;
  let q = store.get(KEY, []);
  let busy = false;
  const save = () => store.set(KEY, q);
  async function flush() {
    if (busy || !q.length) return;
    busy = true;
    for (const item of [...q]) {
      const r = await api({ action: 'answer', w: creds.w, gid: creds.gid, secret: creds.secret, eventId: item.eventId, index: item.index, choice: item.choice });
      if (r.error === 'offline' || r.status >= 500 || r.status === 0) { item.tries = (item.tries || 0) + 1; break; }
      q = q.filter((x) => x !== item); save();
      onResult?.(item, r);
    }
    busy = false;
  }
  setInterval(flush, 3000);
  addEventListener('online', flush);
  return {
    push(item) { q = q.filter((x) => !(x.eventId === item.eventId && x.index === item.index)); q.push({ ...item, at: Date.now() }); save(); flush(); },
    pending: () => q.length,
    has: (eventId, index) => q.find((x) => x.eventId === eventId && x.index === index),
  };
}

export function qr(el, text, size = 220) {
  el.innerHTML = '';
  if (window.QRCode) new window.QRCode(el, { text, width: size, height: size, colorDark: '#1a0b2e', colorLight: '#ffffff' });
  else el.textContent = text;
}

export const joinUrl = (code) => `${location.origin}/w?c=${encodeURIComponent(code)}`;
export const planLabel = (p) => W.plans[p]?.label || p;
export const money = (c) => `US$${(c / 100).toFixed(0)}`;
