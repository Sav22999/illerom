/**
 * What a notebook is and may contain (the same list as lib/notebooks.php: keep them in step), its sizes of sheet, its
 * papers and the colours of the tools. Coordinates of a sheet are units of the page: 1 unit = 1 CSS pixel at 100%
 * (96 per inch), from the top left corner of the sheet; an A4 sheet is 794 × 1123.
 *
 * settings {cover, size (a4 | a5 | letter | square | wide), orient (p | l), font (sans | serif | mono | hand), tsize (s | m | l),
 *           paper {bg, pat, gap, pc}: the paper of new sheets, view {z, at}}
 * sheet    {id, bg, pat (none | dots | grid | lines | ruled | cornell | iso | staff | tab | mm | hex), gap, pc, doc (typed text, a small set of HTML), items}
 * items    stroke {tool, c, s, p: [x, y, pressure…]} · shape {k, x, y, w, h, c, s, f, d} · image {x, y, w, h, src}
 */

export const TOOLS = ['pen', 'pencil', 'marker'];
export const SHAPES = ['rect', 'ellipse', 'diamond', 'triangle', 'line', 'arrow'];
export const FONTS = { sans: 'Inter, system-ui, sans-serif', serif: '"IBM Plex Serif", Georgia, serif', mono: '"IBM Plex Mono", ui-monospace, monospace', hand: 'Caveat, "Segoe Print", cursive' };
export const PATTERNS = ['none', 'dots', 'grid', 'lines', 'ruled', 'cornell', 'iso', 'staff', 'tab', 'mm', 'hex'];
/** Music staves and tablature: gap is the height of one staff (top line to bottom line). mm: gap is the big square. */
export const MUSIC = ['staff', 'tab'];
/** Patterns made of lines: the typed text sits on them. */
export const LINED = ['grid', 'lines', 'ruled', 'cornell'];
export const SIZES = { a4: [794, 1123], a5: [559, 794], letter: [816, 1056], square: [840, 840], wide: [1280, 720] };
export const TSIZES = ['s', 'm', 'l'];

/** Inks for light papers, and the chalk ones that read on dark papers. */
export const INKS = ['#1c1c1c', '#5f6660', '#b3261e', '#d85a30', '#b7791f', '#0f6e56', '#0f5f8f', '#1d4e89', '#5b4cf0', '#a1328c', '#ffffff'];
export const CHALK = ['#f4f1e8', '#b8bec6', '#ff6b6b', '#ffb35c', '#ffd166', '#7ee0a8', '#7cc4ff', '#9fb4ff', '#c6a8ff', '#ff8fc7', '#1c1c1c'];
export const HIGHLIGHT = ['#ffe14d', '#9be27a', '#7cc4ff', '#ff8fc7', '#ffb35c', '#c6a8ff'];
export const PAPERS = ['#fff3a3', '#ffd9b8', '#ffc9c9', '#d3f3d8', '#cdeaf7', '#e3dcfb', '#f9d5ec', '#ffffff'];
export const BACKS = ['#ffffff', '#fffdf6', '#f7f1e3', '#eef1f4', '#e8f0e8', '#fdf0f3', '#d9c3a0', '#1d2026', '#22372f', '#16324f'];
/** Covers of the notebooks: the colours of school notebooks. */
export const COVERS = ['#7b5434', '#b3261e', '#d85a30', '#c9932b', '#5f7a1f', '#0f6e56', '#0f5f8f', '#1d4e89', '#5b4cf0', '#a1328c', '#3b3f46', '#1c1c1c'];
/** Text colours and highlights of the typed text. */
export const TEXT_INKS = ['#1c1c1c', '#5f6660', '#b3261e', '#d85a30', '#b7791f', '#0f6e56', '#0f5f8f', '#1d4e89', '#5b4cf0', '#a1328c'];
export const TEXT_MARKS = ['#fff3a3', '#d3f3d8', '#cdeaf7', '#f9d5ec', '#ffd9b8', '#e3dcfb'];

