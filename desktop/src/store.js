/*
 * SavOffice for Mac — the apps installed on this Mac: which version each one has, finding a newer one online, downloading
 * it and switching to it only when the app is closed.
 *
 * An installed app is a folder of files (a "bundle") downloaded from the site: the files its service worker lists in SHELL
 * (its sw.js), sw.js itself, the scripts they import and what their stylesheets point to (typefaces, pictures). The
 * windows read these files instead of the network (serve.js), so an app opens without a connection and never changes
 * under the hands of whoever is using it. The data (documents, changes waiting for the network) is not here: the apps
 * keep it themselves, as in the browser (IndexedDB, localStorage and the caches of their service worker).
 *
 * The version of an app is a fingerprint of its sw.js, assets/version.js and its page: the apps bump CACHE in sw.js whenever
 * the list of files changes and VERSION at every release (see their README), and the page stamps its styles and the shared
 * scripts (SavComponents, the SavOffice button) with the date of the file. What is shown is VERSION (and CACHE's number).
 *
 *   <HOME>/apps/<slug>/state.json        { current: 'v-<id>', staged: 'v-<id>' | null, applyOnClose }
 *   <HOME>/apps/<slug>/v-<id>/meta.json   { id, cache, version, at, files: { url: { f, t, n } } }
 *   <HOME>/apps/<slug>/v-<id>/files/<f>
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');
const { EventEmitter } = require('events');
const { session } = require('electron');

const { ORIGIN, HOME } = require('./env');
const catalog = require('./catalog.json');
const SLUGS = new Set(catalog.map((a) => a.slug));
const MAX_FILE = 40 * 1048576; // a single file kept in a bundle, at most
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');
const slugOf = (pathname) => pathname.split('/').filter(Boolean)[0] || '';
const keyOf = (u) => { const x = new URL(u); x.hash = ''; return x.href; };
const root = () => path.join(HOME, 'apps'); // shared by the Toolbox and the apps (env.js)

/** The network, past serve.js (which would otherwise answer from the bundles). */
const netFetch = (url, opts = {}) => session.defaultSession.fetch(url, { bypassCustomProtocolHandlers: true, cache: 'no-store', ...opts });

/** CACHE and SHELL of a sw.js, run on its own without the service worker around it (only the top of the file runs). */
function readSw(src, swUrl) {
  const noop = () => {};
  const self = { addEventListener: noop, registration: {}, skipWaiting: noop };
  self.self = self;
  const ctx = vm.createContext({ self, importScripts: noop, location: new URL(swUrl), caches: {}, clients: {}, indexedDB: {}, URL, setTimeout: noop, clearTimeout: noop, fetch: noop,
    console: { log: noop, warn: noop, error: noop } });
  const out = JSON.parse(vm.runInContext(src + '\n;JSON.stringify({ CACHE: typeof CACHE === "undefined" ? null : CACHE, SHELL: typeof SHELL === "undefined" ? [] : SHELL })', ctx, { timeout: 2000 }));
  if (!Array.isArray(out.SHELL)) out.SHELL = [];
  return out;
}

/** What a file points to, among the files of the site: imports of a script, url() of a stylesheet, src/href of the page. */
function refsOf(type, text, base) {
  const found = [];
  const add = (r) => {
    if (!r || /^(data:|blob:|#|mailto:|javascript:)/i.test(r)) return;
    try { const u = new URL(r, base); if (u.origin === ORIGIN) found.push(keyOf(u.href)); } catch { /* not an address */ }
  };
  if (/css/.test(type)) for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)|@import\s+['"]([^'"]+)['"]/g)) add(m[2] || m[3]);
  else if (/javascript/.test(type)) for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]([^'"\n]+\.m?js(?:\?[^'"\n]*)?)['"]/g)) add(m[1]);
  else if (/html/.test(type)) for (const m of text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(m[1].replace(/&amp;/g, '&'));
  return found;
}

