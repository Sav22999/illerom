/**
 * The backup: photos and videos chosen on the device (or a whole folder, or dropped on the page) go into SavDrive, in
 * My drive › SavPhotos › <year taken>. Those already in the drive are skipped (the same content, by its SHA-256, or the
 * same name and size), so choosing the whole camera roll again sends only what is new. Two files travel at a time, in
 * pieces (the uploads of SavDrive: a connection that drops for a moment goes on). For each file the browser reads the
 * date taken (EXIF of JPEG, the recording of MP4/MOV, otherwise the date of the file) and makes the small picture, so
 * HEIC (in Safari) and videos have one too. The screen stays on while it runs (where the browser allows it).
 * A folder (chosen with New › A folder, or dropped) becomes an album with its name, with all its photos and videos, also
 * those already in the drive; uploading it again fills the same album. What is not a photo or a video is skipped and
 * listed at the end.
 */
import { btn, bytes, errText, h, icon, iconBtn, put, toast } from './ui.js';
import { t } from './i18n.js';
import { S, api, toBase64, upload, uploadOne, waitLeft } from './store.js';

const VIDEO = /\.(mp4|mov|m4v|3gp|webm|mkv|avi)$/i;
const MEDIA = /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif|tiff?|mp4|mov|m4v|3gp|webm|mkv|avi)$/i;
const isVideo = (f) => (f.type || '').startsWith('video/') || VIDEO.test(f.name);
const isMedia = (f) => (/^(image|video)\//.test(f.type || '') && f.type !== 'image/svg+xml') || MEDIA.test(f.name);
const HASH_MAX = 64 * 1048576; // larger files are recognised by name and size only (reading them whole costs too much memory)

let job = null;
/** Files of the system nobody chose (.DS_Store, Thumbs.db…): left out without being counted. */
const SYSTEM = /^(\.|thumbs\.db$|desktop\.ini$)/i;
/** The first folder of a path chosen or dropped ("Holidays/2026/IMG.jpg" -> "Holidays"): the name of its album. */
const topFolder = (path) => { const p = String(path || '').split('/').filter(Boolean); return p.length > 1 ? p[0] : null; };

/** Opens the chooser of the device: photos and videos, or a folder (computers): a folder becomes an album with its name. */
export function chooseFiles({ folder = false } = {}) {
  const i = h('input', { type: 'file', multiple: true, accept: folder ? null : 'image/*,video/*,.heic,.heif', style: 'display:none' });
  if (folder) i.webkitdirectory = true;
  i.addEventListener('change', () => {
    const files = [...i.files];
    i.remove();
    if (files.length) startUpload(files.map((file) => ({ file, folder: folder ? topFolder(file.webkitRelativePath) : null })));
  });
  document.body.append(i);
  i.click();
}

/**
 * Files (and folders) dropped on the page: [{file, folder}], folder = the name of the folder dropped that holds it.
 * {entries, files}: read from the DataTransfer during the drop event (the browser empties it right after).
 */
export async function fromDrop({ entries, files }) {
  const out = [];
  if (!entries.length) return files.map((file) => ({ file, folder: null }));
  const readAll = (dir) => new Promise((res) => { const r = dir.createReader(), all = []; const more = () => r.readEntries((list) => { if (!list.length) return res(all); all.push(...list); more(); }, () => res(all)); more(); });
  const walk = async (e, top) => {
    if (e.isFile) out.push({ file: await new Promise((ok, no) => e.file(ok, no)), folder: top });
    else if (e.isDirectory) for (const c of await readAll(e)) await walk(c, top ?? e.name);
  };
  for (const e of entries) await walk(e, null);
  return out;
}

/**
 * Starts (or extends) the backup. items: Files, or {file, folder}: the files of a folder go into an album with its name
 * (made the first time, filled again afterwards), also those already in the drive. album: the album everything also goes
 * into (files dropped on an album). What is not a photo or a video is left out and listed at the end.
 */
export function startUpload(items, album = null) {
  const list = items.map((x) => (x instanceof File ? { file: x, folder: null } : x)).filter((x) => !SYSTEM.test(x.file.name));
  const media = list.filter((x) => isMedia(x.file)), others = list.filter((x) => !isMedia(x.file)).map((x) => (x.folder ? x.folder + '/' : '') + x.file.name);
  const folders = [...new Set(list.map((x) => x.folder).filter(Boolean))];
  if (!media.length) { toast(folders.length ? t('no_media_folder', { name: folders.join(', '), n: others.length }) : t('no_media'), 'warning', { duration: 7000 }); return; }
  const entries = media.map(({ file, folder }) => ({ file, folder: album ? null : folder, state: 'wait', sent: 0, err: null, id: null, checked: false, claimed: false }));
  if (job?.running) { job.list.push(...entries); job.others.push(...others); draw(); return; }
  job = { list: entries, others, album, made: [], albums: {}, running: true, ctrl: new AbortController(), dests: {}, open: false };
  run(job);
}

async function run(j) {
  j.at = Date.now();
  draw();
  wake(true);
  addEventListener('beforeunload', guard);
  try {
    await Promise.all([worker(j), worker(j)]);
    // how many photos of each folder went into its album; an album made now that got nothing (all failed) goes away
    for (const m of j.made) m.n = j.list.filter((e) => e.id && e.albumId === m.id).length;
    for (const m of j.made.filter((x) => !x.n && !x.reused)) {
      await api('photos.album.delete', { id: m.id }).catch(() => {});
      dispatchEvent(new CustomEvent('savphotos-album', { detail: { gone: m.id } }));
    }
    j.made = j.made.filter((x) => x.n || x.reused);
  } finally {
    j.running = false;
    wake(false);
    removeEventListener('beforeunload', guard);
    draw();
    const n = count(j);
    // the new photos are already on the page: only the counts change (or, with photos already there put into an album, the album again)
    if (n.done || j.made.length) dispatchEvent(new CustomEvent('savphotos-changed', { detail: { live: !j.list.some((e) => e.state === 'skip' && e.albumId) } }));
    if (!j.ctrl.signal.aborted || j.quota) {
      const say = [n.fail ? t('up_end_fail', n) : t('up_end', n), ...j.made.filter((a) => !a.err).map((a) => t(a.reused ? 'up_album_more' : 'up_album', { name: a.name, n: a.n })), j.others.length ? t('up_others', { n: j.others.length }) : ''];
      toast(say.filter(Boolean).join(' '), n.fail || j.others.length ? 'warning' : 'success', { duration: 8000 });
    }
    import('./library.js').then((m) => m.refreshSpace()).catch(() => {});
  }
}
/**
 * The album a file goes into: the one it was dropped on, or the album of its folder, made (or found again, reuse) the
 * first time it is needed, so it shows up at once and fills while the upload goes on.
 */
function albumFor(j, e) {
  if (j.album) return Promise.resolve(j.album);
  if (!e.folder) return Promise.resolve(null);
  return (j.albums[e.folder] ||= api('photos.album.create', { name: e.folder, reuse: true }).then((r) => {
    j.made.push({ id: r.album.id, name: r.album.name, reused: !!r.reused, n: 0 });
    dispatchEvent(new CustomEvent('savphotos-album', { detail: { album: r.album } }));
    return r.album;
  }, (x) => { delete j.albums[e.folder]; throw x; }));
}
const chunks = (a, k = 1000) => Array.from({ length: Math.ceil(a.length / k) }, (_, i) => a.slice(i * k, i * k + k));

async function worker(j) {
  for (;;) {
    if (j.ctrl.signal.aborted) return;
    const e = j.list.find((x) => x.state === 'wait' && !x.claimed);
    if (!e) return;
    e.claimed = true;
    try {
      await checked(j, e);
      if (e.state === 'skip') { draw(); continue; }
      e.state = 'send';
      draw();
      await sendOne(j, e);
      e.state = 'done';
    } catch (x) {
      if (x.code === 'aborted') { e.state = 'wait'; e.claimed = false; return; }
      e.state = 'fail'; e.err = x; e.claimed = false;
      // the space is full: nothing else would fit
      if (x.code === 'quota') { j.quota = true; j.ctrl.abort(); }
    }
    draw();
  }
}

/** Which files are already in the drive, asked for 40 at a time. */
let asking = null;
async function checked(j, e) {
  while (!e.checked) {
    if (!asking) {
      asking = (async () => {
        const batch = j.list.filter((x) => !x.checked && x.state === 'wait').slice(0, 40);
        for (const x of batch) { x.hash = await hashOf(x.file); if (j.ctrl.signal.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted' }); }
        const r = await api('photos.check', { items: batch.map((x) => ({ h: x.hash || '', n: x.file.name, s: x.file.size })) });
        for (const k of r.have) { batch[k].state = 'skip'; batch[k].id = r.ids?.[k] || null; }
        // photos already in the drive still go into the album of their folder (or the one they were dropped on), now
        const into = new Map();
        for (const x of batch) if (x.state === 'skip' && x.id && (j.album || x.folder)) { const key = j.album ? '' : x.folder; into.set(key, [...(into.get(key) || []), x]); }
        for (const [, xs] of into) {
          const al = await albumFor(j, xs[0]).catch(() => null);
          if (!al) continue;
          const res = await api('photos.album.add', { id: al.id, ids: xs.map((x) => x.id) }).catch(() => null);
          xs.forEach((x) => { x.albumId = al.id; });
          if (res?.album) dispatchEvent(new CustomEvent('savphotos-album', { detail: { album: res.album } }));
        }
        for (const x of batch) x.checked = true;
      })().finally(() => { asking = null; });
    }
    await asking;
  }
}

async function sendOne(j, e) {
  const f = e.file, info = await readInfo(f);
  j.dests[info.year] ||= api('photos.dest', { year: info.year }).then((r) => r.folder);
  let folder;
  try { folder = await j.dests[info.year]; } catch (x) { delete j.dests[info.year]; throw x; }
  const th = await makeThumb(f).catch(() => null);
  const al = await albumFor(j, e);
  e.albumId = al?.id || null;
  const meta = { hash: e.hash || null, taken: info.taken, src: info.src, w: th?.w, h: th?.h, d: info.d ?? th?.d, album: e.albumId };
  const small = th?.blob && th.blob.size < 650000 ? th.blob : null;
  let r;
  if (f.size > 0 && f.size <= (S.photos?.oneShot || 0)) {
    // the file, what the browser knows of it and its small picture in one request: the hosting is asked once per photo
    try { r = await uploadOne(f, folder, meta, small); } catch (x) { if (x.code !== 'too_big') throw x; } // the server takes less than it said: in pieces
  }
  if (!r) {
    // a big file: in pieces, then its data and its small picture
    r = await upload(f, folder, { signal: j.ctrl.signal, onProgress: (n) => { e.sent = n; draw(); } });
    const thumb = small ? await toBase64(small).catch(() => null) : null;
    const a = await api('photos.added', { id: r.item.id, ...meta, thumb }).catch(() => null);
    r.photo = a?.photo;
  }
  e.id = r.item.id;
  // the page shows it at once, in its place by date, while the others are still travelling
  if (r.photo) dispatchEvent(new CustomEvent('savphotos-photo', { detail: { photo: r.photo, album: e.albumId, total: j.list.length } }));
  e.sent = f.size;
  if (r.used !== undefined && S.user) Object.assign(S.user, { used: r.used, quota: r.quota });
}

// ---------------------------------------------------------------- what the browser reads from a file

async function hashOf(file) {
  if (!crypto.subtle || file.size > HASH_MAX) return '';
  try {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()));
    return [...d].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch { return ''; }
}

const pad = (n) => String(n).padStart(2, '0');
/** a Date as the local time of the device: "2026-11-24 18:03:00" */
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/** {taken, src: meta (read in the file) | modified (date of the file), d (seconds), year} */
async function readInfo(f) {
  let taken = null, src = null, d;
  if (isVideo(f)) {
    const m = await mp4Info(f).catch(() => null);
    if (m?.date) { taken = local(m.date); src = 'meta'; }
    if (m?.duration) d = Math.round(m.duration);
  } else if (/^image\/jpe?g$/.test(f.type) || /\.jpe?g$/i.test(f.name)) {
    const x = await jpegTaken(f).catch(() => null);
    if (x) { taken = x; src = 'meta'; }
  }
  if (!taken && f.lastModified) { taken = local(new Date(f.lastModified)); src = 'modified'; }
  const year = taken ? +taken.slice(0, 4) : new Date().getFullYear();
  return { taken, src, d, year };
}

/** The date taken of a JPEG (EXIF DateTimeOriginal), read from its first 256 KB. */
async function jpegTaken(f) {
  const v = new DataView(await f.slice(0, 262144).arrayBuffer());
  if (v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 < v.byteLength) {
    const marker = v.getUint16(p), len = v.getUint16(p + 2);
    if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) return exifDate(v, p + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return null;
    p += 2 + len;
  }
  return null;
}
function exifDate(v, tiff) {
  const le = v.getUint16(tiff) === 0x4949;
  const u16 = (o) => v.getUint16(tiff + o, le), u32 = (o) => v.getUint32(tiff + o, le);
  const read = (ifd, want) => {
    if (tiff + ifd + 2 > v.byteLength) return null;
    const n = u16(ifd);
    for (let k = 0; k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (tiff + e + 12 > v.byteLength) return null;
      if (u16(e) === want) return { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return null;
  };
  const sub = read(u32(4), 0x8769);
  if (!sub) return null;
  const tag = read(u32(sub.at), 0x9003) || read(u32(sub.at), 0x9004);
  if (!tag || tag.count < 19) return null;
  const off = tiff + u32(tag.at);
  if (off + 19 > v.byteLength) return null;
  const s = String.fromCharCode(...new Uint8Array(v.buffer, v.byteOffset + off, 19));
  const m = /^(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)$/.exec(s);
  return m && +m[1] >= 1900 ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : null;
}

/** When an MP4 / MOV was recorded and how long it lasts (its mvhd box). */
async function mp4Info(f) {
  const read = async (pos, len) => new DataView(await f.slice(pos, Math.min(f.size, pos + len)).arrayBuffer());
  const find = async (from, to, want) => {
    for (let pos = from, k = 0; pos + 8 <= to && k < 500; k++) {
      const d = await read(pos, 16);
      if (d.byteLength < 8) return null;
      let len = d.getUint32(0), body = pos + 8;
      const type = String.fromCharCode(d.getUint8(4), d.getUint8(5), d.getUint8(6), d.getUint8(7));
      if (len === 1 && d.byteLength >= 16) { len = d.getUint32(8) * 2 ** 32 + d.getUint32(12); body = pos + 16; } else if (len === 0) len = to - pos;
      if (len < 8) return null;
      if (type === want) return [body, Math.min(to, pos + len)];
      pos += len;
    }
    return null;
  };
  const moov = await find(0, f.size, 'moov');
  const mvhd = moov && (await find(moov[0], moov[1], 'mvhd'));
  if (!mvhd) return null;
  const d = await read(mvhd[0], 32);
  const v1 = d.getUint8(0) === 1;
  const created = v1 ? d.getUint32(4) * 2 ** 32 + d.getUint32(8) : d.getUint32(4);
  const scale = v1 ? d.getUint32(20) : d.getUint32(12), dur = v1 ? d.getUint32(24) * 2 ** 32 + d.getUint32(28) : d.getUint32(16);
  const unix = created - 2082844800;
  return { date: unix > 631152000 && unix < Date.now() / 1000 + 86400 ? new Date(unix * 1000) : null, duration: scale ? dur / scale : null };
}

/** The small picture (480 px), made in the browser: {blob, w, h, d} (w, h, d of a video). */
async function makeThumb(f) {
  let src, w, h, d;
  if (isVideo(f)) {
    const v = document.createElement('video'), url = URL.createObjectURL(f);
    try {
      v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
      await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = no; setTimeout(no, 12000); });
      [w, h, d] = [v.videoWidth, v.videoHeight, v.duration];
      try { await v.play(); v.pause(); } catch { /* not needed everywhere */ }
      v.currentTime = Math.min(1, (v.duration || 2) / 10);
      await new Promise((ok, no) => { v.onseeked = ok; setTimeout(no, 8000); });
      src = await draw480(v, w, h);
    } finally { URL.revokeObjectURL(url); v.removeAttribute('src'); }
    return { blob: src, w, h, d: Number.isFinite(d) ? Math.round(d) : undefined };
  }
  let bmp;
  try { bmp = await createImageBitmap(f, { resizeWidth: 480, resizeQuality: 'medium' }); } catch { bmp = await createImageBitmap(f); }
  const blob = await draw480(bmp, bmp.width, bmp.height);
  bmp.close?.();
  return { blob };
}
async function draw480(img, w, h) {
  if (!w || !h) return null;
  const k = Math.min(1, 480 / Math.max(w, h));
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) });
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8));
}

