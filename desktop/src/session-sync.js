/*
 * SavOffice for Mac — one sign-in for the Toolbox and every app, although each runs in a process (and a browser profile)
 * of its own. The session of the suite is the cookie savoffice_auth (../../identity/suite.php); its value is kept in
 * HOME/session.json (readable only by this user, as the cookies of a browser are): whoever sees the cookie change — a
 * sign-in or a sign-out in any app, or in the Toolbox — writes it there, and every other process puts the same cookie
 * in its own profile. A sign-out also deletes what that process kept for working offline, as on the web.
 */
const fs = require('fs');
const path = require('path');
const { session } = require('electron');
const { ORIGIN, HOME } = require('./env');
const { catalog } = require('./store');

const AUTH = 'savoffice_auth';
const FILE = path.join(HOME, 'session.json');
const PATHS = catalog.map((a) => `/${a.slug}/`);

const read = () => { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return null; } };
function write(x) {
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(x), { mode: 0o600 });
  fs.renameSync(FILE + '.tmp', FILE);
}

/** onSignedOut(): this process was signed out by another one (its offline copies are already deleted). */
function start({ onSignedOut, onChange } = {}) {
  const ses = session.defaultSession;
  const mine = async () => (await ses.cookies.get({ name: AUTH })).find((c) => c.value) || null;

  async function apply(f) {
    const cur = await mine();
    const want = f?.token || null;
    if ((cur?.value || null) === want) return;
    if (want) {
      for (const p of PATHS) {
        await ses.cookies.set({ url: ORIGIN + p, name: AUTH, value: want, path: p, httpOnly: true, secure: ORIGIN.startsWith('https:'), sameSite: 'lax',
          expirationDate: f.expires || Math.floor(Date.now() / 1000) + 30 * 86400 }).catch(() => {});
      }
    } else {
      for (const c of await ses.cookies.get({ name: AUTH })) await ses.cookies.remove(ORIGIN + (c.path || '/'), AUTH).catch(() => {});
      if (cur) {
        await ses.clearStorageData({ origin: ORIGIN, storages: ['cachestorage', 'indexdb', 'localstorage'] }).catch(() => {});
        onSignedOut?.();
      }
    }
    onChange?.();
  }

  // at the start: the file wins; with no file yet (the first time) what this process has goes into it
  const first = (async () => {
    const f = read();
    if (f) await apply(f);
    else { const c = await mine(); write({ token: c?.value || null, expires: c?.expirationDate || null, at: Date.now() }); }
  })();

  let t1 = null, t2 = null;
  ses.cookies.on('changed', (e, cookie) => {
    if (cookie.name !== AUTH) return;
    clearTimeout(t1);
    t1 = setTimeout(async () => {
      const c = await mine();
      if ((read()?.token || null) !== (c?.value || null)) write({ token: c?.value || null, expires: c?.expirationDate || null, at: Date.now() });
    }, 300);
  });
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.watch(HOME, (ev, name) => {
      if (name !== 'session.json') return;
      clearTimeout(t2);
      t2 = setTimeout(() => apply(read()), 150);
    });
  } catch { /* no watching: the next start reads it */ }
  return first; // resolved once this process has the session of the others
}

module.exports = { start, AUTH };
