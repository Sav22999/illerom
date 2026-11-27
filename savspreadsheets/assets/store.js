/** Where the workbooks live: the account (API) or this browser (IndexedDB, while there is no connection). */
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
    const q = indexedDB.open('savspreadsheets', 1);
    q.onupgradeneeded = (e) => {
        if (e.oldVersion < 1) {
            q.result.createObjectStore('docs', {keyPath: 'id'});
        }
        if (e.oldVersion < 1) q.result.createObjectStore('cache'); // copies of the account, for working offline
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
    remove: (id) => tx('docs', 'readwrite', (s) => s.delete(id)),
};

// ------------------------------------------------------------------ offline copies of the account

/**
 * What is needed to work without a connection: the person (localStorage), the home list and the workbooks opened or
 * kept (IndexedDB, store "cache", one key per person so a shared computer does not mix accounts).
 */
export const offline = {
    key: (k) => `${S.user?.id || 0}:${k}`,
    rememberUser(u) { if (u) localStorage.setItem('savspreadsheets-user', JSON.stringify(u)); else localStorage.removeItem('savspreadsheets-user'); },
    lastUser() { try { return JSON.parse(localStorage.getItem('savspreadsheets-user') || 'null'); } catch { return null; } },
    on: () => !S.user || (S.user.prefs || {}).offline !== false,
    put: (k, v) => (offline.on() ? tx('cache', 'readwrite', (s) => s.put({...v, at: Date.now()}, offline.key(k))).catch(() => {}) : Promise.resolve()),
    get: (k) => tx('cache', 'readonly', (s) => s.get(offline.key(k))).catch(() => null),
    async keys() { const p = offline.key(''); return ((await tx('cache', 'readonly', (s) => s.getAllKeys()).catch(() => [])) || []).filter((k) => String(k).startsWith(p)); },
    async docs() { return (await offline.keys()).filter((k) => k.includes(':doc:')).map((k) => k.split(':doc:')[1]); },
    async clear(all) { if (all) return tx('cache', 'readwrite', (s) => s.clear()).catch(() => {}); for (const k of await offline.keys()) await tx('cache', 'readwrite', (s) => s.delete(k)).catch(() => {}); },
    /** Keeps a copy of the most recent workbooks (at most n), quietly, without changing the "recent" list. */
    async warm(list, n = 30) {
        if (!offline.on() || !navigator.onLine) return;
        for (const d of list.slice(0, n)) {
            const have = await offline.get('doc:' + d.id);
            if (have && have.doc?.updated >= d.updated) continue;
            try { await offline.put('doc:' + d.id, await api('doc.get', undefined, {doc: d.id, quiet: 1})); } catch (e) { if (e.code === 'network') return; }
        }
    },
};

/** Saves a workbook read from a file (or from a template, or from this browser) and returns its address. */
export async function keep({title, settings, sheets}, {folder} = {}) {
    const content = {settings, sheets};
    const inAccount = S.user?.verified && !S.offline && navigator.onLine; // offline, a new workbook waits in this browser
    const inBrowser = async () => {
        const d = {id: 'local-' + hex(8), title, content, user: S.user?.id || 0}; // whose it is: only they send it to the account
        await local.put(d);
        return d.id;
    };
    if (!inAccount) return inBrowser();
    try {
        return (await api('doc.create', {title, folder, content})).doc.id;
    } catch (e) {
        if (e.code !== 'network' || !S.user) throw e;
        S.offline = true; // the connection went away just now: the workbook waits in this browser
        return inBrowser();
    }
}
