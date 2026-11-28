#!/usr/bin/env node
/*
 * SavOffice — the automatic test of an installed SavOffice, on macOS, Windows and Linux (GitHub Actions:
 * .github/workflows/savoffice-desktop.yml). It starts SavOffice in a profile of its own (SAVOFFICE_USERDATA), drives it
 * through the DevTools protocol and takes a picture at every step:
 *   1 the Toolbox opens  2 SavDocuments installs  3 its entry exists (Start menu, .desktop, app)  4 it opens as an app of
 *   its own, served by the installed files  5 the Toolbox sees it open  6 it works offline  7 the style changes
 *   8 when it closes the Toolbox sees it
 *   node tools/smoke.js --exe <SavOffice executable> [--out <folder>]
 *   node tools/smoke.js --exe node_modules/.bin/electron --app .     (while developing)
 * Writes <out>/summary.md, <out>/results.json and the pictures; exit code 1 when a step fails.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const EXE = arg('--exe');
const OUT = path.resolve(arg('--out', 'smoke-out'));
if (!EXE || !fs.existsSync(EXE)) { console.error('--exe: SavOffice not found:', EXE); process.exit(2); }
fs.mkdirSync(OUT, { recursive: true });

const catalog = require(path.join(__dirname, '..', 'src', 'catalog.json'));
const APP = 'savdocuments';
const APP_PORT = 9400 + catalog.findIndex((a) => a.slug === APP);
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'so-smoke-'));
fs.writeFileSync(path.join(HOME, 'settings.json'), JSON.stringify({ lang: 'it' }));
const env = { ...process.env, SAVOFFICE_USERDATA: HOME, SAVOFFICE_CI: '1', SAVOFFICE_UPDATE_URL: 'http://127.0.0.1:9/none', ELECTRON_ENABLE_LOGGING: '1' };
const linux = process.platform === 'linux';
const APP_DIR = arg('--app'); // while developing: Electron with this folder
const toolbox = spawn(EXE, [...(APP_DIR ? [path.resolve(APP_DIR)] : []), '--remote-debugging-port=9333', ...(linux ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : [])], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const logFile = fs.createWriteStream(path.join(OUT, 'savoffice.log'));
toolbox.stdout.pipe(logFile); toolbox.stderr.pipe(logFile);
let exited = null; // SavOffice gone before the end: the test stops waiting for it
toolbox.on('exit', (code, signal) => { exited = `SavOffice exited (code ${code}, signal ${signal})`; console.log(exited); });
toolbox.on('error', (e) => { exited = `SavOffice did not start: ${e.message}`; console.log(exited); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function target(port, match, ms = 60000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (exited && port === 9333) throw new Error(exited);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const t = list.find((x) => x.type === 'page' && x.url.includes(match));
      if (t) return t;
    } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error(`no page "${match}" on port ${port} after ${ms / 1000}s`);
}
async function page(port, match, ms) {
  const t = await target(port, match, ms);
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const wait = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (wait.has(d.id)) { wait.get(d.id)(d); wait.delete(d.id); } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  return {
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'error in the page');
      return r.result?.result?.value;
    },
    async shot(name) { const r = await send('Page.captureScreenshot', { format: 'png' }); if (r.result?.data) fs.writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, 'base64')); },
    close() { try { ws.close(); } catch { /* gone */ } },
  };
}
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) { try { last = await fn(); if (last) return last; } catch (e) { last = e.message; } await sleep(1000); }
  throw new Error(`${what}: not within ${ms / 1000}s (${JSON.stringify(last)})`);
}

const steps = [];
async function step(name, fn) {
  const t0 = Date.now();
  try { const detail = await fn(); steps.push({ name, ok: true, detail, s: (Date.now() - t0) / 1000 }); console.log('✔', name, detail ? JSON.stringify(detail) : ''); return true; }
  catch (e) { steps.push({ name, ok: false, detail: e.message, s: (Date.now() - t0) / 1000 }); console.log('✘', name, e.message); return false; }
}

/** Where the entry of an app of its own lives (bundles-mac.js, bundles-other.js), in a test profile. */
function entryOf(slug) {
  const name = catalog.find((a) => a.slug === slug).name;
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Applications', 'SavOffice-test', `${name}.app`);
  if (process.platform === 'win32') return path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'SavOffice-test', `${name}.lnk`);
  return path.join(process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'applications', `savoffice-test-${slug}.desktop`);
}

