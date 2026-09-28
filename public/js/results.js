// /results?event=… — host enters the real birth details; closest guesses win.
import { scorePredictions, PREDICTION_FIELDS } from './quiz-core.js';
import { eventStore, eventAction, refreshEvent } from './api.js';

const app = document.getElementById('resultsApp');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cur = eventStore.get();
const want = new URLSearchParams(location.search).get('event');

async function load() {
  if (!cur || (want && want !== cur.id)) { app.innerHTML = '<p>Open this page on the device you hosted the party from.</p>'; return; }
  const ev = await refreshEvent();
  const pred = ev?.predictions;
  if (!pred?.entries?.length) { app.innerHTML = '<p>No predictions were saved for this party.</p>'; return; }
  render(pred.entries, pred.actual || {});
}

function render(entries, actual) {
  const scored = Object.keys(actual).length ? scorePredictions(entries, actual) : null;
  app.innerHTML = `<form id="actualForm">${PREDICTION_FIELDS.map((f) => `<label>${f.label}${f.type === 'choice'
    ? `<select name="${f.key}"><option value="">—</option>${f.options.map((o) => `<option ${actual[f.key] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : `<input name="${f.key}" type="${f.type}" ${f.step ? `step="${f.step}"` : ''} value="${esc(actual[f.key] || '')}" />`}</label>`).join('')}
    <button class="cta">See who won</button></form>
    ${scored ? `<h2>🏆 ${esc(scored.leaderboard[0]?.name || '')} wins!</h2>
      <table class="pred-table"><tr><th>Guest</th>${PREDICTION_FIELDS.map((f) => `<th>${f.label}</th>`).join('')}<th class="num">Wins</th></tr>
      ${scored.leaderboard.map((row) => { const e = entries.find((x) => x.name === row.name); return `<tr><td>${esc(row.name)}</td>${PREDICTION_FIELDS.map((f) => `<td class="${scored.perField[f.key].includes(row.name) ? 'winner' : ''}">${esc(e.answers[f.key] || '—')}</td>`).join('')}<td class="num">${row.wins}</td></tr>`; }).join('')}</table>`
      : `<p class="small">${entries.length} guests made predictions.</p>`}`;
  document.getElementById('actualForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = Object.fromEntries([...new FormData(e.target).entries()].filter(([, v]) => v));
    await eventAction('predictions', { actual: a });
    render(entries, a);
  });
}
load();
