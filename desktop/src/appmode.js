/*
 * SavOffice — one app of the suite as an app of its own (SavDocuments.app on macOS, a shortcut or a .desktop file on Windows
 * and Linux, made by bundles.js): its windows, its menu, its icon in the Dock or the taskbar. The Toolbox installs and updates it; here it only reads what the Toolbox installed:
 *   - its files from HOME/apps/<slug> (serve.js), read again when the Toolbox switches version (it does so only when the
 *     app is closed, or when asked to "update and reload": then the windows reload);
 *   - the session of the suite from session-sync.js (signed in anywhere, signed in here);
 *   - while it runs, HOME/Profiles/<slug>/running.json says so to the Toolbox.
 * A link to another installed app opens that app; "All the apps" in the SavOffice button opens the Toolbox. When its last
 * window closes the app quits, so that the Toolbox can update it.
 */
const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell, dialog } = require('electron');
const env = require('./env');
const { Store, ORIGIN, SLUGS, slugOf } = require('./store');
const { serve } = require('./serve');
const bundles = require('./bundles');
const sync = require('./session-sync');
const { t, nameOf, makeWindows, prepareSession } = require('./common');

const slug = env.APP;
const NAME = nameOf(slug);
app.setName(NAME); // also the class of its windows on Linux (StartupWMClass of its .desktop file)
// its own place in the taskbar (Windows: the AppUserModelID of its shortcut) or in the dock (Linux: its .desktop file)
if (process.platform === 'win32') app.setAppUserModelId(bundles.BID + slug);
if (process.platform === 'linux') app.setDesktopName(`${bundles.PREFIX}${slug}.desktop`);
const QUIT = process.argv.includes('--savoffice-quit'); // a message for a running app: nothing to open here

const store = new Store();
store.isOpen = () => true; // the Toolbox decides; here nothing switches by itself
store.autoUpdate = () => false;
const urlOf = (argv) => { const v = (argv.find((a) => a.startsWith('--savoffice-url=')) || '').slice(16); try { return v && new URL(v).origin === ORIGIN ? v : null; } catch { return null; } };

const windows = makeWindows({
  store,
  // another app of the suite: installed, that app opens it; this one, here
  openOther: (to, url) => {
    if (to === slug) return false;
    if (!store.installed(to)) return false;
    bundles.launch(to, url).catch(() => {});
    return true;
  },
});
const show = (url) => {
  const target = url ? slugOf(new URL(url).pathname) : slug;
  return windows.openApp(SLUGS.has(target) ? target : slug, url || undefined);
};

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: NAME, submenu: [{ role: 'about', label: `${t('about')} ${NAME}` }, { type: 'separator' }, { label: t('open_so'), click: () => bundles.openToolbox() },
      { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide', label: `${t('hide')} ${NAME}` }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit', label: `${t('quit')} ${NAME}` }] },
    { label: t('file'), submenu: [{ role: 'close' }] },
    { label: t('edit'), role: 'editMenu' },
    { label: t('view'), submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: t('window'), role: 'windowMenu' },
    { label: t('help'), role: 'help', submenu: [{ label: t('site'), click: () => shell.openExternal(`${ORIGIN}/savoffice/${slug}/`) }] },
  ]));
}

// the SavOffice button of the pages (app-preload.js): the apps installed on this Mac, open one, show the Toolbox
ipcMain.on('desk-installed', (e) => { e.returnValue = [...SLUGS].filter((s) => store.installed(s)); });
ipcMain.handle('desk-open', (e, to) => { if (to === slug) show(); else if (SLUGS.has(to) && store.installed(to)) bundles.launch(to).catch(() => {}); });
ipcMain.handle('desk-toolbox', () => bundles.openToolbox());
ipcMain.on('desk-style', (e) => { e.returnValue = require('./settings').style(); });

/*
 * Files of the Mac opened with this app ("Open With", a double click on its own format): macOS gives them here, also before
 * the start. Each one goes to the window of the app, whose page takes it as an installed web app does (launchQueue,
 * app-preload.js) and opens it as a file of the device.
 */
