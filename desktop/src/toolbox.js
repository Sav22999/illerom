/*
 * SavOffice for Mac — the Toolbox (SavOffice.app): installs the apps of SavOffice one by one, keeps them up to date and
 * opens them. Each installed app is an app of its own (bundles.js: SavDocuments.app… in ~/Applications/SavOffice, its own
 * process, Dock icon and menu); with "separate" off, or while developing, the apps open as windows of SavOffice.
 * See ../README.md.
 *
 *   store.js         the installed versions: install, look for updates, download, switch when the app is closed
 *   serve.js         what the windows load: the installed files, or the network
 *   bundles.js       the apps of their own; whether one is running
 *   session-sync.js  one sign-in for the Toolbox and every app
 *   shortcuts.js     (apps as windows) icons in ~/Applications/SavOffice that open them here
 *   launcher/        the window of the Toolbox (SavComponents), talking to this file through preload.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell, net, nativeTheme } = require('electron');
const { Store, ORIGIN, SLUGS, catalog, keyOf } = require('./store');
const { serve, cut } = require('./serve');
const settings = require('./settings');
const MAC = process.platform === 'darwin';
// the little apps that open an app as a window of SavOffice: only on macOS (on Windows and Linux the apps of their own are
// shortcuts already, bundles-other.js)
const shortcuts = MAC ? require('./shortcuts') : { create() {}, remove() {}, sync() {}, dir: () => bundles.dir() };
const bundles = require('./bundles');
const sync = require('./session-sync');
const updater = require('./updater');
const { lang, t, iconFor, makeWindows, prepareSession } = require('./common');

app.setName('SavOffice');
const store = new Store();
let launcher = null;
let online = true;
let ready = false;
const pending = []; // savoffice:// addresses that arrived before the start

/** Each app an app of its own (a packaged SavOffice.app), or windows of SavOffice. */
const separate = () => settings.get('separate') !== false && bundles.supported();
const installedSlugs = () => [...SLUGS].filter((s) => store.installed(s));

const windows = makeWindows({
  store,
  // a link to another app of the suite: installed, to that app (its own, or a window here)
  openOther: (to, url) => {
    if (!store.installed(to)) return false;
    if (separate()) bundles.launch(to, url).catch(() => {});
    else windows.openApp(to, url);
    return true;
  },
});
windows.events.closed = (slug) => store.closed(slug).catch(() => {});
windows.events.changed = () => store.changed();
store.isOpen = (slug) => windows.windowsOf(slug).length > 0 || bundles.running(slug);
store.autoUpdate = () => settings.get('autoUpdate');
// SavOffice itself (updater.js): same automatic updates; the apps of their own quit before it is replaced
updater.autoUpdate = () => settings.get('autoUpdate');
updater.beforeInstall = async () => {
  for (const slug of installedSlugs()) if (bundles.running(slug)) await bundles.quit(slug);
  for (let i = 0; i < 20 && installedSlugs().some((s) => bundles.running(s)); i++) await new Promise((r) => setTimeout(r, 250));
};
updater.on('change', () => store.changed());

/** The files an installed app opens: the file_handlers of its manifest (bundles.js writes them into its Info.plist). */
async function typesOf(slug) {
  const b = store.installed(slug);
  const f = b && (await b.read(keyOf(`${ORIGIN}/${slug}/manifest.webmanifest`)));
  if (!f) return [];
  const seen = new Map();
  try {
    for (const h of JSON.parse(f.body.toString('utf8')).file_handlers || []) {
      for (const [mime, exts] of Object.entries(h.accept || {})) for (const e of exts) {
        const ext = String(e).replace(/^\./, '').toLowerCase();
        if (/^[a-z0-9]{1,10}$/.test(ext) && !seen.has(ext)) seen.set(ext, { ext, mime: /^[\w.+-]+\/[\w.+-]+$/.test(mime) ? mime : '' });
      }
    }
  } catch { return []; }
  return [...seen.values()].sort((a, b) => a.ext.localeCompare(b.ext));
}
bundles.setTypesProvider(typesOf);
// a new version may open other files: its app of its own is made again (only when it is not running)
store.on('updated', (slug) => { if (separate() && !bundles.running(slug)) bundles.ensure(slug).catch(() => {}); });

