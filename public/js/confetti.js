// Lightweight canvas confetti.
import { $, rand } from './util.js';

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

export function confetti(n = 120, emojis = null) {
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
}
