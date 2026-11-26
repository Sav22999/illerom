/** SavTasks — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, loadAll } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';
import { LOCAL_TZ } from './time.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/**
 * Addresses:  #/today  #/upcoming  #/inbox  #/starred  #/done  #/schedules (what SavSchedules asks)  #/l/<list>
 *             #/t/<task> (opens the task in its list)  #/tag/<label>  #/settings/<section>
 *             #/welcome  #/signin  #/signup  #/verify/<token>  #/reset/<token>  #/changelog (what's new)
 */
const VIEWS = ['today', 'upcoming', 'inbox', 'starred', 'done', 'schedules', 'l', 't', 'tag', 'search'];

/** The settings of the account and the addresses of the other apps (the inbox is made the first time). */
async function start() {
  const r = await api('tasks.init', undefined, { tz: LOCAL_TZ });
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.schedulesUrl = r.schedules || '../savschedules/';
  S.calendarUrl = r.calendar || '../savcalendar/';
  if (!S.prefs.tz) S.prefs.tz = LOCAL_TZ;
  applyTheme();
  await loadAll();
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
  window.Identity?.setup({ name: 'SavTasks', lang: getLang, accent: '#0B7A87', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savtasks-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savtasks-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savtas opened from the files of the device (installed app): it becomes a new list
  window.launchQueue?.setConsumer(async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (S.ready) import('./files.js').then((m) => m.openPending()); else location.hash = '#/'; } });
  // … or with the Android app: {name, data} in base64, once
  const pend = S.user?.verified && window.SavTasksAndroid?.pendingFile?.();
  if (pend) { try { const f = JSON.parse(pend); S.pendingFile = new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name); } catch { /* not a file */ } }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', ...rest] = location.hash.split('/'), n = ++turn;
  const b = decodeURIComponent(rest.join('/'));
  leave?.();
  leave = null;
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.title = 'SavTasks';
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavTasks'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.ready) { put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))); await start(); if (n !== turn) return; }
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    const { tasksScreen } = await import('./tasks.js');
    const view = VIEWS.includes(a) ? a : S.prefs.home || 'today';
    const x = await tasksScreen(root, view, b);
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('circle-alert', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
