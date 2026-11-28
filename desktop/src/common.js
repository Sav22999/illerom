/*
 * SavOffice for Mac — what the Toolbox and the apps have in common: the words of the menus, the windows of the apps and
 * where their links go (an app of the suite: its own window, or its own app; Google and SavAccount sign-in: here; the
 * rest of the web: the browser), the right-click menu.
 */
const path = require('path');
const { app, BrowserWindow, Menu, shell, nativeTheme, screen, clipboard } = require('electron');
const { ORIGIN, SLUGS, catalog, slugOf } = require('./store');
const settings = require('./settings');

/** Windows and Linux show the icon of the window (the taskbar, the dock): the one of the app; macOS takes the app's own. */
const iconFor = (slug) => (process.platform === 'darwin' ? undefined
  : path.join(app.isPackaged ? path.join(process.resourcesPath, 'apps') : path.join(__dirname, '..', 'build', 'apps'), `${slug}.png`));
const lang = () => { const l = settings.get('lang'); return l === 'it' || l === 'en' ? l : ((app.getPreferredSystemLanguages?.()[0] || app.getLocale() || '').toLowerCase().startsWith('it') ? 'it' : 'en'); };
const W = {
  it: { settings: 'Impostazioni…', show: 'Mostra SavOffice', apps: 'App', none: 'Nessuna app installata', view: 'Vista', file: 'File', edit: 'Modifica', window: 'Finestra', help: 'Aiuto',
    site: 'SavOffice sul web', source: 'Codice sorgente', check: 'Controlla aggiornamenti', cut: 'Taglia', copy: 'Copia', paste: 'Incolla', all: 'Seleziona tutto', link: 'Copia link', openLink: 'Apri link nel browser',
    image: 'Copia immagine', about: 'Informazioni su', quit: 'Esci da', hide: 'Nascondi', missing: '{app} non è installata', missing_t: 'Aprila da SavOffice per installarla di nuovo.', open_so: 'Apri SavOffice', ok: 'OK' },
  en: { settings: 'Settings…', show: 'Show SavOffice', apps: 'Apps', none: 'No app installed', view: 'View', file: 'File', edit: 'Edit', window: 'Window', help: 'Help',
    site: 'SavOffice on the web', source: 'Source code', check: 'Check for updates', cut: 'Cut', copy: 'Copy', paste: 'Paste', all: 'Select all', link: 'Copy link', openLink: 'Open link in browser',
    image: 'Copy image', about: 'About', quit: 'Quit', hide: 'Hide', missing: '{app} is not installed', missing_t: 'Open it from SavOffice to install it again.', open_so: 'Open SavOffice', ok: 'OK' },
};
const t = (k, v = {}) => W[lang()][k].replace(/\{(\w+)\}/g, (m, x) => v[x] ?? m);
const nameOf = (slug) => catalog.find((a) => a.slug === slug)?.name || slug;
const isGoogle = (u) => /(^|\.)google\.com$|(^|\.)gstatic\.com$/.test(u.hostname);
/** SavAccount: signing in with it goes there and comes back to the app, in the same window */
const isSavAccount = (u) => /(^|\.)savaccount\.eu$/.test(u.hostname);

/**
 * Signing in with SavAccount happens in a window of its own, in a session of its own (persist:signin) where serve.js does
 * not answer: there the pages of savaccount.eu are asked by the browser itself, with the headers it adds (Sec-Fetch-Site,
 * Origin), which SavAccount checks — passed through serve.js they would come from "another site" and SavAccount refuses
 * them ("Not allowed"). When SavAccount sends back to the app (its callback, on the site of the apps), that window closes
 * and the window of the app opens the callback: the session of the suite is born there, with the cookies of the app.
 */
const SIGNIN_PARTITION = 'persist:signin';
function openProvider(url, owner) {
  const parent = BrowserWindow.fromWebContents(owner);
  const win = new BrowserWindow({
    width: 520, height: 760, minWidth: 380, minHeight: 520, parent: parent || undefined, show: false, autoHideMenuBar: true, title: 'SavAccount',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#14171c' : '#ffffff',
    webPreferences: { partition: SIGNIN_PARTITION, contextIsolation: true, sandbox: true },
  });
  win.once('ready-to-show', () => win.show());
  // back to the site of the apps: in the window of the app, not here
  const back = (e, to) => {
    let u;
    try { u = new URL(to); } catch { return false; }
    if (u.origin !== ORIGIN) return false;
    e.preventDefault();
    if (!owner.isDestroyed()) owner.loadURL(to);
    setTimeout(() => { if (!win.isDestroyed()) win.close(); }, 50);
    return true;
  };
  win.webContents.on('will-redirect', back);
  win.webContents.on('will-navigate', (e, to) => {
    if (back(e, to)) return;
    let u;
    try { u = new URL(to); } catch { e.preventDefault(); return; }
    if (!isSavAccount(u) && !isGoogle(u)) { e.preventDefault(); if (/^https?:/.test(u.protocol)) shell.openExternal(to); }
  });
  win.webContents.setWindowOpenHandler(({ url: to }) => { if (/^https?:/.test(to)) shell.openExternal(to); return { action: 'deny' }; });
  win.loadURL(url);
  return win;
}

/**
 * What the pages of the apps lose on the Mac: the footer of the site at the bottom of every app (footer.credit: Privacy,
 * Terms, Illerom, the version, the language) and of the forms to fill in (footer.ffoot). The site stays as it is.
 */
const APP_CSS = 'footer.credit, footer.ffoot { display: none !important; }';

/**
 * The windows of the apps. openOther(slug, url): a link to another app of the suite — true when it took care of it
 * (its own window or its own app), false to follow it in the same window.
 */
