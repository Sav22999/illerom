/*
 * SavOffice for Mac — the updates of SavOffice itself (the apps update through store.js).
 *
 * The usual updater of Electron (Squirrel.Mac) accepts only apps signed with an Apple Developer ID; SavOffice is signed ad
 * hoc, so it updates itself here:
 *   1. it reads releases/latest/download/latest-mac.json (written by tools/release.js) at the start and every checkHours;
 *   2. the list must be signed with the private key of the publisher: checked with src/update-key.pem (Ed25519). A list
 *      changed by anybody else, or a file changed on the way, is refused;
 *   3. the ZIP of this Mac (Apple silicon or Intel) is downloaded into HOME/updates, its size and SHA-256 checked against the
 *      list, unpacked; the app inside must be SavOffice (eu.illerom.savoffice) of the version announced;
 *   4. installing replaces this SavOffice.app once it has quit (a small script waits for it), then opens it again; the apps of
 *      their own are quit first, and made again by the new SavOffice (bundles.js).
 * With automatic updates on, the new version is downloaded as soon as it is out and installed when SavOffice quits; any
 * time with "Update and restart".
 */
// original-fs, not fs: the fs of Electron takes every app.asar for a folder, so it could not delete or copy an app
// (an app of its own left half made) and it gives app.asar a made-up date
const fs = require('original-fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');
const { app, session } = require('electron');
const env = require('./env');

const MANIFEST = process.env.SAVOFFICE_UPDATE_URL || 'https://github.com/Sav22999/illerom/releases/latest/download/latest-mac.json';
const ID = 'eu.illerom.savoffice';
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const DIR = path.join(env.HOME, 'updates');
let PUBLIC = null;
try { PUBLIC = crypto.createPublicKey(fs.readFileSync(path.join(__dirname, 'update-key.pem'), 'utf8')); } catch { /* a build without the key: no updates */ }

