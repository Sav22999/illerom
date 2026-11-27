/**
 * Files. .savnot is the format of SavNotes: one notebook, whole (cover, size, every sheet with its paper, typed text and
 * ink), opened again exactly as it was. A notebook can also be printed or kept as PDF (the printing of the browser, so the
 * typed text stays text), and a sheet can leave as a picture (PNG).
 *
 * .savnot: a ZIP with `mimetype` (application/vnd.savnotes.notebook+zip, stored first), notebook.json
 *   {format: "savnot", version: 1, app, exported, title, settings, sheets: [{id, bg, pat, gap, pc, doc, items}]}
 *   and the pictures in media/<sheet>-<id>.<ext> (inside notebook.json a picture is {t: "image", …, src: "media/…"}).
 */
import { zip, unzip, text } from './zip.js';
import { DEFS, docCSS, paperSVG, sheetSVG, itemSVG } from './render.js';
import { cleanSettings, cleanSheets, isDark, pageSize } from './model.js';

export const SAVNOT = 'application/vnd.savnotes.notebook+zip';
export const fileName = (title, ext) => (String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').trim().slice(0, 100) || 'notebook') + '.' + ext;
/** Inside the Android app: the file goes to the app in pieces, then the system asks where to keep it. */
export const inApp = () => /SavNotesApp\/Android/.test(navigator.userAgent) && !!window.SavNotesAndroid?.saveFile;
async function saveInApp(blob, name) {
  const b64 = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
  window.SavNotesAndroid.saveBegin(name, blob.type || 'application/octet-stream');
  for (let i = 0; i < b64.length; i += 524288) window.SavNotesAndroid.saveFile(b64.slice(i, i + 524288));
  window.SavNotesAndroid.saveEnd();
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
const dataUrl = (bytes, type) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(new Blob([bytes], { type })); });

// ------------------------------------------------------------------ .savnot

