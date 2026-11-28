/**
 * What the commands of the grid do to cells, without the screen: filling a series, sorting, the clipboard (to and from
 * other programs: tab-separated text and HTML tables), and the number formats offered in the menus.
 */
import { colName, DEF_H, DEF_W, extent, key, moveFormula, pos } from './model.js';
import { currencyFormat, dateFormat, formatValue, fromSerial, loc, parseInput, plainNumber } from './format.js';

// ------------------------------------------------------------------ number formats of the menus

export function presets(lang, currency) {
  const L = loc(lang);
  return [
    ['general', 'General'],
    ['number', '#,##0.00'],
    ['integer', '#,##0'],
    ['percent', '0.00%'],
    ['percent0', '0%'],
    ['scientific', '0.00E+00'],
    ['currency', currencyFormat(currency, lang, 2)],
    ['currency0', currencyFormat(currency, lang, 0)],
    ['accounting', currencyFormat(currency, lang, 2).replace(/#,##0\.00/, '#,##0.00;[Red]-#,##0.00').replace(/^("[^"]*")(#,##0\.00;\[Red\]-#,##0\.00)$/, '$1#,##0.00;[Red]-$1#,##0.00')],
    ['date', dateFormat(lang)],
    ['datelong', L.dmy === 'mdy' ? 'mmmm d, yyyy' : 'd mmmm yyyy'],
    ['weekday', L.dmy === 'mdy' ? 'dddd, mmmm d, yyyy' : 'dddd d mmmm yyyy'],
    ['monthyear', 'mmmm yyyy'],
    ['time', 'hh:mm'],
    ['timesec', 'hh:mm:ss'],
    ['datetime', dateFormat(lang) + ' hh:mm'],
    ['duration', '[h]:mm:ss'],
    ['fraction', '# ?/?'],
    ['text', '@'],
  ];
}
/** One more or one less decimal in a format. */
export function decimals(nf, d) {
  let f = nf && nf !== 'General' ? nf : '0';
  if (/^@$/.test(f)) return f;
  return f.split(';').map((sec) => {
    const m = /(0|#)(\.(0+))?(?=[^0#.]*$)|(0|#)(\.(0+))?/.exec(sec.replace(/"[^"]*"/g, (q) => '\u0000'.repeat(q.length)));
    if (!m) return sec;
    const i = m.index, whole = m[0], has = whole.includes('.') ? whole.split('.')[1].length : 0, n = Math.max(0, Math.min(10, has + d));
    const repl = whole.split('.')[0] + (n ? '.' + '0'.repeat(n) : '');
    return sec.slice(0, i) + repl + sec.slice(i + whole.length);
  }).join(';');
}
/** The decimals a number of the selection already shows (General: those of the value). */
export const shownDecimals = (v) => { const s = String(+(+v).toPrecision(12)); return s.includes('.') ? s.split('.')[1].length : 0; };

// ------------------------------------------------------------------ series

const lists = (lang) => {
  const tag = loc(lang).tag, f = (o, n, step) => Array.from({ length: n }, (_, i) => new Intl.DateTimeFormat(tag, { ...o, timeZone: 'UTC' }).format(new Date(Date.UTC(2021, step === 'm' ? i : 7, step === 'm' ? 15 : 2 + i))));
  // 2 August 2021 was a Monday
  return [f({ month: 'long' }, 12, 'm'), f({ month: 'short' }, 12, 'm').map((x) => x.replace('.', '')), f({ weekday: 'long' }, 7, 'd'), f({ weekday: 'short' }, 7, 'd').map((x) => x.replace('.', '')),
    ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'], ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], ['Q1', 'Q2', 'Q3', 'Q4']];
};
const cap = (s, like) => (like === like.toUpperCase() ? s.toUpperCase() : like[0] === like[0].toUpperCase() ? s[0].toUpperCase() + s.slice(1) : s.toLowerCase());

/**
 * The values that continue a series of cells (src: the cells in order, from the first one) for n more places.
 * Numbers and dates go on with the same step (one alone: dates by one day, numbers stay); texts ending with a number
 * count; names of months and days go on; formulas move as if copied; everything else repeats.
 */
export function series(src, n, lang, back = false) {
  const out = [], len = src.length, vals = src.map((c) => c?.v);
  const nums = !src.some((c) => c?.f) && vals.every((v) => typeof v === 'number');
  if (nums && len) {
    const isDate = /[dmy]/i.test(src[0]?.s?.nf || '') && !/^\[h\]/.test(src[0]?.s?.nf || '');
    let step = len > 1 ? (vals[len - 1] - vals[0]) / (len - 1) : isDate ? 1 : 0;
    // months: 31/01, 28/02 … or 1st of each month
    const monthly = isDate && len > 1 && vals.every((v, i) => !i || fromSerial(v).d === fromSerial(vals[0]).d) && vals.some((v, i) => i && fromSerial(v).m !== fromSerial(vals[i - 1]).m) && Math.abs(step - 30.4) < 4;
    for (let i = 1; i <= n; i++) {
      const base = back ? vals[0] : vals[len - 1], k = back ? -i : i;
      let v;
      if (monthly) { const d = fromSerial(base), mm = d.m - 1 + k * Math.round((vals[len - 1] - vals[0]) / 30.44 / Math.max(1, len - 1)), t = new Date(Date.UTC(d.y, mm, d.d)); v = (t - Date.UTC(1899, 11, 30)) / 86400000; }
      else v = +(base + step * k).toPrecision(15);
      out.push({ ...(src[back ? 0 : len - 1] || {}), v });
    }
    return back ? out.reverse() : out;
  }
  const L = lists(lang);
  // with empty cells in the pattern it repeats as it is
  if (src.some((c) => !c || c.v === undefined)) return Array.from({ length: n }, (_, i) => { const c = src[back ? (len - 1 - (i % len)) : i % len]; return c ? { ...c } : null; }).map((c, i, a) => (back ? a[a.length - 1 - i] : c));
  for (let i = 1; i <= n; i++) {
    const j = back ? (((len - i) % len) + len) % len : (i - 1) % len, from = back ? 0 : len - 1, cell = src[j];
    if (!cell) { out.push(null); continue; }
    if (cell.f) { const d = back ? -i - (len - 1 - j) + (len - 1 - j) : i + (len - 1) - j; out.push({ ...cell, f: moveFormula(cell.f, cell.__dr ? d : 0, 0), __d: d }); continue; }
    const v = cell.v;
    if (typeof v === 'string') {
      const word = L.find((l) => l.some((x) => x.toLowerCase() === v.toLowerCase()));
      if (word) {
        const at = word.findIndex((x) => x.toLowerCase() === v.toLowerCase()), lastAt = word.findIndex((x) => x.toLowerCase() === String(src[from].v).toLowerCase());
        const step = len > 1 && typeof src[1]?.v === 'string' ? (word.findIndex((x) => x.toLowerCase() === String(src[1].v).toLowerCase()) - word.findIndex((x) => x.toLowerCase() === String(src[0].v).toLowerCase()) + word.length) % word.length || 1 : 1;
        const k = (((lastAt >= 0 ? lastAt : at) + (back ? -i : i) * step) % word.length + word.length) % word.length;
        out.push({ ...cell, v: cap(word[k], v) });
        continue;
      }
      const m = /^(.*?)(\d+)(\D*)$/.exec(v);
      if (m && src.every((c) => typeof c?.v === 'string' && /\d+\D*$/.test(c.v))) {
        const last = /^(.*?)(\d+)(\D*)$/.exec(src[from].v), first = /^(.*?)(\d+)(\D*)$/.exec(src[0].v), step = len > 1 ? (+last[2] - +first[2]) / (len - 1) || 1 : 1;
        const num = Math.max(0, +last[2] + (back ? -(len - 1) * step - i * step : i * step));
        out.push({ ...cell, v: last[1] + String(Math.round(num)).padStart(last[2].length, '0') + last[3] });
        continue;
      }
    }
    out.push({ ...cell });
  }
  return back ? out.reverse() : out;
}

/**
 * Fills `to` (which contains `from`) going on with the series of `from`. Returns the cells to write.
 */
export function fill(sh, from, to, lang) {
  const m = {}, down = to.r2 > from.r2, up = to.r1 < from.r1, right = to.c2 > from.c2, left = to.c1 < from.c1;
  if (down || up) {
    for (let c = from.c1; c <= from.c2; c++) {
      const src = [];
      for (let r = from.r1; r <= from.r2; r++) src.push(sh.cells[key(r, c)] || null);
      const n = down ? to.r2 - from.r2 : from.r1 - to.r1, vals = seriesWith(src, n, lang, up, 'r');
      vals.forEach((x, i) => { m[key(down ? from.r2 + 1 + i : to.r1 + i, c)] = x; });
    }
  } else if (right || left) {
    for (let r = from.r1; r <= from.r2; r++) {
      const src = [];
      for (let c = from.c1; c <= from.c2; c++) src.push(sh.cells[key(r, c)] || null);
      const n = right ? to.c2 - from.c2 : from.c1 - to.c1, vals = seriesWith(src, n, lang, left, 'c');
      vals.forEach((x, i) => { m[key(r, right ? from.c2 + 1 + i : to.c1 + i)] = x; });
    }
  }
  return m;
}
/** A series where formulas move by their distance from the cell they come from. */
function seriesWith(src, n, lang, back, axis) {
  const len = src.length;
  if (src.some((c) => c?.f)) {
    return Array.from({ length: n }, (_, i) => {
      const j = back ? (len - 1 - (i % len)) : i % len, cell = src[j];
      if (!cell) return null;
      const d = back ? -(Math.floor(i / len) + 1) * len : (Math.floor(i / len) + 1) * len;
      return cell.f ? { ...cell, v: undefined, f: axis === 'r' ? moveFormula(cell.f, d, 0) : moveFormula(cell.f, 0, d) } : { ...cell };
    }).map((c, i, a) => (back ? a[a.length - 1 - i] : c)).map((c) => (c ? Object.fromEntries(Object.entries(c).filter(([, v]) => v !== undefined)) : null));
  }
  return series(src, n, lang, back).map((c) => (c ? Object.fromEntries(Object.entries(c).filter(([k, v]) => v !== undefined && !k.startsWith('__'))) : null));
}

// ------------------------------------------------------------------ sorting

/**
 * Sorts the rows of a range by some columns: keys [{c, desc}]. value(r, c) gives what to compare. Returns the cells to
 * write (formulas move with their row).
 */
export function sortRange(sh, g, keys, value, head = false) {
  const r1 = g.r1 + (head ? 1 : 0), rows = [];
  for (let r = r1; r <= g.r2; r++) rows.push(r);
  const cmp = (a, b) => {
    for (const k of keys) {
      const x = value(a, k.c), y = value(b, k.c);
      // empty cells always last
      const ex = x === null || x === '', ey = y === null || y === '';
      if (ex || ey) { if (ex && ey) continue; return ex ? 1 : -1; }
      const rank = (v) => (typeof v === 'number' ? 0 : typeof v === 'string' ? 1 : typeof v === 'boolean' ? 2 : 3);
      let d = rank(x) - rank(y);
      if (!d) d = typeof x === 'string' ? x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }) : typeof x === 'object' ? 0 : x < y ? -1 : x > y ? 1 : 0;
      if (d) return k.desc ? -d : d;
    }
    return a - b;
  };
  const order = [...rows].sort(cmp), m = {};
  order.forEach((from, i) => {
    const to = r1 + i;
    for (let c = g.c1; c <= g.c2; c++) {
      const cell = sh.cells[key(from, c)] || null;
      m[key(to, c)] = cell?.f ? { ...cell, f: moveFormula(cell.f, to - from, 0) } : cell;
    }
  });
  return m;
}

/** The block of filled cells around a cell (Ctrl+A, sorting and filters with one cell chosen). */
export function region(sh, r, c, max = { r: 100000, c: 702 }) {
  const has = (rr, cc) => rr >= 1 && cc >= 1 && rr <= max.r && cc <= max.c && sh.cells[key(rr, cc)]?.v !== undefined || !!sh.cells[key(rr, cc)]?.f;
  let g = { r1: r, c1: c, r2: r, c2: c };
  for (let grew = true, n = 0; grew && n < 2000; n++) {
    grew = false;
    const rowHas = (rr) => { for (let cc = g.c1 - 1; cc <= g.c2 + 1; cc++) if (has(rr, cc)) return true; return false; };
    const colHas = (cc) => { for (let rr = g.r1 - 1; rr <= g.r2 + 1; rr++) if (has(rr, cc)) return true; return false; };
    if (g.r1 > 1 && rowHas(g.r1 - 1)) { g.r1--; grew = true; }
    if (rowHas(g.r2 + 1)) { g.r2++; grew = true; }
    if (g.c1 > 1 && colHas(g.c1 - 1)) { g.c1--; grew = true; }
    if (colHas(g.c2 + 1)) { g.c2++; grew = true; }
  }
  return g;
}
/** The table a single cell is in, for filters, sorting and charts: its region without the title lines on top
 *  (rows above the cell that fill less than half its width: a title, a "Total: 12"), so the header is its first row. */
export function tableAt(sh, r, c, max) {
  const g = region(sh, r, c, max);
  if (g.c1 === g.c2) return g;
  const filled = (rr) => { let n = 0; for (let cc = g.c1; cc <= g.c2; cc++) if (sh.cells[key(rr, cc)]?.v !== undefined || sh.cells[key(rr, cc)]?.f) n++; return n; };
  let most = 0;
  for (let rr = g.r1; rr <= Math.min(g.r2, g.r1 + 500); rr++) most = Math.max(most, filled(rr));
  const need = Math.max(2, Math.ceil(most / 2));
  while (g.r1 < r && filled(g.r1) < need) g.r1++;
  return g;
}

// ------------------------------------------------------------------ pages (printing and PDF)

/** Paper sizes in mm (portrait). The keys are also the names CSS knows for @page. */
export const PAPERS = { A4: [210, 297], A5: [148, 210], A3: [297, 420], letter: [215.9, 279.4], legal: [215.9, 355.6] };
export const PAGE_MARGIN = 12; // mm, on every side
const PAGE_KEY = 'savspreadsheets-page';
/** The page chosen in this browser for printing, and whether its guides are shown on the sheet. */
export function pagePrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PAGE_KEY) || '{}') || {}; } catch { /* nothing kept */ }
  return { paper: PAPERS[p.paper] ? p.paper : 'A4', orient: p.orient === 'landscape' ? 'landscape' : 'portrait', fit: p.fit === 'none' ? 'none' : 'width', guides: !!p.guides };
}
export const setPagePrefs = (o) => localStorage.setItem(PAGE_KEY, JSON.stringify({ ...pagePrefs(), ...o }));
/** The printable part of a page, in CSS pixels. */
export function pageArea(p) {
  const [w, h] = PAPERS[p.paper], k = 96 / 25.4, m = PAGE_MARGIN * 2;
  return p.orient === 'landscape' ? { w: (h - m) * k, h: (w - m) * k } : { w: (w - m) * k, h: (h - m) * k };
}
/** Where the pages of a printed sheet end, as the print makes them: {rows, cols} that start a new page.
 *  "As wide as the page" shrinks a wide table, so its pages hold more rows and never break between columns. */
