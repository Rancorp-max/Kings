// Connection lifecycle for both roles. The host talks to Host directly;
// guests talk to the host over a Transport connection.
import { store, toast, inviteUrl, pageUrl, randomCode, sleep } from './util.js';
import { Transport } from './transport.js';
import { Host } from './host.js';

const HEARTBEAT_MS = 4000;
const TIMEOUT_MS = 14000;

export const Client = {
  role: null, code: null, conn: null, state: null, lastHeard: 0, reconnecting: false, cancelled: false,
  profile: null,
  ui: { render() {}, message() {}, reset() {}, overlay() {}, hideOverlay() {} },

  send(m) {
    if (this.role === 'host') Host.act(this.profile.id, m, (msg) => toast(msg), (msg) => this.onMessage(msg));
    else if (this.conn) this.conn.send(m);
    else toast('Not connected yet…');
  },

  async host({ config, resumeCode }) {
    this.role = 'host'; this.cancelled = false; document.body.classList.add('is-host');
    this.ui.overlay(resumeCode ? 'Re-opening your room…' : 'Setting up your room…');
    Host.deliverLocal = (m) => this.onMessage(m);
    let code = resumeCode || randomCode();
    for (let i = 0; i < 5; i++) {
      try {
        await Host.start({ code, resume: !!resumeCode, config, profile: this.profile });
        this.code = code;
        this.saveSession();
        this.ui.hideOverlay();
        history.replaceState(null, '', inviteUrl(code));
        return true;
      } catch (e) {
        if (e.code === 'taken' && !resumeCode) { code = randomCode(); continue; }
        this.ui.hideOverlay(); toast(e.message, 4000); this.reset(); return false;
      }
    }
    this.ui.hideOverlay(); toast('Could not create a room, try again.'); this.reset(); return false;
  },

  async join(code, { silent = false } = {}) {
    this.role = 'guest'; this.code = code; this.cancelled = false; document.body.classList.remove('is-host');
    if (!silent) this.ui.overlay(`Joining room ${code}…`);
    try {
      const conn = await Transport.join(code);
      if (this.cancelled) { conn.close(); return false; }
      this.attach(conn);
      conn.send({ t: 'hello', player: this.publicProfile() });
      this.saveSession();
      this.ui.hideOverlay();
      history.replaceState(null, '', inviteUrl(code));
      return true;
    } catch (e) {
      if (this.cancelled) return false;
      if (silent) throw e;
      this.ui.hideOverlay(); toast(e.message, 4000);
      return false;
    }
  },

  publicProfile() { const { id, name, avatar, color } = this.profile; return { id, name, avatar, color }; },

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
    this.ui.overlay('Lost the host — reconnecting…');
    for (let i = 0; i < 20 && !this.cancelled; i++) {
      try { await this.join(this.code, { silent: true }); this.reconnecting = false; this.ui.hideOverlay(); toast('Back in the game! 🎉'); return; } catch { await sleep(2500); }
    }
    this.reconnecting = false;
    if (!this.cancelled) { this.ui.hideOverlay(); toast('The game has ended or the host left.', 4000); this.reset(); }
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
    history.replaceState(null, '', pageUrl());
    this.ui.reset();
  },

  saveSession() { store.set('kc_session', { code: this.code, role: this.role, at: Date.now() }); },

  onMessage(m) {
    switch (m.t) {
      case 'state': { const prev = this.state; this.state = m.state; this.ui.render(m.state, prev); break; }
      case 'kicked': this.cancelled = true; toast('You were removed from the game by the host.', 4000); this.reset(); break;
      case 'closed': this.cancelled = true; toast('The host ended the game.', 4000); this.reset(); break;
      case 'full':
        this.cancelled = true;
        toast(`This room is full (${m.max} players${m.plan === 'free' ? ' on the free plan — the host can upgrade to a Party Pass for up to 40' : ''}).`, 6000);
        this.reset();
        break;
      default: this.ui.message(m);
    }
  },
};