/** Opens an installed app: its own app, or a window here. */
async function open(slug, url) {
  if (!store.installed(slug)) return false;
  if (separate() && (await bundles.launch(slug, url).catch(() => false))) return true;
  windows.openApp(slug, url);
  return true;
}

// the apps of their own run in other processes: when one is closed, what waited for it (an update) can go on
const wasRunning = new Set();
setInterval(() => {
  let changed = false;
  for (const slug of installedSlugs()) {
    const now = bundles.running(slug);
    if (now !== wasRunning.has(slug)) {
      changed = true;
      if (now) wasRunning.add(slug);
      else { wasRunning.delete(slug); if (!windows.windowsOf(slug).length) store.closed(slug).catch(() => {}); }
    }
  }
  if (changed) store.changed();
}, 3000);

/* ------------------------------------------------------------------ the account (one for the whole suite) */

/*
 * The apps of SavOffice share one account and one session: the cookie savoffice_auth, on the path of every app
 * (../../identity/suite.php), the same in every process (session-sync.js). Signing in once — in the Toolbox or in any
 * app — signs in all of them. The Toolbox asks who is signed in to SavSchedules (the owner of the accounts) and keeps the
 * name and the address for when there is no connection.
 */
const ACCOUNT_API = `${ORIGIN}/savschedules/api/`;
let account = settings.get('account') || null; // {name, email, picture} | {} ; kept for offline
let accountKnown = false; // asked the server at least once since the start
let signinWin = null;

async function refreshAccount() {
  try {
    const r = await session.defaultSession.fetch(ACCOUNT_API + '?r=auth.me', { bypassCustomProtocolHandlers: true, credentials: 'include', cache: 'no-store' });
    const d = await r.json();
    const was = account?.email || null;
    account = d?.user ? { name: d.user.name, email: d.user.email, picture: d.user.picture || null } : null;
    accountKnown = true;
    settings.set({ account: account || {} });
    if ((account?.email || null) !== was) accountChanged(was, account?.email || null);
    store.changed();
    return d?.csrf || null;
  } catch {
    return null; // offline: what was known stays
  }
}

/** Signed in or out: the window of the sign-in closes, the windows of the apps here read the session again. */
function accountChanged(was, now) {
  if (now && signinWin && !signinWin.isDestroyed()) setTimeout(() => signinWin?.close(), 600);
  if (was !== now) for (const { win } of windows.appWindows.values()) if (!win.isDestroyed()) win.webContents.reload();
}

