/*
 * SavReads — service worker. The shell is kept (the app opens quickly, installs as an app and opens offline); every
 * answer of the API to a GET is kept by ../assets/savoffice/offline-sw.js (network first: the articles opened, or kept
 * by assets/offline.js, read without a connection). The pictures of the articles (api/?r=img) are kept here: the same
 * signed address is always the same picture.
 *   pages, scripts and styles: network first, the kept copy when offline · icons and pictures: kept copy first
 * The share menu of the phone opens ./?share… (manifest.webmanifest, share_target): a navigation like any other.
 */
importScripts('../assets/savoffice/offline-sw.js');
const CACHE = 'savreads-1';
const ART = 'savreads-img';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
  ...['account.js', 'actions.js', 'app.css', 'app.js', 'changelog.js', 'feeds.js', 'files.js', 'hero.js', 'i18n.js', 'icons.js', 'list.js', 'office.js', 'offline.js', 'options.js', 'reader.js', 'shell.js', 'store.js', 'ui.js', 'version.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savreads-') && x !== CACHE && x !== ART).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (self.SavOfficeData?.handle(e)) return; // the API: network first, the kept answer when offline
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/api/')) {
    if (u.searchParams.get('r') !== 'img') return;
    e.respondWith(caches.open(ART).then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/icons\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  // a navigation with ?save / ?share is answered by the shell (it carries the address to save)
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
// the pictures of the articles are deleted at sign-out with the rest
self.addEventListener('message', (e) => { if (e.data === 'savreads-signout') caches.delete(ART); });