// ---------------------------------------------------------------- the panel of the backup

const count = (j) => {
  const n = { n: j.list.length, done: 0, skip: 0, fail: 0, wait: 0, sent: 0, size: 0 };
  for (const e of j.list) {
    n[e.state === 'send' || e.state === 'wait' ? 'wait' : e.state]++;
    if (e.state !== 'skip') { n.size += e.file.size; n.sent += e.state === 'done' ? e.file.size : e.sent; }
  }
  return n;
};
let panel = null, frame = 0;
// while the hosting makes us wait, the panel counts the seconds
addEventListener('savphotos-wait', () => { if (!job?.running) return; draw(); const tick = setInterval(() => { draw(); if (!job?.running || !waitLeft()) clearInterval(tick); }, 1000); });
function draw() {
  if (frame) return;
  frame = requestAnimationFrame(() => { frame = 0; paint(); });
}
function paint() {
  const j = job;
  if (!j) { panel?.remove(); panel = null; return; }
  // the panel of the uploads of SavDrive: a card at the bottom, the total, then the files under way and those that failed
  if (!panel) { panel = h('sav-card.upanel', { appearance: 'elevated', role: 'status', 'aria-live': 'polite' }); document.body.append(panel); }
  const n = count(j), pc = n.size ? Math.min(100, (n.sent / n.size) * 100) : 100;
  const title = j.running ? (j.list.some((e) => !e.checked && e.state === 'wait') && !j.list.some((e) => e.state === 'send') ? t('up_checking') : t('up_running')) : j.quota ? t('up_quota') : j.ctrl.signal.aborted ? t('up_stopped') : t('up_done');
  const rows = [...j.list.filter((e) => e.state === 'send'), ...j.list.filter((e) => e.state === 'fail')].slice(0, 60); // what is being sent first, then what failed
  put(panel,
    h('div.uhead', h('b', title), h('span.grow'), j.running ? btn(t('stop'), { size: 'sm', appearance: 'ghost', onclick: () => j.ctrl.abort() }) : iconBtn('x', t('close'), () => { job = null; paint(); })),
    h('sav-progress-bar', { value: Math.round(pc), max: 100, variant: n.fail || j.quota ? 'warning' : j.running ? 'primary' : 'success', 'aria-label': title }),
    // the hosting asked for a pause (too many requests): when it goes on
    j.running && waitLeft() > 0 ? h('small.uwait', icon('clock'), ' ', t('up_wait', { s: Math.ceil(waitLeft() / 1000) })) : null,
    h('small.usum', t('up_count', { done: n.done + n.skip, n: n.n }) + (n.skip ? ' · ' + t('up_skip', { n: n.skip }) : '') + (n.fail ? ' · ' + t('up_fail', { n: n.fail }) : '')),
    // how long it has been going, and how long it still needs at the speed so far
    j.running && j.at ? h('small.utime.muted', timing(j, n)) : null,
    rows.length ? h('div.ulist', rows.map((e) => h('div.urow', { 'data-state': e.state === 'fail' ? 'error' : 'run' },
      h('span.uic', icon(e.state === 'fail' ? 'alert-circle' : isVideo(e.file) ? 'film' : 'image')),
      h('div.uinfo', h('span.uname', { title: e.file.name }, e.file.name), e.state === 'fail' ? h('small.uerr', errText(e.err)) : h('sav-progress-bar', { value: e.sent, max: e.file.size || 1, 'aria-label': e.file.name }))))) : null,
    j.running ? h('small.muted.ukeep', t('up_keep', { size: bytes(Math.max(0, n.size - n.sent)) })) : null,
    // the albums made from the folders, and what was left out because it is not a photo or a video
    !j.running && j.made.length ? h('div.ulist.umade', j.made.map((a) => h('div.urow', { 'data-state': a.err ? 'error' : 'done' }, h('span.uic', icon(a.err ? 'alert-circle' : 'album')),
      h('div.uinfo', h('span.uname', a.name), h('small', a.err ? errText(a.err) : t(a.reused ? 'up_album_more' : 'up_album', { name: a.name, n: a.n }))), a.id ? btn(t('open'), { size: 'sm', appearance: 'ghost', href: '#/album/' + a.id }) : null))) : null,
    j.others.length ? h('div.uskip', h('small.muted', icon('alert-triangle'), ' ', t('up_others', { n: j.others.length })), btn(j.open ? t('hide') : t('show_which'), { size: 'sm', appearance: 'ghost', onclick: () => { j.open = !j.open; paint(); } })) : null,
    j.open && j.others.length ? h('ul.uskiplist', j.others.slice(0, 200).map((x) => h('li', x)), j.others.length > 200 ? h('li.muted', '…') : null) : null,
    !j.running && (fails(j).length && !j.quota || j.quota) ? h('div.prow.upact', fails(j).length && !j.quota ? btn(t('retry_failed'), { size: 'sm', icon: 'refresh', onclick: () => { const items = fails(j).map((e) => ({ file: e.file, folder: e.folder })); job = null; startUpload(items, j.album); } }) : null,
      j.quota ? btn(t('space_drive'), { size: 'sm', icon: 'hard-drive', href: '../savdrive/#/settings' }) : null) : null);
}
const fails = (j) => j.list.filter((e) => e.state === 'fail');
/** A length of time, short: "45 s", "3 min 20 s", "1 h 05 min". */
function duration(sec) {
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return sec + ' s';
  if (sec < 3600) return Math.floor(sec / 60) + ' min' + (sec % 60 && sec < 600 ? ' ' + (sec % 60) + ' s' : '');
  return Math.floor(sec / 3600) + ' h ' + String(Math.floor((sec % 3600) / 60)).padStart(2, '0') + ' min';
}
function timing(j, n) {
  const secs = (Date.now() - j.at) / 1000, parts = [t('up_elapsed', { t: duration(secs) })];
  if (secs > 3 && n.sent > 0 && n.size > n.sent) parts.push(t('up_left', { t: duration(((n.size - n.sent) / n.sent) * secs) }));
  return parts.join(' · ');
}
setInterval(() => { if (job?.running && panel) panel.querySelector('.utime')?.replaceChildren(timing(job, count(job))); }, 1000);

// ---------------------------------------------------------------- the screen stays on, the page is not left by mistake

const guard = (e) => { e.preventDefault(); e.returnValue = ''; };
let lock = null;
const again = () => { if (document.visibilityState === 'visible' && job?.running) wake(true); };
async function wake(on) {
  try {
    if (on && !lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); document.addEventListener('visibilitychange', again); }
    if (!on) { document.removeEventListener('visibilitychange', again); await lock?.release(); lock = null; }
  } catch { lock = null; }
}
