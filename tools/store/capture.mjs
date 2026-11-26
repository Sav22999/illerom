/**
 * Screenshots of the Sav apps on a phone, for the stores: Chrome headless through the DevTools protocol, no dependencies.
 *   node tools/store/capture.mjs <base url> <out dir> [shots.json]
 * Each shot: {app, lang, name, path, login: {email, password}, setup: "js run in the page before the capture", wait: ms}
 * The base url is a local copy with sample data (never the real site: the shots sign in).
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [, , BASE, OUT, LIST = new URL('shots.json', import.meta.url).pathname] = process.argv;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let PORT = 9333 + Math.floor(Math.random() * 300);
const W = 412, H = 915, DPR = 2.625; // a common Android phone (1082 × 2402 px)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, seq = 0, chrome, profile;
/** A fresh Chrome for every shot: nothing of a page can stop the next one. */
function launch() {
  PORT++;
  profile = join(process.env.STORE_TMP || tmpdir(), 'sav-store-chrome-' + PORT);
  chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--mute-audio', `--window-size=${W},${H}`, 'about:blank'], { stdio: 'ignore' });
}
async function quit() {
  try { ws.close(); } catch { /* closed */ }
  chrome.kill('SIGKILL');
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* left for the system */ }
}
const pending = new Map();
const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const id = ++seq; pending.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params, sessionId })); });

async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json(); ws = new WebSocket(v.webSocketDebuggerUrl); break; } catch { await sleep(200); }
  }
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data), p = m.id && pending.get(m.id);
    if (p) { pending.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.ok(m.result); }
    // a "leave the page?" or any other dialog would stop the page: accepted at once
    if (m.method === 'Page.javascriptDialogOpening') send('Page.handleJavaScriptDialog', { accept: true }, m.sessionId).catch(() => {});
  });
}

async function page() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank', background: false });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => send(m, p, sessionId);
  await s('Page.enable'); await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: true, screenWidth: W, screenHeight: H });
  await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await s('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' });
  const evalJs = async (expr) => {
    const r = await Promise.race([s('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }), sleep(20000).then(() => ({ timeout: true }))]);
    if (r.timeout) throw new Error('timeout');
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { s, evalJs, targetId };
}

const shots = JSON.parse(readFileSync(LIST, 'utf8'));
for (const sh of shots) {
  launch();
  await connect();
  const p = await page();
  const origin = `${BASE}/${sh.app}/`;
  await p.s('Page.navigate', { url: origin + '?store=1' });
  await sleep(900);
  // signed out first, then the account of the shot (each app has its own session), in its language
  await p.evalJs(`localStorage.clear(); for (const k of ['savdocuments-lang','savschedules-lang','sp-lang']) localStorage.setItem(k, ${JSON.stringify(sh.lang)}); await fetch('api/?r=auth.logout', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'}).catch(() => {}); return 1;`);
  if (sh.login) await p.evalJs(`await fetch('api/?r=auth.login', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(${JSON.stringify(sh.login)})}); return 1;`);
  else await p.s('Network.clearBrowserCookies').catch(() => {});
  await p.s('Page.navigate', { url: origin + (sh.path || '') });
  await sleep(sh.wait ?? 2500);
  if (sh.setup) { try { await p.evalJs(sh.setup); } catch (e) { console.error(sh.name, 'setup:', e.message); } await sleep(sh.after ?? 1200); }
  await send('Target.activateTarget', { targetId: p.targetId });
  await sleep(300);
  let data = null;
  for (let k = 0; k < 2 && !data; k++) data = (await Promise.race([p.s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }), sleep(15000).then(() => ({}))])).data;
  if (!data) { console.error('no picture:', sh.app, sh.lang, sh.name); await quit(); continue; }
  const dir = join(OUT, sh.app, sh.lang);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, sh.name + '.png'), Buffer.from(data, 'base64'));
  console.log('shot', sh.app, sh.lang, sh.name);
  await quit();
}
process.exit(0);