/** Ready-made papers of a new notebook. */
export const TEMPLATES = [
  ['lines', 'lines', { bg: '#ffffff', pat: 'lines', gap: 30 }],
  ['grid', 'grid-3x3', { bg: '#ffffff', pat: 'grid', gap: 20 }],
  ['ruled', 'ruled', { bg: '#fffdf6', pat: 'ruled', gap: 30 }],
  ['dots', 'dots', { bg: '#ffffff', pat: 'dots', gap: 24 }],
  ['blank', 'blank', { bg: '#ffffff', pat: 'none', gap: 24 }],
  ['cornell', 'cornell', { bg: '#ffffff', pat: 'cornell', gap: 30 }],
  ['staff', 'staff', { bg: '#fffdf6', pat: 'staff', gap: 32 }],
  ['mm', 'mm', { bg: '#fffdf6', pat: 'mm', gap: 40, pc: '#f0a878' }],
  ['iso', 'iso', { bg: '#ffffff', pat: 'iso', gap: 26 }],
  ['hex', 'hex', { bg: '#ffffff', pat: 'hex', gap: 16 }],
  ['tab', 'tab', { bg: '#ffffff', pat: 'tab', gap: 35 }],
  ['cream', 'lines', { bg: '#f7f1e3', pat: 'lines', gap: 30 }],
  ['dark', 'dots', { bg: '#1d2026', pat: 'dots', gap: 24 }],
];

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
/** The colour of the watermark: chosen, or a quiet one that reads on the paper (lines are the blue of school paper). */
export const patternColor = (s) => s.pc || (MUSIC.includes(s.pat) ? (isDark(s.bg) ? 'rgba(255,255,255,.42)' : 'rgba(30,40,60,.45)') : isDark(s.bg) ? 'rgba(255,255,255,.2)' : LINED.includes(s.pat) && s.pat !== 'grid' ? 'rgba(60,110,180,.32)' : 'rgba(30,40,60,.2)');
/** The red line of the margin. */
export const marginColor = (s) => (isDark(s.bg) ? 'rgba(255,120,120,.45)' : 'rgba(214,64,64,.5)');
/** The inks shown for a paper. */
export const inksFor = (bg) => (isDark(bg) ? CHALK : INKS);
/** Black ink on a dark sheet becomes chalk, and chalk on a light sheet becomes black: what is drawn is always seen. */
export function inkOn(c, bg) {
  const dark = isDark(bg);
  if (dark && luma(c) < .03) return CHALK[0];
  if (!dark && luma(c) > .85) return INKS[0];
  return c;
}

/** The size of the sheets of a notebook, in units of the page: [width, height]. */
export function pageSize(s) {
  const [w, h] = SIZES[s.size] || SIZES.a4;
  return s.size === 'wide' || s.size === 'square' || s.orient !== 'l' ? [w, h] : [h, w];
}

/**
 * Where the typed text goes on a sheet and how big it is: the margins follow the paper (the red line of ruled paper,
 * the column of Cornell notes), and on lined papers every line of text is one line of the paper.
 */
export function textBox(s, sheet) {
  const [W, H] = pageSize(s), lined = LINED.includes(sheet.pat), g = sheet.gap, k = { s: .86, m: 1, l: 1.18 }[s.tsize] || 1;
  const fs = lined ? r2(Math.max(10, Math.min(40, g * (sheet.pat === 'grid' ? .7 : .56) * k))) : r2(Math.max(10, Math.min(40, 16 * k * (W / 794) ** .3)));
  const lh = lined ? g : r2(fs * 1.55);
  const left = sheet.pat === 'ruled' ? marginX(W) + 14 : sheet.pat === 'cornell' ? Math.round(W * .3) + 16 : Math.round(Math.max(36, W * .07));
  const top = lined ? g * Math.max(1, Math.round(Math.max(48, H * .05) / g)) : Math.round(Math.max(40, H * .05));
  const bottom = sheet.pat === 'cornell' ? Math.round(H * .2) + 10 : Math.round(Math.max(30, H * .04));
  // the baseline a little above the line of the paper, as when writing by hand
  const lift = lined ? r2(g * ({ sans: .16, serif: .15, mono: .15, hand: .1 }[s.font] ?? .15)) : 0;
  return { W, H, fs, lh, left, top: top + lift, right: Math.round(Math.max(30, W * .06)), bottom: Math.max(0, bottom - lift), lined };
}
/** x of the red line of ruled paper. */
export const marginX = (W) => Math.round(Math.max(56, W * .1));

