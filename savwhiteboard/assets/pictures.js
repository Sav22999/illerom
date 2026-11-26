/**
 * Pictures, as in SavPresentations (savpresentations/assets/media.js, without the videos): the search of free portals
 * (through the server), the pictures of the account, and sending one from the device (15 MB at most, shrunk here first
 * when it is big, re-encoded by the server). A picture is {id, src: "m:<id>", w, h, name, credit}.
 */
import { btn, dialog, empty, errText, fail, h, icon, iconBtn, tile, confirm } from './ui.js';
import { t } from './i18n.js';
import { S, api } from './store.js';
import { mediaUrl } from './model.js';

export const MAX_PICTURE = 15 * 1048576;
const bad = (code) => Object.assign(new Error(code), { code });
const fmt = (n) => (n >= 1048576 ? (n / 1048576).toFixed(n >= 10485760 ? 0 : 1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** Sends a picture (shrunk in the browser first, so big photos travel fast). */
export async function uploadPicture(file) {
  if (file.size > MAX_PICTURE) throw bad('image_big');
  let blob = file;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || (file.type !== 'image/gif' && file.size > 900000)) {
    try {
      const bmp = await createImageBitmap(file), k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * k));
      c.height = Math.max(1, Math.round(bmp.height * k));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      blob = await new Promise((r) => c.toBlob(r, /png|svg|webp/.test(file.type) ? 'image/png' : 'image/jpeg', .88));
    } catch { throw bad('image_type'); }
  }
  if (!blob || blob.size > MAX_PICTURE) throw bad('image_big');
  let res;
  try { res = await fetch('api/?' + new URLSearchParams({ r: 'media.upload', name: file.name || '' }), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': blob.type || 'application/octet-stream', 'X-CSRF-Token': S.csrf }, body: blob }); } catch { throw bad('network'); }
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.ok) throw bad(d.error || (res.status === 413 ? 'image_big' : 'server'));
  return d.media;
}

const storeKey = 'savwhiteboard-sources';

/** The search: several portals at once, each one shows its results as soon as they arrive. onpick(picture + credit) */
export function searchPanel(onpick) {
  const all = S.config.sources?.image || ['openverse', 'wikimedia'];
  let chosen = all;
  try { const v = JSON.parse(localStorage.getItem(storeKey) || 'null'); if (Array.isArray(v) && v.some((x) => all.includes(x))) chosen = v.filter((x) => all.includes(x)); } catch { /* the usual ones */ }
  let page = {}, run = 0, last = '';
  const q = h('sav-input', { type: 'search', placeholder: t('search_images'), clearable: true, enterkeyhint: 'search', autofocus: true }, icon('search', { slot: 'prefix' }));
  const free = h('sav-switch', { checked: true, size: 'sm', onchange: () => start() }, t('only_free'));
  const src = h('sav-chip-group', { multiple: true, required: true, label: t('source_site'), onchange: (e) => { const v = e.detail?.value ?? src.value; chosen = Array.isArray(v) ? v : String(v).split(',').filter(Boolean); try { localStorage.setItem(storeKey, JSON.stringify(chosen)); } catch { /* private mode */ } start(); } }, ...all.map((s) => h('sav-chip', { value: s, size: 'sm', selected: chosen.includes(s) }, t('src_' + s))));
  // the source can be written on the board; pictures that ask for it always have it
  let citeOn = false;
  try { citeOn = localStorage.getItem('savwhiteboard-cite') === '1'; } catch { /* private mode */ }
  const cite = h('sav-switch', { checked: citeOn || null, size: 'sm', help: t('cite_search_t'), onchange: () => { try { localStorage.setItem('savwhiteboard-cite', cite.checked ? '1' : ''); } catch { /* private mode */ } } }, t('cite_search'));
  const grid = h('div.mgrid'), more = h('div.center'), notes = h('div'), hint = h('p.muted.mhint', t('search_hint'));
  function start() {
    const text = q.value.trim();
    if (text.length < 2) return;
    run++; page = {}; last = text; hint.hidden = true;
    grid.replaceChildren(); notes.replaceChildren();
    load(chosen);
  }
  async function load(sources) {
    const mine = run, next = [];
    if (!sources.length) return more.replaceChildren();
    more.replaceChildren(h('sav-spinner'));
    await Promise.all(sources.map(async (s) => {
      page[s] = (page[s] || 0) + 1;
      try {
        const r = await api('search', undefined, { source: s, q: last, page: page[s], free: free.checked ? 1 : '' });
        if (mine !== run) return;
        r.items.forEach((i) => grid.append(cell(r.key, i, s)));
        if (r.items.length >= 8) next.push(s);
      } catch (e) { if (mine === run) notes.append(h('p.muted.small', t('src_' + s) + ': ' + errText(e))); }
    }));
    if (mine !== run) return;
    more.replaceChildren(next.length ? btn(t('more_results'), { size: 'sm', onclick: () => load(next) }) : !grid.children.length && !notes.children.length ? h('p.muted', t('nothing_found')) : '');
  }
  function cell(k, i, s) {
    const im = h('img', { src: 'api/?' + new URLSearchParams({ r: 'search.thumb', k, n: i.n }), alt: i.title, loading: 'lazy', draggable: 'false' });
    im.addEventListener('error', () => c.remove());
    const c = tile(i.title || t('tool_image'), async () => {
      if (c.classList.contains('busy')) return;
      c.classList.add('busy');
      try { const r = await api('media.import', { k, n: i.n }); onpick({ ...r.media, credit: r.credit, page: r.page, cite: cite.checked || r.needsCredit }); } catch (e) { fail(e); }
      c.classList.remove('busy');
    }, { class: 'mcell', title: `${i.title}${i.author ? ' — ' + i.author : ''} (${i.license})`, style: i.w && i.h ? `--ar:${Math.max(.6, Math.min(2.2, i.w / i.h))}` : '' }, im, h('span.mlic', `${i.license} · ${t('src_' + s)}`));
    return c;
  }
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') start(); });
  let deb;
  q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if (q.value.trim().length > 2 && q.value.trim() !== last) start(); }, 600); });
  return h('div.mpanel', q, src, h('div.prow.wrap', free, cite), hint, grid, notes, more);
}

