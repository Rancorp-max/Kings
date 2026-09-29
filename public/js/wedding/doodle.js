// Doodle Duel drawings: captured on the phone as compact strokes in a 256×256 grid
// ({c: colour index, w: width index, p: [x,y,x,y,…]}), replayed on the big screen
// as SVG paths that draw themselves.
export const PALETTE = ['#1d1030', '#e2355c', '#ff7a1c', '#f3c969', '#1c9a57', '#2f6bdf', '#8b5cff', '#ffffff'];
export const WIDTHS = [4, 9, 18];

export function pathD(p) {
  if (p.length === 2) return `M${p[0]} ${p[1]}l0.1 0`;
  let d = `M${p[0]} ${p[1]}`;
  // Smooth with midpoint quadratic curves.
  for (let i = 2; i < p.length - 2; i += 2) { const mx = (p[i] + p[i + 2]) / 2; const my = (p[i + 1] + p[i + 3]) / 2; d += `Q${p[i]} ${p[i + 1]} ${mx} ${my}`; }
  return d + `L${p[p.length - 2]} ${p[p.length - 1]}`;
}

function length(p) { let n = 0; for (let i = 2; i < p.length; i += 2) n += Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1]); return Math.max(1, Math.round(n * 1.1)); }

/* SVG markup. animate: total replay seconds (strokes draw one after another), or 0 for static. */
export function toSvg(strokes, { animate = 0, delay = 0, bg = '#fffaf0' } = {}) {
  const lens = strokes.map((s) => length(s.p)); const total = lens.reduce((a, b) => a + b, 0) || 1;
  let t = delay;
  const paths = strokes.map((s, i) => {
    const dur = animate ? (animate * lens[i]) / total : 0;
    const style = animate ? `stroke-dasharray:${lens[i]};stroke-dashoffset:${lens[i]};animation:dd-draw ${dur.toFixed(2)}s linear ${t.toFixed(2)}s forwards` : '';
    t += dur;
    return `<path d="${pathD(s.p)}" stroke="${PALETTE[s.c] || PALETTE[0]}" stroke-width="${WIDTHS[s.w] || WIDTHS[1]}" style="${style}"/>`;
  }).join('');
  return `<svg class="doodle-svg" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg"><rect width="256" height="256" rx="10" fill="${bg}"/><g fill="none" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
}

/* A finger-drawing pad. Returns { strokes(), undo(), clear(), setColor(i), setWidth(i), png(), empty() }. */
export function drawPad(canvas, { onChange } = {}) {
  const ctx = canvas.getContext('2d'); let strokes = []; let cur = null; let color = 0; let width = 1;
  const size = () => { const r = canvas.getBoundingClientRect(); const d = devicePixelRatio || 1; canvas.width = r.width * d; canvas.height = r.width * d; redraw(); };
  const scale = () => canvas.width / 256;
  function redraw() {
    ctx.fillStyle = '#fffaf0'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const k = scale(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const s of strokes) {
      ctx.strokeStyle = PALETTE[s.c]; ctx.lineWidth = WIDTHS[s.w] * k; ctx.beginPath();
      ctx.moveTo(s.p[0] * k, s.p[1] * k);
      if (s.p.length === 2) ctx.lineTo(s.p[0] * k + 0.1, s.p[1] * k);
      for (let i = 2; i < s.p.length; i += 2) ctx.lineTo(s.p[i] * k, s.p[i + 1] * k);
      ctx.stroke();
    }
  }
  const pt = (e) => { const r = canvas.getBoundingClientRect(); return [Math.max(0, Math.min(255, Math.round(((e.clientX - r.left) / r.width) * 256))), Math.max(0, Math.min(255, Math.round(((e.clientY - r.top) / r.height) * 256)))]; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); cur = { c: color, w: width, p: pt(e) }; strokes.push(cur); redraw(); });
  canvas.addEventListener('pointermove', (e) => {
    if (!cur) return; const [x, y] = pt(e); const n = cur.p.length;
    if (Math.hypot(x - cur.p[n - 2], y - cur.p[n - 1]) < 2.5 || cur.p.length > 1100) return; // thin the points
    cur.p.push(x, y); redraw();
  });
  const end = () => { if (cur) { cur = null; onChange?.(); } };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.style.touchAction = 'none';
  addEventListener('resize', size); requestAnimationFrame(size);
  return {
    strokes: () => strokes, empty: () => !strokes.length,
    undo() { strokes.pop(); redraw(); onChange?.(); }, clear() { strokes = []; redraw(); onChange?.(); },
    setColor(i) { color = i; }, setWidth(i) { width = i; },
    // Small image for the automatic safety check (only finalists' images are ever checked).
    png() {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d');
      x.drawImage(canvas, 0, 0, 256, 256); return c.toDataURL('image/jpeg', 0.7);
    },
  };
}
