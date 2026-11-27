/**
 * The workbook in memory: addresses, what a workbook may contain (the same lists as lib/clean.php: keep them in step),
 * the changes ("ops") applied here exactly as the server applies them, and the rewriting of the references of the
 * formulas when rows, columns or sheets move.
 */
import { tokenize } from './formula.js';

export const MAX_ROWS = 100000, MAX_COLS = 702, MAX_SHEETS = 200, MAX_TEXT = 32000, MAX_FORMULA = 8000;
export const FONTS = ['sans', 'serif', 'mono', 'round', 'hand', 'narrow'];
export const FONT_STACK = { sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', round: '"Nunito", "Varela Round", "Arial Rounded MT Bold", system-ui, sans-serif', hand: '"Comic Sans MS", "Segoe Print", "Bradley Hand", cursive', narrow: '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", sans-serif-condensed, sans-serif' };
export const BORDER_KINDS = ['thin', 'medium', 'thick', 'dashed', 'dotted', 'double'];
export const CF_KINDS = ['gt', 'lt', 'ge', 'le', 'eq', 'ne', 'between', 'text', 'empty', 'filled', 'dup', 'top', 'scale', 'bars', 'formula'];
export const DV_KINDS = ['list', 'number', 'int', 'date', 'text', 'check'];
export const CHART_KINDS = ['column', 'bar', 'line', 'area', 'pie', 'donut', 'scatter', 'stacked'];
export const SHEET_PROPS = ['name', 'color', 'hidden', 'grid', 'cols', 'rows', 'freeze', 'merges', 'cf', 'dv', 'charts', 'filter', 'perm', 'protect'];
export const SHEET_ROLES = ['none', 'viewer', 'commenter', 'editor'];
export const DEF_W = 100, DEF_H = 24;

const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
export const newId = () => hex(4);

// ------------------------------------------------------------------ addresses

export function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }
export function colNum(s) { let n = 0; for (const ch of s) n = n * 26 + ch.charCodeAt(0) - 64; return n >= 1 && n <= MAX_COLS ? n : 0; }
export const key = (r, c) => colName(c) + r;
/** "B7" → [7, 2] (row, column), or null. */
export function pos(k) {
  const m = /^([A-Z]{1,2})([1-9][0-9]{0,5})$/.exec(k || '');
  if (!m) return null;
  const c = colNum(m[1]), r = +m[2];
  return c && r <= MAX_ROWS ? [r, c] : null;
}
/** "A1:C9" → {r1, c1, r2, c2} in order, or null. */
export function parseRange(s) {
  const [a, b] = String(s || '').split(':'), p = pos(a), q = pos(b || a);
  if (!p || !q) return null;
  return { r1: Math.min(p[0], q[0]), c1: Math.min(p[1], q[1]), r2: Math.max(p[0], q[0]), c2: Math.max(p[1], q[1]) };
}
export const rangeStr = (g) => (g.r1 === g.r2 && g.c1 === g.c2 ? key(g.r1, g.c1) : key(g.r1, g.c1) + ':' + key(g.r2, g.c2));
export const inRange = (g, r, c) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2;
export const validRange = (s) => !!parseRange(s) && /^[A-Z]{1,2}[1-9]\d{0,5}(:[A-Z]{1,2}[1-9]\d{0,5})?$/.test(s);

// ------------------------------------------------------------------ what a workbook may contain

