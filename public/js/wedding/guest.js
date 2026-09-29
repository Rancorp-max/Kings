// Guest phone for weddings: join once (name + side + avatar), then follow the
// live state across every event. Answers are optimistic and retried offline.
import { $, $$, esc, params, store, api, followLive, answerQueue, toast, AVATARS, COLORS } from './common.js';
import { t, LANGS, useLanguage, fontStack, itemText, optionText } from './i18n.js';
import { renderGameGuest, gameRejected, isGameStage } from './games-guest.js';

let lang = store.get('pdw_lang') || (navigator.language || 'en').slice(0, 2);
if (!LANGS[lang]) lang = 'en';
let wedding = null; let creds = null; let me = null; let live = null; let now = () => Date.now();
let picked = {}; // `${eventId}:${index}` -> choice (optimistic)
let joinSide = null; let joinAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
let noteKind = 'wish'; let queue = null; let follower = null;
const code = (params.get('c') || store.get('pdw_last_code') || '').toUpperCase();

function applyLang(l) {
  lang = LANGS[l] ? l : 'en'; store.set('pdw_lang', lang);
  const info = useLanguage(lang);
  document.documentElement.lang = lang;
  document.body.dir = info.rtl ? 'rtl' : 'ltr';
  document.body.style.fontFamily = fontStack(lang) || '';
  $$('[data-i18n]').forEach((el) => { el.textContent = t(lang, el.dataset.i18n); });
  $('#noteText').placeholder = t(lang, 'note_placeholder');
  renderKinds();
  if (live) renderStage(live, null);
}

function langOptions(sel) {
  // Event languages first, then every other language the UI speaks.
  const langs = [...new Set([live?.lang, live?.secondLang, ...(wedding?.languages || []), 'en', ...Object.keys(LANGS)].filter(Boolean))];
  sel.innerHTML = langs.map((l) => `<option value="${l}" ${l === lang ? 'selected' : ''}>${LANGS[l].native}</option>`).join('');
}

// ---------------------------------------------------------------- join
async function showJoin() {
  $('#vJoin').classList.remove('hidden'); $('#vPlay').classList.add('hidden');
  $('#jCode').value = code;
  if (code) {
    const r = await api({ action: 'lookup', code });
    if (!r.error) { wedding = r.wedding; $('#codeRow').classList.add('hidden'); }
  }
  $('#jTitle').textContent = wedding ? `💍 ${wedding.title}` : `💍 ${t(lang, 'join_title')}`;
  $('#jCouple').textContent = wedding ? t(lang, 'join_title') : '';
  const sides = wedding?.sides || [{ id: 'a', name: '…', color: '#e2355c' }, { id: 'b', name: '…', color: '#2f6bdf' }];
  joinSide = joinSide || sides[0].id;
  $('#jSides').innerHTML = sides.map((s) => `<button type="button" data-side="${s.id}" style="--c:${esc(s.color)}" class="${s.id === joinSide ? 'sel' : ''}">${esc(s.name)}</button>`).join('');
  $('#jAvatars').innerHTML = AVATARS.map((a) => `<button type="button" data-av="${a}" class="${a === joinAvatar ? 'sel' : ''}">${a}</button>`).join('');
  langOptions($('#jLang'));
}

async function doJoin() {
  $('#jErr').textContent = '';
  const name = $('#jName').value.trim(); if (!name) { $('#jErr').textContent = t(lang, 'your_name'); $('#jName').focus(); return; }
  const c = ($('#jCode').value || code).toUpperCase().trim();
  const r = await api({ action: 'join', code: c, name, side: joinSide, avatar: joinAvatar, color: COLORS[Math.floor(Math.random() * COLORS.length)], groupSize: $('#jGroup').checked ? Number($('#jGroupSize').value) : 1 });
  if (r.error) { $('#jErr').textContent = r.error === 'offline' ? t(lang, 'offline') : r.error; return; }
  saveCreds(c, r); store.set('pdw_show_code', true);
  startPlay(r.wedding, r.guest);
}

async function doResume() {
  $('#rErr').textContent = '';
  const c = ($('#jCode').value || code).toUpperCase().trim();
  const r = await api({ action: 'resume', code: c, guestCode: $('#rCode').value.trim() });
  if (r.error) { $('#rErr').textContent = r.error; return; }
  saveCreds(c, r);
  startPlay(r.wedding, r.guest);
}