const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', xls: 'application/vnd.ms-excel', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  csv: 'text/csv', ics: 'text/calendar', vcf: 'text/vcard', vcard: 'text/vcard', epub: 'application/epub+zip', pdf: 'application/pdf', md: 'text/markdown', json: 'application/json' };
const MAX_FILE = 500 * 1048576;
const toOpen = [];
let appReady = false;
async function openFiles() {
  if (!appReady || !toOpen.length) return;
  const win = windows.windowsOf(slug)[0] || show();
  if (win.isMinimized()) win.restore();
  win.focus();
  const send = async () => {
    while (toOpen.length) {
      const file = toOpen.shift();
      try {
        const st = await fs.promises.stat(file);
        if (!st.isFile() || st.size > MAX_FILE) continue;
        const ext = path.extname(file).slice(1).toLowerCase();
        win.webContents.send('desk-open-file', { name: path.basename(file), type: MIME[ext] || '', mtime: st.mtimeMs, bytes: await fs.promises.readFile(file) });
      } catch { /* gone, or not readable */ }
    }
  };
  if (win.webContents.isLoading()) win.webContents.once('did-finish-load', send); else send();
}
app.on('open-file', (e, file) => { e.preventDefault(); toOpen.push(file); openFiles(); }); // macOS
/** Windows and Linux give the files as arguments: after "--" (bundles-other.js), or any argument that is a file. */
function filesOf(argv) {
  const i = argv.indexOf('--');
  const list = i >= 0 ? argv.slice(i + 1) : argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-'));
  return list.filter((f) => { try { return path.isAbsolute(f) && fs.statSync(f).isFile(); } catch { return false; } });
}

if (!app.requestSingleInstanceLock() || QUIT) app.quit(); // one process per app (its profile); asked to quit and not running: done
else {
  app.on('second-instance', (e, argv) => {
    if (argv.includes('--savoffice-quit')) { app.quit(); return; } // the Toolbox asks (to remove or update it)
    const files = process.platform === 'darwin' ? [] : filesOf(argv);
    if (files.length) { toOpen.push(...files); openFiles(); return; }
    const url = urlOf(argv);
    if (url) show(url);
    else { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus(); } else show(); }
  });

  app.whenReady().then(async () => {
    app.setAboutPanelOptions({ applicationName: NAME, applicationVersion: app.getVersion(), copyright: '© Saverio Morelli · illerom.eu · SavOffice', website: `${ORIGIN}/${slug}/` });
    protocol.handle(new URL(ORIGIN).protocol.replace(':', ''), serve(store));
    prepareSession(session);
    await store.load();
    // all the apps installed (links to them, the SavOffice button); this one must be
    if (!store.installed(slug)) {
      await dialog.showMessageBox({ type: 'info', message: t('missing', { app: NAME }), detail: t('missing_t'), buttons: [t('open_so')] });
      await bundles.openToolbox();
      app.quit();
      return;
    }
    bundles.markRunning(slug);
    buildMenu();
    // the session of the others first, then the window (it opens already signed in)
    await Promise.race([sync.start({ onSignedOut: () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.reload(); } }), new Promise((r) => setTimeout(r, 1500))]);
    // a file opened at the start: the window opens anyway, then gets it
    show(urlOf(process.argv));
    if (process.platform !== 'darwin') toOpen.push(...filesOf(process.argv));
    appReady = true;
    openFiles();
    // the Toolbox switched version (asked to "update and reload"), or installed / removed an app: read it again
    fs.watch(path.join(env.HOME, 'apps'), { recursive: true }, (ev, name) => {
      if (!name || !name.endsWith('state.json')) return;
      const s = name.split(path.sep)[0];
      if (!SLUGS.has(s)) return;
      clearTimeout(watchTimers[s]);
      watchTimers[s] = setTimeout(async () => {
        if ((await store.reload(s)) && s === slug && store.installed(slug)) for (const w of BrowserWindow.getAllWindows()) w.webContents.reload();
      }, 300);
    });
  });
  const watchTimers = {};
  // the style chosen in the Toolbox (HOME/settings.json): at once in the open windows
  let lastStyle = null;
  app.whenReady().then(() => {
    lastStyle = require('./settings').style();
    try {
      fs.watch(env.HOME, (ev, name) => {
        if (name !== 'settings.json') return;
        clearTimeout(watchTimers._style);
        watchTimers._style = setTimeout(() => {
          const now = require('./settings').style();
          if (now === lastStyle) return;
          lastStyle = now;
          for (const w of BrowserWindow.getAllWindows()) w.webContents.send('desk-style', now);
        }, 200);
      });
    } catch { /* no watching: the next opening reads it */ }
  });

  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) show(); });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => bundles.markStopped(slug));
}