/** The sign-in (or sign-up) page of the apps, in a window of its own: email and password, or SavAccount. */
function openSignin(mode = 'signin') {
  if (signinWin && !signinWin.isDestroyed()) { signinWin.focus(); return; }
  const slug = installedSlugs()[0] || 'savdrive';
  signinWin = new BrowserWindow({
    width: 520, height: 760, minWidth: 380, minHeight: 520, title: lang() === 'it' ? 'Accedi a SavOffice' : 'Sign in to SavOffice',
    parent: launcher && !launcher.isDestroyed() ? launcher : undefined, show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14171c' : '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  signinWin.once('ready-to-show', () => signinWin.show());
  signinWin.on('closed', () => { signinWin = null; refreshAccount(); });
  windows.guard(signinWin.webContents);
  signinWin.loadURL(`${ORIGIN}/${slug}/#/${mode === 'signup' ? 'signup' : 'signin'}`);
}

/*
 * SavAccount in the browser: passkeys (Touch ID, the iCloud Keychain) work only in the browsers Apple allows, not here.
 * The browser opens the page of the suite that signs in (with SavAccount when needed) and then opens
 * savoffice://signed-in?code=…&n=… : a code for one use, for minutes, given only with the nonce made here.
 * The Toolbox exchanges it for a session of its own (../../identity/suite.php, auth.handoff / auth.handoff.redeem),
 * which session-sync.js gives to every app.
 */
let handoff = null; // { nonce, at, error }
const HANDOFF_MS = 15 * 60e3;
const handoffWaiting = () => !!handoff && !handoff.error && Date.now() - handoff.at < HANDOFF_MS;

function signinBrowser() {
  handoff = { nonce: crypto.randomBytes(16).toString('hex'), at: Date.now(), error: null };
  shell.openExternal(`${ACCOUNT_API}?r=auth.handoff&n=${handoff.nonce}`);
  store.changed();
}

async function redeemHandoff(u) {
  const code = u.searchParams.get('code') || '', n = u.searchParams.get('n') || '';
  showLauncher();
  app.focus({ steal: true });
  // only the answer to the request made here, and only while it is fresh
  if (!handoff || !/^[a-f0-9]{64}$/.test(code) || n.length !== handoff.nonce.length || !crypto.timingSafeEqual(Buffer.from(n), Buffer.from(handoff.nonce)) || Date.now() - handoff.at > HANDOFF_MS) {
    if (handoff) handoff.error = 'expired';
    store.changed();
    return;
  }
  try {
    const r = await session.defaultSession.fetch(ACCOUNT_API + '?r=auth.handoff.redeem', { method: 'POST', bypassCustomProtocolHandlers: true, credentials: 'include',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, n }) });
    const d = await r.json().catch(() => ({}));
    if (!d.ok) throw new Error(d.error || 'failed');
    handoff = null;
    await refreshAccount();
  } catch (e) {
    handoff = { ...(handoff || {}), error: /expired/.test(e.message) ? 'expired' : 'failed' };
  }
  store.changed();
}

/** Signs out of every app: the session goes (in every process, session-sync.js), and what was kept for working offline. */
async function signOut() {
  const csrf = await refreshAccount();
  if (csrf) {
    try {
      await session.defaultSession.fetch(ACCOUNT_API + '?r=auth.logout', { method: 'POST', bypassCustomProtocolHandlers: true, credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: '{}' });
    } catch { /* offline: the cookie goes all the same */ }
  }
  for (const c of await session.defaultSession.cookies.get({ name: sync.AUTH })) await session.defaultSession.cookies.remove(`${ORIGIN}${c.path || '/'}`, sync.AUTH).catch(() => {});
  await session.defaultSession.clearStorageData({ origin: ORIGIN, storages: ['cachestorage', 'indexdb', 'localstorage'] }).catch(() => {});
  const was = account?.email || null;
  account = null;
  settings.set({ account: {} });
  accountChanged(was, null);
  store.changed();
}

/* ------------------------------------------------------------------ the window of the Toolbox */

function showLauncher(view) {
  if (launcher && !launcher.isDestroyed()) {
    if (launcher.isMinimized()) launcher.restore();
    launcher.show(); launcher.focus();
    if (view) launcher.webContents.send('view', view);
    return launcher;
  }
  launcher = new BrowserWindow({
    width: 1120, height: 760, minWidth: 420, minHeight: 520, show: false, title: 'SavOffice',
    // macOS: the traffic lights over the header of the page; Windows and Linux: their own frame, the menu hidden (Alt)
    ...(MAC ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 20 } } : { autoHideMenuBar: true, icon: iconFor('savoffice') }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14171c' : '#f6f4f9',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  launcher.once('ready-to-show', () => launcher.show());
  launcher.on('closed', () => { launcher = null; });
  launcher.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  launcher.webContents.on('will-navigate', (e) => e.preventDefault());
  launcher.loadFile(path.join(__dirname, 'launcher', 'index.html'), view ? { hash: view } : undefined);
  return launcher;
}

const snapshot = () => ({
  apps: store.snapshot(), catalog, settings: { ...settings.all(), windows: undefined, account: undefined }, online, lang: lang(), lastCheck: store.lastCheck,
  checking: !!store.checking, version: app.getVersion(), shortcutsDir: shortcuts.dir(), separateSupported: bundles.supported(), selfUpdate: { ...updater.state, enabled: updater.enabled },
  account: account?.email ? account : null, accountKnown, handoff: handoffWaiting() ? 'waiting' : handoff?.error || null,
});
let pushTimer = null;
store.on('change', () => {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (launcher && !launcher.isDestroyed()) launcher.webContents.send('state', snapshot());
    buildMenu();
  }, 60);
});
store.on('installed', (slug) => {
  if (separate()) bundles.ensure(slug).catch(() => {});
  else if (settings.get('shortcuts')) try { shortcuts.create(slug); } catch { /* no icon */ }
});
store.on('removed', (slug) => { bundles.remove(slug).catch(() => {}); try { shortcuts.remove(slug); } catch { /* not there */ } });

