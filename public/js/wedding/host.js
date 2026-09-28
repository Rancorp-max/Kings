// Wedding host panel (owner or co-host): prepare rounds, run events, moderate notes.
import { $, $$, esc, params, api, hostCreds, followLive, toast, W, planLabel } from './common.js';
import { LANGS } from './i18n.js';

const wid = params.get('w');
const creds = hostCreds(wid);
let wedding = null; let live = null; let now = () => Date.now();
let evId = params.get('e') || null; let mode = 'run';
let items = []; let drafts = []; let editing = null; let packs = null; let pending = [];
const KIND = { mc: 'Quiz', who: 'Who?', emoji: 'Song', shoe: 'Shoe', vote: 'Vote', prompt: 'Wishes' };

const noCreds = !creds;
if (noCreds) {
  document.querySelectorAll('main > section, #modeTabs').forEach((el) => el.classList.add('hidden'));
  document.querySelector('main').insertAdjacentHTML('beforeend', '<div class="card"><h2>Host link needed</h2><p>Open this panel from your wedding dashboard, or use the co-host link the owner sent you.</p></div>');
}
const host = (body) => api({ ...body, w: creds.w, token: creds.token });

async function load() {
  const r = await host({ action: 'get' });
  if (r.error) { toast(r.error, 5000); return; }
  wedding = r.wedding; live = r.live;
  if (!evId || !wedding.events.find((e) => e.id === evId)) evId = live?.eventId || wedding.events[0]?.id || null;
  $('#title').textContent = wedding.title;
  $('#planPill').textContent = planLabel(wedding.plan);
  $('#backDash').href = `/wedding/setup?w=${wid}`;
  $('#screenLink').href = `/wedding/screen?w=${wid}&c=${wedding.code}`;
  renderEventTabs(); selectEvent(evId);
}

function event() { return wedding.events.find((e) => e.id === evId); }
function renderEventTabs() {
  $('#evTabs').innerHTML = wedding.events.map((e) => `<button data-ev="${e.id}" class="${e.id === evId ? 'sel' : ''}">${e.status === 'live' ? '🔴 ' : e.status === 'done' ? '✓ ' : ''}${esc(e.name)}</button>`).join('') || '<span class="muted small">No events yet — add them on the dashboard.</span>';
}
function selectEvent(id) {
  evId = id; const ev = event(); if (!ev) return;
  items = JSON.parse(JSON.stringify(ev.items || [])); drafts = ev.drafts || []; editing = null;
  renderEventTabs(); renderRun(); renderPrep();
}

// ---------------------------------------------------------------- run
function renderRun() {
  const ev = event(); if (!ev) return;
  const running = live?.eventId === ev.id;
  const st = running ? live.stage : 'not started';
  $('#liveStage').textContent = `${ev.name}: ${st}`;
  const it = running ? live.item : null;
  $('#liveView').innerHTML = it ? `<div class="q">${it.kind === 'emoji' ? esc(it.emoji) + ' ' : ''}${esc(it.text)}</div>${it.options ? `<div class="small muted">${it.options.map(esc).join(' · ')}</div>` : ''}` : running && live.stage === 'board' ? '<div class="q">Leaderboard on screen</div>' : running && live.stage === 'finale' ? '<div class="q">🎆 Finale on screen</div>' : '';
  const c = [];
  if (!running) c.push(`<button class="btn btn-gold wide" data-do="start">▶ Start ${esc(ev.name)}</button>`);
  else {
    const next = (live.index ?? -1) + 1;
    if (live.stage === 'question' || live.stage === 'vote') {
      if (it.kind === 'shoe') c.push(...it.options.map((o, i) => `<button class="btn btn-pink" data-do="reveal" data-correct="${i}">👠 ${esc(o)}'s shoe</button>`), `<button class="btn btn-ghost" data-do="reveal" data-correct="-1">🤷 They disagreed</button>`);
      else c.push('<button class="btn btn-gold wide" data-do="reveal">⏩ Reveal now</button>');
    } else if (next < ev.items.length) c.push(`<button class="btn btn-gold wide" data-do="open" data-index="${next}">▶ Next round (${next + 1}/${ev.items.length})</button>`);
    if (live.stage === 'prompt') c.push('<button class="btn btn-ghost" data-do="wall">🔄 Refresh toast wall</button>');
    c.push('<button class="btn btn-ghost" data-do="board">📊 Scoreboard</button>', '<button class="btn btn-ghost" data-do="finale">🎆 Finale</button>', '<button class="btn btn-danger" data-do="end">⏹ End event</button>');
  }
  $('#controls').innerHTML = c.join('');
  $('#runItems').innerHTML = ev.items.map((x, i) => `<div class="it ${running && live.index === i ? 'cur' : ''}"><span class="k">${KIND[x.kind]}</span><span class="tx">${x.kind === 'emoji' ? esc(x.emoji) + ' ' : ''}${esc(x.text)}</span>${running ? `<button class="mini" data-do="open" data-index="${i}">Open</button>` : ''}</div>`).join('') || '<p class="muted small">No rounds yet — add some in Prepare.</p>';
}

