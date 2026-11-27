/**
 * Albums: the list, a new one, adding photos to one (from the photos chosen or the viewer), the link to share one, and the
 * page of an album shared with a link (anyone can see it and download its photos, with or without an account).
 */
import { ask, btn, copyText, errText, dialog, drop, empty, fail, h, icon, iconBtn, menuAt, primary, put, toast } from './ui.js';
import { bandSelect } from './band.js';
import { getLang, t } from './i18n.js';
import { API, LIVE_WAIT, S, api, liveBatch, thumbFor } from './store.js';
import { brand, commands, credit, frame, go, langButton, toDrive, userMenu } from './account.js';
import { makeGrid } from './grid.js';
import { openViewer } from './viewer.js';

/** One small picture of an album, filled when it arrives (the shape of a photo meanwhile). */
const pic = (x) => {
  const im = h('img', { alt: '' });
  thumbFor(x).then((u) => { im.src = u; }, () => im.replaceWith(h('span.noimg', icon('image'))));
  return im;
};
/**
 * The cover of an album: a mosaic of up to 4 of its photos (the chosen cover first): one fills the card, two side by
 * side, three as one big and two small, four as a grid. size 'sm' (the rows of a list): only the first one.
 */
const cover = (a, size = 'lg') => {
  const list = (a.covers?.length ? a.covers : a.cover ? [{ id: a.cover, v: a.coverV }] : []).slice(0, size === 'sm' ? 1 : 4);
  if (!list.length) return h('span.noimg' + (size === 'sm' ? '.sm' : ''), icon('album'));
  if (list.length === 1) return pic(list[0]);
  return h('div.amos', { 'data-n': list.length }, list.map(pic));
};
/**
 * The cover of an album card: the chosen cover large in front, and the next two photos of the album peeking out from
 * behind it, leaning left and right (they open up on hover); every photo with round corners. No photos: the icon.
 */
const prints = (a) => {
  const list = (a.covers?.length ? a.covers : a.cover ? [{ id: a.cover, v: a.coverV }] : []).slice(0, 3);
  if (!list.length) return h('span.noimg', icon('album'));
  // drawn from the back: the third (left), the second (right), the cover (front)
  return list.map((x, i) => h('span.prt.p' + i, pic(x))).reverse();
};
const countText = (a) => (a.count ? t(a.count === 1 ? 'n_items_1' : 'n_items', { n: a.count.toLocaleString(getLang()) }) : t('album_none'));

/** A new album, then the photos to put in it. */
export async function newAlbum() {
  const name = await ask(t('new_album'), t('album_name'), '', t('create'));
  if (!name) return;
  const r = await api('photos.album.create', { name });
  go('#/pick/' + r.album.id);
}

// ------------------------------------------------------------------ what can be done with an album (its page and its card)

/** A new name: the album as it is now, or null. */
export async function renameAlbum(album) {
  const name = await ask(t('rename'), t('album_name'), album.name);
  if (!name || name === album.name) return null;
  const a = (await api('photos.album.rename', { id: album.id, name })).album;
  toast(t('album_renamed'), 'success');
  return a;
}
/**
 * Deletes albums, asking what becomes of their photos: they leave the album and stay in SavPhotos and SavDrive, or they go
 * to the trash of SavDrive too (30 days, they can be put back from there). True when they are gone.
 */
export function deleteAlbums(albums) {
  return new Promise((res) => {
    let gone = false;
    const photos = albums.reduce((n, a) => n + (a.count || 0), 0), one = albums.length === 1;
    const choice = h('sav-radio-group', { value: 'keep', label: t('del_what') },
      h('sav-radio', { value: 'keep' }, h('b', t('del_keep')), h('br'), h('small.muted', t('del_keep_t'))),
      h('sav-radio', { value: 'trash', disabled: !photos || null }, h('b', t('del_trash', { n: photos })), h('br'), h('small.muted', t('del_trash_t'))));
    dialog({ title: one ? t('delete_album_q', { name: albums[0].name }) : t('delete_albums_q', { n: albums.length }), width: '30rem', body: h('div.form', choice),
      actions: [{ label: t('cancel') }, { label: one ? t('delete_album') : t('delete_albums'), danger: true, run: async () => {
        const withPhotos = choice.value === 'trash';
        let trashed = 0;
        for (const a of albums) trashed += (await api('photos.album.delete', { id: a.id, photos: withPhotos })).trashed || 0;
        toast(withPhotos ? (one ? t('album_photos_trashed', { p: trashed }) : t('albums_photos_trashed', { n: albums.length, p: trashed })) : one ? t('album_deleted') : t('albums_deleted_n', { n: albums.length }), 'success');
        if (trashed) { dispatchEvent(new Event('savphotos-changed')); import('./library.js').then((m) => m.refreshSpace()).catch(() => {}); }
        gone = true;
      } }],
      onclose: () => res(gone) });
  });
}
/** Deletes an album (asking what becomes of its photos): true when it is gone. */
export const deleteAlbum = (album) => deleteAlbums([album]);
/**
 * An album as a ZIP made by the server (one request), after asking whether it can be made. pub: the token of a link;
 * quiet: no message (downloadAlbums says it once).
 */