const text = (v, max) => (typeof v === 'string' ? v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').slice(0, max) : '');
const color = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '');
const numIn = (v, a, b) => { const n = typeof v === 'string' && v.trim() !== '' ? +v : v; return typeof n === 'number' && Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : null; };
const border = (v) => { const m = /^([a-z]+) (#[0-9a-f]{6})$/i.exec(v || ''); return m && BORDER_KINDS.includes(m[1]) ? m[1] + ' ' + m[2].toLowerCase() : ''; };

export function cleanStyle(s) {
  if (!s || typeof s !== 'object') return {};
  const o = {};
  for (const k of ['b', 'i', 'u', 'k', 'w']) if (s[k]) o[k] = 1;
  for (const k of ['c', 'bg']) { const c = color(s[k]); if (c) o[k] = c; }
  if (FONTS.includes(s.ff)) o.ff = s.ff;
  const fz = numIn(s.fz, 6, 72); if (fz !== null) o.fz = Math.round(fz * 10) / 10;
  if (['l', 'c', 'r'].includes(s.ha)) o.ha = s.ha;
  if (['t', 'm', 'b'].includes(s.va)) o.va = s.va;
  const nf = text(s.nf, 60); if (nf && nf !== 'General') o.nf = nf;
  for (const k of ['bt', 'br', 'bb', 'bl']) { const b = border(s[k]); if (b) o[k] = b; }
  const ind = numIn(s.ind, 0, 10); if (ind) o.ind = Math.trunc(ind);
  const rot = numIn(s.rot, -90, 90); if (rot) o.rot = Math.trunc(rot);
  return o;
}
export function cleanCell(c) {
  if (!c || typeof c !== 'object') return null;
  const o = {}, v = c.v;
  if (typeof v === 'boolean') o.v = v;
  else if (typeof v === 'number') { if (Number.isFinite(v)) o.v = v; }
  else if (typeof v === 'string' && v !== '') o.v = text(v, MAX_TEXT);
  const f = text(c.f, MAX_FORMULA);
  if (f.length > 1 && f[0] === '=') o.f = f;
  const s = cleanStyle(c.s);
  if (Object.keys(s).length) o.s = s;
  return Object.keys(o).length ? o : null;
}
export const cleanSheetName = (v, def) => { const n = String(v || '').replace(/[[\]:*?/\\\x00-\x1F\x7F]/g, '').trim().slice(0, 60); return n || def; };
function cleanLines(m, cols) {
  const out = {};
  for (const [k, x] of Object.entries(m && typeof m === 'object' ? m : {})) {
    if (cols ? !/^[A-Z]{1,2}$/.test(k) || !colNum(k) : !/^[1-9]\d{0,5}$/.test(k) || +k > MAX_ROWS) continue;
    if (!x || typeof x !== 'object') continue;
    const o = {}, size = numIn(x[cols ? 'w' : 'h'], cols ? 16 : 12, cols ? 1200 : 800);
    if (size !== null) o[cols ? 'w' : 'h'] = Math.round(size);
    if (x.x) o.x = 1;
    const s = cleanStyle(x.s);
    if (Object.keys(s).length) o.s = s;
    if (Object.keys(o).length) out[k] = o;
  }
  return out;
}
const ranges = (v, max) => [...new Set((Array.isArray(v) ? v : []).slice(0, max).filter((r) => validRange(r) && r.includes(':')))];
const scalar = (v, n) => text(['string', 'number', 'boolean'].includes(typeof v) ? String(v) : '', n);
function cleanCf(v) {
  return (Array.isArray(v) ? v : []).slice(0, 100).filter((x) => x && validRange(x.r) && CF_KINDS.includes(x.k)).map((x) => {
    const o = { r: x.r, k: x.k, a: scalar(x.a, 200), b: scalar(x.b, 200), s: cleanStyle(x.s) };
    for (const k of ['c1', 'c2', 'c3']) { const c = color(x[k]); if (c) o[k] = c; }
    return o;
  });
}
const cleanDv = (v) => (Array.isArray(v) ? v : []).slice(0, 100).filter((x) => x && validRange(x.r) && DV_KINDS.includes(x.k)).map((x) => ({ r: x.r, k: x.k, list: (Array.isArray(x.list) ? x.list : []).slice(0, 200).map((i) => scalar(i, 200)).filter(Boolean), a: scalar(x.a, 60), b: scalar(x.b, 60), strict: !!x.strict }));
function cleanCharts(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).slice(0, 50).filter((x) => x && /^[a-z0-9]{4,12}$/.test(x.id) && !seen.has(x.id) && seen.add(x.id) && validRange(x.r) && CHART_KINDS.includes(x.k)).map((x) => {
    const o = { id: x.id, k: x.k, r: x.r, x: Math.trunc(numIn(x.x, 0, 200000) ?? 0), y: Math.trunc(numIn(x.y, 0, 2000000) ?? 0), w: Math.trunc(numIn(x.w, 160, 2000) ?? 480), h: Math.trunc(numIn(x.h, 120, 1400) ?? 300), title: text(x.title, 120), legend: x.legend !== false, head: x.head !== false, rows: !!x.rows };
    const c = color(x.color); if (c) o.color = c;
    return o;
  });
}
function cleanFilter(v) {
  if (!v || !validRange(v.r)) return null;
  const h = {};
  for (const [c, vals] of Object.entries(v.h && typeof v.h === 'object' ? v.h : {})) if (colNum(c) && Array.isArray(vals) && vals.length) h[c] = vals.slice(0, 2000).map((x) => scalar(x, 200));
  const o = { r: v.r, h };
  if (/^[A-Z]{1,2}$/.test(v.sort || '') && colNum(v.sort)) o.sort = v.sort;
  o.desc = !!v.desc;
  return o;
}
const email = (v) => { const e = String(v || '').trim().toLowerCase(); return e.length <= 190 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : ''; };
/** Who may do what on a sheet: {"email" | "*": none | viewer | commenter | editor} (only the owner sets it). */
function cleanPerm(v) {
  const out = {};
  for (const [k, r] of Object.entries(v && typeof v === 'object' ? v : {}).slice(0, 300)) { const kk = k === '*' ? '*' : email(k); if (kk && SHEET_ROLES.includes(r)) out[kk] = r; }
  return out;
}
/**
 * Protected ranges: [{id, r, out, who, editors, users, note}] for the owner; [{id, r, out, note, mine}] as the others
 * receive them. out: the whole sheet but r is protected · who "all": for everybody but the editors, "some": only for the users.
 */
function cleanProtect(v) {
  const seen = new Set();
  return (Array.isArray(v) ? v : []).slice(0, 100).filter((x) => x && validRange(x.r)).map((x) => {
    const id = /^[a-z0-9]{4,12}$/.test(x.id) && !seen.has(x.id) ? x.id : newId();
    seen.add(id);
    const list = (v) => [...new Set((Array.isArray(v) ? v : []).map(email).filter(Boolean))].slice(0, 300);
    const o = { id, r: x.r, out: !!x.out, who: x.who === 'some' ? 'some' : 'all', editors: list(x.editors), users: list(x.users), note: text(x.note, 200) };
    if ('mine' in x) o.mine = !!x.mine;
    return o;
  });
}
export function cleanProps(p, only = SHEET_PROPS) {
  const o = {};
  for (const k of only) {
    if (!(k in p)) continue;
    const v = p[k];
    if (k === 'name') o.name = cleanSheetName(v, 'Sheet');
    else if (k === 'color') o.color = color(v);
    else if (k === 'hidden') o.hidden = !!v;
    else if (k === 'grid') o.grid = v !== false;
    else if (k === 'cols') o.cols = cleanLines(v, true);
    else if (k === 'rows') o.rows = cleanLines(v, false);
    else if (k === 'freeze') o.freeze = { r: Math.trunc(numIn(v?.r, 0, 100) ?? 0), c: Math.trunc(numIn(v?.c, 0, 50) ?? 0) };
    else if (k === 'merges') o.merges = ranges(v, 3000);
    else if (k === 'cf') o.cf = cleanCf(v);
    else if (k === 'dv') o.dv = cleanDv(v);
    else if (k === 'charts') o.charts = cleanCharts(v);
    else if (k === 'filter') o.filter = cleanFilter(v);
    else if (k === 'perm') o.perm = cleanPerm(v);
    else if (k === 'protect') o.protect = cleanProtect(v);
  }
  return o;
}
export function cleanCells(m) {
  const out = {};
  for (const [k, c] of Object.entries(m && typeof m === 'object' ? m : {})) { if (!pos(k)) continue; const x = cleanCell(c); if (x) out[k] = x; }
  return out;
}
export function cleanSheet(s, n) {
  s = s && typeof s === 'object' ? s : {};
  const p = cleanProps({ name: '', color: '', hidden: false, grid: true, cols: {}, rows: {}, freeze: {}, merges: [], cf: [], dv: [], charts: [], filter: null, perm: {}, protect: [], ...s });
  if (p.name === 'Sheet') p.name = 'Sheet' + n;
  return { id: /^[a-z0-9]{4,12}$/.test(s.id) ? s.id : newId(), ...p, cells: cleanCells(s.cells) };
}
export function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {};
  return {
    lang: /^[a-z]{2}(-[A-Z]{2})?$/.test(s.lang || '') ? s.lang : 'en',
    currency: ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CNY', 'INR', 'BRL', 'SEK', 'PLN'].includes(s.currency) ? s.currency : 'EUR',
    font: FONTS.includes(s.font) ? s.font : 'sans', fontSize: numIn(s.fontSize, 7, 24) ?? 10, accent: color(s.accent) || '#4d7c0f',
    active: /^[a-z0-9]{4,12}$/.test(s.active || '') ? s.active : '',
    noComments: !!s.noComments, noDownload: !!s.noDownload, noCopy: !!s.noCopy,
  };
}
export function cleanBook(b) {
  const seen = new Set(), sheets = [];
  (Array.isArray(b?.sheets) ? b.sheets : []).slice(0, MAX_SHEETS).forEach((s, i) => { const c = cleanSheet(s, i + 1); if (!seen.has(c.id)) { seen.add(c.id); sheets.push(c); } });
  if (!sheets.length) sheets.push(cleanSheet({ name: 'Sheet1' }, 1));
  return { settings: cleanSettings(b?.settings), sheets };
}
/** What comes from the server: PHP writes an empty map as [] */
export function normalize(book) {
  const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  for (const s of book.sheets) {
    s.cells = obj(s.cells); s.cols = obj(s.cols); s.rows = obj(s.rows);
    s.merges ||= []; s.cf ||= []; s.dv ||= []; s.charts ||= []; s.freeze ||= { r: 0, c: 0 }; s.perm = obj(s.perm); s.protect ||= [];
    if (s.filter) s.filter.h = obj(s.filter.h);
    if (s.grid === undefined) s.grid = true;
  }
  return book;
}
export const words = (book) => book.sheets.reduce((n, s) => n + Object.values(s.cells).filter((c) => c.v !== undefined || c.f).length, 0);

