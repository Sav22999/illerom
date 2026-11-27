/*
 * SavOffice for Mac — draws the pictures of the app with Electron itself (no other program needed), into build/:
 *   build/icon.icns            the icon of SavOffice: the three bars of the mark on a tile shaped as macOS wants it
 *   build/apps/<slug>.icns     the icon of each app on the same tile (for the icons in ~/Applications/SavOffice)
 *   build/background.tiff      the window of the DMG: "drag SavOffice to Applications", for normal and Retina screens
 *   electron tools/brand.js    (npm run brand; npm run dist runs it first)
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { app, BrowserWindow } = require('electron');

const here = path.join(__dirname, '..');
const repo = path.join(here, '..');
const out = path.join(here, 'build');
const catalog = require(path.join(here, 'src', 'catalog.json'));
const svgOf = (file) => fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const dataUrl = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');

/** An HTML page drawn at w × h, as a PNG. */
async function render(html, w, h) {
  const win = new BrowserWindow({ width: w, height: h, show: false, transparent: true, frame: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(1);
  await win.loadURL('data:text/html;base64,' + Buffer.from(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:transparent}</style></head><body>${html}</body></html>`).toString('base64'));
  await new Promise((r) => setTimeout(r, 400));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: w, height: h });
  win.destroy();
  return img.resize({ width: w, height: h, quality: 'best' });
}

/**
 * The tile of macOS (1024 grid: 824 × 824 at 100, corner 185, a soft shadow), with a mark inside.
 * tint: the colour that lightly warms the tile; size: how big the mark is on the tile.
 */
const tile = (mark, tint, size) => `
  <div style="position:absolute;left:100px;top:100px;width:824px;height:824px;border-radius:185px;
    background:linear-gradient(160deg,#ffffff 0%,color-mix(in oklab,${tint} 7%,#f7f5fa) 100%);
    box-shadow:0 22px 34px -6px rgb(30 20 50 / .32),0 2px 6px rgb(30 20 50 / .16),inset 0 -6px 0 color-mix(in oklab,${tint} 10%,#e9e5ef),inset 0 0 0 1.5px rgb(255 255 255 / .9)"></div>
  <img src="${dataUrl(mark)}" style="position:absolute;left:${512 - size / 2}px;top:${512 - size / 2}px;width:${size}px;height:${size}px">`;

async function icns(html, file) {
  const big = await render(html, 1024, 1024);
  const set = file.replace(/\.icns$/, '.iconset');
  fs.rmSync(set, { recursive: true, force: true });
  fs.mkdirSync(set, { recursive: true });
  for (const s of [16, 32, 128, 256, 512]) {
    fs.writeFileSync(path.join(set, `icon_${s}x${s}.png`), big.resize({ width: s, height: s, quality: 'best' }).toPNG());
    fs.writeFileSync(path.join(set, `icon_${s}x${s}@2x.png`), big.resize({ width: s * 2, height: s * 2, quality: 'best' }).toPNG());
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', file]);
  fs.rmSync(set, { recursive: true, force: true });
  return big;
}

/** The window of the DMG (660 × 420; Finder puts the two icons at 170,215 and 490,215 — see package.json, "dmg"). */
const dmg = (k, mark) => `
  <div style="position:absolute;inset:0;zoom:${k};font-family:-apple-system,'SF Pro Text',system-ui,sans-serif;color:#1b1724;overflow:hidden;
    background:radial-gradient(120% 90% at 50% 0%,#ffffff 0%,#f6f3fa 55%,#ece6f5 100%)">
    <img src="${dataUrl(mark)}" style="position:absolute;right:-150px;bottom:-170px;width:340px;height:340px;opacity:.06;transform:rotate(-6deg)">
    <img src="${dataUrl(mark)}" style="position:absolute;left:-60px;top:-80px;width:200px;height:200px;opacity:.05;transform:rotate(8deg)">
    <div style="position:absolute;top:34px;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:10px">
      <img src="${dataUrl(mark)}" style="width:30px;height:30px"><span style="font-size:24px;font-weight:700;letter-spacing:-.02em">SavOffice</span>
    </div>
    <div style="position:absolute;top:76px;left:0;right:0;text-align:center;font-size:13.5px;line-height:1.5;color:#5d5670">
      Trascina SavOffice nella cartella Applicazioni<br><span style="color:#8a8399">Drag SavOffice to the Applications folder</span>
    </div>
    <svg width="660" height="420" viewBox="0 0 660 420" style="position:absolute;inset:0">
      <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#7845f4"/><stop offset=".5" stop-color="#13a079"/><stop offset="1" stop-color="#d6378a"/></linearGradient></defs>
      <path d="M262 214 C 300 180, 360 180, 398 214" fill="none" stroke="url(#g)" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 13"/>
      <path d="M386 196 L402 217 L377 222" fill="none" stroke="#d6378a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <div style="position:absolute;bottom:18px;left:0;right:0;text-align:center;font-size:11px;color:#9a93a8;letter-spacing:.02em">illerom.eu/savoffice</div>
  </div>`;

app.on('window-all-closed', () => {}); // a window at a time: the app stays until the end
app.whenReady().then(async () => {
  fs.mkdirSync(path.join(out, 'apps'), { recursive: true });
  const mark = svgOf(path.join(repo, 'savoffice/icons/favicon.svg'));
  const big = await icns(tile(mark, '#7845f4', 600), path.join(out, 'icon.icns'));
  fs.writeFileSync(path.join(out, 'icon.png'), big.toPNG());
  for (const a of catalog) await icns(tile(svgOf(path.join(repo, a.slug, 'icons/favicon.svg')), a.color, 600), path.join(out, 'apps', a.slug + '.icns'));
  const one = await render(dmg(1, mark), 660, 420);
  const two = await render(dmg(2, mark), 1320, 840);
  fs.writeFileSync(path.join(out, 'background.png'), one.toPNG());
  fs.writeFileSync(path.join(out, 'background@2x.png'), two.toPNG());
  execFileSync('tiffutil', ['-cathidpicheck', path.join(out, 'background.png'), path.join(out, 'background@2x.png'), '-out', path.join(out, 'background.tiff')]);
  console.log(`drawn: icon.icns, ${catalog.length} app icons, background.tiff`);
  app.quit();
});
