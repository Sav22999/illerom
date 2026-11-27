/*
 * SavOffice for Mac — a new version for the automatic updates: npm run release [-- --notes "…" --notes-en "…"]
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

// 1. the keys
if (!fs.existsSync(PRIVATE)) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(KEY_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(PRIVATE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(PUBLIC, publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`\n  New signing key: ${PRIVATE}\n  KEEP A COPY OF IT SOMEWHERE SAFE: without it the installed apps refuse every update.\n`);
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(PRIVATE));
const publicPem = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
if (!fs.existsSync(PUBLIC) || fs.readFileSync(PUBLIC, 'utf8') !== publicPem) fs.writeFileSync(PUBLIC, publicPem); // the app carries the key that signs

// 2. the build
if (!process.argv.includes('--no-build')) execFileSync(process.execPath, [path.join(__dirname, 'dist.js')], { cwd: here, stdio: 'inherit' });

// 3. the signed list
const files = {};
for (const arch of ['arm64', 'x64']) {
  const f = path.join(here, 'dist', `SavOffice-${arch}.zip`);
  if (!fs.existsSync(f)) throw new Error(`${f} is missing`);
  const body = fs.readFileSync(f);
  files[arch] = { url: `${REPO}/releases/download/${pkg.version}/SavOffice-${arch}.zip`, size: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex') };
}
const manifest = { app: 'SavOffice', version: pkg.version, date: new Date().toISOString(), notes: { it: arg('--notes'), en: arg('--notes-en') || arg('--notes') }, files };
const signature = crypto.sign(null, Buffer.from(canonical(manifest)), privateKey).toString('base64');
fs.writeFileSync(path.join(here, 'dist', 'latest-mac.json'), JSON.stringify({ ...manifest, signature }, null, 2) + '\n');
console.log(`\n  dist/latest-mac.json: SavOffice ${pkg.version}, signed.\n  Publish a release on GitHub with the tag ${pkg.version} and these five files:\n    dist/SavOffice-arm64.dmg  dist/SavOffice-x64.dmg  dist/SavOffice-arm64.zip  dist/SavOffice-x64.zip  dist/latest-mac.json\n  (with gh: gh release create ${pkg.version} dist/SavOffice-*.dmg dist/SavOffice-*.zip dist/latest-mac.json --title "SavOffice per Mac ${pkg.version}")\n`);
