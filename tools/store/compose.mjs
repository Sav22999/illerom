/**
 * The store graphics of the Sav apps, from the phone screenshots made by capture.mjs:
 *   node tools/store/compose.mjs <base url> <raw dir>
 * Writes <app>/store/en-US/images/ (the layout of fastlane): phoneScreenshots/1…n.png (1080 × 1920, the last one
 * says who made the app), featureGraphic.png (1024 × 500) and icon.png (512 × 512). Texts and colours: store.json.
 * The base url serves this repository (frame.html and the fonts of the site), e.g. php -S on a local copy.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const [, , BASE, RAW] = process.argv;
const HERE = dirname(new URL(import.meta.url).pathname), ROOT = join(HERE, '..', '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9700 + Math.floor(Math.random() * 200);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const data = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');
const LANGS = { en: 'en-US' }; // the pictures in English only (the texts of the listing are in it-IT too)

const profile = join(process.env.STORE_TMP || tmpdir(), 'sav-store-compose-' + PORT);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
let ws, seq = 0;
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; pending.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
for (let i = 0; i < 50 && !ws; i++) { try { ws = new WebSocket((await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl); } catch { await sleep(200); } }
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data), p = m.id && pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); } });
const { targetId } = await send('Target.createTarget', { url: 'about:blank', background: false });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
const s = (m, p) => send(m, p, sessionId);
await s('Page.enable');
await s('Page.navigate', { url: `${BASE}/tools/store/frame.html` });
await sleep(1500);

async function draw(cfg, w, h, file) {
  await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const r = await s('Runtime.evaluate', { expression: `render(${JSON.stringify(cfg)})`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const { data: png } = await s('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(png, 'base64'));
  console.log('made', file.replace(ROOT + '/', ''));
}

const conf = JSON.parse(readFileSync(join(HERE, 'store.json'), 'utf8'));
const photo = data(join(HERE, 'saverio.png'));
for (const [app, a] of Object.entries(conf)) {
  const icon = data(join(ROOT, app, 'icons', 'icon-512.png'));
  for (const [lang, L] of Object.entries(LANGS)) {
    const out = join(ROOT, app, 'store', L, 'images');
    let n = 0;
    for (const [i, sh] of a.shots.entries()) {
      const [title, sub] = sh[lang];
      await draw({ kind: 'shot', lang, colors: a.colors, image: data(join(RAW, app, lang, sh.raw + '.png')), icon: sh.icon, title, sub, seed: 3 + i, tilt: i % 2 ? 4 : -4 }, 1080, 1920, join(out, 'phoneScreenshots', `${++n}.png`));
    }
    await draw({ kind: 'credit', lang, colors: a.colors, big: a.credit[lang], hl: 2, photo, icon, name: a.name, url: a.url, by: lang === 'it' ? 'Sviluppata da' : 'Developed by', under: lang === 'it' ? 'Pubblicata da' : 'Published under' }, 1080, 1920, join(out, 'phoneScreenshots', `${++n}.png`));
    await draw({ kind: 'feature', lang, colors: a.colors, icon, name: a.name, tagline: a.tagline[lang], ghost: a.name.toUpperCase() + ' ' + a.name.toUpperCase() }, 1024, 500, join(out, 'featureGraphic.png'));
    copyFileSync(join(ROOT, app, 'icons', 'icon-512.png'), join(out, 'icon.png'));
  }
}
ws.close();
chrome.kill('SIGKILL');
await sleep(300);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* left */ }
process.exit(0);
