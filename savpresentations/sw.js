/*
 * SavPresentations service worker: the app opens and works without a connection (also inside the Android app).
 *   install: the whole interface is kept (pages, scripts, styles, icons) · files: network first, the kept copy when offline
 *   fonts: kept copy first · pictures and videos of the presentations (api/?r=media, they never change): kept copy first
 * Other API calls always go to the network: the data offline come from IndexedDB (local.js).
 */
'use strict';
importScripts('../assets/savoffice/offline-sw.js'); // the last answers of the API, for when there is no connection (SavOfficeData)
const CACHE = 'savpresentations-15';
const SHELL = ['./', 'manifest.webmanifest', 'icons/favicon.svg', 'icons/icon-192.png', '../assets/sav/sav.css', '../assets/sav/sav.js', '../assets/savoffice/savoffice.js', '../identity/identity.css?v=2', '../identity/identity.js?v=3',
    ...['admin.js', 'app.css', 'auth.js', 'cfb.js', 'changelog.js', 'core.js', 'editor.js', 'export-odp.js', 'export-pdf.js', 'export-pptx.js', 'features.js', 'files.js', 'fonts.js', 'grid.js', 'hero.js', 'home.js', 'i18n.js', 'icons-lib.js', 'icons.js', 'import-odp.js', 'import-ppt.js', 'import-pptx.js', 'layouts.js', 'local.js', 'main.js', 'marks.js', 'media.js', 'model.js', 'pages.js', 'panels.js', 'parts.js', 'present.js', 'render.js', 'richtext.js', 'settings.js', 'shapes.js', 'share.js', 'speaker.js', 'stage.js', 'templates.js', 'textedit.js', 'themes.js', 'ttf.js', 'version.js', 'zip.js'].map((f) => 'assets/' + f)];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith('savpresentations-') && x !== CACHE && !x.endsWith('-media')).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (self.SavOfficeData?.handle(e)) return; // the API: network first, the kept answer when offline (../assets/savoffice/offline-sw.js)
    const u = new URL(e.request.url);
    if (e.request.method !== 'GET' || u.origin !== location.origin || !u.pathname.includes('/savpresentations/') && !u.pathname.includes('/assets/sav/') && !u.pathname.includes('/identity/') && !u.pathname.includes('/assets/savoffice/')) return;
    // pictures and videos of the presentations: an id never changes its content (videos are asked in ranges: those go to the network)
    if (u.pathname.endsWith('/api/') && u.searchParams.get('r') === 'media' && /^[a-f0-9]{32}$/.test(u.searchParams.get('id') || '')) {
        if (e.request.headers.has('range')) return;
        e.respondWith(caches.open(CACHE + '-media').then((c) => c.match(e.request).then((m) => m || fetch(e.request).then((r) => { if (r.ok && r.status === 200) c.put(e.request, r.clone()); return r; }))));
        return;
    }
    if (u.pathname.endsWith('/api/')) return;
    const page = e.request.mode === 'navigate';
    if (page && /\.php$/.test(u.pathname)) return;
    const font = /\.(woff2?|ttf)$/.test(u.pathname);
    e.respondWith((async () => {
        const c = await caches.open(CACHE), key = page ? new Request('./') : e.request;
        if (font) {
            const hit = await c.match(key);
            if (hit) return hit;
        }
        try {
            const r = await fetch(e.request);
            if (r.ok && (!page || u.pathname.endsWith('/savpresentations/'))) c.put(key, r.clone());
            return r;
        } catch (x) {
            const hit = await c.match(key, {ignoreSearch: !page && !font});
            if (hit) return hit;
            throw x;
        }
    })());
});
