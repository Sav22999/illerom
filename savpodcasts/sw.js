/*
 * SavPodcasts — service worker. Only the shell is kept (the app opens quickly and installs as an app); the API is never
 * cached, because episodes and positions must always be fresh. The artwork (api/?r=img) is the one exception: the same
 * signed address is always the same picture, so it is kept.
 *   pages, scripts and styles: network first, the kept copy when offline · icons and artwork: kept copy first
 */
const CACHE = 'savpodcasts-2';
const ART = 'savpodcasts-art';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
  ...['account.js', 'app.css', 'app.js', 'changelog.js', 'discover.js', 'episode.js', 'eps.js', 'files.js', 'hero.js', 'home.js', 'i18n.js', 'icons.js', 'library.js', 'office.js', 'options.js', 'player.js', 'podcast.js', 'queue.js', 'shell.js', 'store.js', 'ui.js', 'version.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savpodcasts-') && x !== CACHE && x !== ART).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.includes('/api/')) {
    if (u.searchParams.get('r') !== 'img') return;
    e.respondWith(caches.open(ART).then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }))));
    return;
  }
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/icons\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
