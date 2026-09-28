// Synthesised sound effects (no audio files).
import { store } from './util.js';

export const Sound = {
  on: store.get('kc_sound', true),
  ctx: null,
  ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
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
  tick() { this.tone(1200, 0.04, 'square', 0.04); },
  right() { [659, 880, 1175].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.13, i * 0.07)); },
  wrong() { this.tone(220, 0.25, 'sawtooth', 0.07); this.tone(180, 0.3, 'sawtooth', 0.06, 0.12); },
  fanfare() { [523, 523, 523, 698, 880, 1047].forEach((f, i) => this.tone(f, i > 2 ? 0.3 : 0.1, 'square', 0.07, i * 0.12)); },
};
