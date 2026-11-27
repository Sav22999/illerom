/**
 * The account and the API. SavPhotos speaks to the API of SavDrive (../savdrive/api/): the same account, the same session
 * (the cookie of SavDrive goes with every request, same site), the same files, uploads and space.
 *
 * Every request goes through a pacer: the hosting refuses an address that asks too much in a short time ("429 Too Many
 * Requests", a page of the hosting, not of the app, seen as an attack). So the pace stays low on its own (see MAX, GAP,
 * PER_MINUTE): the API and the uploads go before the small pictures, and only if a 429 still comes it stops everything for a while (the Retry-After of the
 * answer, or 5 s, 10 s, 20 s… up to a minute), then the same request is sent again; the pace slows down and comes back
 * little by little. Whoever waits hears it with the event "savphotos-wait" (detail.until).
 */
import { getLang } from './i18n.js';

export const API = '../savdrive/api/';
export const S = { user: null, csrf: '', config: {}, photos: null };

// ------------------------------------------------------------------ the pacer

// a steady pace, always under what the hosting takes as an attack (it does not say its limit): at most 2 requests at
// once, starting at least 0.35 s apart, and never more than 100 in a minute. One number to change if it is too strict.
const MAX = 2, GAP = 350, PER_MINUTE = 100;
const queue = { hi: [], lo: [] }, starts = [];
let running = 0, gap = GAP, lastStart = 0, pauseUntil = 0, timer = 0;
/** Milliseconds until the hosting is asked again (0 = no pause). */
export const waitLeft = () => Math.max(0, pauseUntil - Date.now());
function pump() {
  clearTimeout(timer);
  timer = 0;
  while (running < MAX && (queue.hi.length || queue.lo.length)) {
    const now = Date.now();
    while (starts.length && starts[0] < now - 60000) starts.shift();
    // the next request waits for: a pause asked by the hosting, the distance from the last one, the budget of the minute
    const wait = Math.max(pauseUntil - now, lastStart + gap - now, starts.length >= PER_MINUTE ? starts[0] + 60000 - now : 0);
    if (wait > 0) { timer = setTimeout(pump, wait); return; }
    const go = queue.hi.shift() || queue.lo.shift();
    running++;
    lastStart = now;
    starts.push(now);
    go();
  }
}
/** fetch, paced. lo: it waits for the API and the uploads (small pictures). A 429 is waited out and sent again. */
export function request(url, opts = {}, { lo = false, tries = 10 } = {}) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const go = () => {
      fetch(url, opts).then((res) => {
        running--;
        if (res.status === 429) {
          n++;
          const ra = parseInt(res.headers.get('Retry-After') || '', 10);
          pauseUntil = Math.max(pauseUntil, Date.now() + (Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 5000 * 2 ** Math.min(n - 1, 4))));
          gap = Math.min(1500, gap * 2);
          dispatchEvent(new CustomEvent('savphotos-wait', { detail: { until: pauseUntil } }));
          if (n >= tries || opts.signal?.aborted) { pump(); reject(Object.assign(new Error('rate_limited'), { code: 'rate_limited' })); return; }
          (lo ? queue.lo : queue.hi).unshift(go);
          pump();
          return;
        }
        if (gap > GAP) gap = Math.max(GAP, Math.round(gap * 0.85));
        pump();
        resolve(res);
      }, (err) => { running--; pump(); reject(err); });
    };
    (lo ? queue.lo : queue.hi).push(go);
    pump();
  });
}

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try {
    res = await request(`${API}?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', credentials: 'same-origin' });
  } catch (e) {
    if (e.code) throw e;
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server', status: res.status }); }
  if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** The photo itself: to download it, or (inline) to show it. */
export const fileUrl = (id, inline = false) => `${API}?r=file.get&id=${encodeURIComponent(id)}${inline ? '&inline=1' : ''}`;
/** The small picture of a photo (v changes with its content). */
export const thumbUrl = (x) => `${API}?r=photos.thumb&id=${encodeURIComponent(x.id)}&v=${encodeURIComponent(x.v || '')}`;
/** The same for a photo of an album shared with a link. */
export const pubThumbUrl = (tok, x) => `${API}?r=photos.pub.thumb&t=${tok}&id=${encodeURIComponent(x.id)}&v=${encodeURIComponent(x.v || '')}`;
export const pubFileUrl = (tok, id, inline = false) => `${API}?r=photos.pub.file&t=${tok}&id=${encodeURIComponent(id)}${inline ? '&inline=1' : ''}`;
/**
 * How many uploaded files the page waits for before showing them (a long upload does not redraw for each one): one by
 * one up to 30 files, then 5, 10 or 25 at a time; LIVE_WAIT is the longest wait anyway (and everything shows at the end).
 */
export const liveBatch = (total) => (total <= 30 ? 1 : total <= 100 ? 5 : total <= 500 ? 10 : 25);
export const LIVE_WAIT = 8000;
/** Places of SavDrive. */
export const driveUrl = (hash = '') => '../savdrive/' + hash;

// ------------------------------------------------------------------ small pictures: many in one request, kept in the browser

/**
 * thumbFor(x, pub): the small picture of a photo as an address for an <img> (blob:…). They are asked 40 at a time
 * (photos.thumbs, or photos.pub.thumbs for an album shared with a link), after the API and the uploads, and kept in the
 * browser (Cache Storage, emptied at sign-out): a page seen again asks the hosting nothing. Rejects {code: 404} when
 * there is none.
 */
const THUMBS = 'savphotos-thumbs', memo = new Map(), batches = new Map();
const store = () => (globalThis.caches ? caches.open(THUMBS).catch(() => null) : Promise.resolve(null));
export function thumbFor(x, pub = null) {
  const key = pub ? pubThumbUrl(pub, x) : thumbUrl(x);
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const c = await store();
    const hit = c && (await c.match(key).catch(() => null));
    if (hit) return URL.createObjectURL(await hit.blob());
    return new Promise((resolve, reject) => ask(pub || '', x.id, key, resolve, reject));
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  // not too many kept in memory: the oldest ones go (they stay in the cache of the browser)
  if (memo.size > 2000) { const [k, old] = memo.entries().next().value; memo.delete(k); old.then((u) => URL.revokeObjectURL(u), () => {}); }
  return p;
}
function ask(pub, id, key, resolve, reject) {
  let b = batches.get(pub);
  if (!b) { b = { list: [], timer: 0 }; batches.set(pub, b); }
  b.list.push({ id, key, resolve, reject });
  if (b.list.length >= 40) flush(pub); else if (!b.timer) b.timer = setTimeout(() => flush(pub), 60);
}
async function flush(pub) {
  const b = batches.get(pub);
  if (!b) return;
  clearTimeout(b.timer);
  b.timer = 0;
  const part = b.list.splice(0, 40);
  if (b.list.length) b.timer = setTimeout(() => flush(pub), 0);
  if (!part.length) return;
  try {
    const ids = [...new Set(part.map((x) => x.id))].join(',');
    const res = await request(pub ? `${API}?r=photos.pub.thumbs&t=${pub}&ids=${ids}` : `${API}?r=photos.thumbs&ids=${ids}`, { credentials: 'same-origin', cache: 'no-store' }, { lo: true });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error('thumbs');
    const c = await store();
    for (const w of part) {
      if ((d.later || []).includes(w.id)) { setTimeout(() => ask(pub, w.id, w.key, w.resolve, w.reject), 1500); continue; } // the server draws it in a moment
      const b64 = d.thumbs?.[w.id];
      if (!b64) { w.reject(Object.assign(new Error('thumb'), { code: 404 })); continue; }
      const bin = atob(b64), bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'image/jpeg' });
      c?.put(w.key, new Response(blob, { headers: { 'Content-Type': 'image/jpeg' } })).catch(() => {});
      w.resolve(URL.createObjectURL(blob));
    }
  } catch (e) { for (const w of part) w.reject(e); }
}
/** At sign-out: the small pictures kept in this browser go. */
export const forgetThumbs = () => { memo.clear(); return globalThis.caches ? caches.delete(THUMBS).catch(() => {}) : Promise.resolve(); };

/**
 * A whole photo in one request (photos.upload): the file, its data and its small picture. For files up to oneShot bytes
 * (photos.me); bigger ones travel in pieces (upload). Returns {item, used, quota}.
 */
export async function uploadOne(file, folder, meta = {}, thumb = null) {
  const f = new FormData();
  f.append('file', file, file.name);
  f.append('folder', folder || '');
  f.append('name', file.name);
  f.append('mime', file.type || '');
  for (const [k, v] of Object.entries(meta)) if (v !== null && v !== undefined && v !== '') f.append(k, String(v));
  if (thumb) f.append('thumb', thumb, 'thumb.jpg');
  let res, d;
  try { res = await request(`${API}?r=photos.upload`, { method: 'POST', headers: { 'X-CSRF-Token': S.csrf, 'X-Lang': getLang() }, body: f, cache: 'no-store', credentials: 'same-origin' }); } catch (e) {
    if (e.code) throw e;
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: res.status === 413 ? 'too_big' : 'server', status: res.status }); }
  if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  return d;
}

/**
 * Sends one file into a folder of SavDrive, in pieces (uploads of SavDrive: any size fits under the limits of PHP).
 * Returns the answer of the last piece ({item, used, quota}). A name already there keeps both.
 */
export async function upload(file, folder, { onProgress, signal } = {}) {
  const start = await api('upload.start', { name: file.name, size: file.size, mime: file.type || '', folder, conflict: 'rename' });
  if (start.done) return start;
  const id = start.upload, size = start.chunk || 4194304;
  let offset = 0, tries = 0;
  const cancel = () => api('upload.cancel', { id }).catch(() => {});
  try {
    while (offset < file.size) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
      const piece = file.slice(offset, Math.min(file.size, offset + size));
      let res, d;
      try {
        res = await request(`${API}?r=upload.chunk&id=${id}&offset=${offset}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': S.csrf, 'X-Lang': getLang() }, body: piece, signal, cache: 'no-store', credentials: 'same-origin' });
        d = await res.json();
      } catch (e) {
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
        if (e.code === 'rate_limited') throw e;
        // a moment without connection (a phone between two networks): the same piece again, a few times
        if (++tries > 8) throw Object.assign(new Error('network'), { code: 'network' });
        await new Promise((r) => setTimeout(r, 1500 * tries));
        continue;
      }
      if (d.error === 'offset') { offset = d.received; continue; }
      if (!res.ok || d.ok === false) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
      tries = 0;
      if (d.done) { onProgress?.(file.size); return d; }
      offset = d.received;
      onProgress?.(offset);
    }
    throw Object.assign(new Error('server'), { code: 'server' });
  } catch (e) {
    cancel();
    throw e;
  }
}

/** The small picture made in the browser, sent to SavDrive (a video opened in the viewer without one). */
export async function sendThumb(id, blob) {
  const res = await request(`${API}?r=photos.thumbset&id=${encodeURIComponent(id)}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': S.csrf }, body: blob, cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw Object.assign(new Error('bad_thumb'), { code: 'bad_thumb' });
}

/** A Blob as base64 (the small picture travels inside photos.added: one request less for each photo). */
export const toBase64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = no; r.readAsDataURL(blob); });
