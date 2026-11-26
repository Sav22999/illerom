/**
 * Files. .savwhi is the format of SavWhiteboard: one board, whole (look, every item), opened again exactly as it was. A
 * board can also leave as a picture (PNG), a vector picture (SVG) or a PDF of one page as big as what is drawn.
 *
 * .savwhi: a ZIP with `mimetype` (application/vnd.savwhiteboard.board+zip, stored first), board.json
 *   {format: "savwhi", version: 1, app, exported, title, settings, items}   and the pictures in media/<id>.<ext>
 *   (inside board.json a picture is {t: "image", …, src: "media/<id>.<ext>"}).
 *
 * On the board a picture is m:<id> (kept by the server): it is put inside the files that leave, and a file that arrives
 * sends its pictures to the server again (toServer).
 */
import { zip, unzip, text } from './zip.js';
import { boardSVG } from './render.js';
import { cleanItems, cleanSettings } from './model.js';
import { union } from './ink.js';
import { uploadPicture } from './pictures.js';

export const SAVWHI = 'application/vnd.savwhiteboard.board+zip';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'board') + '.' + ext;
/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavWhiteboardApp\/Android/.test(navigator.userAgent) && !!window.SavWhiteboardAndroid?.saveFile;
async function saveInApp(blob, name) {
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavWhiteboardAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavWhiteboardAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavWhiteboardAndroid.saveEnd();
}
export function download(blob, name) {
  if (inApp()) return void saveInApp(blob, name);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
const bad = (code) => Object.assign(new Error(code), { code });
const b64bytes = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const asDataUrl = (blob) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });

const pics = new Map();
/** The items with every picture of the account inside them (a picture drawn from SVG cannot load files; files that leave must carry them). */
export async function inlineMedia(items) {
  return Promise.all(items.map(async (i) => {
    if (i.t !== 'image' || !i.src.startsWith('m:')) return i;
    if (!pics.has(i.src)) pics.set(i.src, fetch('api/?r=media&id=' + i.src.slice(2)).then((r) => (r.ok ? r.blob() : null)).then((b) => b && asDataUrl(b)).catch(() => null));
    const src = await pics.get(i.src);
    if (!src) pics.delete(i.src);
    return src ? { ...i, src } : null;
  })).then((l) => l.filter(Boolean));
}

/** The pictures inside items that arrive (a .savwhi, older boards) become pictures of the account. */
export async function toServer(items) {
  const done = new Map();
  return Promise.all(items.map(async (i) => {
    if (i.t !== 'image' || !i.src.startsWith('data:')) return i;
    // decoded here: the page may not fetch data: addresses (Content-Security-Policy)
    const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(i.src);
    if (!m) return null;
    if (!done.has(i.src)) done.set(i.src, uploadPicture(new File([b64bytes(m[2])], 'picture.' + m[1].split('/')[1], { type: m[1] })).then((x) => x.src));
    return { ...i, src: await done.get(i.src) };
  })).then((l) => l.filter(Boolean));
}

// ------------------------------------------------------------------ .savwhi