// ------------------------------------------------------------------ changes, as the server applies them (lib/clean.php apply_ops)

export function shiftKey(k, axis, at, n) {
  const p = pos(k);
  if (!p) return null;
  let [r, c] = p, x = axis === 'r' ? r : c;
  if (x >= at) { if (n < 0 && x < at - n) return null; x += n; }
  if (x < 1 || x > (axis === 'r' ? MAX_ROWS : MAX_COLS)) return null;
  return axis === 'r' ? key(x, c) : key(r, x);
}
export function shiftRange(rg, axis, at, n) {
  const g = parseRange(rg);
  if (!g) return null;
  const mv = (x, end) => (x < at ? x : n < 0 && x < at - n ? (end ? at - 1 : at) : x + n);
  const [a, b] = axis === 'r' ? ['r1', 'r2'] : ['c1', 'c2'], lo = mv(g[a], false), hi = mv(g[b], true);
  if (hi < lo) return null;
  g[a] = lo; g[b] = hi;
  return rg.includes(':') ? key(g.r1, g.c1) + ':' + key(g.r2, g.c2) : key(g.r1, g.c1);
}
function shiftSheet(sh, axis, at, n) {
  const cells = {};
  for (const [k, c] of Object.entries(sh.cells)) { const k2 = shiftKey(k, axis, at, n); if (k2) cells[k2] = c; }
  sh.cells = cells;
  const which = axis === 'r' ? 'rows' : 'cols', lines = {};
  for (const [k, x] of Object.entries(sh[which])) {
    let i = axis === 'r' ? +k : colNum(k);
    if (i >= at) { if (n < 0 && i < at - n) continue; i += n; }
    if (i < 1 || i > (axis === 'r' ? MAX_ROWS : MAX_COLS)) continue;
    lines[axis === 'r' ? String(i) : colName(i)] = x;
  }
  sh[which] = lines;
  sh.merges = sh.merges.map((m) => shiftRange(m, axis, at, n)).filter((m) => m && m.includes(':') && m.split(':')[0] !== m.split(':')[1]);
  for (const k of ['cf', 'dv', 'charts', 'protect']) sh[k] = (sh[k] || []).map((x) => { const r = shiftRange(x.r, axis, at, n); return r ? { ...x, r } : null; }).filter(Boolean);
  if (sh.filter) { const r = shiftRange(sh.filter.r, axis, at, n); sh.filter = r ? { ...sh.filter, r } : null; }
}

