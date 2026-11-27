/** Where the documents live: the account (API) or this browser (IndexedDB). */
import {getLang} from './i18n.js';

export const S = {user: null, csrf: '', config: {}};

export async function api(r, body, query = {}) {
    const q = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    const headers = {'X-Lang': getLang()};
    // started offline: no session key yet, so the first change after the connection comes back asks for one
    if (body && !S.csrf && S.user && r !== 'auth.me') {
        const me = await api('auth.me');
        if (!me.user) throw Object.assign(new Error('unauthenticated'), {code: 'unauthenticated', status: 401});
        S.offline = false;
    }
    if (body) {
        headers['Content-Type'] = 'application/json';
        headers['X-CSRF-Token'] = S.csrf;
    }
    let res, d;
    try {
        res = await fetch(`api/?r=${r}${q}`, {
            method: body ? 'POST' : 'GET',
            headers,
            body: body ? JSON.stringify(body) : undefined,
            cache: 'no-store'
        });
    } catch {
        throw Object.assign(new Error('network'), {code: 'network'});
    }
    try {
        d = await res.json();
    } catch {
        throw Object.assign(new Error('server'), {code: 'server'});
    }
    if (!res.ok || (d.ok === false && d.error !== 'needs_signup')) throw Object.assign(new Error(d.error), {
        code: d.error || 'server',
        status: res.status,
        data: d
    });
    if (d.csrf) S.csrf = d.csrf;
    return d;
}

// ------------------------------------------------------------------ this browser

let dbp = null;
const idb = () => (dbp ||= new Promise((ok, no) => {
    const q = indexedDB.open('savbooks', 2);
    q.onupgradeneeded = (e) => {
        if (e.oldVersion < 1) {
            q.result.createObjectStore('docs', {keyPath: 'id'});
            q.result.createObjectStore('images');
        }
        if (e.oldVersion < 2) q.result.createObjectStore('cache'); // copies of the account, for working offline
    };
    q.onsuccess = () => {
        // another tab with a newer version asks to upgrade: this one steps aside instead of blocking it
        q.result.onversionchange = () => { q.result.close(); dbp = null; };
        ok(q.result);
    };
    q.onerror = () => { dbp = null; no(Object.assign(new Error('storage'), {code: 'storage'})); };
    // a tab still open with an older version blocks the upgrade: never wait for it (the app goes on without this browser's storage)
    q.onblocked = () => { dbp = null; no(Object.assign(new Error('storage'), {code: 'storage'})); };
    setTimeout(() => no(Object.assign(new Error('storage'), {code: 'storage'})), 4000);
}));
const tx = async (store, mode, fn) => {
    const d = await idb();
    return new Promise((ok, no) => {
        setTimeout(() => no(Object.assign(new Error('storage'), {code: 'storage'})), 5000); // never an endless wait
        const x = d.transaction(store, mode), r = fn(x.objectStore(store));
        x.oncomplete = () => ok(r?.result);
        x.onerror = x.onabort = () => no(Object.assign(new Error('storage'), {code: 'storage'}));
    });
};
const hex = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');

export const local = {
    list: async () => ((await tx('docs', 'readonly', (s) => s.getAll())) || []).sort((a, b) => b.updated - a.updated),
    get: (id) => tx('docs', 'readonly', (s) => s.get(id)),
    put: (d) => tx('docs', 'readwrite', (s) => s.put({...d, updated: Date.now()})),
    async create(title, content) {
        const d = {id: 'local-' + hex(8), title, content, images: []};
        await local.put(d);
        return d.id;
    },
    async remove(id) {
        const d = await local.get(id);
        for (const i of d?.images || []) await tx('images', 'readwrite', (s) => s.delete(i));
        return tx('docs', 'readwrite', (s) => s.delete(id));
    },
    image: (id) => tx('images', 'readonly', (s) => s.get(id)),
    addImage: (id, blob) => tx('images', 'readwrite', (s) => s.put(blob, id)),
};

// ------------------------------------------------------------------ offline copies of the account

/**
 * What is needed to work without a connection: the person (localStorage), the home list and the documents opened or
 * kept (IndexedDB, store "cache", one key per person so a shared computer does not mix accounts).
 */
export const offline = {
    key: (k) => `${S.user?.id || 0}:${k}`,
    rememberUser(u) { if (u) localStorage.setItem('savbooks-user', JSON.stringify(u)); else localStorage.removeItem('savbooks-user'); },
    lastUser() { try { return JSON.parse(localStorage.getItem('savbooks-user') || 'null'); } catch { return null; } },
    on: () => !S.user || (S.user.prefs || {}).offline !== false,
    put: (k, v) => (offline.on() ? tx('cache', 'readwrite', (s) => s.put({...v, at: Date.now()}, offline.key(k))).catch(() => {}) : Promise.resolve()),
    get: (k) => tx('cache', 'readonly', (s) => s.get(offline.key(k))).catch(() => null),
    async keys() { const p = offline.key(''); return ((await tx('cache', 'readonly', (s) => s.getAllKeys()).catch(() => [])) || []).filter((k) => String(k).startsWith(p)); },
    async docs() { return (await offline.keys()).filter((k) => k.includes(':doc:')).map((k) => k.split(':doc:')[1]); },
    async clear(all) { if (all) return tx('cache', 'readwrite', (s) => s.clear()).catch(() => {}); for (const k of await offline.keys()) await tx('cache', 'readwrite', (s) => s.delete(k)).catch(() => {}); },
    /** Keeps a copy of the most recent documents (at most n), quietly, without changing the "recent" list. */
    async warm(list, n = 30) {
        if (!offline.on() || !navigator.onLine) return;
        for (const d of list.slice(0, n)) {
            const have = await offline.get('doc:' + d.id);
            if (have && have.doc?.updated >= d.updated) continue;
            try { await offline.put('doc:' + d.id, await api('doc.get', undefined, {doc: d.id, quiet: 1})); } catch (e) { if (e.code === 'network') return; }
        }
    },
};

