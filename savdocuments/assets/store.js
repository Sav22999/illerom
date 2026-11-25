/** Where the documents live: the account (API) or this browser (IndexedDB). */
import {getLang} from './i18n.js';

export const S = {user: null, csrf: '', config: {}};

export async function api(r, body, query = {}) {
    const q = Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('');
    const headers = {'X-Lang': getLang()};
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
    const q = indexedDB.open('savdocuments', 1);
    q.onupgradeneeded = () => {
        q.result.createObjectStore('docs', {keyPath: 'id'});
        q.result.createObjectStore('images');
    };
    q.onsuccess = () => ok(q.result);
    q.onerror = () => no(Object.assign(new Error('storage'), {code: 'storage'}));
}));
const tx = async (store, mode, fn) => {
    const d = await idb();
    return new Promise((ok, no) => {
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
    const inAccount = S.user?.verified;
    const map = {};
    const renamed = () => blocks.map((b) => ({
        id: b.id,
        h: b.h.replace(/data-i="([a-f0-9]{24})"/g, (m, id) => (map[id] ? `data-i="${map[id]}"` : m))
    })).map((b) => ({
        ...b,
        h: b.h.replace(/<figure[^>]*>\s*<img data-i="([a-f0-9]{24})"[^>]*>(<figcaption>.*?<\/figcaption>)?<\/figure>/g, (m, id) => (Object.values(map).includes(id) ? m : ''))
    })).filter((b) => b.h);
    if (!inAccount) {
        const ids = [];
        for (const [id, blob] of Object.entries(images)) {
            const n = hex(12);
            await local.addImage(n, blob);
            map[id] = n;
            ids.push(n);
        }
        const d = {id: 'local-' + hex(8), title, content: {settings, blocks: renamed()}, images: ids};
        await local.put(d);
        return d.id;
    }
    const list = Object.entries(images);
    const r = await api('doc.create', {title, folder, content: {settings, blocks: list.length ? [] : blocks}});
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
        await api('doc.sync', {doc: r.doc.id, client: hex(6), rev: g.doc.rev, ops});
    }
    return r.doc.id;
}
