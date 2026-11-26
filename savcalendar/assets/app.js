/** SavCalendar — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { applyTheme, go, googleButton, land, reset, setUser, unverified, verify } from './account.js';
import { LOCAL_TZ } from './time.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/** The calendar of the account: its settings and calendars (the first time, a calendar of its own is made). */
async function start() {
  const r = await api('cal.init', undefined, { tz: LOCAL_TZ });
  S.cal = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.calendars = r.calendars;
  S.feed = r.feed;
  S.schedulesUrl = r.schedules || '../savschedules/';
  S.tasksUrl = r.tasks || '../savtasks/';
  S.formsUrl = r.forms || '../savforms/';
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
      // signed in to SavSchedules before the two apps shared the session: SavSchedules hands its session over
      if (!me.user) { const r = await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.user) me = await api('auth.me'); }
      if (me.user) setUser(me.user, me.csrf);
    }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavCalendar', lang: getLang, accent: '#C93A2F', accept: 'acceptTerms', acceptUrl: () => 'terms.html', google: (slot, cb) => googleButton(slot, cb), body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savcalendar-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savcalendar-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .savcal or .ics opened from the files of the device (installed app): the calendar offers to import it
  window.launchQueue?.setConsumer(async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (/^#\/(day|week|month|agenda)?/.test(location.hash) || !location.hash) dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = '#/'; } });
  // … or with the Android app: {name, data} in base64
  const pend = S.user?.verified && window.SavCalendarAndroid?.pendingFile?.();
  if (pend) { try { const f = JSON.parse(pend); S.pendingFile = new File([Uint8Array.from(atob(f.data), (x) => x.charCodeAt(0))], f.name); } catch { /* not a file */ } }
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = '', c = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.title = 'SavCalendar';
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavCalendar'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.calendars.length) await start();
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    const { calendarScreen } = await import('./calendar.js');
    const x = await calendarScreen(root, a, b);
    if (n === turn) leave = x; else x?.();
    void c;
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('calendar-x', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
