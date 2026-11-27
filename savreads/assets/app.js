/**
 * SavReads — the app: start and addresses.
 *   #/ to read · #/starred · #/archive · #/tag/<name> · #/search/<words> · #/highlights · #/a/<id> an article
 *   #/feeds[/f/<id> | /d/<folder> | /q/<words>] · #/i/<id> an article of a feed · #/settings[/<section>] · #/changelog
 *   #/welcome, #/signin, #/signup, #/verify/<token>, #/reset/<token>
 *   ?save=<address>&title= (the bookmarklet, any link) and ?share=1&url=&text=&title= (the share menu of the phone): saved,
 *   then opened. ?savdrive=<id>: a .savrea opened from SavDrive, imported.
 */
import { btn, empty, errText, h, primary, put, toast } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, setCounts } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';
import { importFile, readPending, refreshFeeds, savedFromAddress } from './actions.js';

const root = document.getElementById('app');
let leave = null, turn = 0, routes = 0, pendingFile = null;

/** The settings, the counts and the feeds of the account. */
async function start() {
  const r = await api('rd.init');
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  try { localStorage.setItem('savreads-prefs', JSON.stringify(S.prefs)); } catch { /* private mode */ }
  setCounts(r);
  applyTheme();
  // the feeds that are old, now and every 15 minutes while the app is open (tools/refresh.php does it from cron too)
  setTimeout(() => refreshFeeds().catch(() => {}), 1500);
  setInterval(() => { if (!document.hidden) refreshFeeds().catch(() => {}); }, 15 * 60000);
  if (S.counts.pending) setTimeout(readPending, 3000);
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
  window.Identity?.setup({ name: 'SavReads', lang: getLang, accent: '#3D40A0', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  // an address to save (bookmarklet, share menu) waits for the sign-in when there is none
  const p = new URLSearchParams(location.search);
  if ((p.has('save') || p.has('share')) && !S.user?.verified) sessionStorage.setItem('savreads-save', location.search);
  const next = sessionStorage.getItem('savreads-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savreads-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  // a .savrea opened from the files of the device (installed app) or from SavDrive: imported
  { const take = async (q) => { const f = q.files?.[0]; if (!f) return; pendingFile = await f.getFile(); if (S.user?.verified && S.prefs) openPending(); };
    window.launchQueue?.setConsumer(take);
    window.SavOffice?.fromDrive?.(take); }
  sessionStorage.removeItem('savreads-inapp');
  addEventListener('hashchange', route);
  await route();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); window.__savreadsInstall = e; });
  navigator.serviceWorker?.addEventListener('message', (e) => { if (e.data?.savoffice === 'offline') S.offline = true; });
}

async function openPending() {
  const f = pendingFile;
  pendingFile = null;
  if (!f) return;
  try { await importFile(/\.savrea$/i.test(f.name) || f.type.includes('savreads') ? 'savrea' : /\.opml$/i.test(f.name) ? 'opml' : 'savrea', f); if (location.hash.replace(/^#\/?/, '') === '') dispatchEvent(new HashChangeEvent('hashchange')); else go('#/'); } catch (e) { toast(errText(e), 'danger'); }
}

async function route() {
  const parts = location.hash.split('?')[0].split('/'), [, a = '', b = '', c = ''] = parts, n = ++turn;
  if (++routes > 1) sessionStorage.setItem('savreads-inapp', '1');
  const was = leave;
  leave = null;
  try { was?.(); } catch { /* a page that left badly */ }
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.title = 'SavReads';
  scrollTo(0, 0);
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavReads'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.prefs) await start();
    if (n !== turn) return;
    // what waited for the sign-in, or came with the address
    const waiting = sessionStorage.getItem('savreads-save');
    if (waiting) { sessionStorage.removeItem('savreads-save'); history.replaceState(null, '', location.pathname + waiting + location.hash); }
    if (await savedFromAddress()) return;
    if (pendingFile) openPending();
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if ((a === 'a' || a === 'i') && b) { const { readerScreen } = await import('./reader.js'); const x = await readerScreen(root, a, b); if (n === turn) leave = x; else x?.(); return; }
    if (a === 'feeds') { const { feedsScreen } = await import('./feeds.js'); return await feedsScreen(root, b, c); }
    const { listScreen, highlightsScreen } = await import('./list.js');
    if (a === 'highlights') return await highlightsScreen(root);
    if (a === 'starred' || a === 'archive') return await listScreen(root, a);
    if (a === 'tag' && b) return await listScreen(root, 'tag', decodeURIComponent(b));
    if (a === 'search' && b) return await listScreen(root, 'search', decodeURIComponent(b));
    await listScreen(root, 'unread');
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    const off = e.code === 'network';
    put(root, h('div.wait', empty(off ? 'wifi-off' : e.code === 'not_found' ? 'newspaper' : 'cloud-off', off ? t('err_offline_page') : errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