function saveCreds(c, r) {
  creds = { code: c, w: r.wedding.id, gid: r.guest.id, secret: r.secret, guestCode: r.guestCode };
  store.set('pdw_guest_' + c, creds); store.set('pdw_last_code', c);
}

// ---------------------------------------------------------------- play
function startPlay(w, g) {
  wedding = w; me = { guest: g, points: 0, rank: null, sides: {} };
  $('#vJoin').classList.add('hidden'); $('#vPlay').classList.remove('hidden');
  if (store.get('pdw_show_code')) { $('#gCodeCard').classList.remove('hidden'); $('#gCode').textContent = creds.guestCode; store.del('pdw_show_code'); }
  renderMe();
  queue = answerQueue(creds, (item, r) => {
    if (item.key && r?.error) gameRejected(item, r, live);
    else if (r && r.ok === false && r.reason === 'late') toast(t(lang, 'too_slow'));
    updateOffline();
  });
  follower = followLive(w.id, (l, prev, clock) => { now = clock; live = l; renderBrand(l); renderStage(l, prev); });
  refreshMe();
  setInterval(() => api({ action: 'ping', w: creds.w, gid: creds.gid, secret: creds.secret }), 45000 + Math.random() * 10000);
  api({ action: 'ping', w: creds.w, gid: creds.gid, secret: creds.secret });
  setInterval(updateOffline, 1000); requestAnimationFrame(tick);
}

async function refreshMe() {
  const r = await api({ action: 'me', w: creds.w, gid: creds.gid, secret: creds.secret });
  if (r.error) { if (r.code === 'bad_guest') { store.del('pdw_guest_' + creds.code); location.reload(); } return; }
  me = r; wedding = r.wedding; renderMe();
}

function sideOf(id) { return wedding?.sides?.find((s) => s.id === id) || { name: '', color: '#555' }; }
// DJ/MC Pro weddings show the DJ's name and logo under the game.
function renderBrand(l) {
  const b = l.brand; const el = $('#gBrand'); const key = b ? `${b.name}|${b.logo}` : '';
  if (el.dataset.key === key) return; el.dataset.key = key;
  el.classList.toggle('hidden', !b || (!b.name && !b.logo));
  el.innerHTML = b ? `${b.logo ? `<img src="${esc(b.logo)}" alt="" />` : ''}${esc(b.name || '')}` : '';
}

function renderMe() {
  const g = me.guest; const s = sideOf(g.side);
  $('#gMe').innerHTML = `<span class="avatar" style="--c:${esc(g.color)}">${esc(g.avatar)}</span><span>${esc(g.name)}${g.group > 1 ? ` <small class="muted">×${g.group}</small>` : ''}</span>`;
  $('#gScore').innerHTML = `<b>${(me.points || 0).toLocaleString()}</b>${t(lang, 'points')}${me.rank ? ` · ${t(lang, 'rank')} #${me.rank}` : ''}`;
  $('#gSide').textContent = s.name; $('#gSide').style.setProperty('--c', s.color);
  langOptions($('#gLang'));
}

function textPair(item) {
  const main = itemText(item, lang);
  const bilingual = live?.secondLang && live.secondLang !== lang ? itemText(item, lang === live.lang ? live.secondLang : live.lang) : '';
  return `<div class="q" dir="auto">${esc(main)}</div>${bilingual && bilingual !== main ? `<div class="q2" dir="auto">${esc(bilingual)}</div>` : ''}`;
}
function optPair(item, i) {
  const main = optionText(item, i, lang);
  const other = live?.secondLang ? optionText(item, i, lang === live.lang ? live.secondLang : live.lang) : '';
  return `<span dir="auto">${esc(main)}</span>${other && other !== main ? `<small dir="auto">${esc(other)}</small>` : ''}`;
}

