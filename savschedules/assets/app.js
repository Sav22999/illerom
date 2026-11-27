/** SavSchedules — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) { const me = await api('auth.me'); if (me.user) setUser(me.user, me.csrf); }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavSchedules', lang: getLang, accent: '#1F56D1', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  // signed in with SavAccount (the page was left and came back): on to what was asked for
  const next = sessionStorage.getItem('savschedules-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savschedules-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savsch opened from the files of the device
  { const take = async (p) => { const f = p.files?.[0]; if (f && S.user?.verified) { const { importFile } = await import('./home.js'); importFile(await f.getFile()); } };
    window.launchQueue?.setConsumer(take);
    window.SavOffice?.fromDrive?.(take); // a file opened from SavDrive (?savdrive=<id>), given like a file of the device
  }
  // … or with the Android app: {name, data} in base64
  const pend = S.user?.verified && window.SavSchedulesAndroid?.pendingFile?.();
  if (pend) { const f = JSON.parse(pend); import('./home.js').then(({ importFile }) => importFile(new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name))).catch(() => {}); }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = '', c = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.title = 'SavSchedules';
  scrollTo(0, 0);
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    // answering needs no account (unless the owner asks for one: the page says so)
    if (a === 's' && b) { const { answerPage } = await import('./answer.js'); leave = await answerPage(root, b, c); return; }
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavSchedules'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'admin' && S.user.master) { const { admin } = await import('./admin.js'); return await admin(root, b || 'overview'); }
    if (a === 'new' || a === 'e') { const { editor } = await import('./editor.js'); const x = await editor(root, a === 'new' ? null : b, a === 'new' ? b : null); if (n === turn) leave = x; return; }
    if (a === 'r' && b) { const { results } = await import('./results.js'); const x = await results(root, b); if (n === turn) leave = x; return; }
    const { home } = await import('./home.js');
    const x = await home(root, a);
    if (n === turn) leave = x;
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('calendar-x', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