/** The icons in ~/Applications/SavOffice: the apps of their own, or (apps as windows) the little apps that open them here. */
async function syncIcons() {
  await bundles.tidy();
  const list = installedSlugs();
  if (separate()) {
    shortcuts.sync(false, list);
    for (const slug of list) await bundles.ensure(slug).catch(() => {});
  } else {
    for (const slug of list) if (bundles.exists(slug) && !bundles.running(slug)) await bundles.remove(slug).catch(() => {});
    shortcuts.sync(settings.get('shortcuts'), list);
  }
}

// the windows of the apps opened here (app-preload.js): which apps are on this Mac, open one, show the Toolbox
ipcMain.on('desk-installed', (e) => { e.returnValue = installedSlugs(); });
ipcMain.on('desk-style', (e) => { e.returnValue = settings.style(); });
ipcMain.handle('desk-open', (e, slug) => { if (SLUGS.has(slug)) open(slug); });
ipcMain.handle('desk-toolbox', () => { showLauncher('all'); });
// the window of the Toolbox (preload.js)
ipcMain.handle('state', () => snapshot());
ipcMain.handle('install', (e, slug) => store.install(slug).then(() => true));
ipcMain.handle('open', (e, slug) => open(slug));
ipcMain.handle('browser', (e, slug) => shell.openExternal(`${ORIGIN}/${slug}/`));
ipcMain.handle('remove', async (e, slug) => {
  for (const w of windows.windowsOf(slug)) w.close();
  if (bundles.running(slug)) {
    await bundles.quit(slug);
    for (let i = 0; i < 20 && bundles.running(slug); i++) await new Promise((r) => setTimeout(r, 250));
  }
  await store.remove(slug);
  return true;
});
ipcMain.handle('reinstall', (e, slug) => store.reinstall(slug).then(() => true));
/**
 * Update: with the app closed it downloads and switches at once. With the app open, how says what to do:
 *   undefined → { open: true } (the Toolbox asks) · 'close' → it switches when the app is closed · 'now' → it switches and
 *   the app reloads (its windows here; an app of its own sees the switch by itself, appmode.js)
 */
