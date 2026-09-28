// Minimal PDF writer (standard Type1 fonts, WinAnsi text, shapes) + the keepsake layout.
// Pure module — runs in the browser and in Node tests. No dependencies.

export const PAPER = { letter: [612, 792], a4: [595.28, 841.89] };

// Glyph widths (1/1000 em) for ASCII 32..126 from the standard Helvetica AFMs.
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const FONTS = { F1: 'Helvetica', F2: 'Helvetica-Bold', F3: 'Times-Italic', F4: 'Times-Bold' };

// Unicode -> WinAnsi (cp1252) for the punctuation people actually type.
const CP1252 = { '€': 128, '‚': 130, 'ƒ': 131, '„': 132, '…': 133, '†': 134, '‡': 135, 'ˆ': 136, '‰': 137, 'Š': 138, '‹': 139, 'Œ': 140, 'Ž': 142, '‘': 145, '’': 146, '“': 147, '”': 148, '•': 149, '–': 150, '—': 151, '˜': 152, '™': 153, 'š': 154, '›': 155, 'œ': 156, 'ž': 158, 'Ÿ': 159 };

export function toWinAnsi(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) out += ch;
    else if (c >= 128 && c <= 255) out += String.fromCharCode(c); // 128-159: already-encoded cp1252 (idempotent)
    else if (CP1252[ch]) out += String.fromCharCode(CP1252[ch]);
    else if (ch === '\n' || ch === '\t') out += ' ';
    // everything else (emoji, CJK…) can't be drawn with standard fonts — dropped
  }
  return out.replace(/\s+/g, ' ').trim();
}

function charWidth(code, font) {
  const table = font === 'F2' || font === 'F4' ? HELV_B : HELV;
  const w = code >= 32 && code <= 126 ? table[code - 32] : 556;
  return font === 'F3' || font === 'F4' ? w * 0.9 : w; // Times runs narrower than Helvetica
}
export function textWidth(s, font, size) { let w = 0; for (let i = 0; i < s.length; i++) w += charWidth(s.charCodeAt(i), font); return (w * size) / 1000; }

export function wrap(text, font, size, maxWidth) {
  const words = toWinAnsi(text).split(' ').filter(Boolean); const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (textWidth(test, font, size) <= maxWidth) { line = test; continue; }
    if (line) lines.push(line);
    // Break words that are longer than a whole line.
    let rest = w;
    while (textWidth(rest, font, size) > maxWidth) {
      let i = rest.length; while (i > 1 && textWidth(rest.slice(0, i), font, size) > maxWidth) i--;
      lines.push(rest.slice(0, i)); rest = rest.slice(i);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines;
}

const pdfStr = (s) => '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
const n = (v) => (Math.round(v * 100) / 100).toString();
const rgb = (hex) => { const h = hex.replace('#', ''); return [0, 2, 4].map((i) => n(parseInt(h.slice(i, i + 2), 16) / 255)).join(' '); };

export class PdfDoc {
  constructor(paper = 'letter') { [this.w, this.h] = PAPER[paper] || PAPER.letter; this.pages = []; }
  page() { this.ops = []; this.pages.push(this.ops); return this; }
  rect(x, y, w, h, { fill, stroke, lw = 1 } = {}) {
    if (fill) this.ops.push(`${rgb(fill)} rg`); if (stroke) this.ops.push(`${rgb(stroke)} RG ${n(lw)} w`);
    this.ops.push(`${n(x)} ${n(y)} ${n(w)} ${n(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`); return this;
  }
  roundRect(x, y, w, h, r, { fill, stroke, lw = 1 } = {}) {
    const k = 0.5523 * r; const o = this.ops;
    if (fill) o.push(`${rgb(fill)} rg`); if (stroke) o.push(`${rgb(stroke)} RG ${n(lw)} w`);
    o.push(`${n(x + r)} ${n(y)} m ${n(x + w - r)} ${n(y)} l ${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`);
    o.push(`${n(x + w)} ${n(y + h - r)} l ${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`);
    o.push(`${n(x + r)} ${n(y + h)} l ${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`);
    o.push(`${n(x)} ${n(y + r)} l ${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c h ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    return this;
  }
  line(x1, y1, x2, y2, { stroke = '#000000', lw = 1 } = {}) { this.ops.push(`${rgb(stroke)} RG ${n(lw)} w ${n(x1)} ${n(y1)} m ${n(x2)} ${n(y2)} l S`); return this; }
  text(s, x, y, { font = 'F1', size = 12, color = '#000000', align = 'left', angle = 0 } = {}) {
    const t = toWinAnsi(s); if (!t) return this;
    const w = textWidth(t, font, size);
    const dx = align === 'center' ? -w / 2 : align === 'right' ? -w : 0;
    const a = (angle * Math.PI) / 180; const c = Math.cos(a); const si = Math.sin(a);
    this.ops.push(`BT /${font} ${n(size)} Tf ${rgb(color)} rg ${n(c)} ${n(si)} ${n(-si)} ${n(c)} ${n(x + dx * c)} ${n(y + dx * si)} Tm ${pdfStr(t)} Tj ET`);
    return this;
  }
  // Wrapped paragraph; returns the y below the last line.
  para(s, x, y, maxW, { font = 'F1', size = 12, leading = 1.35, align = 'left', color = '#000000', maxLines = 99 } = {}) {
    const lines = wrap(s, font, size, maxW).slice(0, maxLines);
    lines.forEach((l, i) => this.text(l, align === 'center' ? x + maxW / 2 : x, y - i * size * leading, { font, size, color, align }));
    return y - lines.length * size * leading;
  }
  build() {
    const objs = []; const add = (s) => { objs.push(s); return objs.length; };
    const catalog = add(null); const pagesId = add(null);
    const fontIds = Object.fromEntries(Object.entries(FONTS).map(([k, base]) => [k, add(`<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding /WinAnsiEncoding >>`)]));
    const fontDict = Object.entries(fontIds).map(([k, id]) => `/${k} ${id} 0 R`).join(' ');
    const kids = [];
    for (const ops of this.pages) {
      const stream = ops.join('\n');
      const contentId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${n(this.w)} ${n(this.h)}] /Resources << /Font << ${fontDict} >> >> /Contents ${contentId} 0 R >>`));
    }
    objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'; const offsets = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff; // every char is < 256 by construction
    return bytes;
  }
}

