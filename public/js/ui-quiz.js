// Quiz screens. The host device is the "big screen" (question, reveal,
// leaderboard, controls); guests' phones show answer buttons and their result.
import { $, esc, avatarHTML, buzz } from './util.js';
import { rankPlayers, PREDICTION_FIELDS } from './quiz-core.js';
import { Sound } from './sound.js';
import { confetti } from './confetti.js';

const TILES = [{ c: 't0', s: '▲' }, { c: 't1', s: '◆' }, { c: 't2', s: '●' }, { c: 't3', s: '■' }];

export function createQuizUI({ me, send }) {
  let deadline = 0; let stageMs = 0; let raf = 0; let lastKey = ''; let lastView = ''; let lastTick = -1;
  let myPred = null; let predSent = false; let myAnswer = null;

  function timerLoop() {
    const bar = $('#timerBar'); const text = $('#timerText');
    const left = Math.max(0, deadline - Date.now());
    if (!stageMs) { bar.style.width = '0%'; text.textContent = ''; raf = 0; return; }
    bar.style.width = (left / stageMs) * 100 + '%';
    const secs = Math.ceil(left / 1000);
    text.textContent = stageMs > 8000 ? `${secs}s` : '';
    bar.classList.toggle('low', stageMs > 8000 && left < 5000);
    if (stageMs > 8000 && secs !== lastTick && secs <= 5 && secs > 0) { lastTick = secs; Sound.tick(); }
    raf = left > 0 ? requestAnimationFrame(timerLoop) : 0;
  }

  function render(s, prev) {
    const q = s.quiz; if (!q) return;
    const isHost = s.hostId === me();
    const players = s.players.filter((p) => p.id !== s.hostId);
    const board = rankPlayers(q.scores, players);
    const mine = board.find((r) => r.id === me());

    $('#quizCode').textContent = '#' + s.code;
    $('#quizProgress').textContent = q.stage === 'predict' ? '🔮 Predictions' : q.index >= 0 ? `Q ${q.index + 1}/${q.total}` : `${q.total} questions`;
    $('#quizMyScore').textContent = isHost ? `👥 ${players.filter((p) => p.online).length}` : `⭐ ${(mine?.score || 0).toLocaleString()}`;

    // Timer (host clock is the truth; we only need the remaining time).
    stageMs = q.stageMs || 0; deadline = Date.now() + (q.msLeft || 0); lastTick = -1;
    if (!raf) raf = requestAnimationFrame(timerLoop);

    const key = `${q.stage}|${q.index}|${q.round}`;
    const stageChanged = key !== lastKey; lastKey = key;
    const el = $('#quizStage');
    // Only rebuild when something this viewer can see changed — rebuilding the
    // answer buttons while someone is tapping them would swallow the tap.
    const viewKey = `${key}|${isHost ? q.answered.length + '|' + (q.predictionsIn || []).length : q.answered.includes(me())}|${players.length}|${s.players.map((p) => p.online ? 1 : 0).join('')}`;
    const sameView = viewKey === lastView && q.stage !== 'predict'; lastView = viewKey;
    const qp = prev?.quiz;

    if (sameView) { /* nothing new to draw */ } else if (q.stage === 'intro') {
      el.innerHTML = `<div class="q-intro"><div class="q-intro-emoji">${q.round === 'who' ? '🗣️' : q.round === 'predict' ? '🔮' : '🏆'}</div><h2>${esc(q.title)}</h2><p>${isHost ? 'Get everyone looking at their phones…' : 'Get ready…'}</p></div>`;
    } else if (q.stage === 'question') {
      const answered = q.answered.includes(me());
      const picked = myAnswer && myAnswer.index === q.index ? myAnswer.choice : -1;
      const opts = q.q.options.map((o, i) => `<button class="tile ${TILES[i].c} ${q.q.options.length === 2 ? 'wide' : ''} ${i === picked ? 'picked' : ''}" data-answer="${i}" ${isHost || answered || picked >= 0 ? 'disabled' : ''}><span class="shape">${TILES[i].s}</span><span>${esc(o)}</span></button>`).join('');
      const who = players.filter((p) => q.answered.includes(p.id));
      el.innerHTML = `<div class="q-card"><div class="q-kind">${q.q.kind === 'who' ? 'Who said it?' : 'Question ' + (q.index + 1)}</div><h2 class="q-text">${esc(q.q.text)}</h2></div>
        <div class="tiles ${q.q.options.length === 2 ? 'two' : ''}">${opts}</div>
        ${isHost ? `<div class="answered">${who.map((p) => avatarHTML(p)).join('')}<span>${who.length}/${players.filter((p) => p.online).length} answered</span></div>`
          : answered ? '<div class="locked">🔒 Locked in! Waiting for everyone…</div>' : ''}`;
      if (stageChanged && !isHost) { buzz(40); }
    } else if (q.stage === 'reveal') {
      const r = q.reveal; const total = Math.max(1, r.counts.reduce((a, b) => a + b, 0));
      const opts = q.q.options.map((o, i) => `<div class="tile ${TILES[i].c} ${i === r.correct ? 'correct' : 'dim'} ${q.q.options.length === 2 ? 'wide' : ''}"><span class="shape">${i === r.correct ? '✓' : TILES[i].s}</span><span>${esc(o)}</span><span class="count">${r.counts[i]}</span><i class="bar" style="width:${(r.counts[i] / total) * 100}%"></i></div>`).join('');
      let mineHtml = '';
      if (!isHost) {
        const gain = r.gains[me()];
        if (gain === undefined) mineHtml = '<div class="result-big slow">⏰ Too slow! Get the next one.</div>';
        else if (gain > 0) mineHtml = `<div class="result-big good">✅ Correct! <b>+${gain}</b></div>`;
        else mineHtml = `<div class="result-big bad">❌ Not quite — it was <b>${esc(q.q.options[r.correct])}</b></div>`;
        if (stageChanged) { if (gain > 0) { Sound.right(); confetti(50); buzz([40, 40, 40]); } else Sound.wrong(); }
      } else if (stageChanged) Sound.right();
      const winners = players.filter((p) => r.correctIds.includes(p.id));
      el.innerHTML = `<div class="q-card small"><h2 class="q-text">${esc(q.q.text)}</h2></div><div class="tiles ${q.q.options.length === 2 ? 'two' : ''}">${opts}</div>${mineHtml}
        ${isHost ? `<div class="answered">${winners.map((p) => `${avatarHTML(p)}`).join('') || '<span>Nobody got it! 😱</span>'}${winners.length ? `<span>${winners.length} got it right</span>` : ''}</div>` : ''}`;
    } else if (q.stage === 'board') {
      const top = board.slice(0, isHost ? 10 : 5);
      const prevBoard = qp ? rankPlayers(qp.scores, players) : [];
      const rows = top.map((row) => {
        const gain = q.reveal?.gains?.[row.id] || 0;
        const was = prevBoard.find((x) => x.id === row.id)?.rank;
        return `<div class="lb-row ${row.id === me() ? 'me' : ''}"><span class="rank">${row.rank}</span>${avatarHTML(row)}<span class="name">${esc(row.name)}</span>${gain ? `<span class="gain">+${gain}</span>` : ''}${was && was > row.rank ? '<span class="up">▲</span>' : ''}<span class="score">${row.score.toLocaleString()}</span></div>`;
      }).join('');
      el.innerHTML = `<div class="lb"><h2>🏆 Leaderboard</h2>${rows || '<p class="muted">No scores yet</p>'}</div>
        ${!isHost && mine && mine.rank > 5 ? `<div class="lb-row me"><span class="rank">${mine.rank}</span>${avatarHTML(mine)}<span class="name">You</span><span class="score">${mine.score.toLocaleString()}</span></div>` : ''}`;
    } else if (q.stage === 'predict') {
      if (isHost) {
        const inn = players.filter((p) => q.predictionsIn.includes(p.id));
        el.innerHTML = `<div class="q-intro"><div class="q-intro-emoji">🔮</div><h2>Baby predictions</h2><p>Guests are guessing the birth date, weight, hair colour and more. You can score them after the birth from the end screen.</p>
          <div class="answered">${inn.map((p) => avatarHTML(p)).join('')}<span>${inn.length}/${players.length} submitted</span></div></div>`;
      } else if (stageChanged || !el.querySelector('#predForm')) {
        el.innerHTML = `<form class="pred-form" id="predForm"><h2>🔮 Your predictions</h2><p class="hint">Closest guesses win after the baby arrives!</p>
          ${PREDICTION_FIELDS.map((f) => `<label><span>${f.label}</span>${f.type === 'choice'
            ? `<select class="input" name="${f.key}"><option value="">—</option>${f.options.map((o) => `<option ${myPred?.[f.key] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
            : `<input class="input" name="${f.key}" type="${f.type}" ${f.step ? `step="${f.step}" min="${f.min}" max="${f.max}"` : ''} value="${esc(myPred?.[f.key] || '')}" />`}</label>`).join('')}
          <button class="btn btn-gold btn-block">${predSent ? 'Update my predictions' : 'Lock in my predictions'}</button>
          <p class="hint center" id="predStatus">${predSent ? '✅ Saved! You can still change them.' : ''}</p></form>`;
      }
    }

    // Host controls
    if (isHost) {
      const next = { intro: '▶ Start now', question: '⏩ Reveal now', reveal: '📊 Leaderboard', board: '➡️ Next question', predict: '🏁 Finish game' }[q.stage];
      $('#quizHostControls').innerHTML = `${next ? `<button class="btn btn-gold" data-quiz="next">${next}</button>` : ''}
        <button class="btn btn-ghost" data-quiz="auto">${q.auto ? '⏸ Pause auto-advance' : '▶ Auto-advance'}</button>`;
    }
  }

  function bind() {
    $('#quizStage').addEventListener('click', (e) => {
      const b = e.target.closest('[data-answer]'); if (!b || b.disabled) return;
      const s = window.__pdState; if (!s?.quiz) return;
      $$tiles().forEach((t) => { t.disabled = true; t.classList.toggle('picked', t === b); });
      myAnswer = { index: s.quiz.index, choice: Number(b.dataset.answer) };
      send({ t: 'answer', ...myAnswer });
      Sound.pop(); buzz(20);
    });
    $('#quizStage').addEventListener('submit', (e) => {
      if (e.target.id !== 'predForm') return;
      e.preventDefault();
      myPred = Object.fromEntries(new FormData(e.target).entries());
      send({ t: 'predict', answers: myPred }); predSent = true;
      $('#predStatus').textContent = '✅ Saved! You can still change them.';
      Sound.right();
    });
    $('#quizHostControls').addEventListener('click', (e) => {
      const b = e.target.closest('[data-quiz]'); if (!b) return;
      const s = window.__pdState;
      if (b.dataset.quiz === 'next') send({ t: 'next' });
      else send({ t: 'auto', on: !s?.quiz?.auto });
    });
  }
  const $$tiles = () => Array.from(document.querySelectorAll('#quizStage .tile'));

  function reset() { lastKey = ''; lastView = ''; myPred = null; predSent = false; myAnswer = null; }

  return { render, bind, reset };
}
