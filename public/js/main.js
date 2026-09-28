// PartyDeck game client entry point.
import { $, $$, esc, rand, uid, clean, store, toast, params, avatarHTML, AVATARS, COLORS, REACTIONS, inviteUrl, pageUrl } from './util.js';
import { SITE } from './site-config.js';
import { THEMES, namesText, KINDS } from './themes.js';
import { RULES, RANKS, SUITS } from './kings.js';
import { rankPlayers } from './quiz-core.js';
import { Sound } from './sound.js';
import { confetti } from './confetti.js';
import { Client } from './client.js';
import { Host, makeConfig } from './host.js';
import { createDeckUI } from './ui-deck.js';
import { createQuizUI } from './ui-quiz.js';
import { createSetup } from './setup.js';
import { buildKeepsake } from './pdf.js';
import { captureAttribution, trackPageview } from './attribution.js';
import * as api from './api.js';

captureAttribution();
trackPageview();

// ------------------------------------------------------------------ profile
const profile = Object.assign({ id: uid(), name: '', avatar: rand(AVATARS), color: rand(COLORS) }, store.get('kc_profile', {}));
store.set('kc_profile', profile);
Client.profile = profile;
window.__pdHost = Host; // lets the E2E suite read the host's secret answers
const me = () => profile.id;

// ------------------------------------------------------------------ screens
let currentScreen = null;
function show(name) {
  if (currentScreen === name) return;
  currentScreen = name;
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + name));
  scrollTo(0, 0);
}
const overlay = (text) => { $('#overlayText').textContent = text; $('#overlay').classList.remove('hidden'); };
const hideOverlay = () => $('#overlay').classList.add('hidden');

function floatReaction(emoji, p) {
  const el = document.createElement('div');
  el.className = 'float-react';
  el.style.left = 10 + Math.random() * 75 + '%';
  el.style.setProperty('--rot', (Math.random() * 40 - 20) + 'deg');
  el.innerHTML = `${esc(emoji)}${p ? `<small>${esc(p.id === me() ? 'You' : p.name)}</small>` : ''}`;
  $('#reactions').appendChild(el);
  Sound.pop();
  setTimeout(() => el.remove(), 2700);
}

const deckUI = createDeckUI({ me, floatReaction });
const quizUI = createQuizUI({ me, send: (m) => Client.send(m) });

// ------------------------------------------------------------------ age gate
let ageResolve = null;
function requireAge() {
  if (store.get('pd_age19')) return Promise.resolve(true);
  $('#ageSheet').classList.remove('hidden');
  return new Promise((res) => { ageResolve = res; });
}

// ------------------------------------------------------------------ setup
const setupUI = createSetup({
  requireAge,
  async onOpenRoom(setup, plan, limits, eventId) {
    const config = await makeConfig(setup, plan, limits, eventId);
    if (await Client.host({ config })) {
      api.eventAction('room', { code: Client.code });
    }
  },
});
Host.hooks.played = (s) => { if (s.eventId) api.eventAction('played', { players: s.players.length }); };
Host.hooks.predictions = (entries) => { api.eventAction('predictions', { entries }); };

