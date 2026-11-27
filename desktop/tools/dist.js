/*
 * SavOffice for Mac — makes the DMG: npm run dist.
 * The app is put together outside the repository (in the temporary folder of the system): the repository may sit in a
 * folder kept by iCloud (Documents), which keeps adding Finder attributes to the files, and codesign refuses them.
 * Only the finished DMG comes back, into dist/.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const here = path.join(__dirname, '..');
const bin = (n) => path.join(here, 'node_modules', '.bin', n);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: here, stdio: 'inherit' });
const out = path.join(os.tmpdir(), 'savoffice-dist');

run(process.execPath, [path.join(__dirname, 'prepare.js'), '--catalog']);
run(bin('electron'), [path.join(__dirname, 'brand.js')]);
fs.rmSync(out, { recursive: true, force: true });
run(bin('electron-builder'), ['--mac', 'dmg', '--arm64', '--x64', `--config.directories.output=${out}`]); // Apple silicon and Intel
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.dmg'))) {
  fs.copyFileSync(path.join(out, f), path.join(here, 'dist', f));
  console.log('\n  DMG: ' + path.join(here, 'dist', f));
}
