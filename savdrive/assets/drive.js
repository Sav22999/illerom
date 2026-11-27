/**
 * The drive: a side menu (New, My drive, Recent, Starred, Shared, Trash, the space used), the folder with its path, files
 * and folders as cards or rows, selection, menus, moving, uploads with their progress, previews.
 *   #/  My drive · #/f/<id> a folder · #/recent · #/starred · #/shared · #/temp (temporary links: assets/temp.js) · #/trash · #/search/<words> · #/vault[/<id>] (vault.js)
 */
import { ask, btn, bytes, confirm, copyText, dialog, drop, empty, errText, face, fail, h, icon, iconBtn, item, menuAt, mobile, primary, put, segmented, select, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, fileUrl, lazyImg, thumbFor, thumbUrl, upload } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { APPS, KINDS, NAMES, appOf, blankFile, openInApp } from './office.js';
import { APP_PREVIEW, OFFICE_PREVIEW, contentView, isArchive, lazyApp, lazyFill } from './preview.js';
import { tempDialog, tempView } from './temp.js';

// ------------------------------------------------------------------ small helpers

export { bytes }; // lives in ui.js (the previews use it too); app.js takes it from here
const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();
/** What a file is, for its icon, its colour and how it can be shown. */
/**
 * Which kinds of files show what is inside them in the cards (Settings → My drive). Off by default (it is slower), except
 * the pictures peeking out of the folders; the old single switch (previews: true) turns them all on.
 */
export const PREVIEW_KINDS = ['images', 'texts', 'office', 'archives', 'folders'];
export function previewOn(kind) {
  const p = prefs().previews;
  if (p === true) return true;
  if (p && typeof p === 'object' && typeof p[kind] === 'boolean') return p[kind];
  return kind === 'folders';
}
export function kindOf(it) {
  if (it.kind === 'folder') return { ic: 'folder', c: it.color || '#5f7d95', k: 'folder' };
  const m = it.mime || '', e = ext(it.name);
  if (it.app || appOf(it.name)) return { ic: 'file', c: '#0a6fb0', k: 'office' };
  if (/^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(m)) return { ic: 'file-image', c: '#c45a0c', k: 'image' };
  if (m.startsWith('image/')) return { ic: 'file-image', c: '#c45a0c', k: 'file' };
  if (/^video\/(mp4|webm|ogg)$/.test(m)) return { ic: 'file-video', c: '#c93a2f', k: 'video' };
  if (m.startsWith('video/')) return { ic: 'file-video', c: '#c93a2f', k: 'file' };
  if (m.startsWith('audio/')) return { ic: 'file-audio', c: '#86329e', k: 'audio' };
  if (m === 'application/pdf') return { ic: 'file-text', c: '#c62f3b', k: 'pdf' };
  if (/^(xlsx|xls|ods|csv|tsv)$/.test(e)) return { ic: 'table-2', c: '#4d7c0f', k: e === 'csv' || e === 'tsv' ? 'text' : 'file' };
  if (/^(pptx|ppt|odp|key)$/.test(e)) return { ic: 'presentation', c: '#6d3bef', k: 'file' };
  if (/^(docx|doc|odt|rtf|pages|epub)$/.test(e)) return { ic: 'file-text', c: '#1f56d1', k: 'file' };
  if (/^(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(e)) return { ic: 'file-archive', c: '#7b5434', k: 'file' };
  if (/^(json|js|mjs|ts|html|htm|css|xml|php|py|java|c|cpp|h|rb|go|rs|sh|yml|yaml|sql|kt|swift)$/.test(e)) return { ic: 'file-code', c: '#0b7a87', k: 'text' };
  if (m.startsWith('text/') || /^(txt|md|log|ini|cfg)$/.test(e)) return { ic: 'file-text', c: '#55646f', k: 'text' };
  return { ic: 'file', c: '#55646f', k: 'file' };
}
const appIcon = (app, size = 40) => h('img', { src: `../${app}/icons/favicon.svg`, alt: '', width: size, height: size, class: 'appic' });
const FOLDER_COLORS = ['', '#0a6fb0', '#13a079', '#c45a0c', '#c93a2f', '#86329e', '#c2307a', '#b7791f', '#55646f'];

// ------------------------------------------------------------------ uploads: one at a time, in a panel at the bottom

const queue = [];
/** How many uploaded files the folder waits for before showing them: one by one up to 30, then 5, 10 or 25 at a time; LIVE_WAIT at most. */
const liveBatch = (total) => (total <= 30 ? 1 : total <= 100 ? 5 : total <= 500 ? 10 : 25), LIVE_WAIT = 8000;
let panel = null, running = false, afterUpload = null, sameForAll = null;
/** A file with this name is already in the folder: replace it, keep both ("Name (2)"), or leave this one out. */
function askConflict(name) {
  if (sameForAll) return Promise.resolve(sameForAll);
  return new Promise((res) => {
    let pick = 'skip';
    const all = h('sav-checkbox', {}, t('conflict_all'));
    dialog({ title: t('conflict_title'), width: '28rem', body: h('div.form', h('p', t('conflict_text', { name })), all),
      actions: [{ label: t('conflict_skip'), run: () => { pick = 'skip'; } }, { label: t('conflict_keep'), run: () => { pick = 'keep'; } }, { label: t('conflict_replace'), primary: true, run: () => { pick = 'replace'; } }],
      onclose: () => { if (all.checked) sameForAll = pick; res(pick); } });
  });
}
/** A length of time, short: "45 s", "3 min 20 s", "1 h 05 min". */
export function duration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + ' s';
  if (sec < 3600) return Math.floor(sec / 60) + ' min' + (sec % 60 && sec < 600 ? ' ' + (sec % 60) + ' s' : '');
  return Math.floor(sec / 3600) + ' h ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + ' min';
}
let batchStart = 0;
/** How long the uploads have been going and, from the speed so far, how long they still need ("" at the start). */
function timing() {
  const live = queue.filter((q) => q.state !== 'error'), total = live.reduce((n, q) => n + q.size, 0);
  const sent = live.reduce((n, q) => n + (q.state === 'done' ? q.size : q.state === 'run' ? q.sent : 0), 0), secs = (Date.now() - batchStart) / 1000;
  const parts = [t('up_elapsed', { t: duration(secs) })];
  if (secs > 3 && sent > 0 && total > sent) parts.push(t('up_left', { t: duration(((total - sent) / sent) * secs) }));
  return parts.join(' · ');
}
setInterval(() => { if (panel && queue.some((q) => q.state === 'run')) panel.querySelector('.utime')?.replaceChildren(timing()); }, 1000);
function drawPanel() {
  if (!queue.length) { panel?.remove(); panel = null; batchStart = 0; return; }
  if (!panel) { panel = h('sav-card.upanel', { appearance: 'elevated' }); document.body.append(panel); }
  const done = queue.filter((q) => q.state === 'done').length, active = queue.some((q) => q.state === 'wait' || q.state === 'run');
  // while it uploads: one button stops everything (what is done stays); then the panel can be closed
  const stopAll = () => { for (const q of queue) if (q.state === 'run' || q.state === 'wait') { q.abort.abort(); q.state = 'error'; q.error = t('cancelled'); } drawPanel(); };
  if (active && !batchStart) batchStart = Date.now();
  if (!active) batchStart = 0;
  put(panel, h('div.uhead', h('div.utitle', h('b', active ? t('uploading', { n: queue.length - done }) : t('uploaded', { n: done })), active ? h('small.utime.muted', timing()) : null), h('span.grow'),
    active ? btn(t('cancel_all'), { size: 'sm', appearance: 'ghost', onclick: stopAll }) : iconBtn('x', t('close'), () => { queue.length = 0; drawPanel(); })),
    // what is still going on at the top (the one being sent, then those waiting), what is over under them
    h('div.ulist', [...queue].sort((a, b) => ORDER[a.state] - ORDER[b.state]).map((q) => h('div.urow', { 'data-state': q.state },
      h('span.uic', icon(q.state === 'done' ? 'check-circle' : q.state === 'error' ? 'alert-circle' : kindOf({ name: q.name, mime: q.file?.type || '' }).ic)),
      h('div.uinfo', h('span.uname', { title: q.name }, q.name), q.state === 'error' ? h('small.uerr', q.error) : q.state === 'done' ? h('small', bytes(q.size)) : h('sav-progress-bar', { value: q.sent, max: q.size || 1, 'aria-label': q.name })),
      q.state === 'run' || q.state === 'wait' ? iconBtn('x', t('cancel'), () => { q.abort.abort(); q.state = 'error'; q.error = t('cancelled'); drawPanel(); }) : null))));
}
// a reload or a closed tab while files are uploading: the browser asks first (what is not sent yet would be lost)
addEventListener('beforeunload', (e) => { if (queue.some((q) => q.state === 'run' || q.state === 'wait')) { e.preventDefault(); e.returnValue = ''; } });

const ORDER = { run: 0, wait: 1, error: 2, done: 3 };
/** Files the systems leave in folders (macOS, Windows): never uploaded. */
const JUNK = /^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*|\.localized|\.Spotlight-V100|\.Trashes|\.fseventsd)$/i;
/** items: [{file, folder, name}] */
function enqueue(items) {
  items = items.filter((x) => !JUNK.test(x.name || x.file.name));
  if (!items.length) return;
  for (const x of items) queue.push({ ...x, name: x.name || x.file.name, size: x.file.size, sent: 0, state: 'wait', abort: new AbortController() });
  drawPanel();
  run();
}
async function run() {
  if (running) return;
  running = true;
  for (let q; (q = queue.find((x) => x.state === 'wait'));) {
    q.state = 'run';
    drawPanel();
    let last = 0;
    try {
      const opts = { name: q.name, signal: q.abort.signal, onProgress: (n) => { q.sent = n; if (Date.now() - last > 150) { last = Date.now(); drawPanel(); } } };
      let r;
      // q.send: another way to send it (the Vault encrypts it first, vault.js)
      try { r = await (q.send || upload)(q.file, q.folder, opts); } catch (e) {
        if (e.code !== 'name_taken') throw e;
        const what = await askConflict(q.name);
        if (what === 'skip') { q.state = 'error'; q.error = t('conflict_skipped'); drawPanel(); continue; }
        r = await upload(q.file, q.folder, what === 'replace' ? { ...opts, replace: e.data.existing } : { ...opts, conflict: 'rename' });
      }
      q.state = 'done';
      q.item = r.item;
      if (r.used !== undefined) setSpace(r.used, r.quota, r.parts);
    } catch (e) {
      if (q.state !== 'error') { q.state = 'error'; q.error = e.code === 'quota' ? t('err_quota_file', { free: bytes(Math.max(0, (e.data?.quota || 0) - (e.data?.used || 0))) }) : errText(e); }
    }
    drawPanel();
    // the file appears in the folder at once (from the answer of the upload, no other request); the whole list once at the end
    if (q.state === 'done') (q.after || afterUpload)?.(q);
  }
  running = false;
  afterUpload?.(null);
  sameForAll = null;
  if (queue.length && queue.every((q) => q.state === 'done')) setTimeout(() => { if (queue.every((q) => q.state === 'done')) { queue.length = 0; drawPanel(); } }, 4000);
}

