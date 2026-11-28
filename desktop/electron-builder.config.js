/*
 * SavOffice — how electron-builder makes the packages: the "build" of package.json (macOS: the DMG and the ZIP), plus
 * Windows (an installer for the person, no administrator: SavOffice-Setup-x64.exe) and Linux (SavOffice-x64.deb for Debian
 * and Ubuntu, SavOffice-x64.rpm for Fedora). On Windows and Linux SavOffice is registered for the files the apps open
 * (src/filetypes.json, from their manifests, by tools/prepare.js) and gives each file to its app (toolbox.js); the own
 * format of an app (.savdoc…) gets its icon.
 *   npx electron-builder --config electron-builder.config.js --win nsis --x64
 *   npx electron-builder --config electron-builder.config.js --linux deb rpm --x64
 */
const path = require('path');
const pkg = require('./package.json');

let filetypes = {};
try { filetypes = require('./src/filetypes.json'); } catch { /* tools/prepare.js writes it */ }
const owner = (slug) => 'sav' + slug.slice(3, 6);
const seen = new Set();
const associations = [];
// own formats first (each by its own app), then the common ones once (SavOffice decides which app opens them)
for (const own of [true, false]) {
  for (const [slug, list] of Object.entries(filetypes)) {
    for (const { ext, mime } of list) {
      if ((ext === owner(slug)) !== own || seen.has(ext)) continue;
      seen.add(ext);
      associations.push({ ext, ...(mime ? { mimeType: mime } : {}), name: own ? `${slug}.${ext}` : `SavOffice.${ext}`, description: own ? `${slug} (.${ext})` : `.${ext}`,
        role: 'Editor', ...(own ? { icon: path.join('apps', slug) } : {}) });
    }
  }
}

module.exports = {
  ...pkg.build,
  extraResources: [{ from: 'build/apps', to: 'apps', filter: ['*.icns', '*.png', '*.ico'] }],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'build/icon.ico',
    artifactName: 'SavOffice-Setup-${arch}.${ext}',
    fileAssociations: associations,
  },
  nsis: {
    oneClick: true, perMachine: false, createDesktopShortcut: true, createStartMenuShortcut: true, shortcutName: 'SavOffice',
    deleteAppDataOnUninstall: false, artifactName: 'SavOffice-Setup-${arch}.${ext}',
  },
  linux: {
    target: [{ target: 'deb', arch: ['x64'] }, { target: 'rpm', arch: ['x64'] }],
    icon: 'build/icons', category: 'Office', executableName: 'savoffice', maintainer: 'Saverio Morelli <https://www.illerom.eu>',
    vendor: 'Saverio Morelli', synopsis: 'The apps of SavOffice, installed one by one, working offline',
    description: 'SavOffice installs the apps of SavOffice (documents, spreadsheets, presentations, calendar, drive…) one by one; each works without a connection and syncs when the network is back.',
    desktop: { entry: { StartupWMClass: 'SavOffice' } }, artifactName: 'SavOffice-x64.${ext}', fileAssociations: associations,
  },
  // what Electron needs: the usual list of electron-builder, plus the graphics buffers and the sound it also wants
  // (libasound2t64 first: on Ubuntu 24.04 "libasound2" alone may bring the OSS imitation, without the symbols of ALSA)
  deb: { artifactName: 'SavOffice-x64.${ext}', depends: ['libgtk-3-0', 'libnotify4', 'libnss3', 'libxss1', 'libxtst6', 'xdg-utils', 'libatspi2.0-0', 'libuuid1', 'libsecret-1-0', 'libgbm1', 'libasound2t64 | libasound2', 'desktop-file-utils', 'shared-mime-info'] },
  rpm: { artifactName: 'SavOffice-x64.${ext}', depends: ['gtk3', 'libnotify', 'nss', 'libXScrnSaver', 'libXtst', 'xdg-utils', 'at-spi2-core', 'libuuid', 'libsecret', 'mesa-libgbm', 'alsa-lib', 'desktop-file-utils', 'shared-mime-info'] },
};
