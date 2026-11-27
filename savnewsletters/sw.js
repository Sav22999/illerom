/*
 * SavNewsletters — service worker. Only the shell is kept (the app opens quickly and installs as an app); the API, the
 * public pages and the images of the newsletters are never cached here: they must always be fresh.
 *   pages, scripts and styles: network first, the kept copy when offline · icons: kept copy first
 * The modules are asked with ?v=N (see README): the kept copy is found also without it.
 */
importScripts('../assets/savoffice/offline-sw.js'); // the last answers of the API, for when there is no connection (SavOfficeData)
const CACHE = 'savnewsletters-8';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savnewsletters-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (self.SavOfficeData?.handle(e)) return; // the API: network first, the kept answer when offline (../assets/savoffice/offline-sw.js)
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || /\/(api|uploads|media)\//.test(u.pathname) || /\.php$/.test(u.pathname) && !u.pathname.endsWith('/index.php')) return;
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/icons\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