/** Applies one op to the workbook (mutates it). Returns the ids of the sheets it touched. */
export function applyOp(book, op, setTitle) {
  const find = (id) => book.sheets.find((s) => s.id === id);
  const at = (after) => (after ? book.sheets.findIndex((s) => s.id === after) + 1 || book.sheets.length : 0);
  switch (op.t) {
    case 'cells': { const sh = find(op.s); if (!sh) return []; sh.cells = { ...sh.cells }; for (const [k, c] of Object.entries(op.m)) { if (c) sh.cells[k] = c; else delete sh.cells[k]; } return [op.s]; }
    case 'shift': { const sh = find(op.s); if (!sh) return []; shiftSheet(sh, op.a, op.at, op.n); return [op.s]; }
    case 'sheet': { const sh = find(op.id); if (!sh) return []; Object.assign(sh, structuredClone(op.p)); if (sh.filter) sh.filter.h ||= {}; return [op.id]; }
    case 'addsheet': { if (find(op.id)) return []; const s = normalize({ sheets: [structuredClone(op.sheet)] }).sheets[0]; s.id = op.id; book.sheets.splice(at(op.after), 0, s); return [op.id]; }
    case 'delsheet': { const i = book.sheets.findIndex((s) => s.id === op.id); if (i < 0 || book.sheets.length < 2) return []; book.sheets.splice(i, 1); return [op.id]; }
    case 'movsheet': { const i = book.sheets.findIndex((s) => s.id === op.id); if (i < 0) return []; const [s] = book.sheets.splice(i, 1); book.sheets.splice(at(op.after), 0, s); return [op.id]; }
    case 'settings': book.settings = { ...op.s }; return [];
    case 'title': setTitle?.(op.title); return [];
  }
  return [];
}

