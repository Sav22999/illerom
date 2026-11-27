/* SavOffice for Mac — what the window of the Toolbox can ask main.js (window.savoffice). */
const { contextBridge, ipcRenderer } = require('electron');

const call = (name) => (...args) => ipcRenderer.invoke(name, ...args);
contextBridge.exposeInMainWorld('savoffice', {
  state: call('state'),
  install: call('install'),
  open: call('open'),
  browser: call('browser'),
  update: call('update'),
  updateAll: call('update-all'),
  remove: call('remove'),
  reinstall: call('reinstall'),
  check: call('check'),
  selfDownload: call('self-download'),
  selfInstall: call('self-install'),
  settings: call('settings'),
  reveal: call('reveal'),
  external: call('external'),
  signin: call('signin'),
  signinBrowser: call('signin-browser'),
  signinBrowserCancel: call('signin-browser-cancel'),
  signout: call('signout'),
  account: call('account'),
  /** fn(state) at every change */
  onState: (fn) => ipcRenderer.on('state', (e, s) => fn(s)),
  /** fn(view) when the menu asks for a view (Settings…) */
  onView: (fn) => ipcRenderer.on('view', (e, v) => fn(v)),
});