// ------------------------------------------------------------------ render
let overTimer = null;
const UI = {
  render(s, prev) {
    window.__pdState = s;
    const inRoom = s.players.some((p) => p.id === me());
    if (!inRoom && Client.role === 'guest') return;
    const isHost = s.hostId === me();
    document.body.classList.toggle('is-host', isHost);
    document.body.dataset.theme = s.theme;
    document.body.classList.toggle('mode-kings', s.theme === 'kings-cup');
    document.body.classList.toggle('mode-themed', s.theme !== 'kings-cup');
    document.body.classList.toggle('mode-quiz', s.mode === 'quiz');
    document.body.classList.toggle('mode-deck', s.mode === 'deck');
    document.body.classList.toggle('has-keepsake', !!THEMES[s.theme]?.keepsake);
    if (!isHost && THEMES[s.theme]?.ageGate && !store.get('pd_age19') && !this.askedAge) {
      this.askedAge = true;
      requireAge().then((ok) => { if (!ok) Client.leave(); });
    }
    if (s.phase === 'lobby') { clearTimeout(overTimer); overTimer = null; renderLobby(s); show('lobby'); }
    else if (s.phase === 'playing') {
      clearTimeout(overTimer); overTimer = null;
      if (prev && prev.phase !== 'playing') { deckUI.reset(); quizUI.reset(); toast('Let the games begin! 🎉'); }
      if (s.mode === 'quiz') { quizUI.render(s, prev); show('quiz'); } else { deckUI.render(s, prev); show('game'); }
      requestWakeLock();
    } else if (s.phase === 'over') {
      if (s.mode === 'deck') deckUI.render(s, prev);
      renderOver(s);
      const justEnded = prev && prev.phase === 'playing';
      const celebrate = () => { show('over'); confetti(200, ['🎉', '🏆', THEMES[s.theme]?.emoji || '⭐']); Sound.fanfare(); };
      if (justEnded) { clearTimeout(overTimer); overTimer = setTimeout(celebrate, s.mode === 'deck' ? 3600 : 600); }
      else if (!overTimer) show('over');
    }
    renderMenu(s);
  },
  message(m) {
    const s = Client.state;
    switch (m.t) {
      case 'react': floatReaction(m.emoji, s?.players.find((p) => p.id === m.from)); break;
      case 'event': toast(m.text); break;
      case 'error': toast(m.msg); break;
      case 'joined': if (m.id !== me()) Sound.join(); break;
      case 'welcome': if (m.keepsake) myNote = m.keepsake; break;
      case 'keepsakeSaved': myNote = m.entry; toast('💌 Note saved for the keepsake!'); break;
      default: break;
    }
  },
  reset() { deckUI.reset(); quizUI.reset(); show('home'); releaseWakeLock(); },
  overlay, hideOverlay,
};
Client.ui = UI;

function renderLobby(s) {
  const th = THEMES[s.theme];
  $('#lobbyCode').textContent = s.code;
  $('#lobbyTheme').innerHTML = `${th.emoji} ${esc(th.name)} · ${s.mode === 'quiz' ? 'Quiz' : 'Card deck'}${th.honoree ? ` · for <b>${esc(namesText(s.honoree, s.theme))}</b>` : ''}`;
  const seats = s.players.filter((p) => !(s.mode === 'quiz' && p.id === s.hostId)).length;
  $('#lobbyCount').textContent = seats;
  $('#lobbyCap').textContent = `/ ${s.maxPlayers}${s.plan === 'free' ? ' (free)' : ''}`;
  $('#gentleToggle').checked = !!s.gentle;
  $('#gentleRow').classList.toggle('hidden', s.theme !== 'kings-cup');
  const grid = $('#lobbyPlayers');
  grid.innerHTML = s.players.map((p) => `
    <div class="player-tile ${p.id === me() ? 'me' : ''} ${p.online ? '' : 'offline'}" data-id="${esc(p.id)}">
      ${p.id === s.hostId ? `<span class="tag" title="Host">${s.mode === 'quiz' ? '🎤' : '👑'}</span>` : ''}${s.keepsakeBy?.includes(p.id) ? '<span class="tag left" title="Left a note">💌</span>' : ''}
      ${avatarHTML(p)}<span class="pname">${esc(p.name)}${p.id === me() ? ' (you)' : ''}</span>
    </div>`).join('');
  const seen = UI.lobbySeen || (UI.lobbySeen = new Set());
  $$('.player-tile', grid).forEach((t) => { if (seen.has(t.dataset.id)) t.style.animation = 'none'; seen.add(t.dataset.id); });
  const guests = s.players.filter((p) => p.id !== s.hostId).length;
  const btn = $('#btnStart');
  btn.textContent = s.mode === 'quiz'
    ? (guests ? `🏆 Start the quiz (${guests} player${guests === 1 ? '' : 's'})` : '🏆 Waiting for players…')
    : (s.players.length < 2 ? '🃏 Start solo (or wait for friends)' : `🃏 Start with ${s.players.length} players`);
  btn.disabled = s.mode === 'quiz' && !guests;
  const up = $('#btnLobbyUpgrade');
  up.classList.toggle('hidden', s.plan !== 'free' || !s.eventId || s.theme === 'kings-cup');
  up.textContent = `⭐ ${SITE.pricing.passLabel}: up to ${SITE.limits.pass.maxPlayers} players, no watermark — US$${(SITE.pricing.passPriceCents / 100).toFixed(2)}`;
  $('#ksNames').textContent = namesText(s.honoree, s.theme);
}