(async () => {
  let tb = null, ap = null, separate = true, port = APP_PORT;
  const go = await step('1 · the Toolbox opens', async () => {
    tb = await page(9333, 'launcher/index.html', 90000);
    const s = await until(() => tb.eval('window.savoffice && window.savoffice.state()'), 30000, 'state');
    await sleep(1500);
    await tb.shot('1-toolbox.png');
    if (s.apps.length !== catalog.length) throw new Error(`${s.apps.length} apps instead of ${catalog.length}`);
    // an installed SavOffice can update itself (updater.js found its key): never again a version that cannot
    if (!APP_DIR && !s.selfUpdate?.enabled) throw new Error('the self-updater is off: ' + JSON.stringify(s.selfUpdate));
    separate = s.separateSupported; // while developing on macOS the apps open as windows of SavOffice
    if (!separate) port = 9333;
    return { version: s.version, platform: await tb.eval('window.savoffice.platform'), separate: s.separateSupported, selfUpdate: s.selfUpdate?.enabled };
  });
  if (go) {
    await step(`2 · ${APP} installs`, async () => {
      await tb.eval(`window.savoffice.install('${APP}')`);
      const a = await until(() => tb.eval(`window.savoffice.state().then((s) => s.apps.find((a) => a.slug === '${APP}'))`).then((a) => a.installed && a), 180000, 'installed');
      await tb.eval("document.querySelector('sav-menu-item[value=installed]')?.click()");
      await sleep(1000);
      await tb.shot('2-installed.png');
      return { version: a.installed.version, size: a.size };
    });
    await step('3 · its entry exists', async () => {
      if (!separate) return 'skipped: apps as windows of SavOffice';
      const p = entryOf(APP);
      await until(() => fs.existsSync(p), 60000, p);
      const detail = { entry: p };
      if (p.endsWith('.desktop')) {
        const d = fs.readFileSync(p, 'utf8');
        detail.mime = (d.match(/^MimeType=(.*)$/m) || [])[1] || '';
        detail.wmclass = (d.match(/^StartupWMClass=(.*)$/m) || [])[1] || '';
        if (!/--savoffice-app=savdocuments/.test(d)) throw new Error('the .desktop does not start the app');
      }
      return detail;
    });
    const opened = await step('4 · it opens as an app of its own, from the installed files', async () => {
      await tb.eval(`window.savoffice.open('${APP}')`);
      ap = await page(port, `/${APP}/`, 90000);
      const info = await until(() => ap.eval(`(async () => { if (document.readyState !== 'complete') return null; const r = await fetch('assets/app.js'); return { title: document.title, installed: r.headers.get('x-savoffice-installed'), desktop: !!window.SavOfficeDesktop, launchQueue: typeof window.launchQueue?.setConsumer } })()`), 60000, 'page');
      await sleep(2500);
      await ap.shot('4-app.png');
      if (info.installed !== '1') throw new Error('not served by the installed files');
      // the footer of the site is hidden in the installed apps (common.js)
      info.footer = await ap.eval("[...document.querySelectorAll('footer.credit, footer.ffoot')].map((f) => getComputedStyle(f).display).join(',') || 'absent'");
      if (/block|flex|grid/.test(info.footer)) throw new Error('the footer of the site is visible: ' + info.footer);
      return info;
    });
    if (opened) {
      await step('5 · the Toolbox sees it open', async () => until(() => tb.eval(`window.savoffice.state().then((s) => s.apps.find((a) => a.slug === '${APP}').open)`), 20000, 'open'));
      await step('6 · it works offline', async () => {
        fs.writeFileSync(path.join(HOME, 'offline-test'), '1');
        await ap.eval('location.reload(); 1').catch(() => {});
        ap.close();
        await sleep(3000);
        ap = await page(port, `/${APP}/`, 30000);
        const info = await until(() => ap.eval("document.readyState === 'complete' && document.body.innerText.trim().length > 50 && { title: document.title, text: document.body.innerText.trim().slice(0, 60) }"), 40000, 'page offline');
        await sleep(1500);
        await ap.shot('6-offline.png');
        fs.rmSync(path.join(HOME, 'offline-test'), { force: true });
        return info;
      });
      await step('7 · the style changes (Glass)', async () => {
        await tb.eval("window.savoffice.settings({ style: 'glass' })");
        const cls = await until(() => ap.eval("document.documentElement.className.includes('sav-style-glass') && document.documentElement.className"), 15000, 'style');
        await sleep(800);
        await ap.shot('7-glass.png');
        await tb.shot('7-toolbox-glass.png');
        return { classes: cls };
      });
      await step('8 · it closes and the Toolbox sees it', async () => {
        await ap.eval('setTimeout(() => window.close(), 100); 1').catch(() => {});
        ap.close();
        await until(() => tb.eval(`window.savoffice.state().then((s) => !s.apps.find((a) => a.slug === '${APP}').open)`), 30000, 'closed');
        return true;
      });
    }
  }
  tb?.close();
  toolbox.kill();
  await sleep(1500);
  const ok = steps.length > 0 && steps.every((s) => s.ok);
  const md = [`## SavOffice · ${process.platform} ${os.release()} · ${ok ? '✅ all good' : '❌ something failed'}`, '', '| Step | | Detail | s |', '|---|---|---|---|',
    ...steps.map((s) => `| ${s.name} | ${s.ok ? '✅' : '❌'} | ${String(typeof s.detail === 'string' ? s.detail : JSON.stringify(s.detail) || '').replace(/\|/g, '\\|').slice(0, 300)} | ${s.s.toFixed(1)} |`), ''].join('\n');
  fs.writeFileSync(path.join(OUT, 'summary.md'), md);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ platform: process.platform, ok, steps }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n');
  console.log('\n' + md);
  process.exit(ok ? 0 : 1);
})();
