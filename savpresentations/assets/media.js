/** Pictures and videos: upload (with their source), own library, search of free portals, videos by address. */
import { state, api, get, h, icon, btn, iconBtn, tile, oops, ok, errText, dialog, uploadPicture, uploadVideo, MAX_PICTURE, MAX_VIDEO, pickFile, confirmBox, fmtBytes } from './core.js';
import { t } from './i18n.js';
import { mediaUrl } from './render.js';

/** Sends a video, with how much is left and a way to give up. Resolves with it, or null. */
export async function sendVideo(file) {
  const stop = {}, bar = h('sav-progress-bar', { value: 0, max: 100, label: file.name });
  let dlg;
  dialog(t('uploading'), h('div.stack', h('p.dlg-text', file.name), bar), [[t('cancel'), () => { stop.on = true; }, { appearance: 'outline', variant: 'neutral' }]], { persistent: true, width: '24rem', ref: (d) => (dlg = d) });
  try { return await uploadVideo(file, (v) => { bar.setAttribute('value', Math.round(v * 100)); }, stop); } catch (e) { if (!stop.on) oops(e); return null; } finally { dlg.close(); }
}
/** The fields of a video element from an uploaded one. */
export const ofVideo = (m) => ({ kind: 'file', vid: m.src, poster: m.poster || '', w: m.w, h: m.h });

/** Sends files one after the other; calls onpic for each picture, onvid for each video. */
export async function uploadFiles(files, onpic, onvid) {
  for (const f of [...files].filter((x) => onvid && x.type.startsWith('video/'))) { const m = await sendVideo(f); if (m) onvid(ofVideo(m)); }
  if (onvid && [...files].some((f) => f.type.startsWith('video/')) && ![...files].some((f) => f.type.startsWith('image/'))) return;
  const imgs = [...files].filter((f) => f.type.startsWith('image/'));
  if (!imgs.length) return oops(new (await import('./core.js')).ApiError('image_type', 422));
  for (const f of imgs) try { onpic(await uploadPicture(f)); } catch (e) { oops(e); }
}

const storeKey = (kind) => 'sp-sources-' + kind;

/** The search panel: several sources at once. kind: image | video. onpick({src, w, h, credit, page, video, poster}) */
export function searchPanel(kind, onpick) {
  const all = state.config.sources[kind] || [];
  let chosen = all;
  try { const v = JSON.parse(localStorage.getItem(storeKey(kind)) || 'null'); if (Array.isArray(v) && v.some((x) => all.includes(x))) chosen = v.filter((x) => all.includes(x)); } catch { /* the usual ones */ }
  let page = {}, run = 0, last = '';
  const q = h('sav-input', { type: 'search', placeholder: t(kind === 'video' ? 'search_videos' : 'search_images'), clearable: true, enterkeyhint: 'search', autofocus: true }, icon('search', { slot: 'prefix' }));
  const free = h('sav-switch', { checked: true, size: 'sm', onchange: () => start() }, t('only_free'));
  const src = h('sav-chip-group', { multiple: true, required: true, label: t('source_site'), onchange: (e) => { const v = e.detail?.value ?? src.value; chosen = Array.isArray(v) ? v : String(v).split(',').filter(Boolean); localStorage.setItem(storeKey(kind), JSON.stringify(chosen)); start(); } }, ...all.map((s) => h('sav-chip', { value: s, size: 'sm', selected: chosen.includes(s) }, t('src_' + s))));
  // the source can be written on the slide; what asks for it has it written anyway
  const cite = h('sav-switch', { checked: localStorage.getItem('sp-cite') === '1', size: 'sm', help: t('cite_search_t'), onchange: () => localStorage.setItem('sp-cite', cite.checked ? '1' : '') }, t('cite_search'));
  const grid = h('div.mgrid'), more = h('div.center'), notes = h('div'), hint = h('p.muted.mhint', t('search_hint'));
  /** A new search on the chosen sources: each one shows its results as soon as they arrive. */
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
        const r = await get('search', { kind, source: s, q: last, page: page[s], free: free.checked ? 1 : '' });
        if (mine !== run) return;
        r.items.forEach((i) => grid.append(cell(r.key, i, s)));
        if (r.items.length >= 8) next.push(s);
      } catch (e) { if (mine === run) notes.append(h('p.muted.hint', t('src_' + s) + ': ' + errText(e))); }
    }));
    if (mine !== run) return;
    more.replaceChildren(next.length ? btn(t('more_results'), () => load(next), { appearance: 'outline', variant: 'neutral', size: 'sm' }) : !grid.children.length && !notes.children.length ? h('p.muted', t('no_results')) : '');
  }
  function cell(k, i, s) {
    const im = h('img', { src: 'api/?' + new URLSearchParams({ r: 'search.thumb', k, n: i.n }), alt: i.title, loading: 'lazy', draggable: false });
    im.addEventListener('error', () => c.remove());
    const c = tile(i.title || t('image'), async () => {
      if (c.classList.contains('busy')) return;
      c.classList.add('busy');
      try { const r = await api('media.import', { k, n: i.n }); onpick({ ...r.media, credit: r.credit, creditUrl: r.page, video: r.video, needsCredit: i.needsCredit, cite: cite.checked || i.needsCredit ? 'in' : '' }); } catch (e) { oops(e); }
      c.classList.remove('busy');
    }, { class: 'mcell', title: `${i.title}${i.author ? ' — ' + i.author : ''} (${i.license})`, style: i.w && i.h ? `--ar:${Math.max(.6, Math.min(2.2, i.w / i.h))}` : '' }, im, i.video && h('span.vb', icon('play')), h('span.mlic', `${i.license} · ${t('src_' + s)}`));
    return c;
  }
  q.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') start(); });
  let deb; q.addEventListener('input', () => { clearTimeout(deb); deb = setTimeout(() => { if (q.value.trim().length > 2 && q.value.trim() !== last) start(); }, 600); });
  return h('div.mpanel', q, src, free, cite, hint, grid, notes, more);
}