export async function downloadAlbum(album, pub = null, quiet = false) {
  const q = pub ? { t: pub, check: 1 } : { id: album.id, check: 1 };
  try { await api(pub ? 'photos.pub.zip' : 'photos.album.zip', undefined, q); } catch (e) { toast((e.code === 'empty' ? t('zip_empty') : e.code === 'too_big' ? t('zip_too_big') : errText(e)) + (quiet ? ' (' + album.name + ')' : ''), 'danger'); return false; }
  const a = h('a', { href: `${API}?r=${pub ? `photos.pub.zip&t=${pub}` : `photos.album.zip&id=${encodeURIComponent(album.id)}`}`, download: album.name + '.zip' });
  document.body.append(a); a.click(); a.remove();
  if (!quiet) toast(t('zip_started'), 'neutral');
  return true;
}
/** Many albums: one ZIP each, a little apart so the browser lets them all start (empty albums are left out). */
export async function downloadAlbums(albums) {
  const list = albums.filter((a) => a.count);
  if (list.length <= 1) return list[0] ? downloadAlbum(list[0]) : toast(t('zip_empty'), 'danger');
  toast(t('downloads_n', { n: list.length }), 'neutral', { duration: 6000 });
  for (const [i, a] of list.entries()) {
    if (i) await new Promise((r) => setTimeout(r, 900));
    await downloadAlbum(a, null, true);
  }
}
/** The menu of an album, the same on its card (⋮ and right click) and on its page. changed(album | null): after a change. */
export const albumMenu = (album, changed) => [
  { head: album.name },
  ['image-plus', t('add_photos'), () => go('#/pick/' + album.id)],
  ['link', album.shared ? t('share_manage') : t('share'), () => shareAlbum(album, (a) => { album = a; changed?.(a); })],
  album.count ? ['download', t('download_zip'), () => downloadAlbum(album)] : null,
  ['pencil', t('rename'), async () => { const a = await renameAlbum(album); if (a) { album = a; changed?.(a); } }],
  '-',
  ['trash-2', t('delete_album'), async () => { if (await deleteAlbum(album)) changed?.(null); }, { danger: true }],
];

/**
 * The albums as the cards of SavDrive: the cover above, the name and how many photos under it, ⋮ and the right click for
 * the rest. Many can be chosen as in SavDrive (the box of a card, Ctrl/⌘ or Shift, a rectangle drawn with the mouse):
 * then the bar of what is chosen takes the place of the header. Returns what to undo when the page is left.
 */
