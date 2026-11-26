/**
 * What a board is and may contain (the same list as lib/boards.php: keep them in step), its ready-made papers and the
 * colours of the tools. Coordinates are units of the board: unlimited in every direction, 1 unit = 1 pixel at 100%.
 *
 * settings {bg, pat (none | dots | grid | lines | iso | staff | tab | mm | hex), gap, pc (colour of the pattern, '' = automatic), view {x, y, z}}
 * items    stroke {tool, c, s, p: [x, y, pressure…]} · shape {k, x, y, w, h, c, s, f, d} · text {x, y, w, text, c, fs, ff, al, b}
 *          note {x, y, w, h, text, f, c, fs} · image {x, y, w, h, src: m:<id> (a picture of the account) or a data: URL}
 */

export const TOOLS = ['pen', 'pencil', 'marker'];
export const SHAPES = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
export const FONTS = { sans: 'Inter, system-ui, sans-serif', serif: '"IBM Plex Serif", Georgia, serif', mono: '"IBM Plex Mono", ui-monospace, monospace', hand: 'Caveat, "Segoe Print", cursive' };
export const PATTERNS = ['none', 'dots', 'grid', 'lines', 'iso', 'staff', 'tab', 'mm', 'hex'];
/** Music staves and tablature: gap is the height of one staff (top line to bottom line). mm: gap is the big square. */
export const MUSIC = ['staff', 'tab'];

/** Inks for light papers, and the chalk ones that read on dark papers. */
export const INKS = ['#1c1c1c', '#5f6660', '#b3261e', '#d85a30', '#b7791f', '#0f6e56', '#0f5f8f', '#1d4e89', '#5b4cf0', '#a1328c', '#ffffff'];
export const CHALK = ['#f4f1e8', '#b8bec6', '#ff6b6b', '#ffb35c', '#ffd166', '#7ee0a8', '#7cc4ff', '#9fb4ff', '#c6a8ff', '#ff8fc7', '#1c1c1c'];
export const HIGHLIGHT = ['#ffe14d', '#9be27a', '#7cc4ff', '#ff8fc7', '#ffb35c', '#c6a8ff'];
export const PAPERS = ['#fff3a3', '#ffd9b8', '#ffc9c9', '#d3f3d8', '#cdeaf7', '#e3dcfb', '#f9d5ec', '#ffffff'];
export const BACKS = ['#ffffff', '#fffdf6', '#f5f1e6', '#eef1f4', '#e8f0e8', '#d9c3a0', '#1d2026', '#22372f', '#16324f', '#0f0f10'];

/** Ready-made papers of a new board. */
export const TEMPLATES = [
  ['dots', 'dots', { bg: '#ffffff', pat: 'dots', gap: 24 }],
  ['blank', 'blank', { bg: '#ffffff', pat: 'none', gap: 24 }],
  ['grid', 'grid-3x3', { bg: '#ffffff', pat: 'grid', gap: 24 }],
  ['lines', 'lines', { bg: '#fffdf6', pat: 'lines', gap: 32 }],
  ['staff', 'staff', { bg: '#fffdf6', pat: 'staff', gap: 48 }],
  ['mm', 'mm', { bg: '#fffdf6', pat: 'mm', gap: 40, pc: '#f0a878' }],
  ['black', 'whiteboard', { bg: '#1d2026', pat: 'dots', gap: 24 }],
  ['green', 'whiteboard', { bg: '#22372f', pat: 'none', gap: 24 }],
  ['iso', 'iso', { bg: '#ffffff', pat: 'iso', gap: 28 }],
  ['hex', 'hex', { bg: '#ffffff', pat: 'hex', gap: 22 }],
  ['tab', 'tab', { bg: '#ffffff', pat: 'tab', gap: 50 }],
  ['chalkstaff', 'staff', { bg: '#22372f', pat: 'staff', gap: 56 }],
  ['blueprint', 'grid-3x3', { bg: '#16324f', pat: 'grid', gap: 24 }],
  ['kraft', 'blank', { bg: '#d9c3a0', pat: 'dots', gap: 24 }],
];

/** Where a picture is: m:<id> are the pictures of the account (kept by the server), data: URLs are inside the board. */
export const mediaUrl = (src) => (src?.startsWith('m:') ? 'api/?r=media&id=' + src.slice(2) : src || '');

export const uid = () => { const a = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = ''; const r = crypto.getRandomValues(new Uint8Array(12)); for (const x of r) s += a[x % a.length]; return s; };
export const r2 = (n) => Math.round(n * 100) / 100;

