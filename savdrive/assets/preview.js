/**
 * What a file contains, drawn small (the cards of the grid) or large (the preview window): the first lines of a text or
 * JSON file, the first paragraphs of a document or book of SavOffice, the first cells of a spreadsheet, the first slide of
 * a presentation, what is inside an archive (its index, read by the server: nothing is extracted). Only text is taken
 * from the files (never their HTML), so nothing in them can run. Read once per version.
 */
import { bytes, h, icon } from './ui.js';
import { api, fileUrl, request } from './store.js';
import { getLang, t } from './i18n.js';
import { unzip, text as utf8 } from './zip.js';

const memo = new Map();
const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();
export const OFFICE_PREVIEW = ['savdoc', 'savboo', 'savspr', 'savpre'];
/** Archives whose contents can be listed (7z only says why it cannot). */
export const isArchive = (name) => /\.(zip|tar|tgz|gz|rar|7z)$/i.test(name || '');
/** Text of an HTML fragment, without running or loading anything in it. */
const plain = (html) => new DOMParser().parseFromString(String(html || ''), 'text/html');

/**
 * What the cards show of a file, asked together with the other cards near the screen: 20 files in one request (file.heads),
 * so a folder of many documents never sends a burst of requests (the hosting answers 429 to too many). Gives {b64, whole},
 * {archive} or null (the card asks it alone, or shows the icon).
 */
const heads = [];
let headTimer = 0;
const headOf = (x) => new Promise((resolve, reject) => wantHead({ id: x.id, resolve, reject }));
function wantHead(w) {
  heads.push(w);
  if (heads.length >= 20) sendHeads(); else if (!headTimer) headTimer = setTimeout(sendHeads, 80);
}
async function sendHeads() {
  clearTimeout(headTimer);
  headTimer = 0;
  const part = heads.splice(0, 20);
  if (heads.length) headTimer = setTimeout(sendHeads, 0);
  if (!part.length) return;
  try {
    const d = await api('file.heads', undefined, { ids: [...new Set(part.map((w) => w.id))].join(',') });
    for (const w of part) {
      if ((d.later || []).includes(w.id)) setTimeout(() => wantHead(w), 1000);
      else w.resolve(d.heads?.[w.id] || null);
    }
  } catch (e) { for (const w of part) w.reject(e); }
}
const bytesOf = (b64) => { const bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };

