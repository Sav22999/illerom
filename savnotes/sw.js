/*
 * SavNotes — service worker. Only the shell is kept (the app opens quickly and installs as an app); the API is never
 * cached, because notebooks must always be fresh.
 *   pages, scripts and styles: network first, the kept copy when offline · icons and typefaces: kept copy first
 */
importScripts('../assets/savoffice/offline-sw.js'); // the last answers of the API, for when there is no connection (SavOfficeData)
const CACHE = 'savnotes-7';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../assets/savoffice/offline-keep.js', '../assets/savoffice/offline-queue.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
  ...['account.js', 'app.css', 'app.js', 'changelog.js', 'files.js', 'hero.js', 'home.js', 'i18n.js', 'icons.js', 'ink.js', 'model.js', 'notebook.js', 'office.js', 'options.js', 'render.js', 'store.js', 'ui.js', 'version.js', 'zip.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savnotes-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (self.SavOfficeData?.handle(e)) return; // the API: network first, the kept answer when offline (../assets/savoffice/offline-sw.js)
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/(icons|fonts)\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
