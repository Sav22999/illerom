/**
 * Presentations kept only in this browser (IndexedDB): usable without an account and without a connection.
 * Their pictures and videos are blobs here too, with addresses "l:<id>" (see mediaUrl in render.js).
 * The same database keeps a copy of the last list and of the presentations opened with the account, for when the
 * connection drops: changes made meanwhile wait in localStorage (model.js) and leave when it comes back.
 */
const DB = 'savpresentations', STORES = ['decks', 'media', 'cache'];
let dbp = null;

function db() {
  dbp ||= new Promise((ok, no) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  });
  return dbp;
}
async function run(store, mode, fn) {
  const d = await db();
  return new Promise((ok, no) => {
    const tx = d.transaction(store, mode), st = tx.objectStore(store), req = fn(st);
    tx.oncomplete = () => ok(req?.result);
    tx.onerror = tx.onabort = () => no(tx.error);
  });
}
const get = (s, k) => run(s, 'readonly', (st) => st.get(k));
const put = (s, k, v) => run(s, 'readwrite', (st) => st.put(v, k));
const del = (s, k) => run(s, 'readwrite', (st) => st.delete(k));
const all = (s) => run(s, 'readonly', (st) => st.getAll());

export const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

/** {id, title, meta, slides: [{sid, pos, d}], created, updated} */
export const local = {
  list: async () => (await all('decks').catch(() => [])).sort((a, b) => (a.updated < b.updated ? 1 : -1)),
  get: (id) => get('decks', id),
  save: (deck) => put('decks', deck.id, { ...deck, updated: new Date().toISOString() }),
  remove: async (id) => {
    const d = await get('decks', id);
    await del('decks', id);
    // its pictures go too, unless another presentation here uses them
    if (!d) return;
    const others = JSON.stringify(await all('decks'));
    for (const m of mediaOf(d)) if (!others.includes('"l:' + m + '"')) await del('media', m).catch(() => {});
  },
  /** A picture or video kept here: {src: 'l:…', w, h, name, bytes, video} */
  putMedia: async (blob, info) => { const id = newId(); await put('media', id, { blob, ...info }); urls.set(id, URL.createObjectURL(blob)); return { ...info, src: 'l:' + id, bytes: blob.size }; },
  media: (id) => get('media', id),
};
/** The media ids a presentation uses. */
export function mediaOf(d) {
  const ids = new Set();
  JSON.stringify(d.slides || []).replace(/"l:([a-z0-9]{12})"/g, (_, id) => ids.add(id));
  return [...ids];
}

/** Object addresses of the local media, filled before a local presentation is drawn. */
export const urls = new Map();
export async function loadUrls(ids) {
  for (const id of ids) if (!urls.has(id)) { const m = await local.media(id).catch(() => null); if (m) urls.set(id, URL.createObjectURL(m.blob)); }
}

/** A copy of what the account showed last (the list, a presentation), for when there is no connection. */
export const cache = {
  get: (k) => get('cache', k).catch(() => null),
  set: (k, v) => put('cache', k, v).catch(() => {}),
};
