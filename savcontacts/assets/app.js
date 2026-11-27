/** SavContacts — the app: start and addresses. No other module imports this one. */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, loadAll } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/**
 * Addresses:  #/ the contacts · #/fav · #/birthdays · #/duplicates · #/trash · #/g/<group> — each with /c/<contact> for
 *             one open (#/c/<contact> in all of them) · #/settings/<section> · #/welcome · #/signin · #/signup
 *             · #/verify/<token> · #/reset/<token> · #/changelog (what's new)
 */
async function boot() {
  registerIcons();
  setLang(getLang());
  applyTheme();
  try {
    S.config = await api('auth.config');
    if (S.config.installed) {
      let me = await api('auth.me');
      // signed in to SavSchedules (or another app of SavOffice) before SavContacts existed: SavSchedules hands its session over
      if (!me.user) { const r = await fetch('../savschedules/api/?r=auth.me', { cache: 'no-store' }).then((x) => x.json()).catch(() => null); if (r?.user) me = await api('auth.me'); }
      if (me.user) setUser(me.user, me.csrf);
    }
  } catch (e) {
    S.config = { installed: false, down: true };
    if (e.code !== 'network') console.error(e);
  }
  window.Identity?.setup({ name: 'SavContacts', lang: getLang, accent: '#4338CA', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savcontacts-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savcontacts-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  // a .vcf, .csv or .savcon opened from the files of the device (installed app) or from SavDrive: its contacts are imported
  const take = async (p) => { const f = p.files?.[0]; if (!f) return; S.pendingFile = await f.getFile(); if (S.user?.verified && S.ready) import('./files.js').then((m) => m.openPending()); };
  window.launchQueue?.setConsumer(take);
  window.SavOffice?.fromDrive?.(take);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

const PLACES = ['fav', 'birthdays', 'duplicates', 'trash'];

async function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  const [a = ''] = parts, n = ++turn;
  // the address book stays on screen while only its contact changes: it says itself what to tear down (assets/contacts.js)
  const book = S.user?.verified && !['settings', 'verify', 'reset', 'changelog', 'signin', 'signup', 'welcome'].includes(a);
  const prev = leave;
  if (!book) { leave?.(); leave = null; }
  document.querySelectorAll('sav-dialog:not(.keep), sav-drawer').forEach((d) => d.hide?.()); // the dialog of a contact stays while moving to the next one
  try {
    if (a === 'verify') { commands(); return verify(root, parts[1]); }
    if (a === 'reset') { commands(); return reset(root, parts[1]); }
    if (a === 'changelog') { commands(); const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavContacts'); }
    if (a === 'signin' || a === 'signup') { commands(); if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { commands(); leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) { commands(); return unverified(root); }
    if (!S.ready) { put(root, h('div.wait', h('sav-spinner', { style: 'font-size:2rem' }))); await loadAll(); if (n !== turn) return; applyTheme(); if (S.pendingFile) import('./files.js').then((m) => m.openPending()); }
    if (a === 'settings') { commands(); scrollTo(0, 0); document.title = t('settings') + ' – SavContacts'; const { settingsScreen } = await import('./options.js'); return settingsScreen(root, parts[1] || ''); }
    // the place and the contact open in it
    let view = { kind: 'all' }, rest = parts;
    if (PLACES.includes(a)) { view = { kind: a }; rest = parts.slice(1); } else if (a === 'g' && parts[1]) { view = { kind: 'group', id: parts[1] }; rest = parts.slice(2); }
    const cid = rest[0] === 'c' ? rest[1] : null;
    if (view.kind === 'group' && !S.groups.some((g) => g.id === view.id)) return go('#/');
    const { contactsScreen } = await import('./contacts.js');
    if (n !== turn) return;
    leave = contactsScreen(root, view, cid);
    if (prev && prev !== leave) prev();
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty('circle-alert', errText(e), '', h('div.prow', primary(t('all_contacts'), { href: S.user ? '#/' : '#/welcome' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
