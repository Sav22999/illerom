/*
 * SavOffice for Mac — every installed app as an app of its own: ~/Applications/SavOffice/SavDocuments.app… A clone of
 * SavOffice.app (APFS copies it without using space) with its own name, icon and identifier (eu.illerom.savoffice.app.<slug>)
 * and the key SavOfficeApp, which tells the code inside to be that app (env.js). macOS gives it its own place in the
 * Dock, in ⌘Tab, in Launchpad and in Spotlight. Signed again "ad hoc" here, on this Mac, so it opens without questions.
 *
 * The clone is made again when SavOffice.app changes (the key SavOfficeToolbox: its version and the date of its code).
 * Only from a packaged SavOffice.app: while developing the apps open as windows of SavOffice.
 * Whether an app is open: it writes HOME/Profiles/<slug>/running.json with its pid while it runs.
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { app } = require('electron');
const env = require('./env');
const { catalog } = require('./store');

// tests (env.testing): the apps in a folder and with identifiers of their own, never mixed with the real ones of this Mac
const BID = env.testing ? 'eu.illerom.savoffice.test.app.' : 'eu.illerom.savoffice.app.';
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const dir = () => path.join(os.homedir(), 'Applications', env.testing ? 'SavOffice-test' : 'SavOffice');
const nameOf = (slug) => catalog.find((a) => a.slug === slug)?.name || slug;
const bundleOf = (slug) => path.join(dir(), nameOf(slug) + '.app');
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err, out, errOut) => (err ? reject(new Error(`${cmd}: ${String(errOut || err.message).trim()}`)) : resolve(out))));
const toolbox = () => (app.isPackaged ? path.resolve(process.execPath, '../../..') : null);
const icnsOf = (slug) => (app.isPackaged ? path.join(process.resourcesPath, 'apps', slug + '.icns') : path.join(__dirname, '..', 'build', 'apps', slug + '.icns'));

/** The version of SavOffice and the date of its code: different only when SavOffice.app was replaced. */
function stamp() {
  let t = 0;
  // original-fs: the fs of Electron sees app.asar as a folder and gives it a made-up date, different at every start (that
  // made every app again at every start)
  try { t = Math.floor(require('original-fs').statSync(path.join(process.resourcesPath, 'app.asar')).mtimeMs); } catch { /* development */ }
  return `${app.getVersion()}+${t}`;
}
const keyOf = (bundle, k) => { try { return (fs.readFileSync(path.join(bundle, 'Contents', 'Info.plist'), 'utf8').match(new RegExp('<key>' + k + '</key>\\s*<string>([^<]*)</string>')) || [])[1] || null; } catch { return null; } };

/** Whether this SavOffice can make apps of their own (a packaged SavOffice.app). */
const supported = () => !!toolbox();
// an app is there when its Info.plist is (a copy stopped halfway has none)
const exists = (slug) => fs.existsSync(path.join(bundleOf(slug), 'Contents', 'Info.plist'));

/** Copies left halfway by an interrupted making (older than ten minutes): removed. */
async function tidy() {
  let names = [];
  try { names = await fsp.readdir(dir()); } catch { return; }
  for (const n of names.filter((x) => /\.making-\d+\.app$/.test(x))) {
    const p = path.join(dir(), n);
    try { if (Date.now() - (await fsp.stat(p)).mtimeMs > 10 * 60e3) await fsp.rm(p, { recursive: true, force: true }); } catch { /* gone */ }
  }
}

