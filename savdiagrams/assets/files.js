/**
 * Files. .savdia is the format of SavDiagrams: one diagram, whole (look, every shape and connector), opened again exactly
 * as it was. A diagram can also leave as a picture (PNG), a vector picture (SVG) or a PDF of one page as big as what is
 * drawn. diagrams.net / draw.io files (.drawio, .xml) are read (drawio.js), as are .savwhi boards of SavWhiteboard (sketch.js).
 *
 * .savdia: a ZIP with `mimetype` (application/vnd.savdiagrams.diagram+zip, stored first) and diagram.json
 *   {format: "savdia", version: 1, app, exported, title, settings, items}
 */
import { zip, unzip, text } from './zip.js';
import { diagramSVG, union } from './shapes.js';
import { cleanItems, cleanSettings } from './model.js';

export const SAVDIA = 'application/vnd.savdiagrams.diagram+zip';
export const ACCEPT = '.savdia,.drawio,.xml,.savwhi,application/vnd.savdiagrams.diagram+zip,application/json';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'diagram') + '.' + ext;
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const bad = (code) => Object.assign(new Error(code), { code });
const getter = (items) => { const m = new Map(items.filter((i) => i.t === 'node').map((i) => [i.id, i])); return (id) => m.get(id); };
export const boxOf = (items) => union(items, getter(items));

// ------------------------------------------------------------------ .savdia

/** The .savdia file of a diagram (a Blob), for downloading it or saving it into SavDrive. */
export function makeSavdia(d) {
  const json = { format: 'savdia', version: 1, app: 'SavDiagrams', exported: new Date().toISOString(), title: d.title, settings: { ...d.settings, view: undefined }, items: d.items };
  return zip([['mimetype', SAVDIA, { store: true }], ['diagram.json', JSON.stringify(json)]], SAVDIA);
}
export async function saveSavdia(d) { download(await makeSavdia(d), fileName(d.title, 'savdia')); }

/** {title, settings, items} from a file: .savdia (or its diagram.json), .drawio / .xml, or a .savwhi board. */
export async function readDiagramFile(file) {
  if (file.size > 40e6) throw bad('file_big');
  const name = file.name || '', buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  const plain = () => text(new Uint8Array(buf)).replace(/^﻿/, '');
  if (/\.(drawio|xml)$/i.test(name) || (head[0] === 0x3c)) { const { fromDrawio } = await import('./drawio.js'); return fromDrawio(plain(), name); }
  let json, files = null;
  if (head[0] === 0x50 && head[1] === 0x4b) {
    try { files = await unzip(buf, { maxFiles: 5000, maxBytes: 200e6 }); } catch { throw bad('file_invalid'); }
    if (files.get('board.json')) { const { fromBoard } = await import('./sketch.js'); return fromBoard(JSON.parse(text(await files.get('board.json')())), name); }
    const f = files.get('diagram.json');
    if (!f) throw bad('file_invalid');
    try { json = JSON.parse(text(await f())); } catch { throw bad('file_invalid'); }
  } else { try { json = JSON.parse(plain()); } catch { throw bad('file_invalid'); } }
  if (json?.format === 'savwhi') { const { fromBoard } = await import('./sketch.js'); return fromBoard(json, name); }
  if (json?.format !== 'savdia' || !Array.isArray(json.items)) throw bad('file_invalid');
  return { title: String(json.title || name.replace(/\.savdia$/i, '')).slice(0, 160), settings: cleanSettings(json.settings || {}), items: cleanItems(json.items) };
}

// ------------------------------------------------------------------ pictures

/** The typefaces the items use, as CSS with the files inside (a picture drawn from SVG cannot load files). */
const FACES = { sans: [['Inter', 'inter-latin-wght-normal', '100 900'], ['Inter', 'inter-latin-ext-wght-normal', '100 900']], hand: [['Caveat', 'caveat-latin-400-normal', 400], ['Caveat', 'caveat-latin-700-normal', 700], ['Caveat', 'caveat-latin-ext-400-normal', 400]],
  serif: [['IBM Plex Serif', 'ibm-plex-serif-latin-400-normal', 400], ['IBM Plex Serif', 'ibm-plex-serif-latin-700-normal', 700]], mono: [['IBM Plex Mono', 'ibm-plex-mono-latin-400-normal', 400], ['IBM Plex Mono', 'ibm-plex-mono-latin-700-normal', 700]] };
