/*
 * SavOffice for Mac — every request of the windows passes here (protocol.handle on the scheme of the site).
 *
 *   - the files of an installed app (pages, scripts, styles, typefaces, its sw.js): from its bundle on the disk, so the
 *     app is always the version installed, with or without a connection. A file the bundle does not have yet is asked to
 *     the network and kept in the bundle (offline it is a network error, and the service worker of the app answers
 *     with its own copy if it has one).
 *   - files shared by the apps (/assets/, /identity/…): from the bundle of the app that asks for them (the Referer),
 *     or from any installed app that has them.
 *   - everything else (the API, other sites, the apps not installed): the network, exactly as in a browser.
 *
 * The service workers of the apps keep working as on the web: the answers of the API kept for offline
 * (../../assets/savoffice/offline-sw.js), sign-out deleting everything, the changes waiting for the network. Their requests
 * pass here too, so the copies they keep are the ones of the installed version.
 */
const { session } = require('electron');
const { ORIGIN, SLUGS, slugOf, keyOf } = require('./store');

const fs = require('fs');
const path = require('path');
/** tests only (a separate profile, SAVOFFICE_USERDATA): with the file "offline-test" in it, the network is gone */
const env = require('./env');
const cut = () => env.testing && fs.existsSync(path.join(env.HOME, 'offline-test'));
const passthrough = async (req) => {
  if (cut()) throw new TypeError('offline (test)');
  return session.defaultSession.fetch(req, { bypassCustomProtocolHandlers: true });
};
const reply = (f, extra = {}) => new Response(f.body, { status: 200, headers: { 'Content-Type': f.type, 'Cache-Control': 'no-cache', 'X-SavOffice-Installed': '1', ...extra } });

function serve(store) {
  /** The bundle that answers for this address, and the key of the file in it. */
  function where(u, referer) {
    const p = u.pathname;
    const slug = slugOf(p);
    if (SLUGS.has(slug)) {
      const b = store.installed(slug);
      if (!b) return null;
      // the page of the app, whatever follows "?": the pages never change with the address (the routes are after #)
      const key = p === `/${slug}/` || p === `/${slug}/index.php` || p === `/${slug}` ? keyOf(`${ORIGIN}/${slug}/`) : keyOf(u.href);
      return { b, key };
    }
    // shared by the apps: first the app asking, then any installed app that has the file
    const key = keyOf(u.href);
    let from = null;
    try { from = referer ? slugOf(new URL(referer).pathname) : null; } catch { /* no referer */ }
    const mine = SLUGS.has(from) ? store.installed(from) : null;
    if (mine?.has(key)) return { b: mine, key };
    for (const s of SLUGS) { const b = store.installed(s); if (b?.has(key)) return { b, key }; }
    return mine ? { b: mine, key } : null; // kept in the bundle of who asked, once it arrives
  }

  return async (req) => {
    let u;
    try { u = new URL(req.url); } catch { return passthrough(req); }
    if (u.origin !== ORIGIN || req.method !== 'GET' || u.pathname.includes('/api/') || req.headers.get('range')) return passthrough(req).catch(() => Response.error());
    const w = where(u, req.headers.get('referer'));
    if (!w) return passthrough(req).catch(() => Response.error());
    const kept = await w.b.read(w.key);
    if (kept) return reply(kept);
    // not in the bundle yet: from the network, and kept for the next time
    try {
      const res = await passthrough(req);
      const len = +(res.headers.get('content-length') || 0);
      if (res.ok && res.status === 200 && len <= 40 * 1048576 && !/no-store/.test(res.headers.get('cache-control') || '')) {
        const type = res.headers.get('content-type') || 'application/octet-stream';
        const body = Buffer.from(await res.arrayBuffer());
        w.b.put(w.key, body, type).catch(() => {});
        const h = new Headers(res.headers);
        h.delete('content-encoding'); // the body is already decoded
        h.delete('content-length');
        return new Response(body, { status: 200, headers: h });
      }
      return res;
    } catch {
      // offline: the same file with another query, as the service workers do (ignoreSearch); otherwise a network error
      const loose = w.b.loose(w.key);
      const f = loose && (await w.b.read(loose));
      return f ? reply(f) : Response.error();
    }
  };
}

module.exports = { serve, passthrough, cut };
