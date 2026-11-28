/*
 * SavOffice for Windows and Linux — every installed app as an app of its own (the same functions as bundles-mac.js).
 * Nothing is copied: each app is SavOffice itself started with --savoffice-app=<slug>, in a process and a profile of its own
 * (env.js, appmode.js), with an entry that gives it its own name and icon:
 *   Windows  a shortcut in Start › SavOffice whose AppUserModelID is eu.illerom.savoffice.app.<slug>: the app sets the same
 *            id (appmode.js), so the taskbar shows it apart, with its icon. The files it opens are registered by the
 *            installer for SavOffice, which hands each file to the right app (toolbox.js).
 *   Linux    ~/.local/share/applications/savoffice-<slug>.desktop: its name, icon, window class (StartupWMClass, the name
 *            the app gives its windows) and the files it opens (MimeType: "Open With"); its own format (.savdoc…) gets a
 *            MIME type of its own (~/.local/share/mime) of which it is the default app.
 * Whether an app is running: HOME/Profiles/<slug>/running.json with its pid, as on macOS.
 */
const fs = require('original-fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app, shell } = require('electron');
const env = require('./env');
const { catalog } = require('./store');

const IS_WIN = process.platform === 'win32';
const BID = env.testing ? 'eu.illerom.savoffice.test.app.' : 'eu.illerom.savoffice.app.';
const PREFIX = env.testing ? 'savoffice-test-' : 'savoffice-';
const nameOf = (slug) => catalog.find((a) => a.slug === slug)?.name || slug;
const wordsOf = (slug) => catalog.find((a) => a.slug === slug)?.en || {};
const ownExt = (slug) => 'sav' + slug.slice(3, 6); // savdocuments → savdoc

let typesOf = async () => [];
const setTypesProvider = (fn) => { typesOf = fn; };

/** The program: the installed SavOffice (an AppImage runs from its own file); while developing, Electron with this folder. */
const exe = () => process.env.APPIMAGE || process.execPath;
const baseArgs = () => (app.isPackaged ? [] : [app.getAppPath()]);
const testArgs = () => (env.testing ? [`--savoffice-home=${env.HOME}`, `--savoffice-origin=${env.ORIGIN}`] : []);
const iconOf = (slug, ext) => path.join(app.isPackaged ? path.join(process.resourcesPath, 'apps') : path.join(__dirname, '..', 'build', 'apps'), slug + ext);
const run = (cmd, args) => new Promise((resolve) => execFile(cmd, args, () => resolve()));

const dir = () => (IS_WIN
  ? path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', env.testing ? 'SavOffice-test' : 'SavOffice')
  : path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'applications'));
const entryOf = (slug) => (IS_WIN ? path.join(dir(), nameOf(slug) + '.lnk') : path.join(dir(), `${PREFIX}${slug}.desktop`));
const mimeDir = () => path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'mime');

const supported = () => true;
const exists = (slug) => fs.existsSync(entryOf(slug));
const tidy = async () => {};

/** Windows: an argument of a shortcut, quoted when it has spaces. Linux: a word of an Exec line of a .desktop file. */
const winArg = (a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
const deskArg = (a) => `"${String(a).replace(/(["`$\\])/g, '\\$1')}"`;

