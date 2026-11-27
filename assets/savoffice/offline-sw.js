/*
 * SavOffice — what the service worker of every app adds so the app works without a connection
 * (importScripts('../assets/savoffice/offline-sw.js') at the top of its sw.js, then SavOfficeData.handle(e) first
 * in its "fetch").
 *
 * Reading: every answer of the API to a GET (JSON, at most 4 MB) is kept in the browser, in the cache
 * "sodata-<app>". With the network it always goes to the network (network first: nothing old is shown while
 * online); without it, the last kept answer comes back, marked with the header X-SavOffice-Offline: 1, and the
 * pages of the app are told (message {savoffice: 'offline'}) so they can say it. An answer never kept: the same
 * network error as without this file, which the apps already show.
 *
 * Privacy: what is kept belongs to whoever is signed in. It is all deleted (every app, every "sodata-" cache of the
 * site, and the changes waiting) at sign-out (a POST to auth.logout or auth.delete of any app); the answers of one app
 * also when its auth.me says that nobody is signed in there (a session that ended). Nothing is kept of SavMail (its mail is never written on a device),
 * of downloads and files (only JSON) and of the routes listed in SKIP. SavDocuments, SavSpreadsheets, SavBooks and
 * SavPresentations are left alone: they keep their own copies, and edit offline.
 *
 * Writing: the apps that edit offline keep their own queue (see their store.js); a POST is never queued here.
 */
(() => {
  const PREFIX = 'sodata-';
  const nobody = {};
  const MAX = 4 * 1048576;
  // never kept: the mail, account exports, what a download or a public link answers, the small pictures (kept elsewhere)
  const SKIP = /[?&]r=(auth\.export|file\.|folder\.zip|pub\.|photos\.(thumbs?|pub\.|export|album\.zip)|ml\.|img\b|media\b)/;
  // SavMail never writes mail on a device; the four editors keep their own copies offline (IndexedDB, their store.js)
  const NEVER = ['savmail', 'savdocuments', 'savspreadsheets', 'savbooks', 'savpresentations'];
  const appOf = (u) => u.pathname.split('/').filter(Boolean)[0] || '';
  // what was kept of the account: the answers, and the changes waiting for the network (offline-keep.js)
  // (a session that just ended keeps the changes waiting: they leave after the next sign-in, and the server refuses
  // them for any other account; signing out on purpose deletes them too)
  const forget = (all = true) => Promise.all([caches.keys().then((k) => Promise.all(k.filter((x) => x.startsWith(PREFIX)).map((x) => caches.delete(x)))),
    all ? new Promise((r) => { try { const q = indexedDB.deleteDatabase('savoffice-offline'); q.onsuccess = q.onerror = q.onblocked = () => r(); } catch { r(); } }) : null]);
  const tell = (e) => self.clients.get(e.clientId || e.resultingClientId || '').then((c) => c?.postMessage({ savoffice: 'offline' })).catch(() => {});

  async function read(e, u) {
    const cache = await caches.open(PREFIX + appOf(u));
    try {
      const res = await fetch(e.request);
      const type = res.headers.get('Content-Type') || '';
      if (res.ok && type.includes('json') && +(res.headers.get('Content-Length') || 0) <= MAX) {
        const copy = res.clone();
        // nobody signed in any more: what was kept goes
        // (only the answers of that app: the apps also ask SavDrive, where one may not be signed in; and after a while:
        // at the start an app may ask before the session shared by SavSchedules has reached it)
        if (/[?&]r=auth\.me\b/.test(u.search)) {
          const a = appOf(u);
          copy.clone().json().then((d) => { clearTimeout(nobody[a]); if (!d?.user) nobody[a] = setTimeout(() => caches.delete(PREFIX + a), 12000); }).catch(() => {});
        }
        copy.blob().then((b) => { if (b.size <= MAX) cache.put(e.request, new Response(b, { status: res.status, headers: { 'Content-Type': type, 'X-SavOffice-Kept': new Date().toISOString() } })); }).catch(() => {});
      }
      return res;
    } catch (err) {
      const kept = await cache.match(e.request);
      tell(e);
      if (kept) {
        const h = new Headers(kept.headers);
        h.set('X-SavOffice-Offline', '1');
        return new Response(await kept.blob(), { status: kept.status, headers: h });
      }
      return Response.error(); // never kept: the same network error as without this file, which every app already shows
    }
  }

  self.SavOfficeData = {
    /** true when this request was answered here (the caller then returns) */
    handle(e) {
      const u = new URL(e.request.url);
      if (u.origin !== location.origin || !u.pathname.includes('/api/')) return false;
      if (e.request.method === 'POST') {
        // signing out (or deleting the account) in any app: nothing of the account stays in this browser
        if (/[?&]r=(auth\.logout|auth\.delete)\b/.test(u.search)) e.waitUntil(forget());
        return false;
      }
      if (e.request.method !== 'GET' || NEVER.includes(appOf(u)) || SKIP.test(u.search)) return false;
      e.respondWith(read(e, u));
      return true;
    },
    forget,
  };
})();