export const defaultPaper = (p = {}) => ({ bg: p.bg || '#ffffff', pat: PATTERNS.includes(p.pat) ? p.pat : 'lines', gap: p.gap || 30, pc: p.pc || '' });
export const defaultSettings = (p = {}) => ({ cover: p.cover || COVERS[0], size: p.size || 'a4', orient: p.orient || 'p', font: p.font || 'sans', tsize: p.tsize || 'm', paper: defaultPaper(p.paper || p) });
export const newSheet = (paper) => ({ id: uid(), ...defaultPaper(paper), doc: '', items: [] });

// ------------------------------------------------------------------ cleaning (files opened from the device)

const num = (v, min = -1e7, max = 1e7, d = 0) => { const f = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(f) ? r2(Math.max(min, Math.min(max, f))) : d; };
const col = (v, d = '') => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const okId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(v);

export function cleanPaper(p = {}) {
  return { bg: col(p.bg, '#ffffff'), pat: pick(p.pat, PATTERNS, 'lines'), gap: num(p.gap, 8, 80, 30), pc: col(p.pc, '') };
}
export function cleanSettings(s = {}) {
  const o = { cover: col(s.cover, COVERS[0]), size: pick(s.size, Object.keys(SIZES), 'a4'), orient: pick(s.orient, ['p', 'l'], 'p'), font: pick(s.font, Object.keys(FONTS), 'sans'), tsize: pick(s.tsize, TSIZES, 'm'), paper: cleanPaper(s.paper || {}) };
  if (s.view && typeof s.view === 'object') o.view = { z: num(s.view.z, .1, 6, 1), at: Math.round(num(s.view.at, 0, 1000, 0)) };
  return o;
}

export function cleanItem(i) {
  if (!i || typeof i !== 'object' || !okId(i.id)) return null;
  const id = i.id;
  switch (i.t) {
    case 'stroke': {
      if (!Array.isArray(i.p) || i.p.length < 3 || i.p.length > 60000) return null;
      const p = i.p.slice(0, i.p.length - (i.p.length % 3)).map((v, n) => (n % 3 === 2 ? num(v, 0, 1, .5) : num(v, -2e4, 2e4)));
      return { id, t: 'stroke', tool: pick(i.tool, TOOLS, 'pen'), c: col(i.c, '#1c1c1c'), s: num(i.s, .3, 200, 3), p };
    }
    case 'shape': {
      const k = pick(i.k, SHAPES, 'rect'), line = k === 'line' || k === 'arrow';
      return { id, t: 'shape', k, x: num(i.x, -2e4, 2e4), y: num(i.y, -2e4, 2e4), w: line ? num(i.w, -2e4, 2e4) : Math.abs(num(i.w, -2e4, 2e4)), h: line ? num(i.h, -2e4, 2e4) : Math.abs(num(i.h, -2e4, 2e4)), c: col(i.c, '#1c1c1c'), s: num(i.s, .3, 100, 3), f: col(i.f, ''), d: !!i.d };
    }
    case 'image':
      if (typeof i.src !== 'string' || i.src.length > 4e6 || !/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+=*$/.test(i.src)) return null;
      return { id, t: 'image', x: num(i.x, -2e4, 2e4), y: num(i.y, -2e4, 2e4), w: Math.max(1, Math.abs(num(i.w, -2e4, 2e4, 1))), h: Math.max(1, Math.abs(num(i.h, -2e4, 2e4, 1))), src: i.src };
  }
  return null;
}

export function cleanItems(list) {
  const seen = new Set(), out = [];
  for (const i of Array.isArray(list) ? list : []) { const c = cleanItem(i); if (!c || seen.has(c.id)) continue; seen.add(c.id); out.push(c); if (out.length >= 20000) break; }
  return out;
}

