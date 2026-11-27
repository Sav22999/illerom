/*
 * SavOffice for Mac — the settings of the Toolbox, in HOME/settings.json (env.js).
 *   autoUpdate  the closed apps update by themselves; the open ones wait until they are closed
 *   checkHours  how often to look for new versions
 *   separate    every app is an app of its own (Dock, ⌘Tab), made by bundles.js in ~/Applications/SavOffice/
 *   shortcuts   (with separate off, or while developing) an icon that opens the app in a window of SavOffice
 *   lang        'auto' | 'it' | 'en' (the Toolbox; the apps follow the language of the system)
 *   style       'soft' | 'tilt' | 'glass': the style of SavComponents in the Toolbox and in the installed apps (app-preload.js)
 *   windows     where the windows of each app were, to open them there again
 *   account     the name and address of who is signed in (shown also without a connection)
 */
const fs = require('fs');
const path = require('path');

const DEFAULTS = { autoUpdate: true, checkHours: 6, shortcuts: true, separate: true, lang: 'auto', style: 'soft', windows: {}, account: {} };
const STYLES = ['soft', 'tilt', 'glass']; // the styles of SavComponents offered (sav-style-*)
const env = require('./env');
let data = null;
// the Toolbox writes HOME/settings.json; an app reads it (fresh: the Toolbox may change it) and writes only its own window,
// in its profile
const file = () => path.join(env.PROFILE, 'settings.json');
const shared = () => { try { return JSON.parse(fs.readFileSync(path.join(env.HOME, 'settings.json'), 'utf8')); } catch { return {}; } };

function all() {
  if (env.APP) {
    let own = {};
    try { own = JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { /* first time */ }
    return { ...DEFAULTS, ...shared(), windows: own.windows || {} };
  }
  if (!data) {
    try { data = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) }; } catch { data = { ...DEFAULTS }; }
  }
  return data;
}
const get = (k) => all()[k];
function set(patch) {
  if (env.APP) patch = { windows: patch.windows || {} }; // an app keeps only where its window was
  const d = env.APP ? { windows: all().windows } : all();
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULTS && typeof v === typeof DEFAULTS[k] && (k !== 'style' || STYLES.includes(v))) d[k] = v;
  try {
    fs.mkdirSync(path.dirname(file()), { recursive: true });
    fs.writeFileSync(file() + '.tmp', JSON.stringify(d, null, 2));
    fs.renameSync(file() + '.tmp', file());
  } catch { /* the next time */ }
  return d;
}

/** The style of SavComponents chosen (always one of STYLES). */
const style = () => (STYLES.includes(all().style) ? all().style : 'soft');

module.exports = { all, get, set, style, STYLES };
