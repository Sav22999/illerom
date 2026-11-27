/**
 * The account and the API; uploads travel in pieces (4 MB), so files of any size fit under the limits of PHP.
 *
 * Every request goes through a pacer: the hosting refuses an address that asks too much in a short time ("429 Too Many
 * Requests", a page of the hosting, seen as an attack). So the pace stays low on its own (see MAX, GAP, PER_MINUTE); the API
 * and the uploads go before the previews of the cards; only if a 429 still comes it stops everything for a while (Retry-After, or 5 s, 10 s, 20 s… up to a minute) and the
 * same request is sent again, with a slower pace that comes back little by little.
 */
import { getLang } from './i18n.js';

export const S = { user: null, csrf: '', config: {} };

// a steady pace, always under what the hosting takes as an attack (it does not say its limit): at most 2 requests at
// once, starting at least 0.35 s apart, and never more than 100 in a minute. One number to change if it is too strict.
const MAX = 2, GAP = 350, PER_MINUTE = 100;
const queue = { hi: [], lo: [] }, starts = [];
let running = 0, gap = GAP, lastStart = 0, pauseUntil = 0, timer = 0;
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
/** fetch, paced. lo: after the API and the uploads (previews). A 429 is waited out and sent again. */
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

/**
 * The small picture of a card, asked when it comes near the screen and through the pacer (a folder of hundreds of photos
 * never asks for all of them at once). onfail: no picture (it is not there, or the hosting kept refusing).
 */
const seen = typeof IntersectionObserver === 'function' ? new IntersectionObserver((list) => { for (const e of list) if (e.isIntersecting) { seen.unobserve(e.target); e.target._load(); } }, { rootMargin: '400px 0px' }) : null;
export function lazyImg(img, url, onfail) {
  img._load = async () => {
    // the shape of the picture (sav-skeleton) until it is there, as in SavPhotos
    const spin = document.createElement('sav-skeleton');
    spin.className = 'tload';
    spin.setAttribute('shape', 'rect');
    spin.setAttribute('aria-hidden', 'true');
    img.after(spin);
    try {
      // url: an address, or a function that gives the picture (thumbFor: many asked in one request)
      const shared = typeof url === 'function';
      let u;
      if (shared) u = await url();
      else {
        const r = await request(url, { credentials: 'same-origin' }, { lo: true });
        if (!r.ok) throw new Error('thumb');
        u = URL.createObjectURL(await r.blob());
      }
      img.addEventListener('load', () => { spin.remove(); if (!shared) setTimeout(() => URL.revokeObjectURL(u), 1000); }, { once: true });
      img.addEventListener('error', () => { spin.remove(); if (shared) onfail?.(img); }, { once: true });
      img.src = u;
    } catch { spin.remove(); onfail?.(img); }
  };
  if (seen) seen.observe(img); else img._load();
  return img;
}

/**
 * thumbFor(id, v): the small picture of an image file as an address for an <img> (blob:…). The cards that come near the
 * screen ask theirs together, 40 in one request (file.thumbs), after the API and the uploads, and they are kept in the
 * browser (Cache Storage, emptied at sign-out): a folder seen again asks the hosting nothing. Rejects when there is none.
 */
