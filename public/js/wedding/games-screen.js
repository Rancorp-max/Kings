// Big-screen shows for the party games (Quip Clash, Fib Finder, Doodle Duel, Crowd Pulse).
// Everything here is presentation: it reads the public live doc and animates it.
import { $, $$, esc } from './common.js';
import { itemText, fontStack } from './i18n.js';
import { confetti } from '../confetti.js';
import { toSvg } from './doodle.js';

export const GAMES = {
  quip: { name: 'Quip Clash', icon: '⚔️', tag: 'Write it. Vote it. Win it.', how: 'Write the funniest answer on your phone!' },
  fib: { name: 'Fib Finder', icon: '🕵️', tag: 'Fool your friends. Find the truth.', how: 'Write a lie that sounds TRUE on your phone!' },
  doodle: { name: 'Doodle Duel', icon: '🎨', tag: 'Draw it. Judge it. Frame it.', how: 'Draw it on your phone!' },
  pulse: { name: 'Crowd Pulse', icon: '📊', tag: 'How well do you know this crowd?', how: 'Answer YES or NO — then guess how the room answered!' },
};
const STAGES = new Set(['write', 'draw', 'poll', 'review', 'clash', 'clashResult', 'gameOver', 'pick', 'fibReveal', 'gallery', 'galleryResult', 'pulseReveal']);
export const isGameStage = (l) => !!l?.game && STAGES.has(l.stage);

let timers = [];
const later = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
export function clearGameTimers() { timers.forEach(clearTimeout); timers = []; }

