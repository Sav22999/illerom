/** Files: downloads (PDF, PPTX, ODP, SAVPRE, pictures) and opening of SAVPRE and PPTX files. */
import { state, api, get, h, icon, btn, tile, go, oops, ok, toast, dialog, saveBlob, fileName, uploadPicture, uploadVideo, uid } from './core.js';
import { t } from './i18n.js';
import { zip, unzip } from './zip.js';
import { Deck, fixSlide } from './model.js';
import { context } from './themes.js';
import { mediaUrl } from './render.js';

const usedMedia = (deck) => { const s = new Set(); for (const sl of deck.order()) { if (sl.d.bg?.t === 'i') s.add(sl.d.bg.src); for (const el of Object.values(sl.d.els)) { if (el.src) s.add(el.src); if (el.poster) s.add(el.poster); } } return [...s].filter((x) => x.startsWith('m:')); };

/** The pictures of a presentation: src -> {name, blob, w, h, img}. WebP becomes PNG for the programs that do not read it. */
async function loadMedia(deck, convert = true) {
  const out = new Map();
  for (const src of usedMedia(deck)) try {
    let blob = await (await fetch(mediaUrl(src))).blob();
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    if (convert && !/image\/(png|jpeg|gif)/.test(blob.type)) { const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext('2d').drawImage(img, 0, 0); blob = await new Promise((r) => c.toBlob(r, 'image/png')); }
    out.set(src, { name: src.slice(2) + '.' + (blob.type.split('/')[1] || 'png'), blob, w: img.naturalWidth, h: img.naturalHeight, img });
  } catch { /* a missing picture leaves its place empty */ }
  return out;
}

/** The app's own file: a ZIP with deck.json and the pictures, so it opens elsewhere and without a connection. */
export async function makeSavpre(deck) {
  const media = await loadMedia(deck, false);
  const videos = new Map(), ext = { 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/ogg': 'ogv' };
  for (const sl of deck.order()) for (const el of Object.values(sl.d.els)) if (el.t === 'video' && el.vid?.startsWith('m:') && !videos.has(el.vid)) try { const r = await fetch(mediaUrl(el.vid)); if (!r.ok) continue; const blob = await r.blob(); videos.set(el.vid, { name: el.vid.slice(2) + '.' + (ext[blob.type] || 'mp4'), blob }); } catch { /* left out */ }
  const json = { app: 'SavPresentations', version: 1, title: deck.title, meta: deck.meta, slides: deck.order().map((s) => ({ sid: s.sid, pos: s.pos, d: s.d })), media: Object.fromEntries([...media, ...videos].map(([src, m]) => [src, m.name])) };
  return zip([['mimetype', 'application/vnd.savpresentations', { store: true }], ['deck.json', JSON.stringify(json)], ...[...media.values(), ...videos.values()].map((m) => ['media/' + m.name, m.blob])], 'application/vnd.savpresentations');
}

async function build(deck, ctx, kind, onProgress) {
  if (kind === 'pdf') return (await import('./export-pdf.js')).exportPdf(deck, ctx, { onProgress });
  if (kind === 'pptx') return (await import('./export-pptx.js')).exportPptx(deck, ctx, await loadMedia(deck));
  if (kind === 'odp') return (await import('./export-odp.js')).exportOdp(deck, ctx, await loadMedia(deck));
  return makeSavpre(deck);
}

export function downloadMenu(ed) {
  let dlg;
  const card = (kind, ic, label) => { const b = tile(label, async () => {
    if (b.classList.contains('busy')) return;
    b.classList.add('busy');
    try { await saveBlob(await build(ed.deck, ed.ctx, kind, () => {}), fileName(ed.deck.title, kind)); ok(t('downloaded')); dlg.close(true); } catch (x) { oops(x); }
    b.classList.remove('busy');
  }, { class: 'dl' }, icon(ic), h('b', label), h('small', t('dl_' + kind))); return b; };
  return dialog(t('download'), h('div.dls', card('pdf', 'file-text', 'PDF'), card('pptx', 'presentation', 'PowerPoint (.pptx)'), card('odp', 'file-chart-column', 'OpenDocument (.odp)'), card('savpre', 'file-box', 'SavPresentations (.savpre)')), [], { width: '34rem', ref: (d) => (dlg = d) });
}

/** Download from the home, without opening the presentation. */
export async function downloadAs(deckUid) {
  try { const r = await get('deck.get', { d: deckUid }), deck = new Deck(r.deck, r.role); downloadMenu({ deck, ctx: context(deck.meta) }); } catch (e) { oops(e); }
}

export async function openFile(file, folder = 0) {
  const close = busyBox(t('opening', { name: file.name }));
  try {
    const z = await unzip(file);
    const data = z.names.includes('deck.json') ? await readSavpre(z) : z.names.includes('ppt/presentation.xml') ? await (await import('./import-pptx.js')).readPptx(z, file.name) : null;
    if (!data) throw new Error('unknown file');
    const r = await api('deck.create', { title: data.title || file.name.replace(/\.[^.]+$/, ''), folder, meta: data.meta, slides: data.slides });
    close();
    go('?d=' + r.uid);
  } catch (e) { close(); if (e.code) oops(e); else { console.error(e); toast(t('err_file'), 'danger'); } }
}
function busyBox(text) {
  let dlg;
  dialog('', h('div.center', h('sav-spinner'), h('p', text)), [], { persistent: true, width: '22rem', ref: (d) => { dlg = d; d.setAttribute('no-header', ''); } });
  return () => dlg.close();
}

async function readSavpre(z) {
  const j = JSON.parse(await z.text('deck.json'));
  if (j.app !== 'SavPresentations' || !Array.isArray(j.slides)) return null;
  // the pictures become pictures of who opens the file
  const map = {};
  for (const [src, name] of Object.entries(j.media || {})) {
    const b = /^[a-f0-9]{32}\.[a-z0-9]{3,4}$/.test(name) && (await z.bytes('media/' + name));
    const vid = /\.(mp4|mov|webm|ogv)$/.test(name);
    if (b && vid) try { map[src] = (await uploadVideo(new File([b], name, { type: 'video/mp4' }))).src; } catch (e) { oops(e); }
    else if (b) map[src] = (await uploadPicture(new File([b], name, { type: 'image/' + name.split('.').pop().replace('jpg', 'jpeg') }))).src;
  }
  const slides = j.slides.map((s) => { const d = fixSlide(s.d); if (d.bg?.src) d.bg.src = map[d.bg.src] || ''; for (const el of Object.values(d.els)) { if (el.src) el.src = map[el.src] || ''; if (el.poster) el.poster = map[el.poster] || ''; if (el.vid?.startsWith('m:')) el.vid = map[el.vid] || ''; } return { sid: s.sid, pos: s.pos, d }; });
  return { title: j.title, meta: j.meta, slides };
}
