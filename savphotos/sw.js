/*
 * SavPhotos — service worker. The shell is kept so the app opens at once; the photos and the API (../savdrive/api/)
 * always come from the network (nothing of an account is kept in the browser).
 *   pages, scripts and styles: network first, the kept copy when offline · icons: kept copy first
 */
importScripts('../assets/savoffice/offline-sw.js'); // the last answers of the API, for when there is no connection (SavOfficeData)
const CACHE = 'savphotos-13';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js',
    ...['account.js', 'admin.js', 'albums.js', 'app.css', 'app.js', 'band.js', 'grid.js', 'i18n.js', 'icons.js', 'library.js', 'options.js', 'store.js', 'ui.js', 'upload.js', 'version.js', 'viewer.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savphotos-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (self.SavOfficeData?.handle(e)) return; // the API: network first, the kept answer when offline (../assets/savoffice/offline-sw.js)
    const u = new URL(e.request.url);
    // only the shell of this app: the API, the photos and every other site go straight to the network
    if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/') || !(u.pathname.startsWith(new URL('./', location).pathname) || u.pathname.startsWith('/assets/'))) return;
    const keep = (r) => {
        if (r.ok) {
            const c = r.clone();
            caches.open(CACHE).then((x) => x.put(e.request, c));
        }
        return r;
    };
    if (/\/icons\//.test(u.pathname)) {
        e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep)));
        return;
    }
    e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, {ignoreSearch: true}).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
