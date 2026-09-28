// Thin client for the serverless API. Every call degrades gracefully when the
// API is unavailable (e.g. static hosting): callers get { error } instead of throwing.
import { store } from './util.js';
import { getAttribution } from './attribution.js';

async function req(path, { method = 'POST', body, query } = {}) {
  const url = path + (query ? '?' + new URLSearchParams(query) : '');
  try {
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || `Request failed (${r.status})`, code: data.code, status: r.status };
    return data;
  } catch {
    return { error: 'Can\'t reach the server — check your connection.', status: 0 };
  }
}

// The host's current event credentials live on this device only.
export const eventStore = {
  get() { return store.get('pd_event'); },
  set(v) { store.set('pd_event', v); },
  clear() { store.del('pd_event'); },
};

export async function ensureEvent({ theme, mode, fresh = false } = {}) {
  const cur = eventStore.get();
  if (cur && !fresh) {
    const r = await req('/api/events', { method: 'GET', query: { id: cur.id, token: cur.token } });
    if (!r.error) { eventStore.set({ ...cur, event: r.event }); return { ...cur, event: r.event }; }
    if (r.status !== 404 && r.status !== 403) return { ...cur, offline: true }; // keep credentials if the API is just unreachable
  }
  const r = await req('/api/events', { body: { action: 'create', theme, mode, attribution: getAttribution() } });
  if (r.error) return { offline: true, error: r.error };
  const v = { id: r.event.id, token: r.hostToken, event: r.event };
  eventStore.set(v);
  return v;
}

export async function refreshEvent() {
  const cur = eventStore.get(); if (!cur) return null;
  const r = await req('/api/events', { method: 'GET', query: { id: cur.id, token: cur.token } });
  if (r.error) return null;
  eventStore.set({ ...cur, event: r.event });
  return r.event;
}

export async function eventAction(action, extra = {}) {
  const cur = eventStore.get(); if (!cur) return { error: 'no event' };
  const r = await req('/api/events', { body: { action, id: cur.id, token: cur.token, ...extra } });
  if (r.event) eventStore.set({ ...cur, event: r.event });
  return r;
}

export async function startCheckout() {
  const cur = eventStore.get(); if (!cur) return { error: 'Create your party first.' };
  return req('/api/checkout', { body: { id: cur.id, token: cur.token } });
}

export async function redeemCode(code) {
  const cur = eventStore.get();
  const r = await req('/api/redeem', { body: { code, ...(cur ? { id: cur.id, token: cur.token } : {}), attribution: getAttribution() } });
  if (!r.error) eventStore.set({ id: r.event.id, token: r.hostToken || cur.token, event: r.event });
  return r;
}

export async function generateDeck({ theme, honoree, facts }) {
  const cur = eventStore.get(); if (!cur) return { error: 'Create your party first.' };
  const r = await req('/api/generate-deck', { body: { id: cur.id, token: cur.token, theme, honoree, facts } });
  if (r.event) eventStore.set({ ...cur, event: r.event });
  return r;
}

export { req };
