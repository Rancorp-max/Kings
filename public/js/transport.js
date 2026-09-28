// Networking: PeerJS (WebRTC) in production, BroadcastChannel for same-browser tests.
import { params, USE_LOCAL, uid } from './util.js';

const PEER_PREFIX = 'partydeck-v1-';

// ========================================================= TRANSPORTS
// A "conn" is { id, send(msg), onData(fn), onClose(fn), close() }.

export function makeConn(id, sendFn, closeFn) {
  const h = { data: [], close: [] }; let closed = false;
  return {
    id,
    send: (m) => { if (!closed) { try { sendFn(m); } catch (e) { console.warn('[KC] send failed', e); } } },
    onData: (fn) => h.data.push(fn),
    onClose: (fn) => h.close.push(fn),
    close: () => { if (closed) return; closed = true; try { closeFn(); } catch { /* ignore */ } h.close.forEach((f) => f()); },
    _emit: (m) => { if (!closed) h.data.forEach((f) => f(m)); },
    _closed: () => { if (closed) return; closed = true; h.close.forEach((f) => f()); },
  };
}

// Dev/test only: ?peer=localhost:9000 points at a local PeerServer (never honoured on public hosts).
const PEER_OPTS = (() => {
  const v = params.get('peer'); if (!v || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(v)) return {};
  const [host, port] = v.split(':');
  return { host, port: Number(port || 9000), path: '/', secure: false, config: { iceServers: [] } };
})();

// PeerJS loads async; wait for it briefly before giving up.
async function peerReady() {
  for (let i = 0; i < 40 && !window.Peer; i++) await new Promise((r) => setTimeout(r, 250));
  if (!window.Peer) throw new Error('Could not load the multiplayer library. Check your connection.');
}

const PeerTransport = {
  // Resolves once the room is registered. `resume` retries when the id is
  // still held by our own previous session (e.g. host refreshed the page).
  async host(code, onConn, { resume = false } = {}) {
    await peerReady();
    return new Promise((resolve, reject) => {
      let tries = 0; let opened = false;
      const attempt = () => {
        const peer = new Peer(PEER_PREFIX + code, { debug: 1, ...PEER_OPTS });
        peer.on('open', () => { opened = true; resolve({ close: () => peer.destroy() }); });
        peer.on('connection', (dc) => {
          dc.on('open', () => {
            const conn = makeConn(dc.peer, (m) => dc.send(m), () => dc.close());
            dc.on('data', (m) => conn._emit(m));
            dc.on('close', () => conn._closed());
            dc.on('error', () => conn._closed());
            onConn(conn);
          });
        });
        peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch { /* ignore */ } }, 1500); });
        peer.on('error', (e) => {
          if (opened) { console.warn('[KC] peer error', e.type); return; }
          peer.destroy();
          if (e.type === 'unavailable-id') {
            if (resume && ++tries < 10) setTimeout(attempt, 2500);
            else reject(Object.assign(new Error('Room code taken'), { code: 'taken' }));
          } else reject(new Error('Could not reach the game server (' + e.type + ').'));
        });
      };
      attempt();
    });
  },
  async join(code) {
    await peerReady();
    return new Promise((resolve, reject) => {
      const peer = new Peer({ debug: 1, ...PEER_OPTS });
      let done = false;
      const fail = (msg) => { if (done) return; done = true; peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Couldn\'t reach that room. Double-check the code, or ask the host to keep the game open.'), 15000);
      peer.on('open', () => {
        const dc = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
        dc.on('open', () => {
          if (done) return; done = true; clearTimeout(timer);
          const conn = makeConn(peer.id, (m) => dc.send(m), () => { dc.close(); peer.destroy(); });
          dc.on('data', (m) => conn._emit(m));
          dc.on('close', () => { conn._closed(); peer.destroy(); });
          dc.on('error', () => conn._closed());
          resolve(conn);
        });
      });
      peer.on('error', (e) => {
        clearTimeout(timer);
        fail(e.type === 'peer-unavailable' ? 'Room not found — check the code!' : 'Connection problem (' + e.type + ').');
      });
    });
  },
};

// Same-browser transport for tabs, used for offline testing.
const LocalTransport = (() => {
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('kingscup-local') : null;
  const handlers = new Set();
  if (bc) bc.onmessage = (e) => handlers.forEach((h) => h(e.data));
  const post = (m) => bc && bc.postMessage(m);
  return {
    host(code, onConn) {
      return new Promise((resolve, reject) => {
        if (!bc) { reject(new Error('BroadcastChannel unsupported')); return; }
        const hostId = 'host-' + code; const conns = new Map();
        const h = (m) => {
          if (m.to !== hostId) return;
          if (m.type === 'connect') {
            const conn = makeConn(m.from, (d) => post({ to: m.from, from: hostId, type: 'data', d }), () => post({ to: m.from, from: hostId, type: 'close' }));
            conns.set(m.from, conn); post({ to: m.from, from: hostId, type: 'accept' }); onConn(conn);
          } else if (m.type === 'data') conns.get(m.from)?._emit(m.d);
          else if (m.type === 'close') { conns.get(m.from)?._closed(); conns.delete(m.from); }
        };
        handlers.add(h);
        addEventListener('pagehide', () => conns.forEach((c) => c.close()));
        resolve({ close: () => { handlers.delete(h); conns.forEach((c) => c.close()); } });
      });
    },
    join(code) {
      return new Promise((resolve, reject) => {
        if (!bc) { reject(new Error('BroadcastChannel unsupported')); return; }
        const me = 'guest-' + uid(); const hostId = 'host-' + code; let conn = null;
        const timer = setTimeout(() => { handlers.delete(h); reject(new Error('Room not found — check the code!')); }, 2500);
        const h = (m) => {
          if (m.to !== me || m.from !== hostId) return;
          if (m.type === 'accept') {
            clearTimeout(timer);
            conn = makeConn(me, (d) => post({ to: hostId, from: me, type: 'data', d }), () => { post({ to: hostId, from: me, type: 'close' }); handlers.delete(h); });
            addEventListener('pagehide', () => conn.close());
            resolve(conn);
          } else if (m.type === 'data') conn?._emit(m.d);
          else if (m.type === 'close') { conn?._closed(); handlers.delete(h); }
        };
        handlers.add(h);
        post({ to: hostId, from: me, type: 'connect' });
      });
    },
  };
})();


export const Transport = USE_LOCAL ? LocalTransport : PeerTransport;