export async function albumList(root) {
  // while the albums are on their way: the shape of their cards (sav-skeleton)
  const head = h('div.dhead'), body = h('div.dbody', h('div.dgrid', { 'aria-hidden': 'true' }, Array.from({ length: 4 }, () => h('div.dcard.albc.askel', h('div.dthumb.albstage', h('sav-skeleton', { shape: 'rect', style: 'width:100%;height:100%' })), h('div.dinfo', h('div.dname', h('sav-skeleton', { style: 'width:70%;height:.9rem' }), h('sav-skeleton', { style: 'width:40%;height:.7rem;margin-top:.35rem' })))))));
  const main = h('main.hmain.dmain', head, body);
  frame(root, 'albums', main, { cls: 'photos' });
  document.title = t('albums') + ' – SavPhotos';
  const sel = new Set();
  let list = [], cards = new Map(), gridEl = null, anchor = -1;
  commands([t('albums'), [['plus', t('new_album'), newAlbum], ['square-check', t('select_all'), () => { list.forEach((a) => sel.add(a.id)); sync(); }]]]);

  /** the header: the title and "New album", or what is chosen and what can be done with it */
  function drawHead() {
    if (sel.size) {
      const one = sel.size === 1 ? list.find((a) => sel.has(a.id)) : null;
      put(head, h('div.selbar', iconBtn('x', t('clear_sel'), () => { sel.clear(); sync(); }), h('b', t('n_albums_chosen', { n: sel.size })), h('span.grow'),
        one ? iconBtn('pencil', t('rename'), async () => { const a = await renameAlbum(one); if (a) changed(one)(a); }) : null,
        one ? iconBtn('link', t('share'), () => shareAlbum(one, (a) => changed(one)(a))) : null,
        list.some((a) => sel.has(a.id) && a.count) ? iconBtn('download', sel.size > 1 ? t('download_albums_n', { n: sel.size }) : t('download_zip'), () => downloadAlbums(list.filter((a) => sel.has(a.id)))) : null,
        iconBtn('trash-2', t('delete_album'), () => deleteChosen())));
      return;
    }
    put(head, h('h1', t('albums')), h('span.grow'), btn(h('span.lbl', t('new_album')), { icon: 'plus', size: 'sm', label: t('new_album'), onclick: newAlbum }));
  }
  /** the cards and the header as the choice is now */
  function sync() {
    for (const [id, c] of cards) { const on = sel.has(id); c.classList.toggle('on', on); const p = c.querySelector('sav-checkbox.pick'); if (p) p.checked = on; }
    gridEl?.classList.toggle('selecting', sel.size > 0);
    drawHead();
  }
  async function deleteChosen() {
    const chosen = list.filter((a) => sel.has(a.id));
    if (!chosen.length) return;
    if (!(await deleteAlbums(chosen))) return;
    list = list.filter((a) => !sel.has(a.id));
    sel.clear();
    draw();
  }
  const draw = () => {
    cards = new Map();
    if (!list.length) { gridEl = null; put(body, h('div.dempty', empty('album', t('no_albums'), t('no_albums_t'), primary(t('new_album'), { icon: 'plus', onclick: newAlbum })))); drawHead(); return; }
    gridEl = h('div.dgrid.albums', { role: 'list' }, list.map(card));
    put(body, gridEl);
    sync();
  };
  // after a change from a menu: the card again, or without it
  const changed = (old) => (a) => { list = a ? list.map((x) => (x.id === old.id ? a : x)) : list.filter((x) => x.id !== old.id); if (!a) sel.delete(old.id); draw(); };
  function card(a, i) {
    const more = drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'ghost', variant: 'neutral', square: true, size: 'sm' }), () => albumMenu(a, changed(a)), { placement: 'bottom-end', label: a.name });
    more.addEventListener('click', (e) => e.stopPropagation());
    const pick = h('sav-checkbox.pick', { 'aria-label': t('select_item', { name: a.name }) });
    pick.addEventListener('click', (e) => e.stopPropagation());
    pick.addEventListener('change', () => { if (pick.checked) sel.add(a.id); else sel.delete(a.id); anchor = i; sync(); });
    const c = h('div.dcard.albc', { role: 'listitem', tabindex: '0', 'data-id': a.id, 'aria-label': a.name,
      onclick: (e) => {
        if (e.target.closest('sav-dropdown') || band.swallow) { band.swallow = false; return; }
        // choosing: with Ctrl/⌘ or Shift, or while something is already chosen (as in SavDrive)
        if (e.metaKey || e.ctrlKey || e.shiftKey || sel.size) {
          if (e.shiftKey && anchor >= 0) { const [x, z] = anchor < i ? [anchor, i] : [i, anchor]; for (let k = x; k <= z; k++) sel.add(list[k].id); } else if (sel.has(a.id)) sel.delete(a.id); else sel.add(a.id);
          anchor = i;
          sync();
          return;
        }
        go('#/album/' + a.id);
      },
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) go('#/album/' + a.id); },
      oncontextmenu: (e) => { e.preventDefault(); menuAt(e.clientX, e.clientY, albumMenu(a, changed(a)), { label: a.name }); } },
    // the cover: large in front, two more photos of the album peeking out from behind it (they open up on hover)
    pick, h('div.dthumb.albstage', { 'data-n': Math.min(3, (a.covers || []).length || (a.cover ? 1 : 0)) }, prints(a),
      a.count ? h('span.albchip', icon('images'), String(a.count - (a.videos || 0)), a.videos ? [icon('film'), String(a.videos)] : null) : null,
      a.shared ? h('span.ashared', { title: t('shared') }, icon('link')) : null),
    h('div.dinfo', h('div.dname', h('b', a.name), h('small', countText(a))), more));
    cards.set(a.id, c);
    return c;
  }
  // the rectangle of SavDrive: press and drag with the mouse, also starting on a card
  const band = bandSelect(main, { sel, items: () => [...cards], onChange: () => sync(), onEmpty: () => { sel.clear(); sync(); } });
  const keys = (e) => {
    if (e.target.closest?.('sav-input, input, textarea, sav-dialog, sav-dropdown')) return;
    if (e.key === 'Escape' && sel.size) { sel.clear(); sync(); }
    else if ((e.metaKey || e.ctrlKey) && e.key === 'a' && list.length) { e.preventDefault(); list.forEach((a) => sel.add(a.id)); sync(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel.size) { e.preventDefault(); deleteChosen().catch(fail); }
  };
  addEventListener('keydown', keys);

  // while photos are uploaded: the album of a folder shows up at once, and its count and cover follow each photo that
  // goes in (drawn again a few at a time)
  let later = 0, waiting = 0;
  // drawn again one photo at a time for a few, in groups for many (store.js liveBatch), never waiting more than LIVE_WAIT
  const now = () => { clearTimeout(later); later = 0; waiting = 0; draw(); };
  const soon = (total = 1) => { if (++waiting >= liveBatch(total)) now(); else if (!later) later = setTimeout(now, LIVE_WAIT); };
  const onAlbum = (e) => {
    const { album: a, gone } = e.detail || {};
    if (gone) { list = list.filter((x) => x.id !== gone); sel.delete(gone); soon(); return; }
    if (!a) return;
    const i = list.findIndex((x) => x.id === a.id);
    if (i >= 0) list[i] = a; else list.unshift(a);
    now(); // a new album shows at once
  };
  const onPhoto = (e) => {
    const { photo: p, album: id } = e.detail || {};
    const a = id && list.find((x) => x.id === id);
    if (!a || !p) return;
    a.count = (a.count || 0) + 1;
    if (p.video) a.videos = (a.videos || 0) + 1;
    // the mosaic of the cover fills up as photos go in (up to 4)
    a.covers ||= a.cover ? [{ id: a.cover, v: a.coverV }] : [];
    if (a.covers.length < 4 && !a.covers.some((c) => c.id === p.id)) a.covers.push({ id: p.id, v: p.v });
    if (!a.cover) { a.cover = p.id; a.coverV = p.v; }
    soon(e.detail.total);
  };
  addEventListener('savphotos-album', onAlbum);
  addEventListener('savphotos-photo', onPhoto);
  const onEnd = () => { if (waiting) now(); }; // the upload ended: what is still waiting shows now
  addEventListener('savphotos-changed', onEnd);

  drawHead();
  list = (await api('photos.albums')).albums;
  draw();
  return () => { clearTimeout(later); removeEventListener('keydown', keys); removeEventListener('savphotos-album', onAlbum); removeEventListener('savphotos-photo', onPhoto); removeEventListener('savphotos-changed', onEnd); };
}