let lastView = '';
function renderStage(l, prev) {
  if (isGameStage(l)) { lastView = ''; renderGameGuest($('#gStage'), l, prev, { lang, creds, queue, toast, refreshMe }); return; }
  delete document.body.dataset.game;
  const el = $('#gStage'); const it = l.item; const key = `${l.eventId}:${l.index}`;
  const mine = picked[key] ?? queue?.has(l.eventId, l.index)?.choice;
  // Answer buttons must not be rebuilt under a finger: only redraw when what this guest sees changes.
  const interactive = ['question', 'vote', 'prompt', 'intro', 'idle'].includes(l.stage);
  const view = `${l.stage}|${key}|${mine}|${lang}|${interactive ? '' : l.v}`;
  if (view === lastView && prev) return;
  lastView = view;
  const sidesHtml = (sides) => `<div class="sides-bars">${(wedding.sides || []).map((s) => { const v = sides?.[s.id] || 0; const max = Math.max(1, ...Object.values(sides || {})); return `<div class="sbar"><span class="nm">${esc(s.name)}</span><span class="track"><span class="fill" style="--c:${esc(s.color)};width:${(v / max) * 100}%"></span></span><span class="v">${v.toLocaleString()}</span></div>`; }).join('')}</div>`;
  switch (l.stage) {
    case 'intro': el.innerHTML = `<div class="muted">${t(lang, 'now_playing')}</div><h2>${esc(l.eventName || '')}</h2><p>${t(lang, 'waiting')}</p>`; break;
    case 'question': case 'vote': {
      const n = it.options.length; const scored = l.stage === 'question';
      const head = it.kind === 'emoji' ? `<div class="muted">${t(lang, 'guess_song')}</div><div class="emoji-clue" dir="ltr">${esc(it.emoji || '')}</div>` : it.kind === 'shoe' ? `<div class="muted">👠 ${t(lang, 'shoe_title')}</div>` : l.stage === 'vote' ? `<div class="muted">🗳️ ${t(lang, 'vote_title')}</div>` : '';
      el.innerHTML = `${head}${textPair(it)}<div class="timerbar"><i id="tb"></i></div>
        <div class="opts ${n === 2 ? 'two' : ''}">${it.options.map((o, i) => `<button class="opt o${i} ${mine === i ? 'picked' : ''}" data-choice="${i}" ${mine !== undefined ? 'disabled' : ''}>${optPair(it, i)}</button>`).join('')}</div>
        ${mine !== undefined ? `<div class="banner info">${scored ? t(lang, 'locked') : t(lang, 'voted')}</div>` : ''}`;
      break;
    }
    case 'prompt':
      el.innerHTML = `<div class="muted">💌 ${t(lang, 'prompt_title')}</div>${textPair(it)}<button class="btn btn-gold btn-block" id="promptWrite">${t(lang, 'write_note')}</button>`;
      noteKind = it.noteKind || 'wish';
      break;
    case 'reveal': case 'voteResult': {
      const r = l.reveal; const total = Math.max(1, r.counts.reduce((a, b) => a + b, 0));
      const win = l.stage === 'voteResult' ? r.winners : [r.correct];
      let banner = '';
      if (l.stage === 'reveal') banner = r.split ? `<div class="banner info">🤷 ${t(lang, 'split')}</div>` : mine === undefined ? `<div class="banner info">⏰ ${t(lang, 'too_slow')}</div>` : mine === r.correct ? `<div class="banner good">✅ ${t(lang, 'correct')}</div>` : `<div class="banner bad">${t(lang, 'wrong')} <b>${esc(optionText(it, r.correct, lang))}</b></div>`;
      el.innerHTML = `${textPair(it)}<div class="opts ${it.options.length === 2 ? 'two' : ''}">${it.options.map((o, i) => `<div class="opt o${i} ${win.includes(i) ? 'correct' : 'dim'}"><span class="cnt">${r.counts[i]}</span>${optPair(it, i)}<i class="bar" style="width:${(r.counts[i] / total) * 100}%"></i></div>`).join('')}</div>${banner}`;
      if (!prev || prev.stage !== l.stage) setTimeout(refreshMe, 400 + Math.random() * 2500); // jitter: 500 phones don't all ask at once
      break;
    }
    case 'board': el.innerHTML = `<h2>🏆 ${t(lang, 'leaderboard')}</h2>${lbHtml(l.board?.top || [])}<h2>${t(lang, 'sides_score')}</h2>${sidesHtml(l.board?.sides)}`; break;
    case 'finale': {
      const winners = (l.finale?.winners || []).map((id) => sideOf(id));
      el.innerHTML = `<div class="muted">${t(lang, 'finale')}</div>${winners.map((s) => `<div class="side-chip" style="--c:${esc(s.color)};font-size:22px;padding:10px 18px;margin:8px">🏆 ${esc(s.name)}</div>`).join('')}${sidesHtml(l.finale?.sides)}<p>${t(lang, 'thanks')}</p>`;
      if (!prev || prev.stage !== 'finale') setTimeout(refreshMe, Math.random() * 2000);
      break;
    }
    default: el.innerHTML = `<div style="font-size:48px">💐</div><p>${t(lang, 'waiting')}</p>`;
  }
}
function lbHtml(top) {
  return `<div class="lb">${top.slice(0, 5).map((r, i) => `<div class="row ${r.id === creds.gid ? 'me' : ''}"><span class="r">${i + 1}</span><span class="avatar" style="--c:${esc(r.color)}">${esc(r.avatar)}</span><span class="n">${esc(r.name)}</span><b>${r.pts.toLocaleString()}</b></div>`).join('')}</div>`;
}