/** The ops that bring the workbook back to `before` (a snapshot taken with snapshot()). */
export function snapshot(book, ids) {
  return { order: book.sheets.map((s) => s.id), settings: book.settings, sheets: new Map(book.sheets.filter((s) => !ids || ids.includes(s.id)).map((s) => [s.id, { ...s, cells: s.cells }])) };
}
export function diffBack(book, snap) {
  const ops = [], now = new Map(book.sheets.map((s) => [s.id, s]));
  for (const s of book.sheets) if (!snap.order.includes(s.id)) ops.push({ t: 'delsheet', id: s.id });
  snap.order.forEach((id, i) => { if (!now.has(id) && snap.sheets.has(id)) ops.push({ t: 'addsheet', id, after: snap.order[i - 1] || '', sheet: structuredClone(snap.sheets.get(id)) }); });
  for (const [id, old] of snap.sheets) {
    const cur = now.get(id);
    if (!cur) continue;
    const p = {};
    for (const k of SHEET_PROPS) if (JSON.stringify(cur[k] ?? null) !== JSON.stringify(old[k] ?? null)) p[k] = structuredClone(old[k] ?? null);
    if (Object.keys(p).length) ops.push({ t: 'sheet', id, p });
    if (cur.cells !== old.cells) {
      const m = {};
      for (const [k, c] of Object.entries(old.cells)) if (cur.cells[k] !== c) m[k] = c;
      for (const k of Object.keys(cur.cells)) if (!(k in old.cells)) m[k] = null;
      if (Object.keys(m).length) ops.push({ t: 'cells', s: id, m });
    }
  }
  // the order of the sheets, as it was
  const order = book.sheets.map((s) => s.id).filter((id) => snap.order.includes(id));
  const want = snap.order.filter((id) => order.includes(id) || ops.some((o) => o.t === 'addsheet' && o.id === id));
  if (order.join() !== snap.order.filter((id) => order.includes(id)).join()) want.forEach((id, i) => ops.push({ t: 'movsheet', id, after: want[i - 1] || '' }));
  if (JSON.stringify(book.settings) !== JSON.stringify(snap.settings)) ops.push({ t: 'settings', s: snap.settings });
  return ops;
}