/** Adds photos (ids) to an album chosen in a list, or to a new one. */
export async function addToAlbum(ids, after) {
  let albums = [];
  // while the albums are on their way: the shape of their rows
  const box = h('div.alist', Array.from({ length: 3 }, () => h('div.arow.askel', h('span.acov', h('sav-skeleton', { shape: 'rect', style: 'width:100%;height:100%' })), h('span.grow', h('sav-skeleton', { style: 'width:60%;height:.9rem' }), h('sav-skeleton', { style: 'width:30%;height:.7rem;margin-top:.3rem' })))));
  const name = h('sav-input', { label: t('new_album'), placeholder: t('album_name'), maxlength: 120, size: 'sm', class: 'grow' });
  const d = dialog({ title: t(ids.length === 1 ? 'add_one_to' : 'add_n_to', { n: ids.length }), width: '28rem', body: [box, h('div.prow.newa', name, primary(t('create'), { icon: 'plus', size: 'sm', onclick: async () => {
    const v = name.value.trim();
    if (!v) { name.focus?.(); return; }
    const r = await api('photos.album.create', { name: v, ids });
    toast(t('added_n', { n: ids.length, name: r.album.name }), 'success');
    d.hide(); after?.();
  } }))], actions: [{ label: t('cancel') }] });
  try { albums = (await api('photos.albums')).albums; } catch (e) { fail(e); }
  put(box, albums.length ? albums.map((a) => h('button.arow', { type: 'button', onclick: async (e) => {
    const b = e.currentTarget;
    if (b.disabled) return;
    b.disabled = true;
    try {
      const r = await api('photos.album.add', { id: a.id, ids });
      toast(r.added ? t('added_n', { n: r.added, name: a.name }) : t('already_in', { name: a.name }), r.added ? 'success' : 'neutral');
      d.hide(); after?.();
    } catch (x) { fail(x); b.disabled = false; }
  } }, h('span.acov', cover(a, 'sm')), h('span.grow', h('b', a.name), h('small.muted', countText(a))), icon('plus'))) : h('p.muted.small', t('no_albums_yet')));
}

