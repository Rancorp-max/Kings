// Pure quiz logic shared by the browser game and the unit tests. No DOM here.

export const QUESTION_MS = 20000;
export const BASE_POINTS = 500;
export const SPEED_POINTS = 500;

/* Points for one answer: 500 for a correct answer plus up to 500 more for speed
 * (linear, full bonus when answered instantly, none at the buzzer). */
export function scoreAnswer({ correct, elapsedMs, limitMs = QUESTION_MS }) {
  if (!correct) return 0;
  const t = Math.min(Math.max(Number(elapsedMs) || 0, 0), limitMs);
  return BASE_POINTS + Math.round(SPEED_POINTS * (1 - t / limitMs));
}

/* Leaderboard with standard competition ranking (1,2,2,4). Ties broken by
 * nothing — equal scores share a rank; order within a tie is by name. */
export function rankPlayers(scores, players) {
  const rows = players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, score: scores[p.id] || 0 }));
  rows.sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)));
  let rank = 0; let prev = null;
  rows.forEach((r, i) => { if (r.score !== prev) { rank = i + 1; prev = r.score; } r.rank = rank; });
  return rows;
}

// Tallies a question: counts per option and which players were right.
export function tallyAnswers(answers, correctIndex, optionCount = 4) {
  const counts = Array(optionCount).fill(0); const correctIds = [];
  for (const [id, a] of Object.entries(answers)) {
    if (a.choice >= 0 && a.choice < optionCount) counts[a.choice]++;
    if (a.choice === correctIndex) correctIds.push(id);
  }
  return { counts, correctIds };
}

// Host-edited question validation (mirrors the server validator's rules).
export function validateQuestion(q, { options = 4 } = {}) {
  const question = String(q?.question || '').trim();
  const opts = Array.isArray(q?.options) ? q.options.map((o) => String(o || '').trim()) : [];
  if (!question) return 'Write a question.';
  if (question.length > 200) return 'Keep the question under 200 characters.';
  if (opts.length !== options || opts.some((o) => !o)) return `Fill in all ${options} answers.`;
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return 'Answers must all be different.';
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= options) return 'Pick the correct answer.';
  return null;
}

// ------------------------------------------------------------ predictions (baby shower)
export const PREDICTION_FIELDS = [
  { key: 'date', label: 'Birth date', type: 'date' },
  { key: 'time', label: 'Time of birth', type: 'time' },
  { key: 'weight', label: 'Weight (lb)', type: 'number', step: 0.1, min: 3, max: 15 },
  { key: 'length', label: 'Length (in)', type: 'number', step: 0.5, min: 12, max: 26 },
  { key: 'hair', label: 'Hair colour', type: 'choice', options: ['Dark', 'Brown', 'Blonde', 'Red', 'Barely any!'] },
  { key: 'eyes', label: 'Eye colour', type: 'choice', options: ['Blue', 'Brown', 'Green', 'Grey', 'Hazel'] },
];

function distance(field, guess, actual) {
  if (guess === undefined || guess === null || guess === '' || actual === undefined || actual === null || actual === '') return null;
  switch (field.type) {
    case 'date': { const g = Date.parse(guess); const a = Date.parse(actual); return isNaN(g) || isNaN(a) ? null : Math.abs(g - a) / 86400000; }
    case 'time': {
      const m = (s) => { const [h, mm] = String(s).split(':').map(Number); return Number.isFinite(h) && Number.isFinite(mm) ? h * 60 + mm : NaN; };
      const g = m(guess); const a = m(actual); if (isNaN(g) || isNaN(a)) return null;
      const d = Math.abs(g - a); return Math.min(d, 1440 - d); // wraps around midnight
    }
    case 'number': { const g = Number(guess); const a = Number(actual); return Number.isFinite(g) && Number.isFinite(a) ? Math.abs(g - a) : null; }
    default: return String(guess).toLowerCase() === String(actual).toLowerCase() ? 0 : null;
  }
}

/* entries: [{name, answers:{date,...}}], actual: {date,...}
 * Each field is won by the closest guess (ties share it; choices need an exact
 * match). Overall winner = most fields won. */
export function scorePredictions(entries, actual) {
  const perField = {}; const wins = {};
  for (const e of entries) wins[e.name] = 0;
  for (const f of PREDICTION_FIELDS) {
    const ds = entries.map((e) => [e.name, distance(f, e.answers?.[f.key], actual?.[f.key])]).filter(([, d]) => d !== null);
    if (!ds.length) { perField[f.key] = []; continue; }
    const best = Math.min(...ds.map(([, d]) => d));
    perField[f.key] = ds.filter(([, d]) => d === best).map(([n]) => n);
    for (const n of perField[f.key]) wins[n] += 1;
  }
  const leaderboard = Object.entries(wins).map(([name, w]) => ({ name, wins: w })).sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name));
  return { perField, leaderboard };
}