/** The files of one version of one app, on the disk. */
class Bundle {
  constructor(dir, meta) {
    this.dir = dir;
    this.meta = meta;
    this.timer = null;
  }
  static async open(dir) {
    return new Bundle(dir, JSON.parse(await fsp.readFile(path.join(dir, 'meta.json'), 'utf8')));
  }
  get id() { return this.meta.id; }
  get size() { return Object.values(this.meta.files).reduce((s, x) => s + (x.n || 0), 0); }
  has(key) { return !!this.meta.files[key]; }
  /** the same address without its query (as the service workers do offline: ignoreSearch) */
  loose(key) {
    const bare = key.split('?')[0];
    if (this.meta.files[bare]) return bare;
    return Object.keys(this.meta.files).find((k) => k.split('?')[0] === bare) || null;
  }
  async read(key) {
    const x = this.meta.files[key];
    if (!x) return null;
    try { return { body: await fsp.readFile(path.join(this.dir, 'files', x.f)), type: x.t }; } catch { return null; }
  }
  async put(key, body, type, later = true) {
    const f = sha(key);
    await fsp.mkdir(path.join(this.dir, 'files'), { recursive: true });
    await fsp.writeFile(path.join(this.dir, 'files', f), body);
    this.meta.files[key] = { f, t: type, n: body.length };
    if (later) this.saveSoon(); else await this.save();
  }
  saveSoon() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save().catch(() => {}), 1500);
  }
  async save() {
    clearTimeout(this.timer);
    const tmp = path.join(this.dir, 'meta.json.tmp');
    await fsp.writeFile(tmp, JSON.stringify(this.meta));
    await fsp.rename(tmp, path.join(this.dir, 'meta.json'));
  }
}

class Store extends EventEmitter {
  constructor() {
    super();
    /** slug → { bundle, staged, remote, busy, progress, error, applyOnClose } */
    this.apps = new Map(catalog.map((a) => [a.slug, { bundle: null, staged: null, remote: null, busy: null, progress: 0, error: null, applyOnClose: false }]));
    this.isOpen = () => false; // set by main.js: whether a window of this app is open
    this.autoUpdate = () => true; // set by main.js, from the settings
    this.lastCheck = 0;
    this.checking = null;
  }

  /** Reads what is installed (at the start). */
  async load() {
    await fsp.mkdir(root(), { recursive: true });
    for (const [slug, st] of this.apps) {
      try {
        const s = JSON.parse(await fsp.readFile(path.join(root(), slug, 'state.json'), 'utf8'));
        if (s.current) st.bundle = await Bundle.open(path.join(root(), slug, s.current)).catch(() => null);
        if (s.staged) st.staged = await Bundle.open(path.join(root(), slug, s.staged)).catch(() => null);
        st.applyOnClose = !!s.applyOnClose;
      } catch { /* not installed */ }
      await this.tidy(slug);
    }
  }

  /** Removes the folders of versions nobody uses any more (and downloads left halfway). */
  async tidy(slug) {
    const st = this.apps.get(slug);
    const keep = new Set([st.bundle, st.staged].filter(Boolean).map((b) => path.basename(b.dir)));
    let names = [];
    try { names = await fsp.readdir(path.join(root(), slug)); } catch { return; }
    for (const n of names) if (n.startsWith('v-') && !keep.has(n)) await fsp.rm(path.join(root(), slug, n), { recursive: true, force: true }).catch(() => {});
  }

  async writeState(slug) {
    const st = this.apps.get(slug);
    const dir = path.join(root(), slug);
    if (!st.bundle && !st.staged) { await fsp.rm(dir, { recursive: true, force: true }).catch(() => {}); return; }
    await fsp.mkdir(dir, { recursive: true });
    const s = { current: st.bundle ? path.basename(st.bundle.dir) : null, staged: st.staged ? path.basename(st.staged.dir) : null, applyOnClose: st.applyOnClose };
    await fsp.writeFile(path.join(dir, 'state.json.tmp'), JSON.stringify(s));
    await fsp.rename(path.join(dir, 'state.json.tmp'), path.join(dir, 'state.json'));
  }

  installed(slug) { return this.apps.get(slug)?.bundle || null; }

  /** Reads one app again from the disk (an app reads what the Toolbox switched); true when its version changed. */
  async reload(slug) {
    const st = this.apps.get(slug);
    const before = st.bundle?.dir || null;
    try {
      const s = JSON.parse(await fsp.readFile(path.join(root(), slug, 'state.json'), 'utf8'));
      if (path.join(root(), slug, s.current || '') !== before) st.bundle = s.current ? await Bundle.open(path.join(root(), slug, s.current)).catch(() => null) : null;
    } catch { st.bundle = null; }
    return (st.bundle?.dir || null) !== before;
  }
  changed() { this.emit('change'); }

