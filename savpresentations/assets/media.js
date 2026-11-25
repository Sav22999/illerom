/** Pictures and videos: upload, own library, search of free portals, videos by address. */
import { state, api, get, h, icon, btn, iconBtn, oops, ok, dialog, uploadPicture, pickFile, confirmBox, fmtBytes } from './core.js';
import { t } from './i18n.js';
import { mediaUrl } from './render.js';

/** Sends files one after the other; calls onpic for each picture. */
export async function uploadFiles(files, onpic) {
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return oops(new (await import('./core.js')).ApiError('image_type', 422));
  for (const f of imgs) try { onpic(await uploadPicture(f)); } catch (e) { oops(e); }
}

/** The search panel. kind: image | video. onpick({src, w, h, credit, page, video, poster}) */
export function searchPanel(kind, onpick, opt = {}) {
  const sources = state.config.sources[kind] || [];
  let source = sources[0], page = 1, key = '', busy = false, last = '';
  const q = h('sav-input', { type: 'search', placeholder: t(kind === 'video' ? 'search_videos' : 'search_images'), clearable: true, enterkeyhint: 'search', autofocus: true }, icon('search', { slot: 'prefix' }));
  const free = h('sav-switch', { checked: true, size: 'sm', onchange: () => run(true) }, t('only_free'));
  const src = h('sav-chip-group', { required: true, value: source, label: t('source_site'), onchange: (e) => { source = e.detail?.value ?? e.target.value; run(true); } }, ...sources.map((s) => h('sav-chip', { value: s, size: 'sm', selected: s === source }, t('src_' + s))));
  const grid = h('div.mgrid'), more = h('div.center'), hint = h('p.muted.mhint', t('search_hint'));
  async function run(fresh) {
    const text = q.value.trim();
    if (text.length < 2 || busy) return;
    busy = true;
    if (fresh) { page = 1; grid.replaceChildren(); }
    last = text; hint.hidden = true;
    more.replaceChildren(h('sav-spinner'));
    try {
      const r = await get('search', { kind, source, q: text, page, free: free.checked ? 1 : '' });
      r.items.forEach((i) => grid.append(cell(r.key, i)));
      more.replaceChildren(r.items.length >= 8 ? btn(t('more_results'), () => { page++; run(false); }, { appearance: 'outline', variant: 'neutral', size: 'sm' }) : !grid.children.length ? h('p.muted', t('no_results')) : '');
    } catch (e) { more.replaceChildren(h('p.muted', t('err_' + e.code))); }
    busy = false;
  }
  function cell(k, i) {
    const im = h('img', { src: 'api/?' + new URLSearchParams({ r: 'search.thumb', k, n: i.n }), alt: i.title, loading: 'lazy', draggable: false });
    im.addEventListener('error', () => c.remove());
    const c = h('button.mcell', { type: 'button', title: `${i.title}${i.author ? ' — ' + i.author : ''} (${i.license})`, style: i.w && i.h ? `--ar:${Math.max(.6, Math.min(2.2, i.w / i.h))}` : '', onclick: async () => {
      if (c.classList.contains('busy')) return;
      c.classList.add('busy');
      try { const r = await api('media.import', { k, n: i.n }); onpick({ ...r.media, credit: r.credit, creditUrl: r.page, video: r.video, needsCredit: i.needsCredit }); } catch (e) { oops(e); }
      c.classList.remove('busy');
    } }, im, i.video && h('span.vb', icon('play')), h('span.mlic', i.license));
    return c;
  }
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') run(true); });
  let deb; q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if (q.value.trim().length > 2 && q.value.trim() !== last) run(true); }, 600); });
  return h('div.mpanel', q, sources.length > 1 && src, free, hint, grid, more);
}

/** Own pictures. */
export function libraryPanel(onpick) {
  const grid = h('div.mgrid'), info = h('small.muted');
  const draw = async () => {
    try {
      const r = await get('media.list');
      info.textContent = t('space_used', { a: fmtBytes(r.used), b: fmtBytes(r.quota) });
      grid.replaceChildren(...r.media.map((m) => h('div.mcell.own', { style: `--ar:${Math.max(.6, Math.min(2.2, m.w / m.h))}` }, h('button', { type: 'button', title: m.name, onclick: () => onpick(m) }, h('img', { src: mediaUrl(m.src), alt: m.name, loading: 'lazy' })), iconBtn('trash', t('delete'), async () => { if (await confirmBox(t('delete_picture'), t('delete_picture_t'), t('delete'))) try { await api('media.delete', { id: m.id }); draw(); } catch (e) { oops(e); } }, { size: 'sm' }))));
      if (!r.media.length) grid.replaceChildren(h('p.muted', t('no_pictures')));
    } catch (e) { oops(e); }
  };
  draw();
  const dz = h('sav-dropzone', { accept: 'image/*', multiple: true, label: t('drop_pictures') });
  dz.addEventListener('change', async (e) => { const files = e.detail?.files || dz.files; if (files?.length) await uploadFiles(files, (m) => onpick(m)); draw(); });
  return h('div.mpanel', dz, info, grid);
}

/** Asks for a picture: own library, upload or search. Resolves with it, or null. */
export function pickPicture() {
  return new Promise((resolve) => {
    let dlg, res = null;
    const pick = (m) => { res = m; dlg.close(m); };
    const tabs = h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('search_web'), icon: 'search' }, searchPanel('image', pick)), h('sav-tab', { label: t('my_pictures'), icon: 'images' }, libraryPanel(pick)));
    dialog(t('choose_picture'), tabs, [[t('from_computer'), async () => { const f = await pickFile('image/*'); if (!f.length) return false; res = await uploadPicture(f[0]); return res; }, { icon: 'upload' }]], { width: '46rem', ref: (d) => (dlg = d) }).then((v) => resolve(v || res));
  });
}

export function parseVideo(url) {
  url = url.trim();
  let m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return { kind: 'youtube', vid: m[1], start: +(url.match(/[?&](?:t|start)=(\d+)/)?.[1] || 0) };
  m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,12})/);
  if (m) return { kind: 'vimeo', vid: m[1] };
  if (/^https:\/\/\S+\.(mp4|webm|ogv)(\?\S*)?$/i.test(url)) return { kind: 'file', vid: url };
  return null;
}

/** Asks for a video: search or address. Resolves with the fields of the element, or null. */
export function pickVideo() {
  return new Promise((resolve) => {
    let dlg, res = null;
    const url = h('sav-input', { label: t('video_url'), placeholder: 'https://…', help: t('video_url_t') });
    const byUrl = async () => {
      const v = parseVideo(url.value);
      if (!v) { url.setAttribute('help', t('err_video_url')); url.focus(); return false; }
      let poster = '', w = 1280, hh = 720;
      if (v.kind !== 'file') try { const r = await api('media.poster', v); poster = r.media.src; } catch { /* without a still */ }
      res = { ...v, poster, w, h: hh }; dlg.close(res);
    };
    const tabs = h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('search_web'), icon: 'search' }, searchPanel('video', (m) => { res = { kind: 'file', vid: m.video, poster: m.src, w: m.w, h: m.h, credit: m.credit, creditUrl: m.creditUrl }; dlg.close(res); })), h('sav-tab', { label: t('by_url'), icon: 'link' }, h('div.stack', url, btn(t('insert'), byUrl))));
    dialog(t('choose_video'), tabs, [], { width: '46rem', ref: (d) => (dlg = d) }).then((v) => resolve(v || res));
  });
}
