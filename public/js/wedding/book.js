// Wedding keepsake book: HTML preview (prints with Noto fonts for any script) + direct PDF for Latin text.
import { $, esc, params, api, hostCreds, toast } from './common.js';
import { LANGS } from './i18n.js';
import { buildWeddingBook, isLatinOnly } from '../pdf.js';

const wid = params.get('w'); const creds = hostCreds(wid);
const SIZES = { letter: ['8.5in', '11in'], a4: ['210mm', '297mm'], photo8: ['8in', '8in'] };
let data = null; let paper = 'letter';

function bookModel() {
  const w = data.wedding;
  const names = w.couple.names.join(' & ') || w.title;
  const dates = (w.dates || []).length ? [w.dates[0], w.dates[w.dates.length - 1]].filter((d, i, a) => a.indexOf(d) === i).map((d) => new Date(d + 'T12:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })).join(' – ') : '';
  return { title: w.title, names, dates, sides: w.sides, events: data.events, notes: data.notes, scores: { sides: data.board.sides, top: data.board.top } };
}

function render() {
  const b = bookModel(); const [pw, ph] = SIZES[paper];
  $('#pageSize').textContent = `@page { size: ${pw} ${ph}; margin: 0; }`;
  const wm = data.wedding.limits.watermark ? '<div class="wm">Made with PartyDeck — free trial</div>' : '';
  const per = paper === 'photo8' ? 2 : 3; const pages = [];
  pages.push(`<section class="page cover"><div class="frame"></div><div class="kicker">OUR WEDDING KEEPSAKE</div><div class="names">${esc(b.names)}</div><div class="dates">${esc(b.dates)}</div><p class="kicker" style="margin-top:30px">${b.notes.length} wishes · ${b.events.length} events</p>${wm}</section>`);
  for (const ev of b.events) {
    for (const s of b.sides) {
      const notes = b.notes.filter((n) => n.eventId === ev.id && n.side === s.id);
      for (let i = 0; i < notes.length; i += per) {
        pages.push(`<section class="page"><div class="frame"></div><div class="evt">${esc(ev.name.toUpperCase())}${ev.date ? ' · ' + esc(ev.date) : ''}</div><h3>${esc(s.name)}</h3><div class="notes">${notes.slice(i, i + per).map((n) => `<div class="n" dir="auto"><div class="k">${esc(n.kind.toUpperCase())}</div>“${esc(n.text)}”<div class="by">— ${esc(n.name)}</div></div>`).join('')}</div>${wm}</section>`);
      }
    }
  }
  const sides = Object.entries(b.scores.sides || {}).sort((x, y) => y[1] - x[1]);
  pages.push(`<section class="page"><div class="frame"></div><div class="evt">FINAL SCORES</div><table>${sides.map(([id, v], i) => `<tr><td>${i === 0 ? '🏆 ' : ''}${esc(b.sides.find((s) => s.id === id)?.name || '')}</td><td class="r">${v.toLocaleString()}</td></tr>`).join('')}</table>
    <h3 style="margin-top:20px">Top guests</h3><table>${(b.scores.top || []).map((r, i) => `<tr><td>${i + 1}. ${esc(r.name)}</td><td class="r">${r.pts.toLocaleString()}</td></tr>`).join('')}</table>${wm}</section>`);
  $('#pages').innerHTML = pages.join('');
  document.querySelectorAll('.page').forEach((p) => { p.style.width = pw; p.style.height = ph; });
  const latin = [b.names, ...b.notes.map((n) => n.text + n.name)].every(isLatinOnly);
  $('#dl').disabled = !latin;
  $('#note').textContent = latin ? `${pages.length} pages.` : 'Some wishes use non-Latin scripts — use "Print / Save as PDF" so every script prints correctly.';
}

(async () => {
  if (!creds) { $('#pages').innerHTML = '<div class="card">Open the keepsake book from your wedding dashboard.</div>'; return; }
  const r = await api({ action: 'keepsake', w: creds.w, token: creds.token });
  if (r.error) { toast(r.error, 5000); return; }
  data = r;
  // Load fonts for every language used at the wedding so the print path renders all scripts.
  const fonts = [...new Set(data.wedding.languages.map((l) => LANGS[l]?.font).filter(Boolean))];
  if (fonts.length) {
    const link = document.createElement('link'); link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?' + fonts.map((f) => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';
    document.head.appendChild(link);
    document.documentElement.style.setProperty('--script-font', fonts.map((f) => `'${f}'`).join(', '));
  }
  const opt = $('#paper').querySelector('[value=photo8]');
  if (!data.wedding.limits.photobook) { opt.disabled = true; opt.textContent += ' (Plus)'; }
  render();
})();

$('#paper').addEventListener('change', (e) => { paper = e.target.value; render(); });
$('#print').addEventListener('click', () => { api({ action: 'keepsake', w: creds.w, token: creds.token, download: true }); window.print(); });
$('#dl').addEventListener('click', () => {
  const bytes = buildWeddingBook(bookModel(), { paper, watermark: data.wedding.limits.watermark });
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  a.download = `${data.wedding.title.replace(/[^\w-]+/g, '-')}-keepsake-${paper}.pdf`; document.body.appendChild(a); a.click(); a.remove();
  api({ action: 'keepsake', w: creds.w, token: creds.token, download: true });
});
