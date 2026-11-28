/*
 * SavOffice — a new version for the automatic updates: npm run release [-- --notes "…" --notes-en "…"]
 * (GitHub Actions does it by itself on every new version pushed to main: .github/workflows/savoffice-desktop.yml)
 *
 *   1. the key: the first time a pair of Ed25519 keys is made. The PRIVATE one stays in ~/.savoffice/release-key.pem
 *      (never in the repository: keep a copy somewhere safe — without it no installed SavOffice accepts an update any more);
 *      the public one goes into src/update-key.pem, inside the app, which checks every update with it (updater.js);
 *   2. the build (tools/dist.js): the DMGs and the ZIPs for Apple silicon and Intel;
 *   3. dist/latest-mac.json: version, notes, address, size and SHA-256 of each ZIP, signed with the private key.
 * Then a release on GitHub whose tag is the version (as 1.1.0), with the two DMGs, the two ZIPs and latest-mac.json:
 * the installed apps read releases/latest/download/latest-mac.json.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const here = path.join(__dirname, '..');
const pkg = require(path.join(here, 'package.json'));
const REPO = 'https://github.com/Sav22999/illerom';
const KEY_DIR = process.env.SAVOFFICE_RELEASE_KEY_DIR || path.join(os.homedir(), '.savoffice');
const PRIVATE = path.join(KEY_DIR, 'release-key.pem');
const PUBLIC = path.join(here, 'src', 'update-key.pem');
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] || '' : ''; };

/** The JSON that is signed: keys in order, so that the app rebuilds exactly the same text (updater.js). */
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',')}}` : JSON.stringify(v));

// 1. the keys. In GitHub Actions the private key comes from the secret SAVOFFICE_RELEASE_KEY (its PEM text) and is never made
// anew: a new key would make every installed SavOffice refuse the update
const CI = !!process.env.CI;
let privatePem = process.env.SAVOFFICE_RELEASE_KEY || '';
if (!privatePem && !fs.existsSync(PRIVATE)) {
  if (CI) throw new Error('the secret SAVOFFICE_RELEASE_KEY is missing: no release without the signing key');
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PRIVATE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUBLIC, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`\n  New signing key: ${PRIVATE}\n  KEEP A COPY OF IT SOMEWHERE SAFE: without it the installed apps refuse every update.\n`);
}
const privateKey = crypto.createPrivateKey(privatePem || fs.readFileSync(PRIVATE));
const publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
if (!fs.existsSync(PUBLIC) || fs.readFileSync(PUBLIC, 'utf8') !== publicPem) {
  if (CI) throw new Error('SAVOFFICE_RELEASE_KEY is not the key of src/update-key.pem: the installed apps would refuse the update');
  fs.writeFileSync(PUBLIC, publicPem); // the app carries the key that signs
}

// 2. the build (the Mac; Windows and Linux are built by GitHub Actions, which puts their files into dist/ too)
if (!process.argv.includes('--no-build')) execFileSync(process.execPath, [path.join(__dirname, 'dist.js')], { cwd: here, stdio: 'inherit' });

// 3. the signed list: one for every system (its name stays latest-mac.json, read by every SavOffice already installed);
// the key of each file is the one updater.js looks for
const FILES = { arm64: 'SavOffice-arm64.zip', x64: 'SavOffice-x64.zip', 'win-x64': 'SavOffice-Setup-x64.exe', 'deb-x64': 'SavOffice-x64.deb', 'rpm-x64': 'SavOffice-x64.rpm' };
const files = {};
for (const [k, name] of Object.entries(FILES)) {
  const f = path.join(here, 'dist', name);
  if (!fs.existsSync(f)) { if (k === 'arm64' || k === 'x64' || process.argv.includes('--all')) throw new Error(`${f} is missing`); continue; }
  const body = fs.readFileSync(f);
  files[k] = { url: `${REPO}/releases/download/${pkg.version}/${name}`, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
}
const manifest = { app: 'SavOffice', version: pkg.version, date: new Date().toISOString(), notes: { it: arg('--notes'), en: arg('--notes-en') || arg('--notes') }, files };
const signature = crypto.sign(null, Buffer.from(canonical(manifest)), privateKey).toString('base64');
fs.writeFileSync(path.join(here, 'dist', 'latest-mac.json'), JSON.stringify({ ...manifest, signature }, null, 2) + '\n');
const list = ['SavOffice-arm64.dmg', 'SavOffice-x64.dmg', ...Object.values(FILES).filter((n) => fs.existsSync(path.join(here, 'dist', n))), 'latest-mac.json'];
console.log(`\n  dist/latest-mac.json: SavOffice ${pkg.version}, signed (${Object.keys(files).join(', ')}).\n  Publish a release on GitHub with the tag ${pkg.version} and these files:\n    ${list.map((n) => 'dist/' + n).join('  ')}\n  (with gh: gh release create ${pkg.version} ${list.map((n) => 'dist/' + n).join(' ')} --title "SavOffice ${pkg.version}")\n`);