function renderOver(s) {
  const byId = (id) => s.players.find((p) => p.id === id);
  const th = THEMES[s.theme];
  $('#podium').innerHTML = ''; $('#overHero').innerHTML = ''; $('#overStats').innerHTML = '';
  if (s.mode === 'quiz') {
    const board = rankPlayers(s.quiz?.scores || {}, s.players.filter((p) => p.id !== s.hostId));
    $('#overTrophy').textContent = '🏆';
    $('#overTitle').textContent = board[0] && board[0].score > 0 ? `${board[0].name} knows ${namesText(s.honoree, s.theme)} best!` : 'Quiz complete!';
    $('#overSub').textContent = board.length ? 'Final scores' : '';
    const top = [board[1], board[0], board[2]];
    $('#podium').innerHTML = top.map((r, i) => (r ? `<div class="pod p${[2, 1, 3][i]}">${avatarHTML(r)}<b>${esc(r.name)}</b><span>${r.score.toLocaleString()}</span><div class="step">${[2, 1, 3][i]}</div></div>` : '<div class="pod empty"></div>')).join('');
    $('#overStats').innerHTML = board.slice(3).map((r) => `<div class="stat"><span class="rank">#${r.rank}</span>${avatarHTML(r)}<div><b>${esc(r.name)}</b><small>${r.score.toLocaleString()} pts</small></div></div>`).join('');
  } else if (s.theme === 'kings-cup') {
    const hero = byId(s.endedBy);
    $('#overTrophy').textContent = '👑';
    $('#overTitle').textContent = s.endReason === 'king' ? 'The 4th King!' : s.endReason === 'deck' ? 'Deck cleared!' : 'Game over!';
    $('#overSub').textContent = s.endReason === 'king' ? (s.gentle ? 'The legend who drew it finishes the King\'s Cup!' : 'Bottoms up — they drink the King\'s Cup!') : 'What a game!';
    $('#overHero').innerHTML = hero ? `${avatarHTML(hero)}<span>${esc(hero.name)}${hero.id === me() ? ' (you!)' : ''}</span>` : '';
    $('#overStats').innerHTML = s.players.map((p) => { const st = s.stats[p.id] || { draws: 0, kings: 0 }; return `<div class="stat">${avatarHTML(p)}<div><b>${esc(p.name)}</b><small>${st.draws} cards · ${st.kings} 👑</small></div></div>`; }).join('');
  } else {
    $('#overTrophy').textContent = th.emoji;
    $('#overTitle').textContent = s.endReason === 'deck' ? 'Every card played!' : 'That\'s a wrap!';
    $('#overSub').textContent = `Thanks for celebrating ${namesText(s.honoree, s.theme)}!`;
    $('#overStats').innerHTML = s.players.map((p) => { const st = s.stats[p.id] || { draws: 0 }; return `<div class="stat">${avatarHTML(p)}<div><b>${esc(p.name)}</b><small>${st.draws} cards</small></div></div>`; }).join('');
  }
  // Keepsake (host)
  const ks = Host.keepsakeEntries ? Host.keepsakeEntries() : [];
  $('#keepsakePanel').classList.toggle('hidden', !th.keepsake);
  $('#keepsakeCount').textContent = ks.length;
  $('#keepsakeHint').textContent = ks.length
    ? `${ks.length} note${ks.length === 1 ? '' : 's'} from your guests, ready to print for ${namesText(s.honoree, s.theme)}.${s.watermark ? ` Free parties include a small ${SITE.brand.name} watermark.` : ''}`
    : 'No notes yet — guests can tap "Leave a note" any time before you close the room.';
  $('#btnKeepsake').disabled = !ks.length;
  $('#btnOverUpgrade').classList.toggle('hidden', !s.watermark || !s.eventId || !ks.length);
  // Predictions (host, baby shower)
  const preds = Host.predictionEntries ? Host.predictionEntries() : [];
  $('#predictPanel').innerHTML = preds.length && s.eventId
    ? `<div class="label">🔮 ${preds.length} baby predictions saved</div><p class="hint">After the birth, enter the real details and we'll crown the closest guesser.</p><a class="btn btn-ghost btn-block" href="/results?event=${encodeURIComponent(s.eventId)}">Score predictions later →</a>`
    : '';
  // Referral loop for guests
  const ref = new URL('/', location.origin);
  ref.searchParams.set('utm_source', 'partydeck'); ref.searchParams.set('utm_medium', 'referral'); ref.searchParams.set('utm_campaign', 'endscreen-' + s.theme);
  $('#referralLink').href = ref.toString();
}