const making = new Map();
/** Makes (or makes again) the app of a slug; true when it is there and up to date. */
function ensure(slug, force = false) {
  if (!supported()) return Promise.resolve(false);
  if (!force && keyOf(bundleOf(slug), 'SavOfficeToolbox') === stamp()) return Promise.resolve(true);
  if (making.has(slug)) return making.get(slug);
  console.log('SavOffice: making the app', slug, force ? '(forced)' : `(${keyOf(bundleOf(slug), 'SavOfficeToolbox') || 'new'} → ${stamp()})`);
  const job = (async () => {
    const dst = bundleOf(slug);
    const tmp = dst.replace(/\.app$/, '') + `.making-${Date.now()}.app`;
    await fsp.mkdir(dir(), { recursive: true });
    try {
      await run('/bin/cp', ['-cR', toolbox(), tmp]).catch(() => run('/usr/bin/ditto', [toolbox(), tmp])); // a clone where the disk can (APFS)
      const plist = path.join(tmp, 'Contents', 'Info.plist');
      const set = (k, v) => run('/usr/bin/plutil', ['-replace', k, '-string', v, plist]);
      await set('CFBundleName', nameOf(slug));
      await set('CFBundleDisplayName', nameOf(slug));
      await set('CFBundleIdentifier', BID + slug);
      await set('SavOfficeApp', slug);
      await set('SavOfficeToolbox', stamp());
      if (env.testing) { await set('SavOfficeHome', env.HOME); await set('SavOfficeOrigin', env.ORIGIN); }
      if (fs.existsSync(icnsOf(slug))) { await fsp.copyFile(icnsOf(slug), path.join(tmp, 'Contents', 'Resources', 'app-icon.icns')); await set('CFBundleIconFile', 'app-icon.icns'); }
      for (const k of ['CFBundleURLTypes', 'CFBundleIconName']) await run('/usr/bin/plutil', ['-remove', k, plist]).catch(() => {}); // savoffice:// stays with the Toolbox
      // Electron finds its helpers by the name of the app ("<CFBundleName> Helper (GPU).app"…): renamed as electron-builder does
      const fw = path.join(tmp, 'Contents', 'Frameworks');
      for (const h of (await fsp.readdir(fw)).filter((n) => /^SavOffice Helper.*\.app$/.test(n))) {
        const name = h.replace(/^SavOffice/, nameOf(slug)).replace(/\.app$/, '');
        const hp = path.join(fw, h);
        await fsp.rename(path.join(hp, 'Contents', 'MacOS', h.replace(/\.app$/, '')), path.join(hp, 'Contents', 'MacOS', name));
        const hplist = path.join(hp, 'Contents', 'Info.plist');
        await run('/usr/bin/plutil', ['-replace', 'CFBundleExecutable', '-string', name, hplist]);
        await run('/usr/bin/plutil', ['-replace', 'CFBundleName', '-string', name, hplist]);
        const hid = (await run('/usr/bin/plutil', ['-extract', 'CFBundleIdentifier', 'raw', hplist]).catch(() => '')).trim();
        if (hid) await run('/usr/bin/plutil', ['-replace', 'CFBundleIdentifier', '-string', hid.replace(env.TOOLBOX_ID, BID + slug), hplist]);
        await fsp.rename(hp, path.join(fw, name + '.app'));
      }
      await run('/usr/bin/xattr', ['-cr', tmp]).catch(() => {}); // no quarantine, nothing codesign refuses
      await run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', tmp]);
      await fsp.rm(dst, { recursive: true, force: true });
      await fsp.rename(tmp, dst);
      await run(LSREGISTER, ['-f', dst]).catch(() => {});
      return true;
    } catch (e) {
      await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
      console.error('SavOffice: the app', slug, 'could not be made:', e.message);
      return false;
    } finally {
      making.delete(slug);
    }
  })();
  making.set(slug, job);
  return job;
}

async function remove(slug) {
  await fsp.rm(bundleOf(slug), { recursive: true, force: true }).catch(() => {});
  await run(LSREGISTER, ['-u', bundleOf(slug)]).catch(() => {});
  try { if (!fs.readdirSync(dir()).some((n) => n.endsWith('.app'))) fs.rmSync(dir(), { recursive: true, force: true }); } catch { /* not there */ }
}

/* -------------------------------------------------- running */

const pidFile = (slug) => path.join(env.HOME, 'Profiles', slug, 'running.json');
function running(slug) {
  try {
    const { pid } = JSON.parse(fs.readFileSync(pidFile(slug), 'utf8'));
    process.kill(pid, 0); // throws when the process is not there
    return true;
  } catch { return false; }
}
function markRunning(slug) {
  fs.mkdirSync(path.dirname(pidFile(slug)), { recursive: true });
  fs.writeFileSync(pidFile(slug), JSON.stringify({ pid: process.pid, at: Date.now() }));
}
function markStopped(slug) { try { fs.unlinkSync(pidFile(slug)); } catch { /* gone */ } }

/** Opens an app (an address of it, when given: then a running app gets it too, through its single-instance lock). */
async function launch(slug, url) {
  if (env.APP) {
    // an app opening another (its SavOffice button, a link): it never makes apps — inside a clone the stamp of SavOffice is
    // not its own, and it would clone itself. The app is there: opened; it is not: the Toolbox opens it (and makes it).
    if (!exists(slug)) {
      await run('/usr/bin/open', ['-b', env.TOOLBOX_ID, `savoffice://open/${slug}` + (url ? `?u=${encodeURIComponent(url)}` : '')]);
      return true;
    }
  } else if (!(await ensure(slug))) return false;
  const args = url ? ['--args', `--savoffice-url=${url}`] : [];
  await run('/usr/bin/open', [...(url && running(slug) ? ['-n'] : []), '-b', BID + slug, ...args]);
  return true;
}

/** Asks a running app to quit, as ⌘Q does (it closes its windows the normal way). */
const quit = (slug) => run('/usr/bin/osascript', ['-e', `tell application id "${BID + slug}" to quit`]).catch(() => {});

const openToolbox = () => run('/usr/bin/open', ['-b', env.TOOLBOX_ID]).catch(() => run('/usr/bin/open', ['-a', 'SavOffice']).catch(() => {}));

module.exports = { supported, ensure, remove, exists, tidy, launch, quit, running, markRunning, markStopped, openToolbox, dir, bundleOf, BID };
