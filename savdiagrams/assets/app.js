/** SavDiagrams — the app: start and addresses (#/ home · #/trash · #/d/<id> a diagram · #/from-board/<id> a board of SavWhiteboard turned into a diagram · #/settings · #/changelog). */
import { btn, empty, errText, fail, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/** The settings and the list of diagrams of the account. */
async function start() {
  const r = await api('dg.init');
  S.dg = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.diagrams = r.diagrams;
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
  window.Identity?.setup({ name: 'SavDiagrams', lang: getLang, accent: '#4352D6', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savdiagrams-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savdiagrams-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savdia (or .drawio) opened from the files of the device (installed app): it becomes a new diagram
  { const take = async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (!S.diagrams.length && !S.dg) await start(); openPending(); } };
    window.launchQueue?.setConsumer(take);
    window.SavOffice?.fromDrive?.(take); // a file opened from SavDrive (?savdrive=<id>), given like a file of the device
  }
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
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.body.classList.toggle('onboard', a === 'd');
  document.title = 'SavDiagrams';
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavDiagrams'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.dg) await start();
    if (S.pendingFile) return openPending();
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'from-board' && b) { const { convertBoard } = await import('./home.js'); return await convertBoard(b); }
    if (a === 'd' && b) { const { editorScreen } = await import('./editor.js'); const x = await editorScreen(root, b); if (n === turn) leave = x; else x?.(); return; }
    const { homeScreen } = await import('./home.js');
    homeScreen(root, a === 'trash' ? 'trash' : '');
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    document.body.classList.remove('onboard');
    put(root, h('div.wait', empty('workflow', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
