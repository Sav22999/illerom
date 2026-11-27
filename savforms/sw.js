/*
 * SavForms — service worker. Only the shell is kept (the app opens quickly and installs as an app); the API is never
 * cached, because forms and answers must always be fresh.
 *   pages, scripts and styles: network first, the kept copy when offline · icons: kept copy first
 */
const CACHE = 'savforms-6';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
  ...['account.js', 'app.css', 'app.js', 'changelog.js', 'editor.js', 'files.js', 'fill.js', 'hero.js', 'home.js', 'i18n.js', 'icons.js', 'inputs.js', 'models.js', 'office.js', 'options.js', 'results.js', 'store.js', 'time.js', 'ui.js', 'version.js', 'zip.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savforms-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/icons\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
