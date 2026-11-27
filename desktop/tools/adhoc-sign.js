/*
 * SavOffice for Mac — signs the app "ad hoc" after electron-builder has put it together (afterSign in package.json).
 * Without an Apple Developer certificate electron-builder does not sign, and on Apple Silicon an app that is not signed at
 * all does not start. An ad-hoc signature is enough for a Mac where the app was built (or opened once with
 * "Open Anyway"). With a Developer ID in the keychain, electron-builder signs by itself and this does nothing.
 */
const { execFileSync, spawnSync } = require('child_process');
const path = require('path');

exports.default = async function (ctx) {
  if (ctx.electronPlatformName !== 'darwin') return;
  const appPath = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  // codesign -dv writes on stderr; "Authority=" only when a certificate signed it
  if (/Authority=/.test(spawnSync('codesign', ['-dv', appPath], { encoding: 'utf8' }).stderr || '')) return;
  // the files copied from the repository carry Finder attributes, which codesign refuses
  execFileSync('xattr', ['-cr', appPath]);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log('  • signed ad hoc', path.basename(appPath));
};
