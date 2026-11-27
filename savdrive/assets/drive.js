/**
 * The drive: a side menu (New, My drive, Recent, Starred, Shared, Trash, the space used), the folder with its path, files
 * and folders as cards or rows, selection, menus, moving, uploads with their progress, previews.
 *   #/  My drive · #/f/<id> a folder · #/recent · #/starred · #/shared · #/trash · #/search/<words>
 */
import { ask, btn, confirm, copyText, dialog, drop, empty, errText, face, fail, h, icon, iconBtn, item, menuAt, mobile, primary, put, segmented, select, toast } from './ui.js';
import { getLang, t, when } from './i18n.js';
import { S, api, fileUrl, upload } from './store.js';
import { brand, commands, credit, go, prefs, setPrefs, userMenu } from './account.js';
import { KINDS, NAMES, appOf, blankFile, openInApp } from './office.js';

// ------------------------------------------------------------------ small helpers

export function bytes(n) {
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0, v = +n || 0;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toLocaleString(getLang(), { maximumFractionDigits: v < 10 && i ? 1 : 0 })} ${u[i]}`;
}
const ext = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || '').toLowerCase();
/** What a file is, for its icon, its colour and how it can be shown. */
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
  if (/^(zip|rar|7z|tar|gz|bz2|xz)$/.test(e)) return { ic: 'file-archive', c: '#7b5434', k: 'file' };
  if (/^(json|js|mjs|ts|html|htm|css|xml|php|py|java|c|cpp|h|rb|go|rs|sh|yml|yaml|sql|kt|swift)$/.test(e)) return { ic: 'file-code', c: '#0b7a87', k: 'text' };
  if (m.startsWith('text/') || /^(txt|md|log|ini|cfg)$/.test(e)) return { ic: 'file-text', c: '#55646f', k: 'text' };
  return { ic: 'file', c: '#55646f', k: 'file' };
}
const appIcon = (app, size = 40) => h('img', { src: `../${app}/icons/favicon.svg`, alt: '', width: size, height: size, class: 'appic' });
const FOLDER_COLORS = ['', '#0a6fb0', '#13a079', '#c45a0c', '#c93a2f', '#86329e', '#c2307a', '#b7791f', '#55646f'];

// ------------------------------------------------------------------ uploads: one at a time, in a panel at the bottom

const queue = [];
let panel = null, running = false, afterUpload = null;
function drawPanel() {
  if (!queue.length) { panel?.remove(); panel = null; return; }
  if (!panel) { panel = h('sav-card.upanel', { appearance: 'elevated' }); document.body.append(panel); }
  const done = queue.filter((q) => q.state === 'done').length, active = queue.some((q) => q.state === 'wait' || q.state === 'run');
  put(panel, h('div.uhead', h('b', active ? t('uploading', { n: queue.length - done }) : t('uploaded', { n: done })), h('span.grow'), active ? null : iconBtn('x', t('close'), () => { queue.length = 0; drawPanel(); })),
    h('div.ulist', queue.map((q) => h('div.urow', { 'data-state': q.state },
      h('span.uic', icon(q.state === 'done' ? 'check-circle' : q.state === 'error' ? 'alert-circle' : kindOf({ name: q.name, mime: q.file?.type || '' }).ic)),
      h('div.uinfo', h('span.uname', { title: q.name }, q.name), q.state === 'error' ? h('small.uerr', q.error) : q.state === 'done' ? h('small', bytes(q.size)) : h('sav-progress-bar', { value: q.sent, max: q.size || 1, 'aria-label': q.name })),
      q.state === 'run' || q.state === 'wait' ? iconBtn('x', t('cancel'), () => { q.abort.abort(); q.state = 'error'; q.error = t('cancelled'); drawPanel(); }) : null))));
}
/** items: [{file, folder, name}] */
function enqueue(items) {
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
      const r = await upload(q.file, q.folder, { name: q.name, signal: q.abort.signal, onProgress: (n) => { q.sent = n; if (Date.now() - last > 150) { last = Date.now(); drawPanel(); } } });
      q.state = 'done';
      if (r.used !== undefined) setSpace(r.used, r.quota, r.parts);
    } catch (e) {
      if (q.state !== 'error') { q.state = 'error'; q.error = e.code === 'quota' ? t('err_quota_file', { free: bytes(Math.max(0, (e.data?.quota || 0) - (e.data?.used || 0))) }) : errText(e); }
    }
    drawPanel();
    afterUpload?.();
  }
  running = false;
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
      if (!(next in ids)) ids[next] = (await api('folder.create', { name: part, parent: ids[cur] || null })).item.id;
      cur = next;
    }
  }
  return ids;
}
async function uploadAll(list, folder) {
  if (!list.length) return;
  try {
    const ids = await makeFolders(list.map((x) => x.path), folder);
    enqueue(list.map((x) => ({ file: x.file, folder: ids[x.path] || null })));
  } catch (e) { fail(e); }
}
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
function setSpace(used, quota, parts) {
  if (S.user) { S.user.used = used; S.user.quota = quota; if (parts) S.user.parts = parts; }
  if (!spaceBox) return;
  const pc = quota ? Math.min(100, (used / quota) * 100) : 0, list = spaceParts(parts || S.user?.parts);
  put(spaceBox, h('div.qhead', icon('hard-drive'), h('b', t('space'))), h('sav-progress-bar', { value: Math.max(pc, used ? 1 : 0), max: 100, variant: pc > 95 ? 'danger' : pc > 85 ? 'warning' : 'primary', 'aria-label': t('space') }),
    h('small', t('space_used', { used: bytes(used), quota: bytes(quota) })), pc > 85 ? h('small.qwarn', t(pc >= 100 ? 'space_full' : 'space_low')) : null,
    list.length > 1 || (list.length === 1 && !Object.keys(parts || S.user?.parts || {}).includes('savdrive')) ? h('ul.qparts', { 'aria-label': t('space_apps') }, list) : null);
}

// ------------------------------------------------------------------ the screen

const VIEWS = { withme: ['users', 'withme'], recent: ['clock', 'recent'], starred: ['star', 'starred'], shared: ['link', 'shared'], trash: ['trash-2', 'trash'] };
/** The levels on something of somebody else (lib/access.php), from the weakest; the owner can do everything. */
export const ROLES = ['view', 'read', 'comment', 'write', 'move', 'delete'];
const LV = { view: 1, read: 2, comment: 3, write: 4, move: 5, delete: 6, owner: 9 };
const can = (x, need) => (LV[x?.role || 'owner'] || 0) >= LV[need];

export async function home(root, a, b) {
  const where = a === 'f' && b ? b : VIEWS[a] ? a : a === 'search' ? 'search' : 'root';
  const q = a === 'search' ? decodeURIComponent(b || '') : '';
  const sel = new Set();
  let data = { items: [], path: [] }, alive = true, dragging = null;

  // --- header
  const search = h('sav-input.hsearch', { type: 'search', placeholder: t('search_drive'), value: q, clearable: true, 'aria-label': t('search_drive') }, icon('search', { slot: 'prefix' }));
  let to;
  search.addEventListener('input', () => { clearTimeout(to); to = setTimeout(() => { const v = search.value.trim(); if (v) history.replaceState(null, '', '#/search/' + encodeURIComponent(v)); else if (where === 'search') history.replaceState(null, '', '#/'); load(v); }, 300); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Escape') { search.value = ''; go('#/'); } });

  // --- side menu
  // the folder new things go into: the open one when this person can write there, otherwise their own My drive
  const here = () => (where === 'root' || where === 'search' || VIEWS[where] ? null : can(data, 'write') ? where : null);
  const writable = () => where === 'root' || (!VIEWS[where] && where !== 'search' && can(data, 'write'));
  const newMenu = () => {
    const trig = primary(t('new'), { icon: 'plus', size: 'lg', block: true, slot: 'trigger', class: 'newb' });
    const d = h('sav-dropdown.newd', { placement: 'bottom-start', 'sheet-on-mobile': true, label: t('new') }, trig,
      item('folder', 'folder-plus', t('new_folder')), item('files', 'upload', t('upload_files')), item('dir', 'folder-up', t('upload_folder')), h('sav-divider'), h('sav-menu-label', 'SavOffice'),
      Object.entries(KINDS).map(([k, x]) => h('sav-menu-item', { value: 'k:' + k }, h('img', { slot: 'prefix', src: `../${x.app}/icons/favicon.svg`, alt: '', width: 20, height: 20, class: 'mimg' }), t(x.k), h('small', { slot: 'suffix', class: 'muted' }, '.' + k))));
    d.addEventListener('sav-select', (e) => {
      const v = String(e.detail.value);
      setTimeout(() => {
        if (v === 'folder') newFolder();
        else if (v === 'files') pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), here()));
        else if (v === 'dir') pick({ dir: true }).then((fs) => uploadAll(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), here()));
        else if (v.startsWith('k:')) newOffice(v.slice(2));
      }, 20);
    });
    return d;
  };
  const nav = h('sav-menu.dnav', { label: t('my_drive'), selectable: true },
    [['root', 'hard-drive', t('my_drive')], ['withme', 'users', t('withme')], ['recent', 'clock', t('recent')], ['starred', 'star', t('starred')], ['shared', 'link', t('shared')], ['trash', 'trash-2', t('trash')]].map(([k, ic, l]) => { const x = item(k, ic, l); x.toggleAttribute('current', where === k || (k === 'root' && (where === 'root' || (!VIEWS[where] && where !== 'search')))); return x; }));
  nav.addEventListener('sav-select', (e) => go(e.detail.value === 'root' ? '#/' : '#/' + e.detail.value));
  spaceBox = h('div.quota');
  setSpace(S.user.used || 0, S.user.quota || 0, S.user.parts);
  // things dragged onto "My drive" move there
  const rootItem = nav.querySelector('sav-menu-item[value="root"]');
  dropTarget(rootItem, () => null);

  // --- main
  const head = h('div.dhead'), body = h('div.dbody'), main = h('main.hmain.dmain', head, body);
  const view = () => prefs().view || (mobile() ? 'list' : 'grid');
  const sortBy = () => prefs().sort || 'name';

  put(root, h('div.home.drive', h('header.htop', brand(), search, h('div.spacer'), userMenu()),
    h('div.hbody', h('nav.hside', newMenu(), nav, spaceBox), main), credit()));
  document.title = 'SavDrive';

  // files dropped from the device anywhere on the main area: into the folder that is open (or the folder card under them)
  main.addEventListener('dragover', (e) => { if (dragging || !e.dataTransfer.types.includes('Files') || where === 'trash' || (!writable() && !VIEWS[where])) return; e.preventDefault(); main.classList.add('dropping'); });
  main.addEventListener('dragleave', (e) => { if (!main.contains(e.relatedTarget)) main.classList.remove('dropping'); });
  main.addEventListener('drop', async (e) => {
    main.classList.remove('dropping');
    if (dragging || !e.dataTransfer.types.includes('Files') || where === 'trash') return;
    e.preventDefault();
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
    const box = h('div.band'), nodes = [...body.querySelectorAll('[data-id]')].map((n) => [n, n.getBoundingClientRect()]);
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
      : [all('move') ? ['folder-input', t('move'), () => moveDialog(ids)] : null, all('owner') ? [allStar ? 'star-off' : 'star', t(allStar ? 'unstar' : 'star'), () => star(ids, !allStar)] : null, all('delete') ? '-' : null, all('delete') ? ['trash-2', t('to_trash'), () => trash(ids), { danger: true }] : null]),
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
    if (VIEWS[where] || data.q) return [all, '-', ...viewSort, '-', refresh];
    if (!writable()) return [all, '-', ...viewSort, '-', refresh];
    return [...upHere(here()), '-', { head: 'SavOffice' }, ...Object.entries(KINDS).map(([k, x]) => ['file-plus', t(x.k), () => newOffice(k)]), '-', all, '-', ...viewSort, '-', refresh];
  };
  const placesMenu = () => [['hard-drive', t('my_drive'), () => go('#/')], ['users', t('withme'), () => go('#/withme')], ['clock', t('recent'), () => go('#/recent')], ['star', t('starred'), () => go('#/starred')], ['link', t('shared'), () => go('#/shared')], ['trash-2', t('trash'), () => go('#/trash')],
    '-', ['settings', t('settings'), () => go('#/settings')], S.user.master ? ['shield', t('admin'), () => go('#/admin')] : null, ['refresh', t('refresh'), () => load(search.value.trim(), true)]];
  const onMenu = (e) => {
    if (editable(e) || e.target.closest('sav-dialog, sav-popover, sav-dropdown, .ctxm')) return;
    e.preventDefault();
    const at = (items, label) => menuAt(e.clientX, e.clientY, items, { label });
    const it = e.target.closest('[data-id]');
    if (it) {
      const x = data.items.find((y) => y.id === it.dataset.id);
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
      return at(items, place.textContent.trim());
    }
    if (e.target.closest('.newd')) return at(upHere(here()).concat(['-', { head: 'SavOffice' }], Object.entries(KINDS).map(([k, x]) => ['file-plus', t(x.k), () => newOffice(k)])), t('new'));
    if (spaceBox && spaceBox.contains(e.target)) return at([['trash-2', t('trash'), () => go('#/trash')], ['settings', t('space'), () => go('#/settings/space')]], t('space'));
    if (main.contains(e.target)) { if (sel.size > 1) return at(selMenu(), t('n_selected', { n: sel.size })); return at(areaMenu(), t('my_drive')); }
    return at(placesMenu(), 'SavDrive');
  };
  const page = root.firstElementChild; // before the menu of the app (app.js, on root), which then sees it handled
  page.addEventListener('contextmenu', onMenu);
  afterUpload = () => { if (alive) load(search.value.trim(), true); };

  // ---------------------------------------------------------------- loading and drawing

  async function load(qq = q, quiet = false) {
    if (!quiet) put(body, h('div.dwait', h('sav-spinner', { style: 'font-size:2rem' })));
    try {
      data = await api('drive.list', undefined, qq ? { q: qq } : { in: where === 'search' ? 'root' : where });
      data.q = qq;
      if (!alive) return;
      setSpace(data.used, data.quota, data.parts);
      // inside somebody else's folder the place is "Shared with me"
      if (!VIEWS[where] && where !== 'search') nav.querySelectorAll('sav-menu-item').forEach((m) => m.toggleAttribute('current', m.getAttribute('value') === (data.sharedRoot ? 'withme' : 'root')));
      for (const id of [...sel]) if (!data.items.some((x) => x.id === id)) sel.delete(id);
      draw();
    } catch (e) {
      if (!alive) return;
      if (e.code === 'not_found' || e.code === 'in_trash') { toast(t('err_folder_gone'), 'neutral'); go('#/'); return; }
      put(body, empty('cloud-off', errText(e), '', btn(t('retry'), { onclick: () => load(qq) })));
    }
  }

  function title() {
    if (data.q) return h('h1', t('results_for', { q: data.q }));
    if (VIEWS[where]) return h('h1', t(VIEWS[where][1]));
    // somebody else's folder starts from "Shared with me"
    const crumbs = [data.sharedRoot ? { id: 'withme', name: t('withme') } : { id: null, name: t('my_drive') }, ...(data.path || [])];
    const bc = h('sav-breadcrumb.crumbs', { label: t('path') }, crumbs.map((c, i) => { const x = h('sav-breadcrumb-item', { href: i === crumbs.length - 1 ? null : c.id === 'withme' ? '#/withme' : c.id ? '#/f/' + c.id : '#/', 'data-crumb': c.id || 'root' }, c.name); if (i < crumbs.length - 1 && c.id !== 'withme' && (!data.sharedRoot || can(data, 'move'))) dropTarget(x, () => c.id); return x; }));
    const lvl = data.sharedRoot && data.role && data.role !== 'owner' ? h('sav-badge.lvl', { variant: 'neutral', appearance: 'soft', pill: true, title: t('lv_' + data.role + '_t') }, icon('users'), t('lv_' + data.role)) : null;
    return h('div.crumbwrap', bc, lvl);
  }

  function draw() {
    const items = sorted(data.items);
    setCommands(items);
    const folders = items.filter((x) => x.kind === 'folder'), files = items.filter((x) => x.kind === 'file');
    // header: the path or the name of the view, or what can be done with the chosen items
    if (sel.size) {
      const chosen = data.items.filter((x) => sel.has(x.id)), allStar = chosen.every((x) => x.starred), oneFile = chosen.length === 1 && chosen[0].kind === 'file';
      put(head, h('div.selbar', iconBtn('x', t('clear_sel'), () => { sel.clear(); draw(); }), h('b', t('n_selected', { n: sel.size })), h('span.grow'),
        where === 'trash' ? [btn(t('restore'), { icon: 'undo-2', size: 'sm', onclick: () => restore([...sel]) }), btn(t('delete_forever'), { icon: 'trash-2', size: 'sm', variant: 'danger', onclick: () => destroy([...sel]) })]
          : [oneFile && can(chosen[0], 'read') ? iconBtn('download', t('download'), () => download(chosen[0])) : null, chosen.every((x) => can(x, 'move')) ? iconBtn('folder-input', t('move'), () => moveDialog([...sel])) : null,
            chosen.every((x) => can(x, 'owner')) ? iconBtn(allStar ? 'star-off' : 'star', t(allStar ? 'unstar' : 'star'), () => star([...sel], !allStar)) : null, chosen.every((x) => can(x, 'delete')) ? iconBtn('trash-2', t('to_trash'), () => trash([...sel])) : null]));
    } else {
      put(head, title(), h('span.grow'),
        where === 'trash' && items.length ? btn(t('empty_trash'), { icon: 'trash-2', size: 'sm', variant: 'danger', appearance: 'soft', onclick: emptyTrash }) : null,
        dropSort(), segmented(t('view'), view(), [['grid', 'grid', t('v_grid')], ['list', 'list', t('v_list')]], (v) => { setPrefs({ view: v }).catch(() => {}); draw(); }));
    }
    if (!items.length) {
      const e = data.q ? empty('search', t('no_results'), t('no_results_t'))
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
      put(body, note, !VIEWS[where] && !data.q && !data.path?.length ? officeRow() : null, h('div.dlist', { role: 'list' }, h('div.lhead', h('span'), h('span', t('name')), h('span.lc-m', t(where === 'trash' ? 'trashed' : 'modified')), h('span.lc-s', t('size')), h('span')), items.map(row)));
    } else {
      put(body, note, !VIEWS[where] && !data.q && !data.path?.length ? officeRow() : null,
        folders.length ? [h('h2.dsec', t('folders')), h('div.dgrid.fgrid', { role: 'list' }, folders.map(card))] : null,
        files.length ? [h('h2.dsec', t('files')), h('div.dgrid', { role: 'list' }, files.map(card))] : null);
    }
  }

  /** What the search of actions (⌘J / Ctrl+J) offers here: new things, the places, the items of this folder or view. */
  function setCommands(items) {
    const upFiles = () => pick().then((fs) => uploadAll(fs.map((file) => ({ file, path: '' })), here()));
    const upDir = () => pick({ dir: true }).then((fs) => uploadAll(fs.map((file) => ({ file, path: (file.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), here()));
    commands(where === 'trash' || !writable() ? null : [t('new'), [['folder-plus', t('new_folder'), () => newFolder()], ['upload', t('upload_files'), upFiles], ['folder-up', t('upload_folder'), upDir],
        ...Object.entries(KINDS).map(([k, x]) => ['file-plus', t('new_kind', { kind: t(x.k) }), () => newOffice(k), null, x.name])]],
      [t('places'), [['hard-drive', t('my_drive'), '#/'], ['users', t('withme'), '#/withme'], ['clock', t('recent'), '#/recent'], ['star', t('starred'), '#/starred'], ['link', t('shared'), '#/shared'], ['trash-2', t('trash'), '#/trash'],
        where === 'trash' && items.length ? ['trash-2', t('empty_trash'), emptyTrash] : null]],
      items.length ? [t('in_here'), items.slice(0, 60).map((x) => [x.kind === 'folder' ? 'folder' : kindOf(x).ic, x.name, () => open(x), null, x.kind === 'folder' ? t('folder_l') : bytes(x.size)])] : null);
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
    if (x.kind === 'folder') return x.count ? `${t('n_items', { n: x.count })} · ${bytes(x.size)}` : t('folder_empty');
    return `${bytes(x.size)} · ${when(x.updated)}`;
  };
  const where2 = (x) => where === 'withme' && x.owner ? h('small.inf', icon('user'), x.owner) : (data.q || ['starred', 'recent', 'shared'].includes(where)) ? h('small.inf', icon('folder'), x.parent?.name || t('my_drive')) : null;
  /** The mark of what is shared: the people of the owner, or the level of this person on something of somebody else. */
  const tag = (x) => x.role && x.role !== 'owner' ? h('span.rtag', { title: t('lv_' + x.role + '_t') + (x.owner ? ' · ' + t('owned_by', { name: x.owner }) : '') }, icon(x.role === 'view' ? 'eye' : 'users'), h('span', t('lv_' + x.role)))
    : x.people ? h('span.ptag', { title: t('shared_n', { n: x.people }) }, icon('users')) : null;
  function thumb(x, big) {
    const k = kindOf(x), app = x.app || appOf(x.name);
    if (x.kind === 'folder') return h('span.fic', { style: `--fc:${k.c}` }, icon('folder'));
    if (app) return h('span.tic.app', appIcon(app, big ? 56 : 30));
    if (big && k.k === 'image' && x.size < 25e6) return h('span.tic.img', h('img', { src: fileUrl(x.id, true), alt: '', loading: 'lazy', decoding: 'async', onerror: (e) => e.target.replaceWith(icon(k.ic)) }));
    return h('span.tic', { style: `--fc:${k.c}` }, icon(k.ic), big && ext(x.name) ? h('em', ext(x.name).slice(0, 5)) : null);
  }
  function check(x) {
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
      if (e.ctrlKey || e.metaKey || e.shiftKey || sel.size) { if (e.shiftKey && sel.size) rangeTo(x); else if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); return; }
      open(x);
    });
    n.addEventListener('keydown', (e) => { if (e.target !== n) return; if (e.key === 'Enter') open(x); else if (e.key === ' ') { e.preventDefault(); if (sel.has(x.id)) sel.delete(x.id); else sel.add(x.id); draw(); } });
    // dragged onto a folder (a card, the path, My drive): moved there
    if (where !== 'trash' && !mobile() && can(x, 'move')) {
      n.draggable = true;
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
  const card = (x) => wire(h('div.dcard' + (x.kind === 'folder' ? '.isf' : ''), check(x), x.kind === 'folder'
    ? [thumb(x), h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x)), where2(x), tag(x)), starBtn(x), more(x)]
    : [h('div.dthumb', thumb(x, true), x.shared ? h('span.cglobe', { title: t('has_link') }, icon('link')) : null), h('div.dinfo', h('div.dname', h('b', { title: x.name }, x.name), h('small', meta(x)), where2(x), tag(x)), starBtn(x), more(x))]), x);
  const row = (x) => wire(h('div.drow', check(x), h('div.rname', thumb(x), h('div', h('b', { title: x.name }, x.name), where2(x) || h('small.rmeta', meta(x))), x.shared ? h('span.lnk', { title: t('has_link') }, icon('link')) : null, tag(x)),
    h('span.lc-m', when(where === 'trash' ? x.trashed : x.updated)), h('span.lc-s', x.kind === 'folder' ? (x.count ? bytes(x.size) : '—') : bytes(x.size)), h('span.ract', starBtn(x), more(x))), x);

  function menuOf(x) {
    const app = x.app || appOf(x.name), k = kindOf(x);
    if (where === 'trash') return [['undo-2', t('restore'), () => restore([x.id])], '-', ['trash-2', t('delete_forever'), () => destroy([x.id]), { danger: true }]];
    // only what the level of this person allows (the owner can do everything)
    if (!can(x, 'read')) return [{ head: t('lv_view_t') }, x.owner ? ['user', t('owned_by', { name: x.owner }), null, { disabled: true }] : null];
    const owner = can(x, 'owner');
    return [
      x.kind === 'folder' ? ['folder-open', t('open'), () => go('#/f/' + x.id)] : app ? ['external', t('open_in', { app: NAMES[app] }), () => openInApp(x)] : ['eye', t('preview'), () => preview(x)],
      x.kind === 'file' && app ? ['eye', t('details'), () => preview(x)] : null,
      x.kind === 'file' ? ['download', t('download'), () => download(x)] : null,
      ['message-circle', t('comments'), () => commentsDialog(x)],
      owner ? ['users', t('people'), () => peopleDialog(x)] : null,
      '-',
      can(x, 'write') ? ['edit', t('rename'), () => rename(x)] : null,
      can(x, 'move') ? ['folder-input', t('move'), () => moveDialog([x.id])] : null,
      x.kind === 'file' && can(x, 'write') ? ['copy', t('make_copy'), () => copy(x)] : null,
      owner ? [x.starred ? 'star-off' : 'star', t(x.starred ? 'unstar' : 'star'), () => star([x.id], !x.starred)] : null,
      x.kind === 'file' && owner ? ['link', t('share_link'), () => shareDialog(x)] : null,
      x.kind === 'folder' && can(x, 'write') ? ['palette', t('color'), () => colorDialog(x)] : null,
      x.parent && (data.q || (VIEWS[where] && where !== 'withme')) ? ['folder', t('show_in_folder'), () => go(x.parent.id ? '#/f/' + x.parent.id : '#/')] : null,
      can(x, 'delete') ? '-' : null,
      can(x, 'delete') ? ['trash-2', t('to_trash'), () => trash([x.id]), { danger: true }] : null,
    ];
  }

  // ---------------------------------------------------------------- actions

  function open(x) {
    if (where === 'trash') return preview(x);
    if (!can(x, 'read')) return toast(t('lv_view_t'), 'neutral');
    if (x.kind === 'folder') return go('#/f/' + x.id);
    if (!openInApp(x)) preview(x);
    x.opened = new Date().toISOString();
  }
  const download = (x) => { const a = h('a', { href: fileUrl(x.id), download: x.name }); document.body.append(a); a.click(); a.remove(); };
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
      const r = await upload(await blankFile(k, name), here());
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
      await api('node.trash', { ids });
      sel.clear();
      const tt = toast(t('trashed_n', { n: ids.length }), 'neutral', { duration: 6000 });
      const undo = h('sav-button.undo', { size: 'sm', appearance: 'outline', variant: 'neutral' }, t('undo'));
      undo.addEventListener('click', async () => { tt.remove?.(); await api('node.restore', { ids }).catch(fail); load(search.value.trim(), true); });
      tt.append?.(undo);
      load(search.value.trim(), true);
    } catch (e) { fail(e); }
  }
  async function restore(ids) {
    try { const r = await api('node.restore', { ids }); setSpace(r.used, r.quota, r.parts); sel.clear(); toast(t('restored', { n: ids.length }), 'success'); load('', true); } catch (e) { fail(e); }
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
    const roleSel = (value, onpick, inherited, from) => select(null, opts(from, inherited), value, onpick, { size: 'sm', class: 'lvsel', 'aria-label': t('level') });
    const set = async (email, role, notify = false) => { try { const r = await api('people.set', { id: x.id, email, role, notify }); drawPeople(r.people); load(search.value.trim(), true); } catch (e) { fail(e); } };
    const email = h('sav-input', { type: 'email', placeholder: t('people_email'), 'aria-label': t('people_email'), class: 'grow' });
    let newRole = 'read';
    const addRole = roleSel('read', (v) => { newRole = v || 'read'; }, false);
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
      put(info, h('small.muted', `${bytes(f.size)} · ${t('modified')} ${when(f.updated)}`), h('span.grow'),
        app && where !== 'trash' ? primary(t('open_in', { app: NAMES[app] }), { size: 'sm', icon: 'external', onclick: () => openInApp(f) }) : null,
        btn(t('download'), { size: 'sm', icon: 'download', onclick: () => download(f) }));
      if (k.k === 'image') put(stage, h('img.pvimg', { src, alt: f.name }));
      else if (k.k === 'pdf') put(stage, h('iframe.pvpdf', { src, title: f.name }));
      else if (k.k === 'video') put(stage, h('sav-video.pvvid', { src, label: f.name }));
      else if (k.k === 'audio') put(stage, h('div.pvaud', icon('music'), h('sav-audio', { src, label: f.name })));
      else if (k.k === 'text' && f.size < 2e6) {
        put(stage, h('sav-spinner'));
        try { const r = await fetch(src, { cache: 'no-store' }); put(stage, h('pre.pvtext', await r.text())); } catch { put(stage, empty(k.ic, f.name, t('err_network'))); }
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