const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 20 }, (err, out, errOut) => (err ? reject(new Error(String(errOut || err.message).trim())) : resolve(out))));
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',')}}` : JSON.stringify(v));
/** 1.10.0 > 1.9.2 */
const newer = (a, b) => { const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
/** The SavOffice.app this process runs from (null while developing). */
const bundle = () => (app.isPackaged ? path.resolve(process.execPath, '../../..') : null);

class Updater extends EventEmitter {
  constructor() {
    super();
    // status: idle | checking | current | available | downloading | ready | error
    this.state = { status: 'idle', version: null, notes: null, progress: 0, error: null };
    this.manifest = null;
    this.appPath = null; // the new SavOffice.app, unpacked and checked
    this.autoUpdate = () => true;
    this.beforeInstall = async () => {}; // set by toolbox.js: quit the apps of their own
  }

  /** Whether this SavOffice can update itself: packaged, with the key (and a test build pointed at a test list). */
  get enabled() { return !!PUBLIC && (app.isPackaged || env.testing) && !!bundle(); }

  set(patch) { Object.assign(this.state, patch); this.emit('change'); }

  async check() {
    if (!this.enabled || ['checking', 'downloading'].includes(this.state.status)) return this.state;
    if (this.state.status === 'ready') return this.state; // already downloaded: waits to be installed
    this.set({ status: 'checking', error: null });
    try {
      const r = await session.defaultSession.fetch(MANIFEST, { bypassCustomProtocolHandlers: true, cache: 'no-store' });
      if (r.status === 404) { this.set({ status: 'current' }); return this.state; } // nothing published yet
      if (!r.ok) throw new Error(`list: ${r.status}`);
      const m = await r.json();
      const { signature, ...signed } = m;
      if (!signature || !crypto.verify(null, Buffer.from(canonical(signed)), PUBLIC, Buffer.from(String(signature), 'base64'))) throw new Error('signature');
      if (signed.app !== 'SavOffice' || !/^\d+\.\d+\.\d+$/.test(String(signed.version)) || !signed.files?.[ARCH]) throw new Error('list');
      if (!newer(signed.version, app.getVersion())) { this.set({ status: 'current', version: null, notes: null }); return this.state; }
      this.manifest = signed;
      this.set({ status: 'available', version: signed.version, notes: signed.notes || null });
      if (this.autoUpdate()) this.download().catch(() => {});
    } catch (e) {
      this.set({ status: 'error', error: e.message });
    }
    return this.state;
  }

  async download() {
    const m = this.manifest;
    if (!m || this.state.status === 'downloading' || this.state.status === 'ready') return;
    const f = m.files[ARCH];
    this.set({ status: 'downloading', progress: 0, error: null });
    try {
      await fsp.rm(DIR, { recursive: true, force: true });
      await fsp.mkdir(DIR, { recursive: true });
      const zip = path.join(DIR, `SavOffice-${m.version}-${ARCH}.zip`);
      const r = await session.defaultSession.fetch(f.url, { bypassCustomProtocolHandlers: true, cache: 'no-store' });
      if (!r.ok || !r.body) throw new Error(`download: ${r.status}`);
      const hash = crypto.createHash('sha256');
      const out = fs.createWriteStream(zip);
      let got = 0, last = 0;
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        got += value.length;
        if (got > f.size) throw new Error('size');
        hash.update(value);
        if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
        if (got - last > f.size / 100) { last = got; this.set({ progress: got / f.size }); }
      }
      await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
      if (got !== f.size || hash.digest('hex') !== f.sha256) throw new Error('checksum');
      // unpacked as macOS does (ditto keeps the links and the signature), then checked
      const dest = path.join(DIR, 'app');
      await run('/usr/bin/ditto', ['-x', '-k', zip, dest]);
      const unpacked = path.join(dest, 'SavOffice.app');
      const plist = await fsp.readFile(path.join(unpacked, 'Contents', 'Info.plist'), 'utf8');
      const key = (k) => (plist.match(new RegExp('<key>' + k + '</key>\\s*<string>([^<]*)</string>')) || [])[1];
      if (key('CFBundleIdentifier') !== ID || key('CFBundleShortVersionString') !== m.version) throw new Error('package');
      await run('/usr/bin/codesign', ['--verify', '--deep', unpacked]);
      await run('/usr/bin/xattr', ['-cr', unpacked]).catch(() => {});
      await fsp.rm(zip, { force: true });
      this.appPath = unpacked;
      this.set({ status: 'ready', progress: 1 });
    } catch (e) {
      this.set({ status: 'error', error: e.message, progress: 0 });
    }
  }

  /** Replaces this SavOffice.app with the new one once this process has quit; relaunch: open it again. */
  async install(relaunch = true) {
    if (this.state.status !== 'ready' || !this.appPath || this.installing) return false;
    const target = bundle();
    try {
      fs.accessSync(path.dirname(target), fs.constants.W_OK);
      fs.accessSync(target, fs.constants.W_OK);
    } catch {
      this.set({ status: 'error', error: 'not_writable' }); // SavOffice.app belongs to another user: the DMG is needed
      return false;
    }
    this.installing = true;
    await this.beforeInstall();
    const script = path.join(DIR, 'install.sh');
    const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
    await fsp.writeFile(script, [
      '#!/bin/sh',
      '# SavOffice for Mac: replaces the app once it has quit (updater.js)',
      `while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done`,
      `OLD=${q(target)}.old-$$`,
      `mv ${q(target)} "$OLD" || exit 1`,
      `if mv ${q(this.appPath)} ${q(target)}; then rm -rf "$OLD"; else mv "$OLD" ${q(target)}; fi`,
      `/usr/bin/xattr -cr ${q(target)} 2>/dev/null`,
      `rm -rf ${q(path.join(DIR, 'app'))}`,
      relaunch ? `/usr/bin/open ${q(target)}` : '',
      '',
    ].join('\n'), { mode: 0o700 });
    spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
    app.exit(0);
    return true;
  }
}

module.exports = new Updater();