/** Light of a colour (0 black – 1 white), as the eye sees it. */
export function luma(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 1;
  const n = parseInt(m[1], 16), c = [n >> 16, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
  return .2126 * c[0] + .7152 * c[1] + .0722 * c[2];
}
export const isDark = (hex) => luma(hex) < .18;
/** The colour of the watermark: chosen, or a quiet one that reads on the background. */
export const patternColor = (s) => s.pc || (MUSIC.includes(s.pat) ? (isDark(s.bg) ? 'rgba(255,255,255,.42)' : 'rgba(30,40,60,.45)') : isDark(s.bg) ? 'rgba(255,255,255,.2)' : 'rgba(30,40,60,.2)');
/** The inks shown for a background. */
export const inksFor = (bg) => (isDark(bg) ? CHALK : INKS);
/** Black ink on a dark board becomes chalk, and chalk on a light board becomes black: what is drawn is always seen. */
export function inkOn(c, bg) {
  const dark = isDark(bg);
  if (dark && luma(c) < .03) return CHALK[0];
  if (!dark && luma(c) > .85) return INKS[0];
  return c;
}

export const defaultSettings = (p = {}) => ({ bg: p.bg || '#ffffff', pat: PATTERNS.includes(p.pat) ? p.pat : 'dots', gap: 24, pc: '' });

// ------------------------------------------------------------------ cleaning (files opened from the device)

const num = (v, min = -1e7, max = 1e7, d = 0) => { const f = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(f) ? r2(Math.max(min, Math.min(max, f))) : d; };
const col = (v, d = '') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const txt = (v, max) => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, max) : '');

export function cleanSettings(s = {}) {
  const o = { bg: col(s.bg, '#ffffff'), pat: pick(s.pat, PATTERNS, 'dots'), gap: num(s.gap, 8, 160, 24), pc: col(s.pc, '') };
  if (s.view && typeof s.view === 'object') o.view = { x: num(s.view.x), y: num(s.view.y), z: num(s.view.z, .05, 20, 1) };
  return o;
}

export function cleanItem(i) {
  if (!i || typeof i !== 'object' || typeof i.id !== 'string' || !/^[A-Za-z0-9_-]{1,24}$/.test(i.id)) return null;
  const id = i.id;
  switch (i.t) {
    case 'stroke': {
      if (!Array.isArray(i.p) || i.p.length < 3 || i.p.length > 60000) return null;
      const p = i.p.slice(0, i.p.length - (i.p.length % 3)).map((v, n) => (n % 3 === 2 ? num(v, 0, 1, .5) : num(v)));
      return { id, t: 'stroke', tool: pick(i.tool, TOOLS, 'pen'), c: col(i.c, '#1c1c1c'), s: num(i.s, .5, 400, 4), p };
    }
    case 'shape': {
      const k = pick(i.k, SHAPES, 'rect'), line = k === 'line' || k === 'arrow';
      return { id, t: 'shape', k, x: num(i.x), y: num(i.y), w: line ? num(i.w) : Math.abs(num(i.w)), h: line ? num(i.h) : Math.abs(num(i.h)), c: col(i.c, '#1c1c1c'), s: num(i.s, .5, 200, 4), f: col(i.f, ''), d: !!i.d };
    }
    case 'text':
      return { id, t: 'text', x: num(i.x), y: num(i.y), w: num(i.w, 0, 1e5), text: txt(i.text, 20000), c: col(i.c, '#1c1c1c'), fs: num(i.fs, 4, 2000, 28), ff: pick(i.ff, Object.keys(FONTS), 'sans'), al: pick(i.al, ['left', 'center', 'right'], 'left'), b: !!i.b };
    case 'note':
      return { id, t: 'note', x: num(i.x), y: num(i.y), w: Math.max(20, Math.abs(num(i.w, -1e7, 1e7, 200))), h: Math.max(20, Math.abs(num(i.h, -1e7, 1e7, 200))), text: txt(i.text, 5000), f: col(i.f, '#fff3a3'), c: col(i.c, '#1c1c1c'), fs: num(i.fs, 4, 400, 22) };
    case 'image':
      if (typeof i.src !== 'string' || !(/^m:[a-f0-9]{32}$/.test(i.src) || (i.src.length <= 4e6 && /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(i.src)))) return null;
      return { id, t: 'image', x: num(i.x), y: num(i.y), w: Math.max(1, Math.abs(num(i.w, -1e7, 1e7, 1))), h: Math.max(1, Math.abs(num(i.h, -1e7, 1e7, 1))), src: i.src };
  }
  return null;
}

export function cleanItems(list) {
  const seen = new Set(), out = [];
  for (const i of Array.isArray(list) ? list : []) { const c = cleanItem(i); if (!c || seen.has(c.id)) continue; seen.add(c.id); out.push(c); if (out.length >= 50000) break; }
  return out;
}

/** The same items with new ids (duplicate, paste, open a file twice). */
export const freshIds = (list) => list.map((i) => ({ ...i, id: uid() }));
