/** SavSplits — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';
import { setCurrencies } from './money.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/**
 * Addresses:  #/[get|owe|mine|archived] (the groups)  #/g/<group>[/<tab>] (a group of the account)  #/j/<link>[/<tab>] (a group opened from its
 *             link, also without an account)  #/settings/<section>  #/welcome  #/signin  #/signup  #/verify/<token>
 *             #/reset/<token>  #/changelog (what's new)
 * tabs: expenses, stats, people, activity
 */
async function start() {
  const r = await api('splits.init');
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  setCurrencies(r.currencies);
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
  window.Identity?.setup({ name: 'SavSplits', lang: getLang, accent: '#1A7F37', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savsplits-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savsplits-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // the expenses written offline have left (assets/store.js): the group again from the server, with its balances
  addEventListener('savoffice-synced', () => { if (S.user || S.G) route(); });
  // a .savspl opened from the files of the device (installed app) or from SavDrive: it becomes a new group
  const take = async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified) { if (S.ready) import('./files.js').then((m) => m.openPending()); else location.hash = '#/'; } };
  window.launchQueue?.setConsumer(take);
  window.SavOffice?.fromDrive?.(take);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b0 = '', ...rest] = location.hash.split('/'), n = ++turn;
  const b = decodeURIComponent(b0), c = decodeURIComponent(rest.join('/'));
  leave?.();
  leave = null;
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog, sav-drawer').forEach((d) => d.hide?.());
  document.title = 'SavSplits';
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavSplits'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    // a link of a group opens for everybody, with or without an account
    if (a === 'j' && b) {
      if (S.user?.verified && !S.prefsLoaded) { await start(); S.prefsLoaded = true; if (n !== turn) return; }
      const { groupScreen } = await import('./group.js');
      const x = await groupScreen(root, { code: b }, c);
      if (n === turn) leave = x; else x?.();
      return;
    }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.prefsLoaded) { put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))); await start(); S.prefsLoaded = true; if (n !== turn) return; }
    if (a === 'settings') { scrollTo(0, 0); const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'g' && b) {
      const { groupScreen } = await import('./group.js');
      const x = await groupScreen(root, { id: b }, c);
      if (n === turn) leave = x; else x?.();
      return;
    }
    const { homeScreen } = await import('./home.js');
    const x = await homeScreen(root, a);
    if (n === turn) leave = x; else x?.();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('circle-alert', errText(e), '', h('div.prow', primary(t('home'), { href: S.user ? '#/' : '#/welcome' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
