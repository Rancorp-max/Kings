// The authoritative game server that runs in the host's browser.
// Guests send intents; the host validates them, mutates state and broadcasts
// the whole public state after every change. Secrets (deck order, quiz
// answers before reveal, keepsake texts) stay in `priv`.
import { shuffle, pickN, clean, store, AVATARS, COLORS, REACTIONS } from './util.js';
import { RULES, CATEGORIES, RULE_IDEAS, buildDeck } from './kings.js';
import { THEMES, fill, loadDeck, namesText } from './themes.js';
import { scoreAnswer, tallyAnswers, QUESTION_MS, PREDICTION_FIELDS } from './quiz-core.js';
import { Transport } from './transport.js';

const HEARTBEAT_TIMEOUT = 14000;
const AFK_SKIP_MS = 15000;
const REVEAL_MS = 5500;
const BOARD_MS = 5500;
const INTRO_MS = 4000;

export const Host = {
  code: null, server: null, state: null, priv: null, config: null,
  conns: new Map(), // conn.id -> { conn, playerId, lastSeen }
  deliverLocal: () => {}, // set by Client: host's own UI receives broadcasts here
  hooks: {}, // { played(state), predictions(entries) }

  async start({ code, resume, config, profile }) {
    this.code = code; this.profile = profile;
    const saved = resume ? store.get('kc_host_' + code) : null;
    if (saved) { this.state = saved.state; this.priv = saved.priv; this.config = saved.config; }
    else { this.config = config; this.state = this.freshState(); this.priv = this.freshPriv(); }
    this.state.hostId = profile.id;
    this.server = await Transport.host(code, (conn) => this.accept(conn), { resume });
    this.upsertPlayer(profile, true);
    this.state.players.forEach((p) => { if (p.id !== profile.id) { p.online = false; p.offlineSince = Date.now(); } });
    clearInterval(this.tick); this.tick = setInterval(() => this.heartbeat(), 250);
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

  // Plan/limits can change mid-party (e.g. host upgrades from the lobby).
  applyPlan({ plan, maxPlayers, watermark }) {
    if (!this.state) return;
    Object.assign(this.state, { plan, maxPlayers, watermark });
    this.config.plan = plan; this.config.maxPlayers = maxPlayers; this.config.watermark = watermark;
    this.commit();
  },

  freshState(prev) {
    const c = this.config;
    return {
      v: 2, code: this.code, hostId: this.profile.id, phase: 'lobby',
      theme: c.theme, themeName: THEMES[c.theme].name, mode: c.mode, honoree: c.honoree,
      plan: c.plan, maxPlayers: c.maxPlayers, watermark: c.watermark, eventId: c.eventId || null,
      gentle: prev ? prev.gentle : true,
      players: prev ? prev.players : [], keepsakeBy: prev ? prev.keepsakeBy : [],
      // deck mode
      turn: 0, deckLeft: 0, deckTotal: 0, card: null, seq: 0, history: [], kings: 0, qm: null, mates: [], rules: [], stats: {}, endedBy: null, endReason: null,
      // quiz mode
      quiz: null,
    };
  },
  freshPriv(prev) { return { deck: [], keepsake: prev ? prev.keepsake : {}, predictions: {}, quiz: null, deadline: 0, lastReact: {} }; },

  accept(conn) {
    const entry = { conn, playerId: null, lastSeen: Date.now() };
    this.conns.set(conn.id, entry);
    conn.onData((m) => { entry.lastSeen = Date.now(); this.onMessage(entry, m); });
    conn.onClose(() => {
      this.conns.delete(conn.id);
      const p = this.player(entry.playerId);
      if (p && ![...this.conns.values()].some((e) => e.playerId === p.id)) { p.online = false; p.offlineSince = Date.now(); this.maybeAllAnswered(); this.commit(); }
    });
  },

  heartbeat() {
    const now = Date.now(); const s = this.state; if (!s) return;
    if (!this._lastPing || now - this._lastPing > 3000) {
      this._lastPing = now;
      this.conns.forEach((e) => { if (now - e.lastSeen > HEARTBEAT_TIMEOUT) e.conn.close(); else e.conn.send({ t: 'pong' }); });
    }
    if (s.phase !== 'playing') return;
    if (s.mode === 'deck') {
      const cur = s.players[s.turn];
      if (cur && !cur.online && now - (cur.offlineSince || now) > AFK_SKIP_MS && s.players.some((p) => p.online)) {
        this.advanceTurn(); this.event(`${cur.name} is offline — skipping their turn`); this.commit();
      }
    } else if (s.quiz && this.priv.deadline && now >= this.priv.deadline) {
      this.priv.deadline = 0;
      this.quizAdvance('timer');
    }
  },

  onMessage(entry, m) {
    if (!m || typeof m !== 'object' || m.t === 'ping') return;
    if (m.t === 'hello') {
      const p = m.player || {};
      if (!p.id || typeof p.id !== 'string') return;
      if (p.id === this.profile.id) { entry.conn.send({ t: 'error', msg: 'That profile is already hosting this game.' }); return; }
      const isNew = !this.player(p.id);
      if (isNew && this.seatCount() >= this.state.maxPlayers) {
        entry.conn.send({ t: 'full', max: this.state.maxPlayers, plan: this.state.plan });
        setTimeout(() => entry.conn.close(), 300);
        return;
      }
      entry.playerId = p.id;
      this.upsertPlayer(p, true);
      entry.conn.send({ t: 'welcome', playerId: p.id, keepsake: this.priv.keepsake[p.id] || null });
      if (isNew) this.broadcast({ t: 'joined', id: p.id });
      this.commit();
      return;
    }
    if (!entry.playerId || !this.player(entry.playerId)) return;
    this.act(entry.playerId, m, (msg) => entry.conn.send({ t: 'error', msg }), (msg) => entry.conn.send(msg));
  },

  // Seats count everyone who plays: in quiz mode the host is the quizmaster, not a player.
  seatCount() { return this.state.players.filter((p) => !(this.state.mode === 'quiz' && p.id === this.state.hostId)).length; },

  act(from, m, reply = () => {}, direct = () => {}) {
    const s = this.state; if (!s) return;
    const isHost = from === s.hostId;
    switch (m.t) {
      case 'draw': if (!this.draw(from, reply)) return; break;
      case 'pick': {
        const c = s.card; const target = this.player(m.id);
        if (!c || c.by !== from || !c.rank || !RULES[c.rank].pick || c.pick || !target) return;
        if (c.rank === '8' && target.id === from) { reply('You can\'t be your own mate 😅'); return; }
        c.pick = target.id;
        if (c.rank === '8') s.mates.push([from, target.id]);
        break;
      }
      case 'category': {
        const c = s.card; const text = clean(m.text, 60);
        if (!c || c.by !== from || c.rank !== 'J' || c.category || !text) return;
        c.category = text; break;
      }
      case 'rule': {
        const c = s.card; const text = clean(m.text, 90);
        if (!c || c.by !== from || c.rank !== 'K' || c.rule || !text) return;
        c.rule = text; s.rules.push({ text, by: from }); break;
      }
      case 'react': {
        if (!REACTIONS.includes(m.emoji)) return;
        const now = Date.now(); if (now - (this.priv.lastReact[from] || 0) < 250) return;
        this.priv.lastReact[from] = now;
        this.broadcast({ t: 'react', emoji: m.emoji, from });
        return;
      }
      case 'keepsake': {
        if (!THEMES[s.theme].keepsake) return;
        const text = clean(m.text, 300); if (!text) return;
        const p = this.player(from);
        this.priv.keepsake[from] = { name: p.name, avatar: p.avatar, kind: ['advice', 'wish', 'prediction'].includes(m.kind) ? m.kind : 'wish', text, at: Date.now() };
        if (!s.keepsakeBy.includes(from)) s.keepsakeBy.push(from);
        direct({ t: 'keepsakeSaved', entry: this.priv.keepsake[from] });
        break;
      }
      case 'answer': if (!this.answer(from, m)) return; break;
      case 'predict': {
        const q = s.quiz; if (!q || q.stage !== 'predict' || from === s.hostId) return;
        const answers = {};
        for (const f of PREDICTION_FIELDS) { const v = clean(m.answers?.[f.key], 20); if (v) answers[f.key] = v; }
        this.priv.predictions[from] = answers;
        if (!q.predictionsIn.includes(from)) q.predictionsIn.push(from);
        break;
      }
      case 'leave': this.removePlayer(from); break;
      // ---- host-only controls
      case 'start': case 'restart': if (!isHost || !this.beginGame()) return; break;
      case 'lobby': if (!isHost) return; this.state = this.freshState(s); this.priv = this.freshPriv(this.priv); break;
      case 'skip': {
        if (!isHost || s.phase !== 'playing' || s.mode !== 'deck') return;
        const cur = s.players[s.turn]; this.advanceTurn(); this.event(`Skipped ${cur?.name || 'player'}'s turn`); break;
      }
      case 'next': if (!isHost || s.mode !== 'quiz' || s.phase !== 'playing') return; this.quizAdvance('host'); return;
      case 'auto': if (!isHost || !s.quiz) return; s.quiz.auto = !!m.on; if (s.quiz.auto && !this.priv.deadline && ['reveal', 'board', 'intro'].includes(s.quiz.stage)) this.setDeadline(2000); break;
      case 'end': if (!isHost || s.phase !== 'playing') return; this.finish('host'); break;
      case 'gentle': if (!isHost) return; s.gentle = !!m.on; break;
      case 'kick': {
        if (!isHost || m.id === s.hostId) return;
        this.conns.forEach((e) => { if (e.playerId === m.id) { e.conn.send({ t: 'kicked' }); setTimeout(() => e.conn.close(), 200); } });
        this.removePlayer(m.id); break;
      }
      default: return;
    }
    this.commit();
  },

  // ------------------------------------------------------------ game start
  beginGame() {
    const prev = this.state;
    this.state = this.freshState(prev); this.priv = this.freshPriv(this.priv);
    const s = this.state; const c = this.config;
    s.phase = 'playing';
    if (s.mode === 'deck') {
      if (s.theme === 'kings-cup') this.priv.deck = shuffle(buildDeck());
      else {
        const themed = (c.deckCards || []).map((x) => ({ ...x, text: fill(x.text, c.honoree, c.theme) }));
        const custom = (c.aiCards || []).slice(0, c.aiCardsPlayable ?? 99).map((x) => ({ kind: 'custom', label: x.title, text: x.text }));
        this.priv.deck = shuffle([...themed, ...custom]);
      }
      s.deckLeft = s.deckTotal = this.priv.deck.length;
      const online = s.players.findIndex((p) => p.online);
      s.turn = Math.max(0, online);
    } else {
      this.buildQuiz();
      if (!this.priv.quiz.items.length && !c.predictions) { this.state = prev; return false; }
      s.quiz = { stage: 'intro', index: -1, total: this.priv.quiz.items.length, round: null, title: '', q: null, answered: [], reveal: null, scores: {}, auto: true, predictionsIn: [], msLeft: 0, stageMs: 0 };
      this.quizNextItem();
    }
    this.hooks.played?.(s);
    return true;
  },

  // ------------------------------------------------------------ deck mode
  draw(from, reply) {
    const s = this.state;
    if (s.phase !== 'playing' || s.mode !== 'deck') return false;
    const cur = s.players[s.turn];
    if (!cur || cur.id !== from) { reply('Hold up — it\'s not your turn!'); return false; }
    if (!this.priv.deck.length) return false;
    const c = this.priv.deck.pop();
    s.seq += 1;
    const st = s.stats[from] || (s.stats[from] = { draws: 0, kings: 0 });
    st.draws += 1;
    if (s.theme === 'kings-cup') {
      if (c.rank === 'K') { s.kings += 1; st.kings += 1; }
      if (c.rank === 'Q') s.qm = from;
      s.card = { rank: c.rank, suit: c.suit, by: from, seq: s.seq, king: c.rank === 'K' ? s.kings : 0, choices: c.rank === 'J' ? pickN(CATEGORIES, 5) : c.rank === 'K' ? pickN(RULE_IDEAS, 5) : null };
      s.history.unshift({ rank: c.rank, suit: c.suit, by: from });
    } else {
      s.card = { kind: c.kind, label: c.label || null, text: c.text, by: from, seq: s.seq };
      s.history.unshift({ kind: c.kind, by: from });
    }
    s.history = s.history.slice(0, 60);
    s.deckLeft = this.priv.deck.length;
    if ((s.theme === 'kings-cup' && s.kings >= 4) || !this.priv.deck.length) this.finish(s.kings >= 4 ? 'king' : 'deck', from);
    else this.advanceTurn();
    return true;
  },

  advanceTurn(fromCurrent = false) {
    const s = this.state; const n = s.players.length; if (!n) return;
    for (let k = fromCurrent ? 0 : 1; k <= n; k++) {
      const i = (s.turn + k) % n;
      if (s.players[i].online) { s.turn = i; return; }
    }
  },

  // ------------------------------------------------------------ quiz mode
  buildQuiz() {
    const c = this.config; const names = namesText(c.honoree, c.theme);
    const items = [];
    const mc = (c.questions || []).filter((q) => Number.isInteger(q.correct));
    let aiLeft = c.aiQuestionsPlayable ?? 99;
    for (const q of mc) {
      if (q.source === 'ai') { if (aiLeft <= 0) continue; aiLeft--; }
      items.push({ round: 'mc', text: fill(q.question, c.honoree, c.theme), options: q.options.map((o) => fill(o, c.honoree, c.theme)), correct: q.correct });
    }
    if (c.who?.enabled) {
      const [a, b] = c.who.names;
      for (const w of c.who.items || []) if (w.answer === 0 || w.answer === 1) items.push({ round: 'who', text: fill(w.text, c.honoree, c.theme), options: [a, b], correct: w.answer });
    }
    this.priv.quiz = {
      items, answers: {}, predictions: !!c.predictions && THEMES[c.theme].predictions,
      titles: { mc: `Who knows ${names} best?`, who: `${c.who?.names?.[0] || 'A'} or ${c.who?.names?.[1] || 'B'}: who said it?`, predict: 'Baby predictions' },
    };
  },

  setDeadline(ms) { this.priv.deadline = Date.now() + ms; this.state.quiz.stageMs = ms; },

  quizNextItem() {
    const s = this.state; const q = s.quiz; const P = this.priv.quiz;
    const nextIndex = q.index + 1;
    if (nextIndex < P.items.length) {
      const item = P.items[nextIndex];
      if (item.round !== q.round) { // new round: show a title card first
        q.stage = 'intro'; q.round = item.round; q.title = P.titles[item.round]; q.pendingIndex = nextIndex;
        q.q = null; q.reveal = null; this.setDeadline(INTRO_MS); return;
      }
      q.index = nextIndex; q.stage = 'question'; q.answered = []; q.reveal = null; q.pendingIndex = null;
      q.q = { text: item.text, options: item.options, kind: item.round };
      P.answers[nextIndex] = {}; P.startedAt = Date.now();
      this.setDeadline(QUESTION_MS);
    } else if (P.predictions && q.round !== 'predict') {
      q.stage = 'predict'; q.round = 'predict'; q.title = P.titles.predict; q.q = null; q.reveal = null; this.priv.deadline = 0; q.stageMs = 0;
    } else this.finish('quiz');
  },

  quizAdvance(why) {
    const s = this.state; const q = s.quiz; if (!q || s.phase !== 'playing') return;
    if (why === 'timer' && !q.auto && q.stage !== 'question') return;
    switch (q.stage) {
      case 'intro': q.index = q.pendingIndex - 1; q.round = this.priv.quiz.items[q.pendingIndex].round; this.startQuestionAt(q.pendingIndex); break;
      case 'question': this.reveal(); break;
      case 'reveal': q.stage = 'board'; this.setDeadline(BOARD_MS); if (!q.auto) this.priv.deadline = 0; break;
      case 'board': this.quizNextItem(); break;
      case 'predict': this.finish('quiz'); break;
      default: break;
    }
    if (!q.auto && q.stage !== 'question') this.priv.deadline = 0;
    this.commit();
  },

  startQuestionAt(i) {
    const q = this.state.quiz; const P = this.priv.quiz; const item = P.items[i];
    q.index = i; q.stage = 'question'; q.answered = []; q.reveal = null; q.pendingIndex = null;
    q.q = { text: item.text, options: item.options, kind: item.round };
    P.answers[i] = {}; P.startedAt = Date.now();
    this.setDeadline(QUESTION_MS);
  },

  answer(from, m) {
    const s = this.state; const q = s.quiz;
    if (!q || q.stage !== 'question' || m.index !== q.index || from === s.hostId) return false;
    const ans = this.priv.quiz.answers[q.index];
    if (ans[from] || !Number.isInteger(m.choice) || m.choice < 0 || m.choice >= q.q.options.length) return false;
    ans[from] = { choice: m.choice, ms: Date.now() - this.priv.quiz.startedAt };
    q.answered.push(from);
    this.maybeAllAnswered();
    return true;
  },

  maybeAllAnswered() {
    const s = this.state; const q = s.quiz;
    if (!q || q.stage !== 'question') return;
    const active = s.players.filter((p) => p.online && p.id !== s.hostId);
    if (active.length && active.every((p) => q.answered.includes(p.id))) this.reveal();
  },

  reveal() {
    const s = this.state; const q = s.quiz; const P = this.priv.quiz;
    const item = P.items[q.index]; const ans = P.answers[q.index] || {};
    const { counts, correctIds } = tallyAnswers(ans, item.correct, item.options.length);
    const gains = {};
    for (const [id, a] of Object.entries(ans)) {
      const pts = scoreAnswer({ correct: a.choice === item.correct, elapsedMs: a.ms });
      gains[id] = pts; q.scores[id] = (q.scores[id] || 0) + pts;
    }
    q.stage = 'reveal'; q.reveal = { correct: item.correct, counts, correctIds, gains, choices: Object.fromEntries(Object.entries(ans).map(([id, a]) => [id, a.choice])) };
    this.setDeadline(REVEAL_MS); if (!q.auto) this.priv.deadline = 0;
  },

  finish(reason, by = null) {
    const s = this.state;
    s.phase = 'over'; s.endReason = reason; s.endedBy = by;
    this.priv.deadline = 0;
    if (s.quiz) s.quiz.stage = 'done';
    const preds = Object.entries(this.priv.predictions);
    if (preds.length) this.hooks.predictions?.(preds.map(([id, answers]) => { const p = this.player(id); return { name: p?.name || 'Guest', avatar: p?.avatar || '', answers }; }));
  },

  // ------------------------------------------------------------ players
  player(id) { return this.state?.players.find((p) => p.id === id); },

  upsertPlayer(p, online) {
    const s = this.state; const existing = this.player(p.id);
    const data = { id: p.id, name: clean(p.name, 16) || 'Player', avatar: AVATARS.includes(p.avatar) ? p.avatar : '🙂', color: COLORS.includes(p.color) ? p.color : COLORS[0] };
    if (existing) Object.assign(existing, data, { online, offlineSince: null });
    else s.players.push({ ...data, online });
  },

  removePlayer(id) {
    const s = this.state; const i = s.players.findIndex((p) => p.id === id);
    if (i < 0 || id === s.hostId) return;
    s.players.splice(i, 1);
    s.keepsakeBy = s.keepsakeBy.filter((x) => x !== id);
    if (i < s.turn) s.turn -= 1;
    if (s.turn >= s.players.length) s.turn = 0;
    if (s.phase === 'playing' && s.mode === 'deck' && !s.players[s.turn]?.online) this.advanceTurn(true);
    this.maybeAllAnswered();
  },

  keepsakeEntries() {
    return Object.entries(this.priv?.keepsake || {}).sort((a, b) => a[1].at - b[1].at).map(([, e]) => e);
  },
  predictionEntries() {
    return Object.entries(this.priv?.predictions || {}).map(([id, answers]) => ({ name: this.player(id)?.name || 'Guest', answers }));
  },

  event(text) { this.broadcast({ t: 'event', text }); },

  broadcast(msg) {
    this.conns.forEach(({ conn, playerId }) => { if (playerId) conn.send(msg); });
    this.deliverLocal(msg);
  },

  commit() {
    const s = this.state; if (!s) return;
    if (s.quiz) {
      s.quiz.msLeft = this.priv.deadline ? Math.max(0, this.priv.deadline - Date.now()) : 0;
      if (!this.priv.deadline) s.quiz.stageMs = 0;
    }
    store.set('kc_host_' + this.code, { state: s, priv: this.priv, config: this.config, at: Date.now() });
    this.broadcast({ t: 'state', state: s });
  },
};

// Builds the host config from setup choices + plan limits.
export async function makeConfig(setup, plan, limits, eventId) {
  const deck = setup.theme !== 'kings-cup' ? await loadDeck(setup.theme) : null;
  return {
    theme: setup.theme, mode: setup.theme === 'kings-cup' ? 'deck' : setup.mode, honoree: setup.honoree,
    plan, maxPlayers: limits.maxPlayers, watermark: limits.watermark, eventId,
    aiQuestionsPlayable: limits.aiQuestionsPlayable, aiCardsPlayable: limits.aiCardsPlayable,
    deckCards: deck ? deck.cards.map((c) => ({ kind: c.kind, text: c.text })) : [],
    aiCards: setup.aiCards || [],
    questions: setup.questions || [], who: setup.who || null, predictions: !!setup.predictions,
  };
}