const artCache = new Map();
async function loadArt(id) {
  if (!artCache.has(id)) artCache.set(id, fetch(`/api/wedding-live?art=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => d.art || []).catch(() => []));
  return artCache.get(id);
}

// "The secret to a happy marriage is ___" -> a glowing blank (or the answer, once revealed).
export function promptHtml(text, fill = '') {
  return esc(text).replace(/_{2,}/g, fill ? `<span class="blank filled">${esc(fill)}</span>` : '<span class="blank">&nbsp;</span>');
}
const lang = (l) => l.lang || 'en';
const promptOf = (l, fill) => `<div class="g-prompt" dir="auto" style="font-family:${fontStack(lang(l)) || 'inherit'}">${promptHtml(itemText(l.item, lang(l)), fill)}</div>${l.secondLang && itemText(l.item, l.secondLang) !== itemText(l.item, lang(l)) ? `<div class="g-prompt2" dir="auto" style="font-family:${fontStack(l.secondLang) || 'inherit'}">${promptHtml(itemText(l.item, l.secondLang))}</div>` : ''}`;
const logo = (k) => `<div class="g-logo"><span class="gi">${GAMES[k].icon}</span>${GAMES[k].name}</div>`;
const ring = '<div class="g-ring" id="gRing"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="bgc"/><circle cx="50" cy="50" r="44" class="fg" id="gRingFg"/></svg><b id="gRingN"></b></div>';
const top = (l, extra = '') => `<div class="g-top">${logo(l.game.kind)}${extra}${l.deadline ? ring : '<div class="g-ring-sp"></div>'}</div>`;
const person = (p, cls = '') => (p ? `<span class="g-person ${cls}" style="--c:${esc(p.color || '#8b5cff')}"><span class="av">${esc(p.avatar || '🙂')}</span>${esc(p.name || '')}</span>` : '');
const sideColor = (l, id) => (l.sides || []).find((s) => s.id === id)?.color || '#8b5cff';

function countUp(el, to, ms = 1200, fmt = (v) => Math.round(v).toLocaleString()) {
  if (!el) return; const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / ms); el.textContent = fmt(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------------------------------------------------------------- render (structural changes)
export function renderGame(m, l, prev, changed) {
  document.body.dataset.game = l.game.kind;
  if (!changed) { updateGame(l); return; }
  clearGameTimers();
  const k = l.game.kind; const g = l.game;
  switch (l.stage) {
    case 'write': case 'draw': case 'poll': {
      const art = k === 'doodle' ? '<div class="g-pencil">✏️<svg viewBox="0 0 200 60"><path d="M5 40 C 30 5, 50 55, 75 25 S 120 5, 140 35 S 180 50, 195 15"/></svg></div>'
        : k === 'pulse' ? '<svg class="g-ecg" viewBox="0 0 600 80"><path d="M0 40 H170 L190 40 L205 8 L222 72 L238 26 L250 40 H400 L420 40 L435 14 L450 66 L462 40 H600"/></svg>' : '';
      m.innerHTML = `${top(l)}${promptOf(l)}${art}<div class="g-how">📱 ${esc(GAMES[k].how)}</div><div class="g-count"><b id="gCount">${l.answered || 0}</b> ${k === 'doodle' ? 'drawings' : 'answers'} in</div><div class="g-crowd" id="gCrowd"></div>`;
      if (!prev || prev.game?.run !== g.run) splash(k);
      updateGame(l);
      break;
    }
    case 'review':
      m.innerHTML = `${top(l)}<div class="g-shuffle"><span>🃏</span><span>🃏</span><span>🃏</span></div><div class="g-how">The hosts are picking the best answers…</div>`;
      break;
    case 'clash': case 'clashResult': renderClash(m, l, prev); break;
    case 'gameOver': {
      if (g.few || !g.best) { m.innerHTML = `${top(l)}<div class="g-how">Not enough answers this time — on to the next round!</div>`; break; }
      m.innerHTML = `${top(l)}<div class="spot"><div class="spot-label">🏆 Quip of the round</div>
        <div class="qcard hero" style="--c:${esc(sideColor(l, g.best.side))}"><div class="g-mini" dir="auto">${promptHtml(itemText(l.item, lang(l)))}</div><div class="qtext" dir="auto">${esc(g.best.text)}</div>${person(g.best, 'big')}<div class="qpts">+${(g.best.pts || 0).toLocaleString()}</div></div></div>
        <div class="recap">${(g.recap || []).slice(1, 6).map((r, i) => `<div class="rc" style="animation-delay:${0.6 + i * 0.12}s"><span dir="auto">“${esc(r.text)}”</span>${person(r)}</div>`).join('')}</div>`;
      later(400, () => confetti(220, ['🏆', '😂', '✨', '💍']));
      break;
    }
    case 'pick': case 'fibReveal': renderFib(m, l, prev); break;
    case 'gallery': case 'galleryResult': renderGallery(m, l, prev); break;
    case 'pulseReveal': renderPulse(m, l); break;
    default: break;
  }
}

// Title card that slams in at the start of each game.
function splash(k) {
  const el = document.createElement('div');
  el.className = 'g-splash';
  el.innerHTML = `<div class="rays"></div><div class="sp-in"><div class="sp-icon">${GAMES[k].icon}</div><div class="sp-name">${GAMES[k].name}</div><div class="sp-tag">${GAMES[k].tag}</div></div>`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3400);
}

// Light updates: counters and avatars bubbling up as guests submit.
let bubbled = '';
export function updateGame(l) {
  const c = $('#gCount'); if (c && c.textContent !== String(l.answered || 0)) { c.textContent = l.answered || 0; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
  const crowd = $('#gCrowd'); const key = JSON.stringify(l.recent || []);
  if (crowd && key !== bubbled) {
    bubbled = key;
    for (const r of (l.recent || []).slice(0, 8)) {
      const b = document.createElement('span'); b.className = 'bubble'; b.textContent = r.avatar;
      b.style.setProperty('--c', r.color || '#8b5cff'); b.style.left = `${4 + Math.random() * 90}%`; b.style.animationDelay = `${Math.random() * 1.2}s`;
      crowd.appendChild(b); setTimeout(() => b.remove(), 4200);
    }
  }
}

// Countdown ring (called every frame by the screen's tick).
export function tickGame(l, now) {
  const fg = $('#gRingFg'); if (!fg || !l.deadline || !l.durationMs) return;
  const left = Math.max(0, l.deadline - now); const k = left / l.durationMs;
  fg.style.strokeDashoffset = String(276.5 * (1 - k));
  const n = $('#gRingN'); const s = Math.ceil(left / 1000); if (n && n.textContent !== String(s)) { n.textContent = s; $('#gRing').classList.toggle('hurry', s <= 5 && s > 0); }
}

// ---------------------------------------------------------------- Quip Clash
function renderClash(m, l, prev) {
  const g = l.game; const res = l.stage === 'clashResult' ? g.result : null;
  const card = (q, i) => {
    const r = res ? { votes: res.counts[i], share: (res.counts[0] + res.counts[1]) ? res.counts[i] / (res.counts[0] + res.counts[1]) : 0.5 } : null;
    return `<div class="qcard ${i ? 'right' : 'left'} ${res ? 'static' : ''}" id="qc${i}" ${q.side ? `style="--c:${esc(sideColor(l, q.side))}"` : ''}>
      <div class="qtext" dir="auto">${esc(q.text)}</div>
      ${r ? `<div class="qbar"><i style="--h:${Math.round(r.share * 100)}%"></i></div><div class="qpct"><b data-to="${Math.round(r.share * 100)}">0</b>%<small>${r.votes} vote${r.votes === 1 ? '' : 's'}</small></div>
        <div class="qauthor">${person(q)}</div><div class="qpts">+${res.pts[i].toLocaleString()}</div><div class="rain">${(g.voters?.[i] || []).map((v, j) => `<span style="--c:${esc(v.color)};left:${8 + ((j * 37) % 84)}%;animation-delay:${0.15 + j * 0.07}s">${esc(v.avatar)}</span>`).join('')}</div>` : ''}
    </div>`;
  };
  m.innerHTML = `${top(l, `<div class="g-round">Clash ${g.round + 1} of ${g.total || 1}</div>`)}<div class="g-small">${promptOf(l)}</div>
    <div class="clash">${card(g.matchup.a, 0)}<div class="vs ${res ? 'static' : ''}">VS</div>${card(g.matchup.b, 1)}</div>
    ${res ? '' : `<div class="g-count">📱 Vote on your phone · <b id="gCount">${l.answered || 0}</b> votes</div>`}`;
  if (!res) return;
  $$('.qpct b').forEach((b) => countUp(b, Number(b.dataset.to), 1100, (v) => String(Math.round(v))));
  requestAnimationFrame(() => $$('.qbar i').forEach((i) => i.classList.add('go')));
  later(900, () => $$('.qauthor').forEach((a) => a.classList.add('show')));
  later(1600, () => {
    if (res.winner >= 0) { $(`#qc${res.winner}`)?.classList.add('win'); $(`#qc${1 - res.winner}`)?.classList.add('lose'); confetti(res.sweep ? 200 : 90, res.sweep ? ['⚔️', '✨', '🔥'] : null); } else $$('.qcard').forEach((c) => c.classList.add('tie'));
    $$('.qpts').forEach((p) => p.classList.add('show'));
  });
  if (res.sweep) later(1900, () => { const s = document.createElement('div'); s.className = 'stamp sweep'; s.textContent = 'CLEAN SWEEP!'; $('.clash')?.appendChild(s); });
}