async function doAction(b) {
  const a = b.dataset.do;
  b.disabled = true;
  const map = { start: { action: 'start-event', eventId: evId }, open: { action: 'open', index: Number(b.dataset.index) }, reveal: { action: 'reveal', ...(b.dataset.correct !== undefined ? { correct: Number(b.dataset.correct) } : {}) }, board: { action: 'board' }, finale: { action: 'finale' }, end: { action: 'end-event' }, wall: { action: 'wall' } };
  if (a === 'end' && !confirm('End this event? Scores are kept for the wedding.')) { b.disabled = false; return; }
  const r = await host(map[a]);
  b.disabled = false;
  if (r.error) { toast(r.error, 4000); return; }
  if (r.live) { live = r.live; follower.refresh(); }
  if (a === 'start' || a === 'end') await load(); else renderRun();
}

// Host pulse: counts + peak players; also auto-reveal at the buzzer.
let revealing = false;
async function pulse() {
  const r = await host({ action: 'pulse' });
  if (!r.error) { $('#sAnswered').textContent = r.answered; $('#sActive').textContent = r.active; $('#sGuests').textContent = r.guests; }
  if (live?.stage === 'prompt' && live.eventId) host({ action: 'wall' });
  if (mode === 'mod' || Math.random() < 0.34) loadNotes();
}
function tick() {
  const bar = $('#tb');
  if (live?.deadline && live.durationMs) {
    bar.style.width = Math.max(0, Math.min(100, ((live.deadline - now()) / live.durationMs) * 100)) + '%';
    if ($('#autoReveal').checked && !revealing && now() > live.deadline + 800 && ['question', 'vote'].includes(live.stage) && live.item?.kind !== 'shoe') {
      revealing = true;
      host({ action: 'reveal' }).then((r) => { revealing = false; if (r.live) { live = r.live; renderRun(); } });
    }
  } else bar.style.width = '0%';
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- prepare
function renderPrep() {
  const ev = event(); if (!ev) return;
  const plus = wedding.limits.languages;
  $('#evName').value = ev.name; $('#evDate').value = ev.date || ''; $('#evTime').value = ev.time || '';
  const opts = (sel) => Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''} ${!plus && k !== 'en' ? 'disabled' : ''}>${v.name} — ${v.native}</option>`).join('');
  $('#evLang').innerHTML = opts(ev.language);
  $('#evLang2').innerHTML = `<option value="">None</option>${opts(ev.secondLanguage)}`;
  $('#langNote').textContent = plus ? 'Guests can switch language on their phones; the big screen shows both languages.' : `Other languages come with ${W.plans.plus.label}.`;
  $('#translateBtn').classList.toggle('hidden', !plus);
  $('#itemCount').textContent = items.length;
  $('#prepItems').innerHTML = items.map((x, i) => `<div class="it"><span class="k">${KIND[x.kind]}</span><span class="tx">${x.kind === 'emoji' ? esc(x.emoji) + ' ' : ''}${esc(x.text)}${x.options ? `<small>${x.options.map((o, j) => (j === x.correct ? `✅ ${esc(o)}` : esc(o))).join(' · ')}</small>` : ''}${x.translations && Object.keys(x.translations).length ? `<small>🌐 ${Object.keys(x.translations).join(', ')}</small>` : ''}</span>
    <span class="ops"><button class="mini" data-up="${i}">↑</button><button class="mini" data-edit="${i}">✎</button><button class="mini" data-del="${i}">✕</button></span></div>`).join('');
  $('#drafts').innerHTML = drafts.length ? `<h2 style="margin-top:12px">Drafts — review before approving</h2>${drafts.map((d, i) => `<label class="it"><input type="checkbox" data-draft="${i}" checked /><span class="k">${KIND[d.kind]}</span><span class="tx">${d.kind === 'emoji' ? esc(d.emoji) + ' ' : ''}${esc(d.text)}${d.options ? `<small>${d.options.map((o, j) => (j === d.correct ? `✅ ${esc(o)}` : esc(o))).join(' · ')}</small>` : ''}</span></label>`).join('')}<button class="btn btn-gold btn-block" id="approveDrafts">✅ Approve selected</button>` : '';
  renderBank(); renderEditor();
}

async function renderBank() {
  if (!packs) { const r = await api(null, { method: 'GET', query: { action: 'packs' } }); packs = r.packs || {}; }
  const p = packs[event().pack]; if (!p) return;
  const [a, b] = wedding.couple.names.length ? [wedding.couple.names[0], wedding.couple.names[1] || 'Partner'] : ['Bride', 'Groom'];
  const fill = (s) => String(s).replace(/\{a\}/g, a).replace(/\{b\}/g, b).replace(/\{couple\}/g, `${a} & ${b}`);
  $('#bank').innerHTML = `<p class="small muted">${esc(p.description)}</p>` + p.bank.map((q, i) => `<div class="it"><span class="k">${KIND[q.kind]}</span><span class="tx">${esc(fill(q.text))}</span><button class="mini" data-bank="${i}">Add</button></div>`).join('');
  $('#bank').dataset.names = JSON.stringify([a, b]);
}

function renderEditor() {
  const el = $('#editor');
  if (!editing) { el.innerHTML = ''; return; }
  const x = editing.item; const names = wedding.couple.names.length ? [wedding.couple.names[0], wedding.couple.names[1] || 'Partner'] : ['Bride', 'Groom'];
  if (x.kind === 'who' || x.kind === 'shoe') x.options = names;
  const optRows = (x.options || []).map((o, j) => `<div class="optrow">${['mc', 'emoji', 'who'].includes(x.kind) ? `<input type="radio" name="corr" data-corr="${j}" ${x.correct === j ? 'checked' : ''} title="Correct answer" />` : ''}<input class="input" data-opt="${j}" value="${esc(o)}" ${x.kind === 'who' || x.kind === 'shoe' ? 'readonly' : ''} />${x.kind === 'vote' ? `<select class="input" data-oside="${j}" style="max-width:130px"><option value="">No team</option>${wedding.sides.map((s) => `<option value="${s.id}" ${x.optionSides?.[j] === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>` : ''}</div>`).join('');
  el.innerHTML = `<div class="editor"><b>${editing.index === null ? 'New' : 'Edit'} ${KIND[x.kind]} round</b>
    ${x.kind === 'emoji' ? `<input class="input" id="edEmoji" placeholder="Emoji clue e.g. 🌙✨💃" value="${esc(x.emoji || '')}" />` : ''}
    <textarea class="input" id="edText" rows="2" placeholder="${x.kind === 'prompt' ? 'e.g. Share your best advice for the couple' : 'Question'}">${esc(x.text || '')}</textarea>
    ${x.kind === 'prompt' ? `<select class="input" id="edNoteKind">${['wish', 'advice', 'prediction', 'toast', 'story'].map((k) => `<option ${x.noteKind === k ? 'selected' : ''}>${k}</option>`).join('')}</select>` : optRows}
    ${x.kind === 'vote' ? '<button class="mini" id="edAddOpt">+ option</button>' : ''}
    ${x.kind === 'emoji' ? '<p class="small muted">Song TITLES only — never lyrics.</p>' : ''}
    <div class="row"><button class="btn btn-gold btn-sm" id="edOk">Done</button><button class="btn btn-ghost btn-sm" id="edCancel">Cancel</button></div><p class="err" id="edErr"></p></div>`;
}

function readEditor() {
  const x = editing.item;
  x.text = $('#edText').value.trim();
  if ($('#edEmoji')) x.emoji = $('#edEmoji').value.trim();
  if ($('#edNoteKind')) x.noteKind = $('#edNoteKind').value;
  $$('#editor [data-opt]').forEach((inp) => { x.options[Number(inp.dataset.opt)] = inp.value.trim(); });
  $$('#editor [data-oside]').forEach((s) => { (x.optionSides ||= [])[Number(s.dataset.oside)] = s.value || null; });
  const c = $('#editor [data-corr]:checked'); if (c) x.correct = Number(c.dataset.corr);
  if (!x.text) return 'Write the question or prompt.';
  if (['mc', 'emoji', 'who'].includes(x.kind) && !Number.isInteger(x.correct)) return 'Tick the correct answer.';
  if (x.options && (x.options.some((o) => !o) || new Set(x.options.map((o) => o.toLowerCase())).size !== x.options.length)) return 'Fill in all options (all different).';
  return null;
}

async function saveRounds() {
  $('#prepErr').textContent = '';
  const r = await host({ action: 'approve', eventId: evId, items, keepDrafts: true });
  if (r.error) { $('#prepErr').textContent = r.error; return; }
  Object.assign(event(), r.event); items = JSON.parse(JSON.stringify(r.event.items));
  if (r.event.items.length !== items.length) toast('Some rounds were incomplete and were skipped.');
  toast(`Saved ${r.event.items.length} rounds ✓`); renderPrep(); renderRun();
}

// ---------------------------------------------------------------- moderation
let notesAll = [];
async function loadNotes() {
  const r = await host({ action: 'notes' }); if (r.error) return;
  notesAll = r.notes; pending = notesAll.filter((n) => n.status === 'pending');
  $('#pendCount').textContent = pending.length;
  const row = (n, btns) => `<div class="note"><div>${esc(n.avatar || '')} <b>${esc(n.name)}</b> <span class="pill">${esc(n.kind)}</span></div><div>${esc(n.text)}</div><div class="meta">${n.reason ? '⚠️ ' + esc(n.reason) : ''}</div>${btns ? `<div class="row"><button class="mini" data-mod="approved" data-id="${n.id}">✅ Approve</button><button class="mini" data-mod="rejected" data-id="${n.id}">🚫 Hide</button></div>` : ''}</div>`;
  $('#pending').innerHTML = pending.map((n) => row(n, true)).join('') || '<p class="muted small">Nothing to review 🎉</p>';
  $('#approved').innerHTML = notesAll.filter((n) => n.status === 'approved').slice(0, 20).map((n) => row(n, false)).join('') || '<p class="muted small">No notes yet.</p>';
}

// ---------------------------------------------------------------- events
$('#evTabs').addEventListener('click', (e) => { const b = e.target.closest('[data-ev]'); if (b) selectEvent(b.dataset.ev); });
$('#modeTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode;
  $$('#modeTabs button').forEach((x) => x.classList.toggle('sel', x === b));
  $('#tabRun').classList.toggle('hidden', mode !== 'run'); $('#tabPrep').classList.toggle('hidden', mode !== 'prep'); $('#tabMod').classList.toggle('hidden', mode !== 'mod');
  if (mode === 'mod') loadNotes();
});
document.addEventListener('click', (e) => { const b = e.target.closest('[data-do]'); if (b) doAction(b); });
$('#evSave').addEventListener('click', async () => {
  const r = await host({ action: 'update-event', eventId: evId, patch: { name: $('#evName').value, date: $('#evDate').value, time: $('#evTime').value, language: $('#evLang').value, secondLanguage: $('#evLang2').value || null } });
  if (r.error) { toast(r.error, 4000); return; }
  Object.assign(event(), r.event); renderEventTabs(); toast('Event saved ✓');
});
$('#genBtn').addEventListener('click', async (e) => {
  e.target.disabled = true; e.target.textContent = '✨ Drafting… (about 30 seconds)'; $('#genErr').textContent = '';
  const r = await host({ action: 'generate', eventId: evId, facts: $('#facts').value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12) });
  e.target.disabled = false; e.target.textContent = '✨ Draft rounds';
  if (r.error) { $('#genErr').textContent = r.error; return; }
  drafts = r.drafts; toast(`${drafts.length} drafts ready — ${r.generationsLeft} generation(s) left for this event`, 4000); renderPrep();
});
$('#drafts').addEventListener('click', async (e) => {
  if (e.target.id !== 'approveDrafts') return;
  const chosen = $$('#drafts [data-draft]').filter((c) => c.checked).map((c) => drafts[Number(c.dataset.draft)]);
  items = [...items, ...chosen.map(({ draftId, ...x }) => x)]; // eslint-disable-line no-unused-vars
  const r = await host({ action: 'approve', eventId: evId, items });
  if (r.error) { toast(r.error); return; }
  Object.assign(event(), r.event); items = JSON.parse(JSON.stringify(r.event.items)); drafts = []; renderPrep(); renderRun();
  toast(`Approved ${chosen.length} rounds ✓`);
});
$('#prepItems').addEventListener('click', (e) => {
  const up = e.target.dataset.up; const ed = e.target.dataset.edit; const del = e.target.dataset.del;
  if (up !== undefined && Number(up) > 0) { const i = Number(up); [items[i - 1], items[i]] = [items[i], items[i - 1]]; }
  if (del !== undefined) items.splice(Number(del), 1);
  if (ed !== undefined) editing = { index: Number(ed), item: JSON.parse(JSON.stringify(items[Number(ed)])) };
  renderPrep();
});
$('#addRound').addEventListener('click', () => {
  const k = $('#newKind').value;
  const item = { kind: k, text: '', ...(k === 'mc' || k === 'emoji' ? { options: ['', '', '', ''] } : k === 'vote' ? { options: ['Performance 1', 'Performance 2'], optionSides: [] } : k === 'prompt' ? { noteKind: 'wish' } : { options: [] }) };
  editing = { index: null, item }; renderEditor();
});
$('#bank').addEventListener('click', (e) => {
  const i = e.target.dataset.bank; if (i === undefined) return;
  const q = packs[event().pack].bank[Number(i)]; const [a, b] = JSON.parse($('#bank').dataset.names);
  const fill = (s) => String(s).replace(/\{a\}/g, a).replace(/\{b\}/g, b).replace(/\{couple\}/g, `${a} & ${b}`);
  editing = { index: null, item: { kind: q.kind, text: fill(q.text), options: q.kind === 'who' ? [a, b] : (q.options || []).map(fill), correct: null } };
  renderEditor(); $('#editor').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$('#editor').addEventListener('click', (e) => {
  if (e.target.id === 'edCancel') { editing = null; renderEditor(); }
  if (e.target.id === 'edAddOpt') { readEditor(); editing.item.options.push(`Option ${editing.item.options.length + 1}`); renderEditor(); }
  if (e.target.id === 'edOk') {
    const err = readEditor(); if (err) { $('#edErr').textContent = err; return; }
    if (editing.index === null) items.push(editing.item); else items[editing.index] = editing.item;
    editing = null; renderPrep(); toast('Remember to 💾 Save rounds');
  }
});
$('#saveRounds').addEventListener('click', saveRounds);
$('#translateBtn').addEventListener('click', async (e) => {
  e.target.disabled = true; await saveRounds();
  const r = await host({ action: 'translate', eventId: evId });
  e.target.disabled = false;
  if (r.error) { toast(r.error, 4000); return; }
  Object.assign(event(), r.event); items = JSON.parse(JSON.stringify(r.event.items)); renderPrep(); toast('Translated ✓');
});
$('#tabMod').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mod]'); if (!b) return;
  await host({ action: 'moderate-note', noteId: b.dataset.id, status: b.dataset.mod });
  if (live?.stage === 'prompt') host({ action: 'wall' });
  loadNotes();
});

const follower = noCreds ? null : followLive(wid, (l, prev, clock) => { now = clock; live = l; if (wedding) renderRun(); });
if (!noCreds) { load(); setInterval(pulse, 2500); requestAnimationFrame(tick); }
