// Projector / TV screen. Public: it only reads the live state.
import { $, esc, params, followLive, qr, joinUrl } from './common.js';
import { t, useLanguage, fontStack, itemText, optionText } from './i18n.js';
import { confetti } from '../confetti.js';
import { renderGame, isGameStage, clearGameTimers, tickGame } from './games-screen.js';

const wid = params.get('w'); let code = params.get('c') || '';
let live = null; let now = () => Date.now(); let finaleTimer = null; let lastKey = ''; let lastGameKey = '';

function langs(l) { return [l.lang || 'en', l.secondLang].filter(Boolean); }
function pair(item, l) {
  const [a, b] = langs(l);
  const main = itemText(item, a); const sub = b ? itemText(item, b) : '';
  return `<div class="big" dir="auto" style="font-family:${fontStack(a) || 'inherit'}">${esc(main)}</div>${sub && sub !== main ? `<div class="big2" dir="auto" style="font-family:${fontStack(b) || 'inherit'}">${esc(sub)}</div>` : ''}`;
}
function optPair(item, i, l) {
  const [a, b] = langs(l); const main = optionText(item, i, a); const sub = b ? optionText(item, i, b) : '';
  return `${esc(main)}${sub && sub !== main ? `<small>${esc(sub)}</small>` : ''}`;
}
function sidesBars(sides, l, grow = true) {
  const list = l.sides || []; const max = Math.max(1, ...list.map((s) => sides?.[s.id] || 0));
  return `<div class="sides-bars">${list.map((s) => { const v = sides?.[s.id] || 0; return `<div class="sbar"><span class="nm">${esc(s.name)}</span><span class="track"><span class="fill" data-w="${(v / max) * 100}" style="--c:${esc(s.color)};width:${grow ? 0 : (v / max) * 100}%"></span></span><span class="v">${v.toLocaleString()}</span></div>`; }).join('')}</div>`;
}
function growBars() { requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.fill[data-w]').forEach((f) => { f.style.width = f.dataset.w + '%'; }))); }
function lb(top) { return `<div class="lb">${top.slice(0, 8).map((r, i) => `<div class="row"><span class="r">${i + 1}</span><span class="avatar" style="--c:${esc(r.color)}">${esc(r.avatar)}</span><span class="n">${esc(r.name)}${r.group > 1 ? ` ×${r.group}` : ''}</span><b>${r.pts.toLocaleString()}</b></div>`).join('')}</div>`; }
function joinBlock(l) {
  const c = l.code || code;
  return `<div class="join"><div class="qr" id="qrBox"></div><div><div class="big2">${t('en', 'scan_to_join')}</div><div class="url">${esc(location.host)}/w</div><div class="code">${esc(c)}</div>${l.guests ? `<div class="count">${l.guests} ${t('en', 'guests')}</div>` : ''}</div></div>`;
}

function render(l, prev) {
  for (const x of langs(l)) useLanguage(x);
  if (l.code) code = l.code;
  $('#brand').innerHTML = l.brand?.logo ? `<img src="${esc(l.brand.logo)}" alt=""> ${esc(l.brand.name || '')}` : l.brand?.name ? esc(l.brand.name) : `💍 ${esc(l.title || '')}`;
  $('#wm').classList.toggle('hidden', !l.watermark);
  $('#topRight').textContent = l.eventName ? `${l.eventName}${l.index >= 0 && l.total ? ` · ${l.index + 1}/${l.total}` : ''}` : '';
  const key = `${l.stage}|${l.eventId}|${l.index}`;
  const changed = key !== lastKey; lastKey = key;
  const m = $('#main'); const it = l.item;
  if (isGameStage(l)) { const gk = `${key}|${l.game.run}|${l.game.round}`; const gChanged = gk !== lastGameKey; lastGameKey = gk; if (gChanged) clearTimeout(finaleTimer); renderGame(m, l, prev, gChanged); return; }
  lastGameKey = ''; clearGameTimers(); delete document.body.dataset.game;
  if (!changed && ['question', 'vote'].includes(l.stage)) { const c = $('#ansCount'); if (c) c.textContent = `${l.answered || 0} ${t('en', 'answered')}`; return; }
  clearTimeout(finaleTimer);
  switch (l.stage) {
    case 'intro': m.innerHTML = `<div class="title">${esc(l.eventName || '')}</div>${joinBlock(l)}`; qr($('#qrBox'), joinUrl(code), 300); break;
    case 'question': case 'vote': {
      const head = it.kind === 'emoji' ? `<div class="emoji-clue" dir="ltr">${esc(it.emoji || '')}</div>` : it.kind === 'shoe' ? '<div class="big2">👠 The shoe game</div>' : l.stage === 'vote' ? '<div class="big2">🗳️ Vote on your phone!</div>' : '';
      m.innerHTML = `${head}${pair(it, l)}<div class="timerbar"><i id="tb"></i></div><div class="opts ${it.options.length === 2 ? 'two' : ''}">${it.options.map((o, i) => `<div class="opt o${i}">${optPair(it, i, l)}</div>`).join('')}</div><div class="count" id="ansCount">${l.answered || 0} ${t('en', 'answered')}</div>`;
      break;
    }
    case 'prompt': m.innerHTML = `${pair(it, l)}<div class="wall">${(l.wall || []).map((n) => `<div class="toast-card">“${esc(n.text)}”<b>${esc(n.avatar || '')} ${esc(n.name)}</b></div>`).join('')}</div>`; break;
    case 'reveal': case 'voteResult': {
      const r = l.reveal; const total = Math.max(1, r.counts.reduce((a, b) => a + b, 0));
      const win = l.stage === 'voteResult' ? r.winners : r.split ? [0, 1] : [r.correct];
      m.innerHTML = `${pair(it, l)}<div class="opts ${it.options.length === 2 ? 'two' : ''}">${it.options.map((o, i) => `<div class="opt o${i} ${win.includes(i) ? 'correct' : 'dim'}"><span class="cnt">${r.counts[i]}</span>${optPair(it, i, l)}<i class="bar" style="width:${(r.counts[i] / total) * 100}%"></i></div>`).join('')}</div>
        ${r.split ? `<div class="big2" dir="auto">🤷 ${esc(t(l.lang || 'en', 'split'))}</div>` : ''}
        ${l.stage === 'voteResult' && Object.keys(r.sideBonus || {}).length ? `<div class="big2">+${Object.values(r.sideBonus)[0]} for ${esc((l.sides || []).find((s) => s.id === Object.keys(r.sideBonus)[0])?.name || '')}!</div>` : ''}`;
      if (changed && !r.split) confetti(60);
      break;
    }
    case 'board': m.innerHTML = `<div class="title">🏆 Leaderboard</div><div style="display:flex;gap:4vw;align-items:flex-start">${lb(l.board?.top || [])}${sidesBars(l.board?.sides, l)}</div>`; growBars(); break;
    case 'finale': finale(l); break;
    default: m.innerHTML = `<div class="title">${esc(l.title || '💍')}</div>${joinBlock(l)}`; qr($('#qrBox'), joinUrl(code), 300);
  }
}

// Finale: drumroll -> side bars grow -> winner -> podium, with confetti.
function finale(l) {
  const m = $('#main'); const f = l.finale || {};
  m.innerHTML = `<div class="title">${t('en', 'finale')}</div><div class="drum">🥁</div>`;
  finaleTimer = setTimeout(() => {
    m.innerHTML = `<div class="title">Side vs side</div>${sidesBars(f.sides, l)}`; growBars();
    finaleTimer = setTimeout(() => {
      const winners = (f.winners || []).map((id) => (l.sides || []).find((s) => s.id === id)).filter(Boolean);
      const top = f.top || [];
      m.innerHTML = `${winners.map((s) => `<div class="finale-winner" style="--c:${esc(s.color)}">🏆 ${esc(s.name)}</div>`).join('')}
        <div class="podium3">${[top[1], top[0], top[2]].map((r, i) => (r ? `<div class="p"><span class="avatar" style="--c:${esc(r.color)}">${esc(r.avatar)}</span>${esc(r.name)}<span>${r.pts.toLocaleString()}</span><div class="st" style="height:${[14, 20, 10][i]}vh">${[2, 1, 3][i]}</div></div>` : '<div class="p"></div>')).join('')}</div>`;
      confetti(260, ['🎉', '💍', '🏆']); setTimeout(() => confetti(200, ['💐', '✨']), 1500);
    }, 3200);
  }, 2600);
}

function tick() {
  const bar = $('#tb');
  if (bar && live?.deadline && live.durationMs) bar.style.width = Math.max(0, Math.min(100, ((live.deadline - now()) / live.durationMs) * 100)) + '%';
  if (live && isGameStage(live)) tickGame(live, now());
  requestAnimationFrame(tick);
}

if (!wid) $('#main').innerHTML = '<div class="big">Open this screen from the host panel.</div>';
else { followLive(wid, (l, prev, clock) => { now = clock; live = l; render(l, prev); }); requestAnimationFrame(tick); }
document.addEventListener('dblclick', () => document.documentElement.requestFullscreen?.().catch(() => {}));