export function cleanSheet(s) {
  if (!s || typeof s !== 'object' || !okId(s.id)) return null;
  return { id: s.id, ...cleanPaper(s), doc: cleanDoc(typeof s.doc === 'string' ? s.doc : ''), items: cleanItems(s.items) };
}
export function cleanSheets(list) {
  const seen = new Set(), out = [];
  for (const s of Array.isArray(list) ? list : []) { const c = cleanSheet(s); if (!c || seen.has(c.id)) continue; seen.add(c.id); out.push(c); if (out.length >= 500) break; }
  return out;
}

/** The same items with new ids (duplicate, paste). */
export const freshIds = (list) => list.map((i) => ({ ...i, id: uid() }));
/** A sheet with new ids (duplicate a sheet, open a file twice). */
export const freshSheet = (s) => ({ ...s, id: uid(), items: freshIds(s.items || []) });

// ------------------------------------------------------------------ typed text: a small set of HTML

/**
 * The typed text of a sheet keeps only these tags and, inside style, only these properties (the same list as
 * clean_doc in lib/notebooks.php). Everything else is unwrapped (its text stays) or, for scripts and the like, removed.
 */
const TAGS = new Set(['p', 'div', 'br', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'span', 'a', 'hr', 'sub', 'sup', 'mark']);
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'head', 'title', 'meta', 'link', 'img', 'video', 'audio', 'canvas', 'form', 'input', 'button', 'select', 'textarea']);
const COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;
const STYLE = {
  color: (v) => COLOR.test(v), 'background-color': (v) => COLOR.test(v), 'text-align': (v) => /^(left|center|right|justify|start|end)$/.test(v),
  'font-weight': (v) => /^(bold|normal|[1-9]00)$/.test(v), 'font-style': (v) => /^(italic|normal)$/.test(v),
  'text-decoration': (v) => /^((underline|line-through|none)\s*)+$/.test(v), 'text-decoration-line': (v) => /^((underline|line-through|none)\s*)+$/.test(v),
};
export function cleanStyle(css) {
  const out = [];
  for (const part of String(css || '').split(';')) {
    const m = /^\s*([a-z-]+)\s*:\s*(.+?)\s*$/i.exec(part);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].toLowerCase().replace(/\s*!important$/, '');
    if (STYLE[k] && v.length < 60 && STYLE[k](v)) out.push(`${k}: ${v}`);
  }
  return out.join('; ');
}
const tpl = document.createElement('template');
export function cleanDoc(html) {
  if (!html) return '';
  tpl.innerHTML = String(html).slice(0, 400000);
  const walk = (node) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) continue;
      if (n.nodeType !== 1) { n.remove(); continue; }
      const tag = n.localName;
      if (DROP.has(tag)) { n.remove(); continue; }
      walk(n);
      if (!TAGS.has(tag)) { n.replaceWith(...n.childNodes); continue; }
      for (const a of [...n.attributes]) {
        const k = a.name;
        if (k === 'style' && ['p', 'div', 'h1', 'h2', 'h3', 'li', 'span', 'mark', 'blockquote', 'b', 'strong', 'i', 'em', 'u', 's'].includes(tag)) { const st = cleanStyle(a.value); if (st) n.setAttribute('style', st); else n.removeAttribute('style'); }
        else if (k === 'href' && tag === 'a' && /^(https?:|mailto:)/i.test(a.value.trim())) n.setAttribute('href', a.value.trim());
        else if (k === 'data-checked' && tag === 'li') n.setAttribute('data-checked', a.value === '1' ? '1' : '0');
        else if (k === 'class' && tag === 'ul' && /\bchk\b/.test(a.value)) n.setAttribute('class', 'chk');
        else n.removeAttribute(k);
      }
      if (tag === 'a') { n.setAttribute('rel', 'noopener noreferrer'); n.setAttribute('target', '_blank'); }
      if (tag === 'span' && !n.attributes.length) n.replaceWith(...n.childNodes);
    }
  };
  walk(tpl.content);
  const out = tpl.innerHTML.trim();
  return /^(<p>(<br>)?<\/p>|<br>)?$/.test(out) ? '' : out;
}
/** Has the typed text anything written in it? */
export const docEmpty = (html) => !html || !String(html).replace(/<[^>]*>|&nbsp;|\s/g, '');
