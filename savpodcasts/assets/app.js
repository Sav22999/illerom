/**
 * SavPodcasts — the app: start and addresses.
 *   #/ home · #/discover[/<words>] · #/library[/<tab>] · #/queue · #/p/<id> a podcast · #/e/<id> an episode
 *   #/settings[/<section>] · #/changelog · #/welcome, #/signin, #/signup, #/verify/<token>, #/reset/<token>
 * The player (assets/player.js) lives in #dock, outside #app: it keeps playing while the pages change.
 */
import { btn, empty, errText, h, primary, put } from './ui.js';
import { registerIcons } from './icons.js';
import { getLang, setLang, t } from './i18n.js';
import { S, api, keep } from './store.js';
import { commands, applyTheme, go, land, reset, setUser, unverified, verify } from './account.js';
import { initPlayer } from './player.js';

const root = document.getElementById('app');
let leave = null, turn = 0;

/** The settings, the podcasts followed and the queue of the account. */
async function start() {
  const r = await api('pod.init');
  S.prefs = r.prefs && !Array.isArray(r.prefs) ? r.prefs : {};
  S.subs = r.subs;
  S.queue = keep(r.queue);
  S.catalog = r.catalog || 'fyyd';
  S.pending = r.pending || 0;
  applyTheme();
  initPlayer().catch(() => {});
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
  window.Identity?.setup({ name: 'SavPodcasts', lang: getLang, accent: '#3B4B63', accept: 'acceptTerms', acceptUrl: () => 'terms.html', body: () => ({ lang: getLang() }) });
  const next = sessionStorage.getItem('savpodcasts-next');
  if (S.user?.verified && next) { sessionStorage.removeItem('savpodcasts-next'); if (/^(#\/?(signin|signup|welcome)?)?$/.test(location.hash)) history.replaceState(null, '', next); }
  addEventListener('hashchange', route);
  route();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

async function route() {
  const [, a = '', b = ''] = location.hash.split('/'), n = ++turn;
  leave?.();
  leave = null;
  commands(); // the search of actions (⌘J / Ctrl+J): the screen adds its own
  document.querySelectorAll('sav-dialog').forEach((d) => d.hide?.());
  document.querySelector('sav-drawer.plsheet')?.hide?.();
  document.title = 'SavPodcasts';
  scrollTo(0, 0);
  try {
    if (a === 'verify') return verify(root, b);
    if (a === 'reset') return reset(root, b);
    if (a === 'changelog') { const { changelogScreen } = await import('./changelog.js'); return changelogScreen(root, 'SavPodcasts'); }
    if (a === 'signin' || a === 'signup') { if (S.user) return go('#/'); leave = land(root, a); return; }
    if (!S.user) { leave = land(root, a === 'welcome' || a === '' ? '' : 'signin'); return; }
    if (!S.user.verified) return unverified(root);
    if (!S.prefs) await start();
    if (n !== turn) return;
    if (a === 'settings') { const { settingsScreen } = await import('./options.js'); return settingsScreen(root, b); }
    if (a === 'discover') { const { discoverScreen } = await import('./discover.js'); return discoverScreen(root, b); }
    if ((a === 'author' || a === 'category') && b) { const { browseScreen } = await import('./discover.js'); return browseScreen(root, a, b); }
    if (a === 'library') { const { libraryScreen } = await import('./library.js'); return libraryScreen(root, b); }
    if (a === 'queue') { const { queueScreen } = await import('./queue.js'); return queueScreen(root); }
    if (a === 'p' && b) { const { podcastScreen } = await import('./podcast.js'); return await podcastScreen(root, b); }
    if (a === 'e' && b) { const { episodeScreen } = await import('./episode.js'); return await episodeScreen(root, b); }
    const { homeScreen } = await import('./home.js');
    await homeScreen(root);
  } catch (e) {
    if (n !== turn) return;
    if (!e.code) console.error(e);
    put(root, h('div.wait', empty(e.code === 'not_found' ? 'podcast' : 'cloud-off', errText(e), '', h('div.prow', primary(t('home'), { href: '#/' }), btn(t('retry'), { onclick: () => route() })))));
  }
}

boot();
