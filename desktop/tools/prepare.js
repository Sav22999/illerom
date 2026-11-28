/*
 * SavOffice for Mac — copies into src/ what the Toolbox takes from the rest of the repository, so the app works on its
 * own: SavComponents (../assets/sav/), the icons of the apps (../<slug>/icons/) and the mark of SavOffice. With --catalog it
 * also writes src/catalog.json again from the data of the site (tools/catalog.php, needs php).
 *   node tools/prepare.js [--catalog]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const here = path.join(__dirname, '..');
const root = path.join(here, '..');
const src = path.join(here, 'src');

if (process.argv.includes('--catalog') || !fs.existsSync(path.join(src, 'catalog.json'))) {
  try {
    execFileSync('php', [path.join(__dirname, 'catalog.php')], { stdio: ['ignore', 'inherit', 'ignore'] });
  } catch (e) {
    if (!fs.existsSync(path.join(src, 'catalog.json'))) throw new Error('src/catalog.json is missing and php could not write it: ' + e.message);
    console.warn('php not available: src/catalog.json kept as it is');
  }
}
const catalog = require(path.join(src, 'catalog.json'));

const copy = (from, to) => {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
};
copy(path.join(root, 'assets/sav/sav.css'), path.join(src, 'launcher/sav/sav.css'));
copy(path.join(root, 'assets/sav/sav.js'), path.join(src, 'launcher/sav/sav.js'));
copy(path.join(root, 'assets/sav/LICENSE.txt'), path.join(src, 'launcher/sav/LICENSE.txt'));
copy(path.join(root, 'savoffice/icons/favicon.svg'), path.join(src, 'launcher/icons/savoffice.svg'));
for (const a of catalog) {
  copy(path.join(root, a.slug, 'icons/icon-192.png'), path.join(src, 'launcher/icons', a.slug + '.png'));
  copy(path.join(root, a.slug, 'icons/favicon.svg'), path.join(src, 'launcher/icons', a.slug + '.svg'));
}
// the files each app opens (the file_handlers of its manifest): Windows and Linux register them for SavOffice when it is
// installed (electron-builder.config.js), which then hands each file to its app; on macOS each app declares its own
const filetypes = {};
for (const a of catalog) {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(root, a.slug, 'manifest.webmanifest'), 'utf8'));
    const list = new Map();
    for (const h of m.file_handlers || []) for (const [mime, exts] of Object.entries(h.accept || {})) for (const e of exts) {
      const ext = String(e).replace(/^\./, '').toLowerCase();
      if (/^[a-z0-9]{1,10}$/.test(ext) && !list.has(ext)) list.set(ext, mime);
    }
    if (list.size) filetypes[a.slug] = [...list].map(([ext, mime]) => ({ ext, mime }));
  } catch { /* no manifest */ }
}
fs.writeFileSync(path.join(src, 'filetypes.json'), JSON.stringify(filetypes, null, 1) + '\n');
console.log(`prepared: SavComponents, ${catalog.length} icons, the files of ${Object.keys(filetypes).length} apps`);