const faceCache = new Map();
/** base: where the fonts folder is (another app that draws a diagram passes ../savdiagrams/). */
export async function embeddedFonts(items, base = '') {
  const used = new Set(items.filter((i) => i.text).map((i) => (i.t === 'node' ? i.ff : 'sans')));
  let css = '';
  for (const k of used) for (const [fam, file, weight] of FACES[k] || []) {
    if (!faceCache.has(file)) faceCache.set(file, fetch(`${base}fonts/${file}.woff2`).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).catch(() => null));
    const url = await faceCache.get(file);
    if (url) css += `@font-face{font-family:"${fam}";src:url(${url}) format("woff2");font-weight:${weight};font-display:swap;}`;
  }
  return css;
}

const warm = new Set();
const fontsKey = (items) => [...new Set(items.filter((i) => i.text).map((i) => (i.t === 'node' ? i.ff : 'sans')))].sort().join();
/** The diagram drawn on a canvas: scale chosen so that the longest side is at most max pixels. */
export async function rasterize(items, settings, { max = 4096, scale = 2, pad = 32, base = '', transparent = false } = {}) {
  const svg = diagramSVG(items, settings, { pad, fonts: await embeddedFonts(items, base) });
  const m = /width="(\d+)" height="(\d+)"/.exec(svg), w = +m[1], h = +m[2], k = Math.min(scale, max / Math.max(w, h));
  const url = URL.createObjectURL(new Blob([transparent ? svg.replace(/<rect [^>]*fill="#[0-9a-f]{6}"\/>/, '') : svg], { type: 'image/svg+xml' }));
  const load = async () => { const i = new Image(); i.decoding = 'async'; i.src = url; await i.decode(); return i; };
  try {
    // the first time a typeface is used inside a picture, the browser draws its text invisible while it "loads" the
    // font (even from a data: address): a first picture warms it up, then the one drawn has its text
    if (!warm.has(fontsKey(items))) { await load(); await new Promise((r) => setTimeout(r, 180)); warm.add(fontsKey(items)); }
    const img = await load();
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    if (!transparent) { g.fillStyle = settings.bg; g.fillRect(0, 0, c.width, c.height); }
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

export const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
/** The PNG of a diagram (used by SavDocuments and SavPresentations to insert it: base = '../savdiagrams/'). */
export async function pngOf(d, o = {}) { const c = await rasterize(d.items, d.settings, o); return { blob: await blobOf(c, 'image/png'), width: c.width, height: c.height }; }
export async function svgOf(d, base = '') { return diagramSVG(d.items, d.settings, { fonts: await embeddedFonts(d.items, base) }); }
export async function savePng(d) { download((await pngOf(d)).blob, fileName(d.title, 'png')); }
export async function saveSvg(d) { download(new Blob([await svgOf(d)], { type: 'image/svg+xml' }), fileName(d.title, 'svg')); }

/** A PDF of one page, as big as what is drawn (a JPEG inside it: the smallest file that keeps the look). */
export async function savePdf(d) {
  const box = boxOf(d.items), c = await rasterize(d.items, d.settings, { max: 6000, scale: 2.5 });
  const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', .92)).arrayBuffer());
  const pw = Math.round(((box?.w || 400) + 64) * .75 * 100) / 100, ph = Math.round(((box?.h || 240) + 64) * .75 * 100) / 100; // 96 px = 72 pt
  const enc = new TextEncoder(), parts = [], offs = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body, stream) => { offs[n] = len; push(`${n} 0 obj\n${body}\n`); if (stream) { push('stream\n'); push(stream); push('\nendstream\n'); } push('endobj\n'); };
  const draw = enc.encode(`q ${pw} 0 0 ${ph} 0 0 cm /Im Do Q`);
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im 4 0 R >> >> /Contents 5 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${c.width} /Height ${c.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>`, jpg);
  obj(5, `<< /Length ${draw.length} >>`, draw);
  obj(6, `<< /Producer (SavDiagrams) /Title <FEFF${[...String(d.title || '')].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> >>`);
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  download(new Blob(parts, { type: 'application/pdf' }), fileName(d.title, 'pdf'));
}

/** The small picture of the home (WebP, or JPEG where WebP cannot be written), small enough for the server. */
export async function thumbnail(items, settings) {
  const box = boxOf(items);
  if (!box) return '';
  const c = await rasterize(items, settings, { max: 480, scale: 1, pad: Math.max(16, Math.max(box.w, box.h) * .05) });
  for (const q of [.75, .55, .4]) {
    let u = c.toDataURL('image/webp', q);
    if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/jpeg', q);
    if (u.length < 88000) return u;
  }
  return '';
}
