/*
 * SavOffice for Mac — what the windows of the apps know of the Mac: window.SavOfficeDesktop, read by the SavOffice button
 * (../../assets/savoffice/savoffice.js). Its grid then lists only the apps installed here and opens each in its own
 * window; "All the apps" opens the Toolbox.
 *   installed  slugs of the apps installed on this Mac (when the page loaded)
 *   installedNow()  the same, now (an app may have been removed meanwhile)
 *   open(slug) opens (or brings forward) the window of an installed app
 *   toolbox()  shows the Toolbox
 * It also puts the style of SavComponents chosen in the Toolbox on the pages (sav-style-soft | tilt | glass).
 */
const { contextBridge, ipcRenderer } = require('electron');

// the style of SavComponents chosen in the Toolbox (Soft, Tilt, Glass): a class on <html>, kept there if the page changes
// its classes, changed at once when the Toolbox changes it. Only here, in SavOffice for Mac: the site stays as it is.
let style = ipcRenderer.sendSync('desk-style') || 'soft';
const applyStyle = () => {
  const html = document.documentElement;
  if (!html) return;
  const want = 'sav-style-' + style;
  if (html.classList.contains(want) && ![...html.classList].some((c) => c.startsWith('sav-style-') && c !== want)) return;
  for (const c of [...html.classList]) if (c.startsWith('sav-style-') && c !== want) html.classList.remove(c);
  html.classList.add(want);
};
const keep = () => {
  applyStyle();
  new MutationObserver(applyStyle).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
};
if (document.documentElement) keep(); else document.addEventListener('DOMContentLoaded', keep, { once: true });
document.addEventListener('DOMContentLoaded', applyStyle, { once: true });
ipcRenderer.on('desk-style', (e, s) => { style = s || 'soft'; applyStyle(); });

// files of the Mac opened with this app (appmode.js, "open-file"): given to the page as an installed web app gets them, through
// window.launchQueue (the apps already read it: launchQueue.setConsumer); kept until the page asks for them
const waiting = [];
let consumer = null;
const handOver = (f) => {
  const params = { files: [{ kind: 'file', name: f.name, getFile: async () => new File([f.bytes], f.name, { type: f.type || '', lastModified: f.mtime || Date.now() }) }] };
  if (consumer) consumer(params); else waiting.push(params);
};
ipcRenderer.on('desk-open-file', (e, f) => handOver(f));
// Chromium has a launchQueue of its own, which never gets these files: replaced in the page, before its scripts run
contextBridge.exposeInMainWorld('SavOfficeDesktopFiles', { setConsumer: (fn) => { consumer = fn; while (waiting.length) fn(waiting.shift()); } });
try {
  contextBridge.executeInMainWorld({
    func: () => {
      const queue = { setConsumer: (fn) => window.SavOfficeDesktopFiles.setConsumer(fn) };
      Object.defineProperty(window, 'launchQueue', { configurable: true, enumerable: true, get: () => queue });
    },
  });
} catch { /* an older Electron: the files then do not arrive this way */ }

contextBridge.exposeInMainWorld('SavOfficeDesktop', {
  installed: ipcRenderer.sendSync('desk-installed'), // when the page loaded (for an older SavOffice button)
  installedNow: () => ipcRenderer.sendSync('desk-installed'), // now: the button asks at every opening
  open: (slug) => ipcRenderer.invoke('desk-open', String(slug)),
  toolbox: () => ipcRenderer.invoke('desk-toolbox'),
});
