// Guest phone for the party games. Inputs are optimistic: saved locally, sent through
// the retry queue (bad venue wifi), and restored after a refresh.
import { $, $$, esc, store } from './common.js';
import { t, itemText } from './i18n.js';
import { drawPad, toSvg, PALETTE, WIDTHS } from './doodle.js';
import { promptHtml, isGameStage } from './games-screen.js';

export { isGameStage };
const ICON = { quip: '⚔️', fib: '🕵️', doodle: '🎨', pulse: '📊' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const pulsePoints = (guess, actual) => { const d = Math.abs(guess - actual); return Math.max(0, Math.round(1000 - 20 * d)) + (d <= 2 ? 250 : 0); };

let ctx = null; let lastKey = ''; let pad = null; let pollYes = null; let pollGuess = 50;
const mineKey = (run) => 'pdw_g_' + run;
const mine = (run) => store.get(mineKey(run), {});
const saveMine = (run, patch) => store.set(mineKey(run), { ...mine(run), ...patch });
const slot = (l) => (l.stage === 'clash' ? `clash_${l.game.round}` : l.stage);

const artCache = new Map();
const loadArt = (id) => { if (!artCache.has(id)) artCache.set(id, fetch(`/api/wedding?action=art&id=${encodeURIComponent(id)}`).then((r) => r.json()).then((d) => d.art || []).catch(() => [])); return artCache.get(id); };

/* ctx: { lang, creds, queue, toast, refreshMe } — set by guest.js on every render. */
export function renderGameGuest(el, l, prev, c) {
  ctx = c; document.body.dataset.game = l.game.kind;
  const m = mine(l.game.run); const done = m[slot(l)] !== undefined;
  const key = `${l.stage}|${l.game.run}|${l.game.round}|${done}|${c.lang}`;
  if (key === lastKey && prev) return;
  const stageChanged = !prev || prev.stage !== l.stage || prev.game?.run !== l.game.run || prev.game?.round !== l.game.round;
  lastKey = key;
  const L = c.lang; const k = l.game.kind;
  const head = `<div class="gp-logo">${ICON[k]} ${t(L, 'g_' + k)}</div>`;
  const prompt = (fill) => `<div class="gp-prompt" dir="auto">${promptHtml(itemText(l.item, L), fill)}</div>`;
  const doneBox = (extra = '') => `<div class="gp-done"><span class="ck">✅</span>${t(L, 'sent')}${extra}</div>`;
  let html = '';
  switch (l.stage) {
    case 'write': {
      const max = k === 'fib' ? 40 : 60;
      html = `${head}${prompt()}<div class="gp-how">${t(L, k === 'fib' ? 'write_fib' : 'write_quip')}</div>` + (done
        ? doneBox(`<div class="gp-mine" dir="auto">“${esc(m.write)}”</div>`)
        : `<textarea class="input" id="gpText" maxlength="${max}" rows="2" dir="auto" autocomplete="off"></textarea><div class="gp-left"><span id="gpLeft">${max}</span> ${t(L, 'chars_left')}</div><button class="btn btn-gold btn-xl btn-block" id="gpSend">${t(L, 'submit')} ✨</button>`);
      break;
    }
    case 'draw':
      html = `${head}${prompt()}` + (done
        ? doneBox(m.strokes ? `<div style="max-width:200px;margin:10px auto 0">${toSvg(m.strokes)}</div>` : '')
        : `<div class="gp-how">${t(L, 'drawing_hint')}</div><canvas class="pad" id="gpPad"></canvas>
          <div class="pal">${PALETTE.map((col, i) => `<button type="button" data-col="${i}" class="${i === 0 ? 'sel' : ''}" style="--c:${col}" aria-label="colour ${i + 1}"></button>`).join('')}</div>
          <div class="pal">${WIDTHS.map((w, i) => `<button type="button" class="w ${i === 1 ? 'sel' : ''}" data-w="${i}" aria-label="brush ${i + 1}"><i style="width:${w}px;height:${w}px"></i></button>`).join('')}</div>
          <div class="tools"><button class="btn btn-ghost btn-sm" id="gpUndo">↩ ${t(L, 'undo')}</button><button class="btn btn-ghost btn-sm" id="gpClear">🗑 ${t(L, 'clear')}</button></div>
          <button class="btn btn-gold btn-xl btn-block" id="gpSend">${t(L, 'submit')} 🎨</button>`);
      break;
    case 'poll':
      html = `${head}${prompt()}` + (done
        ? doneBox(`<div class="gp-mine">${m.poll.yes ? t(L, 'yes') : t(L, 'no')} · ${t(L, 'you_guessed')} ${m.poll.guess}%</div>`)
        : `<div class="yn"><button class="y ${pollYes === true ? 'sel' : pollYes === false ? 'off' : ''}" data-yn="1">👍 ${t(L, 'yes')}</button><button class="n ${pollYes === false ? 'sel' : pollYes === true ? 'off' : ''}" data-yn="0">👎 ${t(L, 'no')}</button></div>
          <div class="gp-how">${t(L, 'guess_pct')}</div><div class="pct" id="gpPct">${pollGuess}%</div><input type="range" min="0" max="100" value="${pollGuess}" id="gpRange" aria-label="${esc(t(L, 'guess_pct'))}" />
          <button class="btn btn-gold btn-xl btn-block" id="gpSend" ${pollYes === null ? 'disabled' : ''}>${t(L, 'submit')} 📊</button>`);
      break;
    case 'review': html = `${head}<div style="margin:24px 0"><span class="gp-wait">🃏</span></div><p>${t(L, 'hosts_choosing')}</p>`; break;
    case 'clash': {
      const q = l.game.matchup; const myText = norm(m.write); const minePair = myText && (norm(q.a.text) === myText || norm(q.b.text) === myText);
      html = `${head}<div class="muted small" style="margin-top:8px">${t(L, 'clash_n')} ${l.game.round + 1}/${l.game.total || 1}</div>${prompt()}` + (minePair ? `<div class="gp-result">${t(L, 'your_quip_in')}</div>`
        : `<div class="gp-how">${t(L, 'vote_best')}</div><div class="gp-big">${[q.a, q.b].map((x, i) => `<button data-pick="${i}" class="${m[slot(l)] === i ? 'picked' : ''}" ${done ? 'disabled' : ''} dir="auto">${esc(x.text)}</button>`).join('')}</div>${done ? `<div class="banner info">${t(L, 'voted')}</div>` : ''}`);
      break;
    }
    case 'clashResult': {
      const r = l.game.result; const q = l.game.matchup; const me = c.creds.gid;
      const my = q.a.gid === me ? 0 : q.b.gid === me ? 1 : -1;
      html = `${head}${prompt()}<div class="gp-big">${[q.a, q.b].map((x, i) => `<button disabled class="${r.winner === i ? 'picked' : ''}" dir="auto">${r.winner === i ? '👑 ' : ''}${esc(x.text)}<small>${esc(x.name || '')} · ${r.counts[i]} 🗳️</small></button>`).join('')}</div>` +
        (my >= 0 ? `<div class="gp-result ${r.winner === my ? 'good' : ''}">${t(L, r.winner === my ? 'you_won' : 'you_lost')}<b>+${r.pts[my].toLocaleString()}</b></div>` : '');
      break;
    }
    case 'gameOver': {
      const b = l.game.best;
      html = `${head}` + (b ? `<div class="gp-result ${b.gid === c.creds.gid ? 'good' : ''}">🏆 ${t(L, 'best_quip')}<div class="gp-prompt" dir="auto">“${esc(b.text)}”</div>${esc(b.avatar || '')} ${esc(b.name)}<b>+${(b.pts || 0).toLocaleString()}</b></div>` : `<p>${t(L, 'not_enough')}</p>`);
      break;
    }
    case 'pick': {
      const myLie = norm(m.write);
      html = `${head}${prompt()}<div class="gp-how">${t(L, 'find_truth')}</div><div class="gp-big">${l.game.options.map((o, i) => { const own = myLie && norm(o) === myLie; return `<button data-pick="${i}" class="${m.pick === i ? 'picked' : ''}" ${done || own ? 'disabled' : ''} dir="auto">${esc(o)}${own ? `<small>${t(L, 'your_lie')}</small>` : ''}</button>`; }).join('')}</div>${done ? `<div class="banner info">${t(L, 'locked')}</div>` : ''}`;
      break;
    }
    case 'fibReveal': {
      const rv = l.game.reveal; const truth = rv.find((r) => r.truth); const me = c.creds.gid;
      const picked = m.pick !== undefined ? rv[m.pick] : null;
      const myLie = rv.find((r) => r.authors.some((a) => a.gid === me));
      let res = '';
      if (picked?.truth) res = `<div class="gp-result good">🕵️ ${t(L, 'found_truth')}<b>+${truth.pts.toLocaleString()}</b></div>`;
      else if (picked) res = `<div class="gp-result">😅 ${t(L, 'fooled_by')} ${picked.authors.length ? picked.authors.map((a) => esc(a.avatar + ' ' + a.name)).join(', ') : '🤖'}</div>`;
      if (myLie) res += `<div class="gp-result ${myLie.count ? 'good' : ''}">${t(L, 'your_lie_fooled')} ${myLie.count} ${t(L, 'people')}<b>+${myLie.pts.toLocaleString()}</b></div>`;
      html = `${head}${prompt(truth.text)}${res}`;
      break;
    }
    case 'gallery': {
      html = `${head}${prompt()}<div class="gp-how">${t(L, 'vote_best')}</div><div class="gp-grid" id="gpGallery">${(l.game.finalists || []).map((_, i) => `<button data-pick="${i}" class="${m.gallery === i ? 'picked' : ''}" ${done ? 'disabled' : ''}><b>${i + 1}</b></button>`).join('')}</div>${done ? `<div class="banner info">${t(L, 'voted')}</div>` : ''}`;
      break;
    }
    case 'galleryResult': {
      const g = l.game; const me = c.creds.gid; const i = g.artists.findIndex((a) => a.gid === me);
      html = `${head}${prompt()}<div class="gp-grid" id="gpGallery">${g.artists.map((a, j) => `<button disabled class="${g.winners.includes(j) ? 'picked' : ''}"><b>${j + 1}</b><small style="display:block;color:#1d1030;font-weight:700">${g.winners.includes(j) ? '👑 ' : ''}${esc(a.name)} · ${g.counts[j]} 🗳️</small></button>`).join('')}</div>` +
        (i >= 0 ? `<div class="gp-result ${g.winners.includes(i) ? 'good' : ''}">🎨<b>+${g.pts[i].toLocaleString()}</b></div>` : '');
      break;
    }
    case 'pulseReveal': {
      const g = l.game; const p = m.poll;
      html = `${head}${prompt()}<div class="gp-result">${t(L, 'actual_pct')}<b>${g.actual}%</b></div>` + (p ? `<div class="gp-result ${Math.abs(p.guess - g.actual) <= 5 ? 'good' : ''}">${t(L, 'you_guessed')} ${p.guess}%<b>+${pulsePoints(p.guess, g.actual).toLocaleString()}</b></div>` : '');
      break;
    }
    default: html = `${head}`;
  }
  el.innerHTML = `<div class="gp">${html}</div>`;
  wire(el, l);
  if (stageChanged && ['clashResult', 'fibReveal', 'galleryResult', 'pulseReveal', 'gameOver'].includes(l.stage)) setTimeout(c.refreshMe, 400 + Math.random() * 2500);
}

function wire(el, l) {
  const run = l.game.run; const stage = l.stage;
  const send = (body, local) => {
    saveMine(run, local);
    ctx.queue.pushGame(`${run}|${slot(l)}`, { run, stage, ...body });
    navigator.vibrate?.(30);
    lastKey = ''; renderGameGuest(el, l, l, ctx);
  };
  const txt = $('#gpText', el);
  if (txt) {
    const left = $('#gpLeft', el); txt.addEventListener('input', () => { left.textContent = Number(txt.maxLength) - txt.value.length; });
    $('#gpSend', el).addEventListener('click', () => { const v = txt.value.trim(); if (!v) { txt.focus(); return; } send({ text: v }, { write: v }); });
  }
  const cv = $('#gpPad', el);
  if (cv) {
    pad = drawPad(cv);
    el.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { pad.setColor(Number(b.dataset.col)); el.querySelectorAll('[data-col]').forEach((x) => x.classList.toggle('sel', x === b)); }));
    el.querySelectorAll('[data-w]').forEach((b) => b.addEventListener('click', () => { pad.setWidth(Number(b.dataset.w)); el.querySelectorAll('[data-w]').forEach((x) => x.classList.toggle('sel', x === b)); }));
    $('#gpUndo', el).addEventListener('click', () => pad.undo());
    $('#gpClear', el).addEventListener('click', () => pad.clear());
    $('#gpSend', el).addEventListener('click', () => { if (pad.empty()) return; const strokes = pad.strokes(); send({ strokes, png: pad.png() }, { draw: true, strokes }); });
  }
  const range = $('#gpRange', el);
  if (range) {
    range.addEventListener('input', () => { pollGuess = Number(range.value); $('#gpPct', el).textContent = pollGuess + '%'; });
    el.querySelectorAll('[data-yn]').forEach((b) => b.addEventListener('click', () => {
      pollYes = b.dataset.yn === '1';
      el.querySelectorAll('[data-yn]').forEach((x) => { x.classList.toggle('sel', x === b); x.classList.toggle('off', x !== b); });
      $('#gpSend', el).disabled = false;
    }));
    $('#gpSend', el).addEventListener('click', () => { if (pollYes === null) return; send({ yes: pollYes, guess: pollGuess }, { poll: { yes: pollYes, guess: pollGuess } }); pollYes = null; pollGuess = 50; });
  }
  el.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => { if (b.disabled) return; const i = Number(b.dataset.pick); send({ choice: i }, { [slot(l)]: i }); }));
  if ($('#gpGallery', el) && l.game.art) {
    const myArt = JSON.stringify(mine(run).strokes || null);
    loadArt(l.game.art).then((art) => art.forEach((strokes, i) => {
      const b = el.querySelector(`#gpGallery button:nth-child(${i + 1})`); if (!b) return;
      b.insertAdjacentHTML('afterbegin', toSvg(strokes));
      if (JSON.stringify(strokes) === myArt && stage === 'gallery') { b.disabled = true; b.insertAdjacentHTML('beforeend', `<small style="display:block;color:#1d1030">${t(ctx.lang, 'own_art')}</small>`); }
    }));
  }
}

/* The server refused an input (unkind text, a lie too close to the truth, your own quip…):
 * forget the optimistic state so the guest can try again, and say why. */
export function gameRejected(item, r, l) {
  const [run, s] = item.key.split('|');
  const m = mine(run); const field = s === 'write' ? 'write' : s === 'draw' ? 'draw' : s === 'poll' ? 'poll' : s;
  delete m[field]; if (field === 'draw') delete m.strokes; store.set(mineKey(run), m);
  ctx?.toast(r.error, 4000);
  lastKey = '';
  if (l && isGameStage(l)) renderGameGuest($('#gStage'), l, l, ctx);
}
