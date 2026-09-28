// Host setup screen: theme, mode, guest(s) of honour, quiz builder, AI
// personalisation and the plan/upgrade box. The draft is saved to
// localStorage on every change so it survives the Stripe redirect.
import { $, $$, esc, store, toast, clean } from './util.js';
import { SITE } from './site-config.js';
import { THEMES, QUIZ_BANK, WHO_BANK, fill, namesText } from './themes.js';
import { validateQuestion } from './quiz-core.js';
import * as api from './api.js';

const KEY = 'pd_setup';
const MAX_FACTS = 12;

export function defaultSetup(theme = 'baby-shower') {
  const t = THEMES[theme] || THEMES['baby-shower'];
  return {
    theme, mode: t.quiz ? 'deck' : 'deck', honoree: { names: ['', ''], age: t.age ? 40 : null, date: new Date().toISOString().slice(0, 10) },
    questions: (QUIZ_BANK[theme] || []).map((q) => ({ ...q, options: [...q.options] })), spares: [],
    who: { enabled: false, names: [...(t.who || ['A', 'B'])], items: (WHO_BANK[theme] || []).map((text) => ({ text, answer: null })) },
    predictions: !!t.predictions, facts: [], aiCards: [],
  };
}

export function createSetup({ onOpenRoom, requireAge }) {
  let setup = store.get(KEY) || defaultSetup();
  let ev = null; // { id, token, event } | { offline }
  const save = () => store.set(KEY, setup);
  const limits = () => SITE.limits[ev?.event?.plan === 'pass' ? 'pass' : 'free'];

  function switchTheme(theme) {
    if (theme === setup.theme) return;
    const keepNames = setup.honoree.names;
    setup = { ...defaultSetup(theme), mode: THEMES[theme].quiz ? setup.mode : 'deck' };
    setup.honoree.names = keepNames;
    save(); render();
    if (ev?.id) api.eventAction('update', { theme, mode: setup.mode });
  }

  async function open({ theme, mode, fresh } = {}) {
    if (fresh) setup = defaultSetup(theme || setup.theme);
    if (theme && theme !== setup.theme) switchTheme(theme);
    if (mode && THEMES[setup.theme].quiz) setup.mode = mode;
    save(); render();
    ev = await api.ensureEvent({ theme: setup.theme, mode: setup.mode });
    render(); // plan affects which AI questions/cards are unlocked
    return ev;
  }

  async function refreshPlan() { if (ev?.id) { const e = await api.refreshEvent(); if (e) ev = { ...ev, event: e }; } render(); return ev; }

  // ---------------------------------------------------------------- render
  function render() {
    const t = THEMES[setup.theme];
    document.body.dataset.theme = setup.theme;
    $('#themeGrid').innerHTML = Object.entries(THEMES).map(([id, th]) => `
      <button type="button" class="theme-card ${id === setup.theme ? 'sel' : ''}" data-theme="${id}">
        <span class="te">${th.emoji}</span><span class="tn">${th.name}</span>${th.ageGate ? `<span class="badge">${th.ageGate}+</span>` : ''}
      </button>`).join('');
    $('#modeBox').classList.toggle('hidden', !t.quiz);
    $$('#modeSeg button').forEach((b) => b.classList.toggle('sel', b.dataset.mode === setup.mode));
    const names = namesText(setup.honoree, setup.theme);
    $('#modeHint').textContent = setup.mode === 'quiz'
      ? `"Who knows ${names} best?" — guests answer on their phones, 20 seconds per question, live leaderboard.`
      : 'Take turns drawing prompt cards: advice, guesses, would-you-rathers and more.';
    $('#honoreeBox').classList.toggle('hidden', !t.honoree);
    if (t.honoree) {
      $('#honoree1').placeholder = t.honoree[0]; $('#honoree2').placeholder = t.honoree[1] || '';
      $('#honoree2').classList.toggle('hidden', !t.honoree[1]);
      $('#honoree1').value = setup.honoree.names[0] || ''; $('#honoree2').value = setup.honoree.names[1] || '';
      $('#ageRow').classList.toggle('hidden', !t.age);
      if (t.age) $('#honoreeAge').value = String(setup.honoree.age || 40);
    }
    const quiz = setup.mode === 'quiz' && t.quiz;
    $('#quizBuilder').classList.toggle('hidden', !quiz);
    $('#deckBuilder').classList.toggle('hidden', quiz || setup.theme === 'kings-cup');
    if (quiz) { renderQuestions(); renderWho(); }
    $('#predictRow').classList.toggle('hidden', !t.predictions);
    $('#predictToggle').checked = !!setup.predictions;
    renderFacts('#factList'); renderFacts('#factList2');
    renderAiCards();
    $('#btnOpenRoom').textContent = setup.theme === 'kings-cup' ? "👑 Open the King's Cup room" : quiz ? '🏆 Open the quiz room' : '🃏 Open the room';
    renderPlan();
  }

  function renderFacts(sel) {
    if ($(sel).contains(document.activeElement)) return; // never yank the field someone is typing in
    const facts = [...setup.facts];
    if (facts.length < MAX_FACTS && (facts.length === 0 || facts[facts.length - 1])) facts.push('');
    $(sel).innerHTML = facts.map((f, i) => `<input class="input fact" data-fact="${i}" maxlength="200" value="${esc(f)}" placeholder="${i === 0 ? 'e.g. They met at a pottery class in 2019' : i === 1 ? 'e.g. Always sings in the car' : `Fact ${i + 1} (optional)`}" />`).join('');
  }

  function aiLocked(i) {
    // Free plan: only the first N AI questions/cards are playable (the rest are a preview).
    const l = limits(); return i >= l.aiQuestionsPlayable;
  }

  function renderQuestions() {
    const list = $('#questionList');
    let aiIndex = 0;
    const playable = setup.questions.filter((q) => Number.isInteger(q.correct) && !(q.source === 'ai' && aiLocked(aiIndexOf(q)))).length;
    $('#qCount').textContent = `${playable} ready`;
    list.innerHTML = setup.questions.map((q, i) => {
      const locked = q.source === 'ai' && aiLocked(aiIndex++);
      const shown = { ...q, question: fill(q.question, setup.honoree, setup.theme), options: q.options.map((o) => fill(o, setup.honoree, setup.theme)) };
      const badge = q.source === 'ai' ? '<span class="src ai">✨ AI</span>' : q.source === 'custom' ? '<span class="src">Yours</span>' : '<span class="src">Classic</span>';
      return `<div class="q-edit ${locked ? 'locked' : ''} ${Number.isInteger(q.correct) ? '' : 'needs'}" data-q="${i}">
        <div class="q-edit-head">${badge}<span class="qn">Q${i + 1}</span>
          ${q.source === 'ai' && setup.spares.length ? '<button type="button" class="mini-btn" data-swap title="Swap for another AI question">🔄</button>' : ''}
          <button type="button" class="mini-btn" data-del title="Remove">🗑️</button></div>
        <textarea class="input q-q" rows="2" maxlength="200" data-field="question">${esc(shown.question)}</textarea>
        <div class="q-opts">${shown.options.map((o, j) => `<label class="q-opt ${q.correct === j ? 'ok' : ''}"><input type="radio" name="c${i}" data-correct="${j}" ${q.correct === j ? 'checked' : ''} aria-label="Correct answer" /><input class="input" maxlength="80" data-opt="${j}" value="${esc(o)}" /></label>`).join('')}</div>
        ${Number.isInteger(q.correct) ? '' : '<div class="hint warn">Tap the circle next to the right answer — otherwise this one is skipped.</div>'}
        ${locked ? `<div class="lock-over"><span>🔒 Included with the ${SITE.pricing.passLabel}</span></div>` : ''}
      </div>`;
    }).join('');
  }
  function aiIndexOf(q) { return setup.questions.filter((x) => x.source === 'ai').indexOf(q); }

  function renderWho() {
    $('#whoToggle').checked = !!setup.who.enabled;
    $('#whoBox').classList.toggle('hidden', !setup.who.enabled);
    const [a, b] = setup.who.names;
    $('#whoLabel').textContent = `"${a || 'A'} or ${b || 'B'}: who said it?" round`;
    $('#whoA').value = a || ''; $('#whoB').value = b || '';
    $('#whoList').innerHTML = setup.who.items.map((w, i) => `
      <div class="who-item" data-w="${i}"><span class="wt">${esc(fill(w.text, setup.honoree, setup.theme))}</span>
        <button type="button" class="${w.answer === 0 ? 'sel' : ''}" data-who="0">${esc(a || 'A')}</button>
        <button type="button" class="${w.answer === 1 ? 'sel' : ''}" data-who="1">${esc(b || 'B')}</button>
        <button type="button" class="mini-btn" data-wdel>✕</button></div>`).join('');
  }

  function renderAiCards() {
    const l = limits();
    $('#aiCardList').innerHTML = setup.aiCards.length
      ? `<div class="label">Your custom cards (${Math.min(setup.aiCards.length, l.aiCardsPlayable)} of ${setup.aiCards.length} in the deck)</div>` +
        setup.aiCards.map((c, i) => `<div class="ai-card ${i >= l.aiCardsPlayable ? 'locked' : ''}"><b>${esc(c.title)}</b> ${esc(c.text)}${i >= l.aiCardsPlayable ? '<span class="lock-tag">🔒 Pass</span>' : ''}</div>`).join('')
      : '';
  }

  function renderPlan() {
    const box = $('#planBox'); const e = ev?.event; const l = limits();
    const gens = e ? `${e.generationsLeft} AI generation${e.generationsLeft === 1 ? '' : 's'} left` : '';
    $('#genLeft').textContent = gens; $('#genLeft2').textContent = gens;
    const aiOff = !e || ev?.offline;
    for (const id of ['#btnGenerate', '#btnGenerate2']) $(id).disabled = aiOff || e.generationsLeft <= 0;
    if (!e) {
      box.innerHTML = `<div class="plan free"><b>Free party</b> · up to ${SITE.limits.free.maxPlayers} players${ev?.offline ? '<p class="hint">Upgrades and AI need an internet connection to our server.</p>' : '<p class="hint">Loading your plan…</p>'}</div>`;
      return;
    }
    if (e.plan === 'pass') {
      const until = e.expiresAt ? new Date(e.expiresAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
      box.innerHTML = `<div class="plan pass"><b>🎉 ${SITE.pricing.passLabel} active</b>${until ? ` · until ${until}` : ''}<ul><li>Up to ${l.maxPlayers} players</li><li>Personalised AI questions &amp; cards · ${gens}</li><li>Keepsake PDF without watermark</li></ul></div>`;
      return;
    }
    const price = (SITE.pricing.passPriceCents / 100).toFixed(2);
    box.innerHTML = `<div class="plan free">
      <div class="plan-head"><b>Free party</b><span>Up to ${l.maxPlayers} players · keepsake with watermark · 1 AI preview</span></div>
      <div class="upsell"><b>${SITE.pricing.passLabel} — US$${price}</b> <span>one payment for this event</span>
        <ul><li>Up to ${SITE.limits.pass.maxPlayers} players</li><li>All personalised AI questions &amp; cards (${SITE.limits.pass.generations} generations)</li><li>Keepsake PDF without watermark</li><li>Room valid ${SITE.pricing.passDays} days</li></ul>
        <button type="button" class="btn btn-gold btn-block" id="btnBuyPass">💳 Get the ${SITE.pricing.passLabel}</button>
        <details class="code-box"><summary>🎟️ I have an access code</summary>
          <form class="row2" id="codeForm"><input class="input" id="codeInput" placeholder="PD-XXXX-XXXX-XXXX" autocapitalize="characters" spellcheck="false" /><button class="btn btn-ghost">Redeem</button></form>
          <p class="error" id="codeError"></p></details>
      </div></div>`;
  }

  // ---------------------------------------------------------------- actions
  async function generate(errSel) {
    const facts = setup.facts.map((f) => clean(f, 200)).filter(Boolean);
    const btns = $$('#btnGenerate, #btnGenerate2');
    btns.forEach((b) => { b.disabled = true; b.dataset.label = b.textContent; b.textContent = '✨ Writing… (about 20 seconds)'; });
    $(errSel).textContent = '';
    const r = await api.generateDeck({ theme: setup.theme, honoree: setup.honoree, facts });
    btns.forEach((b) => { b.textContent = b.dataset.label; });
    if (r.error) { $(errSel).textContent = r.error; renderPlan(); return; }
    ev = { ...ev, event: r.event };
    const custom = setup.questions.filter((q) => q.source === 'custom');
    setup.questions = [...r.questions.map((q) => ({ ...q, source: 'ai' })), ...custom];
    setup.spares = r.spares.map((q) => ({ ...q, source: 'ai' }));
    setup.aiCards = r.cards;
    save(); render();
    toast(`✨ ${r.questions.length} questions and ${r.cards.length} cards written — review them below.`, 3500);
  }

  function readyQuestions() { return setup.questions.filter((q, i) => !validateQuestion({ ...q, question: fill(q.question, setup.honoree, setup.theme) }) && !(q.source === 'ai' && aiLocked(aiIndexOf(q)))); }

  async function openRoom() {
    $('#setupError').textContent = '';
    const t = THEMES[setup.theme];
    if (t.honoree && !clean(setup.honoree.names[0], 30)) { $('#setupError').textContent = `Add the ${t.honoree[0].toLowerCase()}'s name first.`; $('#honoree1').focus(); return; }
    if (setup.theme === 'kings-cup' && !(await requireAge())) return;
    if (setup.mode === 'quiz' && t.quiz) {
      const whoReady = setup.who.enabled ? setup.who.items.filter((w) => w.answer === 0 || w.answer === 1).length : 0;
      if (readyQuestions().length + whoReady < 3 && !(setup.predictions && t.predictions)) {
        $('#setupError').textContent = 'Mark the right answer on at least 3 questions (tap the circle next to it).';
        return;
      }
    }
    const plan = ev?.event?.plan === 'pass' ? 'pass' : 'free';
    await onOpenRoom(setup, plan, limits(), ev?.id || null);
  }

  // ---------------------------------------------------------------- bindings
  function bind() {
    $('#themeGrid').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-theme]'); if (!b) return;
      if (THEMES[b.dataset.theme].ageGate && !(await requireAge())) return;
      switchTheme(b.dataset.theme);
    });
    $('#modeSeg').addEventListener('click', (e) => {
      const b = e.target.closest('[data-mode]'); if (!b) return;
      setup.mode = b.dataset.mode; save(); render();
      if (ev?.id) api.eventAction('update', { mode: setup.mode });
    });
    const honoree = () => {
      setup.honoree.names = [clean($('#honoree1').value, 30), clean($('#honoree2').value, 30)];
      setup.honoree.age = Number($('#honoreeAge').value) || null;
      if (setup.theme !== 'milestone-birthday' && setup.honoree.names[0] && !setup.who.touched) {
        setup.who.names = setup.theme === 'baby-shower' ? [...THEMES['baby-shower'].who] : [setup.honoree.names[0], setup.honoree.names[1] || 'Partner'];
      }
      save();
    };
    for (const id of ['#honoree1', '#honoree2']) $(id).addEventListener('input', () => { honoree(); $('#modeHint').textContent = ''; });
    // Names only affect previews, so refresh those parts instead of re-rendering the whole form.
    const refreshNames = () => {
      const names = namesText(setup.honoree, setup.theme);
      if (setup.mode === 'quiz') { $('#modeHint').textContent = `"Who knows ${names} best?" — guests answer on their phones, 20 seconds per question, live leaderboard.`; renderQuestions(); renderWho(); }
    };
    for (const id of ['#honoree1', '#honoree2', '#honoreeAge']) $(id).addEventListener('change', () => { honoree(); refreshNames(); if (ev?.id) api.eventAction('update', { honoree: setup.honoree }); });

    const factInput = (e) => {
      const i = e.target.dataset.fact; if (i === undefined) return;
      setup.facts[Number(i)] = e.target.value; setup.facts = setup.facts.slice(0, MAX_FACTS); save();
      const list = e.target.parentElement;
      if (e.target === list.lastElementChild && e.target.value && list.children.length < MAX_FACTS) {
        // Append the next empty field without touching the one being typed in.
        const n = list.children.length;
        list.insertAdjacentHTML('beforeend', `<input class="input fact" data-fact="${n}" maxlength="200" value="" placeholder="Fact ${n + 1} (optional)" />`);
      }
    };
    $('#factList').addEventListener('input', factInput); $('#factList2').addEventListener('input', factInput);
    $('#btnGenerate').addEventListener('click', () => generate('#genError'));
    $('#btnGenerate2').addEventListener('click', () => generate('#genError2'));

    const qList = $('#questionList');
    qList.addEventListener('input', (e) => {
      const card = e.target.closest('[data-q]'); if (!card) return; const q = setup.questions[Number(card.dataset.q)];
      if (e.target.dataset.field === 'question') q.question = e.target.value;
      if (e.target.dataset.opt !== undefined) q.options[Number(e.target.dataset.opt)] = e.target.value;
      if (q.source === 'generic') q.edited = true;
      save();
    });
    qList.addEventListener('change', (e) => {
      const card = e.target.closest('[data-q]'); if (!card || e.target.dataset.correct === undefined) return;
      setup.questions[Number(card.dataset.q)].correct = Number(e.target.dataset.correct); save(); renderQuestions();
    });
    qList.addEventListener('click', (e) => {
      const card = e.target.closest('[data-q]'); if (!card) return; const i = Number(card.dataset.q);
      if (e.target.closest('[data-del]')) { setup.questions.splice(i, 1); save(); renderQuestions(); }
      if (e.target.closest('[data-swap]') && setup.spares.length) { setup.questions[i] = setup.spares.shift(); save(); renderQuestions(); }
    });
    $('#btnAddQuestion').addEventListener('click', () => {
      setup.questions.push({ question: '', options: ['', '', '', ''], correct: null, source: 'custom' }); save(); renderQuestions();
      const last = qList.lastElementChild; last?.scrollIntoView({ behavior: 'smooth', block: 'center' }); last?.querySelector('textarea')?.focus();
    });

    $('#whoToggle').addEventListener('change', (e) => { setup.who.enabled = e.target.checked; save(); renderWho(); });
    for (const [id, i] of [['#whoA', 0], ['#whoB', 1]]) $(id).addEventListener('change', (e) => { setup.who.names[i] = clean(e.target.value, 20) || (i ? 'B' : 'A'); setup.who.touched = true; save(); renderWho(); });
    $('#whoList').addEventListener('click', (e) => {
      const row = e.target.closest('[data-w]'); if (!row) return; const w = setup.who.items[Number(row.dataset.w)];
      if (e.target.dataset.who !== undefined) w.answer = w.answer === Number(e.target.dataset.who) ? null : Number(e.target.dataset.who);
      if (e.target.closest('[data-wdel]')) setup.who.items.splice(Number(row.dataset.w), 1);
      save(); renderWho();
    });
    const addWho = () => { const v = clean($('#whoNew').value, 140); if (!v) return; setup.who.items.push({ text: v, answer: null }); $('#whoNew').value = ''; save(); renderWho(); };
    $('#whoAdd').addEventListener('click', addWho);
    $('#whoNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addWho(); } });
    $('#predictToggle').addEventListener('change', (e) => { setup.predictions = e.target.checked; save(); });

    $('#planBox').addEventListener('click', async (e) => {
      if (e.target.id !== 'btnBuyPass') return;
      e.target.disabled = true; e.target.textContent = 'Opening secure checkout…';
      save();
      const r = await api.startCheckout();
      if (r.url) { location.href = r.url; return; }
      if (r.alreadyPaid) { await refreshPlan(); return; }
      toast(r.error || 'Checkout is unavailable right now.', 4000); renderPlan();
    });
    $('#planBox').addEventListener('submit', async (e) => {
      if (e.target.id !== 'codeForm') return;
      e.preventDefault();
      const r = await api.redeemCode($('#codeInput').value);
      if (r.error) { $('#codeError').textContent = r.error; return; }
      ev = api.eventStore.get(); toast(`🎉 ${SITE.pricing.passLabel} unlocked!`); render();
    });
    $('#btnOpenRoom').addEventListener('click', openRoom);
  }

  return { open, bind, render, refreshPlan, get setup() { return setup; }, get ev() { return ev; }, reset: () => { setup = defaultSetup(setup.theme); save(); } };
}