function makeWindows({ store, openOther }) {
  const appWindows = new Map(); // webContents.id → { win, slug } (a window can move to another app: SavDrive → SavDocuments)
  const slugOfWindow = (win) => { try { return slugOf(new URL(win.webContents.getURL()).pathname); } catch { return ''; } };
  const windowsOf = (slug) => [...appWindows.values()].filter((x) => x.slug === slug).map((x) => x.win);
  const events = { closed: () => {}, changed: () => {} };

  function boundsFor(slug) {
    const saved = settings.get('windows')[slug];
    const area = screen.getPrimaryDisplay().workAreaSize;
    const b = { width: Math.min(1320, area.width - 80), height: Math.min(880, area.height - 60) };
    if (saved && screen.getDisplayMatching(saved)) return { ...b, ...saved };
    return b;
  }

  function openApp(slug, address) {
    const url = address || `${ORIGIN}/${slug}/`;
    const same = windowsOf(slug)[0];
    if (same && !address) { if (same.isMinimized()) same.restore(); same.show(); same.focus(); return same; }
    const win = new BrowserWindow({
      ...boundsFor(slug), minWidth: 380, minHeight: 480, show: false, title: nameOf(slug), icon: iconFor(slug), autoHideMenuBar: process.platform !== 'darwin',
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#14171c' : '#ffffff',
      webPreferences: { preload: path.join(__dirname, 'app-preload.js'), contextIsolation: true, sandbox: true, spellcheck: true },
    });
    const id = win.webContents.id;
    appWindows.set(id, { win, slug });
    win.webContents.on('did-navigate', () => {
      const now = slugOfWindow(win), was = appWindows.get(id)?.slug;
      if (now && now !== was && SLUGS.has(now)) {
        appWindows.set(id, { win, slug: now });
        if (was && !windowsOf(was).length) events.closed(was);
        events.changed();
      }
    });
    win.once('ready-to-show', () => win.show());
    const remember = () => { if (!win.isDestroyed() && !win.isMinimized() && !win.isFullScreen()) settings.set({ windows: { ...settings.get('windows'), [appWindows.get(id)?.slug || slug]: win.getBounds() } }); };
    win.on('resized', remember);
    win.on('moved', remember);
    win.on('closed', () => {
      const was = appWindows.get(id)?.slug;
      appWindows.delete(id);
      if (was && !windowsOf(was).length) events.closed(was);
      events.changed();
    });
    guard(win.webContents);
    // more room for the app: no footer of the site (Privacy, Terms, version…) in the apps installed on the Mac
    win.webContents.on('dom-ready', () => win.webContents.insertCSS(APP_CSS).catch(() => {}));
    win.loadURL(url);
    events.changed();
    return win;
  }

  /** Where the links of a window go. */
  function guard(wc) {
    wc.setWindowOpenHandler(({ url }) => {
      let u;
      try { u = new URL(url); } catch { return { action: 'deny' }; }
      if (url === 'about:blank' || u.protocol === 'blob:') return { action: 'allow' };
      if (u.origin === ORIGIN && SLUGS.has(slugOf(u.pathname))) {
        const to = slugOf(u.pathname);
        if (!openOther(to, url)) openApp(to, url);
        return { action: 'deny' };
      }
      if (isSavAccount(u)) { openProvider(url, wc); return { action: 'deny' }; }
      if (isGoogle(u)) return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true } };
      if (/^https?:|^mailto:/.test(u.protocol)) shell.openExternal(url);
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => {
      let u;
      try { u = new URL(url); } catch { e.preventDefault(); return; }
      if (u.origin === ORIGIN && SLUGS.has(slugOf(u.pathname))) {
        // another app of the suite (SavDrive opening a document in SavDocuments): installed, in its own window or app;
        // not installed, here, from the network
        const to = slugOf(u.pathname), from = appWindows.get(wc.id)?.slug;
        if (from && to !== from && openOther(to, url)) e.preventDefault();
        return;
      }
      if (isSavAccount(u)) { e.preventDefault(); openProvider(url, wc); return; } // in its own session (openProvider)
      if (isGoogle(u)) return;
      e.preventDefault();
      if (/^https?:|^mailto:/.test(u.protocol)) shell.openExternal(url);
    });
    wc.on('did-create-window', (child) => guard(child.webContents));
    wc.on('context-menu', (e, p) => {
      const items = [];
      if (p.misspelledWord) {
        for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
        if (items.length) items.push({ type: 'separator' });
      }
      if (p.linkURL && /^https?:/.test(p.linkURL)) items.push({ label: t('openLink'), click: () => shell.openExternal(p.linkURL) }, { label: t('link'), click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' });
      if (p.mediaType === 'image') items.push({ label: t('image'), click: () => wc.copyImageAt(p.x, p.y) }, { type: 'separator' });
      if (p.isEditable) items.push({ role: 'cut', label: t('cut'), enabled: p.editFlags.canCut }, { role: 'copy', label: t('copy'), enabled: p.editFlags.canCopy }, { role: 'paste', label: t('paste'), enabled: p.editFlags.canPaste }, { role: 'selectAll', label: t('all') });
      else if (p.selectionText) items.push({ role: 'copy', label: t('copy') });
      if (!items.length) return;
      Menu.buildFromTemplate(items).popup();
    });
  }

  return { appWindows, windowsOf, openApp, guard, events };
}

/** Permissions the apps may ask for, and the browser they look like (some sites, Google sign-in, refuse "Electron"). */
function prepareSession(session) {
  session.defaultSession.setPermissionRequestHandler((wc, permission, done) => done(['notifications', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'media', 'fileSystem', 'persistent-storage', 'window-management'].includes(permission)));
}

module.exports = { lang, t, nameOf, iconFor, isGoogle, isSavAccount, makeWindows, prepareSession };
