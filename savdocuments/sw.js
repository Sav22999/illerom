/*
 * SavDocuments — service worker. The shell is kept so the app opens without a connection: documents of this browser can be
 * written offline, and what was not saved in the account waits for the network. The API is never cached.
 *   pages, scripts and styles: network first, the kept copy when offline · fonts and icons: kept copy first
 */
const CACHE = 'savdocuments-1';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
  ...['app.css', 'doc.css', 'app.js', 'actions.js', 'clean.js', 'docx.js', 'editor.js', 'files.js', 'i18n.js', 'icons.js', 'page.js', 'settings.js', 'store.js', 'sync.js', 'templates.js', 'ui.js', 'write.js', 'zip.js'].map((f) => 'assets/' + f)];

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savdocuments-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.includes('/api/')) return;
  const keep = (r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); } return r; };
  if (/\/(fonts|icons)\//.test(u.pathname)) { e.respondWith(caches.match(e.request).then((m) => m || fetch(e.request).then(keep))); return; }
  e.respondWith(fetch(e.request).then(keep).catch(() => caches.match(e.request, { ignoreSearch: true }).then((m) => m || (e.request.mode === 'navigate' ? caches.match('./') : Response.error()))));
});
