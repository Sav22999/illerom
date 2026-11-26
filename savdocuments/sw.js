/*
 * SavDocuments — service worker. The shell is kept so the app opens without a connection: documents of this browser can be
 * opened and changed offline (copies in IndexedDB, see store.js), and what was not saved waits for the network. The API is
 * never cached, except the pictures of the documents (they never change).
 *   pages, scripts and styles: network first, the kept copy when offline · fonts and icons: kept copy first
 */
const CACHE = 'savdocuments-5';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
    ...['account.js', 'actions.js', 'admin.js', 'app.css', 'app.js', 'clean.js', 'doc.css', 'docx.js', 'editor.js', 'files.js', 'fonts.css', 'fonts.js', 'hero.js', 'home.js', 'i18n.js', 'icons-lib.js', 'icons.js', 'inserts.js', 'math.js', 'objects.js', 'options.js', 'page.js', 'panels.js', 'pdf.js', 'qr.js', 'ruler.js', 'settings.js', 'shapes.js', 'share.js', 'store.js', 'sync.js', 'templates.js', 'thumbs.js', 'ui.js', 'write.js', 'zip.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savdocuments-') && x !== CACHE && !x.endsWith('-img')).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
    const u = new URL(e.request.url);
    if (e.request.method !== 'GET' || u.origin !== location.origin) return;
    // pictures of the documents never change (a new picture has a new id): kept for working offline
    if (u.pathname.includes('/api/') && u.searchParams.get('r') === 'img' && /^[a-f0-9]{24}$/.test(u.searchParams.get('id') || '')) {
        e.respondWith(caches.open(CACHE + '-img').then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
        return;
    }
    if (u.pathname.includes('/api/')) return;
    const keep = (r) => {
        if (r.ok) {
            const c = r.clone();
            caches.open(CACHE).then((x) => x.put(e.request, c));
        }
        return r;
    };
    if (/\/(fonts|icons)\//.test(u.pathname)) {
        e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep)));
        return;
    }
    e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, {ignoreSearch: true}).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