const THUMBS = 'thumbs-savdrive', memo = new Map(), wanted = [];
let thumbTimer = 0;
const thumbStore = () => (globalThis.caches ? caches.open(THUMBS).catch(() => null) : Promise.resolve(null));
export function thumbFor(id, v = '') {
  const key = new URL(thumbUrl(id, v), location.href).href;
  if (memo.has(key)) return memo.get(key);
  const p = (async () => {
    const c = await thumbStore();
    const hit = c && (await c.match(key).catch(() => null));
    if (hit) return URL.createObjectURL(await hit.blob());
    return new Promise((resolve, reject) => wantThumb({ id, key, resolve, reject }));
  })();
  memo.set(key, p);
  p.catch(() => memo.delete(key));
  if (memo.size > 2000) { const [k, old] = memo.entries().next().value; memo.delete(k); old.then((u) => URL.revokeObjectURL(u), () => {}); }
  return p;
}
function wantThumb(w) {
  wanted.push(w);
  if (wanted.length >= 40) sendThumbs(); else if (!thumbTimer) thumbTimer = setTimeout(sendThumbs, 60);
}
async function sendThumbs() {
  clearTimeout(thumbTimer);
  thumbTimer = 0;
  const part = wanted.splice(0, 40);
  if (wanted.length) thumbTimer = setTimeout(sendThumbs, 0);
  if (!part.length) return;
  try {
    const ids = [...new Set(part.map((w) => w.id))].map(encodeURIComponent).join(',');
    const res = await request(`api/?r=file.thumbs&ids=${ids}`, { credentials: 'same-origin', cache: 'no-store' }, { lo: true });
    const d = await res.json();
    if (!res.ok || !d.ok) throw new Error('thumbs');
    const c = await thumbStore();
    for (const w of part) {
      if ((d.later || []).includes(w.id)) { setTimeout(() => wantThumb(w), 1500); continue; } // the server draws it in a moment
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

export async function api(r, body, query = {}) {
  const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
  const headers = { 'X-Lang': getLang() };
  if (body) { headers['Content-Type'] = 'application/json'; headers['X-CSRF-Token'] = S.csrf; }
  let res, d;
  try {
    res = await request(`api/?r=${r}${q}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  } catch (e) {
    if (e.code) throw e;
    throw Object.assign(new Error('network'), { code: 'network' });
  }
  try { d = await res.json(); } catch { throw Object.assign(new Error('server'), { code: 'server' }); }
  if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), { code: d.error || 'server', status: res.status, data: d });
  if (d.csrf) S.csrf = d.csrf;
  return d;
}

/** The address of a file of the account: to download it, or (inline) to show it in the page. */
export const fileUrl = (id, inline = false) => `api/?r=file.get&id=${encodeURIComponent(id)}${inline ? '&inline=1' : ''}`;
/** The small picture of an image (made by the server the first time). */
export const thumbUrl = (id, v = '') => `api/?r=file.thumb&id=${encodeURIComponent(id)}${v ? '&v=' + encodeURIComponent(v) : ''}`;
export const pubUrl = (tok, inline = false) => `api/?r=pub.get&t=${encodeURIComponent(tok)}${inline ? '&inline=1' : ''}`;

/**
 * Sends one file. onProgress(bytes sent). signal: an AbortSignal (the upload is cancelled on the server too).
 * Returns {item, used, quota}.
 */
export async function upload(file, folder, { onProgress, signal, name, replace, conflict } = {}) {
  // replace: the id of the file it becomes the new content of; conflict: 'rename' keeps both when the name is taken
  // (otherwise a name already there answers name_taken, with the id of that file in e.data.existing)
  const start = await api('upload.start', { name: name || file.name, size: file.size, mime: file.type, folder: folder || null, replace: replace || null, conflict: conflict || null });
  if (start.done) return start;
  const id = start.upload, size = start.chunk || S.config.chunk || 4194304;
  let offset = 0, tries = 0;
  const cancel = () => api('upload.cancel', { id }).catch(() => {});
  try {
    while (offset < file.size) {
      if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
      const piece = file.slice(offset, Math.min(file.size, offset + size));
      let res, d;
      try {
        res = await request(`api/?r=upload.chunk&id=${id}&offset=${offset}`, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'X-CSRF-Token': S.csrf, 'X-Lang': getLang() }, body: piece, signal, cache: 'no-store' });
        d = await res.json();
      } catch (e) {
        if (signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted', silent: true });
        if (e.code === 'rate_limited') throw e;
        // a moment without connection: the same piece again, a few times
        if (++tries > 5) throw Object.assign(new Error('network'), { code: 'network' });
        await new Promise((r) => setTimeout(r, 1000 * tries));
        continue;
      }
      if (d.error === 'offset') { offset = d.received; continue; } // the server already has more (or less) than we thought
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