// ---------------------------------------------------------------- Fib Finder
function renderFib(m, l) {
  const g = l.game; const reveal = l.stage === 'fibReveal' ? g.reveal : null;
  const opts = reveal ? reveal.map((r) => r.text) : g.options || [];
  m.innerHTML = `${top(l)}<div class="g-small">${promptOf(l)}</div>
    <div class="fib-grid n${opts.length}">${opts.map((o, i) => `<div class="ftile ${reveal ? 'static' : ''}" id="ft${i}" style="--d:${i * 0.12}s"><span dir="auto">${esc(o)}</span>${reveal ? '<div class="fpick"></div><div class="fstamp"></div><div class="fby"></div>' : ''}</div>`).join('')}</div>
    ${reveal ? '' : `<div class="g-count">📱 Find the TRUTH on your phone · <b id="gCount">${l.answered || 0}</b> locked in</div>`}`;
  if (!reveal) return;
  const truthI = reveal.findIndex((r) => r.truth);
  const order = reveal.map((r, i) => ({ ...r, i })).filter((r) => !r.truth && r.count > 0).sort((a, b) => a.count - b.count);
  let t = 500;
  const focus = (i) => { $$('.ftile').forEach((x, j) => { x.classList.toggle('focus', j === i); x.classList.toggle('dim', j !== i); }); };
  const pickers = (i, r) => { const el = $(`#ft${i} .fpick`); if (el) el.innerHTML = r.pickers.map((p, j) => `<span style="--c:${esc(p.color)};animation-delay:${j * 0.08}s">${esc(p.avatar)}</span>`).join('') + (r.count > r.pickers.length ? `<em>+${r.count - r.pickers.length}</em>` : ''); };
  for (const r of order) {
    later(t, () => { focus(r.i); pickers(r.i, r); });
    later(t + 1100, () => {
      const tile = $(`#ft${r.i}`); if (!tile) return;
      tile.classList.add('lie'); tile.querySelector('.fstamp').textContent = 'LIE!';
      tile.querySelector('.fby').innerHTML = r.authors.length ? `✍️ ${r.authors.map((a) => person(a)).join('')}${r.more ? ` +${r.more}` : ''} <b>+${r.pts.toLocaleString()}</b>` : '<i>our decoy 😉</i>';
    });
    t += 2800;
  }
  later(t, () => { focus(truthI); pickers(truthI, reveal[truthI]); });
  later(t + 1200, () => {
    const tile = $(`#ft${truthI}`); if (!tile) return;
    tile.classList.add('truth'); tile.querySelector('.fstamp').textContent = 'TRUTH!';
    tile.querySelector('.fby').innerHTML = `${reveal[truthI].count} found it · <b>+${reveal[truthI].pts.toLocaleString()}</b> each`;
    const p = $('.g-prompt'); if (p) p.innerHTML = promptHtml(itemText(l.item, lang(l)), reveal[truthI].text);
    confetti(160, ['🕵️', '✨', '💍']);
  });
  later(t + 3600, () => $$('.ftile').forEach((x) => { x.classList.remove('dim', 'focus'); x.classList.add('done'); }));
}