function tick() {
  const bar = $('#tb');
  if (bar && live?.deadline && live.durationMs) bar.style.width = Math.max(0, Math.min(100, ((live.deadline - now()) / live.durationMs) * 100)) + '%';
  requestAnimationFrame(tick);
}

function updateOffline() {
  const n = queue?.pending() || 0; const bar = $('#offlineBar');
  bar.classList.toggle('hidden', navigator.onLine && !n);
  bar.textContent = !navigator.onLine || n ? t(lang, 'offline') : '';
}

function renderKinds() {
  $('#noteKinds').innerHTML = ['wish', 'advice', 'prediction', 'toast'].map((k) => `<button type="button" data-kind="${k}" class="${k === noteKind ? 'sel' : ''}">${t(lang, 'kind_' + k)}</button>`).join('');
}
function openNote() { renderKinds(); $('#noteSheet').classList.remove('hidden'); setTimeout(() => $('#noteText').focus(), 150); }

// ---------------------------------------------------------------- events
$('#jSides').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (!b) return; joinSide = b.dataset.side; $$('#jSides button').forEach((x) => x.classList.toggle('sel', x === b)); });
$('#jAvatars').addEventListener('click', (e) => { const b = e.target.closest('[data-av]'); if (!b) return; joinAvatar = b.dataset.av; $$('#jAvatars button').forEach((x) => x.classList.toggle('sel', x === b)); });
$('#jGroup').addEventListener('change', (e) => $('#jGroupRow').classList.toggle('hidden', !e.target.checked));
$('#jGo').addEventListener('click', doJoin);
$('#rGo').addEventListener('click', doResume);
$('#jCode').addEventListener('change', async (e) => { const r = await api({ action: 'lookup', code: e.target.value }); if (!r.error) { wedding = r.wedding; showJoin(); } });
for (const id of ['#jLang', '#gLang']) $(id).addEventListener('change', (e) => { applyLang(e.target.value); if (me) renderMe(); });
$('#gStage').addEventListener('click', (e) => {
  if (e.target.closest('#promptWrite')) { openNote(); return; }
  const b = e.target.closest('[data-choice]'); if (!b || b.disabled || !live) return;
  const choice = Number(b.dataset.choice);
  picked[`${live.eventId}:${live.index}`] = choice;
  queue.push({ eventId: live.eventId, index: live.index, choice });
  navigator.vibrate?.(25);
  renderStage(live, live);
});
$('#gWish').addEventListener('click', openNote);
$('#noteKinds').addEventListener('click', (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; noteKind = b.dataset.kind; renderKinds(); });
$('#noteForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = $('#noteText').value.trim(); if (!text) return;
  const r = await api({ action: 'note', w: creds.w, gid: creds.gid, secret: creds.secret, eventId: live?.eventId || null, kind: noteKind, text });
  if (r.error) { toast(r.error === 'offline' ? t(lang, 'offline') : r.error); return; }
  $('#noteText').value = ''; $('#noteSheet').classList.add('hidden');
  toast(r.note.status === 'approved' ? t(lang, 'note_sent') : t(lang, 'note_pending'), 3500);
});
$$('[data-close]').forEach((b) => b.addEventListener('click', () => b.closest('.sheet').classList.add('hidden')));
addEventListener('online', updateOffline); addEventListener('offline', updateOffline);

// ---------------------------------------------------------------- boot
(async () => {
  applyLang(lang);
  const saved = code && store.get('pdw_guest_' + code);
  if (saved) {
    creds = saved;
    const r = await api({ action: 'me', w: creds.w, gid: creds.gid, secret: creds.secret });
    if (!r.error) { startPlay(r.wedding, r.guest); me = r; renderMe(); return; }
    if (r.error === 'offline') { startPlay({ id: creds.w, sides: [], languages: ['en'] }, { id: creds.gid, name: '', avatar: '🙂', side: 'a' }); return; }
    store.del('pdw_guest_' + code);
  }
  showJoin();
})();