// ------------------------------------------------------------------ images

/** A picture ready to be kept: resized (2000 px at most) and recompressed when it is heavy. */
export async function shrink(file) {
    if (file.type === 'image/gif' && file.size < 2.5e6) return file;
    let bmp;
    try {
        bmp = await createImageBitmap(file);
    } catch {
        throw Object.assign(new Error('image_invalid'), {code: 'image_invalid'});
    }
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    if (k === 1 && file.size < 900e3 && /image\/(png|jpeg|webp)/.test(file.type)) return file;
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const to = (type, q) => new Promise((r) => c.toBlob(r, type, q));
    let out = /png|webp|gif|svg/.test(file.type) ? await to('image/png') : await to('image/jpeg', 0.86);
    if (out.size > 2.4e6) out = (await to('image/webp', 0.86)) || (await to('image/jpeg', 0.8));
    if (out.size > 2.9e6) out = await to('image/jpeg', 0.7);
    return out;
}

export const dataUrl = (blob) => new Promise((r) => {
    const f = new FileReader();
    f.onload = () => r(f.result);
    f.readAsDataURL(blob);
});

/** The document that is open, whatever keeps it. */
export function remoteStore(pid) {
    return {
        remote: true, pid,
        imageUrl: (id) => `api/?r=img&id=${id}`,
        addImage: async (blob) => (await api('img.upload', {doc: pid, data: await dataUrl(blob)})).id,
        imageBlob: async (id) => {
            const r = await fetch(`api/?r=img&id=${id}`);
            return r.ok ? r.blob() : null;
        },
        importImage: async (src) => (await api('img.import', {doc: pid, src})).id,
        copyImage: async (id) => (await api('img.copy', {doc: pid, id})).id,
    };
}

export function localStore(doc) {
    const urls = {};
    return {
        remote: false, pid: doc.id, urls,
        imageUrl: (id) => urls[id] || '',
        addImage: async (blob) => {
            const id = hex(12);
            await local.addImage(id, blob);
            urls[id] = URL.createObjectURL(blob);
            doc.images.push(id);
            await local.put(doc);
            return id;
        },
        imageBlob: (id) => local.image(id),
        async warm() {
            for (const id of doc.images) {
                const b = await local.image(id);
                if (b) urls[id] = URL.createObjectURL(b);
            }
        },
    };
}

/** Saves a document read from a file (or from this browser) and returns its address. */
export async function keep({title, settings, blocks, images = {}}, {folder} = {}) {
    const inAccount = S.user?.verified && !S.offline && navigator.onLine; // offline, a new document waits in this browser
    const map = {};
    const renamed = () => blocks.map((b) => ({
        id: b.id,
        h: b.h.replace(/data-i="([a-f0-9]{24})"/g, (m, id) => (map[id] ? `data-i="${map[id]}"` : m))
    })).map((b) => ({
        ...b,
        h: b.h.replace(/<figure[^>]*>\s*<img data-i="([a-f0-9]{24})"[^>]*>(<figcaption>.*?<\/figcaption>)?<\/figure>/g, (m, id) => (Object.values(map).includes(id) ? m : ''))
    })).filter((b) => b.h);
    // the picture of the cover gets its new id too
    const cover = () => (settings?.book?.cover ? {...settings, book: {...settings.book, cover: map[settings.book.cover] || ''}} : settings);
    const inBrowser = async () => {
        const ids = [];
        for (const [id, blob] of Object.entries(images)) {
            const n = hex(12);
            await local.addImage(n, blob);
            map[id] = n;
            ids.push(n);
        }
        const d = {id: 'local-' + hex(8), title, content: {settings: cover(), blocks: renamed()}, images: ids, user: S.user?.id || 0}; // whose it is: only they send it to the account
        await local.put(d);
        return d.id;
    };
    if (!inAccount) return inBrowser();
    const list = Object.entries(images);
    let r;
    try {
        r = await api('doc.create', {title, folder, content: {settings, blocks: list.length ? [] : blocks}});
    } catch (e) {
        if (e.code !== 'network' || !S.user) throw e;
        S.offline = true; // the connection went away just now: the document waits in this browser
        return inBrowser();
    }
    if (list.length) {
        for (const [id, blob] of list) {
            try {
                map[id] = (await api('img.upload', {doc: r.doc.id, data: await dataUrl(await shrink(blob))})).id;
            } catch (e) {
                if (e.code === 'network') throw e;
            }
        }
        const g = await api('doc.get', undefined, {doc: r.doc.id});
        let after = g.content.blocks[0].id;
        const ops = renamed().map((b) => {
            const o = {t: 'ins', id: b.id, after, h: b.h};
            after = b.id;
            return o;
        });
        ops.push({t: 'del', id: g.content.blocks[0].id});
        if (settings?.book?.cover) ops.push({t: 'settings', s: cover()});
        await api('doc.sync', {doc: r.doc.id, client: hex(6), rev: g.doc.rev, ops});
    }
    return r.doc.id;
}
