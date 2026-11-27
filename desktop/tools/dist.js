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
// Signed with a Developer ID when there is one in the keychain (then macOS trusts it on every Mac, once notarized), ad hoc
// otherwise (tools/adhoc-sign.js: trusted only where it was built, elsewhere "Open Anyway" the first time)
let devId = '';
try { devId = (execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' }).match(/"(Developer ID Application: [^"]+)"/) || [])[1] || ''; } catch { /* no keychain */ }
// notarization by Apple: an App Store Connect API key, or an Apple ID with an app-specific password (README)
const notarize = !!(process.env.APPLE_API_KEY && process.env.APPLE_API_KEY_ID && process.env.APPLE_API_ISSUER) || !!(process.env.APPLE_ID && process.env.APPLE_APP_SPECIFIC_PASSWORD && process.env.APPLE_TEAM_ID) || !!process.env.APPLE_KEYCHAIN_PROFILE;
const signing = devId
  ? ['--config.mac.hardenedRuntime=true', `--config.mac.notarize=${notarize}`]
  : ['--config.mac.identity=null', '--config.mac.hardenedRuntime=false', '--config.mac.notarize=false'];
console.log(devId ? `\n  Signing with ${devId}${notarize ? ', notarized by Apple' : ' (NOT notarized: set the APPLE_… variables, README)'}\n` : '\n  No Developer ID in the keychain: signed ad hoc (macOS will warn on other Macs, README)\n');
run(bin('electron-builder'), ['--mac', 'dmg', '--arm64', '--x64', `--config.directories.output=${out}`, ...signing]); // Apple silicon and Intel
fs.mkdirSync(path.join(here, 'dist'), { recursive: true });
for (const f of fs.readdirSync(out).filter((f) => f.endsWith('.dmg'))) {
  fs.copyFileSync(path.join(out, f), path.join(here, 'dist', f));
  console.log('\n  DMG: ' + path.join(here, 'dist', f));
}