// ---------------------------------------------------------------- Doodle Duel
function renderGallery(m, l) {
  const g = l.game; const res = l.stage === 'galleryResult' ? g : null; const n = (g.finalists || g.artists || []).length;
  m.innerHTML = `${top(l)}<div class="g-small">${promptOf(l)}</div>
    <div class="gallery n${n}">${Array.from({ length: n }, (_, i) => `<div class="frame" id="fr${i}" style="--r:${[-3, 2, -1.5, 3, -2, 1.5][i % 6]}deg;--d:${i * 0.15}s"><div class="fnum">${i + 1}</div><div class="fart"></div>${res ? `<div class="fvotes"><b data-to="${res.counts[i]}">0</b> 🗳️</div><div class="fartist">${person(res.artists[i])}<b>+${res.pts[i].toLocaleString()}</b></div>` : ''}</div>`).join('')}</div>
    ${res ? '' : `<div class="g-count">📱 Vote for your favourite · <b id="gCount">${l.answered || 0}</b> votes</div>`}`;
  loadArt(g.art).then((art) => art.forEach((strokes, i) => { const el = $(`#fr${i} .fart`); if (el) el.innerHTML = toSvg(strokes, { animate: res ? 0 : 3.2, delay: i * 0.6 }); }));
  if (!res) return;
  $$('.fvotes b').forEach((b) => countUp(b, Number(b.dataset.to), 1000));
  later(1000, () => {
    $$('.frame').forEach((f, i) => f.classList.add(res.winners.includes(i) ? 'win' : 'lose'));
    $$('.fartist').forEach((a) => a.classList.add('show'));
    confetti(180, ['🎨', '🖌️', '✨']);
  });
}

// ---------------------------------------------------------------- Crowd Pulse
function renderPulse(m, l) {
  const g = l.game;
  m.innerHTML = `${top(l)}<div class="g-small">${promptOf(l)}</div>
    <div class="gauge"><div class="track">${[0, 25, 50, 75, 100].map((v) => `<i class="tick" style="left:${v}%"><span>${v}%</span></i>`).join('')}
      ${(g.guesses || []).map((d, i) => `<span class="dot" style="left:${d.g}%;--c:${esc(d.color)};--y:${-(i % 5) * 1.6}vh;animation-delay:${0.2 + i * 0.03}s">${esc(d.avatar)}</span>`).join('')}
      <div class="needle ${g.actual > 70 ? 'lft' : ''}" style="--to:${g.actual}%"><b id="pulseN">0%</b><small>said YES</small></div></div></div>
    <div class="closest">${(g.closest || []).map((c, i) => `<div class="cl" style="animation-delay:${3.8 + i * 0.15}s">${i === 0 ? '🎯' : i + 1} ${person(c)}<span>${c.guess}%</span>${c.diff <= 2 ? '<em>BULLSEYE</em>' : ''}<b>+${c.pts.toLocaleString()}</b></div>`).join('')}</div>`;
  later(1500, () => { $('.needle')?.classList.add('go'); countUp($('#pulseN'), g.actual, 2200, (v) => `${Math.round(v)}%`); });
  later(3900, () => confetti(120, ['📊', '🎯', '✨']));
}
