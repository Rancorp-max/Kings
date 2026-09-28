// Small shared helpers for the game client.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
export const rand = (a) => a[Math.floor(Math.random() * a.length)];
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const pickN = (a, n) => shuffle(a).slice(0, n);
export const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const params = new URLSearchParams(location.search);
export const USE_LOCAL = params.get('transport') === 'local';

// In local (same-browser) test mode each tab is its own player, so keep state per tab.
const storage = () => (USE_LOCAL ? sessionStorage : localStorage);
export const store = {
  get(k, d = null) { try { const v = storage().getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { storage().setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  del(k) { try { storage().removeItem(k); } catch { /* storage unavailable */ } },
};

export const AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👻', '🎃', '🦖', '🐧', '🦉', '🐝',
  '🍕', '🌮', '🍩', '🌶️', '🔥', '⚡', '🌈', '💎', '🎸', '🚀', '👑', '🤠', '🥳', '😎', '🤡', '🧜', '🐣', '🌸', '🎈', '🧁'];
export const COLORS = ['#ff3d8b', '#ff9f1c', '#ffc83d', '#3dffa2', '#2de2e6', '#4d7cff', '#8b5cff', '#c13dff', '#ff5e5e', '#1ec28b'];
export const REACTIONS = ['🥳', '😂', '😍', '😱', '👏', '🔥', '🥹', '🍻'];

export function avatarHTML(p, cls = '') {
  if (!p) return '';
  return `<span class="avatar ${cls}" style="--c:${esc(p.color || '#6b2cff')}">${esc(p.avatar || '🙂')}</span>`;
}

export function toast(msg, ms = 2400) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
}

export const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* unsupported */ } };

export function randomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (n) => A[n % A.length]).join('');
}

export function pageUrl(extra = {}) {
  const u = new URL(location.href);
  u.search = ''; u.hash = '';
  if (USE_LOCAL) u.searchParams.set('transport', 'local');
  const peer = params.get('peer'); if (peer) u.searchParams.set('peer', peer);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null) u.searchParams.set(k, v);
  return u.toString();
}
export const inviteUrl = (code) => pageUrl({ room: code });
