/*
 * SavPresentations service worker: the interface opens also with a poor connection.
 * API calls always go to the network, except pictures (they never change). Files: network first, cache when offline.
 */
'use strict';
const CACHE = 'savpresentations-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savpresentations-') && x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.includes('/savpresentations/') && !u.pathname.includes('/assets/sav/')) return;
  if (u.pathname.endsWith('/api/')) return;
  const page = e.request.mode === 'navigate';
  if (page && /\.php$/.test(u.pathname)) return;
  const font = /\.(woff|ttf)$/.test(u.pathname);
  e.respondWith((async () => {
    const c = await caches.open(CACHE), key = page ? new Request('./') : e.request;
    if (font) { const hit = await c.match(key); if (hit) return hit; }
    try { const r = await fetch(e.request); if (r.ok && (!page || u.pathname.endsWith('/savpresentations/'))) c.put(key, r.clone()); return r; } catch (x) { const hit = await c.match(key); if (hit) return hit; throw x; }
  })());
});