// ------------------------------------------------------------------ references in formulas

/** Quotes a sheet name when a formula needs it. */
export const sheetRef = (name) => (/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && !/^[A-Z]{1,3}\d+$/i.test(name) ? name : `'${name.replace(/'/g, "''")}'`);

/**
 * Rewrites every reference of a formula: fn(ref) gets {sheet (name or null), r1, c1, r2, c2, ar1, ac1, ar2, ac2, kind}
 * (kind: cell, range, cols, rows) and returns a new one, null for #REF!, or undefined to leave it.
 */
export function rewrite(f, fn) {
  let toks;
  try { toks = tokenize(f.slice(1)); } catch { return f; }
  let out = '=', changed = false;
  for (const tk of toks) {
    if (tk.t !== 'ref') { out += tk.src; continue; }
    const r = fn({ ...tk.ref });
    if (r === undefined) { out += tk.src; continue; }
    changed = true;
    out += r === null ? '#REF!' : refText(r);
  }
  return changed ? out : f;
}
export function refText(r) {
  const sh = r.sheet ? sheetRef(r.sheet) + '!' : '';
  const cell = (row, col, ar, ac) => (ac ? '$' : '') + colName(col) + (ar ? '$' : '') + row;
  if (r.kind === 'cols') return sh + (r.ac1 ? '$' : '') + colName(r.c1) + ':' + (r.ac2 ? '$' : '') + colName(r.c2);
  if (r.kind === 'rows') return sh + (r.ar1 ? '$' : '') + r.r1 + ':' + (r.ar2 ? '$' : '') + r.r2;
  if (r.kind === 'cell') return sh + cell(r.r1, r.c1, r.ar1, r.ac1);
  return sh + cell(r.r1, r.c1, r.ar1, r.ac1) + ':' + cell(r.r2, r.c2, r.ar2, r.ac2);
}
const same = (a, b) => a && b && a.toLowerCase() === b.toLowerCase();

/** A formula copied from one cell to another (dr rows, dc columns away): relative references move with it. */
export function moveFormula(f, dr, dc) {
  if (!dr && !dc) return f;
  return rewrite(f, (r) => {
    if (r.kind !== 'cols') { if (!r.ar1) r.r1 += dr; if (!r.ar2) r.r2 += dr; }
    if (r.kind !== 'rows') { if (!r.ac1) r.c1 += dc; if (!r.ac2) r.c2 += dc; }
    if ((r.kind !== 'cols' && (r.r1 < 1 || r.r2 < 1 || r.r1 > MAX_ROWS || r.r2 > MAX_ROWS)) || (r.kind !== 'rows' && (r.c1 < 1 || r.c2 < 1 || r.c1 > MAX_COLS || r.c2 > MAX_COLS))) return null;
    return r;
  });
}

