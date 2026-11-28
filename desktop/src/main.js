/*
 * SavOffice for Mac — the same code runs as the Toolbox (SavOffice.app, toolbox.js) or as one app of the suite
 * (SavDocuments.app… made by bundles.js, appmode.js): env.js tells which. See ../README.md.
 */
const { app } = require('electron');
const env = require('./env');

// the browser profile of this process: Chromium allows one process per profile, so every app has its own (env.js)
app.setPath('userData', env.PROFILE);
// the apps read the language from the browser (navigator.language): the one chosen in the Toolbox, or the first of the Mac
{
  const l = require('./settings').get('lang');
  const want = l === 'it' || l === 'en' ? l : (app.getPreferredSystemLanguages?.() || [])[0] || '';
  if (want) app.commandLine.appendSwitch('lang', want);
}
// automatic tests (tools/smoke.js, GitHub Actions): containers run as root and have little shared memory; every app of its
// own opens a port of its own for the test to drive it (9400 + its place in the catalog). Never outside a test.
if (env.ci) {
  for (const sw of ['no-sandbox', 'disable-dev-shm-usage', 'disable-gpu']) app.commandLine.appendSwitch(sw);
  if (env.APP) app.commandLine.appendSwitch('remote-debugging-port', String(9400 + require('./store').catalog.findIndex((a) => a.slug === env.APP)));
}
// the windows look like the browser they replace: some sites (Google sign-in) refuse "Electron"
app.userAgentFallback = app.userAgentFallback.replace(/\sElectron\/\S+/, '').replace(/\sSavOffice\/\S+/, '');

require(env.APP ? './appmode' : './toolbox');
