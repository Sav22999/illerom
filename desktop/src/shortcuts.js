/*
 * SavOffice for Mac — an icon for every installed app, in ~/Applications/SavOffice/ (Launchpad, Spotlight and the Dock
 * find it there). Each one is a tiny app of its own (its icon, a script) that only asks SavOffice to open the app:
 * savoffice://open/<slug>. Made on this Mac, so macOS opens it without asking.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { app } = require('electron');
const { catalog } = require('./store');

const dir = () => path.join(os.homedir(), 'Applications', 'SavOffice');
const bundleOf = (a) => path.join(dir(), a.name + '.app');
const icnsOf = (slug) => (app.isPackaged ? path.join(process.resourcesPath, 'apps', slug + '.icns') : path.join(__dirname, '..', 'build', 'apps', slug + '.icns'));

function create(slug) {
  const a = catalog.find((x) => x.slug === slug);
  if (!a) return;
  const b = bundleOf(a);
  fs.mkdirSync(path.join(b, 'Contents', 'MacOS'), { recursive: true });
  fs.mkdirSync(path.join(b, 'Contents', 'Resources'), { recursive: true });
  const icns = icnsOf(slug);
  const hasIcon = fs.existsSync(icns);
  if (hasIcon) fs.copyFileSync(icns, path.join(b, 'Contents', 'Resources', 'icon.icns'));
  fs.writeFileSync(path.join(b, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${a.name}</string>
  <key>CFBundleDisplayName</key><string>${a.name}</string>
  <key>CFBundleIdentifier</key><string>eu.illerom.savoffice.${slug}</string>
  <key>CFBundleExecutable</key><string>open-${slug}</string>
  ${hasIcon ? '<key>CFBundleIconFile</key><string>icon</string>' : ''}
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
</dict>
</plist>
`);
  const exe = path.join(b, 'Contents', 'MacOS', 'open-' + slug);
  // to SavOffice by its identifier (it works even if another app took savoffice://), then by the address alone
  fs.writeFileSync(exe, `#!/bin/sh\n# Opens ${a.name} in SavOffice\n/usr/bin/open -b eu.illerom.savoffice "savoffice://open/${slug}" 2>/dev/null || /usr/bin/open "savoffice://open/${slug}"\n`);
  fs.chmodSync(exe, 0o755);
  // Finder and the Dock read the icon again
  const now = new Date();
  try { fs.utimesSync(b, now, now); } catch { /* not important */ }
}

function remove(slug) {
  const a = catalog.find((x) => x.slug === slug);
  if (a) fs.rmSync(bundleOf(a), { recursive: true, force: true });
  try { if (!fs.readdirSync(dir()).some((n) => n.endsWith('.app'))) fs.rmSync(dir(), { recursive: true, force: true }); } catch { /* not there */ }
}

/** Makes the icons match the installed apps (on: one each; off: none). */
function sync(on, installedSlugs) {
  for (const a of catalog) {
    try {
      if (on && installedSlugs.includes(a.slug)) { if (!fs.existsSync(bundleOf(a))) create(a.slug); } else remove(a.slug);
    } catch { /* a folder that cannot be written: no icon */ }
  }
}

module.exports = { create, remove, sync, dir };
