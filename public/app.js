/* King's Cup — multiplayer party game.
 *
 * Networking model: the host's browser is the authoritative game server.
 * Guests connect to it peer-to-peer (WebRTC via PeerJS), send intents
 * ("draw", "react", ...) and receive the full public game state back.
 * Add ?transport=local to the URL to use BroadcastChannel instead, which
 * lets you play/test across tabs of one browser without any network.
 */
(() => {
  'use strict';

  // ---------------------------------------------------------------- data
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RED = new Set(['♥', '♦']);

  const RULES = {
    A: { name: 'Never Have I Ever', emoji: '🙊', desc: 'Everyone holds up 3 fingers. Go around saying things you\'ve never done — anyone who has puts a finger down. First to lose all 3 takes a sip.' },
    2: { name: 'You', emoji: '👉', desc: 'Pick someone to take a sip.', pick: 'Who takes the sip?' },
    3: { name: 'Me', emoji: '🙋', desc: 'That\'s you — take a sip!' },
    4: { name: 'Floor', emoji: '👇', desc: 'Everyone touch the floor! Last one down takes a sip.' },
    5: { name: 'Guys', emoji: '🧔', desc: 'All the guys take a sip.' },
    6: { name: 'Girls', emoji: '💃', desc: 'All the girls take a sip.' },
    7: { name: 'Heaven', emoji: '☝️', desc: 'Point to the sky! Last hand up takes a sip.' },
    8: { name: 'Mate', emoji: '🤝', desc: 'Pick a mate — whenever you sip, they sip too. For the rest of the game!', pick: 'Choose your mate' },
    9: { name: 'Rhyme', emoji: '🎤', desc: 'Say a word. Go around rhyming with it. First to stumble or repeat takes a sip.' },
    10: { name: 'Waterfall', emoji: '🌊', desc: 'Everyone starts sipping at once. You can only stop when the person before you stops.' },
    J: { name: 'Categories', emoji: '🗂️', desc: 'Pick a category. Go around naming things in it. First to blank takes a sip.', category: true },
    Q: { name: 'Question Master', emoji: '❓', desc: 'You\'re the Question Master! Anyone who answers a question you ask must sip — until the next Queen.' },
    K: { name: 'King\'s Cup', emoji: '👑', desc: 'Make a new rule everyone must follow! Pour a splash into the King\'s Cup.', rule: true },
  };
  const FOURTH_KING = 'The 4th King! Drink the whole King\'s Cup! 🏆';

  const CATEGORIES = [
    'Dog breeds', 'Pizza toppings', 'Superheroes', 'Disney movies', 'Board games', 'Countries in Europe',
    'Car brands', 'Ice cream flavours', 'Video game characters', 'Musical instruments', 'Fruits', 'Pokémon',
    'Star Wars characters', 'Coffee drinks', 'Chocolate bars', 'Cartoon characters', 'Mythical creatures',
    'Fast food chains', 'Rappers', 'Pop stars', 'Dinosaurs', 'Breakfast foods', 'Types of pasta', 'Cocktails',
    'Sea creatures', 'Cities with a subway', 'Things that are red', 'Harry Potter characters', 'Sports teams',
    'Words that rhyme with "cat"', 'Things in a kitchen', 'Famous duos', 'TV sitcoms', 'Cheese types',
  ];
  const RULE_IDEAS = [
    'No first names', 'No pointing', 'T-Rex arms while talking', 'British accent until your next turn',
    'No saying "drink"', 'Clap before you speak', 'Thumb Master', 'No swearing', 'Talk like a pirate',
    'Only whisper', 'Pinky up when sipping', 'Questions must be answered with a question', 'No touching your hair',
    'Say "yeehaw" before every sip', 'Ban the letter S', 'Compliment the person on your left',
  ];

  const AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🐙', '🦄', '🐲', '👽', '🤖', '👻', '🎃', '🦖', '🐧', '🦉', '🐝',
    '🍕', '🌮', '🍩', '🌶️', '🔥', '⚡', '🌈', '💎', '🎸', '🚀', '👑', '🤠', '🥳', '😎', '🤡', '🧜'];
  const COLORS = ['#ff3d8b', '#ff9f1c', '#ffc83d', '#3dffa2', '#2de2e6', '#4d7cff', '#8b5cff', '#c13dff', '#ff5e5e', '#1ec28b'];
  const REACTIONS = ['🍻', '😂', '🔥', '😱', '👑', '💀', '🥳', '👏'];

  const PEER_PREFIX = 'kingscup-v2-';
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const HEARTBEAT_MS = 4000;
  const TIMEOUT_MS = 14000;
  const AFK_SKIP_MS = 15000;

  // ------------------------------------------------------------- helpers
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const rand = (a) => a[Math.floor(Math.random() * a.length)];
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickN = (a, n) => shuffle(a).slice(0, n);
  const clean = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const USE_LOCAL = params.get('transport') === 'local';
  // In local (same-browser) test mode each tab is its own player, so keep state per tab.
  const storage = () => (USE_LOCAL ? sessionStorage : localStorage);
  const store = {
    get(k, d = null) { try { const v = storage().getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { storage().setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    del(k) { try { storage().removeItem(k); } catch { /* storage unavailable */ } },
  };

  function avatarHTML(p, cls = '') {
    if (!p) return '';
    return `<span class="avatar ${cls}" style="--c:${esc(p.color || '#6b2cff')}">${esc(p.avatar || '🙂')}</span>`;
  }
  function randomCode() {
    const b = crypto.getRandomValues(new Uint8Array(4));
    return Array.from(b, (n) => CODE_ALPHABET[n % CODE_ALPHABET.length]).join('');
  }
  function cleanUrl() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    if (USE_LOCAL) u.searchParams.set('transport', 'local');
    return u.toString();
  }
  function inviteUrl(code) {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', code);
    if (USE_LOCAL) u.searchParams.set('transport', 'local');
    return u.toString();
  }

  // ------------------------------------------------------------ toasts
  function toast(msg, ms = 2200) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms);
  }

  // ------------------------------------------------------------- sound
  const Sound = {
    on: store.get('kc_sound', true),
    ctx: null,
    ac() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } } if (this.ctx.state === 'suspended') this.ctx.resume(); return this.ctx; },
    tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0) {
      if (!this.on) return; const ac = this.ac(); if (!ac) return;
      const t0 = ac.currentTime + delay; const o = ac.createOscillator(); const g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g).connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    },
    swoosh() {
      if (!this.on) return; const ac = this.ac(); if (!ac) return;
      const len = ac.sampleRate * 0.25; const buf = ac.createBuffer(1, len, ac.sampleRate); const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const s = ac.createBufferSource(); s.buffer = buf; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800; const g = ac.createGain(); g.gain.value = 0.25;
      s.connect(f).connect(g).connect(ac.destination); s.start();
    },
    draw() { this.swoosh(); this.tone(660, 0.1, 'triangle', 0.12, 0.18); },
    turn() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.14, i * 0.09)); },
    king() { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.25, 'square', 0.07, i * 0.08)); },
    join() { this.tone(880, 0.08, 'sine', 0.12); this.tone(1320, 0.12, 'sine', 0.1, 0.07); },
    pop() { this.tone(500 + Math.random() * 500, 0.07, 'sine', 0.1); },
  };
  const buzz = (p) => { try { navigator.vibrate && navigator.vibrate(p); } catch { /* unsupported */ } };

  // ---------------------------------------------------------- confetti
  const Confetti = (() => {
    const cv = $('#confetti'); const ctx = cv.getContext('2d'); let parts = []; let raf = 0;
    const resize = () => { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; };
    addEventListener('resize', resize); resize();
    function loop() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts = parts.filter((p) => p.y < cv.height + 40 && p.life-- > 0);
      for (const p of parts) {
        p.vy += 0.25 * devicePixelRatio; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.emoji) { ctx.font = `${28 * devicePixelRatio}px system-ui`; ctx.fillText(p.emoji, 0, 0); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      raf = parts.length ? requestAnimationFrame(loop) : 0;
    }
    return function burst(n = 120, emojis = null) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const d = devicePixelRatio;
      for (let i = 0; i < n; i++) {
        parts.push({
          x: cv.width / 2 + (Math.random() - 0.5) * cv.width * 0.3, y: cv.height * 0.45,
          vx: (Math.random() - 0.5) * 22 * d, vy: (-Math.random() * 18 - 6) * d,
          r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, s: (6 + Math.random() * 8) * d,
          c: rand(['#ffc83d', '#ff3d8b', '#2de2e6', '#3dffa2', '#8b5cff', '#fff']),
          emoji: emojis && Math.random() < 0.3 ? rand(emojis) : null, life: 400,
        });
      }
      if (!raf) raf = requestAnimationFrame(loop);
    };
  })();

  // ========================================================= TRANSPORTS
  // A "conn" is { id, send(msg), onData(fn), onClose(fn), close() }.

  function makeConn(id, sendFn, closeFn) {
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

  // PeerJS loads async from a CDN; wait for it briefly before giving up.
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
          const peer = new Peer(PEER_PREFIX + code, { debug: 1 });
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
        const peer = new Peer({ debug: 1 });
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

  const Transport = USE_LOCAL ? LocalTransport : PeerTransport;

  // ============================================================ PROFILE
  const profile = Object.assign(
    { id: uid(), name: '', avatar: rand(AVATARS), color: rand(COLORS) },
    store.get('kc_profile', {}),
  );
  store.set('kc_profile', profile);
  const publicProfile = () => ({ id: profile.id, name: profile.name, avatar: profile.avatar, color: profile.color });

  // ============================================================== HOST
  // Authoritative game state lives here when this device is the host.
  const Host = {
    code: null, server: null, deck: [], state: null,
    conns: new Map(), // conn.id -> { conn, playerId, lastSeen }

    freshState(code, prev) {
      return {
        code, phase: 'lobby', hostId: profile.id,
        players: prev ? prev.players : [], turn: 0, deckLeft: 52, kings: 0,
        card: null, seq: 0, history: [], qm: null, mates: [], rules: [],
        gentle: prev ? prev.gentle : true, stats: {}, endedBy: null, endReason: null,
      };
    },

    async start(code, resume) {
      this.code = code;
      const saved = resume ? store.get('kc_host_' + code) : null;
      if (saved) { this.state = saved.state; this.deck = saved.deck; } else { this.state = this.freshState(code); this.deck = shuffle(buildDeck()); }
      this.state.hostId = profile.id;
      this.server = await Transport.host(code, (conn) => this.accept(conn), { resume });
      this.upsertPlayer(publicProfile(), true);
      this.state.players.forEach((p) => { if (p.id !== profile.id) { p.online = false; p.offlineSince = Date.now(); } });
      clearInterval(this.tick); this.tick = setInterval(() => this.heartbeat(), 3000);
      this.commit();
    },

    stop() {
      clearInterval(this.tick);
      this.conns.forEach(({ conn }) => { conn.send({ t: 'closed' }); conn.close(); });
      this.conns.clear();
      this.server?.close(); this.server = null;
      store.del('kc_host_' + this.code);
      this.state = null;
    },

    accept(conn) {
      const entry = { conn, playerId: null, lastSeen: Date.now() };
      this.conns.set(conn.id, entry);
      conn.onData((m) => { entry.lastSeen = Date.now(); this.onMessage(entry, m); });
      conn.onClose(() => {
        this.conns.delete(conn.id);
        const p = this.player(entry.playerId);
        if (p && ![...this.conns.values()].some((e) => e.playerId === p.id)) { p.online = false; p.offlineSince = Date.now(); this.commit(); }
      });
    },

    heartbeat() {
      const now = Date.now();
      this.conns.forEach((e) => { if (now - e.lastSeen > TIMEOUT_MS) e.conn.close(); else e.conn.send({ t: 'pong' }); });
      const s = this.state; if (!s || s.phase !== 'playing') return;
      const cur = s.players[s.turn];
      if (cur && !cur.online && now - (cur.offlineSince || now) > AFK_SKIP_MS && s.players.some((p) => p.online)) {
        this.advanceTurn(); this.event(`${cur.name} is offline — skipping their turn`); this.commit();
      }
    },

    onMessage(entry, m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'ping') return;
      if (m.t === 'hello') {
        const p = m.player || {};
        if (!p.id || typeof p.id !== 'string') return;
        if (p.id === profile.id) { entry.conn.send({ t: 'error', msg: 'That profile is already hosting this game.' }); return; }
        entry.playerId = p.id;
        const isNew = !this.player(p.id);
        this.upsertPlayer(p, true);
        entry.conn.send({ t: 'welcome', playerId: p.id });
        if (isNew) this.broadcast({ t: 'joined', id: p.id });
        this.commit();
        return;
      }
      if (!entry.playerId || !this.player(entry.playerId)) return;
      this.act(entry.playerId, m, (msg) => entry.conn.send({ t: 'error', msg }));
    },

    // All player intents (including the host's own) go through here.
    act(from, m, reply = (msg) => toast(msg)) {
      const s = this.state; if (!s) return;
      const isHost = from === s.hostId;
      switch (m.t) {
        case 'draw': {
          if (s.phase !== 'playing') return;
          const cur = s.players[s.turn];
          if (!cur || cur.id !== from) { reply('Hold up — it\'s not your turn!'); return; }
          if (!this.deck.length) return;
          const c = this.deck.pop();
          s.seq += 1;
          if (c.rank === 'K') s.kings += 1;
          if (c.rank === 'Q') s.qm = from;
          const st = s.stats[from] || (s.stats[from] = { draws: 0, kings: 0 });
          st.draws += 1; if (c.rank === 'K') st.kings += 1;
          s.card = { rank: c.rank, suit: c.suit, by: from, seq: s.seq, king: c.rank === 'K' ? s.kings : 0, choices: c.rank === 'J' ? pickN(CATEGORIES, 5) : c.rank === 'K' ? pickN(RULE_IDEAS, 5) : null };
          s.history.unshift({ rank: c.rank, suit: c.suit, by: from });
          s.history = s.history.slice(0, 52);
          s.deckLeft = this.deck.length;
          if (s.kings >= 4 || !this.deck.length) {
            s.phase = 'over'; s.endedBy = from; s.endReason = s.kings >= 4 ? 'king' : 'deck';
          } else this.advanceTurn();
          break;
        }
        case 'pick': {
          const c = s.card; const target = this.player(m.id);
          if (!c || c.by !== from || !RULES[c.rank].pick || c.pick || !target) return;
          if (c.rank === '8' && target.id === from) { reply('You can\'t be your own mate 😅'); return; }
          c.pick = target.id;
          if (c.rank === '8') s.mates.push([from, target.id]);
          break;
        }
        case 'category': {
          const c = s.card; const text = clean(m.text, 60);
          if (!c || c.by !== from || !RULES[c.rank].category || c.category || !text) return;
          c.category = text;
          break;
        }
        case 'rule': {
          const c = s.card; const text = clean(m.text, 90);
          if (!c || c.by !== from || c.rank !== 'K' || c.rule || !text) return;
          c.rule = text;
          s.rules.push({ text, by: from });
          break;
        }
        case 'react': {
          if (!REACTIONS.includes(m.emoji)) return;
          const now = Date.now();
          if (now - (this.lastReact?.[from] || 0) < 250) return;
          (this.lastReact ||= {})[from] = now;
          this.broadcast({ t: 'react', emoji: m.emoji, from });
          return;
        }
        case 'leave': {
          this.removePlayer(from);
          break;
        }
        // ---- host-only controls
        case 'start': case 'restart': {
          if (!isHost) return;
          const prev = s; this.state = this.freshState(this.code, prev);
          this.state.phase = 'playing';
          this.deck = shuffle(buildDeck());
          const online = this.state.players.findIndex((p) => p.online);
          this.state.turn = Math.max(0, online);
          break;
        }
        case 'lobby': { if (!isHost) return; this.state = this.freshState(this.code, s); this.deck = shuffle(buildDeck()); break; }
        case 'skip': { if (!isHost || s.phase !== 'playing') return; const cur = s.players[s.turn]; this.advanceTurn(); this.event(`Skipped ${cur?.name || 'player'}'s turn`); break; }
        case 'gentle': { if (!isHost) return; s.gentle = !!m.on; break; }
        case 'kick': {
          if (!isHost || m.id === s.hostId) return;
          this.conns.forEach((e) => { if (e.playerId === m.id) { e.conn.send({ t: 'kicked' }); setTimeout(() => e.conn.close(), 200); } });
          this.removePlayer(m.id);
          break;
        }
        default: return;
      }
      this.commit();
    },

    player(id) { return this.state?.players.find((p) => p.id === id); },

    upsertPlayer(p, online) {
      const s = this.state; const existing = this.player(p.id);
      const data = { id: p.id, name: clean(p.name, 16) || 'Player', avatar: AVATARS.includes(p.avatar) ? p.avatar : '🙂', color: COLORS.includes(p.color) ? p.color : COLORS[0] };
      if (existing) Object.assign(existing, data, { online, offlineSince: null });
      else if (s.players.length < 20) s.players.push({ ...data, online });
    },

    removePlayer(id) {
      const s = this.state; const i = s.players.findIndex((p) => p.id === id);
      if (i < 0 || id === s.hostId) return;
      s.players.splice(i, 1);
      if (i < s.turn) s.turn -= 1;
      if (s.turn >= s.players.length) s.turn = 0;
      if (s.phase === 'playing' && !s.players[s.turn]?.online) this.advanceTurn(true);
    },

    // Move to the next online player. `fromCurrent` also accepts the current seat.
    advanceTurn(fromCurrent = false) {
      const s = this.state; const n = s.players.length; if (!n) return;
      for (let k = fromCurrent ? 0 : 1; k <= n; k++) {
        const i = (s.turn + k) % n;
        if (s.players[i].online) { s.turn = i; return; }
      }
    },

    event(text) { this.broadcast({ t: 'event', text }); },

    broadcast(msg) {
      this.conns.forEach(({ conn, playerId }) => { if (playerId) conn.send(msg); });
      Client.onMessage(msg);
    },

    commit() {
      const s = this.state; if (!s) return;
      store.set('kc_host_' + this.code, { state: s, deck: this.deck, at: Date.now() });
      this.broadcast({ t: 'state', state: s });
    },
  };

  function buildDeck() { const d = []; for (const suit of SUITS) for (const rank of RANKS) d.push({ rank, suit }); return d; }

  // ============================================================ CLIENT
  // UI side. Hosts talk to Host directly; guests talk over a connection.
  const Client = {
    role: null, code: null, conn: null, state: null, lastHeard: 0, reconnecting: false, cancelled: false,

    send(m) {
      if (this.role === 'host') Host.act(profile.id, m);
      else if (this.conn) this.conn.send(m);
      else toast('Not connected yet…');
    },

    async host(resumeCode) {
      this.role = 'host'; document.body.classList.add('is-host');
      showOverlay('Setting up your room…');
      let code = resumeCode || randomCode();
      for (let i = 0; i < 5; i++) {
        try {
          await Host.start(code, !!resumeCode);
          this.code = code;
          saveSession();
          hideOverlay();
          history.replaceState(null, '', inviteUrl(code));
          return true;
        } catch (e) {
          if (e.code === 'taken' && !resumeCode) { code = randomCode(); continue; }
          hideOverlay(); toast(e.message, 4000); this.reset(); return false;
        }
      }
      hideOverlay(); toast('Could not create a room, try again.'); this.reset(); return false;
    },

    async join(code, { silent = false } = {}) {
      this.role = 'guest'; this.code = code; this.cancelled = false; document.body.classList.remove('is-host');
      if (!silent) showOverlay(`Joining room ${code}…`);
      try {
        const conn = await Transport.join(code);
        if (this.cancelled) { conn.close(); return false; }
        this.attach(conn);
        conn.send({ t: 'hello', player: publicProfile() });
        saveSession();
        hideOverlay();
        history.replaceState(null, '', inviteUrl(code));
        return true;
      } catch (e) {
        if (this.cancelled) return false;
        if (silent) throw e;
        hideOverlay(); toast(e.message, 4000);
        return false;
      }
    },

    attach(conn) {
      this.conn = conn; this.lastHeard = Date.now();
      conn.onData((m) => { this.lastHeard = Date.now(); this.onMessage(m); });
      conn.onClose(() => { if (this.conn === conn) { this.conn = null; this.lostConnection(); } });
      clearInterval(this.pinger);
      this.pinger = setInterval(() => {
        if (!this.conn) return;
        this.conn.send({ t: 'ping' });
        if (Date.now() - this.lastHeard > TIMEOUT_MS) this.conn.close();
      }, HEARTBEAT_MS);
    },

    async lostConnection() {
      if (this.role !== 'guest' || this.reconnecting || this.cancelled) return;
      this.reconnecting = true;
      showOverlay('Lost the host — reconnecting…');
      for (let i = 0; i < 20 && !this.cancelled; i++) {
        try { await this.join(this.code, { silent: true }); this.reconnecting = false; hideOverlay(); toast('Back in the game! 🎉'); return; } catch { await new Promise((r) => setTimeout(r, 2500)); }
      }
      this.reconnecting = false;
      if (!this.cancelled) { hideOverlay(); toast('The game has ended or the host left.', 4000); this.reset(); }
    },

    leave() {
      if (this.role === 'host') Host.stop();
      else if (this.conn) { this.conn.send({ t: 'leave' }); const c = this.conn; this.conn = null; setTimeout(() => c.close(), 150); }
      this.reset();
    },

    reset() {
      this.cancelled = true; clearInterval(this.pinger);
      this.role = null; this.code = null; this.conn = null; this.state = null;
      document.body.classList.remove('is-host');
      store.del('kc_session');
      history.replaceState(null, '', cleanUrl());
      releaseWakeLock();
      UI.prev = null;
      show('home');
    },

    onMessage(m) {
      switch (m.t) {
        case 'state': { const prev = this.state; this.state = m.state; UI.render(m.state, prev); break; }
        case 'react': UI.floatReaction(m.emoji, this.state?.players.find((p) => p.id === m.from)); break;
        case 'event': toast(m.text); break;
        case 'error': toast(m.msg); break;
        case 'joined': if (m.id !== profile.id) Sound.join(); break;
        case 'kicked': this.cancelled = true; toast('You were removed from the game by the host.', 4000); this.reset(); break;
        case 'closed': this.cancelled = true; toast('The host ended the game.', 4000); this.reset(); break;
        default: break;
      }
    },
  };

  // Keep phones awake during a game so nobody drops out of the room.
  let wakeLock = null;
  async function requestWakeLock() {
    if (wakeLock || !('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* not allowed */ }
  }
  function releaseWakeLock() { try { wakeLock?.release(); } catch { /* ignore */ } wakeLock = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Client.state?.phase === 'playing') requestWakeLock(); });

  function saveSession() { store.set('kc_session', { code: Client.code, role: Client.role, at: Date.now() }); }

  // ================================================================ UI
  let currentScreen = null;
  function show(name) {
    if (currentScreen === name) return;
    currentScreen = name;
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
    scrollTo(0, 0);
  }
  function showOverlay(text) { $('#overlayText').textContent = text; $('#overlay').classList.remove('hidden'); }
  function hideOverlay() { $('#overlay').classList.add('hidden'); }

  const UI = {
    prev: null, overTimer: null,

    render(s, prev) {
      const meIn = s.players.some((p) => p.id === profile.id);
      if (!meIn && Client.role === 'guest') return;
      document.body.classList.toggle('is-host', s.hostId === profile.id);
      if (s.phase === 'lobby') { clearTimeout(this.overTimer); this.renderLobby(s); show('lobby'); }
      else if (s.phase === 'playing') {
        clearTimeout(this.overTimer);
        if (prev && prev.phase !== 'playing') { this.resetCard(); toast('Let the games begin! 🃏'); }
        this.renderGame(s, prev); show('game'); requestWakeLock();
      } else if (s.phase === 'over') {
        this.renderGame(s, prev);
        this.renderOver(s);
        const justEnded = prev && prev.phase === 'playing';
        if (justEnded) { show('game'); clearTimeout(this.overTimer); this.overTimer = setTimeout(() => { show('over'); Confetti(200, ['👑', '🏆', '🍻']); Sound.king(); }, 3600); }
        else if (currentScreen !== 'game' || !this.overTimer) show('over');
      }
      this.renderMenu(s);
    },

    renderLobby(s) {
      $('#lobbyCode').textContent = s.code;
      $('#lobbyCount').textContent = s.players.length;
      $('#gentleToggle').checked = !!s.gentle;
      const grid = $('#lobbyPlayers');
      grid.innerHTML = s.players.map((p) => `
        <div class="player-tile ${p.id === profile.id ? 'me' : ''} ${p.online ? '' : 'offline'}" data-id="${esc(p.id)}">
          ${p.id === s.hostId ? '<span class="tag" title="Host">👑</span>' : ''}
          ${avatarHTML(p)}<span class="pname">${esc(p.name)}${p.id === profile.id ? ' (you)' : ''}</span>
        </div>`).join('');
      // Only animate tiles that are new since the last render
      const seen = this.lobbySeen || (this.lobbySeen = new Set());
      $$('.player-tile', grid).forEach((t) => { if (seen.has(t.dataset.id)) t.style.animation = 'none'; seen.add(t.dataset.id); });
      $('#btnStart').disabled = s.players.filter((p) => p.online).length < 1;
      $('#btnStart').textContent = s.players.length < 2 ? '🃏 Start solo (or wait for friends)' : `🃏 Start with ${s.players.length} players`;
    },

    renderGame(s, prev) {
      const me = profile.id;
      const byId = (id) => s.players.find((p) => p.id === id);
      const turnP = s.players[s.turn];
      const myTurn = s.phase === 'playing' && turnP?.id === me;

      $('#gameCode').textContent = '#' + s.code;
      $('#deckLeft').textContent = s.deckLeft;
      $('#kingsCount').textContent = s.kings;
      $('#cupFill').style.height = (s.kings / 4) * 100 + '%';

      // Player rail
      const mateOf = (id) => s.mates.filter((m) => m.includes(id)).length;
      $('#playerRail').innerHTML = s.players.map((p, i) => `
        <div class="rail-player ${i === s.turn && s.phase === 'playing' ? 'turn' : ''} ${p.online ? '' : 'offline'}" data-id="${esc(p.id)}">
          <div class="badges">${p.id === s.hostId ? '<span title="Host">🏠</span>' : ''}${s.qm === p.id ? '<span title="Question Master">❓</span>' : ''}${mateOf(p.id) ? '<span title="Has a mate">🤝</span>' : ''}</div>
          ${avatarHTML(p)}<span class="pname">${p.id === me ? 'You' : esc(p.name)}</span>
        </div>`).join('');
      const turnEl = $('.rail-player.turn');
      if (turnEl && (!prev || prev.turn !== s.turn)) turnEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

      // Turn banner + deck
      const banner = $('#turnBanner'); const deck = $('#deck');
      if (s.phase === 'over') { banner.className = 'turn-banner'; banner.innerHTML = '🏁 Game over!'; }
      else if (myTurn) { banner.className = 'turn-banner mine'; banner.innerHTML = '⭐ YOUR TURN! ⭐'; }
      else if (turnP) { banner.className = 'turn-banner'; banner.innerHTML = `${avatarHTML(turnP)}<span><b>${esc(turnP.name)}</b> is up${turnP.online ? '' : ' (offline)'}…</span>`; }
      deck.disabled = !myTurn;
      deck.classList.toggle('ready', myTurn);
      deck.classList.toggle('empty', s.deckLeft === 0);
      $('#deckLabel').textContent = myTurn ? 'TAP TO DRAW!' : `${s.deckLeft} LEFT`;

      const wasMyTurn = prev && prev.phase === 'playing' && prev.players[prev.turn]?.id === me;
      if (myTurn && !wasMyTurn) { Sound.turn(); buzz([80, 60, 80]); if (prev) Confetti(40); }

      // Current card
      const c = s.card;
      if (c && (!prev || !prev.card || prev.card.seq !== c.seq)) this.revealCard(c, !!prev && prev.seq !== s.seq, s);
      else if (!c) this.resetCard();
      this.renderRule(s, c, byId);

      // History
      const newest = prev && prev.seq !== s.seq;
      $('#history').innerHTML = s.history.map((h, i) => `
        <div class="mini ${RED.has(h.suit) ? 'red' : ''} ${newest && i === 0 ? 'new' : ''}"><span>${esc(h.rank)}</span><span>${esc(h.suit)}</span>${avatarHTML(byId(h.by), 'who')}</div>`).join('')
        || '<span style="color:var(--muted);font-size:14px;padding:12px 4px">Drawn cards will show up here</span>';

      // House rules
      const rows = [];
      if (s.qm) { const q = byId(s.qm); if (q) rows.push(`<div class="row">❓ ${avatarHTML(q)} <span><b>${esc(q.name)}</b> is Question Master</span></div>`); }
      s.mates.forEach(([a, b]) => { const pa = byId(a); const pb = byId(b); if (pa && pb) rows.push(`<div class="row">🤝 ${avatarHTML(pa)}${avatarHTML(pb)} <span><b>${esc(pa.name)}</b> &amp; <b>${esc(pb.name)}</b> are mates</span></div>`); });
      s.rules.forEach((r) => { const p = byId(r.by); rows.push(`<div class="row">👑 ${avatarHTML(p)} <span>${esc(r.text)}</span></div>`); });
      $('#houseCount').textContent = rows.length;
      $('#houseBody').innerHTML = rows.join('') || '<div class="empty">No house rules yet. Draw a King to make one!</div>';
    },

    renderRule(s, c, byId) {
      const card = $('#ruleCard');
      if (!c) {
        $('#ruleBy').innerHTML = '';
        $('#ruleName').textContent = 'Ready?';
        $('#ruleDesc').textContent = 'Whoever\'s turn it is — tap the deck to draw the first card!';
        $('#ruleAction').innerHTML = '';
        return;
      }
      const rule = RULES[c.rank]; const drawer = byId(c.by); const mine = c.by === profile.id;
      const key = c.seq + '|' + (c.pick || '') + '|' + (c.category || '') + '|' + (c.rule || '') + '|' + s.gentle + '|' + s.players.length;
      if (this.ruleKey === key) return;
      const fresh = !this.ruleKey || this.ruleKey.split('|')[0] !== String(c.seq);
      this.ruleKey = key;

      $('#ruleBy').innerHTML = drawer ? `${avatarHTML(drawer)} <span>${mine ? 'You' : esc(drawer.name)} drew ${esc(c.rank)}${esc(c.suit)}</span>` : '';
      $('#ruleName').textContent = `${rule.emoji} ${rule.name}`;
      let desc = rule.desc;
      if (c.rank === 'K' && c.king === 4) desc = FOURTH_KING;
      else if (c.rank === 'K') desc += ` (${c.king}/4 Kings)`;
      if (!s.gentle) desc = desc.replace(/take a sip/gi, 'drink').replace(/sipping/gi, 'drinking').replace(/\bsips\b/gi, 'drinks').replace(/\bsip\b/gi, 'drink');
      else desc = desc.replace(/Drink the whole/, 'Finish the');
      $('#ruleDesc').textContent = desc;

      const act = $('#ruleAction'); let html = '';
      const others = s.players.filter((p) => p.id !== c.by);
      if (rule.pick) {
        const picked = byId(c.pick);
        if (picked) html = `<div class="result">${c.rank === '8' ? '🤝' : '👉'} ${avatarHTML(picked)} ${esc(picked.name)}${c.rank === '8' ? ' is the mate!' : ' sips!'}</div>`;
        else if (mine && others.length) html = `<div class="hint">${rule.pick}</div><div class="chips">${others.map((p) => `<button class="person" data-pick="${esc(p.id)}">${avatarHTML(p)} ${esc(p.name)}</button>`).join('')}</div>`;
        else if (drawer && others.length) html = `<div class="hint">${esc(drawer.name)} is choosing…</div>`;
      } else if (rule.category) {
        if (c.category) html = `<div class="result">🗂️ ${esc(c.category)}</div>`;
        else if (mine) html = `<div class="hint">Pick a category</div><div class="chips">${(c.choices || []).map((t) => `<button data-cat="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <form class="action-row" data-form="category"><input class="input" maxlength="60" placeholder="…or type your own" /><button class="btn btn-pink">Go</button></form>`;
        else html = `<div class="hint">${esc(drawer?.name || 'They')} is picking a category…</div>`;
      } else if (rule.rule) {
        if (c.rule) html = `<div class="result">📜 New rule: ${esc(c.rule)}</div>`;
        else if (mine && c.king < 4) html = `<div class="hint">Make a rule for everyone</div><div class="chips">${(c.choices || []).map((t) => `<button data-rule="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <form class="action-row" data-form="rule"><input class="input" maxlength="90" placeholder="…or write your own rule" /><button class="btn btn-pink">Add</button></form>`;
        else if (c.king < 4) html = `<div class="hint">${esc(drawer?.name || 'They')} is making a new rule…</div>`;
      }
      act.innerHTML = html;
      if (fresh) { card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop'); }
    },

    revealCard(c, animate, s) {
      $('#cRank1').textContent = $('#cRank2').textContent = c.rank;
      $('#cSuit1').textContent = $('#cSuit2').textContent = $('#cSuitBig').textContent = c.suit;
      $('#cEmoji').textContent = RULES[c.rank].emoji;
      const face = $('#cardFace');
      face.classList.toggle('red', RED.has(c.suit));
      face.classList.toggle('king', c.rank === 'K');
      $('#cardWrap').classList.remove('idle');
      const inner = $('#cardInner');
      if (!animate) { inner.classList.add('shown'); return; }
      inner.classList.remove('shown', 'dealing'); void inner.offsetWidth;
      inner.classList.add('dealing');
      Sound.draw(); buzz(30);
      setTimeout(() => {
        inner.classList.remove('dealing'); inner.classList.add('shown');
        if (c.rank === 'K') {
          Sound.king(); buzz([100, 50, 200]);
          Confetti(c.king === 4 ? 260 : 140, ['👑']);
          document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
        } else if (c.by === profile.id) Confetti(30);
      }, 450);
      const drawer = s.players.find((p) => p.id === c.by);
      if (drawer && c.by !== profile.id) this.floatReaction(RULES[c.rank].emoji, drawer);
    },

    resetCard() { $('#cardInner').classList.remove('shown', 'dealing'); $('#cardWrap').classList.add('idle'); this.ruleKey = null; },

    renderOver(s) {
      const byId = (id) => s.players.find((p) => p.id === id);
      const hero = byId(s.endedBy);
      if (s.endReason === 'king') {
        $('#overTitle').textContent = 'The 4th King!';
        $('#overSub').textContent = hero ? (s.gentle ? 'The legend who drew it finishes the King\'s Cup!' : 'Bottoms up — they drink the King\'s Cup!') : '';
      } else {
        $('#overTitle').textContent = 'Deck cleared!';
        $('#overSub').textContent = 'Every card has been drawn. What a game!';
      }
      $('#overHero').innerHTML = hero ? `${avatarHTML(hero)}<span>${esc(hero.name)}${hero.id === profile.id ? ' (you!)' : ''}</span>` : '';
      $('#overStats').innerHTML = s.players.map((p) => {
        const st = s.stats[p.id] || { draws: 0, kings: 0 };
        return `<div class="stat">${avatarHTML(p)}<div><b>${esc(p.name)}</b><small>${st.draws} cards · ${st.kings} 👑</small></div></div>`;
      }).join('');
    },

    renderMenu(s) {
      $('#mGentle').textContent = `🌸 Gentle mode: ${s.gentle ? 'on' : 'off'}`;
      $('#mSkip').disabled = s.phase !== 'playing';
      $('#mPlayers').innerHTML = s.players.map((p) => `
        <div class="row">${avatarHTML(p)}<span>${esc(p.name)}${p.online ? '' : ' <small>(offline)</small>'}</span>
        ${p.id === s.hostId ? '<small>host</small>' : `<button data-kick="${esc(p.id)}">Remove</button>`}</div>`).join('');
    },

    floatReaction(emoji, p) {
      const el = document.createElement('div');
      el.className = 'float-react';
      el.style.left = 10 + Math.random() * 75 + '%';
      el.style.setProperty('--rot', (Math.random() * 40 - 20) + 'deg');
      el.innerHTML = `${esc(emoji)}${p ? `<small>${esc(p.id === profile.id ? 'You' : p.name)}</small>` : ''}`;
      $('#reactions').appendChild(el);
      Sound.pop();
      setTimeout(() => el.remove(), 2700);
    },
  };

  // ======================================================= PROFILE UI
  let pendingAction = null; // { type: 'host' } | { type: 'join', code }

  function openProfile(action) {
    pendingAction = action;
    $('#profileTitle').textContent = action.type === 'host' ? 'Host a game' : `Joining ${action.code}`;
    $('#profileSub').textContent = 'Pick your avatar and name';
    $('#profileError').textContent = '';
    $('#nameInput').value = profile.name;
    renderProfilePicker();
    show('profile');
    if (!profile.name) setTimeout(() => $('#nameInput').focus(), 400);
  }

  function renderProfilePicker() {
    const prev = $('#avatarPreview');
    prev.textContent = profile.avatar; prev.style.setProperty('--c', profile.color);
    prev.style.animation = 'none'; void prev.offsetWidth; prev.style.animation = '';
    $('#emojiGrid').innerHTML = AVATARS.map((a) => `<button type="button" class="${a === profile.avatar ? 'sel' : ''}" data-av="${a}" aria-label="Avatar ${a}">${a}</button>`).join('');
    $('#colorRow').innerHTML = COLORS.map((c) => `<button type="button" class="${c === profile.color ? 'sel' : ''}" data-col="${c}" style="--c:${c}" aria-label="Colour ${c}"></button>`).join('');
  }

  async function submitProfile() {
    const name = clean($('#nameInput').value, 16);
    if (!name) { $('#profileError').textContent = 'Enter a name so your friends know who you are!'; $('#nameInput').focus(); return; }
    profile.name = name; store.set('kc_profile', profile);
    Sound.ac();
    const a = pendingAction || { type: 'host' };
    if (a.type === 'host') await Client.host();
    else if (!(await Client.join(a.code))) show('home');
  }

  // ============================================================ WIRING
  function bind() {
    // background suits
    $('#bgSuits').innerHTML = Array.from({ length: 14 }, (_, i) => `<span style="left:${(i * 7.3) % 100}%;animation-duration:${14 + (i % 5) * 4}s;animation-delay:-${i * 2.1}s;font-size:${22 + (i % 4) * 10}px">${SUITS[i % 4]}</span>`).join('');

    $('#btnHost').onclick = () => openProfile({ type: 'host' });
    $('#joinForm').onsubmit = (e) => {
      e.preventDefault();
      const code = clean($('#joinCode').value, 5).toUpperCase().replace(/[^A-Z]/g, '');
      if (code.length < 4) { toast('Enter the 4-letter room code'); $('#joinCode').focus(); return; }
      openProfile({ type: 'join', code });
    };
    $('#joinCode').oninput = (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, ''); };
    $$('[data-go="home"]').forEach((b) => { b.onclick = () => show('home'); });

    $('#emojiGrid').onclick = (e) => { const b = e.target.closest('[data-av]'); if (!b) return; profile.avatar = b.dataset.av; Sound.pop(); renderProfilePicker(); };
    $('#colorRow').onclick = (e) => { const b = e.target.closest('[data-col]'); if (!b) return; profile.color = b.dataset.col; Sound.pop(); renderProfilePicker(); };
    $('#btnShuffleAvatar').onclick = () => { profile.avatar = rand(AVATARS); profile.color = rand(COLORS); Sound.pop(); renderProfilePicker(); };
    $('#btnProfileGo').onclick = submitProfile;
    $('#nameInput').onkeydown = (e) => { if (e.key === 'Enter') submitProfile(); };

    // lobby
    $('#btnStart').onclick = () => Client.send({ t: 'start' });
    $('#gentleToggle').onchange = (e) => Client.send({ t: 'gentle', on: e.target.checked });
    $('#btnLeaveLobby').onclick = () => { if (confirm(Client.role === 'host' ? 'Close this room for everyone?' : 'Leave this room?')) Client.leave(); };
    $('#btnShare').onclick = share;
    $('#btnQR').onclick = () => {
      const box = $('#qrBox'); box.classList.toggle('hidden');
      if (!box.classList.contains('hidden')) {
        $('#qr').innerHTML = '';
        if (window.QRCode) new QRCode($('#qr'), { text: inviteUrl(Client.code), width: 180, height: 180, colorDark: '#1a0b3d', colorLight: '#ffffff' });
        else $('#qr').textContent = inviteUrl(Client.code);
      }
    };

    // game
    $('#deck').onclick = () => {
      const deck = $('#deck'); if (deck.disabled) return;
      deck.disabled = true; Client.send({ t: 'draw' });
      // If the draw got lost, let the player try again.
      setTimeout(() => { const s = Client.state; if (s && s.phase === 'playing' && s.players[s.turn]?.id === profile.id) deck.disabled = false; }, 3000);
    };
    $('#ruleAction').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.pick) Client.send({ t: 'pick', id: b.dataset.pick });
      else if (b.dataset.cat) Client.send({ t: 'category', text: b.dataset.cat });
      else if (b.dataset.rule) Client.send({ t: 'rule', text: b.dataset.rule });
    };
    $('#ruleAction').onsubmit = (e) => {
      e.preventDefault();
      const f = e.target; const text = clean($('input', f).value, 90); if (!text) return;
      Client.send({ t: f.dataset.form === 'rule' ? 'rule' : 'category', text });
    };
    $('#houseToggle').onclick = () => $('#houseBody').classList.toggle('hidden');
    $('#reactBar').innerHTML = REACTIONS.map((r) => `<button data-react="${r}" aria-label="React ${r}">${r}</button>`).join('');
    $('#reactBar').onclick = (e) => { const b = e.target.closest('[data-react]'); if (b) Client.send({ t: 'react', emoji: b.dataset.react }); };

    // over
    $('#btnPlayAgain').onclick = () => Client.send({ t: 'start' });
    $('#btnOverLeave').onclick = () => Client.leave();

    // menu
    const menu = $('#menuSheet');
    $('#btnMenu').onclick = () => menu.classList.remove('hidden');
    $('#mClose').onclick = () => menu.classList.add('hidden');
    menu.onclick = (e) => { if (e.target === menu) menu.classList.add('hidden'); };
    const soundLabel = () => { $('#mSound').textContent = `${Sound.on ? '🔊' : '🔇'} Sound: ${Sound.on ? 'on' : 'off'}`; };
    soundLabel();
    $('#mSound').onclick = () => { Sound.on = !Sound.on; store.set('kc_sound', Sound.on); soundLabel(); Sound.pop(); };
    $('#mShare').onclick = share;
    $('#mSkip').onclick = () => { Client.send({ t: 'skip' }); menu.classList.add('hidden'); };
    $('#mGentle').onclick = () => Client.send({ t: 'gentle', on: !Client.state?.gentle });
    $('#mRestart').onclick = () => { if (confirm('Shuffle a fresh deck and restart for everyone?')) { Client.send({ t: 'restart' }); menu.classList.add('hidden'); } };
    $('#mPlayers').onclick = (e) => { const b = e.target.closest('[data-kick]'); if (b && confirm('Remove this player?')) Client.send({ t: 'kick', id: b.dataset.kick }); };
    $('#mLeave').onclick = () => { if (confirm(Client.role === 'host' ? 'You are the host — leaving ends the game for everyone. Leave?' : 'Leave the game?')) { menu.classList.add('hidden'); Client.leave(); } };
    $('#mRules').onclick = () => { menu.classList.add('hidden'); $('#rulesSheet').classList.remove('hidden'); };

    // rules sheet
    $('#rulesList').innerHTML = RANKS.map((r) => `<li><span class="r">${r}</span><div><b>${RULES[r].emoji} ${RULES[r].name}</b><small>${RULES[r].desc}</small></div></li>`).join('');
    $('#btnHowTo').onclick = () => $('#rulesSheet').classList.remove('hidden');
    $('#rulesSheet').onclick = (e) => { if (e.target.id === 'rulesSheet' || e.target.closest('[data-close]')) $('#rulesSheet').classList.add('hidden'); };

    $('#overlayCancel').onclick = () => { hideOverlay(); Client.leave(); };

    // unlock audio on first interaction (iOS)
    addEventListener('pointerdown', () => Sound.ac(), { once: true });
  }

  async function share() {
    if (!Client.code) return;
    const url = inviteUrl(Client.code);
    const text = `Join my King's Cup game! Room code: ${Client.code}`;
    try {
      if (navigator.share) { await navigator.share({ title: 'King\'s Cup', text, url }); return; }
    } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Invite link copied! 📋'); } catch { prompt('Copy this invite link:', url); }
  }

  async function boot() {
    bind();
    const roomParam = clean(params.get('room'), 5).toUpperCase().replace(/[^A-Z]/g, '');
    const session = store.get('kc_session');
    const fresh = session && Date.now() - session.at < 6 * 3600 * 1000;

    // Rejoin after a refresh
    if (fresh && (!roomParam || roomParam === session.code) && profile.name) {
      show('home');
      if (session.role === 'host' && store.get('kc_host_' + session.code)) {
        if (await Client.host(session.code)) return;
      } else if (session.role === 'guest') {
        if (await Client.join(session.code)) return;
      }
      store.del('kc_session');
    }
    if (roomParam) { $('#joinCode').value = roomParam; openProfile({ type: 'join', code: roomParam }); return; }
    show('home');
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  boot();
})();