/** References to rows or columns that were added or removed on sheet `name` (home: the name of the sheet of the formula). */
export function shiftFormula(f, home, name, axis, at, n) {
  return rewrite(f, (r) => {
    if (!same(r.sheet || home, name)) return undefined;
    const [a, b, lim] = axis === 'r' ? ['r1', 'r2', MAX_ROWS] : ['c1', 'c2', MAX_COLS];
    if ((axis === 'r' && r.kind === 'cols') || (axis === 'c' && r.kind === 'rows')) return undefined;
    const mv = (x, end) => (x < at ? x : n < 0 && x < at - n ? (end ? at - 1 : at) : x + n);
    const lo = mv(r[a], false), hi = mv(r[b], true);
    if (r.kind === 'cell' ? n < 0 && r[a] >= at && r[a] < at - n : hi < lo) return null;
    if (lo === r[a] && hi === r[b]) return undefined;
    r[a] = Math.min(lim, lo); r[b] = Math.min(lim, r.kind === 'cell' ? lo : hi);
    return r;
  });
}
export const renameInFormula = (f, from, to) => rewrite(f, (r) => (r.sheet && same(r.sheet, from) ? { ...r, sheet: to } : undefined));
export const dropSheetInFormula = (f, name) => rewrite(f, (r) => (r.sheet && same(r.sheet, name) ? null : undefined));

/**
 * Everything that adding (n > 0) or removing (n < 0) rows or columns needs: the shift itself and the formulas of every
 * sheet rewritten, in one list of ops that the server applies in this same order.
 */
export function shiftOps(book, sid, axis, at, n) {
  const sh = book.sheets.find((s) => s.id === sid), ops = [{ t: 'shift', s: sid, a: axis, at, n }];
  for (const s of book.sheets) {
    const m = {};
    for (const [k, c] of Object.entries(s.cells)) {
      if (!c.f) continue;
      const f = shiftFormula(c.f, s.name, sh.name, axis, at, n);
      if (f === c.f) continue;
      // on the shifted sheet the cell itself moves too: it is written at its new place
      const k2 = s.id === sid ? shiftKey(k, axis, at, n) : k;
      if (k2) m[k2] = { ...c, f };
    }
    if (Object.keys(m).length) ops.push({ t: 'cells', s: s.id, m });
    // conditional formats written as formulas
    if (s.cf.some((x) => x.k === 'formula')) {
      const cf = s.cf.map((x) => (x.k === 'formula' ? { ...x, a: shiftFormula('=' + x.a.replace(/^=/, ''), s.name, sh.name, axis, at, n).slice(1) } : x));
      if (JSON.stringify(cf) !== JSON.stringify(s.cf)) ops.push({ t: 'sheet', id: s.id, p: { cf: s.id === sid ? cf.map((x) => ({ ...x, r: shiftRange(x.r, axis, at, n) })).filter((x) => x.r) : cf } });
    }
  }
  return ops;
}
/** A sheet renamed: the formulas of the whole workbook follow it. */
export function renameOps(book, sid, name) {
  const sh = book.sheets.find((s) => s.id === sid), ops = [{ t: 'sheet', id: sid, p: { name } }];
  for (const s of book.sheets) {
    const m = {};
    for (const [k, c] of Object.entries(s.cells)) if (c.f) { const f = renameInFormula(c.f, sh.name, name); if (f !== c.f) m[k] = { ...c, f }; }
    if (Object.keys(m).length) ops.push({ t: 'cells', s: s.id, m });
  }
  return ops;
}
export function uniqueName(book, base) {
  const names = new Set(book.sheets.map((s) => s.name.toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) { const n = `${base} ${i}`.slice(0, 60); if (!names.has(n.toLowerCase())) return n; }
}

// ------------------------------------------------------------------ size of a sheet

/** The last row and column that hold something (cells, merges, charts). */
export function extent(sh) {
  let r = 0, c = 0;
  for (const k in sh.cells) { const p = pos(k); if (p) { if (p[0] > r) r = p[0]; if (p[1] > c) c = p[1]; } }
  for (const m of sh.merges) { const g = parseRange(m); if (g) { r = Math.max(r, g.r2); c = Math.max(c, g.c2); } }
  return { r, c };
}
/** The look of a cell: the column's, then the row's, then its own. */
export function styleAt(sh, r, c, cell) {
  const cs = sh.cols[colName(c)]?.s, rs = sh.rows[r]?.s, own = cell?.s;
  return cs || rs ? { ...cs, ...rs, ...own } : own || {};
}
export const mergeAt = (sh, r, c) => { for (const m of sh.merges) { const g = parseRange(m); if (g && inRange(g, r, c)) return g; } return null; };