/** Files (and folders) dropped from the device: folders are walked, and made again in the drive. */
async function walkDrop(dt) {
  const out = [], entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...(dt.files || [])].map((file) => ({ file, path: '' }));
  const readAll = (dir) => new Promise((res) => { const r = dir.createReader(), all = []; const next = () => r.readEntries((list) => { if (!list.length) return res(all); all.push(...list); next(); }, () => res(all)); next(); });
  const walk = async (e, path) => {
    if (e.isFile) out.push({ file: await new Promise((res, rej) => e.file(res, rej)), path });
    else if (e.isDirectory) for (const c of await readAll(e)) await walk(c, path ? `${path}/${e.name}` : e.name);
  };
  for (const e of entries) await walk(e, '');
  return out;
}
/** Makes the folders of the paths (a/b/c) under `parent` and returns their ids. */
async function makeFolders(paths, parent) {
  const ids = { '': parent };
  for (const p of [...new Set(paths)].filter(Boolean).sort()) {
    let cur = '';
    for (const part of p.split('/')) {
      const next = cur ? `${cur}/${part}` : part;
      if (!(next in ids)) ids[next] = (await api('folder.create', { name: part, parent: ids[cur] || null, reuse: true })).item.id; // a folder uploaded again goes into the same one
      cur = next;
    }
  }
  return ids;
}
async function uploadAll(list, folder) {
  // the files the systems leave in folders, and the folders of them (__MACOSX), stay out: no empty folder made for them
  list = list.filter((x) => !JUNK.test(x.file.name) && !/(^|\/)(__MACOSX|\.Spotlight-V100|\.Trashes|\.fseventsd)(\/|$)/.test(x.path || ''));
  if (!list.length) return;
  try {
    const ids = await makeFolders(list.map((x) => x.path), folder);
    if (list.some((x) => x.path)) afterUpload?.(null); // the folders just made show up before their files travel
    // top: the folder dropped (or chosen) that holds the file, as a card of the folder that is open: its count grows live
    enqueue(list.map((x) => ({ file: x.file, folder: ids[x.path] || null, top: x.path ? ids[x.path.split('/')[0]] || null : null })));
  } catch (e) { fail(e); }
}
// the Vault (vault.js) sends its files through the same panel, with its own q.send and q.after
export { enqueue as queueUploads, walkDrop, pick as pickFiles, setSpace as showSpace };
const pick = (o = {}) => new Promise((res) => {
  const i = h('input', { type: 'file', multiple: true, webkitdirectory: o.dir || null });
  i.addEventListener('change', () => res([...i.files]));
  i.addEventListener('cancel', () => res([]));
  i.click();
});

// ------------------------------------------------------------------ the space used, in the side menu

let spaceBox = null;
/** The space of the whole of SavOffice (one for each person): the bar, and what each app keeps, largest first. */
export const spaceParts = (parts) => Object.entries(parts || {}).filter(([, b]) => b > 0).sort((a, b) => b[1] - a[1])
  .map(([app, b]) => h('li', h('img', { src: `../${app}/icons/favicon.svg`, alt: '', width: 16, height: 16 }), h('span', NAMES[app] || (app === 'savdrive' ? 'SavDrive' : app)), h('b', bytes(b))));
export const unlimited = (quota) => quota >= 1e18; // the server sends the largest number it has
function setSpace(used, quota, parts) {
  if (S.user) { S.user.used = used; S.user.quota = quota; if (parts) S.user.parts = parts; }
  if (!spaceBox) return;
  const pc = unlimited(quota) ? 0 : quota ? Math.min(100, (used / quota) * 100) : 0, list = spaceParts(parts || S.user?.parts);
  put(spaceBox, h('div.qhead', icon('hard-drive'), h('b', t('space'))), unlimited(quota) ? null : h('sav-progress-bar', { value: Math.max(pc, used ? 1 : 0), max: 100, variant: pc > 95 ? 'danger' : pc > 85 ? 'warning' : 'primary', 'aria-label': t('space') }),
    h('small', unlimited(quota) ? t('space_used_unl', { used: bytes(used) }) + ' · ' + t('unlimited').toLowerCase() : t('space_used', { used: bytes(used), quota: bytes(quota) })), pc > 85 ? h('small.qwarn', t(pc >= 100 ? 'space_full' : 'space_low')) : null,
    list.length > 1 || (list.length === 1 && !Object.keys(parts || S.user?.parts || {}).includes('savdrive')) ? h('ul.qparts', { 'aria-label': t('space_apps') }, list) : null);
}

// ------------------------------------------------------------------ the screen

const VIEWS = { withme: ['users', 'withme'], recent: ['clock', 'recent'], starred: ['star', 'starred'], shared: ['link', 'shared'], temp: ['timer', 'temp'], trash: ['trash-2', 'trash'] };
/** The levels on something of somebody else (lib/access.php), from the weakest; the owner can do everything. */
export const ROLES = ['view', 'read', 'comment', 'write', 'move', 'delete'];
const LV = { view: 1, read: 2, comment: 3, write: 4, move: 5, delete: 6, owner: 9 };
const can = (x, need) => (LV[x?.role || 'owner'] || 0) >= LV[need];

// ------------------------------------------------------------------ what the apps of SavOffice keep (office.get)

/** The extension of the files of an app ('savdocuments' → 'savdoc'). */
const EXT = Object.fromEntries(Object.entries(APPS).map(([e, a]) => [a, e]));
const appUrl = (app, open = '') => `../${app}/${open || ''}`;
// they look like the items of the drive (cards, rows), with the role "office": nothing can be done to them here but opening
const officeFile = (app, d) => ({ id: `o:${app}:${d[0]}`, kind: 'file', name: `${d[1] || '—'}.${EXT[app] || app}`, size: d[3] || 0, updated: d[4], app, role: 'office', office: { app, open: d[5] } });
const appFolder = (o) => ({ id: 'o:' + o.app, kind: 'folder', name: NAMES[o.app] || o.app, color: '#0a6fb0', count: o.count, size: o.size, updated: o.updated, role: 'office', office: { app: o.app, root: true },
  peek: (o.peek || []).map((p) => ({ name: `${p.name}.${EXT[o.app] || ''}`, app: o.app })) });
/** One place inside the folder of an app: its folders (with what they hold, at any depth) and its items, and the path. */
function officePlace(c, folder) {
  const ids = new Set(c.folders.map((f) => f[0])), parentOf = (f) => (f[2] && ids.has(f[2]) ? f[2] : null);
  const where = (d) => (d[2] && ids.has(d[2]) ? d[2] : null); // an item of a folder that is gone is at the top
  const kids = new Map();
  for (const f of c.folders) { const p = parentOf(f); if (!kids.has(p)) kids.set(p, []); kids.get(p).push(f); }
  const inside = (id, depth = 0) => { const list = c.items.filter((d) => where(d) === id); for (const f of depth < 30 ? kids.get(id) || [] : []) list.push(...inside(f[0], depth + 1)); return list; };
  const here = folder && ids.has(folder) ? folder : null;
  const folders = (kids.get(here) || []).map((f) => {
    const all = inside(f[0]).sort((x, y) => String(y[4] || '').localeCompare(String(x[4] || '')));
    return { id: `o:${c.app}:f:${f[0]}`, kind: 'folder', name: f[1] || '—', color: '#0a6fb0', count: all.length, size: all.reduce((n, d) => n + (d[3] || 0), 0), updated: all[0]?.[4], role: 'office',
      office: { app: c.app, folder: f[0] }, peek: all.slice(0, 2).map((d) => ({ name: `${d[1]}.${EXT[c.app] || ''}`, app: c.app })) };
  });
  const path = [];
  for (let f = here, i = 0; f && i < 30; i++) { const x = c.folders.find((y) => y[0] === f); if (!x) break; path.unshift({ id: x[0], name: x[1] }); f = parentOf(x); }
  return { items: [...folders, ...c.items.filter((d) => where(d) === here).map((d) => officeFile(c.app, d))], path, role: 'office', office: c.app };
}