/** The beginning of a text file (a range of its bytes), pretty when it is a small JSON. */
async function textOf(x, big) {
  const key = `t|${x.id}|${x.updated}|${big}`;
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    let whole = x.size <= (big ? 400000 : 60000), s;
    const hd = big ? null : await headOf(x);
    if (hd?.b64 !== undefined) { s = new TextDecoder().decode(bytesOf(hd.b64)); whole = hd.whole; }
    else {
      const r = await request(fileUrl(x.id, true), { cache: 'no-store', headers: whole ? {} : { Range: `bytes=0-${big ? 199999 : 3999}` } }, { lo: !big });
      if (!r.ok && r.status !== 206) throw new Error('preview');
      s = await r.text();
    }
    if (ext(x.name) === 'json' && whole) { try { s = JSON.stringify(JSON.parse(s), null, 2); } catch { /* as it is */ } }
    return s;
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

/**
 * The JSON inside a file of SavOffice (a ZIP), with the names of its pictures: read by the server (file.heads), so the
 * size of the file does not matter; the pictures come one at a time when they are drawn (file.part). An older server:
 * the whole file, opened here.
 */
async function officeOf(x) {
  const key = `o|${x.id}|${x.updated}`;
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const hd = await headOf(x);
    if (hd?.json) {
      const d = JSON.parse(hd.json);
      Object.defineProperties(d, { _id: { value: x.id }, _v: { value: x.updated }, _names: { value: hd.names || [] } });
      return d;
    }
    if (hd && !hd.b64) throw new Error('preview'); // the server could not read it
    const r = await request(fileUrl(x.id, true), { cache: 'no-store' }, { lo: true });
    if (!r.ok) throw new Error('preview');
    const files = await unzip(new Uint8Array(await r.arrayBuffer()), { maxFiles: 4000, maxBytes: 200e6 });
    for (const name of ['document.json', 'book.json', 'workbook.json', 'deck.json']) if (files.has(name)) return Object.defineProperties(JSON.parse(utf8(await files.get(name)())), { _files: { value: files }, _names: { value: [...files.keys()] } });
    throw new Error('preview');
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

function textView(s, big) {
  const lines = String(s).replace(/\r\n?/g, '\n').split('\n').slice(0, big ? 4000 : 16);
  return h('pre' + (big ? '.pvtext' : '.tprev'), lines.join('\n'));
}

function docView(d, big) {
  const page = h('div' + (big ? '.dprev.big' : '.dprev'));
  if (d.title && big) page.append(h('h2', String(d.title)));
  let n = 0;
  for (const b of Array.isArray(d.blocks) ? d.blocks : []) {
    const doc = plain(b.h), el = doc.body.firstElementChild, txt = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (!txt) continue;
    const tag = el?.localName || 'p';
    page.append(h(/^h[1-3]$/.test(tag) ? 'b' : /^(ul|ol)$/.test(tag) ? 'p.li' : 'p', txt));
    if (++n >= (big ? 400 : 14)) break;
  }
  if (!n) page.append(h('p.empty', '…'));
  return page;
}

function sheetView(d, big) {
  const sh = (d.sheets || []).find((x) => !x.hidden) || (d.sheets || [])[0] || {};
  const cells = sh.cells || {}, R = big ? 40 : 9, C = big ? 12 : 5;
  const col = (c) => { let s = ''; for (c++; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s; return s; };
  const val = (k) => { const c = cells[k]; if (!c) return ''; const v = c.v ?? (c.f ? '=' + c.f : ''); return typeof v === 'number' ? v.toLocaleString() : String(v); };
  return h('div' + (big ? '.sprev.big' : '.sprev'), h('table', h('thead', h('tr', h('th', ''), Array.from({ length: C }, (_, c) => h('th', col(c))))),
    h('tbody', Array.from({ length: R }, (_, r) => h('tr', h('th', String(r + 1)), Array.from({ length: C }, (_, c) => h('td', val(col(c) + (r + 1)))))))));
}

function slideView(d, big) {
  const W = +d.meta?.w || 1920, H = +d.meta?.h || 1080;
  const s = [...(d.slides || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0))[0];
  const box = h('div' + (big ? '.pslide.big' : '.pslide'), { style: `aspect-ratio:${W} / ${H}` });
  for (const el of Object.values(s?.d?.els || {})) {
    const txt = (plain(el.html).body.textContent || '').trim();
    if (!txt || !Number.isFinite(+el.x)) continue;
    box.append(h('span', { style: `left:${(el.x / W) * 100}%;top:${(el.y / H) * 100}%;width:${(el.w / W) * 100}%;font-size:${Math.max(4, Math.min(14, (el.h / H) * 26))}cqw`, class: el.y < H * 0.35 ? 'ttl' : '' }, txt));
  }
  return box;
}

// ------------------------------------------------------------------ archives

/** The index of an archive, as the server read it (lib/archive.php): {format, entries, total, bytes, truncated, …}. */
async function archiveOf(x, big) {
  const key = `a|${x.id}|${x.updated}`;
  if (memo.has(key)) return memo.get(key);
  const alone = () => api('node.archive', undefined, { id: x.id }).then((r) => r.archive);
  const p = big ? alone() : headOf(x).then((hd) => hd?.archive || alone());
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  return p;
}

/** The entries as folders and files, with what each folder holds (folders that the archive does not list are made up). */
function treeOf(entries) {
  const node = (name, dir) => ({ name, dir, kids: new Map(), size: 0, files: 0, time: null });
  const root = node('', true);
  for (const e of entries) {
    const parts = e.path.split('/').filter(Boolean);
    let n = root;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      let k = n.kids.get(p);
      if (!k) n.kids.set(p, (k = node(p, !last || e.dir)));
      if (!last) k.dir = true;
      else { if (e.dir) k.dir = true; else if (!k.dir) k.size = e.size; k.time = e.time || k.time; }
      n = k;
    });
  }
  const sum = (n) => { if (!n.dir) return; n.size = 0; n.files = 0; n.folders = 0; for (const k of n.kids.values()) { sum(k); n.size += k.size; n.files += k.dir ? k.files : 1; n.folders += k.dir ? 1 + k.folders : 0; } };
  sum(root);
  return root;
}
const sortedKids = (n) => [...n.kids.values()].sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, getLang(), { numeric: true, sensitivity: 'base' }));
/** The icon of a name inside an archive (by its extension only: nothing in it is read). */
function entryIcon(k) {
  if (k.dir) return 'folder';
  const e = ext(k.name);
  if (/^(png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?)$/.test(e)) return 'file-image';
  if (/^(mp4|webm|mov|mkv|avi)$/.test(e)) return 'file-video';
  if (/^(mp3|wav|ogg|flac|m4a|aac)$/.test(e)) return 'file-audio';
  if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(e)) return 'file-archive';
  if (/^(json|js|mjs|ts|html?|css|xml|php|py|java|c|cpp|h|rb|go|rs|sh|ya?ml|sql|kt|swift)$/.test(e)) return 'file-code';
  if (/^(xlsx?|ods|csv|tsv)$/.test(e)) return 'table-2';
  if (/^(pptx?|odp|key)$/.test(e)) return 'presentation';
  if (/^(txt|md|pdf|docx?|odt|rtf|pages|epub|log)$/.test(e)) return 'file-text';
  return 'file';
}
const day = (s) => (s ? new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString(getLang(), { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** One row of the tree; a folder opens on a click, and its rows are made only then (an archive can hold thousands). */
function arcRow(k, depth, open) {
  const cells = [icon(entryIcon(k)), h('span.an', { title: k.name }, k.name), h('small.as', k.dir ? `${t('arc_items', { n: k.files.toLocaleString(getLang()) })} · ${bytes(k.size)}` : bytes(k.size)), h('small.ad', day(k.time))];
  if (!k.dir) return h('div.ar', { style: `--d:${depth}` }, h('span.ach'), cells);
  const kids = h('div.ak');
  const det = h('details.adet', h('summary.ar', { style: `--d:${depth}` }, h('span.ach', icon('chevron-right')), cells), kids);
  let made = false;
  const make = () => { if (made) return; made = true; kids.append(...sortedKids(k).map((c) => arcRow(c, depth + 1, false))); };
  det.addEventListener('toggle', () => { if (det.open) make(); });
  if (open) { det.open = true; make(); }
  return det;
}

function archiveView(a, big) {
  const root = treeOf(a.entries || []);
  if (!big) {
    // the card: the first names at the top (inside the only folder, when everything is in one)
    let top = root;
    while (top.kids.size === 1 && sortedKids(top)[0].dir && sortedKids(top)[0].kids.size) top = sortedKids(top)[0];
    const kids = sortedKids(top), shown = kids.slice(0, 7);
    if (!kids.length) return null;
    return h('div.aprev', top !== root ? h('div.ar.top', icon('folder-open'), h('span.an', top.name)) : null, shown.map((k) => h('div.ar', icon(entryIcon(k)), h('span.an', k.name))),
      kids.length > shown.length ? h('div.ar.more', t('arc_more_n', { n: kids.length - shown.length })) : null);
  }
  const note = (ic, text, cls = '') => h('p.anote' + cls, icon(ic), h('span', text));
  if (a.unsupported) return h('div.pvnone', h('span.tic.big', { style: '--fc:#7b5434' }, icon('file-archive')), h('p.muted', t(a.format === '7z' ? 'arc_7z' : 'arc_bad')));
  if (a.encrypted && !root.kids.size) return h('div.pvnone', h('span.tic.big', { style: '--fc:#7b5434' }, icon('lock')), h('p.muted', t('arc_locked_all')));
  if (!root.kids.size) return h('div.pvnone', h('span.tic.big', { style: '--fc:#7b5434' }, icon('file-archive')), h('p.muted', t('arc_empty')));
  const kids = sortedKids(root);
  // open the first level, and the next one too when everything is inside one folder
  const rows = kids.map((k) => arcRow(k, 0, kids.length === 1));
  return h('div.arcv',
    h('div.ahead', h('span.tic', { style: '--fc:#7b5434' }, icon('file-archive')), h('div', h('b', String(a.format || '').toUpperCase()),
      h('small.muted', [t(a.total === 1 ? 'arc_sum1' : 'arc_sum', { n: a.total.toLocaleString(getLang()), size: bytes(a.bytes) }), root.folders ? ' · ' + t('arc_folders', { n: root.folders.toLocaleString(getLang()) }) : ''].join('')))),
    a.encrypted ? note('lock', t('arc_locked'), '.warn') : null,
    a.partial ? note('info', t('arc_partial'), '.warn') : a.truncated ? note('info', t('arc_more', { n: (a.entries || []).length.toLocaleString(getLang()) })) : null,
    h('div.atree', { role: 'tree' }, rows),
    h('p.pvnote.muted', t('arc_note')));
}

// ------------------------------------------------------------------ files of SavOffice, drawn by their own apps

/*
 * A document, a book, a spreadsheet or a presentation is drawn with the code of its app (../<app>/assets/…: the same
 * small pictures as in its home, the same styles), inside a shadow root with the stylesheets of that app, so nothing of
 * SavDrive and of the app mixes. The typefaces are declared once in the page (a shadow root cannot declare them). The
 * pictures inside the file become blob: addresses. If the app cannot draw it, the plain text view below is used.
 */
const sheets = new Set();
const pageSheet = (href) => { if (sheets.has(href)) return; sheets.add(href); document.head.append(h('link', { rel: 'stylesheet', href })); };
function shadowBox(css, kids, cls = '') {
  const host = h('div.oview' + cls), root = host.attachShadow({ mode: 'open' });
  root.append(...css.map((href) => h('link', { rel: 'stylesheet', href })), h('style', { html: ':host{display:block;contain:content}.opages{display:grid;gap:16px}.opages.narrow{max-width:760px;margin:0 auto}.opages>*{box-shadow:0 2px 12px rgb(0 0 0 / .16),0 0 0 1px rgb(0 0 0 / .06);border-radius:4px;overflow:hidden;background:#fff}' }), ...[kids].flat());
  return host;
}
/** The pictures of the file: name inside the ZIP → blob: address (made once per file). */
function mediaOf(d) {
  if (d._media) return d._media;
  const out = new Map();
  Object.defineProperty(d, '_media', { value: out });
  return out;
}
async function blobUrl(d, path, w = 0) {
  const m = mediaOf(d), key = path + '|' + w;
  if (!m.has(key)) m.set(key, (async () => {
    try {
      if (d._files) { const read = d._files.get(path); return read ? URL.createObjectURL(new Blob([await read()], { type: /\.svg$/i.test(path) ? 'image/svg+xml' : '' })) : ''; }
      if (!d._names?.includes(path)) return '';
      const r = await request(`api/?r=file.part&id=${encodeURIComponent(d._id)}&path=${encodeURIComponent(path)}${w ? '&w=' + w : ''}&v=${encodeURIComponent(d._v || '')}`, { credentials: 'same-origin' }, { lo: true });
      return r.ok ? URL.createObjectURL(await r.blob()) : '';
    } catch { return ''; }
  })());
  return m.get(key);
}

async function slidesApp(d, big) {
  const [R, T, Lc] = await Promise.all([import('../../savpresentations/assets/render.js'), import('../../savpresentations/assets/themes.js'), import('../../savpresentations/assets/local.js')]);
  if (!sheets.has('sp-fonts')) { sheets.add('sp-fonts'); document.head.append(h('style', { html: T.fontFaces().replaceAll('url("fonts/', 'url("../savpresentations/fonts/') })); }
  const all = [...(d.slides || [])].sort((a, b) => (a.pos || 0) - (b.pos || 0)), shown = all.filter((s) => !s.d?.hide);
  const list = big ? shown.slice(0, 60) : shown.slice(0, 1);
  // the pictures of the slides shown: "m:<id>" → the file inside the ZIP (deck.json media: src → name)
  const media = d.media || {};
  // a picture that is not inside the file (an older one): from SavPresentations, where its pictures are public by id
  const fromApp = (v) => { const id = 'sd-' + v.slice(2); Lc.urls.set(id, '../savpresentations/api/?r=media&id=' + encodeURIComponent(v.slice(2))); return 'l:' + id; };
  const fix = async (v) => {
    if (typeof v === 'string') return media[v] ? (await blobUrl(d, 'media/' + media[v], big ? 1600 : 480)) || fromApp(v) : /^m:[A-Za-z0-9]{8,64}$/.test(v) ? fromApp(v) : v;
    if (Array.isArray(v)) return Promise.all(v.map(fix));
    if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = await fix(x); return o; }
    return v;
  };
  const ctx = T.context(d.meta);
  const thumbs = [];
  for (const s of list) thumbs.push(R.fluidThumb(await fix(s.d || { els: {} }), ctx, { index: all.indexOf(s), count: all.length }));
  return shadowBox(['../savpresentations/assets/app.css'], big ? h('div.opages', thumbs) : thumbs, big ? '.big.oslides' : '.oslides');
}

async function pagesApp(app, d, big) {
  const base = `../${app}/assets/`;
  pageSheet(base + 'fonts.css');
  const [T, C] = await Promise.all([import(`../../${app}/assets/thumbs.js`), import(`../../${app}/assets/clean.js`)]);
  const blocks = (Array.isArray(d.blocks) ? d.blocks : []).map((b) => ({ h: C.cleanBlocks(String(b?.h || ''))[0] })).filter((b) => b.h);
  // the pages: a page ends at a page break or after 26 blocks (as the small picture of the app); a card shows the first
  const pages = [];
  let cur = [];
  for (const b of blocks) { if (/class="pb"/.test(b.h) || cur.length >= 26) { if (cur.length) pages.push(cur); cur = []; if (/class="pb"/.test(b.h)) continue; } cur.push(b); }
  if (cur.length || !pages.length) pages.push(cur);
  const shown = big ? pages.slice(0, 40) : pages.slice(0, 1);
  // the pictures of the pages shown: media/<id>.<ext> inside the file
  const used = new Set(shown.flat().flatMap((b) => [...b.h.matchAll(/data-i="([a-f0-9]{24})"/g)].map((m) => m[1]))), urls = {};
  await Promise.all((d._names || []).map(async (name) => { const m = /^media\/([a-f0-9]{24})\.\w+$/.exec(name); if (m && used.has(m[1])) urls[m[1]] = await blobUrl(d, name, big ? 1600 : 480); }));
  const settings = d.settings || {}, imageUrl = (id) => urls[id] || undefined;
  if (!big) return shadowBox([base + 'doc.css', base + 'app.css'], T.fluidMini({ settings, blocks: shown[0] }, imageUrl), '.opage');
  return shadowBox([base + 'doc.css', base + 'app.css'], h('div.opages.narrow', shown.map((p) => T.fluidMini({ settings, blocks: p }, imageUrl))), '.big.opage');
}

async function sheetApp(d, big) {
  const [T, M, F] = await Promise.all([import('../../savspreadsheets/assets/thumbs.js'), import('../../savspreadsheets/assets/model.js'), import('../../savspreadsheets/assets/formula.js')]);
  // the formulas computed by the engine of SavSpreadsheets (the file keeps the formulas, not always their results)
  const book = M.normalize({ settings: d.settings || {}, sheets: (d.sheets || []).map((x, i) => ({ id: x.id || 's' + (i + 1), ...x })) });
  const sh = book.sheets.find((x) => !x.hidden) || book.sheets[0];
  if (!sh) throw new Error('empty');
  let value;
  try { const e = new F.Engine(book, book.settings.lang || 'en'); e.recalc(); value = (k) => { const v = e.value(sh, k); return F.isErr(v) ? v.code : v; }; } catch { value = undefined; }
  const sheet = { ...sh, settings: book.settings };
  return shadowBox(['../savspreadsheets/assets/app.css'], T.miniSheet(sheet, big ? { big: true, rows: 60, cols: 14, value } : { rows: 14, cols: 7, value }), big ? '.big.osheet' : '.osheet');
}

/** What a file looks like inside, or null when it cannot be shown this way. */
export async function contentView(x, big = false) {
  const e = ext(x.name);
  if (isArchive(x.name)) return archiveView(await archiveOf(x, big), big);
  if (OFFICE_PREVIEW.includes(e)) {
    const d = await officeOf(x);
    try {
      if (e === 'savpre') return await slidesApp(d, big);
      if (e === 'savspr') return await sheetApp(d, big);
      return await pagesApp(e === 'savboo' ? 'savbooks' : 'savdocuments', d, big);
    } catch (err) {
      console.warn('SavDrive: the app could not draw', x.name, err); // the plain view instead
      return e === 'savspr' ? sheetView(d, big) : e === 'savpre' ? slideView(d, big) : docView(d, big);
    }
  }
  return textView(await textOf(x, big), big);
}

// ------------------------------------------------------------------ what the apps keep (the folders of the apps in My drive)

/*
 * The items of the folders of the apps are not files of the drive: their small pictures come from the apps themselves,
 * as their homes show them (same site: the session of the app goes with the request; without it, the icon stays).
 * Documents, books and spreadsheets: doc.previews (24 at a time) · presentations: home.list · boards: wb.init.
 */
const appGet = (app, r, q = '') => request(`../${app}/api/?r=${r}${q}`, { credentials: 'same-origin', cache: 'no-store' }, { lo: true }).then((res) => (res.ok ? res.json() : null)).catch(() => null);
const homes = new Map();
const appHome = (app, r) => { const k = app + r, m = homes.get(k); if (m && Date.now() - m.at < 60000) return m.p; const p = appGet(app, r); homes.set(k, { at: Date.now(), p }); return p; };
const waits = new Map();
function docPreview(app, id) {
  return new Promise((resolve) => {
    let w = waits.get(app);
    if (!w) { w = { list: [], timer: 0 }; waits.set(app, w); }
    w.list.push({ id, resolve });
    const go = async () => {
      clearTimeout(w.timer); w.timer = 0;
      const part = w.list.splice(0, 24);
      if (w.list.length) w.timer = setTimeout(go, 0);
      const d = await appGet(app, 'doc.previews', '&ids=' + part.map((x) => encodeURIComponent(x.id)).join(','));
      for (const x of part) x.resolve(d?.previews?.[x.id] || null);
    };
    if (w.list.length >= 24) go(); else if (!w.timer) w.timer = setTimeout(go, 80);
  });
}
async function appView(x) {
  const app = x.office.app, id = x.id.split(':').slice(2).join(':');
  if (app === 'savdocuments' || app === 'savbooks') {
    const pv = await docPreview(app, id);
    if (!pv) return null;
    const base = `../${app}/assets/`;
    pageSheet(base + 'fonts.css');
    const [T, C] = await Promise.all([import(`../../${app}/assets/thumbs.js`), import(`../../${app}/assets/clean.js`)]);
    const blocks = (pv.blocks || []).map((b) => ({ h: C.cleanBlocks(String(b?.h ?? b ?? ''))[0] })).filter((b) => b.h);
    return shadowBox([base + 'doc.css', base + 'app.css'], T.fluidMini({ settings: pv.settings || {}, blocks }, (i) => `../${app}/api/?r=img&id=${encodeURIComponent(i)}`), '.opage');
  }
  if (app === 'savspreadsheets') {
    const pv = await docPreview(app, id);
    if (!pv) return null;
    const T = await import('../../savspreadsheets/assets/thumbs.js');
    const o = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
    return shadowBox(['../savspreadsheets/assets/app.css'], T.miniSheet({ ...pv, cells: o(pv.cells), cols: o(pv.cols), rows: o(pv.rows) }), '.osheet');
  }
  if (app === 'savpresentations') {
    const home = await appHome(app, 'home.list'), d = [...(home?.decks || []), ...(home?.shared || [])].find((y) => y.uid === id);
    if (!d?.first || !d.format) return null;
    const [R, T, Lc] = await Promise.all([import('../../savpresentations/assets/render.js'), import('../../savpresentations/assets/themes.js'), import('../../savpresentations/assets/local.js')]);
    if (!sheets.has('sp-fonts')) { sheets.add('sp-fonts'); document.head.append(h('style', { html: T.fontFaces().replaceAll('url("fonts/', 'url("../savpresentations/fonts/') })); }
    // its pictures are public by id in SavPresentations
    const fix = (v) => (typeof v === 'string' && /^m:[A-Za-z0-9]{8,64}$/.test(v) ? (Lc.urls.set('sd-' + v.slice(2), '../savpresentations/api/?r=media&id=' + v.slice(2)), 'l:sd-' + v.slice(2))
      : Array.isArray(v) ? v.map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, y]) => [k, fix(y)])) : v);
    const slide = fix(d.first);
    if (!slide.els || Array.isArray(slide.els)) slide.els = {};
    const ctx = T.context({ format: d.format, theme: { colors: {}, fonts: {}, ...(d.theme || {}) }, opts: {} });
    return shadowBox(['../savpresentations/assets/app.css'], R.fluidThumb(slide, ctx, { index: 0, count: d.slides || 1 }), '.oslides');
  }
  if (app === 'savwhiteboard') {
    const home = await appHome(app, 'wb.init'), b = (home?.boards || []).find((y) => y.id === id);
    if (!b?.thumb) return null;
    const src = /^(data:image\/|blob:)/.test(b.thumb) ? b.thumb : '../savwhiteboard/' + String(b.thumb).replace(/^\.?\//, '');
    return h('div.oview.oboard', { style: `background:${/^#[0-9a-f]{3,8}$/i.test(b.bg || '') ? b.bg : '#fff'}` }, h('img', { src, alt: '', loading: 'lazy' }));
  }
  if (app === 'savdiagrams') {
    const home = await appHome(app, 'dg.init'), b = (home?.diagrams || []).find((y) => y.id === id);
    if (!b?.thumb || !/^data:image\//.test(b.thumb)) return null;
    return h('div.oview.oboard', { style: `background:${/^#[0-9a-f]{3,8}$/i.test(b.bg || '') ? b.bg : '#fff'}` }, h('img', { src: b.thumb, alt: '', loading: 'lazy' }));
  }
  return null;
}
/** The small picture of an item of an app, when it comes into view. */
export const APP_PREVIEW = ['savdocuments', 'savbooks', 'savspreadsheets', 'savpresentations', 'savwhiteboard', 'savdiagrams'];
export function lazyApp(holder, x) {
  holder.__fill = async () => { try { const v = await appView(x); if (v) { holder.replaceChildren(v); holder.classList.add('filled'); } } catch (e) { console.warn('SavDrive: no picture from', x.office.app, e); } };
  if (io) io.observe(holder); else holder.__fill();
  return holder;
}

/** Fills `holder` when it comes into view (cards far down are read only if someone scrolls to them). */
const io = 'IntersectionObserver' in window ? new IntersectionObserver((list) => {
  for (const it of list) if (it.isIntersecting) { io.unobserve(it.target); it.target.__fill?.(); }
}, { rootMargin: '200px' }) : null;
export function lazyFill(holder, x) {
  holder.__fill = async () => { try { const v = await contentView(x, false); if (v) holder.replaceChildren(v); holder.classList.add('filled'); } catch { /* the icon stays */ } };
  if (io) io.observe(holder); else holder.__fill();
  return holder;
}