export async function saveSavwhi(board) {
  const media = [], items = (await inlineMedia(board.items)).map((i) => {
    if (i.t !== 'image') return i;
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/.exec(i.src);
    if (!m) return i;
    const path = `media/${i.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    media.push([path, b64bytes(m[2]), { store: true }]);
    return { ...i, src: path };
  });
  const json = { format: 'savwhi', version: 1, app: 'SavWhiteboard', exported: new Date().toISOString(), title: board.title, settings: { ...board.settings, view: undefined }, items };
  download(await zip([['mimetype', SAVWHI, { store: true }], ['board.json', JSON.stringify(json)], ...media], SAVWHI), fileName(board.title, 'savwhi'));
}

/** {title, settings, items} from a .savwhi file (or its board.json). */
export async function readSavwhi(file) {
  if (file.size > 60e6) throw bad('file_big');
  const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  let json, files = null;
  if (head[0] === 0x50 && head[1] === 0x4b) {
    try { files = await unzip(buf, { maxFiles: 5000, maxBytes: 200e6 }); const f = files.get('board.json'); if (!f) throw 0; json = JSON.parse(text(await f())); } catch { throw bad('file_invalid'); }
  } else { try { json = JSON.parse(text(new Uint8Array(buf)).replace(/^﻿/, '')); } catch { throw bad('file_invalid'); } }
  if (json?.format !== 'savwhi' || !Array.isArray(json.items)) throw bad('file_invalid');
  const list = [];
  for (const i of json.items) {
    if (i?.t === 'image' && typeof i.src === 'string' && i.src.startsWith('media/') && files?.get(i.src)) {
      const ext = i.src.split('.').pop().toLowerCase(), type = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif' }[ext];
      if (!type) continue;
      const bytes = await files.get(i.src)();
      list.push({ ...i, src: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([bytes], { type: 'image/' + type })); }) });
    } else list.push(i);
  }
  return { title: String(json.title || file.name.replace(/\.savwhi$/i, '')).slice(0, 160), settings: cleanSettings(json.settings || {}), items: cleanItems(list) };
}

// ------------------------------------------------------------------ pictures

/** The typefaces the items use, as CSS with the files inside (a picture drawn from SVG cannot load files). */
const FACES = { sans: [['Inter', 'inter-latin-wght-normal', '100 900'], ['Inter', 'inter-latin-ext-wght-normal', '100 900']], hand: [['Caveat', 'caveat-latin-400-normal', 400], ['Caveat', 'caveat-latin-700-normal', 700], ['Caveat', 'caveat-latin-ext-400-normal', 400]],
  serif: [['IBM Plex Serif', 'ibm-plex-serif-latin-400-normal', 400], ['IBM Plex Serif', 'ibm-plex-serif-latin-700-normal', 700]], mono: [['IBM Plex Mono', 'ibm-plex-mono-latin-400-normal', 400], ['IBM Plex Mono', 'ibm-plex-mono-latin-700-normal', 700]] };
const faceCache = new Map();
async function embeddedFonts(items) {
  const used = new Set(items.flatMap((i) => (i.t === 'text' ? [i.ff] : i.t === 'note' ? ['sans'] : [])));
  let css = '';
  for (const k of used) for (const [fam, file, weight] of FACES[k] || []) {
    if (!faceCache.has(file)) faceCache.set(file, fetch(`fonts/${file}.woff2`).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).catch(() => null));
    const url = await faceCache.get(file);
    if (url) css += `@font-face{font-family:"${fam}";src:url(${url}) format("woff2");font-weight:${weight};}`;
  }
  return css;
}

/** The board drawn on a canvas: scale chosen so that the longest side is at most max pixels. */
export async function rasterize(items, settings, { max = 4096, scale = 2, pad = 48, box } = {}) {
  items = await inlineMedia(items);
  const svg = boardSVG(items, settings, { pad, box, fonts: await embeddedFonts(items) });
  const m = /width="(\d+)" height="(\d+)"/.exec(svg), w = +m[1], h = +m[2], k = Math.min(scale, max / Math.max(w, h));
  const img = new Image();
  img.decoding = 'async';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k));
    c.height = Math.max(1, Math.round(h * k));
    const g = c.getContext('2d');
    g.fillStyle = settings.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
export async function savePng(board) { download(await blobOf(await rasterize(board.items, board.settings), 'image/png'), fileName(board.title, 'png')); }
export async function saveSvg(board) { const items = await inlineMedia(board.items); download(new Blob([boardSVG(items, board.settings, { box: union(board.items), fonts: await embeddedFonts(items) })], { type: 'image/svg+xml' }), fileName(board.title, 'svg')); }

/** A PDF of one page, as big as what is drawn (a JPEG inside it: the smallest file that keeps the look). */
export async function savePdf(board) {
  const box = union(board.items), c = await rasterize(board.items, board.settings, { max: 6000, scale: 2.5 });
  const jpg = new Uint8Array(await (await blobOf(c, 'image/jpeg', .92)).arrayBuffer());
  const pw = Math.round(((box?.w || 800) + 96) * .75 * 100) / 100, ph = Math.round(((box?.h || 500) + 96) * .75 * 100) / 100; // 96 px = 72 pt
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
  obj(6, `<< /Producer (SavWhiteboard) /Title <FEFF${[...String(board.title || '')].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, '0')).join('')}> >>`);
  const xref = len;
  push(`xref\n0 7\n0000000000 65535 f \n${offs.slice(1).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 7 /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF`);
  download(new Blob(parts, { type: 'application/pdf' }), fileName(board.title, 'pdf'));
}

/** The small picture of the home (WebP, or JPEG where WebP cannot be written), small enough for the server. */
export async function thumbnail(items, settings) {
  const box = union(items);
  if (!box) return '';
  const c = await rasterize(items, settings, { max: 480, scale: 1, pad: Math.max(24, Math.max(box.w, box.h) * .04) });
  for (const q of [.72, .55, .4]) {
    let u = c.toDataURL('image/webp', q);
    if (!u.startsWith('data:image/webp')) u = c.toDataURL('image/jpeg', q);
    if (u.length < 88000) return u;
  }
  return '';
}