function renderMenu(s) {
  $('#mGentle').textContent = `🌸 Gentle mode: ${s.gentle ? 'on' : 'off'}`;
  $('#mSkip').disabled = s.phase !== 'playing';
  $('#mEnd').disabled = s.phase !== 'playing';
  $('#mPlayers').innerHTML = s.players.map((p) => `
    <div class="row">${avatarHTML(p)}<span>${esc(p.name)}${p.online ? '' : ' <small>(offline)</small>'}</span>
    ${p.id === s.hostId ? '<small>host</small>' : `<button data-kick="${esc(p.id)}">Remove</button>`}</div>`).join('');
}

function renderRulesSheet() {
  const s = Client.state; const theme = s?.theme || setupUI.setup.theme; const mode = s?.mode || setupUI.setup.mode;
  if (theme === 'kings-cup') {
    $('#rulesIntro').textContent = 'One person hosts and shares the room code. Everyone joins on their own phone. When it\'s your turn, tap the deck — the card pops up on every screen.';
    $('#rulesList').innerHTML = RANKS.map((r) => `<li><span class="r">${r}</span><div><b>${RULES[r].emoji} ${RULES[r].name}</b><small>${RULES[r].desc}</small></div></li>`).join('');
  } else if (mode === 'quiz') {
    $('#rulesIntro').textContent = 'The host\'s screen shows each question. Answer on your phone within 20 seconds.';
    $('#rulesList').innerHTML = [['✅', 'Correct answers score 500 points', '…plus up to 500 more for answering fast.'], ['🏆', 'Live leaderboard', 'Shown after every question. Highest score at the end wins.'], ['🗣️', 'Who said it?', 'Two choices — pick who said the quote.'], ['🔮', 'Predictions', 'Baby showers can end with guesses about the big day, scored after the birth.'], ['💌', 'Keepsake', 'Leave a note for the guest(s) of honour — it becomes a printable keepsake.']]
      .map(([e, b, sm]) => `<li><span class="r">${e}</span><div><b>${b}</b><small>${sm}</small></div></li>`).join('');
  } else {
    $('#rulesIntro').textContent = 'Take turns tapping the deck. Read your card out loud and do what it says!';
    $('#rulesList').innerHTML = Object.values(KINDS).map((k) => `<li><span class="r">${k.emoji}</span><div><b>${k.label}</b></div></li>`).join('') + '<li><span class="r">💌</span><div><b>Keepsake</b><small>Leave a note for the guest(s) of honour — it becomes a printable keepsake.</small></div></li>';
  }
}