/** What was uploaded: pictures, videos or both. only: image | video. onpick(picture | fields of a video) */
export function libraryPanel(onpick, only = '') {
  const grid = h('div.mgrid'), info = h('small.muted');
  const draw = async () => {
    try {
      const r = await get('media.list');
      info.textContent = t('space_used', { a: fmtBytes(r.used), b: fmtBytes(r.quota) });
      grid.replaceChildren(...r.media.filter((m) => !only || m.video === (only === 'video')).map((m) => tile(m.name || t('image'), (e) => { if (!e.target.closest?.('sav-tooltip')) onpick(m.video ? { ...ofVideo(m), isVideo: true } : m); }, { class: 'mcell own', style: `--ar:${Math.max(.6, Math.min(2.2, m.w / m.h))}` }, m.video && !m.poster ? icon('film', { class: 'vnone' }) : h('img', { src: mediaUrl(m.video ? m.poster : m.src), alt: m.name, loading: 'lazy' }), m.video && h('span.vb', icon('play')), iconBtn('trash', t('delete'), async () => { if (await confirmBox(t('delete_picture'), t('delete_picture_t'), t('delete'))) try { await api('media.delete', { id: m.id }); draw(); } catch (e) { oops(e); } }, { size: 'sm' }))));
      if (!grid.children.length) grid.replaceChildren(h('p.muted', t(only === 'video' ? 'no_videos' : 'no_pictures')));
    } catch (e) { oops(e); }
  };
  draw();
  const dz = h('sav-dropzone', { accept: only === 'video' ? VIDEO_TYPES : only ? 'image/*' : 'image/*,' + VIDEO_TYPES, multiple: true, 'max-size': only === 'image' ? MAX_PICTURE : MAX_VIDEO, label: t(only === 'video' ? 'drop_videos' : only ? 'drop_pictures' : 'drop_media'), help: t(only === 'video' ? 'max_video' : only ? 'max_picture' : 'max_media') });
  dz.addEventListener('change', async (e) => { const files = e.detail?.files || dz.files; if (files?.length) await uploadFiles(files, (m) => onpick(m), only === 'image' ? null : (v) => onpick({ ...v, isVideo: true })); draw(); });
  return h('div.mpanel', dz, info, grid);
}

/** Asks for a picture: own library, upload or search. Resolves with it, or null. */
export function pickPicture() {
  return new Promise((resolve) => {
    let dlg, res = null;
    const pick = (m) => { res = m; dlg.close(m); };
    const src = sourceFields(), tabs = h('div.stack', h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('search_web'), icon: 'search' }, searchPanel('image', pick)), h('sav-tab', { label: t('my_pictures'), icon: 'images' }, libraryPanel(pick, 'image'))), src.node);
    dialog(t('choose_picture'), tabs, [[t('from_computer'), async () => { const f = await pickFile('image/*'); if (!f.length) return false; res = await uploadPicture(f[0]); return res; }, { icon: 'upload' }]], { width: '46rem', ref: (d) => (dlg = d) }).then((v) => resolve(src.add(v && v !== true ? v : res)));
  });
}

/** Who made it and where it comes from, asked while choosing. */
function sourceFields() {
  const text = h('sav-input', { size: 'sm', label: t('source'), placeholder: t('source_ph'), maxlength: 300 }), url = h('sav-input', { size: 'sm', label: t('source_url'), placeholder: 'https://…', maxlength: 1000 });
  for (const x of [text, url]) x.addEventListener('keydown', (e) => e.stopPropagation());
  return { node: h('sav-details', { summary: t('source_add') }, h('div.two', text, url)), add: (m) => (m && !m.credit && text.value.trim() ? { ...m, credit: text.value.trim(), creditUrl: url.value.trim(), cite: 'in' } : m) };
}
const VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime,video/ogg,.mp4,.webm,.mov,.ogv';

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
    const src = sourceFields(), done = (v) => { res = v; dlg.close(v); };
    const tabs = h('div.stack', h('sav-tabs', { appearance: 'segmented' }, h('sav-tab', { label: t('search_web'), icon: 'search' }, searchPanel('video', (m) => done({ kind: 'file', vid: m.video, poster: m.src, w: m.w, h: m.h, credit: m.credit, creditUrl: m.creditUrl, cite: m.cite }))), h('sav-tab', { label: t('my_videos'), icon: 'film' }, libraryPanel(done, 'video')), h('sav-tab', { label: t('by_url'), icon: 'link' }, h('div.stack.pad', url, btn(t('insert'), byUrl)))), src.node);
    dialog(t('choose_video'), tabs, [[t('from_computer'), async () => { const [f] = await pickFile(VIDEO_TYPES); if (!f) return false; const m = await sendVideo(f); if (!m) return false; res = ofVideo(m); return res; }, { icon: 'upload' }]], { width: '46rem', ref: (d) => (dlg = d) }).then((v) => resolve(src.add(v && v !== true ? v : res)));
  });
}
