/** SavSpreadsheets — the app: start and addresses (#/ home · #/d/<id> a workbook · #/settings · #/changelog…). No other module imports this one. */
import { btn, empty, errText, fail, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, offline } from './store.js';
import { applyTheme, commands, go, land, reset, setUser, unverified, verify } from './account.js';
import { openFile } from './actions.js';

const root = document.getElementById('app');
let writer = null, leave = null, turn = 0;
const landing = async (mode, note) => { const { heroPages } = await import('./home.js'); leave = land(root, mode, note, heroPages()); };

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); else offline.rememberUser(null); }
  } catch (e) {
    // no connection: whoever was signed in here goes on with the copies kept in this browser
    const u = e.code === 'network' ? offline.lastUser() : null;
    if (u) { S.config = { installed: true, offline: true }; S.offline = true; setUser(u); } else S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  addEventListener('online', back);
  addEventListener('offline', () => { S.offline = true; document.documentElement.classList.add('is-offline'); });
  document.documentElement.classList.toggle('is-offline', !!S.offline);
  window.Identity?.setup({ name: 'SavSpreadsheets', lang: getLang, accent: '#4D7C0F', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  // signed in with SavAccount (the page was left and came back): on to the document that was asked for
  const next = sessionStorage.getItem('savspreadsheets-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savspreadsheets-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savspr, .xlsx, .xls, .ods or .csv opened from the files of the device
  { const take = async (p) => { for (const f of p.files || []) await openFile(await f.getFile()); };
    window.launchQueue?.setConsumer(take);
    window.SavOffice?.fromDrive?.(take); // a file opened from SavDrive (?savdrive=<id>), given like a file of the device
  }
  // … or with the Android app: {name, data} in base64
  const pend = S.user?.verified && window.SavSpreadsheetsAndroid?.pendingFile?.();
  if (pend) { const f = JSON.parse(pend); openFile(new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name)).catch(() => {}); }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/'), n = ++turn;
  if (writer) { const w = writer; writer = null; w.close(); }
  leave?.();
  leave = null;
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'invite') return await invite(b);
    if (a === 'd' && b) {
      put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2.2rem' })));
      const { openSheet } = await import('./sheet.js');
      const w = await openSheet(root, b, { review: location.hash.endsWith('/review'), onReload: (x) => { writer = x; } });
      if (n !== turn) w.close(); else writer = w;
      return;
    }
    document.title = 'SavSpreadsheets';
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavSpreadsheets'); }
    if (a === 'signin' || a === 'signup') return S.user ? go('#/') : await landing(a);
    if (!S.user) return await landing(a === '' || a === 'welcome' ? '' : 'signin', a === '' || a === 'welcome' ? null : undefined); // SavSpreadsheets works only with an account
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'admin' && S.user?.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    if (S.user && !S.user.verified) return unverified(root);
    const { home } = await import('./home.js');
    const x = await home(root, a, b);
    if (n === turn) leave = x;
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    if (e.code === 'doc_signin') return void landing('signin', h('sav-alert', { variant: 'neutral', heading: t('doc_signin') }, t('doc_signin_text')));
    put(root, h('div.wait', empty('sheet', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}
/** The connection is back: a fresh session key, then the open document and the home catch up by themselves. */
async function back() {
  document.documentElement.classList.remove('is-offline');
  if (!S.offline) return;
  try {
    const me = await api('auth.me');
    S.offline = false;
    if (me.user) setUser(me.user, me.csrf); else { offline.rememberUser(null); S.user = null; }
    if (!writer || !S.user) route();
  } catch { /* still away */ }
}
async function invite(token) {
  if (!S.user?.verified) { await landing('signin', h('sav-alert', { variant: 'primary', heading: t('invite_open') }, t('invite_text'))); sessionStorage.setItem('savspreadsheets-next', location.hash); return; }
  try { go('#/d/' + (await api('invite.accept', { token })).doc); } catch (e) { fail(e); go('#/'); }
}

boot();