export function pageBreaks(sh, p) {
  const ext = extent(sh), a = pageArea(p), rows = [], cols = [];
  if (!ext.r || !ext.c) return { rows, cols };
  let total = 0;
  const cw = [];
  for (let c = 1; c <= ext.c; c++) { const x = sh.cols[colName(c)]; cw[c] = x?.x ? 0 : x?.w || DEF_W; total += cw[c]; }
  const scale = p.fit === 'width' && total > a.w ? a.w / total : 1;
  if (p.fit !== 'width') for (let c = 1, acc = 0; c <= ext.c; c++) { if (acc > 0 && acc + cw[c] > a.w) { cols.push(c); acc = 0; } acc += cw[c]; }
  for (let r = 1, acc = 0; r <= ext.r; r++) { const h = sh.rows[r]?.x ? 0 : (sh.rows[r]?.h || DEF_H) * scale; if (acc > 0 && acc + h > a.h) { rows.push(r); acc = 0; } acc += h; }
  return { rows, cols };
}

// ------------------------------------------------------------------ the clipboard

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Tab-separated text, as every spreadsheet copies it. */
export function toTsv(rows) {
  return rows.map((r) => r.map((t) => (/[\t\n"]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t)).join('\t')).join('\n');
}
export function fromTsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const s = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"' && cur === '') { q = true; continue; }
    if (ch === '\t') { row.push(cur); cur = ''; continue; }
    if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; continue; }
    cur += ch;
  }
  row.push(cur);
  rows.push(row);
  return rows;
}
/** An HTML table with the look of the cells (other programs keep bold, colours and alignment). */
export function toHtml(rows) {
  return '<meta charset="utf-8"><table style="border-collapse:collapse">' + rows.map((r) => '<tr>' + r.map((x) => `<td style="${x.css || ''}">${escHtml(x.text)}</td>`).join('') + '</tr>').join('') + '</table>';
}
/** The cells of an HTML table pasted from another program: {rows: [[{text, s}]]}. */
export function fromHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html'), table = doc.querySelector('table');
  if (!table) return null;
  const rows = [], taken = [];
  [...table.rows].forEach((tr, i) => {
    rows[i] ||= [];
    let j = 0;
    for (const td of tr.cells) {
      while (taken[i]?.[j]) j++;
      const st = td.getAttribute('style') || '', s = {};
      if (/font-weight:\s*(bold|[6-9]00)/i.test(st) || td.querySelector('b,strong')) s.b = 1;
      if (/font-style:\s*italic/i.test(st) || td.querySelector('i,em')) s.i = 1;
      if (/text-decoration:[^;]*underline/i.test(st) || td.querySelector('u')) s.u = 1;
      const col = /(?:^|;)\s*color:\s*(#[0-9a-f]{6})/i.exec(st), bg = /background(?:-color)?:\s*(#[0-9a-f]{6})/i.exec(st), al = /text-align:\s*(left|center|right)/i.exec(st);
      if (col) s.c = col[1].toLowerCase();
      if (bg && bg[1].toLowerCase() !== '#ffffff') s.bg = bg[1].toLowerCase();
      if (al) s.ha = al[1][0];
      rows[i][j] = { text: td.innerText ?? td.textContent, s };
      const rs = td.rowSpan || 1, cs = td.colSpan || 1;
      for (let a = 0; a < rs; a++) for (let b = 0; b < cs; b++) if (a || b) { (taken[i + a] ||= [])[j + b] = true; }
      j += cs;
    }
  });
  return { rows: rows.map((r) => Array.from({ length: Math.max(...rows.map((x) => x.length)) }, (_, k) => r[k] || { text: '', s: {} })) };
}
/** Text typed or pasted, made a cell. L: the language to read it in (a list: the first that reads a number wins). */
export function cellFrom(text, L, currency, keepStyle = {}) {
  const list = Array.isArray(L) ? L : [L];
  let p = parseInput(text, list[0], currency);
  for (const x of list.slice(1)) { if (typeof p.v !== 'string' || p.f) break; const q = parseInput(text, x, currency); if (typeof q.v !== 'string') p = q; }
  const s = { ...keepStyle };
  if (p.nf && !s.nf) s.nf = p.nf;
  const c = p.f ? { f: p.f } : p.v === null ? {} : { v: p.v };
  if (Object.keys(s).length) c.s = s;
  return Object.keys(c).length ? c : null;
}
/** A number written so that any program reads it again (CSV, TSV). */
export const machine = (v) => (typeof v === 'number' ? plainNumber(v, loc('en')) : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : v === null || v === undefined ? '' : typeof v === 'object' ? v.code : String(v));
export { formatValue, colName, pos };