ipcMain.handle('update', async (e, slug, how) => {
  const st = store.apps.get(slug);
  if (!st) return false;
  if (store.isOpen(slug) && !how) return { open: true };
  if (!st.staged || store.available(slug)) await store.stage(slug);
  if (store.isOpen(slug) && how === 'close') { st.applyOnClose = true; await store.writeState(slug); store.changed(); return true; }
  await store.activate(slug);
  for (const w of windows.windowsOf(slug)) w.webContents.reload();
  return true;
});
ipcMain.handle('update-all', async () => {
  for (const a of store.snapshot().filter((x) => x.update && !x.open && !x.busy)) {
    try { if (!store.apps.get(a.slug).staged || store.available(a.slug)) await store.stage(a.slug); await store.activate(a.slug); } catch { /* shown on its card */ }
  }
  return true;
});
ipcMain.handle('check', () => Promise.all([store.check(), updater.check()]).then(() => true));
ipcMain.handle('self-download', () => updater.download());
ipcMain.handle('self-install', () => updater.install(true));
ipcMain.handle('settings', async (e, patch) => {
  const before = settings.all();
  const was = { shortcuts: before.shortcuts, autoUpdate: before.autoUpdate, separate: before.separate };
  settings.set(patch || {});
  if (('shortcuts' in (patch || {}) && patch.shortcuts !== was.shortcuts) || ('separate' in (patch || {}) && patch.separate !== was.separate)) syncIcons().catch(() => {});
  if (patch?.autoUpdate && !was.autoUpdate) store.check().catch(() => {});
  // the style: at once in the windows of the apps here (the apps of their own read the settings file by themselves)
  if ('style' in (patch || {})) for (const { win } of windows.appWindows.values()) if (!win.isDestroyed()) win.webContents.send('desk-style', settings.style());
  store.changed();
  return true;
});
ipcMain.handle('reveal', () => shell.openPath(separate() ? bundles.dir() : shortcuts.dir()));
ipcMain.handle('signin', (e, mode) => openSignin(mode));
ipcMain.handle('signin-browser', () => signinBrowser());
ipcMain.handle('signin-browser-cancel', () => { handoff = null; store.changed(); });
ipcMain.handle('signout', () => signOut());
ipcMain.handle('account', () => refreshAccount().then(() => account));
ipcMain.handle('external', (e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

/* ------------------------------------------------------------------ menus */

function buildMenu() {
  const installed = catalog.filter((a) => store.installed(a.slug));
  const appItems = installed.length ? installed.map((a) => ({ label: a.name, click: () => open(a.slug) })) : [{ label: t('none'), enabled: false }];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'SavOffice', submenu: [{ role: 'about' }, { type: 'separator' }, { label: t('settings'), accelerator: 'Cmd+,', click: () => showLauncher('settings') },
      { label: t('check'), click: () => store.check() }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { label: t('file'), submenu: [{ label: t('show'), accelerator: 'Cmd+Shift+L', click: () => showLauncher() }, { type: 'separator' }, { role: 'close' }] },
    { label: t('edit'), role: 'editMenu' },
    { label: t('view'), submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: t('apps'), submenu: appItems },
    { label: t('window'), role: 'windowMenu' },
    { label: t('help'), role: 'help', submenu: [{ label: t('site'), click: () => shell.openExternal(`${ORIGIN}/savoffice/`) }, { label: t('source'), click: () => shell.openExternal('https://github.com/Sav22999/illerom/tree/main/desktop') }] },
  ]));
  app.dock?.setMenu(Menu.buildFromTemplate([{ label: t('show'), click: () => showLauncher() }, { type: 'separator' }, ...installed.map((a) => ({ label: a.name, click: () => open(a.slug) }))]));
}

/* ------------------------------------------------------------------ savoffice:// (the icons of the apps as windows) */

/*
 * Windows and Linux: what macOS gives through events comes as arguments of SavOffice — the files registered by the
 * installer (a double click, "Open with") and the savoffice:// addresses (the browser after SavAccount). A file goes to
 * the installed app that opens it (its own format first): to its app of its own.
 */
async function openArguments(argv) {
  const url = argv.find((a) => a.startsWith('savoffice://'));
  if (url) { openAddress(url); return true; }
  if (MAC) return false;
  const files = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-') && path.isAbsolute(a) && fs.existsSync(a) && fs.statSync(a).isFile());
  if (!files.length) return false;
  for (const file of files) {
    const ext = path.extname(file).slice(1).toLowerCase();
    let to = null;
    for (const slug of installedSlugs()) {
      const types = await typesOf(slug);
      if (types.some((x) => x.ext === ext)) { to = slug; if (bundles.ownExt(slug) === ext) break; }
    }
    if (!to) { showLauncher(); continue; }
    if (separate()) await bundles.openFiles(to, [file]); else open(to);
  }
  return true;
}

