/** SavWhiteboard — the app: start and addresses (#/ home · #/trash · #/b/<id> a board · #/settings · #/changelog). */
import { btn, empty, errText, fail, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/** The settings and the list of boards of the account. */
async function start() {
  const r = await api('wb.init');
  S.wb = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.boards = r.boards;
  S.trashDays = r.trashDays || 30;
  applyTheme();
}

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) {
      let me = await api('auth.me');
      // signed in to SavSchedules before the apps shared the session: SavSchedules hands its session over
      if (!me.user) { const r = await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.user) me = await api('auth.me'); }
      if (me.user) setUser(me.user, me.csrf);
    }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavWhiteboard', lang: getLang, accent: '#C45A0C', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savwhiteboard-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savwhiteboard-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savwhi opened from the files of the device (installed app): it becomes a new board
  window.launchQueue?.setConsumer(async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (!S.boards.length && !S.wb) await start(); openPending(); } });
  // … or with the Android app: {name, data} in base64, once (opened when the boards are ready)
  const pend = S.user?.verified && window.SavWhiteboardAndroid?.pendingFile?.();
  if (pend) { try { const f = JSON.parse(pend); S.pendingFile = new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name); } catch { /* not a file */ } }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function openPending() {
  const f = S.pendingFile;
  if (!f) return;
  S.pendingFile = null;
  const { openFile } = await import('./home.js');
  openFile(f).catch(fail);
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.body.classList.toggle('onboard', a === 'b');
  document.title = 'SavWhiteboard';
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavWhiteboard'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.wb) await start();
    if (S.pendingFile) return openPending();
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'b' && b) { const { boardScreen } = await import('./board.js'); const x = await boardScreen(root, b); if (n === turn) leave = x; else x?.(); return; }
    const { homeScreen } = await import('./home.js');
    homeScreen(root, a === 'trash' ? 'trash' : '');
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    document.body.classList.remove('onboard');
    put(root, h('div.wait', empty('whiteboard', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