/** The pictures of the account, with room for more (dropped or chosen) and the space used. */
export function libraryPanel(onpick) {
  const grid = h('div.mgrid'), info = h('small.muted');
  const draw = async () => {
    try {
      const r = await api('media.list');
      info.textContent = t('space_used', { a: fmt(r.used), b: fmt(r.quota) });
      grid.replaceChildren(...r.media.map((m) => tile(m.name || t('tool_image'), (e) => { if (!e.composedPath().some((x) => x.localName === 'sav-tooltip')) onpick(m); }, { class: 'mcell own', style: `--ar:${Math.max(.6, Math.min(2.2, m.w / m.h))}` },
        h('img', { src: mediaUrl(m.src), alt: m.name, loading: 'lazy', draggable: 'false' }),
        iconBtn('trash', t('delete'), async () => { if (await confirm(t('delete_picture'), t('delete_picture_t'), t('delete'))) { try { await api('media.delete', { id: m.id }); draw(); } catch (e) { fail(e); } } }, { size: 'sm', place: 'left' }))));
      if (!grid.children.length) grid.replaceChildren(empty('image', t('no_pictures'), ''));
    } catch (e) { fail(e); }
  };
  draw();
  const dz = h('sav-dropzone', { accept: 'image/*', multiple: true, 'max-size': MAX_PICTURE, label: t('drop_pictures'), help: t('max_picture') });
  dz.addEventListener('change', async (e) => {
    const files = [...(e.detail?.files || dz.files || [])];
    let lastPic = null;
    for (const f of files) { try { lastPic = await uploadPicture(f); } catch (x) { fail(x); } }
    if (files.length === 1 && lastPic) onpick(lastPic); else draw();
  });
  return h('div.mpanel', dz, info, grid);
}

/** Asks for a picture: search, own pictures, or one from the device. Resolves with it, or null. */
export function pickPicture() {
  return new Promise((resolve) => {
    let res = null, dlg = null;
    const pick = (m) => { res = m; dlg?.hide(); };
    const body = h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('search_web'), icon: 'search' }, searchPanel(pick)), h('sav-tab', { label: t('my_pictures'), icon: 'image' }, libraryPanel(pick)));
    dlg = dialog({ title: t('choose_picture'), width: '46rem', cls: 'picdlg', body, onclose: () => resolve(res),
      actions: [{ label: t('from_computer'), icon: 'upload', run: () => new Promise((ok) => {
        const f = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,image/avif,image/bmp' });
        f.addEventListener('change', async () => { if (!f.files[0]) return ok(false); try { res = await uploadPicture(f.files[0]); ok(); } catch (e) { fail(e); ok(false); } });
        f.addEventListener('cancel', () => ok(false));
        f.click();
      }) }] });
  });
}
