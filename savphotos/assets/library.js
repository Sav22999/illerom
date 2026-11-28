/**
 * The photos: all of them, the favourites, the videos, a search, an album, or the photos to add to an album (pick). By
 * day, newest first, a page at a time; jumping to a month; choosing many and acting on them; the viewer; files dropped
 * on the page are uploaded. The header is the one of a folder of SavDrive: the title, then the tools; what is chosen
 * takes its place.
 */
import { btn, bytes, confirm, drop, dropBtn, empty, fail, h, iconBtn, mobile, primary, put, segmented, toast } from './ui.js';
import { getLang, t } from './i18n.js';
import { LIVE_WAIT, S, api, liveBatch, thumbFor } from './store.js';
import { commands, frame, go, prefs, setPrefs } from './account.js';
import { makeGrid, monthLabel } from './grid.js';
import { openViewer } from './viewer.js';
import { addToAlbum, albumMenu, shareAlbum } from './albums.js';

const TITLES = { all: 'photos', fav: 'favorites', video: 'videos' };
const PLACE = { all: 'photos', fav: 'favorites', video: 'videos', album: 'albums', pick: 'albums', search: '' };

export async function library(root, mode, arg) {
  let album = null, q = mode === 'search' ? decodeURIComponent(arg || '') : '';
  if (mode === 'album' || mode === 'pick') {
    album = (await api('photos.albums')).albums.find((a) => a.id === arg);
    if (!album) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }
  // the order and the filter chosen (kept with the preferences): newest, oldest, by name, the largest; all, photos, videos, favourites
  let sort = ['old', 'name', 'size'].includes(prefs().sort) ? prefs().sort : 'new', kind = ['photo', 'video'].includes(prefs().kind) ? prefs().kind : 'all', onlyFav = !!prefs().onlyFav;
  const base = () => (mode === 'fav' ? { fav: 1 } : mode === 'video' ? { video: 1 } : mode === 'album' ? { album: arg } : q ? { q } : {});
  const query = () => ({ ...base(), ...(sort !== 'new' ? { sort } : {}), ...(kind !== 'all' && mode !== 'video' ? { kind } : {}), ...(onlyFav && mode !== 'fav' ? { fav: 1 } : {}) });
  const sel = new Set();
  let size = prefs().size || 'm', next = null, before = '', summary = null, gone = false, scanning = false;

  const head = h('div.dhead'), note = h('div.lnote');
  const main = h('main.hmain.dmain', head, note);
  frame(root, PLACE[mode] ?? '', main, { cls: 'photos' + (mode === 'pick' ? '.picking' : ''), q, onSearch: mode === 'pick' || mode === 'album' ? null : (v) => { q = v; mode = v ? 'search' : 'all'; before = ''; reload(); } });
  const grid = makeGrid({ thumb: (x) => thumbFor(x), sel, pick: mode === 'pick', size, onOpen: (i) => view(i), onSelect: () => drawHead() });
  grid.setByDay(sort === 'new' || sort === 'old');
  const feed = h('sav-infinite-scroll', { 'end-label': t('all_shown'), 'loading-label': t('loading'), 'error-label': t('err_load'), 'retry-label': t('retry'), threshold: 900 }, grid.el);
  main.append(feed);
  grid.skeleton(); // the shape of the photos while the first page is on its way
  grid.band(main); // press and drag to choose many, as in SavDrive

  // ---------------------------------------------------------------- loading
  feed.addEventListener('sav-load', async () => {
    const first = !next;
    try {
      const r = await api('photos.list', undefined, { ...query(), cursor: next || '', before: first ? before : '' });
      if (gone) return;
      if (first) grid.reset();
      grid.append(r.items);
      next = r.next;
      if (first) { drawEmpty(); drawHead(); if (r.left > 0) scan(r.left); }
      feed.done(!!next);
    } catch (e) { if (!gone) { feed.fail(); if (e.code !== 'network') fail(e); } }
  });
  function reload() { next = null; sel.clear(); grid.reset(); grid.skeleton(); feed.reset(); feed.load(); drawHead(); loadSummary(); }
  // the first page at once (the end of the list is watched afterwards for the next ones)
  setTimeout(() => { if (!gone && !next && !grid.items.length) feed.load(); }, 0);

  /** Photos never read yet (just arrived from SavDrive): read a few at a time, then the list again. */
  async function scan(left) {
    if (scanning) return;
    scanning = true;
    const say = (n) => put(note, h('sav-alert', { variant: 'neutral' }, h('sav-spinner', { slot: 'icon' }), t('scanning', { n })));
    say(left);
    try {
      while (left > 0 && !gone) { left = (await api('photos.scan', {})).left; say(left); }
      if (!gone) { put(note); reload(); }
    } catch { put(note); } finally { scanning = false; }
  }

  async function loadSummary() {
    try { summary = await api('photos.summary', undefined, query()); } catch { summary = null; }
    if (!gone) drawHead();
  }

  function drawEmpty() {
    if (grid.items.length) return;
    const up = async () => { const { chooseFiles } = await import('./upload.js'); chooseFiles(); };
    const e = mode === 'search' ? empty('search', t('no_results'), t('no_results_t'))
      : mode === 'fav' ? empty('star', t('no_favs'), t('no_favs_t'))
        : mode === 'video' ? empty('film', t('no_videos'), t('no_videos_t'))
          : mode === 'album' ? empty('album', t('album_empty'), t('album_empty_t'), primary(t('add_photos'), { icon: 'image-plus', href: '#/pick/' + album.id }))
            : before ? empty('calendar', t('no_before'), '', btn(t('back_today'), { onclick: () => { before = ''; reload(); } }))
              : empty('images', t('no_photos'), t('no_photos_t'), h('div.prow.wrap.cen', primary(t('upload'), { icon: 'upload', onclick: up }), btn(t('open_drive'), { icon: 'hard-drive', href: '../savdrive/' })));
    put(grid.el, h('div.dempty', e));
  }

  // ---------------------------------------------------------------- the header: the title and the tools, or what is chosen
  const title = () => (album ? album.name : mode === 'search' ? t('results_for', { q }) : t(TITLES[mode] || 'photos'));
  const chosen = () => grid.items.filter((x) => sel.has(x.id));
  function drawHead() {
    document.title = title() + ' – SavPhotos';
    if (mode === 'pick') {
      put(head, h('div.selbar.pickbar', iconBtn('x', t('cancel'), () => go('#/album/' + album.id)), h('div.grow', h('b', t('pick_title', { name: album.name })), h('small.muted', sel.size ? t('n_chosen', { n: sel.size }) : t('pick_hint'))),
        primary(t('add_n', { n: sel.size }), { icon: 'plus', size: 'sm', disabled: !sel.size || null, onclick: async () => {
          const r = await api('photos.album.add', { id: album.id, ids: [...sel] });
          toast(t('added_n', { n: r.added, name: album.name }), 'success');
          go('#/album/' + album.id);
        } })));
      return;
    }
    if (sel.size) {
      const list = chosen(), allFav = list.length && list.every((x) => x.star);
      put(head, h('div.selbar', iconBtn('x', t('clear_sel'), () => { sel.clear(); grid.redraw(); drawHead(); }), h('b', t('n_chosen', { n: sel.size })), h('span.grow'),
        iconBtn('album', t('add_to_album'), () => addToAlbum([...sel], () => { sel.clear(); grid.redraw(); drawHead(); })),
        iconBtn(allFav ? 'star-off' : 'star', allFav ? t('unfav') : t('fav'), () => star(list, !allFav)),
        list.length === 1 ? iconBtn('download', t('download'), () => download(list[0])) : null,
        mode === 'album' && list.length === 1 ? iconBtn('image', t('set_cover'), () => setCover(list[0])) : null,
        mode === 'album' ? iconBtn('minus-circle', t('remove_from_album'), () => removeFromAlbum(list)) : null,
        iconBtn('trash-2', t('delete'), () => trash(list))));
      return;
    }
    const count = summary?.count ? t(summary.count === 1 ? 'n_items_1' : 'n_items', { n: summary.count.toLocaleString(getLang()) }) + (summary.videos && mode !== 'video' ? ' · ' + t('n_videos', { n: summary.videos }) : '') + ' · ' + bytes(summary.bytes) : '';
    const months = summary?.months || [];
    const jump = months.length > 1 && sort === 'new' ? drop(h('sav-button', { icon: 'calendar-search', label: before ? null : t('jump'), title: t('jump'), caret: true, appearance: before ? 'soft' : 'ghost', variant: before ? 'primary' : 'neutral', size: 'sm' }, before ? h('span.lbl', monthLabel(before)) : null), () => {
      const out = [before ? ['arrow-up', t('back_today'), () => { before = ''; reload(); }] : null, before ? '-' : null];
      let year = '';
      for (const m of months.slice(0, 240)) {
        const y = m.ym.slice(0, 4);
        if (y !== year) { out.push({ head: y }); year = y; }
        out.push(['calendar', `${monthLabel(m.ym)} · ${m.n.toLocaleString(getLang())}`, () => { before = m.ym; reload(); }]);
      }
      return out;
    }, { placement: 'bottom-end', label: t('jump') }) : null;
    // the title as in SavDrive: a place (a heading), or the path of an album
    const heading = album ? h('div.crumbwrap', h('sav-breadcrumb.crumbs', { label: t('albums') }, h('sav-breadcrumb-item', { href: '#/albums' }, t('albums')), h('sav-breadcrumb-item', {}, album.name)))
      : h('h1', title());
    put(head, heading, count ? h('small.dcount', count) : null, h('span.grow'),
      mode === 'album' ? [btn(h('span.lbl', t('add_photos')), { icon: 'image-plus', size: 'sm', label: t('add_photos'), href: '#/pick/' + album.id }),
        iconBtn('link', album.shared ? t('shared') : t('share'), () => shareAlbum(album, (a) => { album = a; drawHead(); }), album.shared ? { variant: 'primary', appearance: 'soft' } : {}),
        dropBtn('more-vertical', t('more'), () => albumMenu(album, (a) => { if (a) { album = a; drawHead(); } else go('#/albums'); }), { caret: false, placement: 'bottom-end' })] : null,
      mobile() && grid.items.length ? iconBtn('square-check', t('select'), () => { grid.choose(true); toast(t('select_hint'), 'neutral'); }) : null,
      jump, mode === 'pick' ? null : sortMenu(), mode === 'pick' ? null : filterMenu(),
      segmented(t('grid_size'), size, [['s', 'grid-3x3', t('size_s')], ['m', 'layout-grid', t('size_m')], ['l', 'grid-2x2', t('size_l')]], (v) => { size = v; grid.setSize(v); setPrefs({ size: v }).catch(() => {}); }, { class: 'sizes' }));
  }

  /** The order of the photos: a menu with a tick on the one in use. */
  function sortMenu() {
    const set = (v) => { sort = v; setPrefs({ sort: v }).catch(() => {}); before = ''; grid.setByDay(v === 'new' || v === 'old'); reload(); };
    return dropBtn('arrow-down-wide-narrow', t('sort_by'), () => [{ head: t('sort_by') }, ...[['new', 'clock-arrow-down'], ['old', 'clock-arrow-up'], ['name', 'arrow-down-a-z'], ['size', 'hard-drive']].map(([k, ic]) => [ic, t('sort_' + k), () => set(k), { check: sort === k }])],
      { placement: 'bottom-end', caret: false });
  }
  /** Which photos: all, photos only, videos only, and the favourites only; the button is marked when something is left out. */
  function filterMenu() {
    const on = (kind !== 'all' && mode !== 'video') || (onlyFav && mode !== 'fav');
    const setKind = (v) => { kind = v; setPrefs({ kind: v }).catch(() => {}); reload(); };
    const d = dropBtn('funnel', t('filter'), () => [{ head: t('filter') }, ...(mode === 'video' ? [] : [['images', t('kind_all'), () => setKind('all'), { check: kind === 'all' }], ['image', t('kind_photo'), () => setKind('photo'), { check: kind === 'photo' }], ['film', t('kind_video'), () => setKind('video'), { check: kind === 'video' }]]),
      ...(mode === 'fav' ? [] : ['-', ['star', t('only_fav'), () => { onlyFav = !onlyFav; setPrefs({ onlyFav }).catch(() => {}); reload(); }, { check: onlyFav }]])], { placement: 'bottom-end', caret: false });
    if (on) { const b = d.querySelector('sav-button'); b.variant = 'primary'; b.appearance = 'soft'; }
    return d;
  }

  // ---------------------------------------------------------------- actions (also used by the viewer)
  async function star(list, on) {
    await api('node.star', { ids: list.map((x) => x.id), on });
    for (const x of list) { x.star = on || undefined; grid.update(x); }
    if (mode === 'fav' && !on) grid.remove(list.map((x) => x.id));
    toast(on ? t('faved_n', { n: list.length }) : t('unfaved_n', { n: list.length }), 'success');
    drawHead();
    if (mode === 'fav') loadSummary();
  }
  function download(x) { const a = h('a', { href: `../savdrive/api/?r=file.get&id=${encodeURIComponent(x.id)}`, download: x.name }); document.body.append(a); a.click(); a.remove(); }
  async function trash(list) {
    if (!(await confirm(t('delete_q', { n: list.length }), t('delete_t'), t('delete')))) return false;
    await api('node.trash', { ids: list.map((x) => x.id) });
    grid.remove(list.map((x) => x.id));
    toast(t('deleted_n', { n: list.length }), 'success');
    drawEmpty(); loadSummary(); refreshSpace();
    return true;
  }
  async function removeFromAlbum(list) {
    const r = await api('photos.album.remove', { id: album.id, ids: list.map((x) => x.id) });
    album = r.album;
    grid.remove(list.map((x) => x.id));
    toast(t('removed_n', { n: list.length }), 'success');
    drawEmpty(); loadSummary();
  }
  async function setCover(x) { album = (await api('photos.album.cover', { id: album.id, item: x.id })).album; toast(t('cover_set'), 'success'); }
  // ---------------------------------------------------------------- the viewer
  function view(i) {
    openViewer({
      items: grid.items, index: i,
      more: async () => {
        if (!next) return false;
        const r = await api('photos.list', undefined, { ...query(), cursor: next });
        grid.append(r.items); next = r.next;
        return r.items.length > 0;
      },
      actions: {
        star: async (x, on) => { await api('node.star', { ids: [x.id], on }); x.star = on || undefined; grid.update(x); },
        trash: (x) => trash([x]),
        album: (x) => addToAlbum([x.id]),
        remove: mode === 'album' ? async (x) => { await removeFromAlbum([x]); return true; } : null,
        cover: mode === 'album' ? (x) => setCover(x) : null,
      },
    });
  }

  // ---------------------------------------------------------------- files dropped on the page are uploaded (as in SavDrive)
  const hbody = root.querySelector('.hbody');
  const over = (e) => { if (mode === 'pick' || ![...(e.dataTransfer?.types || [])].includes('Files')) return; e.preventDefault(); main.classList.add('dropping'); };
  const out = (e) => { if (!hbody.contains(e.relatedTarget)) main.classList.remove('dropping'); };
  const dropped = async (e) => {
    main.classList.remove('dropping');
    if (mode === 'pick' || !e.dataTransfer?.files?.length) return;
    e.preventDefault();
    // what was dropped is read at once (the browser empties it after the event); folders dropped become albums with
    // their names (as with New › A folder); on an album, everything goes into it
    const snap = { entries: [...(e.dataTransfer.items || [])].map((x) => x.webkitGetAsEntry?.()).filter(Boolean), files: [...e.dataTransfer.files] };
    const { fromDrop, startUpload } = await import('./upload.js');
    startUpload(await fromDrop(snap), album);
  };
  hbody.addEventListener('dragover', over);
  hbody.addEventListener('dragleave', out);
  hbody.addEventListener('drop', dropped);
  // photos just uploaded appear at once, in their place by date (a few at a time, so a long backup does not redraw for
  // each one); at the end of the upload only the counts are read again
  let fresh = [], freshTimer = 0;
  const fits = (p, a) => (mode === 'all' || (mode === 'video' && p.video) || (mode === 'album' && a === album?.id) || (mode === 'search' && p.name.toLowerCase().includes(q.toLowerCase()))) && !before;
  const arrived = (e) => {
    const { photo: p, album: a } = e.detail || {};
    if (!p || !fits(p, a) || grid.items.some((x) => x.id === p.id)) return;
    fresh.push(p);
    // one by one for a few files, in groups for many (store.js liveBatch), and never waiting more than LIVE_WAIT
    if (fresh.length >= liveBatch(e.detail.total || 1)) { clearTimeout(freshTimer); placeFresh(); } else if (!freshTimer) freshTimer = setTimeout(placeFresh, LIVE_WAIT);
  };
  function placeFresh() {
    clearTimeout(freshTimer);
    freshTimer = 0;
    if (gone || !fresh.length) return;
    const add = fresh.filter((p) => !grid.items.some((x) => x.id === p.id));
    fresh = [];
    // older than what is loaded, while more pages are to come: it shows up when the list gets there
    const last = grid.items[grid.items.length - 1];
    const keep = add.filter((p) => !next || !last || p.t >= last.t);
    if (!keep.length) return;
    const all = [...grid.items, ...keep].sort((x, y) => (x.t < y.t ? 1 : x.t > y.t ? -1 : 0));
    grid.reset();
    grid.append(all);
    drawHead();
    clearTimeout(arrived.sum);
    arrived.sum = setTimeout(loadSummary, 2500);
  }
  addEventListener('savphotos-photo', arrived);
  const changed = (e) => { if (e.detail?.live) { placeFresh(); loadSummary(); } else reload(); };
  addEventListener('savphotos-changed', changed);
  const keys = (e) => {
    if (e.target.closest?.('sav-input, input, textarea, sav-dialog') || document.querySelector('.viewer')) return;
    if (e.key === 'Escape' && sel.size) { sel.clear(); grid.redraw(); drawHead(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a' && mode !== 'pick') { e.preventDefault(); for (const x of grid.items) sel.add(x.id); grid.redraw(); drawHead(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size && mode !== 'pick') { e.preventDefault(); trash(chosen()).catch(fail); }
  };
  addEventListener('keydown', keys);

  commands([title(), [
    mode !== 'pick' ? ['upload', t('upload_files'), async () => { const { chooseFiles } = await import('./upload.js'); chooseFiles(); }] : null,
    ['square-check', t('select_all'), () => { for (const x of grid.items) sel.add(x.id); grid.redraw(); drawHead(); }],
    mode === 'album' ? ['image-plus', t('add_photos'), '#/pick/' + album.id] : null,
  ]]);

  drawHead();
  loadSummary();
  return () => { gone = true; clearTimeout(freshTimer); removeEventListener('savphotos-photo', arrived); removeEventListener('savphotos-changed', changed); removeEventListener('keydown', keys); };
}

/** The space in the side menu, after something went to the trash or arrived. */
export async function refreshSpace() {
  try {
    const me = await api('auth.me');
    if (me.user) Object.assign(S.user, { used: me.user.used, quota: me.user.quota, unlimited: me.user.unlimited });
    const { spaceBox } = await import('./account.js');
    const old = document.querySelector('.hside .quota'), box = spaceBox();
    if (old && box) old.replaceWith(box);
  } catch { /* not important */ }
}