export async function home(root, a, b, c) {
  // #/o/<app>[/<folder>]: the folder of an app of SavOffice
  const office = a === 'o' && /^sav[a-z]+$/.test(b || '') ? { app: b, folder: c ? decodeURIComponent(c) : null } : null;
  const where = office ? 'office' : a === 'f' && b ? b : VIEWS[a] ? a : a === 'search' ? 'search' : a === 'vault' ? 'vault' : 'root';
  const q = a === 'search' ? decodeURIComponent(b || '') : '';
  const sel = new Set();
  let data = { items: [], path: [] }, alive = true, dragging = null;

  // --- header
  const search = h('sav-input.hsearch', { type: 'search', placeholder: t('search_drive'), value: q, clearable: true, pill: true, 'aria-label': t('search_drive') }, icon('search', { slot: 'prefix' }));
  let to;
  search.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => { const v = search.value.trim(); if (where === 'vault') { if (v) go('#/search/' + encodeURIComponent(v)); return; } if (v) history.replaceState(null, '', '#/search/' + encodeURIComponent(v)); else if (where === 'search') history.replaceState(null, '', '#/'); load(v); }, 300); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; go('#/'); } });

  // --- side menu
  // the folder new things go into: the open one when this person can write there, otherwise their own My drive
  const here = () => (where === 'root' || where === 'search' || VIEWS[where] ? null : can(data, 'write') ? where : null);
  const writable = () => where === 'root' || (!VIEWS[where] && where !== 'search' && can(data, 'write'));
  const newMenu = () => {
    const trig = primary(t('new'), { icon: 'plus', size: 'lg', block: true, slot: 'trigger', class: 'newb' });
    const d = h('sav-dropdown.newd', { placement: 'bottom-start', 'sheet-on-mobile': true, label: t('new') }, trig,
      item('folder', 'folder-plus', t('new_folder')), item('files', 'upload', t('upload_files')), item('dir', 'folder-up', t('upload_folder')), item('temp', 'send', t('temp_new_item')), h('sav-divider'), h('sav-menu-label', 'SavOffice'),
      Object.entries(KINDS).map(([k, x]) => h('sav-menu-item', { value: 'k:' + k }, h('img', { slot: 'prefix', src: `../${x.app}/icons/favicon.svg`, alt: '', width: 20, height: 20, class: 'mimg' }), t(x.k), h('small', { slot: 'suffix', class: 'muted' }, '.' + k))));
    d.addEventListener('sav-select', (e) => {
      const v = String(e.detail.value);
      setTimeout(() => {
        if (v === 'folder') newFolder();
        else if (v === 'files') pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), here()));
        else if (v === 'dir') pick({ dir: true }).then((fs) => uploadAll(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), here()));
        else if (v === 'temp') newTemp();
        else if (v.startsWith('k:')) newOffice(v.slice(2));
      }, 20);
    });
    return d;
  };
  const nav = h('sav-menu.dnav', { label: t('my_drive'), selectable: true },
    [['root', 'hard-drive', t('my_drive')], ['withme', 'users', t('withme')], ['recent', 'clock', t('recent')], ['starred', 'star', t('starred')], ['shared', 'link', t('shared')], ['temp', 'timer', t('temp')], ['trash', 'trash-2', t('trash')], ['vault', 'lock', t('vault')]].map(([k, ic, l]) => { const x = item(k, ic, l); x.toggleAttribute('current', where === k || (k === 'root' && (where === 'root' || (!VIEWS[where] && where !== 'search' && where !== 'vault')))); return x; }));
  nav.addEventListener('sav-select', (e) => go(e.detail.value === 'root' ? '#/' : '#/' + e.detail.value));
  // phones: the main places in a bar at the bottom (as in SavTasks); the others under "More"
  const MORE = ['withme', 'shared', 'trash', 'vault'];
  const bnav = h('sav-bottom-nav.dbottom', { label: t('places'), fixed: true },
    [['root', 'hard-drive', t('my_drive')], ['recent', 'clock', t('recent')], ['starred', 'star', t('starred')], ['temp', 'timer', t('temp')], ['more', 'more-horizontal', t('more')]].map(([v, ic, l]) =>
      h('sav-bottom-nav-item', { icon: ic, label: l, value: v, href: v === 'more' ? null : v === 'root' ? '#/' : '#/' + v })));
  const bcurrent = (v) => bnav.querySelectorAll('sav-bottom-nav-item').forEach((x) => x.toggleAttribute('current', x.getAttribute('value') === v));
  bcurrent(MORE.includes(where) ? 'more' : VIEWS[where] ? where : where === 'search' ? null : 'root');
  bnav.addEventListener('sav-select', (e) => {
    if (e.detail.value !== 'more') return;
    const r = e.detail.item.getBoundingClientRect();
    menuAt(r.left, r.top - 8, [['users', t('withme'), () => go('#/withme')], ['link', t('shared'), () => go('#/shared')], ['trash-2', t('trash'), () => go('#/trash')], ['lock', t('vault'), () => go('#/vault')], '-', ['settings', t('settings'), () => go('#/settings')]], { label: t('more') });
    setTimeout(() => bcurrent(MORE.includes(where) ? 'more' : VIEWS[where] ? where : 'root'), 0); // the menu is not a place
  });
  spaceBox = h('div.quota');
  setSpace(S.user.used || 0, S.user.quota || 0, S.user.parts);
  // things dragged onto "My drive" move there
  const rootItem = nav.querySelector('sav-menu-item[value="root"]');
  dropTarget(rootItem, () => null);

  // --- main
  const head = h('div.dhead'), body = h('div.dbody'), main = h('main.hmain.dmain', head, body);
  const view = () => prefs().view || (mobile() ? 'list' : 'grid');
  const sortBy = () => prefs().sort || 'name';

  const ipanel = h('aside.ipanel', { 'aria-label': t('details') });
  const newSlot = where === 'vault' ? h('div.newd') : newMenu(); // the Vault puts its own New there
  const hbody = h('div.hbody' + (prefs().info && !mobile() && where !== 'vault' ? '.withinfo' : ''), h('nav.hside', newSlot, nav, spaceBox), main, ipanel);
  put(root, h('div.home.drive', h('header.htop', brand(), search, h('div.spacer'), userMenu()), hbody, credit(), bnav));
  document.title = 'SavDrive';
  // the Vault: the same side menu, everything else of its own (encrypted in the browser, vault.js)
  if (where === 'vault') {
    const { vaultHome } = await import('./vault.js');
    const stop = await vaultHome({ page: root.firstElementChild, hbody, head, body, main, newSlot, folder: b ? decodeURIComponent(b) : null });
    return () => { stop?.(); spaceBox = null; };
  }

  // files dropped from the device anywhere on the page body (side menu, folder, empty space down to the bottom): into
  // the folder that is open, or the folder card under them
  hbody.addEventListener('dragover', (e) => { if (dragging || !e.dataTransfer.types.includes('Files') || where === 'trash' || (!writable() && !VIEWS[where])) return; e.preventDefault(); main.classList.add('dropping'); });
  hbody.addEventListener('dragleave', (e) => { if (!hbody.contains(e.relatedTarget)) main.classList.remove('dropping'); });
  hbody.addEventListener('drop', async (e) => {
    main.classList.remove('dropping');
    if (dragging || !e.dataTransfer.types.includes('Files') || where === 'trash') return;
    e.preventDefault();
    if (where === 'temp') return newTemp([...(e.dataTransfer.files || [])]); // dropped on "Temporary": files of a new temporary link
    const card = e.target.closest?.('[data-folder]');
    uploadAll(await walkDrop(e.dataTransfer), card ? card.dataset.folder : here());
  });
  const onKey = (e) => {
    if (e.target.closest?.('sav-input, input, textarea, sav-dialog')) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size && where !== 'trash') { e.preventDefault(); trash([...sel]); }
    else if (e.key === 'Escape' && sel.size) { sel.clear(); draw(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'a') { e.preventDefault(); data.items.forEach((x) => sel.add(x.id)); draw(); }
  };
  addEventListener('keydown', onKey);

  // a drag on the empty space of the folder draws a rectangle that chooses what it touches (with Ctrl/⌘ or Shift it
  // adds to what is already chosen); a press there without moving lets the choice go. Nothing of the page is selected as text.
  main.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType !== 'mouse' || e.target.closest('[data-id], sav-button, sav-checkbox, sav-dropdown, sav-breadcrumb, button, a, sav-input, sav-radio-group, .offrow, sav-alert')) return;
    e.preventDefault();
    getSelection()?.removeAllRanges();
    const x0 = e.clientX, y0 = e.clientY, keep = e.ctrlKey || e.metaKey || e.shiftKey, base = new Set(keep ? sel : []);
    const box = h('div.band'), nodes = [...body.querySelectorAll('[data-id]')].filter((n) => !n.dataset.id.startsWith('o:')).map((n) => [n, n.getBoundingClientRect()]); // what the apps keep is not chosen
    let moved = false;
    const pick = (ev) => {
      const l = Math.min(x0, ev.clientX), r = Math.max(x0, ev.clientX), t0 = Math.min(y0, ev.clientY), b = Math.max(y0, ev.clientY);
      if (!moved && r - l < 5 && b - t0 < 5) return;
      if (!moved) { moved = true; document.body.append(box); }
      Object.assign(box.style, { left: l + 'px', top: t0 + 'px', width: r - l + 'px', height: b - t0 + 'px' });
      sel.clear();
      base.forEach((id) => sel.add(id));
      for (const [n, rc] of nodes) {
        const hit = rc.left < r && rc.right > l && rc.top < b && rc.bottom > t0;
        if (hit) sel.add(n.dataset.id);
        const on = sel.has(n.dataset.id);
        n.classList.toggle('on', on);
        const c = n.querySelector('sav-checkbox.pick');
        if (c) c.checked = on;
      }
    };
    const up = () => {
      removeEventListener('pointermove', pick);
      removeEventListener('pointerup', up);
      box.remove();
      if (!moved && !keep && sel.size) sel.clear();
      draw();
    };
    addEventListener('pointermove', pick);
    addEventListener('pointerup', up);
  });

  // the right button: a menu of SavDrive that depends on where it is pressed (text fields keep the menu of the browser)
  const editable = (e) => e.composedPath().some((n) => n.localName && (/^(input|textarea|sav-input|sav-textarea|sav-search)$/.test(n.localName) || n.isContentEditable));
  const selMenu = () => {
    const chosen = data.items.filter((x) => sel.has(x.id)), ids = [...sel], allStar = chosen.every((x) => x.starred), all = (need) => chosen.every((x) => can(x, need));
    return [{ head: t('n_selected', { n: ids.length }) }, ...(where === 'trash'
      ? [['undo-2', t('restore'), () => restore(ids)], ['trash-2', t('delete_forever'), () => destroy(ids), { danger: true }]]
      : [all('move') ? ['folder-input', t('move'), () => moveDialog(ids)] : null, all('owner') ? [allStar ? 'star-off' : 'star', t(allStar ? 'unstar' : 'star'), () => star(ids, !allStar)] : null,
        all('owner') && !chosen.some((x) => x.special) ? ['send', t('temp_link'), () => tempLinkOf(chosen)] : null, all('delete') ? '-' : null, all('delete') ? ['trash-2', t('to_trash'), () => trash(ids), { danger: true }] : null]),
    '-', ['x', t('clear_sel'), () => { sel.clear(); draw(); }]];
  };
  const upHere = (folder) => [['folder-plus', t('new_folder'), () => newFolder(folder)], ['upload', t('upload_files'), () => pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), folder))],
    ['folder-up', t('upload_folder'), () => pick({ dir: true }).then((fs) => uploadAll(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), folder))]];
  const areaMenu = () => {
    const viewSort = [{ head: t('view') }, ['grid', t('v_grid'), () => { setPrefs({ view: 'grid' }).catch(() => {}); draw(); }, { check: view() === 'grid' }], ['list', t('v_list'), () => { setPrefs({ view: 'list' }).catch(() => {}); draw(); }, { check: view() === 'list' }],
      { head: t('sort') }, ...['name', 'updated', 'size'].map((k) => ['', t('sort_' + k), () => { setPrefs({ sort: k }).catch(() => {}); draw(); }, { check: sortBy() === k }])];
    const all = data.items.length ? ['check', t('select_all'), () => { data.items.forEach((x) => sel.add(x.id)); draw(); }, { kbd: 'Mod+A' }] : null;
    const refresh = ['refresh', t('refresh'), () => load(search.value.trim(), true)];
    if (where === 'trash') return [data.items.length ? ['trash-2', t('empty_trash'), emptyTrash, { danger: true }] : null, all, '-', refresh];
    if (where === 'temp' && !data.q) return [['send', t('temp_new'), () => newTemp()], '-', refresh];
    if (VIEWS[where] || data.q) return [all, '-', ...viewSort, '-', refresh];
    if (!writable()) return [all, '-', ...viewSort, '-', refresh];
    return [...upHere(here()), '-', { head: 'SavOffice' }, ...Object.entries(KINDS).map(([k, x]) => ['file-plus', t(x.k), () => newOffice(k)]), '-', all, '-', ...viewSort, '-', refresh];
  };
  const placesMenu = () => [['hard-drive', t('my_drive'), () => go('#/')], ['users', t('withme'), () => go('#/withme')], ['clock', t('recent'), () => go('#/recent')], ['star', t('starred'), () => go('#/starred')], ['link', t('shared'), () => go('#/shared')], ['timer', t('temp'), () => go('#/temp')], ['trash-2', t('trash'), () => go('#/trash')], ['lock', t('vault'), () => go('#/vault')],
    '-', ['settings', t('settings'), () => go('#/settings')], S.user.master ? ['shield', t('admin'), () => go('#/admin')] : null, ['refresh', t('refresh'), () => load(search.value.trim(), true)]];
  const onMenu = (e) => {
    if (editable(e) || e.target.closest('sav-dialog, sav-popover, sav-dropdown, .ctxm')) return;
    e.preventDefault();
    const at = (items, label) => menuAt(e.clientX, e.clientY, items, { label });
    const it = e.target.closest('[data-id]');
    if (it) {
      const x = data.items.find((y) => y.id === it.dataset.id) || data.extra?.find((y) => y.id === it.dataset.id);
      if (!x) return;
      if (sel.has(x.id) && sel.size > 1) return at(selMenu(), t('n_selected', { n: sel.size }));
      return at(menuOf(x), x.name);
    }
    const crumb = e.target.closest('[data-crumb]');
    if (crumb) {
      if (crumb.dataset.crumb === 'withme') return at([['folder-open', t('open'), () => go('#/withme')]], crumb.textContent);
      const id = crumb.dataset.crumb === 'root' ? null : crumb.dataset.crumb, mine = !data.sharedRoot;
      return at([['folder-open', t('open'), () => go(id ? '#/f/' + id : '#/')], ...(mine || (id === where && writable()) ? ['-', ...upHere(id)] : [])], crumb.textContent);
    }
    const place = e.target.closest('sav-menu-item[value]');
    if (place && nav.contains(place)) {
      const v = place.getAttribute('value'), to = v === 'root' ? '#/' : '#/' + v;
      const emptyIt = async () => { if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('empty_trash')))) return; const r = await api('trash.empty', {}); setSpace(r.used, r.quota, r.parts); if (where === 'trash') load('', true); };
      const items = [['folder-open', t('open'), () => go(to)]];
      if (v === 'root') items.push('-', ...upHere(null));
      if (v === 'trash') items.push('-', ['trash-2', t('empty_trash'), emptyIt, { danger: true }]);
      if (v === 'temp') items.push('-', ['send', t('temp_new'), () => newTemp()]);
      return at(items, place.textContent.trim());
    }
    if (e.target.closest('.newd')) return at(upHere(here()).concat([['send', t('temp_new_item'), () => newTemp()], '-', { head: 'SavOffice' }], Object.entries(KINDS).map(([k, x]) => ['file-plus', t(x.k), () => newOffice(k)])), t('new'));
    if (spaceBox && spaceBox.contains(e.target)) return at([['trash-2', t('trash'), () => go('#/trash')], ['settings', t('space'), () => go('#/settings/space')]], t('space'));
    if (main.contains(e.target)) { if (sel.size > 1) return at(selMenu(), t('n_selected', { n: sel.size })); return at(areaMenu(), t('my_drive')); }
    return at(placesMenu(), 'SavDrive');
  };
  const page = root.firstElementChild; // before the menu of the app (app.js, on root), which then sees it handled
  page.addEventListener('contextmenu', onMenu);
  // q: a file just uploaded (it appears here if it went into this folder); null: the list again, from the server.
  // Shown one by one for a few files, in groups for many (liveBatch: 5, 10 or 25), never waiting more than LIVE_WAIT
  let fresh = [], freshTimer = 0;
  const showFresh = () => {
    clearTimeout(freshTimer);
    freshTimer = 0;
    if (!alive || !fresh.length) { fresh = []; return; }
    const here = where === 'root' ? null : where;
    for (const q of fresh) {
      // a file that went inside a folder shown here (an uploaded folder): its card counts it
      const card = q.top && q.top !== here ? data.items.find((x) => x.id === q.top && x.kind === 'folder') : null;
      if (card) { card.count = (card.count || 0) + 1; card.size = (card.size || 0) + (q.size || 0); continue; }
      if ((q.folder || null) !== here) continue;
      const i = data.items.findIndex((x) => x.id === q.item.id);
      if (i >= 0) data.items[i] = { ...data.items[i], ...q.item }; else data.items.push({ ...q.item, role: data.sharedRoot ? data.role || 'write' : 'owner' });
    }
    fresh = [];
    draw();
  };
  afterUpload = (q) => {
    if (!alive) return;
    if (!q) { fresh = []; clearTimeout(freshTimer); freshTimer = 0; load(search.value.trim(), true); return; }
    if (!q.item || data.q || VIEWS[where]) return;
    fresh.push(q);
    if (fresh.length >= liveBatch(queue.length)) showFresh(); else if (!freshTimer) freshTimer = setTimeout(showFresh, LIVE_WAIT);
  };

  // ---------------------------------------------------------------- loading and drawing

  async function load(qq = q, quiet = false) {
    // "Temporary": the temporary links, drawn by assets/temp.js
    if (where === 'temp' && !qq) { data = { items: [], path: [] }; sel.clear(); setCommands([]); return tempView({ head, body, reload: () => load('', true), space: spaceOf }); }
    if (!quiet) put(body, h('div.dwait', h('sav-spinner', { style: 'font-size:2rem' })));
    try {
      if (office && !qq) data = officePlace(await api('office.get', undefined, { app: office.app }), office.folder);
      else data = await api('drive.list', undefined, qq ? { q: qq } : { in: where === 'search' || office ? 'root' : where });
      data.q = qq;
      if (!alive) return;
      if (typeof data.office !== 'string') setSpace(data.used, data.quota, data.parts);
      // inside somebody else's folder the place is "Shared with me"
      if (!VIEWS[where] && where !== 'search') { nav.querySelectorAll('sav-menu-item').forEach((m) => m.toggleAttribute('current', m.getAttribute('value') === (data.sharedRoot ? 'withme' : 'root'))); bcurrent(data.sharedRoot ? 'more' : 'root'); }
      for (const id of [...sel]) if (!data.items.some((x) => x.id === id)) sel.delete(id);
      draw();
    } catch (e) {
      if (!alive) return;
      if (e.code === 'not_found' || e.code === 'in_trash') { toast(t(office ? 'office_gone' : 'err_folder_gone', { app: NAMES[office?.app] || '' }), 'neutral'); go('#/'); return; }
      put(body, empty('cloud-off', errText(e), '', btn(t('retry'), { onclick: () => load(qq) })));
    }
  }

  function title() {
    if (data.q) return h('h1', t('results_for', { q: data.q }));
    if (typeof data.office === 'string') {
      // My drive › the app › its folders; and a way to the app itself
      const app = data.office, crumbs = [{ href: '#/', name: t('my_drive') }, { href: '#/o/' + app, name: NAMES[app] || app }, ...data.path.map((f) => ({ href: `#/o/${app}/${encodeURIComponent(f.id)}`, name: f.name }))];
      return h('div.crumbwrap', h('sav-breadcrumb.crumbs', { label: t('path') }, crumbs.map((x, i) => h('sav-breadcrumb-item', { href: i === crumbs.length - 1 ? null : x.href }, x.name))),
        h('sav-badge.lvl', { variant: 'neutral', appearance: 'soft', pill: true, title: t('office_note', { app: NAMES[app] || app }) }, appIcon(app, 14), t('office_badge')));
    }
    if (VIEWS[where]) return h('h1', t(VIEWS[where][1]));
    // somebody else's folder starts from "Shared with me"
    const crumbs = [data.sharedRoot ? { id: 'withme', name: t('withme') } : { id: null, name: t('my_drive') }, ...(data.path || [])];
    const bc = h('sav-breadcrumb.crumbs', { label: t('path') }, crumbs.map((c, i) => { const x = h('sav-breadcrumb-item', { href: i === crumbs.length - 1 ? null : c.id === 'withme' ? '#/withme' : c.id ? '#/f/' + c.id : '#/', 'data-crumb': c.id || 'root' }, c.name); if (i < crumbs.length - 1 && c.id !== 'withme' && (!data.sharedRoot || can(data, 'move'))) dropTarget(x, () => c.id); return x; }));
    const lvl = data.sharedRoot && data.role && data.role !== 'owner' ? h('sav-badge.lvl', { variant: 'neutral', appearance: 'soft', pill: true, title: t('lv_' + data.role + '_t') }, icon('users'), t('lv_' + data.role)) : null;
    return h('div.crumbwrap', bc, lvl);
  }

  function draw() {
    if (where === 'temp' && !data.q) return; // assets/temp.js draws it
    const items = sorted(data.items);
    setCommands(items);
    drawInfo();
    // My drive: a folder for each app of SavOffice that keeps something; a search: what the apps keep, too
    const apps = [...items.filter((x) => x.special), ...(data.office && typeof data.office !== 'string' ? data.office : []).map(appFolder)];
    const hits = (data.officeHits || []).map((d) => officeFile(d.app, [d.id, d.title, d.folder, d.size, d.updated, d.open]));
    data.extra = [...apps, ...hits];
    const folders = items.filter((x) => x.kind === 'folder' && !x.special), files = [...items.filter((x) => x.kind === 'file'), ...hits];
    // header: the path or the name of the view, or what can be done with the chosen items
    if (sel.size) {
      const chosen = data.items.filter((x) => sel.has(x.id)), allStar = chosen.every((x) => x.starred);
      put(head, h('div.selbar', iconBtn('x', t('clear_sel'), () => { sel.clear(); draw(); }), h('b', t('n_selected', { n: sel.size })), h('span.grow'), infoBtn(),
        where === 'trash' ? [btn(t('restore'), { icon: 'undo-2', size: 'sm', onclick: () => restore([...sel]) }), btn(t('delete_forever'), { icon: 'trash-2', size: 'sm', variant: 'danger', onclick: () => destroy([...sel]) })]
          : [chosen.every((x) => can(x, 'read')) ? iconBtn('download', chosen.length > 1 ? t('download_n', { n: chosen.length }) : t('download'), () => downloadAll(chosen)) : null, chosen.every((x) => can(x, 'move')) ? iconBtn('folder-input', t('move'), () => moveDialog([...sel])) : null,
            chosen.every((x) => can(x, 'owner')) ? iconBtn(allStar ? 'star-off' : 'star', t(allStar ? 'unstar' : 'star'), () => star([...sel], !allStar)) : null,
            chosen.every((x) => can(x, 'owner') && !x.special) ? iconBtn('send', t('temp_link'), () => tempLinkOf(chosen)) : null, chosen.every((x) => can(x, 'delete')) ? iconBtn('trash-2', t('to_trash'), () => trash([...sel])) : null]));
    } else {
      put(head, title(), h('span.grow'),
        where === 'trash' && items.length ? btn(t('empty_trash'), { icon: 'trash-2', size: 'sm', variant: 'danger', appearance: 'soft', onclick: emptyTrash }) : null,
        typeof data.office === 'string' ? btn(t('open_app', { app: NAMES[data.office] || data.office }), { icon: 'external', size: 'sm', appearance: 'outline', onclick: () => window.open(appUrl(data.office), '_blank', 'noopener') }) : null,
        typeof data.office === 'string' ? null : infoBtn(), dropSort(), segmented(t('view'), view(), [['grid', 'grid', t('v_grid')], ['list', 'list', t('v_list')]], (v) => { setPrefs({ view: v }).catch(() => {}); draw(); }));
    }
    if (!items.length && !apps.length && !hits.length) {
      const e = data.q ? empty('search', t('no_results'), t('no_results_t'))
        : typeof data.office === 'string' ? empty('folder', t('folder_empty'), '')
        : where === 'trash' ? empty('trash-2', t('trash_empty'), t('trash_empty_t'))
          : where === 'starred' ? empty('star', t('no_starred'), t('no_starred_t'))
            : where === 'shared' ? empty('link', t('no_shared'), t('no_shared_t'))
              : where === 'withme' ? empty('users', t('no_withme'), t('no_withme_t'))
                : !writable() ? empty('folder', t('folder_empty'), '')
              : where === 'recent' ? empty('clock', t('no_recent'), t('no_recent_t'))
                : empty('upload', t('folder_empty'), t('folder_empty_t'), h('div.prow.wrap.cen', primary(t('upload_files'), { icon: 'upload', onclick: () => pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), here())) }), btn(t('new_folder'), { icon: 'folder-plus', onclick: () => newFolder() })));
      put(body, where === 'trash' ? null : officeRow(), h('div.dempty', e));
      return;
    }
    const note = where === 'trash' ? h('sav-alert.tnote', { variant: 'neutral' }, t('trash_note')) : null;
    if (view() === 'list') {
      put(body, note, !VIEWS[where] && !office && !data.q && !data.path?.length ? officeRow() : null, h('div.dlist', { role: 'list' }, h('div.lhead', h('span'), h('span', t('name')), h('span.lc-m', t(where === 'trash' ? 'trashed' : 'modified')), h('span.lc-s', t('size')), h('span')), [...apps, ...items.filter((x) => !x.special), ...hits].map(row)));
    } else {
      put(body, note, !VIEWS[where] && !office && !data.q && !data.path?.length ? officeRow() : null,
        apps.length ? [h('h2.dsec', t('office_apps')), h('div.dgrid.fgrid', { role: 'list' }, apps.map(card))] : null,
        folders.length ? [h('h2.dsec', t('folders')), h('div.dgrid.fgrid', { role: 'list' }, folders.map(card))] : null,
        files.length ? [h('h2.dsec', t('files')), h('div.dgrid', { role: 'list' }, files.map(card))] : null);
    }
  }

  /** What the search of actions (⌘J / Ctrl+J) offers here: new things, the places, the items of this folder or view. */
  function setCommands(items) {
    const upFiles = () => pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), here()));
    const upDir = () => pick({ dir: true }).then((fs) => uploadAll(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), here()));
    commands(where === 'trash' || (!writable() && where !== 'temp') ? null : [t('new'), [['folder-plus', t('new_folder'), () => newFolder()], ['upload', t('upload_files'), upFiles], ['folder-up', t('upload_folder'), upDir], ['send', t('temp_new_item'), () => newTemp()],
        ...Object.entries(KINDS).map(([k, x]) => ['file-plus', t('new_kind', { kind: t(x.k) }), () => newOffice(k), null, x.name])]],
      [t('places'), [['hard-drive', t('my_drive'), '#/'], ['users', t('withme'), '#/withme'], ['clock', t('recent'), '#/recent'], ['star', t('starred'), '#/starred'], ['link', t('shared'), '#/shared'], ['timer', t('temp'), '#/temp'], ['trash-2', t('trash'), '#/trash'], ['lock', t('vault'), '#/vault'],
        where === 'trash' && items.length ? ['trash-2', t('empty_trash'), emptyTrash] : null]],
      items.length ? [t('in_here'), items.slice(0, 60).map((x) => [x.kind === 'folder' ? 'folder' : kindOf(x).ic, x.name, () => open(x), null, x.kind === 'folder' ? t('folder_l') : bytes(x.size)])] : null);
  }

  // ---------------------------------------------------------------- the panel of details (on the right; a window on phones)

  const infoOpen = () => hbody.classList.contains('withinfo');
  const infoBtn = () => { const b = iconBtn('info', t('details'), () => toggleInfo()); b.on(infoOpen()); return b; };
  function toggleInfo() {
    if (mobile()) { const box = h('div.ipanel.indialog'); dialog({ title: t('details'), width: '26rem', body: box, actions: [{ label: t('close') }] }); infoContent().then((c) => put(box, c)).catch(fail); return; }
    const on = !infoOpen();
    hbody.classList.toggle('withinfo', on);
    setPrefs({ info: on }).catch(() => {});
    draw();
  }
  const infoMemo = new Map();
  const getInfo = (id, v) => { const k = id + '|' + (v || ''); if (!infoMemo.has(k)) infoMemo.set(k, api('node.info', undefined, { id }).then((r) => r.info).catch((e) => { infoMemo.delete(k); throw e; })); return infoMemo.get(k); };
  let infoTurn = 0;
  async function drawInfo() {
    if (!infoOpen()) return;
    const n = ++infoTurn;
    try { const c = await infoContent(); if (n === infoTurn) put(ipanel, c); } catch (e) { if (n === infoTurn) put(ipanel, h('p.muted', errText(e))); }
  }
  const dt = (iso) => (iso ? new Date(iso).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  /** What the panel shows: the chosen item, the chosen items together, the folder that is open, or the place. */
  async function infoContent() {
    const row = (label, ...v) => (v.filter((x) => x !== null && x !== undefined && x !== '').length ? h('div.irow', h('dt', label), h('dd', v)) : null);
    const close = mobile() ? null : iconBtn('x', t('close'), () => toggleInfo());
    const chosen = data.items.filter((x) => sel.has(x.id));
    if (chosen.length > 1) {
      const files = chosen.filter((x) => x.kind === 'file').length;
      return [h('div.ihead', h('span.iic', icon('layers')), h('h3', t('n_selected', { n: chosen.length })), close),
        h('dl.irows', row(t('size'), bytes(chosen.reduce((a, x) => a + (x.size || 0), 0))), row(t('info_files'), String(files)), row(t('folders'), String(chosen.length - files)))];
    }
    const one = chosen[0] || (!VIEWS[where] && where !== 'search' && where !== 'root' ? { id: where, kind: 'folder' } : null);
    if (!one) {
      return [h('div.ihead', h('span.iic', icon(VIEWS[where]?.[0] || 'hard-drive')), h('h3', data.q ? t('results_for', { q: data.q }) : VIEWS[where] ? t(VIEWS[where][1]) : t('my_drive')), close),
        h('dl.irows', row(t('info_items'), String(data.items.length)), row(t('info_files'), String(data.items.filter((x) => x.kind === 'file').length)), row(t('folders'), String(data.items.filter((x) => x.kind === 'folder').length)),
          where === 'root' ? row(t('space'), unlimited(data.quota) ? t('space_used_unl', { used: bytes(data.used) }) : t('space_used', { used: bytes(data.used), quota: bytes(data.quota) })) : null),
        h('p.muted.small.ihint', t('info_hint'))];
    }
    const x = await getInfo(one.id, one.updated), img = x.image || {}, isFolder = x.kind === 'folder';
    const k = kindOf(x), app = x.app || appOf(x.name), e = ext(x.name);
    const place = [h('a', { href: x.mine ? '#/' : '#/withme' }, x.mine ? t('my_drive') : t('withme')), ...(x.path || []).flatMap((p) => [' › ', h('a', { href: '#/f/' + p.id }, p.name)])];
    const map = img.lat !== undefined ? h('span', `${img.lat}, ${img.lon} · `, h('a', { href: `https://www.openstreetmap.org/?mlat=${img.lat}&mlon=${img.lon}#map=15/${img.lat}/${img.lon}`, target: '_blank', rel: 'noopener' }, t('info_map'))) : null;
    return [h('div.ihead', h('span.iic', isFolder ? h('span.fic', { style: `--fc:${k.c}` }, icon('folder')) : icon(k.ic)), h('h3', { title: x.name }, x.name), close),
      isFolder ? null : h('div.ithumb', thumb(x, true)),
      h('dl.irows',
        row(t('info_kind'), isFolder ? t('folder_l') : (app ? NAMES[app] + ' · ' : '') + (e ? e.toUpperCase() : x.mime || '—')),
        row(t('size'), bytes(x.size)),
        isFolder ? row(t('info_contents'), t('info_contents_n', { files: x.files, folders: x.folders })) : null,
        row(t('info_place'), place),
        row(t('info_created'), dt(x.created)),
        row(t('modified'), dt(x.updated)),
        isFolder ? row(t('info_inner'), x.innerUpdated ? dt(x.innerUpdated) : t('folder_empty')) : null,
        x.opened ? row(t('info_opened'), dt(x.opened)) : null,
        row(t('info_author'), x.author),
        x.mine ? null : row(t('info_owner'), x.ownerName),
        x.mine || !x.role ? null : row(t('level'), t('lv_' + x.role)),
        x.mine && x.people ? row(t('info_shared'), t('shared_n', { n: x.people })) : null,
        x.shared ? row(t('share_link'), t('info_link_on')) : null,
        img.width ? row(t('info_dims'), `${img.width} × ${img.height} px`) : null,
        img.taken ? row(t('info_taken'), new Date(img.taken.replace(' ', 'T')).toLocaleString(getLang(), { dateStyle: 'medium', timeStyle: 'short' })) : null,
        img.camera ? row(t('info_camera'), img.camera) : null,
        map ? row(t('info_where'), map) : null),
      h('div.prow.wrap.iact', x.mine ? btn(t('people'), { size: 'sm', icon: 'users', onclick: () => peopleDialog(x) }) : null, can(x, 'read') ? btn(t('comments'), { size: 'sm', icon: 'message-circle', onclick: () => commentsDialog(x) }) : null)];
  }

  function sorted(list) {
    const s = sortBy(), coll = new Intl.Collator(getLang(), { numeric: true, sensitivity: 'base' });
    const by = { name: (x, y) => coll.compare(x.name, y.name), updated: (x, y) => (y.updated || '').localeCompare(x.updated || ''), size: (x, y) => (y.size || 0) - (x.size || 0) }[s] || ((x, y) => coll.compare(x.name, y.name));
    if (where === 'recent') return list;
    return [...list].sort((x, y) => (x.kind === y.kind ? by(x, y) : x.kind === 'folder' ? -1 : 1));
  }
  const dropSort = () => drop(h('sav-button', { icon: 'sliders', size: 'sm', appearance: 'ghost', variant: 'neutral', caret: true, title: t('sort'), label: t('sort') }, h('span.lbl', t('sort_' + sortBy()))),
    () => ['name', 'updated', 'size'].map((k) => ['', t('sort_' + k), () => { setPrefs({ sort: k }).catch(() => {}); draw(); }, { check: sortBy() === k }]), { placement: 'bottom-end', label: t('sort') });

  /** The quick start: a new file of an app of SavOffice in one press (at the top of My drive). */
  function officeRow() {
    if (prefs().hideOffice) return null;
    return h('section.offrow', h('div.offhead', h('h2', t('create_office')), h('span.grow'), iconBtn('x', t('hide'), () => { setPrefs({ hideOffice: true }).catch(() => {}); draw(); })),
      h('div.offlist', Object.entries(KINDS).map(([k, x]) => h('button.offb', { type: 'button', onclick: () => newOffice(k) }, appIcon(x.app, 34), h('span', h('b', t(x.k)), h('small', x.name))))));
  }

  // ---------------------------------------------------------------- one item: a card or a row

  const meta = (x) => {
    if (where === 'trash') return t('trashed_when', { when: when(x.trashed) });
    if (x.kind === 'folder') return x.count ? `${t(x.count === 1 ? 'n_items_1' : 'n_items', { n: x.count })} · ${bytes(x.size)}` : t('folder_empty');
    return `${bytes(x.size)} · ${when(x.updated)}`;
  };
  const where2 = (x) => x.office && data.q ? h('small.inf', appIcon(x.office.app, 12), NAMES[x.office.app] || x.office.app) : where === 'withme' && x.owner ? h('small.inf', icon('user'), x.owner) : (data.q || ['starred', 'recent', 'shared'].includes(where)) ? h('small.inf', icon('folder'), x.parent?.name || t('my_drive')) : null;
  /** The mark of what is shared: the people of the owner, or the level of this person on something of somebody else. */
  const tag = (x) => x.office ? null : x.role && x.role !== 'owner' ? h('span.rtag', { title: t('lv_' + x.role + '_t') + (x.owner ? ' · ' + t('owned_by', { name: x.owner }) : '') }, icon(x.role === 'view' ? 'eye' : 'users'), h('span', t('lv_' + x.role)))
    : x.people ? h('span.ptag', { title: t('shared_n', { n: x.people }) }, icon('users')) : null;
  // the cards show what is inside the kinds of files chosen in Settings (previewOn): a small picture of an image (made by
  // the server), the first lines of a text or JSON file, a document, a spreadsheet or a slide of SavOffice, the index of
  // an archive. They are asked together (thumbFor, file.heads): never a burst of requests to the hosting.
  /** A sheet peeking out of a folder card: the small picture of an image, or the icon and the extension of the file. */
  function peekSheet(f, i, folder) {
    const cls = 'i.fs.fs' + (i + 1);
    if (!f) return h(cls);
    const fk = kindOf(f), fe = ext(f.name), fapp = f.app || appOf(f.name);
    const plain = () => h(cls + '.fpk', { style: `--pc:${fk.c}`, title: f.name }, fapp ? appIcon(fapp, 22) : icon(fk.ic), fe && !fapp ? h('em', fe.slice(0, 5)) : null);
    if (fk.k === 'image' && f.size < 40e6 && previewOn('folders') && can(folder, 'read')) {
      const el = h(cls + '.fpimg', { title: f.name });
      el.append(lazyImg(h('img', { alt: '', decoding: 'async' }), () => thumbFor(f.id, f.updated), () => el.replaceWith(plain())));
      return el;
    }
    return plain();
  }
  function thumb(x, big) {
    const k = kindOf(x), app = x.app || appOf(x.name), e = ext(x.name);
    // a folder: its tile, and on the cards two sheets leaning out from behind it: the first files inside it (pictures
    // first), or two plain sheets of its colour when it is empty
    if (x.kind === 'folder') {
      const peek = big && !x.trashed ? (x.peek || []).slice(0, 2) : [];
      return h('span.fic.fstack' + (peek.length ? '.haspeek' : ''), { style: `--fc:${k.c}` }, peek.length ? [peekSheet(peek[0], 0, x), peekSheet(peek[1], 1, x)] : [h('i.fs.fs1'), h('i.fs.fs2')],
        h('span.ftile' + (x.office?.root || x.special ? '.apptile' : ''), x.office?.root || x.special ? appIcon(x.office?.app || x.special, big ? 44 : 22) : icon('folder')));
    }
    const plainIcon = () => (app ? h('span.tic.app', appIcon(app, big ? 56 : 30)) : h('span.tic', { style: `--fc:${k.c}` }, icon(k.ic), big && e ? h('em', e.slice(0, 5)) : null));
    // what an app keeps: its small picture comes from the app (its session in this browser)
    if (big && x.office && x.kind === 'file' && APP_PREVIEW.includes(x.office.app) && previewOn('office')) return h('span.tic.cwrap', lazyApp(h('span.tic.cprev', plainIcon()), x), h('span.appbadge', appIcon(x.office.app, 22)));
    if (big && can(x, 'read') && !x.trashed) {
      if ((x.mime || '').startsWith('image/') && x.size < 40e6 && previewOn('images')) return h('span.tic.img', lazyImg(h('img', { alt: '', decoding: 'async' }), () => thumbFor(x.id, x.updated), (im) => im.parentElement?.replaceWith(plainIcon())));
      if ((k.k === 'text' && x.size < 20e6 && previewOn('texts')) || (OFFICE_PREVIEW.includes(e) && previewOn('office')) || (isArchive(x.name) && e !== '7z' && previewOn('archives'))) return h('span.tic.cwrap', lazyFill(h('span.tic.cprev', plainIcon()), x), app ? h('span.appbadge', appIcon(app, 22)) : null);
    }
    return plainIcon();
  }
  function check(x) {
    if (x.office) return null; // what the apps keep is only opened from here
    const c = h('sav-checkbox.pick', { checked: sel.has(x.id) || null, 'aria-label': t('select_item', { name: x.name }) });
    c.addEventListener('click', (e) => e.stopPropagation());
    c.addEventListener('change', () => { if (c.checked) sel.add(x.id); else sel.delete(x.id); draw(); });
    return c;
  }
  const more = (x) => { const b = drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), () => menuOf(x), { placement: 'bottom-end', label: x.name }); b.addEventListener('click', (e) => e.stopPropagation()); return b; };
  // the star is the favourite button of SavComponents: it fills at once when pressed, and goes back if saving fails
  const starBtn = (x) => {
    if (where === 'trash' || !can(x, 'owner')) return null;
    const b = h('sav-favourite-button.starb', { icon: 'star', pressed: x.starred || null, appearance: 'ghost', size: 'sm', label: t('star'), title: t(x.starred ? 'unstar' : 'star') });
    b.classList.toggle('on', !!x.starred);
    b.addEventListener('click', (e) => e.stopPropagation());
    b.addEventListener('change', async (e) => {
      const on = !!e.detail?.pressed;
      b.classList.toggle('on', on); b.title = t(on ? 'unstar' : 'star');
      try { await api('node.star', { ids: [x.id], on }); x.starred = on; if (where === 'starred') load(search.value.trim(), true); } catch (err) { b.toggleAttribute('pressed', !on); b.classList.toggle('on', !on); fail(err); } // back, without a new change
    });
    return b;
  };
  function wire(n, x) {
    n.tabIndex = 0;
    n.setAttribute('role', 'listitem');
    n.setAttribute('aria-label', x.name);
    n.classList.toggle('on', sel.has(x.id));
    n.dataset.id = x.id;
    if (x.kind === 'folder') n.dataset.folder = x.id;
    // a click opens; with Ctrl/⌘ or Shift, or while something is chosen, it chooses
    n.addEventListener('click', (e) => {
      if (x.office) return open(x);
      if (e.ctrlKey || e.metaKey || e.shiftKey || sel.size) { if (e.shiftKey && sel.size) rangeTo(x); else if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); return; }
      open(x);
    });
    n.addEventListener('keydown', (e) => { if (e.target !== n) return; if (e.key === 'Enter') open(x); else if (e.key === ' ' && !x.office) { e.preventDefault(); if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); } });
    // dragged onto a folder (a card, the path, My drive): moved there
    if (where !== 'trash' && !mobile() && can(x, 'move')) {
      n.draggable = !x.special; // the folder of SavPhotos stays in My drive (things can still be dropped into it)
      n.addEventListener('dragstart', (e) => { getSelection()?.removeAllRanges(); dragging = sel.has(x.id) ? [...sel] : [x.id]; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', x.name); });
      n.addEventListener('dragend', () => { dragging = null; });
      if (x.kind === 'folder') dropTarget(n, () => x.id, x.id);
    }
    n.classList.toggle('viewonly', x.role === 'view');
    return n;
  }
  function rangeTo(x) {
    const list = sorted(data.items), i = list.findIndex((y) => y.id === x.id);
    let last = list.findIndex((y) => sel.has(y.id));
    if (last < 0) last = i;
    for (let k = Math.max(0, Math.min(last, i)); k <= Math.max(last, i) && k < list.length; k++) sel.add(list[k].id);
  }
  function dropTarget(n, idOf, self) {
    n.addEventListener('dragover', (e) => { if (!dragging || (self && dragging.includes(self))) return; e.preventDefault(); e.stopPropagation(); n.classList.add('over'); });
    n.addEventListener('dragleave', () => n.classList.remove('over'));
    n.addEventListener('drop', (e) => { n.classList.remove('over'); if (!dragging) return; e.preventDefault(); e.stopPropagation(); const ids = dragging; dragging = null; move(ids, idOf()); });
  }
  // a folder is a card as big as the files: its pile of sheets above (they open up on hover), the name and what it holds under it
  const card = (x) => wire(h('div.dcard' + (x.kind === 'folder' ? '.isfo' : ''), check(x), x.kind === 'folder'
    ? [h('div.dthumb.fthumb', { style: `--fc:${kindOf(x).c}` }, thumb(x, true)), h('div.dinfo', h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x)), where2(x), tag(x)), starBtn(x), more(x))]
    : [h('div.dthumb', thumb(x, true), x.shared ? h('span.cglobe', { title: t('has_link') }, icon('link')) : null), h('div.dinfo', h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x)), where2(x), tag(x)), starBtn(x), more(x))]), x);
  const row = (x) => wire(h('div.drow', check(x), h('div.rname', thumb(x), h('div', h('b', { title: x.name }, x.name), where2(x) || h('small.rmeta', meta(x))), x.shared ? h('span.lnk', { title: t('has_link') }, icon('link')) : null, tag(x)),
    h('span.lc-m', when(where === 'trash' ? x.trashed : x.updated)), h('span.lc-s', x.kind === 'folder' ? (x.count ? bytes(x.size) : '—') : bytes(x.size)), h('span.ract', starBtn(x), more(x))), x);

  function menuOf(x) {
    if (x.office) {
      const o = x.office, name = NAMES[o.app] || o.app;
      return x.kind === 'folder' ? [['folder-open', t('open'), () => open(x)], ['external', t('open_in', { app: name }), () => window.open(appUrl(o.app), '_blank', 'noopener')]]
        : [['external', t('open_in', { app: name }), () => open(x)], { head: t('office_note', { app: name }) }];
    }
    const app = x.app || appOf(x.name), k = kindOf(x);
    if (where === 'trash') return [['undo-2', t('restore'), () => restore([x.id])], '-', ['trash-2', t('delete_forever'), () => destroy([x.id]), { danger: true }]];
    // only what the level of this person allows (the owner can do everything)
    if (!can(x, 'read')) return [{ head: t('lv_view_t') }, x.owner ? ['user', t('owned_by', { name: x.owner }), null, { disabled: true }] : null];
    const owner = can(x, 'owner');
    return [
      x.kind === 'folder' ? ['folder-open', t('open'), () => go('#/f/' + x.id)] : app ? ['external', t('open_in', { app: NAMES[app] }), () => openInApp(x)] : ['eye', t('preview'), () => preview(x)],
      x.special === 'savphotos' ? ['external', t('open_in', { app: 'SavPhotos' }), () => window.open('../savphotos/', '_blank', 'noopener')] : null,
      x.kind === 'file' && app ? ['eye', t('details'), () => preview(x)] : null,
      x.kind === 'file' ? ['download', t('download'), () => download(x)] : ['download', t('download_zip'), () => download(x)],
      ['message-circle', t('comments'), () => commentsDialog(x)],
      owner ? ['users', t('people'), () => peopleDialog(x)] : null,
      '-',
      can(x, 'write') && !x.special ? ['edit', t('rename'), () => rename(x)] : null, // the folder of SavPhotos keeps its name and place: SavPhotos finds it so
      can(x, 'move') && !x.special ? ['folder-input', t('move'), () => moveDialog([x.id])] : null,
      x.kind === 'file' && can(x, 'write') ? ['copy', t('make_copy'), () => copy(x)] : null,
      owner ? [x.starred ? 'star-off' : 'star', t(x.starred ? 'unstar' : 'star'), () => star([x.id], !x.starred)] : null,
      x.kind === 'file' && owner ? ['link', t('share_link'), () => shareDialog(x)] : null,
      owner && !x.special ? ['send', t('temp_link'), () => tempLinkOf([x])] : null,
      x.kind === 'folder' && can(x, 'write') ? ['palette', t('color'), () => colorDialog(x)] : null,
      x.parent && (data.q || (VIEWS[where] && where !== 'withme')) ? ['folder', t('show_in_folder'), () => go(x.parent.id ? '#/f/' + x.parent.id : '#/')] : null,
      can(x, 'delete') ? '-' : null,
      can(x, 'delete') ? ['trash-2', t('to_trash'), () => trash([x.id]), { danger: true }] : null,
    ];
  }

  // ---------------------------------------------------------------- actions

  function open(x) {
    // what an app keeps: its folders open here, its items in the app (a new tab, as the files of SavOffice)
    if (x.office) {
      if (x.kind === 'folder') return go('#/o/' + x.office.app + (x.office.folder ? '/' + encodeURIComponent(x.office.folder) : ''));
      return window.open(appUrl(x.office.app, x.office.open), '_blank', 'noopener');
    }
    if (where === 'trash') return preview(x);
    if (!can(x, 'read')) return toast(t('lv_view_t'), 'neutral');
    if (x.kind === 'folder') return go('#/f/' + x.id);
    preview(x); // every file opens its preview first; "Open in …", download and the rest are there
    x.opened = new Date().toISOString();
  }
  // a file as it is; a folder as a ZIP made by the server (lib/zipstream.php), after asking whether it can be made
  // a file as it is; a folder as a ZIP made by the server (lib/zipstream.php), after asking whether it can be made.
  // quiet: no message for each one (downloadAll says it once)
  const download = async (x, quiet = false) => {
    let href = fileUrl(x.id), name = x.name;
    if (x.kind === 'folder') {
      try { await api('folder.zip', undefined, { id: x.id, check: 1 }); } catch (e) { toast((e.code === 'empty' ? t('zip_empty') : e.code === 'too_big' ? t('zip_too_big') : errText(e)) + ' (' + x.name + ')', 'danger'); return false; }
      href = `api/?r=folder.zip&id=${encodeURIComponent(x.id)}`;
      name = x.name + '.zip';
      if (!quiet) toast(t('zip_started'), 'neutral');
    }
    const a = h('a', { href, download: name }); document.body.append(a); a.click(); a.remove();
    return true;
  };
  /** Everything chosen: one download each (files as they are, folders as ZIP), a little apart so the browser lets them all start. */
  const downloadAll = async (list) => {
    if (list.length === 1) return download(list[0]);
    toast(t('downloads_n', { n: list.length }), 'neutral', { duration: 6000 });
    for (const [i, x] of list.entries()) {
      if (i) await new Promise((r) => setTimeout(r, 900));
      await download(x, true);
    }
  };
  // temporary links (assets/temp.js): files uploaded only for the link, or files and folders of the drive
  const spaceOf = (r) => { if (r && r.used !== undefined) setSpace(r.used, r.quota, r.parts); };
  const afterTemp = (r) => { spaceOf(r); if (where === 'temp') load('', true); };
  function newTemp(files = []) { tempDialog({ files, onDone: afterTemp }); }
  function tempLinkOf(list) { tempDialog({ items: list, onDone: afterTemp }); }
  async function newFolder(parent = here()) {
    const name = await ask(t('new_folder'), t('name'), t('untitled_folder'), t('create'));
    if (!name) return;
    try { await api('folder.create', { name, parent }); load(search.value.trim(), true); } catch (e) { fail(e); }
  }
  async function newOffice(k) {
    const x = KINDS[k];
    let name = null, win = null;
    await new Promise((res) => {
      const i = h('sav-input', { label: t('name'), value: t(x.k + '_new'), maxlength: 200, autofocus: true });
      const opn = h('sav-switch', { checked: true }, t('open_after', { app: x.name }));
      dialog({ title: t('new_kind', { kind: t(x.k) }), width: '28rem', body: h('div.form', h('div.kindhead', appIcon(x.app, 44), h('div', h('b', x.name), h('small.muted', t('kind_note', { ext: '.' + k })))), i, opn),
        actions: [{ label: t('cancel') }, { label: t('create'), primary: true, run: () => { const v = i.value.trim(); if (!v) return false; name = v; if (opn.checked) win = window.open('about:blank', '_blank'); return undefined; } }], onclose: res });
    });
    if (!name) return;
    try {
      const r = await upload(await blankFile(k, name), here(), { conflict: 'rename' });
      if (r.used !== undefined) setSpace(r.used, r.quota, r.parts);
      toast(t('created', { name: r.item.name }), 'success');
      if (win) win.location.href = `../${x.app}/?savdrive=${encodeURIComponent(r.item.id)}`;
      load(search.value.trim(), true);
    } catch (e) { win?.close(); fail(e); }
  }
  async function rename(x) {
    const name = await ask(t('rename'), t('name'), x.name);
    if (!name || name === x.name) return;
    try { await api('node.rename', { id: x.id, name }); load(search.value.trim(), true); } catch (e) { fail(e); }
  }
  async function copy(x) {
    try { const r = await api('node.copy', { id: x.id }); setSpace(r.used, r.quota, r.parts); toast(t('copied_as', { name: r.item.name }), 'success'); load(search.value.trim(), true); } catch (e) { fail(e); }
  }
  async function star(ids, on) {
    try { await api('node.star', { ids, on }); sel.clear(); load(search.value.trim(), true); } catch (e) { fail(e); }
  }
  async function move(ids, to) {
    try { await api('node.move', { ids, to }); sel.clear(); toast(t('moved', { n: ids.length }), 'success'); load(search.value.trim(), true); } catch (e) { fail(e); }
  }
  async function trash(ids) {
    try {
      const r = await api('node.trash', { ids });
      window.SavOffice?.driveFiles?.(r.files, true); // the documents of the apps opened from these files go to their trash too
      sel.clear();
      const tt = toast(t('trashed_n', { n: ids.length }), 'neutral', { duration: 6000 });
      const undo = h('sav-button.undo', { size: 'sm', appearance: 'outline', variant: 'neutral' }, t('undo'));
      undo.addEventListener('click', async () => { tt.remove?.(); const b = await api('node.restore', { ids }).catch(fail); window.SavOffice?.driveFiles?.(b?.files, false); load(search.value.trim(), true); });
      tt.append?.(undo);
      load(search.value.trim(), true);
    } catch (e) { fail(e); }
  }
  async function restore(ids) {
    try { const r = await api('node.restore', { ids }); window.SavOffice?.driveFiles?.(r.files, false); setSpace(r.used, r.quota, r.parts); sel.clear(); toast(t('restored', { n: ids.length }), 'success'); load('', true); } catch (e) { fail(e); }
  }
  async function destroy(ids) {
    if (!(await confirm(t('delete_forever'), t('delete_forever_t', { n: ids.length }), t('delete_forever')))) return;
    try { const r = await api('node.delete', { ids }); setSpace(r.used, r.quota, r.parts); sel.clear(); load('', true); } catch (e) { fail(e); }
  }
  async function emptyTrash() {
    if (!(await confirm(t('empty_trash'), t('empty_trash_t'), t('empty_trash')))) return;
    try { const r = await api('trash.empty', {}); setSpace(r.used, r.quota, r.parts); load('', true); } catch (e) { fail(e); }
  }

  /** Where to move: the tree of the folders, the ones being moved (and what is inside them) cannot be chosen. */
  async function moveDialog(ids) {
    let folders, mine = true;
    const others = data.items.filter((x) => ids.includes(x.id) && !can(x, 'owner'));
    try { const r = await api('drive.folders', undefined, others.length ? { in: others[0].id } : {}); folders = r.folders; mine = r.mine; } catch (e) { return fail(e); }
    const kids = {}, moving = new Set(ids);
    for (const f of folders) (kids[f.parent || ''] ||= []).push(f);
    let target = null;
    const list = h('sav-menu.mtree', { label: t('move_to'), selectable: true });
    const add = (parent, depth, blocked) => {
      for (const f of (kids[parent] || []).sort((a, b) => a.name.localeCompare(b.name, getLang(), { numeric: true }))) {
        const no = blocked || moving.has(f.id) || f.can === false;
        list.append(h('sav-menu-item', { value: f.id, disabled: no || null, style: `padding-left:${0.4 + depth * 1.1}rem` }, h('span', { slot: 'prefix', class: 'mfi', style: `--fc:${f.color || '#5f7d95'}` }, icon('folder')), f.name));
        add(f.id, depth + 1, no);
      }
    };
    if (mine) list.append(h('sav-menu-item', { value: '' }, icon('hard-drive', { slot: 'prefix' }), t('my_drive')));
    add('', mine ? 1 : 0, false);
    list.addEventListener('sav-select', (e) => { target = e.detail.value || null; list.querySelectorAll('sav-menu-item').forEach((m) => m.toggleAttribute('current', m.getAttribute('value') === (target || ''))); });
    dialog({ title: t('move_n', { n: ids.length }), width: '28rem', body: h('div.mbox', list), actions: [{ label: t('cancel') }, { label: t('move_here'), primary: true, run: () => move(ids, target) }] });
  }

  function colorDialog(x) {
    const grid = h('div.swatches', FOLDER_COLORS.map((c) => h('button.swatch', { type: 'button', style: `--fc:${c || '#5f7d95'}`, 'aria-label': c || t('color_default'), 'aria-pressed': String((x.color || '') === c), onclick: async () => { d.hide(); try { await api('node.color', { ids: [x.id], color: c }); load(search.value.trim(), true); } catch (e) { fail(e); } } }, icon('folder'))));
    const d = dialog({ title: t('color'), width: '22rem', body: grid, actions: [{ label: t('close') }] });
  }

  /**
   * People and levels of a file or folder (only its owner): who has a level here, and who gets one from a folder above.
   * Changing the level of somebody who gets it from above (also to "No access") makes an exception here, for this and
   * everything inside; "As above" takes the exception away.
   */
  function peopleDialog(x) {
    const box = h('div.pbox'), opts = (from, inherited) => [...(inherited ? [['', from ? t('lv_inherit') + ' · ' + t('lv_' + from) : t('lv_inherit')]] : []), ['none', t('lv_none')], ...ROLES.map((r) => [r, t('lv_' + r)])];
    const roleSel = (value, onpick, inherited, from, size = 'sm') => select(null, opts(from, inherited), value, onpick, { size, class: 'lvsel', 'aria-label': t('level') });
    const set = async (email, role, notify = false) => { try { const r = await api('people.set', { id: x.id, email, role, notify }); drawPeople(r.people); load(search.value.trim(), true); } catch (e) { fail(e); } };
    const email = h('sav-input', { type: 'email', placeholder: t('people_email'), 'aria-label': t('people_email'), class: 'grow' });
    let newRole = 'read';
    const addRole = roleSel('read', (v) => { newRole = v || 'read'; }, false, null, 'md'); // the height of the email field next to it
    const notify = h('sav-switch', { checked: true }, t('people_notify'));
    const add = btn(t('add'), { icon: 'plus', variant: 'primary', appearance: 'solid', onclick: async () => { const v = email.value.trim(); if (!v) return; await set(v, newRole, notify.checked); email.value = ''; } });
    email.addEventListener('keydown', (e) => { if (e.key === 'Enter') add.click(); });
    const drawPeople = (people) => {
      const rows = people.map((p) => h('div.prow2', face(p.name || p.email, null, 34), h('div.pwho', h('b', p.name || p.email), p.name ? h('small', p.email) : null,
        h('small.muted', p.here ? t('people_here') : t('people_from', { name: p.from?.name || '' }))),
        roleSel(p.here ? p.role : '', (v) => set(p.email, v === '' ? null : v), true, p.here ? null : p.role)));
      put(box, h('p.muted.small', t(x.kind === 'folder' ? 'people_folder_t' : 'people_file_t')), h('div.padd', email, addRole), h('div.prow', notify, h('span.grow'), add),
        h('h3.ph', t('people_with')), rows.length ? h('div.plist2', rows) : h('p.muted', t('people_none')));
    };
    dialog({ title: t('people') + ': ' + x.name, width: '34rem', body: box, actions: [{ label: t('done'), primary: true }] });
    put(box, h('sav-spinner'));
    api('people.get', undefined, { id: x.id }).then((r) => drawPeople(r.people)).catch(fail);
  }

  /** Comments on a file or folder: everyone who can read sees them; from "comment" up they can write. */
  function commentsDialog(x) {
    const list = h('div.clist'), text = h('sav-textarea', { placeholder: t('comment_ph'), rows: 2, maxlength: 4000, 'aria-label': t('comment_ph') });
    const loadC = async () => {
      try {
        const r = await api('comment.list', undefined, { id: x.id });
        put(list, r.comments.length ? r.comments.map((c) => h('div.cm', face(c.by || '?', null, 30), h('div.cmb', h('div.cmh', h('b', c.by || t('someone')), h('small.muted', when(c.at)), h('span.grow'),
          c.canDelete ? iconBtn('trash-2', t('delete'), async () => { await api('comment.delete', { id: c.id }); loadC(); }) : null), h('p', c.body)))) : h('p.muted', t('no_comments')));
        text.hidden = sendB.hidden = (LV[r.role] || 0) < LV.comment;
      } catch (e) { fail(e); }
    };
    const sendB = btn(t('comment_send'), { icon: 'send', variant: 'primary', appearance: 'solid', size: 'sm', onclick: async () => { const v = String(text.value || '').trim(); if (!v) return; await api('comment.add', { id: x.id, body: v }); text.value = ''; loadC(); } });
    dialog({ title: t('comments') + ': ' + x.name, width: '32rem', body: h('div.form', list, text, h('div.prow', h('span.grow'), sendB)), actions: [{ label: t('close') }] });
    put(list, h('sav-spinner'));
    loadC();
  }

  function shareDialog(x) {
    const link = (tok) => new URL(`#/s/${tok}`, location.href.split('#')[0]).href;
    const box = h('div.form');
    const drawShare = (tok) => {
      const sw = h('sav-switch', { checked: !!tok || null }, t('share_on'));
      sw.addEventListener('change', async () => { try { const r = await api('node.share', { id: x.id, on: sw.checked }); x.shared = !!r.token; drawShare(r.token); load(search.value.trim(), true); } catch (e) { fail(e); sw.checked = !sw.checked; } });
      put(box, h('p.muted', t('share_text')), sw, tok ? h('div.linkrow', h('code', link(tok)), btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(link(tok), t('link_copied')) })) : null);
    };
    dialog({ title: t('share_link') + ': ' + x.name, width: '30rem', body: box, actions: [{ label: t('done'), primary: true }] });
    if (x.shared) api('node.share', { id: x.id, on: true }).then((r) => drawShare(r.token)).catch(fail); else drawShare(null);
  }

  /** A file in a large window: pictures, PDF, video, audio and text are shown; the arrows go to the files next to it. */
  function preview(x) {
    const files = sorted(data.items).filter((y) => y.kind === 'file');
    let i = Math.max(0, files.findIndex((y) => y.id === x.id));
    const stage = h('div.pvstage'), info = h('div.pvinfo');
    const show = async () => {
      const f = files[i] || x, k = kindOf(f), app = f.app || appOf(f.name), src = fileUrl(f.id, true);
      d.setAttribute('label', f.name);
      const moreB = where === 'trash' ? null : drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'outline', variant: 'neutral', square: true, size: 'sm' }), () => menuOf(f), { placement: 'top-end', label: f.name });
      put(info, h('small.muted', `${bytes(f.size)} · ${t('modified')} ${when(f.updated)}`), h('span.grow'),
        app && where !== 'trash' ? primary(t('open_in', { app: NAMES[app] }), { size: 'sm', icon: 'external', onclick: () => openInApp(f) }) : null,
        btn(t('download'), { size: 'sm', icon: 'download', onclick: () => download(f) }),
        can(f, 'delete') && where !== 'trash' ? btn(t('to_trash'), { size: 'sm', icon: 'trash-2', variant: 'danger', appearance: 'outline', onclick: () => { d.hide(); trash([f.id]); } }) : null, moreB);
      if (k.k === 'image') {
        // a skeleton until the picture has arrived (as in SavPhotos)
        const spin = h('sav-skeleton.pvload', { shape: 'rect', 'aria-hidden': 'true' });
        const im = h('img.pvimg', { src, alt: f.name, onload: () => spin.remove(), onerror: () => spin.remove() });
        put(stage, im, spin);
        if (im.complete) spin.remove();
      }
      else if (k.k === 'pdf') put(stage, h('iframe.pvpdf', { src, title: f.name }));
      else if (k.k === 'video') put(stage, h('sav-video.pvvid', { src, label: f.name }));
      else if (k.k === 'audio') put(stage, h('div.pvaud', icon('music'), h('sav-audio', { src, label: f.name })));
      else if (k.k === 'text' || OFFICE_PREVIEW.includes(ext(f.name)) || isArchive(f.name)) {
        // the first part of a text or JSON file; a document, spreadsheet or presentation of SavOffice drawn as it begins;
        // what is inside an archive (its index, read by the server without extracting)
        put(stage, h('sav-spinner'));
        try { const v = await contentView(f, true); put(stage, v || h('div.pvnone', appIcon(app, 72), h('b', f.name), h('p.muted', t('pv_app', { app: NAMES[app] })))); if (v && app) stage.append(h('p.pvnote.muted', t('pv_office', { app: NAMES[app] }))); } catch { put(stage, empty(k.ic, f.name, t('err_network'))); }
      } else if ((f.mime || '').startsWith('image/')) {
        // a picture the browser cannot show (HEIC…): the small picture of the server, if it could make one
        put(stage, h('img.pvimg', { src: thumbUrl(f.id, f.updated), alt: f.name, onerror: () => put(stage, h('div.pvnone', h('span.tic.big', { style: `--fc:${k.c}` }, icon(k.ic)), h('b', f.name), h('p.muted', t('pv_none')))) }));
      } else put(stage, h('div.pvnone', app ? appIcon(app, 72) : h('span.tic.big', { style: `--fc:${k.c}` }, icon(k.ic)), h('b', f.name), h('p.muted', app ? t('pv_app', { app: NAMES[app] }) : t('pv_none'))));
    };
    const nav = (dir) => { if (files.length < 2) return; i = (i + dir + files.length) % files.length; show(); };
    const prev = iconBtn('chevron-left', t('previous'), () => nav(-1), { class: 'pvnav l' }), next = iconBtn('chevron-right', t('next'), () => nav(1), { class: 'pvnav r' });
    const d = dialog({ title: x.name, width: '72rem', cls: 'pv', body: [h('div.pvwrap', files.length > 1 ? prev : null, stage, files.length > 1 ? next : null), info] });
    d.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') nav(-1); else if (e.key === 'ArrowRight') nav(1); });
    // the right button on the preview: what can be done with this file
    d.addEventListener('contextmenu', (e) => {
      if (!stage.contains(e.target) && !info.contains(e.target)) return;
      e.preventDefault();
      const f = files[i] || x, app = f.app || appOf(f.name);
      menuAt(e.clientX, e.clientY, [app && where !== 'trash' ? ['external', t('open_in', { app: NAMES[app] }), () => openInApp(f)] : null, ['download', t('download'), () => download(f)],
        files.length > 1 ? '-' : null, files.length > 1 ? ['chevron-left', t('previous'), () => nav(-1)] : null, files.length > 1 ? ['chevron-right', t('next'), () => nav(1)] : null, '-', ['x', t('close'), () => d.hide()]], { label: f.name });
    });
    show();
  }

  await load(q);
  return () => { alive = false; afterUpload = null; spaceBox = null; removeEventListener('keydown', onKey); page.removeEventListener('contextmenu', onMenu); document.querySelector('.ctxm')?.remove(); };
}