/** The .savnot file of a notebook (a Blob), for downloading it or saving it into SavDrive. */
export async function makeSavnot(nb) {
  const media = [];
  const sheets = nb.sheets.map((s) => ({ ...s, items: s.items.map((i) => {
    if (i.t !== 'image') return i;
    const m = /^data:image\/(png|jpeg|webp|gif);base64,(.*)$/.exec(i.src);
    if (!m) return i;
    const path = `media/${s.id}-${i.id}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    media.push([path, b64bytes(m[2]), { store: true }]);
    return { ...i, src: path };
  }) }));
  const json = { format: 'savnot', version: 1, app: 'SavNotes', exported: new Date().toISOString(), title: nb.title, settings: { ...nb.settings, view: undefined }, sheets };
  return zip([['mimetype', SAVNOT, { store: true }], ['notebook.json', JSON.stringify(json)], ...media], SAVNOT);
}
export async function saveSavnot(nb) { download(await makeSavnot(nb), fileName(nb.title, 'savnot')); }

/** {title, settings, sheets} from a .savnot file (or its notebook.json). */
export async function readSavnot(file) {
  if (file.size > 80e6) throw bad('file_big');
  const buf = await file.arrayBuffer(), head = new Uint8Array(buf.slice(0, 2));
  let json, files = null;
  if (head[0] === 0x50 && head[1] === 0x4b) {
    try { files = await unzip(buf, { maxFiles: 20000, maxBytes: 300e6 }); const f = files.get('notebook.json'); if (!f) throw 0; json = JSON.parse(text(await f())); } catch { throw bad('file_invalid'); }
  } else { try { json = JSON.parse(text(new Uint8Array(buf)).replace(/^\ufeff/, '')); } catch { throw bad('file_invalid'); } }
  if (json?.format !== 'savnot' || !Array.isArray(json.sheets)) throw bad('file_invalid');
  const sheets = [];
  for (const s of json.sheets.slice(0, 500)) {
    if (!s || !Array.isArray(s.items)) { sheets.push(s); continue; }
    const items = [];
    for (const i of s.items) {
      if (i?.t === 'image' && typeof i.src === 'string' && i.src.startsWith('media/') && files?.get(i.src)) {
        const type = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', gif: 'gif' }[i.src.split('.').pop().toLowerCase()];
        if (type) items.push({ ...i, src: await dataUrl(await files.get(i.src)(), 'image/' + type) });
      } else items.push(i);
    }
    sheets.push({ ...s, items });
  }
  return { title: String(json.title || file.name.replace(/\.savnot$/i, '')).slice(0, 160), settings: cleanSettings(json.settings || {}), sheets: cleanSheets(sheets) };
}

// ------------------------------------------------------------------ pictures

/** The typefaces of the typed text, as CSS with the files inside (a picture drawn from SVG cannot load files). */
const FACES = { sans: [['Inter', 'inter-latin-wght-normal', '100 900'], ['Inter', 'inter-latin-ext-wght-normal', '100 900']], hand: [['Caveat', 'caveat-latin-400-normal', 400], ['Caveat', 'caveat-latin-700-normal', 700], ['Caveat', 'caveat-latin-ext-400-normal', 400]],
  serif: [['IBM Plex Serif', 'ibm-plex-serif-latin-400-normal', 400], ['IBM Plex Serif', 'ibm-plex-serif-latin-700-normal', 700]], mono: [['IBM Plex Mono', 'ibm-plex-mono-latin-400-normal', 400], ['IBM Plex Mono', 'ibm-plex-mono-latin-700-normal', 700]] };
const faceCache = new Map();
async function embeddedFonts(font) {
  let css = '';
  for (const [fam, file, weight] of FACES[font] || FACES.sans) {
    if (!faceCache.has(file)) faceCache.set(file, fetch(`fonts/${file}.woff2`).then((r) => (r.ok ? r.blob() : null)).then((b) => b && new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); })).catch(() => null));
    const url = await faceCache.get(file);
    if (url) css += `@font-face{font-family:"${fam}";src:url(${url}) format("woff2");font-weight:${weight};}`;
  }
  return css;
}

/** A sheet drawn on a canvas, scale times bigger than the page. */
async function rasterize(settings, sheet, scale = 2) {
  const svg = sheetSVG(settings, sheet, { fonts: await embeddedFonts(settings.font) }), [W, H] = pageSize(settings);
  const img = new Image();
  img.decoding = 'async';
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = Math.round(W * scale);
    c.height = Math.round(H * scale);
    const g = c.getContext('2d');
    g.fillStyle = sheet.bg;
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    c.toDataURL('image/png', 0); // some browsers do not let a picture with text inside leave: better to know now
    return c;
  } finally { URL.revokeObjectURL(url); }
}

const blobOf = (c, type, q) => new Promise((r) => c.toBlob(r, type, q));
/** The sheet n as a picture. */
export async function savePng(nb, n = 0) {
  const sheet = nb.sheets[n] || nb.sheets[0];
  let c;
  try { c = await rasterize(nb.settings, sheet); } catch { c = await rasterize(nb.settings, { ...sheet, doc: '' }).catch(() => null); if (!c) throw bad('png_failed'); }
  download(await blobOf(c, 'image/png'), fileName(`${nb.title} – ${n + 1}`, 'png'));
}

/**
 * Printing, or a PDF from the printing of the browser: every sheet on a page of its size, with its paper, its text and its
 * ink. The text stays real text (it can be searched and copied in the PDF).
 */
export function printNotebook(nb) {
  const [W, H] = pageSize(nb.settings), mm = (px) => Math.round(px * 25.4 / 96 * 100) / 100;
  document.getElementById('nb-print')?.remove();
  const box = document.createElement('div');
  box.id = 'nb-print';
  let css = `@page{size:${mm(W)}mm ${mm(H)}mm;margin:0}@media print{html,body{background:#fff!important;margin:0!important;height:auto!important;overflow:visible!important;position:static!important}body>*:not(#nb-print){display:none!important}#nb-print{display:block!important}}`
    + `#nb-print{display:none}#nb-print .pp{position:relative;width:${W}px;height:${H}px;overflow:hidden;break-after:page;page-break-after:always;-webkit-print-color-adjust:exact;print-color-adjust:exact}#nb-print .pp:last-child{break-after:auto;page-break-after:auto}#nb-print svg{position:absolute;inset:0;width:100%;height:100%}#nb-print .pd{position:absolute;left:0;top:0}`;
  const pages = nb.sheets.map((s, n) => {
    const p = paperSVG('pr' + n, s, W, H), dark = isDark(s.bg);
    css += docCSS(`#nb-print .pd${n}`, nb.settings, s);
    return `<div class="pp"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs>${p.defs}</defs>${p.body}</svg><div class="pd pd${n}">${s.doc || ''}</div><svg viewBox="0 0 ${W} ${H}"><defs>${n ? '' : DEFS}</defs><g style="isolation:isolate">${s.items.map((i) => itemSVG(i, dark)).join('')}</g></svg></div>`;
  });
  box.innerHTML = `<style>${css}</style>${pages.join('')}`;
  document.body.append(box);
  const title = document.title;
  document.title = nb.title;
  const done = () => { document.title = title; box.remove(); removeEventListener('afterprint', done); };
  addEventListener('afterprint', done);
  setTimeout(() => window.print(), 50);
}

/** A picture from the device, made smaller when it is big (at most 1600 pixels a side): a data: URL and its size. */
export async function readImage(file) {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml|avif|bmp)$/.test(file.type)) throw bad('image_invalid');
  if (file.size > 25e6) throw bad('file_big');
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => { throw bad('image_invalid'); });
    const w = img.naturalWidth || 800, h = img.naturalHeight || 600, k = Math.min(1, 1600 / Math.max(w, h));
    // small PNG and GIF pictures stay as they are (transparency, pixel art); the others are drawn again
    if (k === 1 && file.size < 900e3 && /^image\/(png|jpeg|webp|gif)$/.test(file.type)) return { src: await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); }), w, h };
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    let src = c.toDataURL('image/webp', .86);
    if (!src.startsWith('data:image/webp')) src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', .88);
    return { src, w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