  /** The version online: { id, cache, version, shell: [urls] }. */
  async probe(slug) {
    const swUrl = `${ORIGIN}/${slug}/sw.js`;
    const r = await netFetch(swUrl);
    if (!r.ok) throw new Error(`sw.js: ${r.status}`);
    const src = await r.text();
    const { CACHE, SHELL } = readSw(src, swUrl);
    let version = null, vsrc = '';
    try {
      const v = await netFetch(`${ORIGIN}/${slug}/assets/version.js`);
      if (v.ok) { vsrc = await v.text(); version = (vsrc.match(/\bVERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || null; }
    } catch { /* an app without version.js */ }
    // the page of the app stamps its styles and the shared scripts with their date (?v=…): a change there is a new version too
    let page = '';
    try { const p = await netFetch(`${ORIGIN}/${slug}/`); if (p.ok) page = await p.text(); } catch { /* only sw.js then */ }
    return { id: sha(src + '\n' + vsrc + '\n' + page).slice(0, 12), cache: CACHE, version, shell: SHELL.map((p) => keyOf(new URL(p, swUrl).href)) };
  }

  /** Downloads a version into its own folder; the folder is complete or it is not there. */
  async download(slug, remote) {
    const st = this.apps.get(slug);
    if (st.bundle?.id === remote.id) return st.bundle;
    if (st.staged?.id === remote.id) return st.staged;
    // a folder of its own every time: never the one of the version in use
    const dir = path.join(root(), slug, 'v-' + remote.id + '-' + Date.now().toString(36));
    const part = dir + '.part';
    await fsp.rm(part, { recursive: true, force: true });
    await fsp.mkdir(path.join(part, 'files'), { recursive: true });
    const b = new Bundle(part, { slug, id: remote.id, cache: remote.cache, version: remote.version, at: Date.now(), files: {} });
    const must = new Set([keyOf(`${ORIGIN}/${slug}/`), keyOf(`${ORIGIN}/${slug}/sw.js`)]);
    const queue = [...new Set([...must, keyOf(`${ORIGIN}/${slug}/assets/version.js`), ...remote.shell])];
    const seen = new Set(queue);
    let done = 0;
    const one = async (url) => {
      try {
        const r = await netFetch(url);
        if (!r.ok) { if (must.has(url)) throw new Error(`${new URL(url).pathname}: ${r.status}`); return; }
        const type = (r.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim();
        const body = Buffer.from(await r.arrayBuffer());
        if (body.length > MAX_FILE) return;
        await b.put(url, body, r.headers.get('content-type') || type);
        if (/css|javascript|html/.test(type)) for (const ref of refsOf(type, body.toString('utf8'), url)) {
          const p = new URL(ref).pathname, s = slugOf(p);
          if (seen.has(ref) || p.includes('/api/')) continue;
          if (SLUGS.has(s) && s !== slug) continue; // another app: its own bundle
          seen.add(ref);
          queue.push(ref);
        }
      } finally {
        done++;
        st.progress = Math.min(0.99, done / Math.max(seen.size, 1));
        this.changed();
      }
    };
    // six at a time, the queue grows while the files arrive
    const workers = Array.from({ length: 6 }, async () => { while (queue.length) await one(queue.shift()); });
    await Promise.all(workers);
    await b.save();
    await fsp.rename(part, dir);
    return Bundle.open(dir);
  }

  /** Does something long on one app, one thing at a time, showing it on the card. */
  async run(slug, busy, fn) {
    const st = this.apps.get(slug);
    if (!st) throw new Error('unknown app');
    if (st.busy) return st.job;
    st.busy = busy; st.progress = 0; st.error = null;
    this.changed();
    st.job = (async () => {
      try { return await fn(st); } catch (e) { st.error = String(e?.message || e); throw e; } finally { st.busy = null; st.job = null; st.progress = 0; this.changed(); }
    })();
    return st.job;
  }

  install(slug) {
    return this.run(slug, 'installing', async (st) => {
      st.remote = await this.probe(slug);
      st.bundle = await this.download(slug, st.remote);
      st.staged = null; st.applyOnClose = false;
      await this.writeState(slug);
      await this.tidy(slug);
      this.emit('installed', slug);
    });
  }

  /** Downloads the newer version and keeps it aside; activate() switches to it. */
  stage(slug, remote) {
    return this.run(slug, 'downloading', async (st) => {
      remote ||= await this.probe(slug);
      st.remote = remote;
      if (st.bundle?.id === remote.id) return;
      st.staged = await this.download(slug, remote);
      await this.writeState(slug);
      await this.tidy(slug);
    });
  }

  /** Switches to the version kept aside (only with no window of the app open, or right before reloading it). */
  async activate(slug) {
    const st = this.apps.get(slug);
    if (!st.staged) return false;
    st.bundle = st.staged; st.staged = null; st.applyOnClose = false;
    await this.writeState(slug);
    await this.tidy(slug);
    this.changed();
    this.emit('updated', slug);
    return true;
  }

  /** Called when the last window of an app closes. */
  async closed(slug) {
    const st = this.apps.get(slug);
    if (st?.staged && (this.autoUpdate() || st.applyOnClose)) await this.activate(slug);
  }

  async remove(slug) {
    return this.run(slug, 'removing', async (st) => {
      st.bundle = null; st.staged = null; st.remote = null; st.applyOnClose = false;
      await this.writeState(slug);
      this.emit('removed', slug);
    });
  }

  /** Reinstalls the version online from scratch (if something is missing or was changed without a new version). */
  reinstall(slug) {
    return this.run(slug, 'installing', async (st) => {
      const remote = await this.probe(slug);
      const fresh = { ...remote, id: remote.id + '-' + Date.now().toString(36) };
      const b = await this.download(slug, fresh);
      st.remote = remote;
      if (this.isOpen(slug)) { st.staged = b; st.applyOnClose = true; } else { st.bundle = b; st.staged = null; }
      await this.writeState(slug);
      await this.tidy(slug);
    });
  }

  /** Whether an installed app has a newer version online. */
  available(slug) {
    const st = this.apps.get(slug);
    if (!st.bundle || !st.remote) return false;
    return st.remote.id !== st.bundle.id && st.remote.id !== st.staged?.id && !st.bundle.id.startsWith(st.remote.id + '-');
  }

  /** Looks for newer versions of every installed app; with automatic updates on, downloads them and switches the closed ones. */
  check() {
    if (this.checking) return this.checking;
    this.checking = (async () => {
      const slugs = [...this.apps.keys()].filter((s) => this.apps.get(s).bundle);
      let failed = 0;
      await Promise.all(slugs.map(async (slug) => {
        const st = this.apps.get(slug);
        try { st.remote = await this.probe(slug); } catch { failed++; return; }
        if (!this.autoUpdate() || st.busy) return;
        try {
          if (this.available(slug)) await this.stage(slug, st.remote);
          if (st.staged && !this.isOpen(slug)) await this.activate(slug);
        } catch { /* shown on the card */ }
      }));
      if (failed < slugs.length || !slugs.length) this.lastCheck = Date.now();
      this.checking = null;
      this.changed();
    })();
    this.changed();
    return this.checking;
  }

  /** What the Toolbox shows. */
  snapshot() {
    return catalog.map((a) => {
      const st = this.apps.get(a.slug);
      const v = (b) => (b ? { version: b.meta.version, cache: b.meta.cache, at: b.meta.at } : null);
      return {
        slug: a.slug,
        installed: v(st.bundle),
        staged: v(st.staged),
        remote: st.remote ? { version: st.remote.version, cache: st.remote.cache } : null,
        update: this.available(a.slug) || !!st.staged,
        applyOnClose: st.applyOnClose,
        open: this.isOpen(a.slug),
        busy: st.busy,
        progress: st.progress,
        error: st.error,
        size: (st.bundle?.size || 0) + (st.staged?.size || 0),
      };
    });
  }
}

module.exports = { Store, Bundle, ORIGIN, SLUGS, catalog, slugOf, keyOf, netFetch, refsOf };