/** The link of an album: on or off, and to copy. done(album) gets the album as it is now. */
export function shareAlbum(album, done) {
  const url = () => new URL('#/a/' + album.token, location.href.split('#')[0]).href;
  const body = h('div.form');
  const draw = () => {
    const sw = h('sav-switch', { checked: album.shared || null }, t('share_on'));
    sw.addEventListener('change', async () => {
      try { album = (await api('photos.album.share', { id: album.id, on: sw.checked })).album; done?.(album); draw(); } catch (e) { fail(e); sw.checked = !sw.checked; }
    });
    put(body, h('p.muted', t('share_t')), sw, album.shared ? h('div.prow.linkrow', h('sav-input', { value: url(), readonly: true, size: 'sm', class: 'grow', 'aria-label': t('link') }), btn(t('copy'), { icon: 'copy', size: 'sm', onclick: () => copyText(url(), t('link_copied')) })) : null,
      album.shared ? h('p.muted.small', t('share_note')) : null);
  };
  draw();
  dialog({ title: t('share_album', { name: album.name }), width: '30rem', body, actions: [{ label: t('done'), primary: true }] });
}

/** The page of an album shared with a link. */
export async function publicAlbum(root, tok) {
  if (!/^[a-f0-9]{32}$/.test(tok)) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  const top = () => h('header.htop', brand(S.user ? '#/' : '#/welcome'), h('div.spacer'), S.user ? userMenu() : [langButton(), btn(t('sign_in'), { appearance: 'outline', size: 'sm', onclick: () => toDrive('signin') })]);
  put(root, h('div.home.pubp', top(), h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))));
  let r;
  try { r = await api('photos.pub.album', undefined, { t: tok }); } catch {
    put(root, h('div.home.pubp', top(), h('div.wait', empty('link-2-off', t('pub_gone'), t('pub_gone_t'))), credit()));
    return;
  }
  let next = r.next;
  const grid = makeGrid({ thumb: (x) => thumbFor(x, tok), onOpen: (i) => openViewer({ items: grid.items, index: i, pub: tok, more: loadMore }) });
  async function loadMore() {
    if (!next) return false;
    const p = await api('photos.pub.album', undefined, { t: tok, cursor: next });
    grid.append(p.items); next = p.next;
    return p.items.length > 0;
  }
  const feed = h('sav-infinite-scroll', { 'end-label': t('all_shown'), 'loading-label': t('loading'), 'error-label': t('err_load'), 'retry-label': t('retry'), threshold: 900 }, grid.el);
  feed.addEventListener('sav-load', async () => { try { await loadMore(); feed.done(!!next); } catch { feed.fail(); } });
  grid.append(r.items);
  put(root, h('div.home.pubp', top(), h('main.pubm', h('div.dhead', h('h1', r.album.name), h('small.dcount', t('pub_by', { name: r.album.owner }) + ' · ' + countText(r.album)), h('span.grow'), r.items.length ? btn(h('span.lbl', t('download_all')), { icon: 'download', size: 'sm', label: t('download_all'), onclick: () => downloadAlbum(r.album, tok) }) : null), r.items.length ? feed : h('div.dempty', empty('album', t('album_empty'), ''))), credit()));
  if (!next) feed.done(false);
  document.title = r.album.name + ' – SavPhotos';
}