// ------------------------------------------------------------------ keepsake
let myNote = null; let noteKind = 'advice';
function openKeepsake() {
  const s = Client.state; if (!s) return;
  $('#ksNames').textContent = namesText(s.honoree, s.theme);
  noteKind = myNote?.kind || 'advice';
  $$('#ksKind button').forEach((b) => b.classList.toggle('sel', b.dataset.kind === noteKind));
  $('#ksText').value = myNote?.text || '';
  $('#ksChars').textContent = $('#ksText').value.length;
  $('#keepsakeSheet').classList.remove('hidden');
  setTimeout(() => $('#ksText').focus(), 200);
}

function downloadKeepsake() {
  const s = Client.state; if (!s) return;
  const paper = $('#paperSeg .sel')?.dataset.paper || 'letter';
  const entries = Host.keepsakeEntries();
  const date = new Date(s.honoree?.date || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  const bytes = buildKeepsake(entries, { names: namesText(s.honoree, s.theme), theme: s.theme, themeName: THEMES[s.theme].name, date, paper, watermark: s.watermark, brand: SITE.brand.name, site: SITE.brand.siteUrl });
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${clean(namesText(s.honoree, s.theme), 40).replace(/[^\w-]+/g, '-')}-keepsake-${paper}.pdf`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ------------------------------------------------------------------ profile UI
let pendingAction = null;
function openProfile(action) {
  pendingAction = action;
  $('#profileTitle').textContent = action.type === 'host' ? 'You\'re the host!' : `Joining ${action.code}`;
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
  if (a.type === 'host') { show('setup'); await setupUI.open(a); }
  else if (!(await Client.join(a.code))) show('home');
}

// ------------------------------------------------------------------ wake lock
let wakeLock = null;
async function requestWakeLock() {
  if (wakeLock || !('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } catch { /* not allowed */ }
}
function releaseWakeLock() { try { wakeLock?.release(); } catch { /* ignore */ } wakeLock = null; }
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (Client.state?.phase === 'playing') requestWakeLock();
  // Picked up a Party Pass in another tab (e.g. /redeem)? Apply it to the open room.
  if (Client.role === 'host' && Client.state?.plan === 'free' && Client.state.eventId) {
    const ev = await api.refreshEvent();
    if (ev?.plan === 'pass') { Host.applyPlan({ plan: ev.plan, maxPlayers: ev.limits.maxPlayers, watermark: ev.limits.watermark }); toast(`🎉 ${SITE.pricing.passLabel} active!`); }
  }
});

async function buyPass(btn) {
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Opening secure checkout…';
  const r = await api.startCheckout();
  if (r.url) { location.href = r.url; return; } // the room re-opens automatically when you come back
  btn.disabled = false; btn.textContent = label;
  if (r.alreadyPaid) { const ev = await api.refreshEvent(); if (ev) Host.applyPlan({ plan: ev.plan, maxPlayers: ev.limits.maxPlayers, watermark: ev.limits.watermark }); return; }
  toast(r.error || 'Checkout is unavailable right now.', 4000);
}

async function share() {
  if (!Client.code) return;
  const url = inviteUrl(Client.code);
  const text = `Join our party game on ${SITE.brand.name}! Room code: ${Client.code}`;
  try { if (navigator.share) { await navigator.share({ title: SITE.brand.name, text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied! 📋'); } catch { prompt('Copy this invite link:', url); }
}

// ------------------------------------------------------------------ bindings
function bind() {
  $('#bgSuits').innerHTML = Array.from({ length: 14 }, (_, i) => `<span style="left:${(i * 7.3) % 100}%;animation-duration:${14 + (i % 5) * 4}s;animation-delay:-${i * 2.1}s;font-size:${22 + (i % 4) * 10}px">${['♠', '♥', '♦', '♣', '🎈', '⭐', '🎉'][i % 7]}</span>`).join('');
  $('[data-tagline]').textContent = SITE.brand.tagline;
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

  setupUI.bind();

  // lobby
  $('#btnStart').onclick = () => Client.send({ t: 'start' });
  $('#gentleToggle').onchange = (e) => Client.send({ t: 'gentle', on: e.target.checked });
  $('#btnLeaveLobby').onclick = () => { if (confirm(Client.role === 'host' ? 'Close this room for everyone?' : 'Leave this room?')) Client.leave(); };
  $('#btnShare').onclick = share;
  $('#btnQR').onclick = () => {
    const box = $('#qrBox'); box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) {
      $('#qr').innerHTML = '';
      if (window.QRCode) new window.QRCode($('#qr'), { text: inviteUrl(Client.code), width: 180, height: 180, colorDark: '#1a0b3d', colorLight: '#ffffff' });
      else $('#qr').textContent = inviteUrl(Client.code);
    }
  };

  // deck game
  $('#deck').onclick = () => {
    const deck = $('#deck'); if (deck.disabled) return;
    deck.disabled = true; Client.send({ t: 'draw' });
    setTimeout(() => { const s = Client.state; if (s && s.phase === 'playing' && s.players[s.turn]?.id === me()) deck.disabled = false; }, 3000);
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
  for (const id of ['#reactBar', '#reactBar2']) {
    $(id).innerHTML = REACTIONS.map((r) => `<button data-react="${r}" aria-label="React ${r}">${r}</button>`).join('');
    $(id).onclick = (e) => { const b = e.target.closest('[data-react]'); if (b) Client.send({ t: 'react', emoji: b.dataset.react }); };
  }
  quizUI.bind();

  // keepsake
  document.addEventListener('click', (e) => { if (e.target.closest('[data-keepsake]')) openKeepsake(); });
  $('#ksKind').onclick = (e) => { const b = e.target.closest('[data-kind]'); if (!b) return; noteKind = b.dataset.kind; $$('#ksKind button').forEach((x) => x.classList.toggle('sel', x === b)); };
  $('#ksText').oninput = (e) => { $('#ksChars').textContent = e.target.value.length; };
  $('#keepsakeForm').onsubmit = (e) => {
    e.preventDefault();
    const text = clean($('#ksText').value, 300); if (!text) { $('#ksText').focus(); return; }
    Client.send({ t: 'keepsake', kind: noteKind, text });
    $('#keepsakeSheet').classList.add('hidden');
  };
  $('#paperSeg').onclick = (e) => { const b = e.target.closest('[data-paper]'); if (!b) return; $$('#paperSeg button').forEach((x) => x.classList.toggle('sel', x === b)); };
  $('#btnKeepsake').onclick = downloadKeepsake;
  $('#btnLobbyUpgrade').onclick = (e) => buyPass(e.currentTarget);
  $('#btnOverUpgrade').onclick = (e) => buyPass(e.currentTarget);

  // over
  $('#btnPlayAgain').onclick = () => Client.send({ t: 'restart' });
  $('#btnBackToLobby').onclick = () => Client.send({ t: 'lobby' });
  $('#btnOverLeave').onclick = () => Client.leave();

  // menu
  const menu = $('#menuSheet');
  $$('[data-menu]').forEach((b) => { b.onclick = () => menu.classList.remove('hidden'); });
  $('#mClose').onclick = () => menu.classList.add('hidden');
  menu.onclick = (e) => { if (e.target === menu) menu.classList.add('hidden'); };
  const soundLabel = () => { $('#mSound').textContent = `${Sound.on ? '🔊' : '🔇'} Sound: ${Sound.on ? 'on' : 'off'}`; };
  soundLabel();
  $('#mSound').onclick = () => { Sound.on = !Sound.on; store.set('kc_sound', Sound.on); soundLabel(); Sound.pop(); };
  $('#mShare').onclick = share;
  $('#mSkip').onclick = () => { Client.send({ t: 'skip' }); menu.classList.add('hidden'); };
  $('#mGentle').onclick = () => Client.send({ t: 'gentle', on: !Client.state?.gentle });
  $('#mRestart').onclick = () => { if (confirm('Restart the game for everyone?')) { Client.send({ t: 'restart' }); menu.classList.add('hidden'); } };
  $('#mEnd').onclick = () => { if (confirm('End the game now and go to the results?')) { Client.send({ t: 'end' }); menu.classList.add('hidden'); } };
  $('#mPlayers').onclick = (e) => { const b = e.target.closest('[data-kick]'); if (b && confirm('Remove this player?')) Client.send({ t: 'kick', id: b.dataset.kick }); };
  $('#mLeave').onclick = () => { if (confirm(Client.role === 'host' ? 'You are the host — leaving ends the game for everyone. Leave?' : 'Leave the game?')) { menu.classList.add('hidden'); Client.leave(); } };
  $('#mRules').onclick = () => { menu.classList.add('hidden'); renderRulesSheet(); $('#rulesSheet').classList.remove('hidden'); };
  $$('.sheet').forEach((sh) => sh.addEventListener('click', (e) => { if ((e.target === sh && sh.id !== 'ageSheet') || e.target.closest('[data-close]')) sh.classList.add('hidden'); }));

  // age gate
  $('#ageYes').onclick = () => { store.set('pd_age19', true); $('#ageSheet').classList.add('hidden'); ageResolve?.(true); ageResolve = null; };
  $('#ageNo').onclick = () => { $('#ageSheet').classList.add('hidden'); ageResolve?.(false); ageResolve = null; };

  $('#overlayCancel').onclick = () => { hideOverlay(); Client.leave(); };
  addEventListener('pointerdown', () => Sound.ac(), { once: true });
}

// ------------------------------------------------------------------ boot
async function boot() {
  bind();
  const roomParam = clean(params.get('room'), 5).toUpperCase().replace(/[^A-Z]/g, '');
  const paid = params.get('paid');
  const session = store.get('kc_session');
  const fresh = session && Date.now() - session.at < 6 * 3600 * 1000;

  // Back from Stripe checkout (or the test-mode checkout page).
  if (paid !== null) {
    const ev = paid === '1' ? await api.refreshEvent() : null;
    if (ev?.plan === 'pass') toast(`🎉 ${SITE.pricing.passLabel} active — enjoy the party!`, 4000);
    else if (paid === '1') toast('Payment received — it can take a few seconds to show up. Refreshing…', 4000);
    else toast('Checkout cancelled — you\'re still on the free plan.', 3500);
    history.replaceState(null, '', pageUrl());
  }

  // Rejoin after a refresh / return from checkout.
  if (params.get('host') && session) { store.del('kc_session'); }
  if (fresh && !params.get('host') && (!roomParam || roomParam === session.code) && profile.name) {
    show('home');
    if (session.role === 'host' && store.get('kc_host_' + session.code)) {
      if (await Client.host({ resumeCode: session.code })) {
        const ev = await api.refreshEvent();
        if (ev) Host.applyPlan({ plan: ev.plan, maxPlayers: ev.limits.maxPlayers, watermark: ev.limits.watermark });
        return;
      }
    } else if (session.role === 'guest') {
      if (await Client.join(session.code)) return;
    }
    store.del('kc_session');
  }
  if (roomParam) { $('#joinCode').value = roomParam; openProfile({ type: 'join', code: roomParam }); return; }
  const theme = params.get('theme'); const mode = params.get('mode');
  if (paid !== null || params.get('host') || (theme && THEMES[theme])) {
    const action = { type: 'host', theme: THEMES[theme] ? theme : undefined, mode: mode === 'quiz' ? 'quiz' : mode === 'deck' ? 'deck' : undefined };
    if (THEMES[theme]?.ageGate && !(await requireAge())) { show('home'); return; }
    if (profile.name) { show('setup'); await setupUI.open(action); } else openProfile(action);
    return;
  }
  show('home');
}

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