function openAddress(url) {
  if (!ready) { pending.push(url); return; }
  let u;
  try { u = new URL(url); } catch { return; }
  if (u.hostname === 'signed-in') { redeemHandoff(u); return; } // the browser, after SavAccount
  const slug = (u.hostname === 'open' ? u.pathname.split('/')[1] : u.hostname) || '';
  // ?u=: an address of that app (an app asked for it: a document opened from SavDrive…), only of the site of the apps
  let address = null;
  try { const a = new URL(u.searchParams.get('u') || ''); if (a.origin === ORIGIN) address = a.href; } catch { /* none */ }
  if (SLUGS.has(slug) && store.installed(slug)) open(slug, address || undefined);
  else showLauncher();
}

/* ------------------------------------------------------------------ start */

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', async (e, argv) => { if (!(await openArguments(argv))) showLauncher(); });
  app.on('open-url', (e, url) => { e.preventDefault(); openAddress(url); });
  if (!app.isDefaultProtocolClient('savoffice')) app.setAsDefaultProtocolClient('savoffice');

  app.whenReady().then(async () => {
    // started with "npm start" the Dock would show the icon of Electron: the one of SavOffice (drawn by tools/brand.js)
    if (!app.isPackaged) { const png = path.join(__dirname, '..', 'build', 'icon.png'); if (fs.existsSync(png)) app.dock?.setIcon(png); }
    app.setAboutPanelOptions({ applicationName: 'SavOffice', applicationVersion: app.getVersion(), copyright: '© Saverio Morelli · illerom.eu', website: `${ORIGIN}/savoffice/` });
    protocol.handle(new URL(ORIGIN).protocol.replace(':', ''), serve(store));
    prepareSession(session);
    await store.load();
    // switches kept aside from the last time, for the apps that are not open
    for (const slug of SLUGS) { const st = store.apps.get(slug); if (st.staged && !store.isOpen(slug) && (settings.get('autoUpdate') || st.applyOnClose)) await store.activate(slug).catch(() => {}); }
    buildMenu();
    ready = true;
    if (pending.length) pending.splice(0).forEach(openAddress);
    else if (!(await openArguments(process.argv))) showLauncher();

    sync.start();
    // who is signed in, again only when the session really changes: the answers of the apps set the same cookie again on
    // every path (SavSchedules shares its session at every auth.me), and asking at each of those would never end
    let lastToken, cookieTimer = null;
    const token = async () => (await session.defaultSession.cookies.get({ name: sync.AUTH })).find((c) => c.value)?.value || null;
    lastToken = await token();
    session.defaultSession.cookies.on('changed', (e, cookie) => {
      if (cookie.name !== sync.AUTH) return;
      clearTimeout(cookieTimer);
      cookieTimer = setTimeout(async () => { const now = await token(); if (now !== lastToken) { lastToken = now; refreshAccount(); } }, 400);
    });
    refreshAccount();
    syncIcons().catch(() => {}); // the apps of their own again after an update of SavOffice
    online = net.isOnline() && !cut();
    if (online) store.check().catch(() => {});
    if (online) setTimeout(() => updater.check(), 8000); // SavOffice itself, after the start
    // back online: look for updates (the apps send their waiting changes by themselves); then every checkHours
    setInterval(() => {
      const now = net.isOnline() && !cut();
      if (now !== online) { online = now; store.changed(); if (now) { store.check().catch(() => {}); updater.check(); } }
    }, 15000);
    setInterval(() => { if (online && Date.now() - store.lastCheck >= settings.get('checkHours') * 3600e3) { store.check().catch(() => {}); updater.check(); } }, 10 * 60e3);
  });

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) showLauncher(); });
  app.on('window-all-closed', () => { /* on the Mac the app stays in the Dock, and keeps the apps up to date */ });
  // a new SavOffice downloaded: with automatic updates on, it is installed when SavOffice quits (opened again next time)
  app.on('before-quit', (e) => {
    if (updater.state.status === 'ready' && settings.get('autoUpdate') && !updater.installing) { e.preventDefault(); updater.install(false); }
  });
}