// ------------------------------------------------------------------ keepsake
const PALETTE = {
  'baby-shower': { accent: '#2f9e8f', soft: '#e6f6f3', ink: '#1f3b39' },
  'bridal-shower': { accent: '#c2577a', soft: '#fbeaf0', ink: '#43202d' },
  'milestone-birthday': { accent: '#d08a10', soft: '#fff4dc', ink: '#3d2a05' },
  default: { accent: '#6b2cff', soft: '#f0eaff', ink: '#221447' },
};
const KIND_LABEL = { advice: 'A LITTLE ADVICE', wish: 'A WISH FOR YOU', prediction: 'A PREDICTION' };

/* entries: [{name, kind, text}] ; opts: {names, theme, themeName, date, paper, watermark, brand, site} */
export function buildKeepsake(entries, { names = 'You', theme, themeName = 'Party', date = '', paper = 'letter', watermark = true, brand = 'PartyDeck', site = '' } = {}) {
  const pal = PALETTE[theme] || PALETTE.default;
  const doc = new PdfDoc(paper); const { w, h } = doc; const m = 44;
  const stamp = () => {
    if (!watermark) return;
    doc.text(brand, w / 2 - 170, h / 2 - 120, { font: 'F2', size: 88, color: '#efefef', angle: 35 });
    doc.text(`Made with ${brand}${site ? ' · ' + site.replace(/^https?:\/\//, '') : ''} — upgrade to remove this watermark`, w / 2, 22, { size: 8, color: '#9a9a9a', align: 'center' });
  };

  // Cover
  doc.page();
  doc.rect(0, 0, w, h, { fill: pal.soft });
  stamp();
  doc.roundRect(m, m, w - 2 * m, h - 2 * m, 18, { stroke: pal.accent, lw: 2 });
  doc.roundRect(m + 10, m + 10, w - 2 * m - 20, h - 2 * m - 20, 12, { stroke: pal.accent, lw: 0.6 });
  doc.text(themeName.toUpperCase(), w / 2, h - 170, { font: 'F2', size: 13, color: pal.accent, align: 'center' });
  doc.line(w / 2 - 60, h - 185, w / 2 + 60, h - 185, { stroke: pal.accent, lw: 1 });
  let y = doc.para(`For ${names}`, m + 30, h / 2 + 90, w - 2 * m - 60, { font: 'F4', size: 40, align: 'center', color: pal.ink, leading: 1.15, maxLines: 3 });
  y = doc.para('Notes, wishes and predictions from the people who love you', m + 50, y - 16, w - 2 * m - 100, { font: 'F3', size: 17, align: 'center', color: pal.ink });
  doc.text(date, w / 2, y - 30, { size: 13, color: pal.ink, align: 'center' });
  doc.text(`${entries.length} ${entries.length === 1 ? 'note' : 'notes'} inside`, w / 2, m + 60, { font: 'F2', size: 11, color: pal.accent, align: 'center' });

  // One card per guest
  for (const e of entries) {
    doc.page();
    doc.rect(0, 0, w, h, { fill: '#ffffff' });
    stamp();
    const cx = m + 20; const cw = w - 2 * (m + 20); const ch = h * 0.62; const cy = (h - ch) / 2 + 20;
    doc.roundRect(cx, cy, cw, ch, 22, { fill: pal.soft, stroke: pal.accent, lw: 1.5 });
    doc.text(KIND_LABEL[e.kind] || 'A NOTE', w / 2, cy + ch - 46, { font: 'F2', size: 12, color: pal.accent, align: 'center' });
    doc.line(w / 2 - 40, cy + ch - 58, w / 2 + 40, cy + ch - 58, { stroke: pal.accent, lw: 0.8 });
    const body = toWinAnsi(e.text); const len = body.length; const size = len > 220 ? 17 : len > 120 ? 20 : 24;
    const lines = wrap(`“${body}”`, 'F3', size, cw - 90);
    const blockH = lines.length * size * 1.4;
    doc.para(`“${body}”`, cx + 45, cy + ch / 2 + blockH / 2 - size, cw - 90, { font: 'F3', size, leading: 1.4, align: 'center', color: pal.ink });
    doc.text(`— ${e.name}`, w / 2, cy + 44, { font: 'F2', size: 15, color: pal.ink, align: 'center' });
    doc.text(`${themeName} · ${date}`, w / 2, cy - 26, { size: 9, color: '#8a8a8a', align: 'center' });
  }
  return doc.build();
}