/** Makes (or makes again: the place of SavOffice may change) the entry of an app; true when it is there. */
async function ensure(slug) {
  const types = await typesOf(slug).catch(() => []);
  await fsp.mkdir(dir(), { recursive: true });
  const args = [...baseArgs(), `--savoffice-app=${slug}`, ...testArgs()];
  if (IS_WIN) {
    return shell.writeShortcutLink(entryOf(slug), exists(slug) ? 'replace' : 'create', {
      target: exe(), args: args.map(winArg).join(' '), cwd: path.dirname(exe()), appUserModelId: BID + slug,
      icon: iconOf(slug, '.ico'), iconIndex: 0, description: `${nameOf(slug)} · SavOffice`,
    });
  }
  // Linux: the icon where it stays (the place of SavOffice may change, an AppImage above all)
  const icon = path.join(env.HOME, 'icons', `${slug}.png`);
  await fsp.mkdir(path.dirname(icon), { recursive: true });
  await fsp.copyFile(iconOf(slug, '.png'), icon).catch(() => {});
  const own = types.filter((t) => t.ext === ownExt(slug) && t.mime);
  const mimes = [...new Set(types.map((t) => t.mime).filter(Boolean))];
  const w = wordsOf(slug);
  await fsp.writeFile(entryOf(slug), [
    '[Desktop Entry]', 'Type=Application', `Name=${nameOf(slug)}`, w.short ? `GenericName=${w.short}` : '', w.tag ? `Comment=${w.tag}` : '',
    `Exec=${[exe(), ...args].map(deskArg).join(' ')} %F`, `Icon=${icon}`, 'Terminal=false', 'Categories=Office;',
    `StartupWMClass=${nameOf(slug)}`, mimes.length ? `MimeType=${mimes.join(';')};` : '', `X-SavOffice-App=${slug}`, '',
  ].filter((l) => l !== '').join('\n') + '\n', { mode: 0o755 });
  // its own format: a MIME type of its own (by the extension), of which it is the app chosen
  if (own.length) {
    const pkg = path.join(mimeDir(), 'packages', `${PREFIX}${slug}.xml`);
    await fsp.mkdir(path.dirname(pkg), { recursive: true });
    await fsp.writeFile(pkg, `<?xml version="1.0" encoding="UTF-8"?>\n<mime-info xmlns="http://www.freedesktop.org/standards/shared-mime-info">\n${own.map((t) =>
      `  <mime-type type="${t.mime}"><comment>${nameOf(slug)} (.${t.ext})</comment><glob pattern="*.${t.ext}"/></mime-type>`).join('\n')}\n</mime-info>\n`);
    await run('update-mime-database', [mimeDir()]);
    for (const t of own) await run('xdg-mime', ['default', path.basename(entryOf(slug)), t.mime]);
  }
  await run('update-desktop-database', [dir()]);
  return true;
}

async function remove(slug) {
  await fsp.rm(entryOf(slug), { force: true }).catch(() => {});
  if (!IS_WIN) {
    await fsp.rm(path.join(env.HOME, 'icons', `${slug}.png`), { force: true }).catch(() => {});
    const pkg = path.join(mimeDir(), 'packages', `${PREFIX}${slug}.xml`);
    if (fs.existsSync(pkg)) { await fsp.rm(pkg, { force: true }).catch(() => {}); await run('update-mime-database', [mimeDir()]); }
    await run('update-desktop-database', [dir()]);
  }
}

/** SavOffice again, detached: an app (--savoffice-app), a message to a running one (its single-instance lock gets it), the Toolbox. */
function spawnSavOffice(args) {
  const ci = env.ci ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : []; // test containers run as root
  spawn(exe(), [...baseArgs(), ...ci, ...args, ...testArgs()], { detached: true, stdio: 'ignore', env: process.env }).unref();
}

/** Opens an app (an address of it, when given; a running app gets it through its single-instance lock). */
async function launch(slug, url) {
  if (!env.APP && !exists(slug)) await ensure(slug); // only the Toolbox makes entries
  spawnSavOffice([`--savoffice-app=${slug}`, ...(url ? [`--savoffice-url=${url}`] : [])]);
  return true;
}

/** Opens files with an app (appmode.js reads them after "--"). */
async function openFiles(slug, files) {
  spawnSavOffice([`--savoffice-app=${slug}`, '--', ...files]);
  return true;
}

/** Asks a running app to quit, as closing it does (appmode.js: --savoffice-quit). */
async function quit(slug) {
  if (running(slug)) spawnSavOffice([`--savoffice-app=${slug}`, '--savoffice-quit']);
}

const openToolbox = async () => spawnSavOffice([]);

/* -------------------------------------------------- running (as on macOS) */

const pidFile = (slug) => path.join(env.HOME, 'Profiles', slug, 'running.json');
function running(slug) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(pidFile(slug), 'utf8'));
    process.kill(pid, 0);
    return true;
  } catch { return false; }
}
function markRunning(slug) {
  fs.mkdirSync(path.dirname(pidFile(slug)), { recursive: true });
  fs.writeFileSync(pidFile(slug), JSON.stringify({ pid: process.pid, at: Date.now() }));
}
function markStopped(slug) { try { fs.unlinkSync(pidFile(slug)); } catch { /* gone */ } }

module.exports = { supported, ensure, setTypesProvider, remove, exists, tidy, openFiles, ownExt, launch, quit, running, markRunning, markStopped, openToolbox, dir, bundleOf: entryOf, BID, PREFIX };
