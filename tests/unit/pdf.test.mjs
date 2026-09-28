import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKeepsake, toWinAnsi, wrap, PAPER } from '../../public/js/pdf.js';

const latin1 = (bytes) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const entries = [{ name: 'Zoë', kind: 'wish', text: 'All the “best” — always 🎉' }, { name: 'Bo', kind: 'advice', text: 'Nap often.' }];

test('toWinAnsi keeps Latin-1 and smart punctuation, drops emoji, is idempotent', () => {
  const once = toWinAnsi('Zoë says “hi” — 🎉 ok');
  assert.equal(once, 'Zoë says \u0093hi\u0094 \u0097 ok');
  assert.equal(toWinAnsi(once), once);
});

test('wrap respects the max width and splits very long words', () => {
  const lines = wrap('a '.repeat(200) + 'x'.repeat(300), 'F1', 12, 200);
  assert.ok(lines.length > 5);
  assert.ok(lines.every((l) => l.length > 0));
});

test('keepsake PDF: cover + one page per guest, correct paper size, valid xref offsets', () => {
  for (const paper of ['letter', 'a4']) {
    const pdf = latin1(buildKeepsake(entries, { names: 'Sam & Alex', paper, watermark: false }));
    assert.ok(pdf.startsWith('%PDF-1.4'));
    assert.equal((pdf.match(/\/Type \/Page /g) || []).length, 3);
    assert.ok(pdf.includes(`/MediaBox [0 0 ${PAPER[paper][0]} ${PAPER[paper][1]}]`));
    const xref = Number(pdf.match(/startxref\n(\d+)/)[1]);
    assert.ok(pdf.slice(xref).startsWith('xref'));
    const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    offsets.forEach((o, i) => assert.ok(pdf.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
  }
});

test('free keepsakes carry the watermark, paid ones do not', () => {
  assert.ok(latin1(buildKeepsake(entries, { watermark: true })).includes('upgrade to remove this watermark'));
  assert.ok(!latin1(buildKeepsake(entries, { watermark: false })).includes('watermark'));
});
