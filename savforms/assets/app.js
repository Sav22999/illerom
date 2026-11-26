/** SavForms — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, loadForms } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';
import { LOCAL_TZ } from './time.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/**
 * Addresses:  #/ (the forms of the account)  #/new (a new form: the models)  #/e/<form>[/<tab>] (the editor: questions,
 *             answers, settings)  #/r/<form> (its answers)  #/settings/<section>
 *             #/f/<form>[/e/<secret>] (answering: no account needed; the secret changes answers already sent)
 *             #/s/<form> (the charts shown to who answered, when the form shows them)
 *             #/welcome  #/signin  #/signup  #/verify/<token>  #/reset/<token>  #/changelog (what's new)
 */

/** The settings of the account and the addresses of the other apps. */
async function start() {
  const r = await api('forms.init', undefined, { tz: LOCAL_TZ });
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.calendarUrl = r.calendar || '../savcalendar/';
  S.schedulesUrl = r.schedules || '../savschedules/';
  S.appUrl = r.app || '';
  applyTheme();
  await loadForms();
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
      if (!me.user && !/^#\/[fs]\//.test(location.hash)) { const r = await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.user) me = await api('auth.me'); }
      if (me.user) setUser(me.user, me.csrf);
    }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavForms', lang: getLang, accent: '#86329E', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savforms-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savforms-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savfor opened from the files of the device (installed app): it becomes a new form
  window.launchQueue?.setConsumer(async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (S.ready) import('./files.js').then((m) => m.openPending()); else location.hash = '#/'; } });
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', ...rest] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.title = 'SavForms';
  document.body.classList.remove('filling');
  try {
    // answering a form, and its public charts: anybody with the link, signed in or not
    if (a === 'f') { const { fillScreen } = await import('./fill.js'); const x = await fillScreen(root, rest[0], rest[1] === 'e' ? rest[2] : ''); if (n === turn) leave = x; return; }
    if (a === 's') { const { publicSummary } = await import('./results.js'); return publicSummary(root, rest[0]); }
    if (a === 'verify') return verify(root, rest.join('/'));
    if (a === 'reset') return reset(root, rest.join('/'));
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavForms'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go(sessionStorage.getItem('savforms-next') || '#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.ready) { put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))); await start(); if (n !== turn) return; }
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, rest[0] || ''); }
    if (a === 'e' || a === 'r') {
      const { editorScreen } = await import('./editor.js');
      const x = await editorScreen(root, rest[0], a === 'r' ? 'answers' : rest[1] || 'questions');
      if (n === turn) leave = x; else x?.();
      return;
    }
    const { homeScreen } = await import('./home.js');
    const x = homeScreen(root, a === 'new');
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('circle-alert', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
