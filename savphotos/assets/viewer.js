/**
 * The viewer: the preview of SavDrive (a large dialog, the arrows on the sides, the actions under the photo), made for
 * photos: keys (← → Esc, I for the details, F for favourite), swipes on phones, double click or double tap, Ctrl + wheel
 * or two fingers to zoom, and the details (date taken, camera, place, albums, the folder in SavDrive). Back closes it.
 */
import { bytes, btn, clock, dialog, drop, fail, h, icon, iconBtn, put } from './ui.js';
import { getLang, t } from './i18n.js';
import { api, driveUrl, fileUrl, pubFileUrl, pubThumbUrl, sendThumb, thumbFor, thumbUrl } from './store.js';
import { takenLabel } from './grid.js';

/**
 * openViewer({items, index, more, actions, pub}): items is the list of the page (it grows when more() loads the next
 * page); actions: {star(x, on), trash(x) -> true when gone, album(x), remove(x), cover(x)}; pub: the token of an album
 * shared with a link (then nothing can be changed).
 */
export function openViewer({ items, index, more, actions = {}, pub = null }) {
  let i = index, infoOn = !pub && localStorage.getItem('savphotos-info') === '1', closed = false;
  const thumb = (x) => (pub ? pubThumbUrl(pub, x) : thumbUrl(x));
  const full = (x) => (pub ? pubFileUrl(pub, x.id, true) : fileUrl(x.id, true));
  const dl = (x) => (pub ? pubFileUrl(pub, x.id) : fileUrl(x.id));

  const frame = h('div.pvstage.vframe'), bar = h('div.pvinfo'), info = h('div.pvdetails');
  const prev = iconBtn('chevron-left', t('previous'), () => step(-1), { class: 'pvnav l' }), next = iconBtn('chevron-right', t('next'), () => step(1), { class: 'pvnav r' });
  const stage = h('div.pvwrap.vstage', prev, frame, next);
  const d = dialog({ title: '', width: '76rem', cls: 'pv', body: [stage, bar, info], onclose: () => close(true) });
  d.classList.add('viewer');
  d.close = () => d.hide();
  history.pushState({ savphotosViewer: 1 }, '');

  // ---------------------------------------------------------------- one photo
  let zoom = 1, px = 0, py = 0, media = null;
  const apply = () => { if (media?.localName === 'img') media.style.transform = zoom === 1 ? '' : `translate(${px}px, ${py}px) scale(${zoom})`; stage.classList.toggle('zoomed', zoom > 1); };
  const resetZoom = () => { zoom = 1; px = py = 0; apply(); };

  function show() {
    const x = items[i];
    if (!x) return d.hide();
    resetZoom();
    d.setAttribute('label', takenLabel(x.t) || x.name);
    prev.hidden = i <= 0;
    next.hidden = i >= items.length - 1 && !more;
    if (x.video) {
      media = h('sav-video.pvvid', { src: full(x), poster: x.noThumb ? null : thumb(x), label: x.name, ratio: x.w && x.h ? `${x.w}:${x.h}` : null, style: x.w && x.h ? `--vw:${x.w};--vh:${x.h}` : null });
      put(frame, media);
      if (x.noThumb && !pub) repairPoster(x);
    } else {
      // the small picture at once, the photo itself over it when it has arrived
      const low = h('img.pvimg.vlow', { alt: '', draggable: 'false' });
      thumbFor(x, pub).then((u) => { low.src = u; }, () => low.remove());
      media = h('img.pvimg.vimg', { src: full(x), alt: x.name, draggable: 'false', decoding: 'async' });
      // a skeleton in the place of the photo until the first picture is there (the small one, or the whole one)
      const spin = h('sav-skeleton.vload', { shape: 'rect', 'aria-hidden': 'true' });
      low.addEventListener('load', () => spin.remove(), { once: true });
      media.addEventListener('load', () => { low.remove(); spin.remove(); media.classList.add('ready'); });
      media.addEventListener('error', () => { spin.remove(); media.remove(); media = low; frame.append(h('div.vnote', icon('image-off'), h('span', t('no_preview')), h('a', { href: dl(x), download: x.name }, t('download_original')))); });
      put(frame, low, media, spin);
    }
    drawBar(x);
    if (infoOn) drawInfo(x); else put(info);
    for (const k of [i + 1, i - 1]) { const y = items[k]; if (y && !y.video) { const im = new Image(); im.src = full(y); } }
    if (i >= items.length - 3 && more) more().then((got) => { if (got && !closed) next.hidden = i >= items.length - 1; }).catch(() => {});
  }

  /** under the photo, as in the preview of SavDrive: what it is, then what can be done with it */
  function drawBar(x) {
    const a = actions;
    const fav = !pub && a.star ? h('sav-favourite-button', { pressed: x.star || null, label: t('fav') }) : null;
    fav?.addEventListener('change', async () => { const on = fav.hasAttribute('pressed'); try { await a.star(x, on); } catch (e) { fail(e); fav.toggleAttribute('pressed', !on); } });
    const moreB = !pub ? drop(h('sav-button', { icon: 'more-vertical', label: t('more'), appearance: 'outline', variant: 'neutral', square: true, size: 'sm' }), () => [
      a.album ? ['album', t('add_to_album'), () => a.album(x)] : null,
      a.cover ? ['image', t('set_cover'), () => a.cover(x)] : null,
      a.remove ? ['minus-circle', t('remove_from_album'), async () => { if (await a.remove(x)) gone(x); }] : null,
      ['folder-open', t('show_in_drive'), async () => { const it = await api('photos.item', undefined, { id: x.id }); location.href = driveUrl(it.item.folder ? '#/f/' + it.item.folder : '#/'); }],
    ], { placement: 'top-end', label: x.name }) : null;
    put(bar, h('small.muted.pvmeta', [x.name, bytes(x.size), x.d ? clock(x.d) : ''].filter(Boolean).join(' · ')), h('span.grow'),
      fav,
      !pub ? btn(h('span.lbl', t('details')), { size: 'sm', icon: 'info', label: t('details'), appearance: infoOn ? 'soft' : 'outline', variant: infoOn ? 'primary' : 'neutral', onclick: () => toggleInfo() }) : null,
      btn(h('span.lbl', t('download')), { size: 'sm', icon: 'download', label: t('download'), onclick: () => { const l = h('a', { href: dl(x), download: x.name }); document.body.append(l); l.click(); l.remove(); } }),
      !pub && a.trash ? btn(h('span.lbl', t('delete')), { size: 'sm', icon: 'trash-2', label: t('delete'), variant: 'danger', appearance: 'outline', onclick: async () => { if (await a.trash(x)) gone(x); } }) : null,
      moreB);
  }

  /** a photo that left the list (trash, out of the album): the next one, or the one before, or the viewer closes */
  function gone(x) {
    const k = items.indexOf(x);
    if (k >= 0) items.splice(k, 1);
    if (!items.length) return d.hide();
    if (i >= items.length) i = items.length - 1;
    show();
  }

  // ---------------------------------------------------------------- details
  function toggleInfo() {
    infoOn = !infoOn;
    try { localStorage.setItem('savphotos-info', infoOn ? '1' : '0'); } catch { /* private mode */ }
    drawBar(items[i]);
    if (infoOn) drawInfo(items[i]); else put(info);
  }
  async function drawInfo(x) {
    const row = (ic, main, sub) => h('div.irow', icon(ic), h('div', h('b', main), sub ? h('small', sub) : null));
    // the shape of the details while they are on their way
    put(info, h('div.ilist', Array.from({ length: 4 }, () => h('div.irow', h('sav-skeleton', { style: 'width:1.1rem;height:1.1rem' }), h('div', h('sav-skeleton', { style: 'width:70%;height:.9rem' }), h('sav-skeleton', { style: 'width:45%;height:.7rem;margin-top:.3rem' }))))));
    let it;
    try { it = (await api('photos.item', undefined, { id: x.id })).item; } catch { put(info, h('p.muted', t('err_load'))); return; }
    if (items[i] !== x || !infoOn) return;
    const mp = it.w && it.h ? ` · ${(Math.round((it.w * it.h) / 1e5) / 10).toLocaleString(getLang())} MP` : '';
    const map = it.lat !== null && it.lon !== null ? `https://www.openstreetmap.org/?mlat=${it.lat}&mlon=${it.lon}#map=15/${it.lat}/${it.lon}` : null;
    const from = { modified: t('taken_modified'), file: t('taken_file'), mp4: t('taken_mp4') }[it.takenFrom] || null;
    put(info, h('div.ilist',
      row('calendar', takenLabel(it.taken) || '—', from),
      row(x.video ? 'film' : 'image', it.name, [bytes(it.size), it.w ? `${it.w} × ${it.h}${mp}` : '', it.d ? clock(it.d) : ''].filter(Boolean).join(' · ')),
      it.camera ? row('camera', it.camera) : null,
      map ? row('map-pin', `${it.lat.toFixed(5)}, ${it.lon.toFixed(5)}`, h('a', { href: map, target: '_blank', rel: 'noopener' }, t('open_map'))) : null,
      row('hard-drive', it.path.length ? it.path.map((p) => p.name).join(' › ') : t('my_drive'), h('a', { href: driveUrl(it.folder ? '#/f/' + it.folder : '#/') }, t('show_in_drive'))),
      it.albums.length ? h('div.irow', icon('album'), h('div', h('b', t('in_albums')), h('div.ichips', it.albums.map((a) => h('a.ichip', { href: '#/album/' + a.id }, a.name))))) : null));
  }

  // ---------------------------------------------------------------- moving and closing
  async function step(dir) {
    const k = i + dir;
    if (k < 0) return;
    if (k >= items.length) { if (!more || !(await more().catch(() => false)) || k >= items.length) return; }
    i = k;
    show();
  }
  function close(fromDialog) {
    if (closed) return;
    closed = true;
    removeEventListener('popstate', pop);
    if (!fromDialog) d.hide();
    if (history.state?.savphotosViewer) history.back();
  }
  const pop = () => { if (!closed) { closed = true; removeEventListener('popstate', pop); d.hide(); } };
  addEventListener('popstate', pop);
  d.addEventListener('keydown', (e) => {
    if (e.target.closest?.('sav-dropdown, sav-input')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    else if (e.key === 'Escape' && zoom > 1) { e.preventDefault(); e.stopPropagation(); resetZoom(); }
    // letters only with ⌥⇧ (Alt+Shift), never alone (read from the key: on a Mac ⌥ changes the character)
    else if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyI' && !pub) { e.preventDefault(); toggleInfo(); }
    else if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && e.code === 'KeyF' && !pub && actions.star) bar.querySelector('sav-favourite-button')?.toggle?.();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && actions.trash && !pub) { e.preventDefault(); const x = items[i]; actions.trash(x).then((ok) => ok && gone(x)).catch(fail); }
  });

  // ---------------------------------------------------------------- touch, mouse and wheel
  const pts = new Map();
  let start = null, pinch = null, lastTap = 0;
  const zoomAt = (z, cx, cy) => {
    const r = frame.getBoundingClientRect(), ox = cx - (r.left + r.width / 2), oy = cy - (r.top + r.height / 2);
    const nz = Math.min(6, Math.max(1, z));
    px = ox - ((ox - px) * nz) / zoom; py = oy - ((oy - py) * nz) / zoom; zoom = nz;
    if (zoom === 1) px = py = 0;
    apply();
  };
  frame.addEventListener('pointerdown', (e) => {
    if (e.target.closest('sav-video, a')) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    frame.setPointerCapture?.(e.pointerId);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: zoom }; start = null; return; }
    start = { x: e.clientX, y: e.clientY, px, py, t: Date.now() };
  });
  frame.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pts.size === 2) { const [a, b] = [...pts.values()]; zoomAt((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2); return; }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (zoom > 1) { px = start.px + dx; py = start.py + dy; apply(); return; }
    if (Math.abs(dx) > Math.abs(dy)) frame.style.transform = `translateX(${dx * 0.5}px)`;
  });
  const up = (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pinch) { if (pts.size < 2) pinch = null; return; }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y, quick = Date.now() - start.t < 250;
    frame.style.transform = '';
    const s = start; start = null;
    if (zoom > 1) return;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) return step(dx < 0 ? 1 : -1);
    if (quick && Math.abs(dx) < 8 && Math.abs(dy) < 8) {
      const now = Date.now();
      if (now - lastTap < 320 && media?.localName === 'img') { if (zoom > 1) resetZoom(); else zoomAt(2.5, s.x, s.y); lastTap = 0; } else lastTap = now;
    }
  };
  frame.addEventListener('pointerup', up);
  frame.addEventListener('pointercancel', up);
  frame.addEventListener('wheel', (e) => { if (media?.localName !== 'img' || (!e.ctrlKey && zoom === 1)) return; e.preventDefault(); zoomAt(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });

  // ---------------------------------------------------------------- a video without its small picture: made here, from the video
  async function repairPoster(x) {
    try {
      const v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = full(x);
      await new Promise((ok, no) => { v.onloadeddata = ok; v.onerror = no; setTimeout(no, 15000); });
      v.currentTime = Math.min(1, (v.duration || 2) / 10);
      await new Promise((ok, no) => { v.onseeked = ok; setTimeout(no, 8000); });
      const k = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
      const c = Object.assign(document.createElement('canvas'), { width: Math.round(v.videoWidth * k), height: Math.round(v.videoHeight * k) });
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
      v.removeAttribute('src'); v.load();
      if (blob) { await sendThumb(x.id, blob); x.noThumb = false; }
    } catch { /* it stays without one */ }
  }

  show();
  return d;
}
